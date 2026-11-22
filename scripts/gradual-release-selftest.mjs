#!/usr/bin/env node
// 점진 해제(v71dc, lib/analysis/gradual-release.ts) 셀프테스트 — 가짜 supabase 만(네트워크·DB·LLM 없음). 실제 승인 0건.
//   node scripts/gradual-release-selftest.mjs
//
// 지키는 것: (a) 단계→상한 (b) 남은 한도에 오늘 이미 승인 포함 (c) 최신 우선·소스 라운드 로빈 (d) 가드 통과분만
// (e) 게이트 × 기능 4조합 — 기능 꺼짐이면 언제나 0건 (f) 킬스위치 재걸림 → 유효 단계 1·그날 0건 (g) 변수 누락·이상값 0건
// (h) 기존 auto-approval·approval-scope 셀프테스트 통과 + 승인 스크립트에서 안전 분기가 DB 쓰기보다 앞 (i) 가드·안전 분기를 깨면 이 검사가 잡는다.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// ── 가짜 supabase: select/eq/is/not/gte/lt/like/in/order/range 체인을 실제로 걸러 낸다. fail 에 표 이름을 주면 그 표는 오류.
function fake(tables, fail = []) {
  return {
    from(table) {
      const preds = []
      let lo = 0, hi = Infinity
      const q = {
        select: () => q,
        eq: (c, v) => (preds.push((r) => r[c] === v), q),
        is: (c, v) => (preds.push((r) => (r[c] ?? null) === v), q),
        not: (c, op, v) => (preds.push((r) => (r[c] ?? null) !== v), q),
        gte: (c, v) => (preds.push((r) => r[c] != null && r[c] >= v), q),
        lt: (c, v) => (preds.push((r) => r[c] != null && r[c] < v), q),
        like: (c, pat) => (preds.push((r) => String(r[c]).startsWith(pat.replace(/%$/, ''))), q),
        in: (c, vals) => (preds.push((r) => vals.includes(r[c])), q),
        order: () => q,
        range: (a, b) => ((lo = a), (hi = b), q),
        update: () => { throw new Error('셀프테스트에서 update 호출 — 쓰기 금지') },
        then(res, rej) {
          const out = fail.includes(table)
            ? { data: null, error: { code: 'X', message: `${table} boom` } }
            : { data: (tables[table] ?? []).filter((r) => preds.every((p) => p(r))).slice(lo, hi + 1), error: null }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return q
    },
  }
}

const TODAY = '2026-12-10'
const ctxOk = (o = {}) => ({ ok: true, approvedToday: 0, trips: [], stageAudits: [], ...o })
const on = { enabled: 'true', gateOn: true, stage: '1', stageSince: '2026-12-01', todayKst: TODAY }
const audit = (verdict, info) => ({ human_verdict: verdict, human_product_informative: info, human_graded_at: '2026-12-05T00:00:00Z' })

/** 모든 검사. M = gradual-release 모듈(원본 또는 변이). 실패 이름 목록을 돌려준다. */
async function checks(M, { quiet = false } = {}) {
  const fails = []
  let pass = 0
  const ok = (c, name) => { if (c) pass++; else fails.push(name) }

  // (a)
  ok(M.stageCap(1) === 500 && M.stageCap(2) === 1500 && M.stageCap(3) === 2500 && M.stageCap(4) === Infinity, '(a) 단계→상한 500/1500/2500/무제한')
  ok(M.stageCap(0) === 0 && M.stageCap(5) === 0, '(a) 범위 밖 단계 상한 0')

  // (b)
  ok(M.remainingToday(500, 450) === 50 && M.remainingToday(500, 600) === 0 && M.remainingToday(500, 0) === 500, '(b) 남은 한도 = 상한 − 오늘 승인(0 미만 0)')
  ok(M.remainingToday(500, NaN) === 0 && M.remainingToday(500, -1) === 0, '(b) 오늘 승인 수가 이상하면 0')
  ok(M.decideRelease({ ...on, ctx: ctxOk({ approvedToday: 450 }) }).limit === 50, '(b) 1단계·오늘 이미 450 → 이번 50')
  ok(M.decideRelease({ ...on, stage: '2', ctx: ctxOk({ approvedToday: 1500 }) }).limit === 0, '(b) 2단계·오늘 이미 1500 → 0')
  ok(M.decideRelease({ ...on, stage: '4', ctx: ctxOk({ approvedToday: 99999 }) }).limit === Infinity, '(b) 4단계 상한 없음')

  // (c)
  const rr = [
    { input_id: 'a1', source_key: 'A', judged_at: '2026-12-09T03:00:00Z' },
    { input_id: 'a2', source_key: 'A', judged_at: '2026-12-09T01:00:00Z' },
    { input_id: 'a3', source_key: 'A', judged_at: '2026-12-08T01:00:00Z' },
    { input_id: 'b1', source_key: 'B', judged_at: '2026-12-09T02:00:00Z' },
    { input_id: 'c1', source_key: 'C', judged_at: '2026-12-09T04:00:00Z' },
    { input_id: 'c2', source_key: 'C', judged_at: null },
  ]
  ok(M.selectRelease(rr, 100).map((r) => r.input_id).join() === 'c1,a1,b1,c2,a2,a3', '(c) 소스 라운드 로빈·소스 안 최신 우선(시각 없음은 맨 뒤)')
  ok(M.selectRelease(rr, 4).map((r) => r.input_id).join() === 'c1,a1,b1,c2', '(c) 한도에서 끊는다')
  ok(M.selectRelease(rr, 0).length === 0 && M.selectRelease(rr, -5).length === 0 && M.selectRelease(rr, NaN).length === 0, '(c) 한도 0·음수·NaN → 0건')

  // (d) 실제 풀 경로(loadApprovalPool) — 가드 통과분만
  const v = (id, o = {}) => ({ input_id: id, verdict: 'relevant', second_verdict: 'relevant', product_informative: true, second_product_informative: true, human_verdict: null, judged_at: '2026-12-05T00:00:00Z', auto_approved_at: null, ...o })
  const long = 'x'.repeat(80)
  const tables = {
    review_relevance_verdicts: [v('ok1'), v('ok2', { judged_at: '2026-12-06T00:00:00Z' }), v('gh'), v('short'), v('out'), v('tag'), v('notext'), v('half', { second_verdict: 'unknown' }), v('old', { judged_at: '2026-11-01T00:00:00Z' })],
    analysis_inputs: [
      { id: 'ok1', project_id: 'p1', source_key: 'reddit', raw_text: long }, { id: 'ok2', project_id: 'p1', source_key: 'hackernews', raw_text: long },
      { id: 'gh', project_id: 'p1', source_key: 'github_issues', raw_text: long }, { id: 'short', project_id: 'p1', source_key: 'reddit', raw_text: 'too short' },
      { id: 'out', project_id: 'p2', source_key: 'reddit', raw_text: long }, { id: 'tag', project_id: 'p1', source_key: 'reddit', raw_text: long },
      { id: 'notext', project_id: 'p1', source_key: 'reddit', raw_text: null },
    ],
    analysis_projects: [{ id: 'p1', area_code: '5' }, { id: 'p2', area_code: 'out-founder' }],
    consumer_material_tags: [{ input_id: 'tag' }],
  }
  const since = new Date('2026-12-01T00:00:00+09:00')
  const pool = await M.loadApprovalPool(fake(tables), since)
  ok(pool.ok && pool.targets.map((r) => r.input_id).sort().join() === 'ok1,ok2', '(d) 가드 통과(영역 안·소비재 아님·github 아님·60자 이상·본문 있음·완전 동의·시행 후)만 대상')
  ok(pool.ok && pool.guardDrop.github_issues === 1 && pool.guardDrop.short === 1 && pool.guardDrop.missing === 1, '(d) 내용 가드 탈락 사유별 집계')
  ok(pool.ok && pool.scopeExcluded['out-area'] === 1 && pool.scopeExcluded['consumer-tag'] === 1 && pool.agreed === 7, '(d) 영역·소비재 제외 집계')
  ok(pool.ok && M.selectRelease(pool.targets, 1)[0].input_id === 'ok2', '(d) 가드 통과분에서 최신 우선 선택')
  for (const t of ['review_relevance_verdicts', 'analysis_inputs', 'consumer_material_tags']) {
    ok((await M.loadApprovalPool(fake(tables, [t]), since)).ok === false, `(d) ${t} 조회 실패 → ok:false(승인 0건)`)
  }

  // (e) 게이트 × 기능 4조합
  const combos = []
  for (const enabled of ['true', '']) for (const gateOn of [true, false]) {
    const d = M.decideRelease({ ...on, enabled, gateOn, ctx: ctxOk() })
    combos.push({ 기능: enabled === 'true' ? '켜짐' : '꺼짐', 게이트: gateOn ? '열림' : '닫힘', 승인한도: d.limit, 사유: d.reason })
  }
  ok(combos.filter((c) => c.기능 === '꺼짐').every((c) => c.승인한도 === 0), '(e) 기능 꺼짐 → 게이트와 무관하게 0건')
  ok(combos.find((c) => c.기능 === '켜짐' && c.게이트 === '닫힘').승인한도 === 0, '(e) 켜짐·게이트 닫힘 → 0건')
  ok(combos.find((c) => c.기능 === '켜짐' && c.게이트 === '열림').승인한도 === 500, '(e) 켜짐·게이트 열림 → 1단계 500')
  for (const e of [undefined, null, 'false', 'TRUE ', 'yes', '1']) {
    const d = M.decideRelease({ ...on, enabled: e, ctx: ctxOk() })
    ok(e === 'TRUE ' ? d.limit === 500 : d.limit === 0, `(e) GRADUAL_RELEASE_ENABLED=${JSON.stringify(e)} → ${e === 'TRUE ' ? '켜짐' : '0건'}`)
  }

  // (f) 킬스위치 재걸림
  const fToday = M.decideRelease({ ...on, stage: '3', ctx: ctxOk({ trips: ['2026-12-10T00:30:00Z'] }) })
  ok(fToday.limit === 0 && fToday.effectiveStage === 1, '(f) 오늘 재걸림 → 유효 단계 1·오늘 0건')
  const fPast = M.decideRelease({ ...on, stage: '3', ctx: ctxOk({ trips: ['2026-12-05T00:00:00Z'] }) })
  ok(fPast.limit === 500 && fPast.effectiveStage === 1, '(f) 단계 중 지난날 재걸림 → 유효 단계 1(상한 500)')
  ok(M.decideRelease({ ...on, ctx: ctxOk({ trips: ['garbage'] }) }).limit === 0, '(f) 시각을 못 읽는 재걸림 → 오늘로 보고 0건')
  ok(M.decideRelease({ ...on, ctx: ctxOk({ stageAudits: [...Array(5)].map(() => audit('irrelevant', true)) }) }).limit === 0, '(f) 단계 내 오류 5건 → 멈춤 0건')
  ok(M.decideRelease({ ...on, ctx: ctxOk({ stageAudits: [audit('irrelevant', true), audit('relevant', false), audit('relevant', false), audit('irrelevant', null), audit('relevant', true)] }) }).limit === 500, '(f) 오류 4건(정보 null 은 창 밖) → 계속')
  // loadReleaseContext: 접두사·since·step 조건
  const ctxTables = {
    review_relevance_verdicts: [
      { input_id: 't1', auto_approval_rule: 'rr-v2', auto_approved_at: '2026-12-09T16:00:00.000Z', human_verdict: null }, // KST 12-10 01:00 → 오늘
      { input_id: 't2', auto_approval_rule: 'rr-v2', auto_approved_at: '2026-12-09T14:00:00.000Z', human_verdict: 'irrelevant', human_product_informative: true, human_graded_at: '2026-12-09T20:00:00Z' }, // KST 12-09 23:00
      { input_id: 't3', auto_approval_rule: 'rr-v1', auto_approved_at: '2026-12-10T01:00:00.000Z', human_verdict: null },
      { input_id: 't4', auto_approval_rule: 'rr-v2', auto_approved_at: '2026-11-20T00:00:00.000Z', human_verdict: 'irrelevant', human_product_informative: true, human_graded_at: '2026-11-21T00:00:00Z' },
    ],
    agent_runs: [
      { id: 'r1', run_key: 'relevance-auto-approve-2026-12-03', started_at: '2026-12-03T00:00:00.000Z' },
      { id: 'r2', run_key: 'relevance-auto-approve-2026-11-25', started_at: '2026-11-25T00:00:00.000Z' },
      { id: 'r3', run_key: 'case-auto-approve-2026-12-04', started_at: '2026-12-04T00:00:00.000Z' },
    ],
    agent_run_steps: [
      { run_id: 'r1', step_key: 'gate', status: 'blocked', updated_at: '2026-12-03T00:01:00Z' },
      { run_id: 'r1', step_key: 'gradual', status: 'skipped', updated_at: '2026-12-03T00:01:00Z' },
      { run_id: 'r2', step_key: 'gate', status: 'blocked', updated_at: '2026-11-25T00:01:00Z' },
      { run_id: 'r3', step_key: 'gate', status: 'blocked', updated_at: '2026-12-04T00:01:00Z' },
    ],
  }
  const c = await M.loadReleaseContext(fake(ctxTables), { stageSince: '2026-12-01', todayKst: TODAY })
  ok(c.ok && c.approvedToday === 1, '(f) 오늘(KST) rr-v2 승인만 센다(어제 23시·rr-v1 제외)')
  ok(c.ok && c.trips.length === 1 && c.trips[0] === '2026-12-03T00:01:00Z', '(f) 재걸림 = 승인 실행의 gate∧blocked ∧ STAGE_SINCE 이후(다른 스크립트·이전·gradual 스텝 제외)')
  ok(c.ok && c.stageAudits.length === 1, '(f) 단계 감사 = STAGE_SINCE 이후 rr-v2 사람 채점')
  for (const t of ['review_relevance_verdicts', 'agent_runs', 'agent_run_steps']) {
    const bad = await M.loadReleaseContext(fake(ctxTables, [t]), { stageSince: '2026-12-01', todayKst: TODAY })
    ok(!bad.ok && M.decideRelease({ ...on, ctx: bad }).limit === 0, `(f) ${t} 조회 실패 → 확인 불가 0건`)
  }

  // (g) 변수 누락·이상값
  for (const s of [undefined, '', '0', '5', '1.5', 'abc', ' 2x']) ok(M.decideRelease({ ...on, stage: s, ctx: ctxOk() }).limit === 0, `(g) STAGE=${JSON.stringify(s)} → 0건`)
  for (const s of [undefined, '', '2026-13-01', '2026-02-30', '12/01/2026', '2026-12-11']) ok(M.decideRelease({ ...on, stageSince: s, ctx: ctxOk() }).limit === 0, `(g) STAGE_SINCE=${JSON.stringify(s)} → 0건(미래 포함)`)
  ok(M.decideRelease({ ...on, stageSince: TODAY, ctx: ctxOk() }).limit === 500, '(g) STAGE_SINCE=오늘은 유효')
  ok(M.decideRelease({ ...on, ctx: null }).limit === 0 && M.decideRelease({ ...on, ctx: { ok: false, error: 'x' } }).limit === 0, '(g) 상태 조회 없음·실패 → 0건')

  // 표본·판정
  const many = [...Array(300)].map((_, i) => ({ input_id: `id${String(i).padStart(3, '0')}`, source_key: i < 200 ? 'big' : i < 290 ? 'mid' : `tiny${i % 3}` }))
  const s1 = M.stratifiedSample(many, 30, 7), s2 = M.stratifiedSample(many, 30, 7)
  const dist = M.countBySource(s1)
  ok(s1.length === 30 && new Set(s1.map((r) => r.input_id)).size === 30, '표본 30건·중복 없음')
  ok(s1.map((r) => r.input_id).join() === s2.map((r) => r.input_id).join(), '표본 재현 가능(seed)')
  ok(dist.tiny0 >= 1 && dist.tiny1 >= 1 && dist.tiny2 >= 1 && dist.big > dist.mid && dist.mid > dist.tiny0, `소스별 층화(작은 소스도 1건 이상, 비례) ${JSON.stringify(dist)}`)
  ok(M.stratifiedSample(many.slice(0, 10), 30).length === 10, '모집단이 30 미만이면 전부')
  const j = (errs, n) => M.judgeStage([...Array(n)].map((_, i) => (i < errs ? audit('irrelevant', true) : audit('relevant', true))))
  ok(j(4, 30).state === 'pass' && j(5, 30).state === 'stop' && j(0, 29).state === 'insufficient' && j(5, 10).state === 'stop', '판정: 4건 통과 · 5건 멈춤 · 29건 확인 불가')
  ok(M.judgeStage([...Array(30)].map(() => audit('relevant', null))).state === 'insufficient', '판정: 정보 칸 빈 줄은 채점으로 안 센다')

  if (!quiet) console.table(combos.map(({ 사유, ...x }) => ({ ...x, 사유: 사유.slice(0, 50) })))
  return { pass, fails }
}

let total = 0
const real = await import('../lib/analysis/gradual-release.ts')
const r = await checks(real)
total += r.pass
for (const f of r.fails) console.error(`✗ ${f}`)
let fail = r.fails.length

// (h) 승인 스크립트 정적 순서: 게이트 닫힘 분기 → 점진 해제 0건 분기 → 풀 조회 → UPDATE. 런키 접두사 일치.
const src = readFileSync(join(ROOT, 'scripts/relevance-auto-approve.mjs'), 'utf8')
const at = (s) => src.indexOf(s)
const order = ['if (!gate.on) {', 'const release = decideRelease(', 'if (release.limit === 0) {', 'loadApprovalPool(sb, gate.since)', 'selectRelease(pool.targets, release.limit)', '.update({ auto_approved_at']
const pos = order.map(at)
const sh = (c, n) => { if (c) total++; else { fail++; console.error(`✗ ${n}`) } }
sh(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), `(h) 승인 스크립트 순서: ${order.join(' → ')}`)
sh(src.split('.update(').length === 2, '(h) 승인 스크립트의 UPDATE 는 한 곳뿐(점진 해제 선택을 거친다)')
sh(at('runKey: `relevance-auto-approve-${kstDate()}') > 0 && real.APPROVE_RUN_PREFIX === 'relevance-auto-approve-', '(h) 재걸림 조회 접두사 = 승인 실행 runKey')
sh(!/stepKey: 'gate'[^\n]*status: 'skipped'/.test(src) && /stepKey: 'gradual'/.test(src), "(h) 점진 해제 0건 기록은 'gate' 가 아닌 'gradual' 스텝")
const gd = src.slice(at('if (gradualDry) {'), at('const tracker ='))
sh(gd.length > 0 && !/\.update\(|createTracker|recordStatusLog|tracker\./.test(gd) && gd.includes('loadApprovalPool(sb, since)'), '(h) --gradual-dry 는 tracker 전에 끝나고 쓰기 없음·같은 풀 함수')
const wf = readFileSync(join(ROOT, '.github/workflows/nightly-relevance.yml'), 'utf8')
sh(['GRADUAL_RELEASE_ENABLED', 'GRADUAL_RELEASE_STAGE', 'GRADUAL_RELEASE_STAGE_SINCE'].every((k) => wf.includes(`${k}: \${{ vars.${k} || '' }}`)), '(h) 워크플로가 세 변수를 vars 로 읽는다(기본 빈값=꺼짐)')
for (const t of ['auto-approval-selftest.mjs', 'approval-scope-selftest.mjs']) {
  try { execFileSync(process.execPath, [join(ROOT, 'scripts', t)], { stdio: 'pipe' }); total++ } catch (e) { fail++; console.error(`✗ (h) 기존 ${t} 실패:\n${e.stdout}${e.stderr}`) }
}

// 표본 파일 형식이 relevance-grading-import.mjs 파서로 되돌아가는가(머리글·행 모양은 표본 스크립트 원문 그대로).
{
  const { parseGradingMarkdown } = await import('../lib/analysis/relevance-judge.ts')
  const ss = readFileSync(join(ROOT, 'scripts/gradual-release-sample.mjs'), 'utf8')
  const HEAD = '| # | 프로젝트 | 리뷰 원문 | 한국어 뜻 | 관련 ☐ | 무관 ☐ | 모름 ☐ | 정보있음 ☐ | 정보없음 ☐ | 소스 | 키 |'
  const ROW = '| 한국어 뜻: (오케스트레이터가 채움) | ☐ | ☐ | ☐ | ☐ | ☐ | ${md(r.source_key)} | \\`${r.input_id}\\` |'
  sh(ss.includes(HEAD) && ss.includes(ROW) && !/모델 판정/.test(ss.split(HEAD)[1] ?? 'x'), '표본: 감사 표 머리글·한국어 뜻 칸·모델 판정 가림·전체 uuid 키')
  const U = '0a1b2c3d-1111-4222-8333-444455556666'
  const p = parseGradingMarkdown([HEAD, '|---|', `| 1 | p | t | 한국어 뜻: (오케스트레이터가 채움) | ☐ | x | ☐ | x | ☐ | reddit | \`${U}\` |`].join('\n'))
  sh(p.marks.length === 1 && p.marks[0].input_id === U && p.marks[0].verdict === 'irrelevant' && p.marks[0].product_informative === true, '표본: import 파서가 관련·정보 칸을 읽는다')
  sh(/감사 창에 들어간다/.test(ss), '표본: 머리 주석에 rr-v2 감사 창 편입을 적는다')
}

// (i) 변이 —가드·안전 분기를 일부러 깨면 위 검사가 실패해야 한다.
const modSrc = readFileSync(join(ROOT, 'lib/analysis/gradual-release.ts'), 'utf8')
const libUrl = pathToFileURL(join(ROOT, 'lib/analysis/')).href
const dir = mkdtempSync(join(tmpdir(), 'gradual-mut-'))
const mutants = [
  ['내용 가드 우회', 'if (passesRrV2ContentGuard(x))', 'if (true)'],
  ['기능 꺼짐 안전 분기 제거', 'if (!base.enabled) return', 'if (false) return'],
  ['오늘 승인 수 무시', 'const limit = remainingToday(cap, approvedToday)', 'const limit = cap'],
  ['재걸림 무시', 'if (trips.length > 0) {', 'if (false) {'],
  ['영역 제외 우회', 'filter((r) => !scope.excluded.has(r.input_id))', 'filter(() => true)'],
]
for (const [name, from, to] of mutants) {
  if (!modSrc.includes(from)) { fail++; console.error(`✗ (i) 변이 지점 없음: ${name}`); continue }
  const p = join(dir, `m${mutants.findIndex((m) => m[0] === name)}.ts`)
  writeFileSync(p, modSrc.replace(from, to).replace(/from '\.\//g, `from '${libUrl}`))
  const m = await checks(await import(pathToFileURL(p).href), { quiet: true })
  sh(m.fails.length > 0, `(i) 변이 "${name}" 를 검사가 잡는다(${m.fails.length}건 실패)`)
}

console.log(`gradual-release selftest: ${total} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
