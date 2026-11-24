#!/usr/bin/env node
// 점진 해제(v71dc·v71dl, lib/analysis/gradual-release.ts) 셀프테스트 — 가짜 supabase 만(네트워크·DB·LLM 없음). 실제 승인 0건.
//   node scripts/gradual-release-selftest.mjs
//
// 지키는 것: (a) 단계→이번 단계 추가분 상한 500/2000/4000/5000/무제한 (b) 남은 한도 = 상한 − STAGE_SINCE 이후 이 단계 승인(이전 단계·이전 날짜 구분 없음, v71ee-2) (c) 최신 우선·소스 라운드 로빈
// (d) 가드 통과분만 (e) 게이트 × 기능 4조합 — 기능 꺼짐이면 언제나 0건 (f) 킬스위치 재걸림 → 유효 단계 1·그날 0건 (g) 변수 누락·이상값 0건
// (h) 기존 auto-approval·approval-scope 셀프테스트 통과 + 승인 스크립트에서 안전 분기가 DB 쓰기보다 앞 (i) 가드·안전 분기·문턱을 깨면 이 검사가 잡는다(변이 시험)
// (j) v71dl 가 — 킬스위치 감사 창은 승인 가드와 같은 정의로 거른 뒤 최근 50건(문턱 8·워밍업 10 불변)
// (k) v71dl — STAGE_SINCE 시각(ISO UTC) · 그 시각 이전 blocked 무시 (l) v71dl — 표본 배분 앱스토어 10·구글 플레이 6·나머지 14

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
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
const NOW = new Date('2026-12-10T05:00:00.000Z') // KST 12-10 14:00
const ctxOk = (o = {}) => ({ ok: true, approvedInStage: 0, trips: [], stageAudits: [], ...o })
const on = { enabled: 'true', gateOn: true, stage: '1', stageSince: '2026-12-01', todayKst: TODAY, now: NOW }
const audit = (verdict, info) => ({ human_verdict: verdict, human_product_informative: info, human_graded_at: '2026-12-05T00:00:00Z' })
const LONG = 'x'.repeat(80)

/**
 * 감사 창 픽스처 — 행마다 판정 행·원문·프로젝트·소비재 태그를 만든다.
 * spec: { id, err?, src?, text?, out?, tag?, at? } — err=true 면 사람 irrelevant(오류).
 */
function auditTables(specs) {
  const t = { review_relevance_verdicts: [], analysis_inputs: [], analysis_projects: [{ id: 'pin', area_code: '5' }, { id: 'pout', area_code: 'out-founder' }], consumer_material_tags: [] }
  for (const s of specs) {
    t.review_relevance_verdicts.push({ input_id: s.id, auto_approval_rule: 'rr-v2', auto_approved_at: '2026-12-02T00:00:00.000Z', human_verdict: s.err ? 'irrelevant' : 'relevant', human_product_informative: true, human_graded_at: s.at })
    if (!s.noInput) t.analysis_inputs.push({ id: s.id, project_id: s.out ? 'pout' : 'pin', source_key: s.src ?? 'reddit', raw_text: s.text === undefined ? LONG : s.text })
    if (s.tag) t.consumer_material_tags.push({ input_id: s.id })
  }
  // rr-v1·사람 채점 없음은 창 밖(쿼리 조건).
  t.review_relevance_verdicts.push({ input_id: 'v1', auto_approval_rule: 'rr-v1', auto_approved_at: '2026-12-02T00:00:00.000Z', human_verdict: 'irrelevant', human_product_informative: true, human_graded_at: '2026-12-09T23:00:00.000Z' })
  t.analysis_inputs.push({ id: 'v1', project_id: 'pin', source_key: 'reddit', raw_text: LONG })
  return t
}
const at = (day, h = 0) => `2026-12-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`
const many = (n, o) => [...Array(n)].map((_, i) => ({ id: `${o.p}${String(i).padStart(3, '0')}`, ...o, at: o.at ?? at(o.day ?? 3, i % 24) }))

/** 모든 검사. M = gradual-release, A = auto-approval(원본 또는 변이). 실패 이름 목록을 돌려준다. */
async function checks(M, A, { quiet = false } = {}) {
  const fails = []
  let pass = 0
  const ok = (c, name) => { if (c) pass++; else fails.push(name) }

  // (a) 단계표 — 하루 누적 상한
  ok(M.stageCap(1) === 500 && M.stageCap(2) === 2000 && M.stageCap(3) === 4000 && M.stageCap(4) === 5000 && M.stageCap(5) === Infinity, '(a) 단계→추가분 상한 500/2000/4000/5000/무제한')
  ok(M.stageCap(0) === 0 && M.stageCap(6) === 0, '(a) 범위 밖 단계 상한 0')
  ok(M.parseStage('5') === 5 && M.parseStage('1') === 1 && ['0', '6', '1.5', 'abc', '', ' '].every((s) => M.parseStage(s) === null), '(a) 단계 변수는 1~5 정수만(그 밖 = 확인 불가)')
  ok(M.GRADUAL.sampleSize === 30 && M.GRADUAL.maxErrors === 4, '(a) 표본 30 · 통과선 오류 4건 이하 불변')

  // (b) 남은 한도 · 같은 날 단계 올림(누적)
  ok(M.remainingInStage(500, 450) === 50 && M.remainingInStage(500, 600) === 0 && M.remainingInStage(500, 0) === 500, '(b) 남은 한도 = 상한 − 이 단계 승인(0 미만 0)')
  ok(M.remainingInStage(500, NaN) === 0 && M.remainingInStage(500, -1) === 0, '(b) 이 단계 승인 수가 이상하면 0')
  ok(M.decideRelease({ ...on, ctx: ctxOk({ approvedInStage: 450 }) }).limit === 50, '(b) 1단계·이 단계에서 이미 450 → 이번 50')
  const day = [['1', 0, 500], ['2', 0, 2000], ['3', 0, 4000], ['4', 0, 5000], ['3', 1500, 2500]] // v71ee-2: 새 단계는 추가분 상한 그대로(이전 단계 승인은 세지 않는다)
  for (const [st, before, more] of day) ok(M.decideRelease({ ...on, stage: st, stageSince: TODAY, ctx: ctxOk({ approvedInStage: before }) }).limit === more, `(b) ${st}단계·이 단계에서 이미 ${before} → ${more}건 더`)
  ok(M.decideRelease({ ...on, stage: '2', ctx: ctxOk({ approvedInStage: 300 }) }).limit === 1700, '(b) 2단계·이 단계에서 이미 300(다른 슬롯) → 1700')
  ok(M.decideRelease({ ...on, stage: '2', ctx: ctxOk({ approvedInStage: 2000 }) }).limit === 0, '(b) 2단계·이 단계에서 이미 2000 → 0')
  ok(M.decideRelease({ ...on, stage: '4', ctx: ctxOk({ approvedInStage: 99999 }) }).limit === 0, '(b) 4단계도 상한 5000(무제한 아님)')
  ok(M.decideRelease({ ...on, stage: '5', ctx: ctxOk({ approvedInStage: 99999 }) }).limit === Infinity, '(b) 5단계 상한 없음')

  // (m) v71ee-4 C-1 — 제품 점유율 브레이크(순수) · v71ee-6 영역 NULL 가드
  {
    const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ input_id: `${p}-${i}` }))
    const rows = [...mk('A', 30), ...mk('B', 10), ...mk('C', 10), ...mk('D', 10), ...mk('E', 10), ...mk('F', 10), ...mk('G', 10), ...mk('H', 10)]
    const po = new Map(rows.map((r) => [r.input_id, r.input_id.split('-')[0]]))
    const b = M.applyProductBrake(rows, po, 0.2)
    const cnt = {}; for (const r of b.kept) cnt[po.get(r.input_id)] = (cnt[po.get(r.input_id)] ?? 0) + 1
    ok(b.applied && Math.max(...Object.values(cnt)) / b.kept.length <= 0.2 + 1e-9, '(m) 브레이크: 한 제품이 결과의 20% 를 넘지 않는다')
    ok(b.kept.length + b.held.length === rows.length && b.held.every((r) => po.get(r.input_id) === 'A') && b.heldByProject.A === b.held.length, '(m) 브레이크: 초과분은 그 제품에서만, 나머지는 그대로(대기로 남김)')
    ok(b.kept.filter((r) => po.get(r.input_id) === 'A').every((r, i) => r.input_id === 'A-' + i), '(m) 브레이크: 앞쪽(최신순)부터 남긴다')
    const two = [...mk('A', 30), ...mk('B', 10)]
    const few = M.applyProductBrake(two, new Map(two.map((r) => [r.input_id, r.input_id[0]])), 0.2)
    ok(!few.applied && few.kept.length === 40 && few.held.length === 0, '(m) 제품이 5개 미만이면 브레이크를 걸지 않는다(20% 불가능)')
    const unk = M.applyProductBrake([{ input_id: 'x1' }, ...rows], po, 0.2)
    ok(unk.kept.some((r) => r.input_id === 'x1'), '(m) 제품을 모르는 행은 브레이크 대상이 아니다')
    ok(M.applyProductBrake([], new Map(), 0.2).kept.length === 0 && M.applyProductBrake(rows, po, 0).applied === false, '(m) 빈 입력·share 0 은 그대로')
    const S = await import('../lib/analysis/approval-scope.ts')
    ok(S.outOfScopeReason(null, false, true) === 'area-unassigned' && S.outOfScopeReason('', false, true) === 'area-unassigned' && S.outOfScopeReason('5', false, true) === null && S.outOfScopeReason(null, false) === null, '(m) 영역 NULL: 승인 후보에서만 area-unassigned(기본 동작·감사 창은 그대로)')
    ok(S.outOfScopeReason('out-founder', false, true) === 'out-area', '(m) out-* 는 여전히 out-area 가 우선')
    const mt = readFileSync(join(ROOT, 'lib/analysis/gradual-release.ts'), 'utf8')
    ok(mt.includes('{ allow: al.allow, rejectUnassigned: true }') && !mt.includes('loadScope(sb, ids, { rejectUnassigned: true'), '(m) 승인 후보 풀만 rejectUnassigned 를 켠다(감사 창 기본값은 그대로)')
    const sc = readFileSync(join(ROOT, 'scripts/relevance-auto-approve.mjs'), 'utf8')
    ok(sc.indexOf('applyProductBrake(') > 0 && sc.indexOf('applyProductBrake(') < sc.indexOf(".from('review_relevance_verdicts')"), '(m) 브레이크는 DB 쓰기보다 앞')
    ok(sc.includes('RECHECK_EVERY > 0 && approved >= nextCheck') && /!gate2\.on\) \{[\s\S]{0,300}break/.test(sc), '(m) 승인 도중 N건마다 킬스위치 창을 다시 읽고 닫히면 멈춘다')
  }

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
  const tables = {
    review_relevance_verdicts: [v('ok1'), v('ok2', { judged_at: '2026-12-06T00:00:00Z' }), v('gh'), v('short'), v('out'), v('tag'), v('notext'), v('half', { second_verdict: 'unknown' }), v('old', { judged_at: '2026-11-01T00:00:00Z' })],
    analysis_inputs: [
      { id: 'ok1', project_id: 'p1', source_key: 'reddit', raw_text: LONG }, { id: 'ok2', project_id: 'p1', source_key: 'hackernews', raw_text: LONG },
      { id: 'gh', project_id: 'p1', source_key: 'github_issues', raw_text: LONG }, { id: 'short', project_id: 'p1', source_key: 'reddit', raw_text: 'x'.repeat(59) },
      { id: 'out', project_id: 'p2', source_key: 'reddit', raw_text: LONG }, { id: 'tag', project_id: 'p1', source_key: 'reddit', raw_text: LONG },
      { id: 'notext', project_id: 'p1', source_key: 'reddit', raw_text: null },
    ],
    analysis_projects: [{ id: 'p1', area_code: '5' }, { id: 'p2', area_code: 'out-founder' }],
    consumer_material_tags: [{ input_id: 'tag' }],
  }
  const since = new Date('2026-12-01T00:00:00+09:00')
  const pool = await M.loadApprovalPool(fake(tables), since)
  ok(pool.ok && pool.targets.map((r) => r.input_id).sort().join() === 'ok1,ok2', '(d) 가드 통과(영역 안·소비재 아님·github 아님·60자 이상·본문 있음·완전 동의·시행 후)만 대상')
  ok(pool.ok && pool.guardDrop.github_issues === 1 && pool.guardDrop.short === 1 && pool.guardDrop.missing === 1, '(d) 내용 가드 탈락 사유별 집계(59자는 짧다)')
  ok(pool.ok && pool.scopeExcluded['out-area'] === 1 && pool.scopeExcluded['consumer-tag'] === 1 && pool.agreed === 7, '(d) 영역·소비재 제외 집계')
  ok(pool.ok && pool.targets.every((r) => r.source_key === (r.input_id === 'ok1' ? 'reddit' : 'hackernews')), '(d) 대상에 원문 소스가 붙는다')
  ok(pool.ok && M.selectRelease(pool.targets, 1)[0].input_id === 'ok2', '(d) 가드 통과분에서 최신 우선 선택')
  for (const t of ['review_relevance_verdicts', 'analysis_inputs', 'consumer_material_tags', 'analysis_projects']) {
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
      { run_id: 'r1', step_key: 'gate', status: 'blocked', updated_at: '2026-12-03T00:01:00.000Z' },
      { run_id: 'r1', step_key: 'gradual', status: 'skipped', updated_at: '2026-12-03T00:01:00.000Z' },
      { run_id: 'r2', step_key: 'gate', status: 'blocked', updated_at: '2026-11-25T00:01:00.000Z' },
      { run_id: 'r3', step_key: 'gate', status: 'blocked', updated_at: '2026-12-04T00:01:00.000Z' },
    ],
  }
  const since1201 = M.parseStageSince('2026-12-01', TODAY, NOW)
  const c = await M.loadReleaseContext(fake(ctxTables), { stageSince: since1201, todayKst: TODAY })
  ok(c.ok && c.approvedInStage === 2, '(v71ee-2) STAGE_SINCE 이후 rr-v2 승인 전부(날짜 구분 없음 — 어제 23시분 포함, rr-v1·STAGE_SINCE 이전 제외)')
  { const late = await M.loadReleaseContext(fake(ctxTables), { stageSince: new Date('2026-12-09T15:00:00Z'), todayKst: TODAY })
    ok(late.ok && late.approvedInStage === 1, '(v71ee-2) STAGE_SINCE 이전(어제 23:00 KST) 승인은 세지 않는다 — 새 단계 = 새 카운터') }
  { const cap = M.stageCap(3); const atCap = M.decideRelease({ ...on, stage: '3', ctx: ctxOk({ approvedInStage: cap }) }), under = M.decideRelease({ ...on, stage: '3', ctx: ctxOk({ approvedInStage: cap - 1 }) })
    ok(cap === 4000 && atCap.limit === 0 && under.limit === 1, '(v71ee-2) 3단계 추가분 4,000 — 정확히 4,000 에서 멈추고 3,999 에서는 1건 남는다') }
  ok(c.ok && c.trips.length === 1 && c.trips[0] === '2026-12-03T00:01:00.000Z', '(f) 재걸림 = 승인 실행의 gate∧blocked ∧ STAGE_SINCE 이후(다른 스크립트·이전·gradual 스텝 제외)')
  ok(c.ok && c.stageAudits.length === 1, '(f) 단계 감사 = STAGE_SINCE 이후 rr-v2 사람 채점')
  for (const t of ['review_relevance_verdicts', 'agent_runs', 'agent_run_steps']) {
    const bad = await M.loadReleaseContext(fake(ctxTables, [t]), { stageSince: since1201, todayKst: TODAY })
    ok(!bad.ok && M.decideRelease({ ...on, ctx: bad }).limit === 0, `(f) ${t} 조회 실패 → 확인 불가 0건`)
  }

  // (g) 변수 누락·이상값
  for (const s of [undefined, '', '0', '6', '1.5', 'abc', ' 2x', '-1']) ok(M.decideRelease({ ...on, stage: s, ctx: ctxOk() }).limit === 0, `(g) STAGE=${JSON.stringify(s)} → 0건`)
  for (const s of [undefined, '', '2026-13-01', '2026-02-30', '12/01/2026', '2026-12-11']) ok(M.decideRelease({ ...on, stageSince: s, ctx: ctxOk() }).limit === 0, `(g) STAGE_SINCE=${JSON.stringify(s)} → 0건(미래 포함)`)
  ok(M.decideRelease({ ...on, stageSince: TODAY, ctx: ctxOk() }).limit === 500, '(g) STAGE_SINCE=오늘은 유효')
  ok(M.decideRelease({ ...on, ctx: null }).limit === 0 && M.decideRelease({ ...on, ctx: { ok: false, error: 'x' } }).limit === 0, '(g) 상태 조회 없음·실패 → 0건')

  // (k) STAGE_SINCE 시각(ISO UTC)
  const T = '2026-12-10T03:00:00Z' // KST 12:00
  ok(M.parseStageSince(T, TODAY, NOW)?.toISOString() === '2026-12-10T03:00:00.000Z', '(k) ISO UTC 시각을 그 시각으로 읽는다')
  ok(M.parseStageSince('2026-12-10T03:00Z', TODAY, NOW)?.toISOString() === '2026-12-10T03:00:00.000Z' && M.parseStageSince('2026-12-10T03:00:00.5Z', TODAY, NOW)?.toISOString() === '2026-12-10T03:00:00.500Z', '(k) 초·밀리초 생략/포함')
  ok(M.parseStageSince('2026-12-01', TODAY, NOW)?.getTime() === new Date('2026-12-01T00:00:00+09:00').getTime() && M.parseStageSince(TODAY, TODAY, NOW)?.getTime() === M.kstDayRange(TODAY).start.getTime(), '(k) 날짜만 → 그날 00:00 KST(기존과 동일)')
  const before = M.decideRelease({ ...on, stage: '2', stageSince: T, ctx: ctxOk({ approvedInStage: 500, trips: ['2026-12-10T01:00:00.000Z'] }) })
  ok(before.limit === 1500 && before.effectiveStage === 2, '(k) 시각 이전 blocked 무시 → 2단계 그대로(500 승인 후 1500 더)')
  const after = M.decideRelease({ ...on, stage: '2', stageSince: T, ctx: ctxOk({ approvedInStage: 500, trips: ['2026-12-10T01:00:00.000Z', '2026-12-10T04:00:00.000Z'] }) })
  ok(after.limit === 0 && after.effectiveStage === 1, '(k) 시각 이후 blocked → 유효 단계 1·그날 0건')
  ok(M.decideRelease({ ...on, stage: '2', stageSince: '2026-12-10', ctx: ctxOk({ trips: ['2026-12-10T01:00:00.000Z'] }) }).limit === 0, '(k) 날짜만이면 같은 blocked(10:00 KST)는 그날 것 → 0건(기존 동작)')
  ok(M.decideRelease({ ...on, stage: '2', stageSince: '2026-12-10', ctx: ctxOk({ trips: ['2026-12-09T14:00:00.000Z'] }) }).limit === 2000, '(k) 날짜만·그 전날 23:00 KST blocked 는 이 단계 밖')
  for (const s of ['2026-12-10T05:00:01Z', '2026-12-11T00:00:00Z']) ok(M.decideRelease({ ...on, stageSince: s, ctx: ctxOk() }).limit === 0, `(k) 미래 시각 ${s} → 0건`)
  ok(M.decideRelease({ ...on, stageSince: '2026-12-10T05:00:00Z', ctx: ctxOk() }).limit === 500, '(k) 지금과 같은 시각은 유효')
  for (const s of ['2026-12-10T03:00:00+09:00', '2026-12-10 03:00:00Z', '2026-12-10T03:00:00', '2026-02-30T00:00:00Z', '2026-12-10T24:00:00Z', '2026-12-10T03:60:00Z', '2026-12-10T03:00:60Z', '2026-12-10T3:00:00Z', 'now']) {
    ok(M.decideRelease({ ...on, stageSince: s, ctx: ctxOk() }).limit === 0, `(k) 형식 오류 ${JSON.stringify(s)} → 0건`)
  }
  ok(M.decideRelease({ ...on, stageSince: T, now: new Date('x'), ctx: ctxOk() }).limit === 0, '(k) 현재 시각을 모르면 시각 STAGE_SINCE 0건')
  // loadReleaseContext: 그날 첫 슬롯에 시작한 실행 행이 시각 뒤 슬롯에서 다시 막혀도 센다 · 시각 전 blocked 는 안 센다.
  const sinceT = M.parseStageSince(T, TODAY, NOW)
  const runToday = { id: 'r5', run_key: 'relevance-auto-approve-2026-12-10', started_at: '2026-12-10T00:00:00.000Z' }
  const kt = (stepAt) => ({
    review_relevance_verdicts: [
      { input_id: 's1', auto_approval_rule: 'rr-v2', auto_approved_at: '2026-12-10T02:00:00.000Z', human_verdict: 'irrelevant', human_product_informative: true, human_graded_at: '2026-12-10T04:30:00Z' },
      { input_id: 's2', auto_approval_rule: 'rr-v2', auto_approved_at: '2026-12-10T04:00:00.000Z', human_verdict: 'irrelevant', human_product_informative: true, human_graded_at: '2026-12-10T04:30:00Z' },
    ],
    agent_runs: [runToday, ...ctxTables.agent_runs],
    agent_run_steps: [{ run_id: 'r5', step_key: 'gate', status: 'blocked', updated_at: stepAt }, ...ctxTables.agent_run_steps],
  })
  const cBefore = await M.loadReleaseContext(fake(kt('2026-12-10T01:00:00.000Z')), { stageSince: sinceT, todayKst: TODAY })
  ok(cBefore.ok && cBefore.trips.length === 0, '(k) 조회: 시각 STAGE_SINCE 이전 blocked(같은 날) 는 안 센다')
  ok(cBefore.ok && M.decideRelease({ ...on, stage: '2', stageSince: T, ctx: cBefore }).limit === 1999, '(k) 조회→판정: 시각 이전 blocked 만 있으면 2단계 그대로(STAGE_SINCE 이후 승인 1건만 센다 → 1999 — v71ds, 이전 02:00 승인 1건은 안 센다)')
  const cAfter = await M.loadReleaseContext(fake(kt('2026-12-10T04:00:00.000Z')), { stageSince: sinceT, todayKst: TODAY })
  ok(cAfter.ok && cAfter.trips.length === 1 && cAfter.trips[0] === '2026-12-10T04:00:00.000Z', '(k) 조회: 시각 전에 시작한 그날 실행이 시각 뒤에 다시 막히면 센다')
  ok(cAfter.ok && M.decideRelease({ ...on, stage: '2', stageSince: T, ctx: cAfter }).limit === 0, '(k) 조회→판정: 시각 이후 blocked → 0건')
  ok(cAfter.ok && cAfter.stageAudits.length === 1, '(k) 단계 감사도 시각 이후 승인분만')
  const cDate = await M.loadReleaseContext(fake(kt('2026-12-10T01:00:00.000Z')), { stageSince: M.parseStageSince(TODAY, TODAY, NOW), todayKst: TODAY })
  ok(cDate.ok && cDate.trips.length === 1, '(k) 날짜만(00:00 KST)이면 같은 blocked 를 센다(기존과 동일)')

  // (j) v71dl 가 — 킬스위치 감사 창 = 승인 가드로 거른 뒤 최근 50건
  const gate = (audits) => A.autoApprovalGate({ enabled: 'true', since: '2026-12-01', now: NOW, audits })
  // ① 창의 가드 밖 오류(github·60자 미만·영역 밖·소비재 각 8건, 가장 최근)는 빠지고 가드 통과 40건(오류 0)만 남아 열린다.
  const outside = [
    ...many(8, { p: 'gh', err: true, src: 'github_issues', day: 9 }), ...many(8, { p: 'sh', err: true, text: 'x'.repeat(59), day: 9 }),
    ...many(8, { p: 'ou', err: true, out: true, day: 9 }), ...many(8, { p: 'tg', err: true, tag: true, day: 9 }),
  ]
  const w1 = await M.loadGuardedAuditWindow(fake(auditTables([...many(40, { p: 'ok', day: 3 }), ...outside])))
  ok(w1.ok && w1.read === 72 && w1.audits.length === 40, `(j) ① 가드 밖 32건 제외 → 창 입력 40건 (${w1.ok ? w1.audits.length : w1.error})`)
  ok(w1.ok && w1.excluded.github_issues === 8 && w1.excluded.short === 8 && w1.excluded['out-area'] === 8 && w1.excluded['consumer-tag'] === 8, `(j) ① 제외 사유별 8건씩 ${w1.ok ? JSON.stringify(w1.excluded) : ''}`)
  ok(w1.ok && gate(w1.audits).on, '(j) ① 창의 GitHub·짧은 글·영역 밖·소비재 오류가 빠져 열린다')
  ok(!gate(auditTables([...many(40, { p: 'ok', day: 3 }), ...outside]).review_relevance_verdicts.filter((r) => r.auto_approval_rule === 'rr-v2')).on, '(j) ① 대조: 거르지 않은 창이면 닫힌다(가드가 차이를 만든다)')
  // 글을 못 읽은 감사 오류는 빼지 않는다(모르는 것을 정상으로 접지 않는다).
  const w1m = await M.loadGuardedAuditWindow(fake(auditTables([...many(40, { p: 'ok', day: 3 }), ...many(8, { p: 'nt', err: true, text: null, day: 9 })])))
  ok(w1m.ok && w1m.audits.length === 48 && !gate(w1m.audits).on, '(j) 본문 없음(가드 판단 불가) 오류 8건은 창에 남아 닫힌다')
  // ② 가드 통과 행 오류 ≥ 8 이면 여전히 닫힌다. 창 50·문턱 8·워밍업 10 불변.
  const w2 = await M.loadGuardedAuditWindow(fake(auditTables([...many(42, { p: 'ok', day: 3 }), ...many(8, { p: 'bad', err: true, day: 9 }), ...many(8, { p: 'gh', err: true, src: 'github_issues', day: 9 })])))
  ok(w2.ok && w2.audits.length === 50 && !gate(w2.audits).on && gate(w2.audits).kill?.state === 'tripped' && gate(w2.audits).kill?.threshold === 8, '(j) ② 가드 통과 50건 중 오류 8건 → 닫힘(문턱 8)')
  const w2b = await M.loadGuardedAuditWindow(fake(auditTables([...many(43, { p: 'ok', day: 3 }), ...many(7, { p: 'bad', err: true, day: 9 })])))
  ok(w2b.ok && gate(w2b.audits).on, '(j) ② 가드 통과 50건 중 오류 7건 → 열림')
  const w2c = await M.loadGuardedAuditWindow(fake(auditTables([...many(50, { p: 'ok', day: 8 }), ...many(8, { p: 'old', err: true, day: 2 })])))
  ok(w2c.ok && w2c.audits.length === 58 && gate(w2c.audits).on && gate(w2c.audits).kill?.n === 50, '(j) ② 창은 최근 50건 — 그 밖 오래된 오류 8건은 안 센다')
  const w2d = await M.loadGuardedAuditWindow(fake(auditTables(many(9, { p: 'bad', err: true, day: 9 }))))
  ok(w2d.ok && gate(w2d.audits).on && gate(w2d.audits).kill?.state === 'warmup', '(j) ② 가드 통과 9건(<10)은 오류여도 워밍업으로 열림')
  const w2e = await M.loadGuardedAuditWindow(fake(auditTables([...many(7, { p: 'ok', day: 3 }), ...many(3, { p: 'bad', err: true, day: 9 })])))
  ok(w2e.ok && !gate(w2e.audits).on, '(j) ② 가드 통과 10건 중 오류 3건 → 닫힘(n=10 문턱 3)')
  ok(gate(null).on === false && !A.autoApprovalGate({ enabled: 'true', since: '2026-12-11', now: NOW, audits: [] }).on, '(j) 감사 조회 실패·AUTO_APPROVAL_SINCE 미래 → 닫힘(불변)')
  for (const t of ['review_relevance_verdicts', 'analysis_inputs', 'analysis_projects', 'consumer_material_tags']) {
    const bad = await M.loadGuardedAuditWindow(fake(auditTables(many(5, { p: 'ok' })), [t]))
    ok(bad.ok === false, `(j) ${t} 조회 실패 → 감사 창 ok:false(게이트 닫힘)`)
  }
  ok((await M.loadGuardedAuditWindow(fake(auditTables([...many(5, { p: 'ok' }), { id: 'gone', at: at(9), noInput: true }])))).ok === false, '(j) 원문 행이 없는 감사(영역을 모름) → ok:false')

  // (l) 표본 배분 — 앱스토어 10 · 구글 플레이 6 · 나머지 14, 모자라면 보충해 총 30
  const P = (src, n) => [...Array(n)].map((_, i) => ({ input_id: `${src}-${String(i).padStart(3, '0')}`, source_key: src }))
  const s1 = M.quotaSample([...P('appstore', 50), ...P('googleplay', 50), ...P('reddit', 30), ...P('hackernews', 20), ...P('devto', 2)], 30, M.GRADUAL.sampleQuotas, 7)
  const d1 = M.countBySource(s1)
  ok(s1.length === 30 && new Set(s1.map((r) => r.input_id)).size === 30, '(l) 표본 30건·중복 없음')
  ok(d1.appstore === 10 && d1.googleplay === 6 && d1.reddit + d1.hackernews + d1.devto === 14 && d1.devto >= 1 && d1.reddit > d1.hackernews, `(l) 앱스토어 10·구글 플레이 6·나머지 14(비례·최소 1) ${JSON.stringify(d1)}`)
  ok(M.GRADUAL.sampleQuotas.appstore === 10 && M.GRADUAL.sampleQuotas.googleplay === 6, '(l) 몫 상수 10·6')
  const s1b = M.quotaSample([...P('appstore', 50), ...P('googleplay', 50), ...P('reddit', 30), ...P('hackernews', 20), ...P('devto', 2)], 30, M.GRADUAL.sampleQuotas, 7)
  ok(s1.map((r) => r.input_id).join() === s1b.map((r) => r.input_id).join(), '(l) 재현 가능(seed)')
  const d2 = M.countBySource(M.quotaSample([...P('appstore', 3), ...P('googleplay', 50), ...P('reddit', 50)], 30))
  ok(d2.appstore === 3 && d2.googleplay === 6 && d2.reddit === 21, `(l) 앱스토어 부족 → 다른 소스로 보충해 30 ${JSON.stringify(d2)}`)
  const d3 = M.countBySource(M.quotaSample([...P('appstore', 50), ...P('googleplay', 2)], 30))
  ok(d3.appstore === 28 && d3.googleplay === 2, `(l) 나머지 소스 없음·구글 부족 → 앱스토어로 채워 30 ${JSON.stringify(d3)}`)
  const d4 = M.countBySource(M.quotaSample([...P('appstore', 4), ...P('googleplay', 4), ...P('reddit', 5)], 30))
  ok(d4.appstore === 4 && d4.googleplay === 4 && d4.reddit === 5, '(l) 모집단이 30 이하면 전부')
  ok(M.quotaSample([], 30).length === 0 && M.quotaSample(P('reddit', 40), 0).length === 0, '(l) 빈 모집단·n=0 → 0건')
  ok(M.quotaSample(P('reddit', 40), 30).length === 30, '(l) 몫 소스가 하나도 없으면 나머지로 30')

  // 판정
  const j = (errs, n) => M.judgeStage([...Array(n)].map((_, i) => (i < errs ? audit('irrelevant', true) : audit('relevant', true))))
  ok(j(4, 30).state === 'pass' && j(5, 30).state === 'stop' && j(0, 29).state === 'insufficient' && j(5, 10).state === 'stop', '판정: 4건 통과 · 5건 멈춤 · 29건 확인 불가')
  ok(M.judgeStage([...Array(30)].map(() => audit('relevant', null))).state === 'insufficient', '판정: 정보 칸 빈 줄은 채점으로 안 센다')
  const many300 = [...Array(300)].map((_, i) => ({ input_id: `id${String(i).padStart(3, '0')}`, source_key: i < 200 ? 'big' : i < 290 ? 'mid' : `tiny${i % 3}` }))
  const st = M.countBySource(M.stratifiedSample(many300, 30, 7))
  ok(st.tiny0 >= 1 && st.tiny1 >= 1 && st.tiny2 >= 1 && st.big > st.mid, '나머지 소스 배분(stratifiedSample): 작은 소스도 1건 이상, 비례')

  if (!quiet) console.table(combos.map(({ 사유, ...x }) => ({ ...x, 사유: 사유.slice(0, 50) })))
  return { pass, fails }
}

let total = 0
const real = await import('../lib/analysis/gradual-release.ts')
const realA = await import('../lib/analysis/auto-approval.ts')
const r = await checks(real, realA)
total += r.pass
for (const f of r.fails) console.error(`✗ ${f}`)
let fail = r.fails.length
const sh = (c, n) => { if (c) total++; else { fail++; console.error(`✗ ${n}`) } }

// (h) 승인 스크립트 정적 순서: 감사 창(가드) → 게이트 닫힘 분기 → 점진 해제 0건 분기 → 풀 조회 → UPDATE. 런키 접두사 일치.
const src = readFileSync(join(ROOT, 'scripts/relevance-auto-approve.mjs'), 'utf8')
const at0 = (s) => src.indexOf(s)
const order = ['loadGuardedAuditWindow(sb)', 'const gate = autoApprovalGate(', 'if (!gate.on) {', 'const release = decideRelease(', 'if (release.limit === 0) {', 'loadApprovalPool(sb, gate.since, process.env.AUTO_APPROVAL_SOURCES)', 'selectRelease(pool.targets, release.limit)', '.update({ auto_approved_at']
const pos = order.map(at0)
sh(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), `(h) 승인 스크립트 순서: ${order.join(' → ')}`)
sh(src.split('.update(').length === 2, '(h) 승인 스크립트의 UPDATE 는 한 곳뿐(점진 해제 선택을 거친다)')
sh(at0('runKey: `relevance-auto-approve-${kstDate()}') > 0 && real.APPROVE_RUN_PREFIX === 'relevance-auto-approve-', '(h) 재걸림 조회 접두사 = 승인 실행 runKey')
sh(!/stepKey: 'gate'[^\n]*status: 'skipped'/.test(src) && /stepKey: 'gradual'/.test(src), "(h) 점진 해제 0건 기록은 'gate' 가 아닌 'gradual' 스텝")
sh(/parseStageSince\(process\.env\.GRADUAL_RELEASE_STAGE_SINCE, todayKst, now\)/.test(src) && /stageSince: process\.env\.GRADUAL_RELEASE_STAGE_SINCE, todayKst, now, ctx/.test(src), '(h) 승인 스크립트가 STAGE_SINCE 를 현재 시각과 함께 판정')
const gd = src.slice(at0('if (gradualDry) {'), at0('const tracker ='))
sh(gd.length > 0 && !/\.update\(|createTracker|recordStatusLog|tracker\./.test(gd) && gd.includes('loadApprovalPool(sb, since, process.env.AUTO_APPROVAL_SOURCES)') && gd.includes('[1, 2, 3, 4, 5]'), '(h) --gradual-dry 는 tracker 전에 끝나고 쓰기 없음·같은 풀 함수·5단계까지')
const wf = readFileSync(join(ROOT, '.github/workflows/nightly-relevance.yml'), 'utf8')
sh(['GRADUAL_RELEASE_ENABLED', 'GRADUAL_RELEASE_STAGE', 'GRADUAL_RELEASE_STAGE_SINCE'].every((k) => wf.includes(`${k}: \${{ vars.${k} || '' }}`)), '(h) 워크플로가 세 변수를 vars 로 읽는다(기본 빈값=꺼짐)')
const bc = readFileSync(join(ROOT, '.github/workflows/build-check.yml'), 'utf8')
sh(/^\s+- run: node scripts\/gradual-release-selftest\.mjs\s*$/m.test(bc), '(h) build-check 에 이 셀프테스트가 등록돼 있다')
for (const t of ['auto-approval-selftest.mjs', 'approval-scope-selftest.mjs']) {
  try { execFileSync(process.execPath, [join(ROOT, 'scripts', t)], { stdio: 'pipe' }); total++ } catch (e) { fail++; console.error(`✗ (h) 기존 ${t} 실패:\n${e.stdout}${e.stderr}`) }
}

// (j) ③ 가드 조건은 한 곳 — 대상 풀과 감사 창이 같은 applyApprovalGuard 를 쓰고, 조건 복사본이 없다(정적).
{
  const g = readFileSync(join(ROOT, 'lib/analysis/gradual-release.ts'), 'utf8')
  const body = (name) => { const i = g.indexOf(`export async function ${name}(`); const k = g.indexOf('\nexport ', i + 1); return i < 0 ? '' : g.slice(i, k < 0 ? undefined : k) }
  const guard = body('applyApprovalGuard'), poolFn = body('loadApprovalPool'), winFn = body('loadGuardedAuditWindow')
  const count = (s, re) => (s.match(re) ?? []).length
  sh(guard.includes('loadScope(sb, ids)') && guard.includes('passesRrV2ContentGuard(x)'), '(j) ③ 가드 정의(영역·소비재 loadScope + 내용 passesRrV2ContentGuard)는 applyApprovalGuard 안')
  sh(count(g, /loadScope\(/g) === 1 && count(g, /passesRrV2ContentGuard\(/g) === 1, '(j) ③ gradual-release.ts 에서 loadScope·passesRrV2ContentGuard 호출은 각 1곳(복사본 없음)')
  sh(poolFn.includes('applyApprovalGuard(sb, agreed.map') && winFn.includes('applyApprovalGuard(sb, rows.map'), '(j) ③ 대상 풀·감사 창이 같은 applyApprovalGuard 를 부른다')
  sh(!/github_issues'|RR_V2_MIN_TEXT|'out-'|consumer_material_tags/.test(poolFn + winFn), '(j) ③ 풀·창 함수 안에 가드 조건 리터럴이 없다')
  const srcNoComments = src.replace(/^\s*\/\/.*$/gm, '')
  sh(srcNoComments.includes('audits: aw.ok ? aw.audits : null') && !/human_graded_at|loadScope\(|passesRrV2ContentGuard\(|'github_issues'|'out-'|consumer_material_tags/.test(srcNoComments), '(j) ③ 승인 스크립트는 감사 조회·가드를 직접 하지 않고 loadGuardedAuditWindow 결과만 게이트에 넣는다')
  const aa = readFileSync(join(ROOT, 'lib/analysis/auto-approval.ts'), 'utf8')
  sh(/export const RR_V2_MIN_TEXT = 60\b/.test(aa) && /window: 50,/.test(aa) && /minAudits: 10,/.test(aa) && /p0: 0\.07,/.test(aa), '(j) ③ 가드 60자·창 50·워밍업 10·p0 7% 상수 불변(문턱 8)')
}

// 표본 파일 형식이 relevance-grading-import.mjs 파서로 되돌아가는가(머리글·행 모양은 표본 스크립트 원문 그대로).
{
  const { parseGradingMarkdown } = await import('../lib/analysis/relevance-judge.ts')
  const ss = readFileSync(join(ROOT, 'scripts/gradual-release-sample.mjs'), 'utf8')
  const HEAD = '| # | 프로젝트 | 리뷰 원문 | 한국어 뜻 | 관련 ☐ | 무관 ☐ | 모름 ☐ | 정보있음 ☐ | 정보없음 ☐ | 소스 | 키 |'
  const ROW = '| 한국어 뜻: (오케스트레이터가 채움) | ☐ | ☐ | ☐ | ☐ | ☐ | ${md(r.source_key)} | \\`${r.input_id}\\` |'
  sh(ss.includes(HEAD) && ss.includes(ROW) && !/모델 판정/.test(ss.split(HEAD)[1] ?? 'x'), '표본: 감사 표 머리글·한국어 뜻 칸·모델 판정 가림·전체 uuid 키')
  sh(!/verdict, second_verdict|product_informative, second/.test(ss), '표본: 모델 판정 열을 아예 읽지 않는다')
  const U = '0a1b2c3d-1111-4222-8333-444455556666'
  const p = parseGradingMarkdown([HEAD, '|---|', `| 1 | p | t | 한국어 뜻: (오케스트레이터가 채움) | ☐ | x | ☐ | x | ☐ | reddit | \`${U}\` |`].join('\n'))
  sh(p.marks.length === 1 && p.marks[0].input_id === U && p.marks[0].verdict === 'irrelevant' && p.marks[0].product_informative === true, '표본: import 파서가 관련·정보 칸을 읽는다')
  sh(/감사 창에 들어간다/.test(ss), '표본: 머리 주석에 rr-v2 감사 창 편입을 적는다')
  sh(ss.includes('quotaSample(pool, GRADUAL.sampleSize, GRADUAL.sampleQuotas, seed)') && !ss.includes('stratifiedSample('), '표본: 배분은 quotaSample(앱스토어·구글 플레이 몫) 한 곳')
  sh(ss.includes('const { start, end } = kstDayRange(until)') && !/kstDayRange\(since\)/.test(ss), '표본: 모집단 = 그날(KST) 승인분(단계 시작일부터가 아니다)')
  const jd = readFileSync(join(ROOT, 'scripts/gradual-release-judge.mjs'), 'utf8')
  const head = /<!-- gradual-release stage=([1-5]) since=(\d{4}-\d{2}-\d{2}(?:T[0-9:.]+Z)?) until=(\d{4}-\d{2}-\d{2})/
  sh(jd.includes(head.source) && head.test('<!-- gradual-release stage=5 since=2026-12-10T03:00:00Z until=2026-12-10 seed=42 -->') && head.test('<!-- gradual-release stage=2 since=2026-12-01 until=2026-12-02 seed=42 -->'), '판정 스크립트: 머리 주석 5단계·시각 since 를 읽는다')
}

// (i) 변이 — 가드·안전 분기·문턱을 일부러 깨면 위 검사가 실패해야 한다. 세 모듈을 임시 폴더에 복사해 한 곳만 바꾼다.
const LIB = join(ROOT, 'lib/analysis')
const libUrl = pathToFileURL(LIB + '/').href
const FILES = { G: 'gradual-release.ts', A: 'auto-approval.ts', S: 'approval-scope.ts' }
const KEEP = new Set(Object.values(FILES))
const orig = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(LIB, f), 'utf8')]))
const base = mkdtempSync(join(tmpdir(), 'gradual-mut-'))
const mutants = [
  ['G', '내용 가드 우회', 'if (!passesRrV2ContentGuard(x)) {', 'if (false) {'],
  ['G', '기능 꺼짐 안전 분기 제거', 'if (!base.enabled) return', 'if (false) return'],
  ['G', '이 단계 승인 수 무시', 'const limit = remainingInStage(cap, approvedInStage)', 'const limit = cap'],
  ['G', 'STAGE_SINCE 이전 승인도 센다', ".eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', stageStart.toISOString()).order('input_id'))", ".eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', '2000-01-01T00:00:00Z').order('input_id'))"],
  ['G', '재걸림 무시', 'if (trips.length > 0) {', 'if (false) {'],
  ['G', '영역·소비재 제외 우회', 'new Map<string, GuardReason>(scope.excluded)', 'new Map<string, GuardReason>()'],
  ['G', '감사 창 가드 미적용', 'if (why && AUDIT_WINDOW_EXCLUDE.has(why))', 'if (false)'],
  ['G', '감사 창 github 제외 누락', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['out-area', 'consumer-tag', 'short']"],
  ['G', '감사 창 60자 제외 누락', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['out-area', 'consumer-tag', 'github_issues']"],
  ['G', '감사 창 영역 밖 제외 누락', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['consumer-tag', 'github_issues', 'short']"],
  ['G', '감사 창 소비재 제외 누락', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['out-area', 'github_issues', 'short']"],
  ['G', '감사 창이 본문 없음도 뺀다(열리는 쪽 접기)', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['out-area', 'consumer-tag', 'github_issues', 'short', 'missing']"],
  ['G', '2단계 상한 변경', '2: 2000,', '2: 1500,'],
  ['G', '4단계 무제한', '4: 5000,', '4: Infinity,'],
  ['G', '6단계 허용', 'return /^[1-5]$/.test(s)', 'return /^[1-6]$/.test(s)'],
  ['G', 'STAGE_SINCE 이전 재걸림도 셈', 'return !Number.isFinite(x) || x >= sinceAt.getTime()', 'return true'],
  ['G', 'step 시각 조건 제거', ".eq('status', 'blocked').gte('updated_at', stageStart.toISOString())", ".eq('status', 'blocked')"],
  ['G', '실행 범위를 STAGE_SINCE 시각으로 좁힘', ".gte('started_at', runsFrom.toISOString())", ".gte('started_at', stageStart.toISOString())"],
  ['G', '미래 시각 허용', 'return u.getTime() <= now.getTime() ? u : null', 'return u'],
  ['G', '오프셋 시각 허용', ')?)?Z$/.exec(s)', ')?)?(Z|[+-]\\d{2}:\\d{2})$/.exec(s)'],
  ['G', '표본 몫 무시', 'Math.max(0, Math.min(q, n - picked.length))', '0'],
  ['G', '표본 보충 없음', 'if (picked.length < n) {', 'if (false) {'],
  ['A', 'github 가드 누락', "if (r.source_key === 'github_issues') return false", ''],
  ['A', '60자 문턱 변경', 'export const RR_V2_MIN_TEXT = 60', 'export const RR_V2_MIN_TEXT = 50'],
  ['A', '문턱 비교 완화(>=→>)', 'if (threshold !== null && errors >= threshold)', 'if (threshold !== null && errors > threshold)'],
  ['A', '창 크기 50→60', 'window: 50,', 'window: 60,'],
  ['A', '워밍업 10→5', 'minAudits: 10,', 'minAudits: 5,'],
  ['A', 'p0 7%→9%(문턱 8→9)', 'p0: 0.07,', 'p0: 0.09,'],
  ['S', '소비재 태그 누락', "if (consumerTagged) return 'consumer-tag'", ''],
  ['S', '영역 밖 접두사 변경', "export const OUT_AREA_PREFIX = 'out-'", "export const OUT_AREA_PREFIX = 'zzz-'"],
]
const mutResults = []
for (const [i, [file, name, from, to]] of mutants.entries()) {
  if (!orig[file].includes(from)) { fail++; console.error(`✗ (i) 변이 지점 없음: ${name}`); continue }
  const dir = join(base, `m${i}`)
  mkdirSync(dir)
  for (const [k, f] of Object.entries(FILES)) {
    const text = (k === file ? orig[k].replace(from, to) : orig[k]).replace(/from '\.\/([^']+)'/g, (m, dep) => (KEEP.has(dep) ? m : `from '${libUrl}${dep}'`))
    writeFileSync(join(dir, f), text)
  }
  let m
  try {
    m = await checks(await import(pathToFileURL(join(dir, FILES.G)).href), await import(pathToFileURL(join(dir, FILES.A)).href), { quiet: true })
  } catch (e) {
    m = { fails: [`예외 ${e.message}`] }
  }
  mutResults.push({ 변이: `${FILES[file]} · ${name}`, 잡힌검사: m.fails.length, 예: (m.fails[0] ?? '').slice(0, 60) })
  sh(m.fails.length > 0, `(i) 변이 "${name}" 를 검사가 잡는다(${m.fails.length}건 실패)`)
}
console.table(mutResults)

console.log(`gradual-release selftest: ${total} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
