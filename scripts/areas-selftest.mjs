#!/usr/bin/env node
// config/areas.json · lib/analysis/areas-config.ts 셀프테스트 — 네트워크·DB 없음.
// 보는 것: 실제 설정이 읽히고 어휘가 DB CHECK(마이그 20261009000020)와 같다 · founder 목록이 소급 규칙 v37-1 SQL 과 같고 devto 가 없다 ·
//          env 최소량 덮어쓰기(틀린 값은 경고 뒤 설정값) · 형식 오류는 cfg=null(안전한 기본값 = 영역 축 끔).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { AREA_CODES, loadAreasConfig, parseAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'
import { areaFloorLine, areaRank, loadAreaContext, orderByAreaDeficit, planAreaOrder } from '../lib/analysis/area-priority.ts'
import { compareAutoPriority } from '../lib/analysis/extract-auto.ts'
import { AUTO_EXTRACT_STATUSES } from '../lib/analysis/extract-gate.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const throws = (name, fn, re) => {
  try {
    fn()
    t(`${name} (던져야 한다)`, 'no throw', String(re))
  } catch (e) {
    t(name, re.test(e.message), true)
  }
}

const CFG_PATH = path.join(process.cwd(), 'config', 'areas.json')
const RAW = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))
const clone = () => JSON.parse(JSON.stringify(RAW))

// ── C0: 실제 설정 ────────────────────────────────────────────────
{
  const { cfg, error, warnings } = loadAreasConfig(CFG_PATH, {})
  t('실제 설정: 읽힘 · 경고 0', [error, warnings], [null, []])
  t('실제 설정: 코드·순서', cfg.areas.map((a) => a.code), ['1', '2', '3', '4', '5', 'design', 'hold', 'out-consumer', 'out-founder'])
  t('실제 설정: 최소량 대상 = 1~5·design', scorableAreas(cfg).map((a) => a.code), ['1', '2', '3', '4', '5', 'design'])
  t('실제 설정: hold 비활성·kind hold · 영역 외 둘은 out', cfg.areas.filter((a) => !a.active).map((a) => `${a.code}:${a.kind}`), ['hold:hold', 'out-consumer:out', 'out-founder:out'])
  t('실제 설정: floor 200(설정)', [cfg.floor, cfg.floorSource], [200, 'config'])
  t('실제 설정: founder 5곳 · devto 없음(남헌 판단 대기)', [cfg.founderSources, cfg.founderSources.includes('devto')], [['hackernews', 'indiehackers', 'producthunt', 'disquiet', 'okky'], false])
  t('실제 설정: 포기 기준은 제안값', [cfg.abandon.status, cfg.abandon.minProjects, cfg.abandon.projectInputMin, cfg.abandon.minRelevantPct, cfg.abandon.grayBandPct, cfg.abandon.maxUnknownPct, cfg.abandon.minMedianInputs, cfg.abandon.immediateSwapRelevantPct],
    ['proposed', 3, 100, 30, [25, 35], 20, 50, 10])
  t('실제 설정: 표시명에 원문 범위 문구', [cfg.areas[2].name.includes('직접 도구만'), cfg.areas[3].name.includes('채용 제외')], [true, true])
}

// ── DB 어휘·소급 규칙과 대조(설정과 DB 가 갈라지면 여기서 잡힌다) ──
{
  const mig = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261009000020_analysis_projects_area.sql'), 'utf8')
  const check = /area_code IS NULL OR area_code IN \(([^)]*)\)/.exec(mig)
  const vocab = check ? [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : null
  t('DB CHECK 어휘 = AREA_CODES = 설정 코드', [vocab, [...AREA_CODES]], [RAW.areas.map((a) => a.code), RAW.areas.map((a) => a.code)])
  const founder = /coalesce\(source_key IN \(([^)]*)\), false\)/.exec(mig)
  t('소급 v37-1 founder 목록 = 설정', founder ? [...founder[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : null, RAW.founder_sources)

  // 커버리지 뷰(U3)가 SQL 에 품은 값 = 설정·코드 값. 한쪽만 바꾸면 여기서 잡힌다.
  const view = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261009000040_area_t2_coverage_view.sql'), 'utf8')
  t('뷰 projects_100plus 문턱 = abandon.project_input_min', Number(/FILTER \(WHERE inputs >= (\d+)\)\)::int\s+AS projects_100plus/.exec(view)?.[1]), RAW.abandon.project_input_min)
  const st = /FILTER \(WHERE status IN \(([^)]*)\)\)/.exec(view)
  t('뷰 대기량 상태 = AUTO_EXTRACT_STATUSES', st ? [...st[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : null, AUTO_EXTRACT_STATUSES)
  const judge = fs.readFileSync(path.join(process.cwd(), 'scripts', 'relevance-judge-auto.mjs'), 'utf8')
  t('뷰 표본 천장 = RELEVANCE_SAMPLE 기본', Number(/least\(inputs, (\d+)\)/.exec(view)?.[1]), Number(/num\(process\.env\.RELEVANCE_SAMPLE, (\d+)\)/.exec(judge)?.[1]))
}

// ── env 최소량 ───────────────────────────────────────────────────
{
  const a = parseAreasConfig(clone(), { RELEVANCE_AREA_FLOOR: '150' })
  t('env 150 → floor 150(env)', [a.cfg.floor, a.cfg.floorSource, a.warnings], [150, 'env', []])
  const b = parseAreasConfig(clone(), { RELEVANCE_AREA_FLOOR: '' })
  t('env 빈 문자열(워크플로 기본) → 설정값', [b.cfg.floor, b.cfg.floorSource, b.warnings.length], [200, 'config', 0])
  for (const bad of ['0', '-5', '12.5', 'abc']) {
    const c = parseAreasConfig(clone(), { RELEVANCE_AREA_FLOOR: bad })
    t(`env '${bad}' → 경고 + 설정값`, [c.cfg.floor, c.cfg.floorSource, c.warnings.length], [200, 'config', 1])
  }
}

// ── 형식 오류는 던진다 → load 는 cfg=null ─────────────────────────
{
  const mut = (f) => { const r = clone(); f(r); return r }
  throws('코드 누락', () => parseAreasConfig(mut((r) => r.areas.splice(1, 1))), /설정에 없는 코드: 2/)
  throws('어휘 밖 코드(6)', () => parseAreasConfig(mut((r) => { r.areas[0].code = '6' })), /어휘 밖/)
  throws('코드 중복', () => parseAreasConfig(mut((r) => r.areas.push({ ...r.areas[0] }))), /중복/)
  throws('hold 활성화 금지', () => parseAreasConfig(mut((r) => { r.areas.find((a) => a.code === 'hold').active = true })), /hold/)
  throws('영역 외를 영역으로 금지', () => parseAreasConfig(mut((r) => { r.areas.find((a) => a.code === 'out-founder').kind = 'area' })), /out-founder/)
  throws('kind 어휘 밖', () => parseAreasConfig(mut((r) => { r.areas[0].kind = 'x' })), /kind/)
  throws('표시명 빈 값', () => parseAreasConfig(mut((r) => { r.areas[0].name = ' ' })), /name/)
  throws('floor 0', () => parseAreasConfig(mut((r) => { r.floor = 0 })), /floor/)
  throws('founder 빈 배열', () => parseAreasConfig(mut((r) => { r.founder_sources = [] })), /founder_sources/)
  throws('abandon 없음', () => parseAreasConfig(mut((r) => { delete r.abandon })), /abandon/)
  throws('관련 비율 101', () => parseAreasConfig(mut((r) => { r.abandon.min_relevant_pct = 101 })), /min_relevant_pct/)
  throws('회색 띠 뒤집힘', () => parseAreasConfig(mut((r) => { r.abandon.gray_band_pct = [35, 25] })), /gray_band_pct/)
  throws('기준이 회색 띠 밖', () => parseAreasConfig(mut((r) => { r.abandon.min_relevant_pct = 40 })), /회색 띠/)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'areas-cfg-'))
  const missing = loadAreasConfig(path.join(tmp, 'none.json'), {})
  t('파일 없음 → cfg null + error(확인 불가)', [missing.cfg, typeof missing.error], [null, 'string'])
  fs.writeFileSync(path.join(tmp, 'bad.json'), '{ not json')
  const bad = loadAreasConfig(path.join(tmp, 'bad.json'), {})
  t('JSON 깨짐 → cfg null + error', [bad.cfg, typeof bad.error], [null, 'string'])
  fs.writeFileSync(path.join(tmp, 'mut.json'), JSON.stringify(mut((r) => { r.areas[0].code = '6' })))
  t('어휘 밖 파일 → cfg null', loadAreasConfig(path.join(tmp, 'mut.json'), {}).cfg, null)
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ── U1: 영역 결손 순위(lib/analysis/area-priority.ts) ─────────────
{
  const { cfg } = loadAreasConfig(CFG_PATH, {})
  const SAAS = 'SAAS'
  const P = (projectId, newInputs, saas = false) => ({ projectId, newInputs, businessModel: saas ? SAAS : 'consumer' })
  const order = (cands, areas, judged) => orderByAreaDeficit(cands, (id) => areas[id] ?? 'unassigned', judged, cfg).map((c) => c.projectId)

  {
    const areas = { a1: '1', b2: '2', chold: 'hold', dfound: 'out-founder', e3: '3', fnone: 'unassigned', gdesign: 'design' }
    const judged = { 1: 54, 2: 400, 3: 0, design: 300 }
    const got = order([P('b2', 150, true), P('chold', 300, true), P('dfound', 80, true), P('a1', 100), P('e3', 50), P('fnone', 500), P('gdesign', 20)], areas, judged)
    // e3(결손 200·공급 50)·a1(결손 146·공급 100) 둘 다 공급 부족 결손 → 결손 큰 순. 충족 영역보다는 앞.
    t('결손(공급 부족 칸끼리 결손 큰 순) → 충족 → 영역 외 → hold', got, ['e3', 'a1', 'b2', 'gdesign', 'dfound', 'fnone', 'chold'])
    t('결손 영역 소비재가 충족 영역 SaaS 보다 앞', got.indexOf('a1') < got.indexOf('b2'), true)
    t('hold 맨 뒤(SaaS·미판정 많아도)', got.at(-1), 'chold')
  }
  {
    // 탐욕: 영역 1 의 첫 프로젝트가 최소량을 채우면 둘째는 충족 칸으로 내려가고, 결손이 남은 영역 4(공급 부족)가 먼저 온다.
    const areas = { p1: '1', p2: '1', q4: '4' }
    t('탐욕: 고른 만큼 판정 수를 더해 다음 결손 영역으로', order([P('p1', 200), P('p2', 200), P('q4', 10)], areas, { 1: 0, 4: 100 }), ['p1', 'q4', 'p2'])
    // 새 규칙: 영역 1(결손 200·공급 100)과 4(결손 100·공급 10) 모두 공급 부족 칸 → 결손 큰 순. p1 뒤에도 1 의 결손(150)이 4(100)보다 커서 이어진다.
    t('탐욕: 공급 부족 칸끼리는 결손 큰 순 — 같은 영역이 이어질 수 있다', order([P('p1', 50), P('p2', 50), P('q4', 10)], areas, { 1: 0, 4: 100 }), ['p1', 'p2', 'q4'])
    // 공급 충분한 결손(4: 결손 100·공급 150)이 공급 부족 결손(2: 결손 200·공급 2)보다 먼저 — 결손이 더 작아도.
    t('공급 충분한 결손 > 공급 부족 결손(결손이 더 커도)', order([P('two', 2, true), P('four', 150)], { two: '2', four: '4' }, { 2: 0, 4: 100 }), ['four', 'two'])
    // 결손 칸 안: 미판정 큰 프로젝트 먼저(SaaS 보다 앞) — 슬롯당 판정 수
    t('결손 칸 안 미판정 큰 순(SaaS 보다 우선)', order([P('s', 40, true), P('big', 180)], { s: '1', big: '1' }, { 1: 0 }), ['big', 's'])
  }
  {
    // 점검자 모의(판정 ① 150 · ② 0 · ③ 0 · ④ 100 · ⑤ 400 · design 0). 프로젝트 미판정 분포는 이 테스트가 정한 것.
    const areas = { a: '1', b: '1', c: '2', d: '3', e: '3', f: '4', g: '4', h: '5', i: 'design' }
    const cands = [P('a', 120), P('b', 90), P('c', 2), P('d', 30), P('e', 20), P('f', 150), P('g', 80), P('h', 200), P('i', 40)]
    const judged = { 1: 150, 2: 0, 3: 0, 4: 100, 5: 400, design: 0 }
    // 옛 규칙(개선 전 커밋 6133595): 결손 > 충족 > 영역 외 > hold, 결손끼리 결손 큰 순, 그다음 compareAutoPriority. 탐욕.
    const oldOrder = () => {
      const proj = { ...judged }
      const left = [...cands]
      const out = []
      const rk = (c) => { const n = proj[areas[c.projectId]] ?? 0; return n < cfg.floor ? [0, cfg.floor - n] : [1, 0] }
      while (left.length) {
        left.sort((x, y) => rk(x)[0] - rk(y)[0] || rk(y)[1] - rk(x)[1] || compareAutoPriority(x, y))
        const c = left.shift()
        out.push(c)
        proj[areas[c.projectId]] = (proj[areas[c.projectId]] ?? 0) + c.newInputs
      }
      return out
    }
    const fill = (picks) => {
      const proj = { ...judged }
      let total = 0, toDeficit = 0
      for (const c of picks.slice(0, 5)) {
        const a = areas[c.projectId]
        total += c.newInputs
        toDeficit += Math.max(0, Math.min(c.newInputs, cfg.floor - (proj[a] ?? 0)))
        proj[a] = (proj[a] ?? 0) + c.newInputs
      }
      return { total, toDeficit, ids: picks.slice(0, 5).map((c) => c.projectId) }
    }
    const before = fill(oldOrder())
    const after = fill(orderByAreaDeficit(cands, (id) => areas[id], judged, cfg))
    t('모의 5슬롯: 옛 규칙', before, { total: 242, toDeficit: 192, ids: ['i', 'd', 'c', 'e', 'f'] })
    t('모의 5슬롯: 새 규칙 — 공급 충분한 ④·① 먼저, ②(2건)는 맨 뒤', after, { total: 342, toDeficit: 222, ids: ['f', 'a', 'i', 'd', 'c'] })
    t('모의: 판정 수·결손 채움 모두 개선', [after.total > before.total, after.toDeficit > before.toDeficit], [true, true])
  }
  {
    // 실제 DB 값(오케스트레이터 2026-10-09): 판정 ①54 ②0 ③0 ④0 ⑤200 design400 out-consumer1,763 out-founder2,263 hold0.
    // 미판정(후보 상태): ①1,822/13 ②2/1 ③580/1 ④1,038/14 ⑤2,921/3 design650/3 hold594/9 out-consumer15,320/12 out-founder29,583/52.
    // 프로젝트별 분포는 리포에 없다 → 합계를 n 개로 n,n-1,…,1 비례 분할(가정). 판정 대기 = min(미판정, 표본 200).
    const SPEC = { 1: [1822, 13], 2: [2, 1], 3: [580, 1], 4: [1038, 14], 5: [2921, 3], design: [650, 3], hold: [594, 9], 'out-consumer': [15320, 12], 'out-founder': [29583, 52] }
    const areas = {}
    const cands = []
    for (const [a, [total, n]] of Object.entries(SPEC)) {
      const wsum = (n * (n + 1)) / 2
      for (let i = 0; i < n; i++) {
        const id = `${a}#${String(i).padStart(2, '0')}`
        areas[id] = a
        cands.push(P(id, Math.min(200, Math.round((total * (n - i)) / wsum))))
      }
    }
    const judged = { 1: 54, 2: 0, 3: 0, 4: 0, 5: 200, design: 400, 'out-consumer': 1763, 'out-founder': 2263, hold: 0 }
    const got = orderByAreaDeficit(cands, (id) => areas[id], judged, cfg)
    const top5 = got.slice(0, 5).map((c) => `${c.projectId}:${c.newInputs}`)
    t('실 DB 하루 5슬롯: ③ 580건 프로젝트 → ④ 최대(138, ④ 결손 62 로 줄어듦) → ① 최대(결손 146) → ④ 다음(129) · ②(2건)는 맨 뒤', top5, ['3#00:200', '4#00:138', '1#00:200', '4#01:129', '2#00:2'])
    t('실 DB: ② 는 ③·④·① 결손 프로젝트 뒤', got.findIndex((c) => c.projectId === '2#00') > got.findIndex((c) => c.projectId === '1#00'), true)
  }
  {
    // 같은 칸 동률 → 기존 규칙(compareAutoPriority): SaaS → 미판정 많은 순 → id
    const areas = { x: '5', y: '5', z: '5', w: '5' }
    t('동률: 기존 규칙 SaaS → 많은 순 → id', order([P('z', 10), P('y', 30), P('x', 30), P('w', 5, true)], areas, { 5: 1000 }), ['w', 'x', 'y', 'z'])
    const cands = [P('m', 3), P('k', 9, true), P('j', 9)]
    t('영역 정보가 전부 없으면 기존 정렬과 같다', order(cands, {}, {}), [...cands].sort(compareAutoPriority).map((c) => c.projectId))
  }
  t('areaRank: hold 4 · out 3 · 미부여 3 · 결손(공급 모름) 0 · 공급 충분 0 · 공급 부족 1 · 충족 2',
    [areaRank('hold', 0, cfg), areaRank('out-consumer', 0, cfg), areaRank('unassigned', 0, cfg), areaRank('3', 199, cfg), areaRank('3', 150, cfg, 50), areaRank('3', 150, cfg, 49), areaRank('3', 200, cfg, 0)],
    [4, 3, 3, 0, 0, 1, 2])

  // 2) 안전: planAreaOrder — 예외·확인 불가면 축 끔 + 사유 + 기존 순서로 후퇴
  {
    const cands = [P('m', 3), P('k', 9, true), P('j', 9)]
    const legacy = [...cands].sort(compareAutoPriority).map((c) => c.projectId)
    const ws = []
    const w = (m) => ws.push(m)
    const okCtx = { column: 'present', byProject: new Map([['m', { code: '1', via: 'column' }]]), judged: {} }
    const on = await planAreaOrder({ cfg, load: async () => okCtx, cands, warn: w })
    t('plan: 정상 → 축 on · 결손 영역 m 먼저', [on.axis, on.reason, on.ordered[0].projectId], ['on', null, 'm'])
    const thrown = await planAreaOrder({ cfg, load: async () => { throw new Error('socket hang up') }, cands, warn: w })
    t('plan: 조회 예외 → off · 사유 · 기존 순서 · 경고', [thrown.axis, /socket hang up/.test(thrown.reason), thrown.ordered.map((c) => c.projectId), ws.length], ['off', true, legacy, 1])
    const badCtx = { column: 'present', byProject: { get: () => { throw new Error('map broken') } }, judged: {} }
    const sortThrow = await planAreaOrder({ cfg, load: async () => badCtx, cands, warn: w })
    t('plan: 정렬 중 예외 → off · 기존 순서', [sortThrow.axis, /map broken/.test(sortThrow.reason), sortThrow.ordered.map((c) => c.projectId)], ['off', true, legacy])
    const nul = await planAreaOrder({ cfg, load: async () => null, cands, warn: w })
    t('plan: 맥락 확인 불가(null) → off', [nul.axis, nul.ordered.map((c) => c.projectId)], ['off', legacy])
    const noCfg = await planAreaOrder({ cfg: null, load: async () => { throw new Error('불리면 안 됨') }, cands, warn: w })
    t('plan: 설정 없음 → off · 조회 안 함', [noCfg.axis, noCfg.reason], ['off', '영역 설정 확인 불가'])
  }
  t('floor 줄', areaFloorLine({ 1: 54, 2: 400 }, cfg), '1 54/200(결손) · 2 400/200 · 3 0/200(결손) · 4 0/200(결손) · 5 0/200(결손) · design 0/200(결손)')

  // loadAreaContext — 모의 supabase(체인: select·not·order·range). fail[테이블] = (cols) => error|null
  const mockSb = (tables, fail = {}) => ({
    from(name) {
      let cols = ''
      const filters = []
      const q = {
        select: (c) => ((cols = c), q),
        order: () => q,
        not: (c) => (filters.push((r) => r[c] != null), q),
        range: async (a, b) => {
          const err = fail[name]?.(cols)
          if (err) return { data: null, error: err }
          const keys = cols.split(',').map((s) => s.trim())
          const rows = (tables[name] ?? []).filter((r) => filters.every((f) => f(r))).map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])))
          return { data: rows.slice(a, b + 1), error: null }
        },
      }
      return q
    },
  })
  const tables = () => ({
    analysis_projects: [{ id: 'p1', area_code: '1' }, { id: 'p2', area_code: null }, { id: 'p3', area_code: null }, { id: 'p4', area_code: null }, { id: 'p5', area_code: 'hold' }],
    review_targets: [
      { id: 't1', project_id: 'p2', label: '2:gong' }, { id: 't2', project_id: 'p2', label: '2:us|gong' },
      { id: 't3', project_id: 'p3', label: '1:otter-ai' }, { id: 't4', project_id: 'p3', label: '3:jasper' },
      { id: 't5', project_id: 'p4', label: 'q:crm' }, { id: 't6', project_id: null, label: '4:flex' },
      { id: 't7', project_id: 'p1', label: '3:wrong-but-column-wins' },
    ],
    review_relevance_verdicts: [
      ...Array.from({ length: 3 }, (_, i) => ({ input_id: `a${i}`, project_id: 'p1' })),
      ...Array.from({ length: 2 }, (_, i) => ({ input_id: `b${i}`, project_id: 'p2' })),
      { input_id: 'c0', project_id: 'p3' }, { input_id: 'd0', project_id: 'p5' },
    ],
  })
  const warns = []
  const w = (m) => warns.push(m)
  const ctx = await loadAreaContext(mockSb(tables()), w)
  const view = (c) => Object.fromEntries([...c.byProject].map(([k, v]) => [k, `${v.code}/${v.via}`]))
  t('열 있음: 열 우선 · NULL 은 라벨 폴백(us| 같은 영역) · 갈림=mixed · 접두 없음=none', [ctx.column, view(ctx)],
    ['present', { p1: '1/column', p5: 'hold/column', p2: '2/label', p3: 'unassigned/mixed', p4: 'unassigned/none' }])
  t('영역별 판정 수 = 프로젝트→영역 집계(미부여 제외)', ctx.judged, { 1: 3, hold: 1, 2: 2 })
  t('열 있음: 경고 0', warns.length, 0)

  warns.length = 0
  const missingCol = { analysis_projects: (c) => (c.includes('area_code') ? { code: '42703', message: 'column analysis_projects.area_code does not exist' } : null) }
  const ctx2 = await loadAreaContext(mockSb(tables(), missingCol), w)
  t('열 부재(42703): 전부 라벨 폴백 + 경고', [ctx2.column, view(ctx2), warns.some((m) => m.includes('42703'))],
    ['absent', { p1: '3/label', p2: '2/label', p3: 'unassigned/mixed', p4: 'unassigned/none', p5: 'unassigned/none' }, true])

  warns.length = 0
  t('판정 수 조회 실패 → null(영역 축 끔)', [await loadAreaContext(mockSb(tables(), { review_relevance_verdicts: () => ({ message: 'boom' }) }), w), warns.length], [null, 1])
  warns.length = 0
  t('프로젝트 조회 실패(42703 아님) → null', await loadAreaContext(mockSb(tables(), { analysis_projects: () => ({ code: '57014', message: 'timeout' }) }), w), null)
  warns.length = 0
  const ctx3 = await loadAreaContext(mockSb(tables(), { review_targets: () => ({ message: 'boom' }) }), w)
  t('라벨 조회 실패 → 미부여 프로젝트는 unknown(영역 외 칸) · 열 영역은 유지', [view(ctx3).p1, view(ctx3).p2, warns.length], ['1/column', 'unassigned/unknown', 1])
}

console.log(`areas-selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
