// RunnerStore 의 Supabase 구현.
//
// 러너(lib/review/runner.ts)는 이 파일을 모른다. 포트 인터페이스만 안다.
// 그래서 러너 테스트가 DB 없이 돈다.
//
// ⚠️ 이 파일에는 판단이 없다. 전부 러너가 내리고 여기는 읽고 쓰기만 한다.
//    조건문이 늘어나기 시작하면 그건 러너로 올라가야 할 로직이다.

import type { createClient } from '../supabase/server.ts'
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
    async recordFingerprint(fp: Fingerprint): Promise<'new' | 'duplicate' | 'revised'> {
      const nowIso = new Date().toISOString()

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

      if (!error) return 'new'
      if (error.code !== UNIQUE_VIOLATION) {
        throw new Error(`지문 기록 실패: ${error.message}`)
      }

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

      if (existing.content_hash === fp.contentHash) {
        await supabase
          .from('review_fingerprints')
          .update({ last_seen_at: nowIso })
          .eq('id', existing.id)
        return 'duplicate'
      }

      // 수정된 리뷰. 기록만 하고 재적재하지 않는다(설계 §4.5).
      const { error: updErr } = await supabase
        .from('review_fingerprints')
        .update({
          content_hash: fp.contentHash,
          revision_count: (existing.revision_count ?? 0) + 1,
          last_seen_at: nowIso,
        })
        .eq('id', existing.id)

      if (updErr) throw new Error(`수정 기록 실패: ${updErr.message}`)
      return 'revised'
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
