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
import { extractInsight, activeProvider } from './llm.ts'
import { notionConfig, fetchPending, markSynced } from './notion.ts'
import {
  decide,
  shouldReflect,
  renderLearnedPatterns,
  renderRejectedPatterns,
  LEARNED_PATTERNS_PATH,
  REJECTED_PATTERNS_PATH,
  MIN_EVIDENCE_TO_REFLECT,
  type PatternRow,
  type PerfSummary,
} from './patterns.ts'
import { resolveRepoRef, putFile, autoCommitMessage } from './github.ts'

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

  // ── 2) 분석 — pending 저장 글을 LLM 으로 구조 분석 ─────────────
  const analyzed: Array<{ id: string; key: string; title: string; description: string; insightType: string }> = []

  await step('analyze', async () => {
    const { data, error } = await supabase
      .from('saved_examples')
      .select('id, source_url, raw_text, user_note')
      .eq('analysis_status', 'pending')
      .order('saved_at', { ascending: true })
      .limit(ANALYZE_LIMIT)

    if (error) throw new Error(`pending 조회 실패: ${error.message}`)

    const rows = data ?? []
    let failed = 0
    const failures: string[] = []

    for (const row of rows) {
      try {
        const result = await extractInsight({
          rawText: row.raw_text ?? '',
          sourceUrl: row.source_url,
          userNote: row.user_note,
        })

        if (!dryRun) {
          await supabase
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
            .eq('id', row.id)
        }

        // 일반화 불가는 패턴으로 만들지 않는다(설계안 §3).
        if (result.is_generalizable) {
          analyzed.push({
            id: row.id,
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
          await supabase
            .from('saved_examples')
            .update({ analysis_status: 'failed', analysis_error: message.slice(0, 500) })
            .eq('id', row.id)
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
      const { data: existing } = await supabase
        .from('insight_patterns')
        .select('id, pattern_key, evidence_count, status, strength, hypothesis_code')
        .eq('pattern_key', a.key)
        .maybeSingle()

      if (existing) {
        reinforced.push(a.key)
        if (dryRun) continue

        const nextCount = (existing.evidence_count ?? 1) + 1
        await supabase
          .from('insight_patterns')
          .update({ evidence_count: nextCount })
          .eq('id', existing.id)

        // 근거가 기준을 넘고 아직 후보면 가설을 발급해 실험에 태운다.
        if (
          shouldReflect({ status: existing.status, evidence_count: nextCount }) &&
          !existing.hypothesis_code
        ) {
          const code = await issueHypothesisCode(supabase)
          const { error: hErr } = await supabase.from('hypotheses').insert({
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
          })
          if (!hErr) {
            newHypotheses.push(code)
            await supabase
              .from('insight_patterns')
              .update({
                hypothesis_code: code,
                status: 'reflected',
                strength: 1,
                reflected_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
          }
        }
        continue
      }

      newPatterns.push(a.key)
      if (dryRun) continue

      await supabase.from('insight_patterns').insert({
        pattern_key: a.key,
        title: a.title,
        description: a.description,
        insight_type: a.insightType,
        evidence_count: 1,
        status: 'candidate',
        strength: 0,
      })
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
    const { data: active, error } = await supabase
      .from('insight_patterns')
      .select('id, pattern_key, title, description, insight_type, evidence_count, status, strength, hypothesis_code')
      .in('status', ['reflected', 'confirmed'])

    if (error) throw new Error(`패턴 조회 실패: ${error.message}`)
    const rows = active ?? []
    if (rows.length === 0) return { skipped: true, reason: '반영된 패턴 없음' }

    const baseline = await summarize(supabase, null)

    for (const p of rows) {
      if (!p.hypothesis_code) {
        decisions.push({ pattern: p.pattern_key, decision: 'hold', reason: '연결된 가설 없음' })
        continue
      }

      const perf = await summarize(supabase, p.hypothesis_code)
      const d = decide({ status: p.status, strength: p.strength }, perf, baseline)

      decisions.push({
        pattern: p.pattern_key,
        decision: d.decision,
        reason: d.reason,
        sampleSize: perf.sampleSize,
        replyRate: perf.avgReplyRate,
        baselineReplyRate: baseline.avgReplyRate,
        improvement: d.improvement,
      })

      if (dryRun || d.decision === 'hold') continue

      const measured = {
        last_measured_at: new Date().toISOString(),
        last_sample_size: perf.sampleSize,
        last_metrics: { perf, baseline, improvement: d.improvement },
      }

      if (d.decision === 'promote') {
        counts.promoted++
        await supabase
          .from('insight_patterns')
          .update({ status: 'confirmed', strength: d.nextStrength, ...measured })
          .eq('id', p.id)

        // hypotheses 는 'supported'. guard_hypothesis_promotion 트리거가
        // 표본 5개를 다시 검사한다 — 여기서 통과해도 DB 가 한 번 더 본다.
        await supabase.from('hypotheses').update({ status: 'supported' }).eq('code', p.hypothesis_code)

        // learnings 에도 남긴다. threads-draft.md 가 "확정된 학습을 가이드보다
        // 우선"하도록 이미 짜여 있어서, 이 한 줄이 생성 단계에 가장 직접적으로
        // 피드백되는 경로다.
        await supabase.from('learnings').insert({
          statement: `${p.title} — ${d.reason}`,
          hypothesis_code: p.hypothesis_code,
          status: 'confirmed',
          sample_size: perf.sampleSize,
          promoted_at: new Date().toISOString(),
        })
      } else {
        counts.rejected++
        await supabase
          .from('insight_patterns')
          .update({
            status: 'rejected',
            strength: 0,
            rejected_at: new Date().toISOString(),
            rollback_reason: d.reason,
            ...measured,
          })
          .eq('id', p.id)

        await supabase.from('hypotheses').update({ status: 'rejected' }).eq('code', p.hypothesis_code)
      }
    }

    return { evaluated: rows.length, baseline, decisions, dryRun }
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
      return {
        dryRun: true,
        learnedBytes: learned.length,
        rejectedBytes: rejected.length,
        activeCount: rows.filter((r) => r.strength >= 1 && r.status !== 'rejected').length,
        preview: learned.slice(0, 600),
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
      await supabase
        .from('insight_patterns')
        .update({ reflected_commit_sha: a.commitSha })
        .in('status', ['reflected', 'confirmed'])
        .is('reflected_commit_sha', null)
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
    ok,
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
 * post_performance 집계.
 *
 * hypothesisCode 가 null 이면 전체 평균(기준선)이다.
 * views_24h 가 없는 글은 제외한다 — 아직 측정이 안 끝난 글을 표본에 넣으면
 * 분모만 늘고 평균이 조용히 낮아진다(threads-report.mjs 와 같은 규칙).
 */
async function summarize(supabase: Supa, hypothesisCode: string | null): Promise<PerfSummary> {
  let q = supabase
    .from('post_performance')
    .select('reply_rate, spread_multiple, views_24h')
    .not('views_24h', 'is', null)

  if (hypothesisCode) q = q.eq('hypothesis_code', hypothesisCode)

  const { data, error } = await q
  if (error) throw new Error(`성과 조회 실패: ${error.message}`)

  const rows = data ?? []
  const avg = (vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (nums.length === 0) return null
    return nums.reduce((a, b) => a + b, 0) / nums.length
  }

  return {
    sampleSize: rows.length,
    avgReplyRate: avg(rows.map((r) => r.reply_rate as number | null)),
    avgSpreadMultiple: avg(rows.map((r) => r.spread_multiple as number | null)),
  }
}

/**
 * 다음 가설 코드(H8, H9 ...).
 *
 * 숫자 부분만 보고 최대값 + 1 을 쓴다. 행 수를 세면 중간에 지워진 코드가
 * 있을 때 이미 쓰인 코드를 다시 발급해 UNIQUE 제약에 걸린다.
 */
async function issueHypothesisCode(supabase: Supa): Promise<string> {
  const { data } = await supabase.from('hypotheses').select('code')
  const max = (data ?? []).reduce((m: number, r: { code: string }) => {
    const n = Number(/^H(\d+)$/.exec(r.code ?? '')?.[1] ?? 0)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `H${max + 1}`
}
