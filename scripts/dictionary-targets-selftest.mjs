#!/usr/bin/env node
// scripts/dictionary-targets.mjs 셀프테스트 — 네트워크·DB 없음. 가짜 DB 포트(메모리)로 돈다.
// 보는 것: 드라이런 쓰기 0 · --run 멱등 · 소스 가드(꺼짐·행 없음·robots 3상태×override) · 잘못된 ref 거름 · 중단 시 집계 ·
//          '확인' 외 상태 미투입 · --max · --unit=area · --unit 을 바꿔도 같은 앱을 두 번 넣지 않음 ·
//          실제 사전 ①·⑦ 의 계획 수치(보고서 표와 같은 값)와 invalid_ref 0.

import { main, plan, loadAreas, loadAreaMap, summarize } from './dictionary-targets.mjs'

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
  const db = { projects: [], targets: [], writes: 0, activeCounts: { other: 100000 } }
  db.port = {
    loadSources: async (keys) => Object.fromEntries(keys.filter((k) => sources[k]).map((k) => [k, sources[k]])),
    // 30% 게이트가 이 표본을 막지 않게 다른 소스 활성 타깃을 크게 둔다(게이트 자체는 아래 '공급 게이트' 블록).
    loadActiveCounts: async () => ({ ...db.activeCounts }),
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
// 합성 사전은 실제 영역 지도에 없다 — 영역 1 로 둔다(영역 필터 검사는 아래 '영역 지도' 블록).
const base = { sources: ['appstore', 'googleplay'], unit: 'product', globalUs: false, max: 100, offline: false, existing: new Set(), areaMap: { a: '1', b: '1', c: '1', d: '1' } }
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
  t('label = <새 영역>:<slug>(v27)', items[0].label, '1:a')
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
  // v27 영역 지도: ⑦ 은 3·5·null 로 남은 19개 중 확인 칸이 app 1 · play 1 뿐이다(나머지 29개는 out).
  t('①·⑦ 계획 = 확인 칸 수(app 25+1, play 27+1)', dry.out.insert, 54)
  t('①·⑦ 영역×소스', Object.fromEntries(Object.entries(dry.out.by).map(([a, v]) => [a, [v.appstore.insert, v.googleplay.insert]])), { '01-meeting-notes': [25, 27], '07-ecommerce-ops': [1, 1] })

  const r1 = await main(['--run', '--max=1000'], { port: db.port })
  t('run 1회: 타깃 54', r1.out.applied.inserted, 54)
  t('run 1회: 제품당 프로젝트 = 계획 프로젝트 수', r1.out.applied.projectsCreated, dry.out.projects)
  t('프로젝트는 collecting·SAAS INSERT', db.projects.every((p) => p.status === 'collecting' && p.business_model === 'SAAS' && p.purpose === 'product_fit'), true)
  const w = db.writes
  const r2 = await main(['--run', '--max=1000'], { port: db.port })
  t('재실행 멱등: 투입 0 · 쓰기 0', [r2.out.insert, db.writes - w], [0, 0])
  t('재실행 건너뜀 사유 = exists', r2.out.by['07-ecommerce-ops'].appstore.skipped.exists, 1)
  const r3 = await main(['--run', '--unit=area', '--max=1000'], { port: db.port })
  t('--unit 을 바꿔도 같은 앱을 다시 넣지 않음', [r3.out.insert, db.targets.length], [0, 54])
}
{
  const db = fakeDb({ appstore: ON, googleplay: ON })
  const r = await main(['--run', '--unit=area', '--max=1000'], { port: db.port })
  t('--unit=area: 영역당 프로젝트 1개', [db.projects.length, r.out.applied.inserted], [2, 54])
  // v27: label 접두 = 새 영역(1~5), 영역 미배정(null)은 접두 없이 slug 만.
  t('--unit=area: 타깃 label 은 제품을 담는다', db.targets.every((x) => /^([1-5]:)?[a-z0-9-]+$/.test(x.label)), true)
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
  t('googleplay 행 없으면 appstore 만', [r.out.applied.inserted, db.targets.every((x) => x.source_key === 'appstore')], [26, true])
}
{
  const r = await main(['--global-us', '--max=1000'], { port: fakeDb({ appstore: ON, googleplay: ON }).port })
  t('--global-us: ①·⑦ 54 + global 35 = 89', r.out.insert, 89)
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
  t('재실행: 합계 54', [db.targets.length, r.out.applied.projectsReused >= 1], [54, true])
}
// ── 영역 지도(v27, data/area-map-v26.json) — 완전성·중복·값 범위·남헌 확정 매핑 ──────────────
{
  const fsm = await import('node:fs')
  const rawText = fsm.readFileSync(new URL('../data/area-map-v26.json', import.meta.url), 'utf8')
  const raw = JSON.parse(rawText)
  const map = loadAreaMap()
  const all = loadAreas(['01', '02', '03', '04', '05', '06', '07'])
  const slugs = all.flatMap((a) => a.products.map((p) => p.slug))
  t('사전 slug 중복 없음(영역을 가로질러)', slugs.length, new Set(slugs).size)
  t('완전성: 사전의 모든 slug 가 맵에 있다', slugs.filter((s) => !Object.prototype.hasOwnProperty.call(map, s)), [])
  t('완전성: 맵에 사전 밖 slug 가 없다', Object.keys(map).filter((k) => !slugs.includes(k)), [])
  t('JSON 키 중복 없음(파싱이 조용히 덮어쓰지 않았다)', (rawText.match(/^\s*"[^"]+":/gm) ?? []).filter((l) => !/"_/.test(l) && !/^\s{4,}/.test(l)).length, Object.keys(map).length)
  t('값 범위: 1~5 · hold · out · null 만', Object.values(map).filter((v) => !(v === null || ['1', '2', '3', '4', '5', 'hold', 'out'].includes(v))), [])
  const count = (pred) => Object.values(map).filter(pred).length
  t('영역별 개수(1:31 · 2:22 · 3:42 · 4:32 · 5:8 · hold:59 · out:57 · null:3 = 254)',
    ['1', '2', '3', '4', '5', 'hold', 'out'].map((v) => count((x) => x === v)).concat(count((x) => x === null), slugs.length), [31, 22, 42, 32, 8, 59, 57, 3, 254])
  const byArea = (code, v) => all.find((a) => a.area.startsWith(code)).products.every((p) => map[p.slug] === v)
  t('01→1 · 03→2 · 04→3 · 02·05→hold', [byArea('01', '1'), byArea('03', '2'), byArea('04', '3'), byArea('02', 'hold'), byArea('05', 'hold')], [true, true, true, true, true])
  const a06 = all.find((a) => a.area.startsWith('06')).products
  t('06 채용·AI면접 28 → out, HR 32 → 4', [a06.filter((p) => map[p.slug] === 'out').length, a06.filter((p) => map[p.slug] === '4').length], [28, 32])
  t('07 표본(klaviyo 3 · yotpo 5 · bigin null · sabangnet out)', [map.klaviyo, map.yotpo, map.bigin, map.sabangnet], ['3', '5', null, 'out'])
  t('h-place → 4 + 채용 제외 주석', [map['h-place'], /채용 쪽 제외/.test(raw._notes?.['h-place'] ?? '')], ['4', true])
  t('메타 키(_)는 맵에서 빠진다', Object.keys(map).some((k) => k.startsWith('_')), false)

  // plan 배선: hold·out → area_excluded, null → 투입(접두 없음), 맵에 없음 → area_unmapped
  const SYN = { area: '99-test', area_ko: 't', file: 'x.json', products: ['h', 'o', 'n', 'u', 'k'].map((s, i) => ({ slug: s, name: s, region: 'kr', summary_ko: s, sources: { appstore: cell('확인', String(100 + i)) } })) }
  const items = plan([SYN], { ...base, sources: ['appstore'], sourceRows: { appstore: ON }, areaMap: { h: 'hold', o: 'out', n: null, k: '4' } })
  t('plan: hold·out=area_excluded · null=투입 · 맵 없음=area_unmapped · 4=투입', skipsOf(items), ['h/appstore/area_excluded', 'o/appstore/area_excluded', 'n/appstore/insert', 'u/appstore/area_unmapped', 'k/appstore/insert'])
  t('plan: label 접두(null 은 slug 만)', items.filter((i) => !i.skip).map((i) => i.label), ['n', '4:k'])
  // 실제 지도로 7영역 전부 — 채용·운영 out 이 계획에 하나도 안 들어간다
  const real = plan(all, { ...base, areaMap: undefined, offline: true, globalUs: true })
  t('실제 지도: out·hold 칸은 전부 area_excluded', real.filter((i) => ['out', 'hold'].includes(map[i.slug]) && i.skip !== 'area_excluded').length, 0)
  t('실제 지도: area_unmapped 0', real.filter((i) => i.skip === 'area_unmapped').length, 0)
}

// ── 카카오 q: 첫 웨이브(남헌 v32 §5 D5) — 실제 사전 ⑦ 의 영역 ⑤ 검색어, 키(KAKAO_REST_API_KEY) 없이 ──────────────
{
  const KAKAO_ON = { enabled: true, robots_status: 'not_applicable', override: 'owner_2026-10-06' }
  const saved = process.env.KAKAO_REST_API_KEY
  delete process.env.KAKAO_REST_API_KEY
  const db = fakeDb({ kakao_blog: KAKAO_ON, kakao_cafe: KAKAO_ON })
  const dry = await main(['--sources=kakao_blog,kakao_cafe', '--areas=07', '--max=1000'], { port: db.port })
  const ins = dry.out.items.filter((i) => !i.skip)
  t('kakao: 4검색어 × 2소스 = 8', ins.length, 8)
  t('kakao: 첫 웨이브 = yotpo·judge-me·loox·okendo', [...new Set(ins.map((i) => i.slug))], ['yotpo', 'judge-me', 'loox', 'okendo'])
  t('kakao: ref = q:<검색어>(q: 이중 접두 없음)', ins.filter((i) => i.source === 'kakao_blog').map((i) => i.ref), ['q:욧포 후기', 'q:저지미 후기', 'q:룩스 후기', 'q:오켄도 후기'])
  t('kakao: label 영역 5 접두', ins.every((i) => i.label === `5:${i.slug}`), true)
  t('kakao: 보류 4개 × 2소스 = kakao_held 8', dry.out.items.filter((i) => i.skip === 'kakao_held').length, 8)
  t('kakao: 그 밖 ⑦ 검색어는 투입 안 함', dry.out.items.filter((i) => i.skip === 'kakao_not_in_wave').length > 0, true)
  t('kakao: 키 없이도 드라이런이 돈다(쓰기 0)', db.writes, 0)
  const r = await main(['--run', '--sources=kakao_blog,kakao_cafe', '--areas=07', '--max=1000'], { port: db.port })
  t('kakao --run: 8 INSERT · 재실행 0', [r.out.applied.inserted, (await main(['--run', '--sources=kakao_blog,kakao_cafe', '--areas=07'], { port: db.port })).out.insert], [8, 0])
  const off = await main(['--sources=kakao_blog', '--areas=07', '--offline'], {})
  t('kakao --offline: 투입 0(source_unknown)', [off.out.insert, off.out.items.filter((i) => i.skip === 'source_unknown').length], [0, 4])
  if (saved !== undefined) process.env.KAKAO_REST_API_KEY = saved
}

// ── 공급 게이트(D3 30% · D4 googleplay 80 동결) ──────────────
{
  const db = fakeDb({ appstore: ON, googleplay: ON })
  db.activeCounts = { googleplay: 80, appstore: 46, hackernews: 49 } // 175, googleplay 45.7%
  const r = await main(['--max=1000'], { port: db.port })
  t('게이트: googleplay 80 동결 → 여유 0', r.out.headroom.googleplay, 0)
  t('게이트: appstore 여유 = floor((0.3×175−46)/0.7) = 9', r.out.headroom.appstore, 9)
  const by = r.out.by['01-meeting-notes']
  t('게이트: googleplay 전부 share_gate · appstore 9건만', [by.googleplay.insert, by.googleplay.skipped.share_gate, r.out.items.filter((i) => i.source === 'appstore' && !i.skip).length], [0, 27, 9])
  db.activeCounts = { googleplay: 70, other: 1000 }
  t('게이트: googleplay 70 이면 80 까지 10', (await main([], { port: db.port })).out.headroom.googleplay, 10)
  const noCounts = fakeDb({ appstore: ON })
  delete noCounts.port.loadActiveCounts
  let e = null
  try { await main([], { port: noCounts.port }) } catch (x) { e = x.message }
  t('게이트: 활성 수를 못 읽으면 투입하지 않고 던진다', /loadActiveCounts/.test(e ?? ''), true)
}

let threw = false
try { await main(['--run', '--offline']) } catch { threw = true }
t('--run 과 --offline 동시 금지', threw, true)

console.log(`dictionary-targets selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
