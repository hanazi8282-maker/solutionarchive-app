#!/usr/bin/env node
// 야간 2차 판정 부품 셀프테스트 — 대상 선정·독립성 제외·어휘 검증·기록 조건(WHERE)·503 순환 헬퍼. 네트워크·DB 없음.
//   node scripts/relevance-second-judge-selftest.mjs
import { orderSecondTargets, recordSecondOpinion, secondJudgeTargetReason, validateOpinions, isGeminiModel, secondOpinionUserPrompt } from '../lib/analysis/second-opinion.ts'
import { callGeminiRotating, ProviderHttpError } from '../lib/analysis/llm.ts'
import { LlmBudgetExceededError } from '../lib/analysis/budget.ts'
import { RELEVANCE_CRITERIA_VERSION } from '../lib/analysis/relevance-criteria.ts'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`) } }

// ── 대상 선정 ────────────────────────────────────────────────
const since = new Date('2026-09-27T15:00:00Z') // 2026-09-28 KST 0시
const base = { input_id: 'a', verdict: 'relevant', model: 'claude-sonnet-4-6', judged_at: '2026-09-28T19:10:00Z', human_verdict: null, second_verdict: null }
ok(secondJudgeTargetReason(base, since) === 'target', '대상: 1차 있음·2차 없음·사람 없음·since 이후·Claude')
ok(secondJudgeTargetReason({ ...base, verdict: null }, since) === 'no-first', '제외: 1차 없음')
ok(secondJudgeTargetReason({ ...base, second_verdict: 'relevant' }, since) === 'has-second', '제외: 2차 이미 있음')
ok(secondJudgeTargetReason({ ...base, human_verdict: 'irrelevant' }, since) === 'human', '제외: 사람 채점됨')
ok(secondJudgeTargetReason({ ...base, judged_at: '2026-09-27T14:59:59Z' }, since) === 'before-since', '제외: since 이전 판정')
ok(secondJudgeTargetReason({ ...base, judged_at: null }, since) === 'before-since', '제외: 판정 시각 모름(§7.1)')
ok(secondJudgeTargetReason({ ...base, verdict: 'unknown' }, since) === 'target', '대상: 1차 unknown 도 2차는 단다(자동 승인은 isFullAgreement 가 가른다)')
// 독립성 — 1차가 Gemini 면 2차(Gemini) 대상 아님
ok(secondJudgeTargetReason({ ...base, model: 'gemini-3.5-flash' }, since) === 'gemini-first', '독립성: 1차 gemini 제외')
ok(secondJudgeTargetReason({ ...base, model: 'Gemini-3-Flash-Preview' }, since) === 'gemini-first', '독립성: 대소문자 무관')
ok(secondJudgeTargetReason({ ...base, model: null }, since) === 'no-model', '독립성: 모델 모름은 제외')
ok(secondJudgeTargetReason({ ...base, model: 'claude-cli' }, since) === 'target' && !isGeminiModel('claude-opus-5'), '독립성: claude-cli 라벨은 대상')

// 순서·상한 — SaaS 우선 → 많은 순 → projectId
const bm = { p1: 'D2C', p2: 'SAAS', p3: null } // DB 어휘 그대로(productKindOf: 'SAAS' 만 software)
const rows = [
  ...['a', 'b', 'c'].map((x) => ({ input_id: `p1${x}`, project_id: 'p1' })),
  ...['a'].map((x) => ({ input_id: `p2${x}`, project_id: 'p2' })),
  ...['a', 'b'].map((x) => ({ input_id: `p3${x}`, project_id: 'p3' })),
]
const o1 = orderSecondTargets(rows, (p) => bm[p], 200)
ok(o1.picked.map((r) => r.project_id).join('') === 'p2p1p1p1p3p3' && o1.remaining === 0, `순서: SaaS(p2) → 많은 순(p1 3 > p3 2) (실제 ${o1.picked.map((r) => r.project_id).join(',')})`)
const o2 = orderSecondTargets(rows, (p) => bm[p], 3)
ok(o2.picked.length === 3 && o2.remaining === 3 && o2.picked[0].project_id === 'p2', '상한: 3건 고르고 남은 3건은 remaining')
ok(orderSecondTargets([], () => null, 200).picked.length === 0, '대상 0')

// ── 어휘 검증(validateOpinions 재사용) ────────────────────────
const v = validateOpinions({ rows: [
  { input_id: 'x1', verdict: 'relevant', product_informative: true },
  { input_id: 'x2', verdict: 'maybe' },
  { input_id: 'x3', verdict: 'relevant', product_informative: 'yes' },
  { input_id: 'x1', verdict: 'irrelevant' },
  { input_id: 'x4', verdict: 'unknown', product_informative: null },
] })
ok(v.ok.map((o) => o.input_id).join() === 'x1,x4' && v.rejected.length === 3, '어휘: 밖 verdict·불리언 아닌 정보·중복 거부, unknown 판정은 유효')
ok(secondOpinionUserPrompt([]).includes(`"criteria_version":"${RELEVANCE_CRITERIA_VERSION}"`), 'user 프롬프트에 현재 criteria_version')

// ── 기록 조건 — 가짜 클라이언트로 WHERE 를 잡는다 ───────────────
function fakeClient(responses) {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        update(payload) {
          const call = { table, payload, where: [] }
          calls.push(call)
          const chain = {
            eq(c, val) { call.where.push(`${c}=${val}`); return chain },
            is(c, val) { call.where.push(`${c} is ${val}`); return chain },
            select() { return Promise.resolve(responses.shift()) },
          }
          return chain
        },
      }
    },
  }
}
const op = { input_id: 'id1', verdict: 'relevant', product_informative: true }
{
  const sb = fakeClient([{ data: [{ input_id: 'id1' }], error: null }])
  const r = await recordSecondOpinion(sb, op, { model: 'gemini-3.5-flash', judgedAt: 'T' })
  const c = sb.calls[0]
  ok(r.result === 'recorded' && c.table === 'review_relevance_verdicts', '기록: 1행 갱신 = recorded')
  ok(c.where.includes('input_id=id1') && c.where.includes('second_verdict is null') && c.where.includes('human_verdict is null'), `기록: WHERE second_verdict·human_verdict IS NULL (실제 ${c.where.join(' & ')})`)
  ok(Object.keys(c.payload).sort().join() === 'second_judged_at,second_model,second_product_informative,second_verdict', '기록: second_* 4컬럼만 쓴다(verdict·human·라벨 없음)')
}
{
  const sb = fakeClient([{ data: [], error: null }])
  ok((await recordSecondOpinion(sb, op, { model: 'm', judgedAt: 'T' })).result === 'skipped', '경쟁: 0행 = skipped(덮지 않음)')
}
{
  const sb = fakeClient([{ data: [{ input_id: 'id1' }], error: null }])
  await recordSecondOpinion(sb, op, { model: 'm', judgedAt: 'T', requireUngraded: false })
  ok(!sb.calls[0].where.includes('human_verdict is null'), 'import 경로(requireUngraded:false)는 human 조건 없음(기존 동작)')
}
{
  const sb = fakeClient([{ data: null, error: { code: 'PGRST204', message: "Could not find the 'second_product_informative' column" } }, { data: [{ input_id: 'id1' }], error: null }])
  const r = await recordSecondOpinion(sb, op, { model: 'm', judgedAt: 'T' })
  ok(r.result === 'recorded' && r.infoColumnAbsent && !('second_product_informative' in sb.calls[1].payload), '정보 컬럼 없음: 그 필드만 빼고 재기록 + 알림')
}
{
  const sb = fakeClient([{ data: null, error: { code: '500', message: 'boom' } }])
  ok((await recordSecondOpinion(sb, op, { model: 'm', judgedAt: 'T' })).result === 'failed', '저장 오류 = failed')
}

// ── 503 순환 헬퍼 ────────────────────────────────────────────
const M = ['m1', 'm2', 'm3']
const script = (plan) => { const seen = []; return { seen, call: async (m) => { seen.push(m); const x = plan.shift(); if (x instanceof Error) throw x; return x } } }
const waits = []
const sleep = async (ms) => { waits.push(ms) }
const e503 = () => new ProviderHttpError(503, 'overloaded')
{
  const s = script([e503(), 'OK'])
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep, baseWaitMs: 10 })
  ok(r.ok && r.model === 'm2' && s.seen.join() === 'm1,m2', '503 → 다음 모델로 넘어간다')
}
{
  waits.length = 0
  const s = script([e503(), e503(), e503(), e503(), e503(), e503(), 'OK'])
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep, baseWaitMs: 10 })
  ok(r.ok && r.model === 'm1' && waits.join() === '10,20', `전부 503 → 바퀴마다 쉬고(10·20) 3바퀴째 성공 (실제 ${waits.join()})`)
}
{
  waits.length = 0
  const s = script(Array.from({ length: 12 }, e503))
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep, baseWaitMs: 10 })
  ok(!r.ok && !r.stop && s.seen.length === 12 && waits.join() === '10,20,30', '4바퀴 전부 503 → 이 요청만 실패(stop=false), 마지막 뒤엔 안 쉰다')
}
{
  const ex = new Set()
  const s = script([new ProviderHttpError(429, 'quota'), 'OK'])
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep, exhausted: ex })
  ok(r.ok && r.model === 'm2' && ex.has('m1'), '429 → 그 모델 소진 표시, 다음 모델')
  const s2 = script(['OK'])
  const r2 = await callGeminiRotating('s', 'u', 't', { models: M, call: s2.call, sleep, exhausted: ex })
  ok(r2.ok && s2.seen.join() === 'm2', '소진 표시는 다음 호출에도 이어진다(같은 Set)')
}
{
  const s = script([new ProviderHttpError(429, 'q'), new ProviderHttpError(404, 'nf'), new ProviderHttpError(429, 'q')])
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep })
  ok(!r.ok && r.stop && s.seen.length === 3, '모든 모델 429/404 → 한도, 즉시 멈춤(stop)')
}
{
  const s = script([new ProviderHttpError(403, 'forbidden'), 'OK'])
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep })
  ok(!r.ok && r.stop && s.seen.length === 1, '403 → 즉시 멈춤, 다음 모델 안 부른다')
}
{
  const s = script([new LlmBudgetExceededError('budget'), 'OK'])
  const r = await callGeminiRotating('s', 'u', 't', { models: M, call: s.call, sleep })
  ok(!r.ok && r.stop && s.seen.length === 1, '예산 초과 → 즉시 멈춤')
}

console.log(`relevance-second-judge selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
