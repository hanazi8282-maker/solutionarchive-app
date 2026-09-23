// RunnerStore 의 Supabase 구현.
//
// 러너(lib/review/runner.ts)는 이 파일을 모른다. 포트 인터페이스만 안다.
// 그래서 러너 테스트가 DB 없이 돈다.
//
// ⚠️ 이 파일에는 판단이 없다. 전부 러너가 내리고 여기는 읽고 쓰기만 한다.
//    조건문이 늘어나기 시작하면 그건 러너로 올라가야 할 로직이다.
//
//    예외 하나: `recordFingerprint` 의 **중복 판정**은 DB 를 봐야만 되는 일이라
//    여기 있다(UNIQUE 충돌 · 옛 키 폴백 · 같은 본문 조회). 러너는 그 판정을
//    세고 로그로만 쓴다.

import type { createClient } from '../supabase/server.ts'
import { CROSS_TARGET_MIN_TEXT_LEN } from './fingerprint.ts'
import type { HealthVerdict } from './health.ts'
import type { RunnerStore, SourceConfig, TargetProgress } from './runner.ts'
import type { Fingerprint, TargetState } from './types.ts'

type Supa = NonNullable<Awaited<ReturnType<typeof createClient>>>

/** Postgres UNIQUE 위반. 지문 삽입에서 "이미 본 리뷰"를 뜻한다. */
const UNIQUE_VIOLATION = '23505'

export function createReviewStore(supabase: Supa): RunnerStore {
  // 타깃별 누적 수집량. Supabase JS 로는 `col = col + n` 을 못 쓰므로
  // 시작 시점 값을 들고 있다가 더해서 절대값으로 쓴다. 동시 실행은
  // 워크플로의 concurrency 그룹이 막는다.
  const totals = new Map<string, number>()

  return {
    async loadSource(key: string): Promise<SourceConfig | null> {
      const { data, error } = await supabase
        .from('review_sources')
        .select('key, enabled, min_interval_ms, daily_request_cap')
        .eq('key', key)
        .maybeSingle()

      if (error) throw new Error(`소스 조회 실패: ${error.message}`)
      if (!data) return null

      // 오늘 이미 쓴 요청 수. 잡이 하루에 여러 번 돌 수 있으므로
      // 상한은 실행 단위가 아니라 날짜 단위로 센다.
      const since = new Date()
      since.setUTCHours(0, 0, 0, 0)

      const { data: runs, error: runErr } = await supabase
        .from('review_collection_runs')
        .select('requests')
        .eq('source_key', key)
        .gte('started_at', since.toISOString())

      if (runErr) throw new Error(`오늘 요청 수 조회 실패: ${runErr.message}`)

      const requestsToday = (runs ?? []).reduce(
        (sum: number, r: { requests: number | null }) => sum + (r.requests ?? 0),
        0,
      )

      return {
        key: data.key,
        enabled: data.enabled,
        minIntervalMs: data.min_interval_ms,
        dailyRequestCap: data.daily_request_cap,
        requestsToday,
      }
    },

    async listDueTargets(sourceKey: string, limit: number): Promise<TargetState[]> {
      // 오래 안 돈 것부터. NULLS FIRST 라 한 번도 안 돈 타깃이 먼저다.
      const { data, error } = await supabase
        .from('review_targets')
        .select('id, project_id, source_key, product_ref, cursor, last_review_at, consecutive_empty, total_collected')
        .eq('source_key', sourceKey)
        .eq('status', 'active')
        .order('last_run_at', { ascending: true, nullsFirst: true })
        .limit(limit)

      if (error) throw new Error(`타깃 조회 실패: ${error.message}`)

      return (data ?? []).map((r) => {
        totals.set(r.id, r.total_collected ?? 0)
        return {
          id: r.id,
          projectId: r.project_id,
          sourceKey: r.source_key,
          productRef: r.product_ref,
          cursor: r.cursor,
          lastReviewAt: r.last_review_at,
          consecutiveEmpty: r.consecutive_empty ?? 0,
        }
      })
    },

    async saveTargetProgress(p: TargetProgress): Promise<void> {
      const next = (totals.get(p.targetId) ?? 0) + p.collectedDelta
      totals.set(p.targetId, next)

      const { error } = await supabase
        .from('review_targets')
        .update({
          cursor: p.cursor,
          last_review_at: p.lastReviewAt,
          consecutive_empty: p.consecutiveEmpty,
          status: p.status,
          total_collected: next,
          last_run_at: new Date().toISOString(),
        })
        .eq('id', p.targetId)

      if (error) throw new Error(`타깃 진행 저장 실패: ${error.message}`)
    },

    /**
     * ⚠️ 조회 후 삽입이 아니라 **삽입 먼저** 시도한다.
     *
     *    조회 → 없으면 삽입 순서로 하면 두 실행 사이에 같은 리뷰가 끼어들
     *    틈이 생긴다. 삽입을 먼저 하면 UNIQUE 제약이 그 틈을 막고, 충돌이
     *    돌아왔을 때만 기존 행을 읽어 수정 여부를 가린다.
     */
    async recordFingerprint(fp: Fingerprint): Promise<'new' | 'duplicate' | 'revised' | 'cross-target'> {
      const nowIso = new Date().toISOString()

      /** 이미 본 리뷰의 기존 행을 보고 내용 변경만 가린다. 충돌·폴백 두 경로가 공유한다. */
      const settle = async (row: {
        id: string
        content_hash: string
        revision_count: number | null
      }): Promise<'duplicate' | 'revised'> => {
        if (row.content_hash === fp.contentHash) {
          await supabase
            .from('review_fingerprints')
            .update({ last_seen_at: nowIso })
            .eq('id', row.id)
          return 'duplicate'
        }

        // 수정된 리뷰. 기록만 하고 재적재하지 않는다(설계 §4.5).
        const { error: updErr } = await supabase
          .from('review_fingerprints')
          .update({
            content_hash: fp.contentHash,
            revision_count: (row.revision_count ?? 0) + 1,
            last_seen_at: nowIso,
          })
          .eq('id', row.id)

        if (updErr) throw new Error(`수정 기록 실패: ${updErr.message}`)
        return 'revised'
      }

      // ── 옛 키 폴백 ────────────────────────────────────────────────
      //
      // 2026-09-24 이전에 저장된 행은 `sha256(sourceKey|productRef|externalId)` 다.
      // 새 키로 바로 삽입하면 **같은 리뷰가 새 키로 한 번 더 적재된다** — 고치려는
      // 버그를 이행 과정에서 재현하는 셈이다. 그래서 옛 키를 먼저 찾고, 맞으면 그
      // 행의 identity_key 를 새 키로 **승격**한다(행을 늘리지 않는다).
      //
      // 조회 → 삽입 순서가 되는 구간이라 경합 틈이 생기지만, 옛 키 행을 새로 만드는
      // 코드는 더 이상 없고 수집 잡은 워크플로 concurrency 그룹이 직렬화한다.
      //
      // ponytail: 백필이 끝나면 이 블록을 제거한다. 다만 옛 키는 externalId 를 DB 에
      // 남기지 않아 SQL 로 되계산할 수 없다(supabase/migrations/20260930000012 헤더) —
      // 지금은 이 폴백이 유일한 이행 경로이고, 돌면서 조금씩 승격된다.
      if (fp.legacyIdentityKey) {
        const { data: legacy, error: legacyErr } = await supabase
          .from('review_fingerprints')
          .select('id, content_hash, revision_count')
          .eq('source_key', fp.sourceKey)
          .eq('identity_key', fp.legacyIdentityKey)
          .maybeSingle()

        if (legacyErr) throw new Error(`옛 지문 조회 실패: ${legacyErr.message}`)

        if (legacy) {
          const { error: promoteErr } = await supabase
            .from('review_fingerprints')
            .update({ identity_key: fp.identityKey, last_seen_at: nowIso })
            .eq('id', legacy.id)

          // 승격이 UNIQUE 로 막히면 새 키 행이 이미 있다는 뜻이다. 어느 쪽이든
          // 이 리뷰는 이미 본 것이므로 적재하지 않는다 — 판정만 이어서 낸다.
          if (promoteErr && promoteErr.code !== UNIQUE_VIOLATION) {
            throw new Error(`옛 지문 승격 실패: ${promoteErr.message}`)
          }

          return await settle(legacy)
        }
      }

      const { error } = await supabase.from('review_fingerprints').insert({
        source_key: fp.sourceKey,
        identity_key: fp.identityKey,
        content_hash: fp.contentHash,
        key_kind: fp.kind,
        product_ref: fp.productRef,
        written_at: fp.writtenAt,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      })

      if (error && error.code !== UNIQUE_VIOLATION) {
        throw new Error(`지문 기록 실패: ${error.message}`)
      }

      // ── 2차 방어: 같은 소스에 같은 본문이 이미 적재돼 있나 ────────────
      //
      // 키가 처음이어도 중복일 수 있다. 같은 글이 다른 타깃 경로(`url:` ↔ `board:`)로
      // 들어왔는데 옛 키 행이 **그때의 productRef** 로 저장돼 있으면, 지금 타깃의
      // productRef 로 만든 옛 키와 안 맞아 폴백이 못 찾는다. 그 구멍을 본문으로 막는다.
      //
      // ⚠️ 방금 넣은 행은 `analysis_input_id` 가 아직 NULL 이라 여기 걸리지 않는다 —
      //    **적재까지 끝난 행만** 본다(그래서 자기 자신을 중복으로 보지 않는다).
      //
      // ⚠️ 짧은 본문에는 적용하지 않는다. 짧고 흔한 글은 서로 다른 사람의 글이 같은
      //    해시가 되고, 그걸 버리면 조용히 데이터를 잃는다(fingerprint.ts 맨 위 경고).
      //
      // 남는 행 1개(링크 없는 새 키)는 의도한 것이다. 다음 실행은 그 행의 UNIQUE 에
      // 걸려 `duplicate` 로 끝나므로 이 조회를 다시 하지 않는다.
      if (!error && fp.textLength >= CROSS_TARGET_MIN_TEXT_LEN) {
        const { data: twin, error: twinErr } = await supabase
          .from('review_fingerprints')
          .select('id')
          .eq('source_key', fp.sourceKey)
          .eq('content_hash', fp.contentHash)
          .not('analysis_input_id', 'is', null)
          .limit(1)

        if (twinErr) throw new Error(`본문 중복 조회 실패: ${twinErr.message}`)
        if ((twin ?? []).length > 0) return 'cross-target'
      }

      if (!error) return 'new'

      // 이미 본 리뷰다. 내용이 바뀌었는지만 본다.
      const { data: existing, error: readErr } = await supabase
        .from('review_fingerprints')
        .select('id, content_hash, revision_count')
        .eq('source_key', fp.sourceKey)
        .eq('identity_key', fp.identityKey)
        .maybeSingle()

      if (readErr) throw new Error(`지문 재조회 실패: ${readErr.message}`)
      if (!existing) {
        // 충돌은 났는데 행이 없다 = 그 사이 누가 지웠다. 다음 실행에 다시 온다.
        return 'duplicate'
      }

      return await settle(existing)
    },

    async appendInput(input): Promise<string> {
      const { data, error } = await supabase
        .from('analysis_inputs')
        .insert({
          project_id: input.projectId,
          source_type: 'review',
          raw_text: input.text,
          source_key: input.sourceKey,
          collected_at: input.collectedAt,
        })
        .select('id')
        .single()

      if (error) throw new Error(`원문 적재 실패: ${error.message}`)
      return data.id
    },

    async linkFingerprint(sourceKey, identityKey, analysisInputId): Promise<void> {
      const { error } = await supabase
        .from('review_fingerprints')
        .update({ analysis_input_id: analysisInputId })
        .eq('source_key', sourceKey)
        .eq('identity_key', identityKey)

      if (error) throw new Error(`지문 연결 실패: ${error.message}`)
    },

    async updateSourceHealth(key: string, v: HealthVerdict): Promise<void> {
      const patch: Record<string, unknown> = {
        health: v.health,
        health_detail: v.detail,
        health_checked_at: new Date().toISOString(),
      }

      // broken 이면 그 자리에서 끈다. disabled_reason 은 DB CHECK 가
      // 강제한다 — 이유 없는 비활성은 나중에 누가 근거 없이 다시 켠다.
      if (v.disable) {
        patch.enabled = false
        patch.disabled_reason = v.detail
        patch.disabled_at = new Date().toISOString()
      }

      const { error } = await supabase.from('review_sources').update(patch).eq('key', key)
      if (error) throw new Error(`건강도 저장 실패: ${error.message}`)
    },
  }
}
