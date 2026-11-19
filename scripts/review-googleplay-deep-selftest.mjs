#!/usr/bin/env node
// v71cu S3 구글 플레이 깊이 수집 셀프테스트 — 네트워크·DB 없음. 실제 어댑터 + 실제 러너 + 실제 store(가짜는 fetch·supabase 포트뿐).
//   1) 커서 상태 인코딩·다음 상태 표  2) 러너 경계: 상한에서 옛 쪽 커서 보관 → 다음 실행이 최신 → 옛 쪽 → 끝 표시
//   3) 연속 0건 닫기: 옛 쪽이 남으면 안 닫고, 끝 표시 뒤에만 닫는다  4) 차단·일일 상한은 그대로  5) 스위치 off = 옛 동작
//   6) store: exhausted ∧ ≤50 ∧ 끝 표시 없음만 실행당 N개 다시 본다
// 실행: node scripts/review-googleplay-deep-selftest.mjs

import { googleplayAdapter as gp, decodeDeep, encodeDeep, deepNext, gpDeepOn, RPC_ID } from '../lib/review/adapters/googleplay.ts'
import { runCollection } from '../lib/review/runner.ts'
import { createReviewStore, gpRevisitPerRun } from '../lib/review/store.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}
const withDeep = async (v, fn) => {
  const prev = process.env.GP_DEEP_PAGING
  if (v === undefined) delete process.env.GP_DEEP_PAGING
  else process.env.GP_DEEP_PAGING = v
  try { return await fn() } finally { if (prev === undefined) delete process.env.GP_DEEP_PAGING; else process.env.GP_DEEP_PAGING = prev }
}

// ── 합성 응답(review-googleplay-selftest.mjs 와 같은 모양) ──
const DAY = 86400
const SEC = 1759640400 // KST 2025-10-05
const entry = (id, sec) => [id, ['x', null], 4, null, `본문 ${id}`, [sec, 0], 0, null, null, null, '1.0']
const rpc = (list, tok) => `)]}'\n\n${JSON.stringify([['wrb.fr', RPC_ID, JSON.stringify([list, tok === undefined ? null : [null, tok], null]), null, null, null, 'generic']])}`
// 최신순 페이지: first(10-05) → P2(10-04) → P3(10-03) → P4(10-02) → P5(10-01, 끝)
const PAGES = {
  first: rpc([entry('a1', SEC), entry('a2', SEC)], 'TOKEN_P2'),
  TOKEN_P2: rpc([entry('b1', SEC - DAY)], 'TOKEN_P3'),
  TOKEN_P3: rpc([entry('c1', SEC - 2 * DAY)], 'TOKEN_P4'),
  TOKEN_P4: rpc([entry('d1', SEC - 3 * DAY)], 'TOKEN_P5'),
  TOKEN_P5: rpc([entry('e1', SEC - 4 * DAY)]),
}

// ── 1) 상태 ──
t('스위치 기본 off', gpDeepOn(undefined), false)
for (const [v, w] of [['on', true], ['ON', true], ['true', true], ['1', true], ['off', false], ['', false], ['yes', false]]) t(`gpDeepOn(${v})`, gpDeepOn(v), w)
t('평문 토큰 = h', JSON.stringify(decodeDeep('TOK')), '{"h":"TOK"}')
t('null = 빈 상태', JSON.stringify(decodeDeep(null)), '{}')
t('깨진 JSON = 빈 상태', JSON.stringify(decodeDeep('{bad')), '{}')
t('위험 토큰은 버린다', JSON.stringify(decodeDeep('{"b":"x\\"]"}')), '{}')
t('go 는 b 가 있을 때만', JSON.stringify(decodeDeep('{"go":1}')), '{}')
t('h 하나 = 평문으로 인코딩', encodeDeep({ h: 'T' }), 'T')
t('빈 상태 = null', encodeDeep({}), null)
t('왕복', encodeDeep(decodeDeep('{"h":"A","b":"B","end":1}')), '{"h":"A","b":"B","end":1}')
const dn = (s, tok, stale) => JSON.stringify(deepNext(s, tok, stale))
t('모름·새 것 → 평문 토큰', dn({}, 'T', false), '{"nextCursor":"T"}')
t('모름·이미 본 구간 → 그대로 옛 쪽으로 내려감', dn({}, 'T', true), '{"nextCursor":"{\\"b\\":\\"T\\",\\"go\\":1}","staleExpected":true}')
t('모름·목록 끝 → 끝 표시', dn({}, null, false), '{"nextCursor":"{\\"end\\":1}","pauseRun":true}')
t('b 있음·이미 본 구간 → b 로 전환', dn({ b: 'B' }, 'T', true), '{"nextCursor":"{\\"b\\":\\"B\\",\\"go\\":1}","staleExpected":true}')
t('b 있음·새 것 → h 이어읽기 + b 보관', dn({ b: 'B' }, 'T', false), '{"nextCursor":"{\\"h\\":\\"T\\",\\"b\\":\\"B\\"}"}')
t('옛 쪽 읽는 중·다음 토큰', dn({ b: 'B', go: 1 }, 'T', true), '{"nextCursor":"{\\"b\\":\\"T\\",\\"go\\":1}","staleExpected":true}')
t('옛 쪽 끝 → 끝 표시', dn({ b: 'B', go: 1 }, null, true), '{"nextCursor":"{\\"end\\":1}","pauseRun":true}')
t('끝 표시·이미 본 구간 → 끝 유지(옛 동작)', dn({ end: 1 }, 'T', true), '{"nextCursor":"{\\"end\\":1}","pauseRun":true}')
await withDeep('on', () => {
  t('상한: 모름이면 h 를 b 로', gp.cursorAtCap('TOK'), '{"b":"TOK"}')
  t('상한: 옛 쪽 읽는 중이면 go 를 뺀다', gp.cursorAtCap('{"b":"B","go":1}'), '{"b":"B"}')
  t('상한: 최신 쪽 중이면 b 만', gp.cursorAtCap('{"h":"H","b":"B"}'), '{"b":"B"}')
  t('상한: 끝 표시 유지', gp.cursorAtCap('{"h":"H","end":1}'), '{"end":1}')
  t('pending: b 있음', gp.deepPending('{"b":"B"}'), true)
  t('pending: 끝', gp.deepPending('{"end":1}'), false)
  t('pending: null', gp.deepPending(null), false)
  const body = (c) => decodeURIComponent(gp.nextRequest({ productRef: 'kr:ko:com.a.b', cursor: c }).init.body)
  t('요청: go 면 b 토큰', body('{"b":"TOKEN_P4","go":1}').includes('TOKEN_P4'), true)
  t('요청: b 보관 중이면 최신부터(토큰 없음)', /TOKEN_/.test(body('{"b":"TOKEN_P4"}')), false)
})
await withDeep(undefined, () => {
  t('off: 상한 = null(옛 동작)', gp.cursorAtCap('TOK'), null)
  t('off: pending 없음', gp.deepPending('{"b":"B"}'), false)
  const r = gp.nextRequest({ productRef: 'kr:ko:com.a.b', cursor: '{"b":"TOKEN_P4","go":1}' })
  t('off: JSON 커서가 남아도 요청은 최신부터(되돌리기 안전)', r !== null && !/TOKEN_/.test(decodeURIComponent(r.init.body)), true)
})

// ── 2~5) 실제 러너 ──
function harness({ target, status = {}, cap = 200 }) {
  const log = { inits: [], saves: [], inputs: [] }
  let clock = 1_000_000
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url, init) {
      if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nAllow: /\n', finalUrl: url }
      const tok = /TOKEN_[A-Z0-9]+/.exec(decodeURIComponent(init?.body ?? ''))?.[0] ?? 'first'
      log.inits.push(tok)
      if (status[tok]) return { status: status[tok], body: '' }
      return { status: 200, body: PAGES[tok] ?? '' }
    },
    store: {
      loadSource: async () => ({ key: 'googleplay', enabled: true, minIntervalMs: 1000, dailyRequestCap: cap, requestsToday: 0 }),
      async listDueTargets() { return [{ id: 'g1', projectId: 'p1', sourceKey: 'googleplay', productRef: 'kr:ko:com.Slack', consecutiveEmpty: 0, totalCollected: 0, lastReviewAt: null, cursor: null, ...target }] },
      async saveTargetProgress(p) { log.saves.push(p) },
      async recordFingerprint() { return 'new' }, // 이미 본 리뷰 시나리오는 테스트가 'duplicate' 로 바꾼다
      async appendInput(i) { log.inputs.push(i.text); return `in${log.inputs.length}` },
      async linkFingerprint() {},
    },
  }
  return { ports, log }
}
const run = (h) => runCollection(gp, { dryRun: false, targetLimit: 5 }, h.ports)

await withDeep('on', async () => {
  {
    // 첫 방문: 3페이지 상한 → 옛 쪽 커서 보관(예전엔 버렸다)
    const h = harness({ target: {} })
    const r = await run(h)
    t('첫 방문: 요청 3회', h.log.inits.join(','), 'first,TOKEN_P2,TOKEN_P3')
    t('첫 방문: 마지막 커서 = 옛 쪽 토큰 보관', h.log.saves.at(-1).cursor, '{"b":"TOKEN_P4"}')
    t('첫 방문: active', h.log.saves.at(-1).status, 'active')
    t('첫 방문: 문구에 보관 사실', r.perTarget[0].outcome.includes('옛 쪽 커서는 보관'), true)
  }
  {
    // 다음 방문: 최신 1장(이미 본 구간) → 옛 쪽 P4 → P5(끝) → 끝 표시. 옛 리뷰 2건이 새로 들어온다.
    const h = harness({ target: { cursor: '{"b":"TOKEN_P4"}', lastReviewAt: '2025-10-06', totalCollected: 4 } })
    const r = await run(h)
    t('재방문: 최신 → 옛 쪽 순서', h.log.inits.join(','), 'first,TOKEN_P4,TOKEN_P5')
    t('재방문: 증분 종료가 옛 쪽을 막지 않는다', r.stats.newReviews, 4)
    t('재방문: 끝 표시', h.log.saves.at(-1).cursor, '{"end":1}')
    t('재방문: 새 글이 있었으니 active', h.log.saves.at(-1).status, 'active')
  }
  {
    // exhausted ∧ 빈 커서(옛 타깃) 다시 보기 — 전부 이미 본 리뷰. 끝까지 내려가 끝 표시 후 닫는다.
    const h = harness({ target: { cursor: null, lastReviewAt: '2025-10-06', consecutiveEmpty: 3, totalCollected: 44 } })
    h.ports.store.recordFingerprint = async () => 'duplicate'
    const saved = PAGES.TOKEN_P3
    PAGES.TOKEN_P3 = rpc([entry('c1', SEC - 2 * DAY)]) // 3장째가 끝
    const r = await run(h)
    PAGES.TOKEN_P3 = saved
    t('옛 타깃: 이미 본 구간이어도 내려간다', h.log.inits.join(','), 'first,TOKEN_P2,TOKEN_P3')
    t('옛 타깃: 끝 표시', h.log.saves.at(-1).cursor, '{"end":1}')
    t('옛 타깃: 신규 0 ∧ 끝 → 닫는다(진짜 고갈)', h.log.saves.at(-1).status, 'exhausted')
    t('옛 타깃: 닫은 수치가 남는다', r.perTarget[0].outcome.includes('연속 4회 0건'), true)
  }
  {
    // 옛 쪽이 남았으면 신규 0 이어도 닫지 않는다.
    const h = harness({ target: { cursor: '{"b":"TOKEN_P2"}', lastReviewAt: '2025-10-06', consecutiveEmpty: 3, totalCollected: 44 } })
    h.ports.store.recordFingerprint = async () => 'duplicate'
    await run(h)
    t('옛 쪽 남음: 요청 3회(상한)', h.log.inits.join(','), 'first,TOKEN_P2,TOKEN_P3')
    t('옛 쪽 남음: 다음 옛 쪽 토큰 보관', h.log.saves.at(-1).cursor, '{"b":"TOKEN_P4"}')
    t('옛 쪽 남음: 닫지 않는다', h.log.saves.at(-1).status, 'active')
  }
  {
    // 최신 1장이 전부 이미 본 구간(5건 ≥ STALE_STREAK_TO_STOP) — 러너 증분 종료가 옛 쪽 전환을 막지 않는다(staleExpected).
    const saved = PAGES.first
    PAGES.first = rpc([1, 2, 3, 4, 5].map((i) => entry(`s${i}`, SEC)), 'TOKEN_P2')
    const h = harness({ target: { cursor: '{"b":"TOKEN_P4"}', lastReviewAt: '2025-10-06' } })
    await run(h)
    PAGES.first = saved
    t('연속 5건 이미 본 구간: 그래도 옛 쪽으로 간다', h.log.inits.join(','), 'first,TOKEN_P4,TOKEN_P5')
  }
  {
    // 옛 쪽 페이지에서 429 → 즉시 중단(우회 없음)
    const h = harness({ target: { cursor: '{"b":"TOKEN_P4"}', lastReviewAt: '2025-10-06' }, status: { TOKEN_P4: 429 } })
    const r = await run(h)
    t('429: 차단으로 센다', r.stats.blockedResponses, 1)
    t('429: 더 요청하지 않는다', h.log.inits.join(','), 'first,TOKEN_P4')
  }
  {
    // 일일 상한 2 → 2회에서 멈춘다(옛 쪽도 같은 예산)
    const h = harness({ target: {}, cap: 2 })
    await run(h)
    t('일일 상한: 요청 2회', h.log.inits.length, 2)
  }
})
await withDeep(undefined, async () => {
  const h = harness({ target: {} })
  await run(h)
  t('off: 첫 방문 상한 → 커서 버림(옛 동작)', h.log.saves.at(-1).cursor, null)
  const h2 = harness({ target: { cursor: null, lastReviewAt: '2025-10-06', consecutiveEmpty: 3 } })
  h2.ports.store.recordFingerprint = async () => 'duplicate'
  await run(h2)
  t('off: 이미 본 구간 → 1장에서 멈춤', h2.log.inits.join(','), 'first')
  t('off: 연속 0건 → 닫음', h2.log.saves.at(-1).status, 'exhausted')
})

// ── 6) store 다시 보기 선택 ──
function chainSupa(resolve) {
  const queries = []
  return {
    queries,
    from(table) {
      const calls = [['from', table]]
      queries.push(calls)
      const q = new Proxy({}, {
        get(_, k) {
          if (k === 'then') return (ok, ko) => Promise.resolve().then(() => resolve(calls)).then(ok, ko)
          return (...a) => { calls.push([k, ...a]); return q }
        },
      })
      return q
    },
  }
}
const row = (id, lastRun, total, cursor = null) => ({ id, project_id: `p_${id}`, source_key: 'googleplay', product_ref: `kr:ko:com.${id}.app`, cursor, last_review_at: null, consecutive_empty: 3, total_collected: total, last_run_at: lastRun })
const ACTIVE = [row('new', null, 0), row('vis', '2026-11-01T00:00:00Z', 300)]
const EXH = [row('e10', '2026-10-01T00:00:00Z', 10), row('eEnd', '2026-10-01T00:00:00Z', 12, '{"end":1}'), row('e30', '2026-10-01T00:00:00Z', 30), row('e44', '2026-10-01T00:00:00Z', 44)]
const supaFor = (exResp) => chainSupa((calls) => {
  const eq = calls.filter((c) => c[0] === 'eq').map((c) => c.slice(1).join('='))
  if (calls[0][1] === 'analysis_projects') return { data: [], error: null }
  if (eq.includes('source_key=appstore')) return { data: [], error: null }
  if (eq.includes('status=exhausted')) return typeof exResp === 'function' ? exResp() : exResp
  return { data: ACTIVE, error: null }
})
const withEnv = async (k, v, fn) => { const p = process.env[k]; process.env[k] = v; try { return await fn() } finally { if (p === undefined) delete process.env[k]; else process.env[k] = p } }
await withDeep('on', async () => {
  const sb = supaFor({ data: EXH, error: null })
  const got = await withEnv('GP_REVISIT_PER_RUN', '2', () => createReviewStore(sb).listDueTargets('googleplay', 10))
  t('다시 보기: 미방문 → 다시 보기(적은 순, 끝 표시 제외, 2개) → 방문', got.map((g) => g.id).join(','), 'new,e10,e30,vis')
  const exq = sb.queries.find((c) => c.some((x) => x[0] === 'eq' && x[2] === 'exhausted'))
  t('다시 보기 쿼리: ≤50', JSON.stringify(exq.find((x) => x[0] === 'lte')), '["lte","total_collected",50]')
  t('다시 보기 쿼리: 방문 시각 필터도 건다', exq.some((x) => x[0] === 'or'), true)
  t('반환 모양 = TargetState(revisit 표식 안 샌다)', 'revisit' in got[1], false)
  const sb0 = supaFor({ data: EXH, error: null })
  await withEnv('GP_REVISIT_PER_RUN', '0', () => createReviewStore(sb0).listDueTargets('googleplay', 10))
  t('GP_REVISIT_PER_RUN=0: 다시 보기 쿼리 안 함', sb0.queries.some((c) => c.some((x) => x[0] === 'eq' && x[2] === 'exhausted')), false)
  const warns = []
  const ow = console.warn
  console.warn = (m) => warns.push(String(m))
  const got2 = await createReviewStore(supaFor(() => { throw new Error('boom') })).listDueTargets('googleplay', 10)
  console.warn = ow
  t('다시 보기 조회 실패: 활성만으로 돈다', got2.map((g) => g.id).join(','), 'new,vis')
  t('다시 보기 조회 실패: ⚠️ 한 줄', warns.length === 1 && warns[0].startsWith('⚠️'), true)
})
await withDeep(undefined, async () => {
  const sb = supaFor({ data: EXH, error: null })
  await createReviewStore(sb).listDueTargets('googleplay', 10)
  t('off: 다시 보기 쿼리 안 함', sb.queries.some((c) => c.some((x) => x[0] === 'eq' && x[2] === 'exhausted')), false)
})
for (const [v, w] of [[undefined, 5], ['', 5], ['abc', 5], ['-1', 5], ['0', 0], ['7', 7], ['999', 200]]) t(`gpRevisitPerRun(${v})`, gpRevisitPerRun(v), w)

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
