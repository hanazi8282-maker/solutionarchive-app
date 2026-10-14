#!/usr/bin/env node
// 야간 2차 판정 부품 셀프테스트 — 대상 선정·독립성 제외·어휘 검증·기록 조건(WHERE)·503 순환 헬퍼. 네트워크·DB 없음.
//   node scripts/relevance-second-judge-selftest.mjs
import { orderSecondTargets, secondAreaGroup, recordSecondOpinion, secondJudgeTargetReason, validateOpinions, isGeminiModel, secondOpinionUserPrompt } from '../lib/analysis/second-opinion.ts'
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

// v70 L-22: 승인 가능 행(1차 relevant ∧ 정보있음) 우선 + 나머지는 상한의 otherShare 만
{
  const mk = (n, ok2, pid = 'p1') => Array.from({ length: n }, (_, i) => ({ input_id: `${pid}${ok2 ? 'A' : 'O'}${i}`, project_id: pid, verdict: ok2 ? 'relevant' : 'irrelevant', product_informative: ok2 }))
  const approvable = (r) => r.verdict === 'relevant' && r.product_informative === true
  const big = [...mk(100, true), ...mk(100, false)]
  const a = orderSecondTargets(big, (p) => bm[p], 20, { approvable, otherShare: 0.15 })
  ok(a.picked.filter(approvable).length === 17 && a.picked.filter((r) => !approvable(r)).length === 3 && a.remaining === 180, `상한 20: 승인 가능 17 + 나머지 3(15%) (실제 ${a.picked.filter(approvable).length}/${a.picked.length}, 남은 ${a.remaining})`)
  const few = orderSecondTargets([...mk(5, true), ...mk(100, false)], (p) => bm[p], 20, { approvable })
  ok(few.picked.filter(approvable).length === 5 && few.picked.length === 20, '승인 가능 행이 모자라면 나머지로 채운다(상한은 다 쓴다)')
  const none = orderSecondTargets(mk(10, true), (p) => bm[p], 20, { approvable })
  ok(none.picked.length === 10 && none.remaining === 0, '나머지가 없으면 승인 가능 행만')
  ok(orderSecondTargets(big, (p) => bm[p], 20).picked.length === 20, 'approvable 미지정이면 기존 동작')
  const zero = orderSecondTargets(big, (p) => bm[p], 20, { approvable, otherShare: 0 })
  ok(zero.picked.every(approvable), 'otherShare 0 → 승인 가능 행만')
}

// v71k 3-1: 영역 그룹 순서 — 0 영역 안·정보있음 → 1 영역 안 나머지 → 2 design·hold → 3 영역 밖·코드 없음. 버리지 않고, 그룹 안은 기존 순서(안정).
{
  ok(secondAreaGroup('3', true) === 0 && secondAreaGroup('3', false) === 1 && secondAreaGroup('5', null) === 1, '그룹: 영역 안은 정보있음이면 0, 아니면 1')
  ok(secondAreaGroup('design', true) === 2 && secondAreaGroup('hold', false) === 2, '그룹: design·hold 는 2')
  ok(secondAreaGroup('out-founder', true) === 3 && secondAreaGroup('out-consumer', true) === 3 && secondAreaGroup(null, true) === 3 && secondAreaGroup('', true) === 3 && secondAreaGroup('x9', true) === 3, '그룹: 영역 밖·코드 없음·모르는 코드는 맨 뒤(3)')
  const area = { pa: '2', pb: '4', pc: 'design', pd: 'out-founder', pe: null }
  const mk = (pid, n, info) => Array.from({ length: n }, (_, i) => ({ input_id: pid + i, project_id: pid, product_informative: info }))
  const rowsG = [...mk('pd', 3, true), ...mk('pe', 2, true), ...mk('pc', 2, true), ...mk('pb', 2, false), ...mk('pa', 2, true)]
  const gOf = (r) => secondAreaGroup(area[r.project_id], r.product_informative)
  const g = orderSecondTargets(rowsG, () => 'SaaS', 100, { groupOf: gOf })
  ok(g.picked.map(gOf).every((x, i, a) => i === 0 || a[i - 1] <= x), '그룹 순서: 비내림차순')
  ok(g.picked.length === 11 && g.remaining === 0, '버리지 않는다(영역 밖도 모두 들어간다)')
  ok(g.picked.slice(0, 2).every((r) => r.project_id === 'pa'), '맨 앞은 영역 안·정보있음')
  const cut = orderSecondTargets(rowsG, () => 'SaaS', 4, { groupOf: gOf })
  ok(cut.picked.map(gOf).join('') === '0011' && cut.remaining === 7, '상한 4: 그룹 0 두 건 + 그룹 1 두 건, 나머지 7건은 remaining')
  const again = orderSecondTargets(rowsG.slice().reverse(), () => 'SaaS', 100, { groupOf: gOf })
  ok(again.picked.map(gOf).join('') === g.picked.map(gOf).join(''), '입력 순서와 무관하게 그룹 순서는 같다')
  ok(orderSecondTargets(rowsG, () => 'SaaS', 100, { groupOf: gOf, approvable: () => true, otherShare: 0 }).picked.length === 11, 'groupOf 가 있으면 otherShare 경로를 타지 않는다')
}

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

// v71p 3: 영역 밖·코드 없음 2차 제외 — 기본 on, off/false/0 이면 기존 동작, 필터는 그룹 3 만 뺀다(영역 안·design·hold 는 그대로).
{
  const src = (await import('node:fs')).readFileSync(new URL('./relevance-second-judge-auto.mjs', import.meta.url), 'utf8')
  ok(src.includes("['off', 'false', '0'].includes(String(process.env.RELEVANCE_SECOND_SKIP_OUT_OF_AREA"), '제외는 기본 on, off·false·0 일 때만 꺼진다')
  ok(src.includes('!== 3) : live') && src.includes('orderSecondTargets(queue,'), '필터는 그룹 3 만 빼고 대기열(queue)을 정렬에 넘긴다')
  const area = { a: '2', b: 'design', c: 'hold', d: 'out-founder', e: null }
  const kept = Object.keys(area).filter((k) => secondAreaGroup(area[k], true) !== 3)
  ok(kept.join() === 'a,b,c', '영역 안·design·hold 는 남고 out-*·코드 없음은 빠진다')
}

console.log(`relevance-second-judge selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
