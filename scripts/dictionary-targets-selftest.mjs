#!/usr/bin/env node
// scripts/dictionary-targets.mjs 셀프테스트 — 네트워크·DB 없음. 가짜 DB 포트(메모리)로 돈다.
// 보는 것: 드라이런 쓰기 0 · --run 멱등 · 소스 가드(꺼짐·행 없음·robots 3상태×override) · 잘못된 ref 거름 · 중단 시 집계 ·
//          '확인' 외 상태 미투입 · --max · --unit=area · --unit 을 바꿔도 같은 앱을 두 번 넣지 않음 ·
//          실제 사전 ①·⑦ 의 계획 수치(보고서 표와 같은 값)와 invalid_ref 0.

import { main, plan, loadAreas, summarize } from './dictionary-targets.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

const ON = { enabled: true, robots_status: 'disallowed', override: 'owner_2026-10-05' }

/** 메모리 DB. 쓰기 횟수를 센다. UNIQUE (project_id, source_key, product_ref) 는 23505 → 'exists'. */
function fakeDb(sources) {
  const db = { projects: [], targets: [], writes: 0 }
  db.port = {
    loadSources: async (keys) => Object.fromEntries(keys.filter((k) => sources[k]).map((k) => [k, sources[k]])),
    loadExisting: async (keys) => new Set(db.targets.filter((r) => keys.includes(r.source_key)).map((r) => `${r.source_key}|${r.product_ref}`)),
    findProjectsByPitch: async (pitches) => new Map(db.projects.filter((p) => pitches.includes(p.product_elevator_pitch)).map((p) => [p.product_elevator_pitch, p.id])),
    insertProject: async (row) => {
      db.writes++
      const id = `p${db.projects.length + 1}`
      db.projects.push({ id, ...row })
      return id
    },
    insertTarget: async (row) => {
      db.writes++
      if (db.targets.some((r) => r.project_id === row.project_id && r.source_key === row.source_key && r.product_ref === row.product_ref)) return 'exists'
      db.targets.push(row)
      return 'inserted'
    },
  }
  return db
}

// ── 합성 사전 ────────────────────────────────────────────────────
const cell = (status, id) => ({ status, id })
const AREA = {
  area: '99-test',
  area_ko: '테스트',
  file: 'area-99-test.json',
  products: [
    { slug: 'a', name: 'A', region: 'global', official_url: 'https://a.example', summary_ko: 'a', sources: { appstore: cell('확인', '111'), googleplay: cell('확인', 'com.a.app') } },
    { slug: 'b', name: 'B', name_ko: '비', region: 'kr', official_url: null, summary_ko: 'b', sources: { appstore: cell('미발견', null), googleplay: cell('확인 불가', null) } },
    { slug: 'c', name: 'C', region: 'kr', summary_ko: 'c', sources: { appstore: cell('확인', 'id999'), googleplay: cell('확인', 'not a pkg') } }, // 잘못된 ref 둘
    { slug: 'd', name: 'D', region: 'kr', summary_ko: 'd', sources: { appstore: cell('확인', '111'), googleplay: cell('검색어', null) } }, // a 와 같은 앱 ID
  ],
}
const base = { sources: ['appstore', 'googleplay'], unit: 'product', globalUs: false, max: 100, offline: false, existing: new Set() }
const skipsOf = (items) => items.map((i) => `${i.slug}/${i.source}/${i.skip ?? 'insert'}`)

// 가드·상태·ref
{
  const items = plan([AREA], { ...base, sourceRows: { appstore: ON, googleplay: ON } })
  t('상태·ref·중복 판정', skipsOf(items), [
    'a/appstore/insert', 'a/googleplay/insert',
    'b/appstore/status:미발견', 'b/googleplay/status:확인 불가',
    'c/appstore/invalid_ref', 'c/googleplay/invalid_ref',
    'd/appstore/dup_in_plan', 'd/googleplay/status:검색어',
  ])
  t('ref 정규화(kr 기본)', items.filter((i) => !i.skip).map((i) => i.ref), ['kr:111', 'kr:ko:com.a.app'])
  t('label = <area>:<slug>', items[0].label, '99-test:a')
}
t('꺼진 소스 투입 금지', plan([AREA], { ...base, sourceRows: { appstore: { ...ON, enabled: false }, googleplay: ON } })[0].skip, 'source_disabled')
t('소스 행 없음(googleplay 미등록) 건너뜀', plan([AREA], { ...base, sourceRows: { appstore: ON } })[1].skip, 'source_missing')
// robots 가드 — runner/store 의 소유자 예외와 같은 성질: override 는 robots **금지**만 통과시킨다(§7.1).
{
  const guard = (robots_status, override) =>
    plan([AREA], { ...base, sourceRows: { appstore: { enabled: true, robots_status, override }, googleplay: ON } })[0].skip ?? 'pass'
  t('robots NULL ∧ override NULL 금지', guard(null, null), 'robots_unrecorded')
  t('robots NULL ∧ 허용 override 도 금지', guard(null, 'owner_2026-10-05'), 'robots_unrecorded')
  t('unverified ∧ override NULL 금지', guard('unverified', null), 'robots_unverified')
  t('unverified ∧ 허용 override 도 금지', guard('unverified', 'owner_2026-10-05'), 'robots_unverified')
  t('disallowed ∧ override NULL 금지', guard('disallowed', null), 'robots_disallowed')
  t('disallowed ∧ 허용 override 통과', guard('disallowed', 'owner_2026-10-05'), 'pass')
  t('disallowed ∧ 구글 플레이 override(owner_2026-10-06)도 통과', guard('disallowed', 'owner_2026-10-06'), 'pass')
  t('disallowed ∧ 허용 집합 밖 override 금지', guard('disallowed', 'owner_2026-10-07'), 'robots_disallowed')
  t('allowed 통과(override 무관)', guard('allowed', null), 'pass')
  t('not_applicable 통과', guard('not_applicable', null), 'pass')
  // 사유 코드는 소스별로 갈라 센다(summarize).
  const items = plan([AREA], { ...base, sourceRows: { appstore: { enabled: true, robots_status: 'unverified', override: null }, googleplay: { enabled: true, robots_status: null, override: null } } })
  const by = summarize(items, { run: false, unit: 'product', areas: ['99'], sources: base.sources, globalUs: false }).by['99-test']
  t('사유 코드 구분 집계', [by.appstore.skipped.robots_unverified, by.googleplay.skipped.robots_unrecorded], [2, 1]) // appstore a·d, googleplay a (c 는 invalid_ref)
}
t('offline = 확인 불가(넣지 않음)', plan([AREA], { ...base, offline: true })[0].skip, 'source_unknown')
t('잘못된 ref 는 가드보다 먼저 거른다', plan([AREA], { ...base, offline: true })[4].skip, 'invalid_ref')
{
  const items = plan([AREA], { ...base, globalUs: true, sourceRows: { appstore: ON, googleplay: ON } })
  t('--global-us: global 제품만 us 추가', items.filter((i) => !i.skip).map((i) => i.ref), ['kr:111', 'us:111', 'kr:ko:com.a.app', 'us:en:com.a.app'])
}
t('--max', plan([AREA], { ...base, max: 1, sourceRows: { appstore: ON, googleplay: ON } })[1].skip, 'over_max')

// main 경로 — 실제 사전 파일 대신 합성 사전을 쓰려고 plan 만 쓰지 않고, 실제 사전 ①·⑦ 로 끝까지 돈다.
{
  const db = fakeDb({ appstore: ON, googleplay: ON })
  const dry = await main(['--max=1000'], { port: db.port })
  t('드라이런 쓰기 0', db.writes, 0)
  t('드라이런 applied=null', dry.out.applied, null)
  t('①·⑦ 계획 = 확인 칸 수(app 25+12, play 27+13)', dry.out.insert, 77)
  t('①·⑦ 영역×소스', Object.fromEntries(Object.entries(dry.out.by).map(([a, v]) => [a, [v.appstore.insert, v.googleplay.insert]])), { '01-meeting-notes': [25, 27], '07-ecommerce-ops': [12, 13] })

  const r1 = await main(['--run', '--max=1000'], { port: db.port })
  t('run 1회: 타깃 77', r1.out.applied.inserted, 77)
  t('run 1회: 제품당 프로젝트 = 계획 프로젝트 수', r1.out.applied.projectsCreated, dry.out.projects)
  t('프로젝트는 collecting·SAAS INSERT', db.projects.every((p) => p.status === 'collecting' && p.business_model === 'SAAS' && p.purpose === 'product_fit'), true)
  const w = db.writes
  const r2 = await main(['--run', '--max=1000'], { port: db.port })
  t('재실행 멱등: 투입 0 · 쓰기 0', [r2.out.insert, db.writes - w], [0, 0])
  t('재실행 건너뜀 사유 = exists', r2.out.by['07-ecommerce-ops'].appstore.skipped.exists, 12)
  const r3 = await main(['--run', '--unit=area', '--max=1000'], { port: db.port })
  t('--unit 을 바꿔도 같은 앱을 다시 넣지 않음', [r3.out.insert, db.targets.length], [0, 77])
}
{
  const db = fakeDb({ appstore: ON, googleplay: ON })
  const r = await main(['--run', '--unit=area', '--max=1000'], { port: db.port })
  t('--unit=area: 영역당 프로젝트 1개', [db.projects.length, r.out.applied.inserted], [2, 77])
  t('--unit=area: 타깃 label 은 제품을 담는다', db.targets.every((x) => /^\d\d-[a-z-]+:[a-z0-9-]+$/.test(x.label)), true)
}
{
  const db = fakeDb({ appstore: ON, googleplay: ON })
  await main(['--run', '--max=10'], { port: db.port })
  t('--max=10 이면 타깃 10', db.targets.length, 10)
  await main(['--run', '--max=10'], { port: db.port })
  t('다음 실행이 이어서 10 (중복 0)', new Set(db.targets.map((x) => x.source_key + x.product_ref)).size, 20)
  t('이어 붙인 프로젝트 재사용(pitch 키)', new Set(db.projects.map((p) => p.product_elevator_pitch)).size, db.projects.length)
}
{
  const db = fakeDb({ appstore: ON }) // googleplay 행 없음
  const r = await main(['--run', '--max=1000'], { port: db.port })
  t('googleplay 행 없으면 appstore 만', [r.out.applied.inserted, db.targets.every((x) => x.source_key === 'appstore')], [37, true])
}
{
  const r = await main(['--global-us', '--max=1000'], { port: fakeDb({ appstore: ON, googleplay: ON }).port })
  t('--global-us: ①·⑦ 77 + global 42 = 119', r.out.insert, 119)
}
{
  const r = await main(['--offline'], {})
  t('--offline: 투입 0, 전부 확인 불가·상태 사유', r.out.insert, 0)
}
{
  const all = loadAreas(['01', '02', '03', '04', '05', '06', '07'])
  const items = plan(all, { ...base, globalUs: true, offline: true })
  t('실제 사전 7영역 invalid_ref 0', items.filter((i) => i.skip === 'invalid_ref').map((i) => i.label), [])
}
{
  // insertTarget 이 23505 아닌 오류로 던지면: 빈 프로젝트가 남고 멈추며, 그때까지의 집계를 stderr 에 찍는다.
  const db = fakeDb({ appstore: ON, googleplay: ON })
  const ok = db.port.insertTarget
  db.port.insertTarget = async (row) => (db.targets.length === 2 ? Promise.reject(new Error('boom')) : ok(row))
  const logged = []
  const orig = console.error
  console.error = (m) => logged.push(m)
  let err = null
  try { await main(['--run', '--max=1000'], { port: db.port }) } catch (e) { err = e.message }
  console.error = orig
  t('중단: 오류 전파', err, 'boom')
  t('중단: 그때까지 집계 출력', logged.some((m) => m.includes('"inserted":2')), true)
  db.port.insertTarget = ok
  const r = await main(['--run', '--max=1000'], { port: db.port })
  t('재실행: 남은 프로젝트 재사용으로 흡수(빈 프로젝트 0)', db.projects.every((p) => db.targets.some((x) => x.project_id === p.id)), true)
  t('재실행: 합계 77', [db.targets.length, r.out.applied.projectsReused >= 1], [77, true])
}
let threw = false
try { await main(['--run', '--offline']) } catch { threw = true }
t('--run 과 --offline 동시 금지', threw, true)

console.log(`dictionary-targets selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
