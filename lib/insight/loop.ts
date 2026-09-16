// 나이틀리 인사이트 루프 — 저장 글 분석 → 패턴화 → 성과 판정 → 가이드 반영/회수.
//
// 실행 주체는 **GitHub Actions** 다(.github/workflows/nightly-insight-loop.yml).
// 이 파일은 순수 로직만 담고, 트리거·인증·로그 출력은 scripts/insight-loop.mjs
// 와 워크플로가 맡는다.
//
// ⏰ 스케줄: 0 19 * * * (UTC) = 매일 KST 04:00.
//
//    왜 04:00 인가. 요구는 "세션 사용량 0%일 때"였지만 그건 실시간으로 감지할
//    수 없다. 대신 그 요구가 진짜 막으려는 것을 막는다 — **밤 배치가 낮의
//    인터랙티브 사용 한도를 잡아먹는 것.** 사용자가 자는 시간대의 한가운데를
//    고르면 그 위험이 최소가 된다. 02~07시 창의 중앙이 04~05시다.
//
//    03시가 아니라 04시인 이유: 다른 크론(매시 정각 매처, 매시 30분 수집기)과
//    같은 분에 겹치지 않게 두되, 수집기가 방금 돈 직후(03:30 이후)라
//    post_performance 가 가장 최신인 시점을 고른다. 판정이 하루 묵은 지표로
//    내려지면 승격/기각이 하루씩 밀린다.
//
//    ⚠️ Actions 의 schedule 은 정시를 보장하지 않는다(수십 분 지연, 고부하 시
//       건너뜀). 04:00 을 고른 덕에 07:00 까지 3시간의 지연 여유가 있고,
//       하루 건너뛰어도 다음 밤이 같은 일을 한다 — 전 단계가 멱등이다.
//
// ⛔ 이 루프는 아무것도 발행하지 않는다(CLAUDE.md §10). Threads API 를
//    부르지 않는다. 쓰는 곳은 Supabase 와, GitHub 의 **2개 파일뿐**이다.
//
// ⚠️ 이 루프는 사람 승인 없이 main 에 커밋한다(§10 예외, 이 파이프라인 한정).
//    그래서 안전장치가 3겹이다:
//      1. lib/insight/github.ts 의 경로 허용목록 — 2개 파일 외에는 물리적으로 못 쓴다
//      2. guard_hypothesis_promotion 트리거 — 표본 5개 미만 승격을 DB 가 막는다
//      3. insight_loop_runs 로그 — 매 실행이 무엇을 바꿨는지 행으로 남는다

import type { createClient } from '../supabase/server'
import { extractInsight, activeProvider, normalizePatternKey } from './llm.ts'
import { buildEditPairs, repoDraftFinder, readStageManifests, EDIT_KEY_PREFIX, EDIT_PATTERN_PREFIX } from './edit-pairs.ts'
import { notionConfig, fetchPending, markSynced } from './notion.ts'
import {
  decide,
  shouldReflect,
  isRendered,
  appliedPatternIndex,
  perfRowsForPattern,
  summarizePerf,
  renderLearnedPatterns,
  renderRejectedPatterns,
  LEARNED_PATTERNS_PATH,
  REJECTED_PATTERNS_PATH,
  MIN_EVIDENCE_TO_REFLECT,
  type PatternRow,
  type PerfRow,
} from './patterns.ts'
import { resolveRepoRef, putFile, autoCommitMessage } from './github.ts'

/**
 * DB 쓰기·조회 결과를 확인하고, error 면 던진다 (진단 2-3).
 *
 * 왜 필요한가. `const { data } = await supabase…` 로 error 를 버리면 조회 실패가
 * `undefined` 가 되어 "그런 행이 없다"와 구분되지 않는다. 실제로 이 파일에서
 * `insight_patterns` 존재 확인이 실패하면 → "신규 패턴" 분기 → UNIQUE 위반 INSERT →
 * 그 INSERT 의 error 도 안 봄 → **그날 밤 근거 1건이 영구히 사라지는데 보고에는
 * "신규 패턴 1건"이 뜬다.** 해당 saved_examples 는 이미 analyzed 로 바뀌어 다음 밤에 안 온다.
 *
 * 던지면 step() 이 잡아 그 단계를 ok:false 로 적고, insight-loop.mjs 가 exit 1 을 낸다
 * (CLAUDE.md §7.1 — 확인 불가를 음성으로 접지 않는다).
 */
type DbResult = { error: { message: string } | null }
export async function must<T extends DbResult>(what: string, q: PromiseLike<T>): Promise<T> {
  const r = await q
  if (r.error) throw new Error(`${what} 실패: ${r.error.message}`)
  return r
}

/**
 * 1회 실행당 분석 건수 상한.
 *
 * 헤드리스 실행도 결국 Claude Pro 구독의 같은 사용량 풀을 쓴다.
 * 상한이 없으면 어느 날 밤 30건이 밀려들어와 낮 인터랙티브 한도를 깎는다.
 * 남은 건은 다음 밤으로 넘어간다 — 급할 게 없는 배치다.
 *
 * Vercel 서버리스(maxDuration 300초) 시절에는 이 값이 곧 시한폭탄이었다.
 * 건당 최대 120초 × 10건 = 1,200초라 3~4건째에서 함수가 죽는다. Actions 로
 * 옮기면서 그 천장이 사라졌다(job 6시간). 값은 그대로 두되 이유가 바뀌었다 —
 * 이제 이 상한은 런타임 제약이 아니라 **구독 사용량 예산**이다.
 */
const ANALYZE_LIMIT = Number(process.env.INSIGHT_ANALYZE_LIMIT ?? 10)

/**
 * 프롬프트에 실어 보낼 기존 pattern_key 개수 상한.
 *
 * 전부 보내면 패턴이 쌓일수록 프롬프트가 무한정 길어지고, 오래된 사장 패턴이
 * 새 글의 판단을 끌어당긴다. 근거가 많은 순으로 자른다 — 실제로 축적되고
 * 있는 패턴일수록 다시 맞을 확률이 높다.
 */
const KNOWN_KEY_LIMIT = 60

export interface StepLog {
  name: string
  ok: boolean
  ms: number
  detail: Record<string, unknown>
}

export interface LoopResult {
  ok: boolean
  dryRun: boolean
  trigger: string
  provider: string
  totalMs: number
  counts: { ingested: number; analyzed: number; patterns: number; promoted: number; rejected: number }
  commitSha: string | null
  decisions: Array<Record<string, unknown>>
  steps: StepLog[]
  warning?: string
}

type Supa = NonNullable<Awaited<ReturnType<typeof createClient>>>

export async function runInsightLoop(
  supabase: Supa,
  opts: { dryRun: boolean; trigger: string },
): Promise<LoopResult> {
  const { dryRun, trigger } = opts
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const steps: StepLog[] = []
  const counts = { ingested: 0, analyzed: 0, patterns: 0, promoted: 0, rejected: 0 }
  let commitSha: string | null = null
  let fatal: string | null = null

  const step = async (
    name: string,
    fn: () => Promise<Record<string, unknown>>,
  ): Promise<boolean> => {
    const s = Date.now()
    try {
      const detail = await fn()
      steps.push({ name, ok: true, ms: Date.now() - s, detail })
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      steps.push({ name, ok: false, ms: Date.now() - s, detail: { error: message } })
      return false
    }
  }

  // ── 1) 수집 — Notion 인박스에서 pending 행을 가져온다(선택) ────
  await step('ingest', async () => {
    const cfg = notionConfig()
    if (!cfg) {
      return {
        skipped: true,
        reason: 'NOTION_API_KEY / NOTION_INSIGHT_DB_ID 미설정 — /api/insight/capture 경로만 사용',
      }
    }

    const { rows, missingProps, availableProps } = await fetchPending(cfg, 25)
    let inserted = 0

    for (const row of rows) {
      if (dryRun) continue
      const { error } = await supabase.from('saved_examples').upsert(
        {
          notion_page_id: row.pageId,
          source_url: row.url,
          raw_text: row.text,
          user_note: row.note,
          saved_at: row.createdTime,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'notion_page_id', ignoreDuplicates: false },
      )
      if (!error) {
        inserted++
        await markSynced(cfg, row.pageId)
      }
    }

    counts.ingested = inserted
    return { found: rows.length, inserted, missingProps, availableProps, dryRun }
  })

  // ── 1-b) 수정 쌍 — 발행된 글마다 (초안 → 발행본) 을 분석 대기열에 올린다 ──
  //
  // 발행본이 정답이다(남헌 결정 2026-09-13). raw_text = 발행본, user_note = 초안.
  // analyze 가 `edit:` 키를 보고 수정 학습 프롬프트로 돌린다. 새 테이블 없음.
  // 초안을 못 찾은 글은 추측하지 않고 missing 으로 남긴다(§7.1).
  //
  // dry-run 은 저장하지 않으니 analyze 가 쌍을 못 본다. 그러면 dry-run 이 "오늘 밤 무엇이
  // 커밋될지"를 보여주지 못한다. 그래서 dry 일 때만 쌍을 메모리로 analyze 에 넘긴다.
  let dryEditRows: Array<{ id: string; notion_page_id: string; source_url: string | null; raw_text: string; user_note: string }> = []
  await step('ingest_edits', async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('content_code, body, published_at, permalink')
      .eq('status', 'published')
    if (error) throw new Error(`발행 글 조회 실패: ${error.message}`)

    const { pairs, missing, unchanged } = buildEditPairs(data ?? [], repoDraftFinder(process.cwd()))
    const failures: string[] = []
    for (const p of pairs) {
      if (dryRun) continue
      const stamp = new Date().toISOString()
      const { error: uErr } = await supabase.from('saved_examples').upsert(
        {
          notion_page_id: p.key,
          source_url: p.permalink,
          raw_text: p.published,
          user_note: p.draft,
          saved_at: p.publishedAt ?? stamp,
          synced_at: stamp,
        },
        // 이미 있는 쌍은 건드리지 않는다. 덮어쓰면 analyzed 행의 근거가 바뀐 채 남는다.
        { onConflict: 'notion_page_id', ignoreDuplicates: true },
      )
      if (uErr) failures.push(`${p.contentCode}: ${uErr.message}`)
    }
    if (failures.length) throw new Error(`수정 쌍 저장 실패 ${failures.length}/${pairs.length} — ${failures.join(' | ')}`)
    if (dryRun) {
      dryEditRows = pairs.map((p) => ({
        id: `dry:${p.key}`,
        notion_page_id: p.key,
        source_url: p.permalink,
        raw_text: p.published,
        user_note: p.draft,
      }))
    }

    return {
      published: (data ?? []).length,
      pairs: pairs.map((p) => `${p.contentCode} ← ${p.draftSource}`),
      missing,
      unchanged,
      dryRun,
    }
  })

  // ── 2) 분석 — pending 저장 글을 LLM 으로 구조 분석 ─────────────
  const analyzed: Array<{
    id: string
    ref: string
    key: string
    title: string
    description: string
    insightType: string
  }> = []

  await step('analyze', async () => {
    const { data, error } = await supabase
      .from('saved_examples')
      .select('id, notion_page_id, source_url, raw_text, user_note')
      .eq('analysis_status', 'pending')
      .order('saved_at', { ascending: true })
      .limit(ANALYZE_LIMIT)

    if (error) throw new Error(`pending 조회 실패: ${error.message}`)

    // 이미 쓰이는 key 를 모델에게 보여준다. 안 보여주면 매번 새 표현을 지어
    // patternize 의 완전 일치 누적이 성립하지 않는다(§13.11).
    const { data: keyRows, error: keyErr } = await supabase
      .from('insight_patterns')
      .select('pattern_key')
      .order('evidence_count', { ascending: false })
      .limit(KNOWN_KEY_LIMIT)
    // edit- key 는 따로 읽는다. 위 상위 N개는 근거 순이라, 저장 글 패턴이 N개를 넘으면
    // 근거 1건짜리 edit- key 가 전부 잘려 수정 쌍이 기존 key 를 영영 못 본다.
    const { data: editKeyRows, error: editKeyErr } = await supabase
      .from('insight_patterns')
      .select('pattern_key')
      .like('pattern_key', `${EDIT_PATTERN_PREFIX}%`)
      .order('evidence_count', { ascending: false })
      .limit(KNOWN_KEY_LIMIT)

    // 키 목록을 못 읽었으면 조용히 빈 목록으로 넘어가지 않는다. 그대로 두면
    // "수렴이 안 되는" 실행이 정상처럼 보인다 (CLAUDE.md §7.1).
    if (keyErr || editKeyErr) throw new Error(`기존 pattern_key 조회 실패: ${(keyErr ?? editKeyErr)!.message}`)

    // 같은 배치 안에서 방금 만들어진 key 도 뒤 글이 볼 수 있어야 한다.
    // DB 것만 넘기면 첫 배치(=DB 가 빈 상태)에서는 서로를 못 보고 갈린다.
    const knownKeys = new Set<string>(
      [...(keyRows ?? []), ...(editKeyRows ?? [])].map((r) => r.pattern_key).filter(Boolean),
    )
    const keyAssignments: Array<{ ref: string; key: string }> = []

    const rows = [...(data ?? [])]
    if (dryRun && dryEditRows.length) {
      // 이미 저장된 쌍은 넣지 않는다. 실제 실행에서도 ignoreDuplicates 라 다시 분석되지 않는다.
      // ponytail: ANALYZE_LIMIT 를 안 건다 — 쌍은 발행 글 수만큼이라 작다. 커지면 slice 한다.
      const { data: have, error: haveErr } = await supabase
        .from('saved_examples')
        .select('notion_page_id')
        .in('notion_page_id', dryEditRows.map((r) => r.notion_page_id))
      if (haveErr) throw new Error(`수정 쌍 저장 여부 조회 실패: ${haveErr.message}`)
      const stored = new Set((have ?? []).map((r) => r.notion_page_id))
      rows.push(...dryEditRows.filter((r) => !stored.has(r.notion_page_id)))
    }
    let failed = 0
    const failures: string[] = []

    for (const row of rows) {
      try {
        // 수정 쌍은 수정 패턴끼리만 뭉친다. 저장 글 패턴과 key 를 섞으면
        // "남의 좋은 글"과 "발행자의 수정"이 한 근거로 합산된다.
        const isEdit = String(row.notion_page_id ?? '').startsWith(EDIT_KEY_PREFIX)
        if (isEdit && !row.user_note?.trim()) throw new Error('수정 쌍인데 초안(user_note)이 비었다')
        const result = await extractInsight({
          rawText: row.raw_text ?? '',
          sourceUrl: row.source_url,
          userNote: isEdit ? null : row.user_note,
          draftText: isEdit ? row.user_note : null,
          knownKeys: [...knownKeys].filter((k) => k.startsWith(EDIT_PATTERN_PREFIX) === isEdit),
        })
        if (isEdit !== result.pattern_key.startsWith(EDIT_PATTERN_PREFIX)) {
          result.pattern_key = isEdit
            ? normalizePatternKey(EDIT_PATTERN_PREFIX + result.pattern_key)
            : normalizePatternKey(`saved-${result.pattern_key}`)
        }

        if (!dryRun) {
          // 여기서 실패한 걸 넘기면 LLM 값은 사라지고 행은 pending 으로 남아 내일 밤 같은 돈을 또 쓴다.
          await must(`분석 결과 저장(${row.id})`, supabase
            .from('saved_examples')
            .update({
              analysis_status: 'analyzed',
              analyzed_at: new Date().toISOString(),
              analysis_error: null,
              insight_type: result.insight_type,
              extracted_insight: result.extracted_insight,
              extracted_pattern: result.extracted_pattern,
              why_it_works: result.why_it_works,
              is_generalizable: result.is_generalizable,
            })
            .eq('id', row.id))
        }

        // 일반화 불가는 패턴으로 만들지 않는다(설계안 §3).
        if (result.is_generalizable) {
          // 뒤 글이 이 key 를 볼 수 있어야 같은 배치 안에서도 뭉친다.
          knownKeys.add(result.pattern_key)
          keyAssignments.push({ ref: row.notion_page_id, key: result.pattern_key })

          analyzed.push({
            id: row.id,
            ref: row.notion_page_id,
            key: result.pattern_key,
            title: result.pattern_title,
            description: [result.extracted_pattern, '', `왜 통하는가: ${result.why_it_works}`].join('\n'),
            insightType: result.insight_type,
          })
        }
      } catch (e) {
        failed++
        const message = e instanceof Error ? e.message : String(e)
        failures.push(`${row.id}: ${message.slice(0, 120)}`)
        // 실패한 행은 failed 로 못 박는다. pending 으로 두면 매일 밤 같은 행을
        // 무한 재시도하며 사용량만 태운다.
        if (!dryRun) {
          // 실패 마킹까지 실패하면 그 행은 내일 밤 또 온다. DB 가 안 되는 상태라 단계를 세운다.
          await must(`실패 마킹(${row.id})`, supabase
            .from('saved_examples')
            .update({ analysis_status: 'failed', analysis_error: message.slice(0, 500) })
            .eq('id', row.id))
        }
      }
    }

    counts.analyzed = rows.length - failed
    return {
      provider: activeProvider(),
      picked: rows.length,
      succeeded: rows.length - failed,
      failed,
      failures: failures.slice(0, 5),
      generalizable: analyzed.length,
      // 어느 행이 어느 key 를 받았는지. 이게 없으면 "신규 3" 만 남아 수렴
      // 여부를 사후에 확인할 방법이 없다(§13.11).
      keyAssignments,
      knownKeysSeeded: (keyRows ?? []).length,
      limit: ANALYZE_LIMIT,
      dryRun,
    }
  })

  // ── 3) 패턴화 — 같은 key 로 근거를 누적하고, 기준 넘으면 가설 발급 ──
  await step('patternize', async () => {
    if (analyzed.length === 0) return { skipped: true, reason: '일반화 가능한 신규 분석 없음' }

    const newPatterns: string[] = []
    const reinforced: string[] = []
    const newHypotheses: string[] = []

    for (const a of analyzed) {
      const { data: existing } = await must(
        `패턴 존재 확인(${a.key})`,
        supabase
          .from('insight_patterns')
          .select('id, pattern_key, evidence_count, status, strength, hypothesis_code')
          .eq('pattern_key', a.key)
          .maybeSingle(),
      )

      if (existing) {
        reinforced.push(a.key)
        if (dryRun) continue

        const nextCount = (existing.evidence_count ?? 1) + 1
        await must(
          `근거 누적(${a.key})`,
          supabase.from('insight_patterns').update({ evidence_count: nextCount }).eq('id', existing.id),
        )

        // 근거가 기준을 넘고 아직 후보면 가설을 발급해 실험에 태운다.
        if (
          shouldReflect({ status: existing.status, evidence_count: nextCount }) &&
          !existing.hypothesis_code
        ) {
          const code = await issueHypothesisCode(supabase)
          await must(`가설 발급(${code})`, supabase.from('hypotheses').insert({
            code,
            statement: `${a.title}: ${a.description.split('\n')[0]}`,
            // threads-report.mjs 의 차원 key 규칙과 맞춘다.
            variable: `auto_${a.key.replace(/-/g, '_')}`.slice(0, 60),
            // ⚠️ 'proposed' 가 아니라 'testing' 이다. threads-draft.md 가
            //    status=eq.testing 으로만 가설을 읽기 때문 — 자세한 사유는
            //    20260829000001_saved_examples.sql 헤더 참조.
            status: 'testing',
            source: 'auto_extracted_from_saved_examples',
            source_example_id: a.id,
          }))

          newHypotheses.push(code)
          await must(
            `패턴에 가설 연결(${a.key}→${code})`,
            supabase
              .from('insight_patterns')
              .update({
                hypothesis_code: code,
                status: 'reflected',
                strength: 1,
                reflected_at: new Date().toISOString(),
              })
              .eq('id', existing.id),
          )
        }
        continue
      }

      newPatterns.push(a.key)
      if (dryRun) continue

      await must(
        `신규 패턴 적재(${a.key})`,
        supabase.from('insight_patterns').insert({
          pattern_key: a.key,
          title: a.title,
          description: a.description,
          insight_type: a.insightType,
          evidence_count: 1,
          status: 'candidate',
          strength: 0,
        }),
      )
    }

    counts.patterns = newPatterns.length + reinforced.length
    return {
      new: newPatterns,
      reinforced,
      newHypotheses,
      reflectThreshold: MIN_EVIDENCE_TO_REFLECT,
      dryRun,
    }
  })

  // ── 4) 판정 — 반영된 패턴의 실제 성과로 승격/기각/보류 ──────────
  const decisions: Array<Record<string, unknown>> = []

  await step('measure', async () => {
    // 가이드에 실린 패턴은 전부 반응률 판정 대상이다(제1헌법, ops/roles/cmo.md).
    // 1건짜리 edit- 후보도 실려서 초안에 쓰이므로 여기서 빠지면 영영 판정을 안 받는다.
    const { data: active, error } = await supabase
      .from('insight_patterns')
      .select('id, pattern_key, title, description, insight_type, evidence_count, status, strength, hypothesis_code, reflected_at')
      .in('status', ['reflected', 'confirmed', 'candidate'])

    if (error) throw new Error(`패턴 조회 실패: ${error.message}`)
    const rows = (active ?? []).filter((r) => r.status !== 'candidate' || isRendered(r))
    if (rows.length === 0) return { skipped: true, reason: '반영된 패턴 없음' }

    // 작가가 stage.json 에 남긴 applied_patterns → content_code. 못 읽으면 던진다(확인 불가).
    const { byKey, unrecorded } = appliedPatternIndex(readStageManifests(process.cwd()))

    const { data: perfData, error: perfErr } = await supabase
      .from('post_performance')
      .select('content_code, hypothesis_code, reply_rate, spread_multiple')
      .not('views_24h', 'is', null)
    if (perfErr) throw new Error(`성과 조회 실패: ${perfErr.message}`)
    const perfRows = (perfData ?? []) as PerfRow[]
    const baseline = summarizePerf(perfRows)

    for (const p of rows) {
      const applied = byKey.get(p.pattern_key)
      if (!p.hypothesis_code && !applied) {
        decisions.push({ pattern: p.pattern_key, decision: 'hold', reason: '연결된 가설·적용 기록(applied_patterns) 없음' })
        continue
      }

      const perf = summarizePerf(perfRowsForPattern(perfRows, p.hypothesis_code, applied))
      const d = decide({ status: p.status, strength: p.strength }, perf, baseline)

      decisions.push({
        pattern: p.pattern_key,
        decision: d.decision,
        reason: d.reason,
        sampleSize: perf.sampleSize,
        appliedPosts: applied ? [...applied] : [],
        replyRate: perf.avgReplyRate,
        baselineReplyRate: baseline.avgReplyRate,
        improvement: d.improvement,
      })

      if (dryRun || d.decision === 'hold') continue

      const measured = {
        last_measured_at: new Date().toISOString(),
        last_sample_size: perf.sampleSize,
        last_metrics: { perf, baseline, improvement: d.improvement, appliedPosts: applied ? [...applied] : [] },
      }

      if (d.decision === 'promote') {
        // counts.promoted 를 먼저 올리면 UPDATE 가 실패해도 보고와 insight_loop_runs 에
        // "승격 1" 이 남는다. DB 가 바뀐 뒤에 센다(진단 2-3).
        await must(
          `승격 반영(${p.pattern_key})`,
          supabase
            .from('insight_patterns')
            // candidate edit- 가 바로 승격되면 reflected_at 이 비어 reflected_needs_trace CHECK 에 걸린다.
            .update({ status: 'confirmed', strength: d.nextStrength, reflected_at: p.reflected_at ?? new Date().toISOString(), ...measured })
            .eq('id', p.id),
        )
        counts.promoted++

        // hypotheses 는 'supported'. guard_hypothesis_promotion 트리거가
        // 표본 5개를 다시 검사한다 — 여기서 통과해도 DB 가 한 번 더 본다.
        // 트리거는 hypothesis_code 로만 세므로 applied_patterns 표본으로 승격하면 거부될 수 있다. 조용히 넘기지 않는다.
        if (p.hypothesis_code) {
          const { error: hErr } = await supabase.from('hypotheses').update({ status: 'supported' }).eq('code', p.hypothesis_code)
          if (hErr) decisions[decisions.length - 1].hypothesisSync = `실패: ${hErr.message}`
        }

        // learnings 에도 남긴다. threads-draft.md 가 "확정된 학습을 가이드보다
        // 우선"하도록 이미 짜여 있어서, 이 한 줄이 생성 단계에 가장 직접적으로
        // 피드백되는 경로다.
        await must(
          `학습 적립(${p.pattern_key})`,
          supabase.from('learnings').insert({
            statement: `${p.title} — ${d.reason}`,
            hypothesis_code: p.hypothesis_code,
            status: 'confirmed',
            sample_size: perf.sampleSize,
            promoted_at: new Date().toISOString(),
          }),
        )
      } else {
        await must(
          `기각 반영(${p.pattern_key})`,
          supabase
            .from('insight_patterns')
            .update({
              status: 'rejected',
              strength: 0,
              rejected_at: new Date().toISOString(),
              rollback_reason: d.reason,
              ...measured,
            })
            .eq('id', p.id),
        )
        counts.rejected++

        if (p.hypothesis_code) {
          await must(
            `가설 기각(${p.hypothesis_code})`,
            supabase.from('hypotheses').update({ status: 'rejected' }).eq('code', p.hypothesis_code),
          )
        }
      }
    }

    // unrecorded = applied_patterns 필드가 없는 초안(옛 매니페스트). 그 글들이 어떤 패턴을 썼는지는 확인 불가다.
    return { evaluated: rows.length, baseline, decisions, unrecordedManifests: unrecorded, dryRun }
  })

  // ── 5·6) 가이드 렌더링 + 커밋 ──────────────────────────────────
  await step('reflect', async () => {
    const { data, error } = await supabase
      .from('insight_patterns')
      .select('pattern_key, title, description, insight_type, evidence_count, status, strength, hypothesis_code, rollback_reason')

    if (error) throw new Error(`패턴 전체 조회 실패: ${error.message}`)

    const rows = (data ?? []) as Array<PatternRow & { rollback_reason: string | null }>
    const learned = renderLearnedPatterns(rows)
    const rejected = renderRejectedPatterns(rows)

    if (dryRun) {
      // patternize 가 dry 라 DB 에 안 쓴 결과를 얹어, 오늘 밤 실제로 커밋될 파일을 본다.
      // 규칙은 patternize 와 같다: 새 key = candidate/1건/strength 0, 기존 key = +1 후 shouldReflect.
      // 가설 코드는 발급하지 않는다(dry). 발급 실패 시 반영 안 되는 분기는 흉내 내지 않는다.
      const sim = rows.map((r) => ({ ...r }))
      for (const a of analyzed) {
        const hit = sim.find((r) => r.pattern_key === a.key)
        if (!hit) {
          sim.push({
            pattern_key: a.key,
            title: a.title,
            description: a.description,
            insight_type: a.insightType,
            evidence_count: 1,
            status: 'candidate',
            strength: 0,
            hypothesis_code: null,
            rollback_reason: null,
          })
          continue
        }
        hit.evidence_count++
        if (shouldReflect(hit) && !hit.hypothesis_code) Object.assign(hit, { status: 'reflected', strength: 1 })
      }
      const preview = renderLearnedPatterns(sim)
      return {
        dryRun: true,
        learnedBytes: preview.length,
        rejectedBytes: rejected.length,
        activeCount: sim.filter(isRendered).length,
        changedVsDb: preview !== learned,
        preview,
      }
    }

    const ref = resolveRepoRef()
    const detail = [
      `분석 ${counts.analyzed}건 / 패턴 ${counts.patterns}건 / 승격 ${counts.promoted}건 / 기각 ${counts.rejected}건`,
    ]

    const a = await putFile(
      ref,
      LEARNED_PATTERNS_PATH,
      learned,
      autoCommitMessage(`검증된 패턴 갱신 (승격 ${counts.promoted} / 기각 ${counts.rejected})`, detail),
    )
    const b = await putFile(
      ref,
      REJECTED_PATTERNS_PATH,
      rejected,
      autoCommitMessage(`기각 패턴 로그 갱신 (${counts.rejected}건)`, detail),
    )

    commitSha = a.commitSha ?? b.commitSha

    // 어느 커밋으로 들어갔는지를 패턴 행에 되기록한다. 이게 없으면
    // 자동 커밋을 나중에 사람이 되짚을 실마리가 사라진다.
    if (a.changed && a.commitSha) {
      await must(
        `반영 커밋 되기록(${a.commitSha.slice(0, 7)})`,
        supabase
          .from('insight_patterns')
          .update({ reflected_commit_sha: a.commitSha })
          .in('status', ['reflected', 'confirmed'])
          .is('reflected_commit_sha', null),
      )
    }

    return { learned: a, rejected: b }
  })

  // ── 7) 실행 로그 ──────────────────────────────────────────────
  const finishedAt = new Date().toISOString()
  const ok = steps.every((s) => s.ok)

  if (!dryRun) {
    const { error } = await supabase.from('insight_loop_runs').insert({
      started_at: startedAt,
      finished_at: finishedAt,
      trigger,
      dry_run: dryRun,
      ok,
      ingested_count: counts.ingested,
      analyzed_count: counts.analyzed,
      pattern_count: counts.patterns,
      promoted_count: counts.promoted,
      rejected_count: counts.rejected,
      commit_sha: commitSha,
      steps,
      error: fatal,
    })
    if (error) fatal = `실행 로그 기록 실패: ${error.message}`
  }

  return {
    // 안전장치 3겹 중 셋째(실행 로그)가 작동 안 한 밤을 정상으로 기록하지 않는다(진단 2-4).
    ok: ok && !fatal,
    dryRun,
    trigger,
    provider: activeProvider(),
    totalMs: Date.now() - t0,
    counts,
    commitSha,
    decisions,
    steps,
    ...(fatal ? { warning: fatal } : {}),
  }
}

/**
 * 다음 가설 코드(H8, H9 ...).
 *
 * 숫자 부분만 보고 최대값 + 1 을 쓴다. 행 수를 세면 중간에 지워진 코드가
 * 있을 때 이미 쓰인 코드를 다시 발급해 UNIQUE 제약에 걸린다.
 */
async function issueHypothesisCode(supabase: Supa): Promise<string> {
  // error 를 버리면 조회 실패가 max=0 이 되어 H1 을 재발급하고, 그 INSERT 는 UNIQUE 로 죽는다(진단 2-3).
  const { data } = await must('가설 코드 조회', supabase.from('hypotheses').select('code'))
  const max = (data ?? []).reduce((m: number, r: { code: string }) => {
    const n = Number(/^H(\d+)$/.exec(r.code ?? '')?.[1] ?? 0)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `H${max + 1}`
}
