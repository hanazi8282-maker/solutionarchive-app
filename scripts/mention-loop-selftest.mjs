#!/usr/bin/env node
// lib/discovery/mention-loop.ts · scripts/mention-loop.mjs 셀프테스트 — 네트워크·DB 없음. 입력은 합성 픽스처(fixtures/discovery/mention-loop-input.json).
// 보는 것: 추출 규칙(영·한, 샘플 오탐 패턴 5종), 대안 탐색 글, 자기 이름·등록분·지난 기각 제외, 판정 단계(비교만·글 수·영역 적합),
//          검증 3상태(링크 불일치를 no_match 로 접지 않음), 30% 게이트·차단 집계, 근거 3글 미만 등록 금지, 지표 한 줄, 쏠림 경보,
//          CLI(입력 없으면 중단·--write 파일·대장 재제안 방지·live lookup 의 robots 확인과 차단 중단), 정적 DB 접근 0.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  applyAreaVerdicts, compareCriteria, filterPool, mergeSimilar, parseCriterion, parseSampleLabels, pickSample, reviewGate, snippet, toGeneratorCandidates,
  aggregate, cleanText, extractMentions, isAltSeek, judge, metricsLine, nameRejectReason, planGate, safetyAlerts, thresholdTable, toApproved, verifyCandidate,
} from '../lib/discovery/mention-loop.ts'
import { liveLookups, main, unwrap } from './mention-loop.mjs'
import { planRows } from './candidate-register-draft.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}
const ex = (s) => extractMentions(s).map((m) => [m.surface, m.role])

// ── ① 추출 ──
t('영: from→to 쌍', ex('I moved from Inkwell to Paperloom because the editor is flexible.'), [['Inkwell', 'from'], ['Paperloom', 'to']])
t('영: 소문자 from', ex('switching from pages to quillnote'), [['pages', 'from'], ['quillnote', 'to']])
t('영: 대문자 여러 단어, this 는 이름 아님', ex("better than Driftnote and I'm switching to Driftnote Plus instead of this limiting app"), [['Driftnote', 'compare'], ['Driftnote Plus', 'to']])
t("영: 뒤따르는 I'd 를 붙이지 않음", ex("a less glitchy alternative to Slatebook I'd switch instantly"), [['Slatebook', 'alt']])
t('영: 비교 대상이 앱 아님(web·no)', ex('better than web version and better than no mobile app'), [])
t('한: X쓰다가 갈아탐', ex('시프트잇쓰다가 갈아탔는데 출근 기록이 정확'), [['시프트잇', 'from']])
t('한: 수식어 건너뜀(유료)', ex('버드트윗 유료쓰다가 이거 받아보고 갈아탔어요'), [['버드트윗', 'from']])
t('한: 괄호 제목 붙여쓰기', ex('[메모라로갈아탐] 받아쓰기용으로 잘 썼는데'), [['메모라', 'to']])
t('한: 대신 = 접속어(오탐 2종)', ex('웹 대신 사용하라고 하네요. 대신 아쉬운 점은 느린 속도'), [])
t('한: X에서 Y로 넘어옴', ex('플로우에서 잔디로 넘어왔어요'), [['플로우', 'from'], ['잔디', 'to']])
t('한: 의 대안만(좋은 대안 아님)', ex('노션의 대안으로 좋아요. 좋은 대안입니다'), [['노션', 'alt']])
t('한: 이걸로 = 대명사, 이름 없음', ex('Google Docs 쓰다가 이걸로 바꿨어요'), [['Google Docs', 'from']])
t('SRC 머리글 제거', cleanText('[SRC: https://play.google.com/store/apps/details?id=com.x] 좋아요').includes('play.google'), false)
t('SRC 머리글 속 도메인이 이름으로 안 잡힘', ex('[SRC: https://play.google.com/store/apps/details?id=com.Moved] 별로'), [])
t('대안 탐색: 이름 없는 글', [isAltSeek('looking for an alternative app'), isAltSeek('갈아탈 만한 앱 찾다가'), isAltSeek('그냥 좋아요')], [true, true, false])

// ── ④ 이름 사유 ──
const EXCL = { company_only: ['google'], person_name: ['maciej'] }
t('사유: OS 기본 앱', nameRejectReason('pages', 'pages', EXCL), 'builtin_generic')
t('사유: 회사명 단독', nameRejectReason('Google', 'google', EXCL), 'company_only')
t('사유: 한국어 님', nameRejectReason('민수님', '민수님', EXCL), 'person_name')
t('사유: config 사람 이름', nameRejectReason('Maciej', 'maciej', EXCL), 'person_name')
t('사유: 정상 이름', nameRejectReason('Inkwell', 'inkwell', EXCL), null)

// ── ②③ 집계(합성 픽스처) ──
const FIX = JSON.parse(fs.readFileSync('fixtures/discovery/mention-loop-input.json', 'utf8'))
const REG = { dictionary: [{ name: 'Evernote', slug: 'evernote' }], areaMapSlugs: [] }
const { rows, counts } = aggregate(FIX.posts, { ...FIX, ...REG, exclude: EXCL })
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
t('자기 이름 제외(Quillnote·근무툴)', [!!byKey.quillnote, !!byKey['근무툴'], counts.self], [false, false, 2])
t('이미 등록된 이름 제외(Evernote)', [!!byKey.evernote, counts.registered], [false, 1])
t('글·소스·근거 id', [byKey.inkwell.posts.length, byKey.inkwell.sources, byKey.inkwell.posts[0]], [3, ['appstore', 'googleplay'], '00000000-0000-4000-8000-000000000001'])
t('링크 앱 ID 수집', byKey.inkwell.app_ids, ['1111111111'])
t('대안 탐색 글 가중 대상', [byKey.inkwell.alt_seek_posts, counts.alt_seek_posts], [1, 3])
t('한국어 글 → kr 판정 재료', byKey['시프트잇'].ko_posts, 3)
const prior = new Map([['tasklane', 'discovery_candidates:HN hits 2 < 5']])
const J = Object.fromEntries(rows.map((a) => [a.key, judge(a, { prior })]))
t('단계: 기본 앱 기각', [J.pages.stage, J.pages.reason], ['rejected', 'builtin_generic'])
t('단계: 회사명 기각', J.google.stage, 'rejected')
t('단계: 비교만 = 보류', [J.driftnote.stage, J.driftnote.reason], ['hold', 'compare_only'])
t('단계: 지난 기각 재제안 안 함', J.tasklane.stage, 'prior_rejected')
t('단계: 영역 적합 통과', [J.inkwell.stage, J.inkwell.area, J.inkwell.area_fit], ['area_fit', '5', 1])
const mixed = judge(byKey.tasklane)
t('단계: 영역 섞이면(2/3) 후보까지만', [mixed.stage, mixed.area_fit], ['candidate', 0.667])
t('단계: 글 수 미달', judge(byKey.tasklane, { minPosts: 4 }).reason, 'below_min_posts(3/4)')

// ── ⑤ 검증 ──
const lookups = new Map(Object.entries(FIX._lookups))
const searched = new Map(Object.entries(FIX._searched))
t('검증: 링크 ID 이름 일치 → anchored', verifyCandidate(byKey.inkwell, { lookups }).state, 'anchored')
t('검증: 링크 이름 불일치는 no_match 로 접지 않음', verifyCandidate(byKey.driftly, { lookups }).state, 'lookup_failed')
t('검증: ID 없으면 확인 불가', verifyCandidate(byKey['시프트잇'], { lookups }).state, 'lookup_failed')
t('검증: 사람 판단 뒤 검색 결과로 anchored', verifyCandidate(byKey['시프트잇'], { lookups, searched }).state, 'anchored')
t('검증: 동명 다른 판매자 = ambiguous', verifyCandidate({ ...byKey.driftly, app_ids: [] }, { searched: new Map([['driftly', [{ trackId: 1, trackName: 'Driftly', sellerName: 'A', userRatingCount: 99 }, { trackId: 2, trackName: 'Driftly', sellerName: 'B', userRatingCount: 99 }]]]) }).state, 'ambiguous')

// ── ⑦ 게이트 ──
const ready = ['inkwell', '시프트잇'].map((k) => ({ ...J[k], verdict: verifyCandidate(byKey[k], { lookups, searched }), play_pkg: null, country: k === 'inkwell' ? 'us' : 'kr' }))
const g = planGate(ready, { total_active: 10, appstore_active: 2, googleplay_active: 0 })
t('게이트: 앱스토어 자리 1 → 1 등록·1 차단', [g.register.length, g.blocked.length, g.blocked[0].reason], [1, 1, 'appstore_30pct(구글 플레이 패키지 모름)'])
const big = ready.map((r) => (r.key === '시프트잇' ? { ...r, verdict: { ...r.verdict, ratingCount: 5000 } } : r))
t('v71aj 게이트 순서: 자리 1 이면 평가 수 많은 앱 먼저(점수보다 앞)', [planGate(big, { total_active: 10, appstore_active: 2, googleplay_active: 0 }).register[0].c.key, g.register[0].c.key], ['시프트잇', 'inkwell'])
const g2 = planGate(ready.map((r) => ({ ...r, play_pkg: 'com.x' })), { total_active: 10, appstore_active: 3, googleplay_active: 0 })
t('게이트: 앱스토어 30% 넘으면 구글 플레이 먼저', g2.register.map((r) => r.source_key), ['googleplay', 'googleplay'])
const g3 = planGate(ready.map((r) => ({ ...r, play_pkg: 'com.x' })), { total_active: 400, appstore_active: 120, googleplay_active: 80 })
t('게이트: 구글 플레이 80 동결이면 차단', [g3.register.length, g3.blocked.length], [0, 2])
const ap = toApproved(g)
t('등록 초안 꼴(candidate-register-draft --approved)', [ap[0].norm_key, ap[0].area, ap[0].anchors.appstore_id, ap[0].anchors.appstore_country, ap[0].evidence_input_ids.length], ['inkwell', '5', '1111111111', 'us', 3])
let threw = false
try {
  toApproved({ register: [{ c: { ...ready[0], posts: ['a', 'b'] }, source_key: 'appstore' }] })
} catch {
  threw = true
}
t('근거 글 3개 미만은 등록 초안 거부', threw, true)

// ── ⑨⑩ 지표·경보 ──
const tab = thresholdTable(rows, new Map([['inkwell', 'anchored'], ['driftly', 'no_match']]))
t('기준 조정표: k=3 후보·정밀도', [tab[2].k, tab[2].anchored, tab[2].no_match, tab[2].precision], [3, 1, 1, 0.5])
const M = { date: '2026-10-17', extracted: 9, new_names: 6, candidates: 3, area_fit: 3, registered: 1, harvest_avg: null, harvest_n: 0, by_area: { 4: 1, 5: 2 }, gate_blocked: 1, alt_seek_posts: 3, lookups: 0, lookup_blocked: false }
t('지표 한 줄', metricsLine(M), '[언급 루프 2026-10-17] 추출 이름 9 · 새 이름 6 · 후보 3 · 영역 적합 통과 3 · 등록 1 · 등록 앱당 평균 수확 확인 불가(0개) · 영역 ①0 ②0 ③0 ④1 ⑤2 · 30% 게이트 차단 1 · 대안 탐색 글 3')
t('경보: 영역 쏠림(5건 중 5 = ⑤)', safetyAlerts(M, Array.from({ length: 5 }, () => ({ area: '5' }))).length, 1)
t('경보: 조회 차단', safetyAlerts({ ...M, lookup_blocked: true }, [])[0].startsWith('앱 조회 차단'), true)

// ── CLI ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-'))
  const lf = path.join(tmp, 'l.json')
  const sf = path.join(tmp, 's.json')
  fs.writeFileSync(lf, JSON.stringify(FIX._lookups))
  fs.writeFileSync(sf, JSON.stringify(FIX._searched))
  const quiet = { log: () => {}, fileRegistry: REG, cfg: { exclude: EXCL } }
  let e = null
  await main([], quiet).catch((x) => (e = x))
  t('CLI: --input 없으면 중단', !!e, true)
  t('unwrap: supabase db query 출력 꼴', unwrap([{ input: { posts: [], projects: [], targets: [] } }]).posts, [])
  let e2 = null
  try {
    unwrap({ posts: [] })
  } catch (x) {
    e2 = x
  }
  t('unwrap: 배열 빠지면 중단(0건으로 접지 않음)', !!e2, true)
  const ledger = path.join(tmp, 'ledger.json')
  const args = ['--input=fixtures/discovery/mention-loop-input.json', `--lookups=${lf}`, `--searched=${sf}`, `--ledger=${ledger}`, '--write', `--reports-dir=${path.join(tmp, 'r')}`, '--date=2026-10-17']
  let e3 = null
  await main(args, quiet).catch((x) => (e3 = x))
  t('CLI: 지정한 대장 파일이 없으면 중단', !!e3, true)
  fs.writeFileSync(ledger, JSON.stringify({ entries: {} }))
  const o = await main(args, quiet)
  t('CLI: 등록 1·차단 1(픽스처 게이트 자리 1)', [o.metrics.registered, o.metrics.gate_blocked], [1, 1])
  t('CLI: 파일 5개(후보 생성기 입력·이름 검색 입력 포함)', fs.readdirSync(path.join(tmp, 'r', '2026-10-17')).sort(), ['anchor-verify-input.json', 'candidate-input.json', 'mention-approved.json', 'mention-ledger.sql', 'mention-loop.json'])
  const avIn = JSON.parse(fs.readFileSync(path.join(tmp, 'r', '2026-10-17', 'anchor-verify-input.json'), 'utf8'))
  t('이름 검색 입력: 확인 불가 후보만·anchor-verify 꼴', avIn.map((r) => [r.slug, Object.keys(r).sort()]), [['driftly', ['country', 'expected_domain', 'name', 'slug']]])
  const sql = fs.readFileSync(path.join(tmp, 'r', '2026-10-17', 'mention-ledger.sql'), 'utf8')
  t('대장 SQL: HN 행 안 덮음·accepted 1', [/WHERE public\.discovery_candidates\.origin = 'mention'/.test(sql), (sql.match(/, 'accepted', /g) ?? []).length], [true, 1])
  // 경계면: 이 출력이 기존 등록 초안 생성기에 그대로 들어가는가(§7.1 — 부품 테스트를 통합 근거로 쓰지 않는다)
  const approved = JSON.parse(fs.readFileSync(path.join(tmp, 'r', '2026-10-17', 'mention-approved.json'), 'utf8'))
  const plan = planRows(approved, { date: '2026-10-17' })
  t('경계: candidate-register-draft planRows 통과', [plan.projects.length, plan.targets[0].source_key, plan.targets[0].product_ref, plan.targets[0].label], [1, 'appstore', 'us:1111111111', '5:us|inkwell'])
  const led = JSON.parse(fs.readFileSync(ledger, 'utf8'))
  t('대장: 등록 계획 ref 기록', led.entries.inkwell.refs, ['appstore|us:1111111111'])
  t('대장: 기각 사유 기록', [led.entries.pages.status, led.entries.pages.reason], ['rejected', 'builtin_generic'])
  const o2 = await main(args, quiet)
  t('재실행: 기각 이름은 지난 기각으로', o2.rows.find((r) => r.key === 'pages').stage, 'prior_rejected')
}

// ── v71aj (가)~(마) ──
{
  t('기준: 3', parseCriterion('3'), { id: '3글', minPosts: 3, minSources: 1 })
  t('기준: 2+2', parseCriterion('2+2'), { id: '2글+2소스', minPosts: 2, minSources: 2 })
  let bad = false
  try { parseCriterion('2글') } catch { bad = true }
  t('기준: 형식 밖이면 중단', bad, true)
  t('기준: 소스 하한(inkwell 2소스)', [judge(byKey.inkwell, { minPosts: 2, minSources: 2 }).stage, judge(byKey.inkwell, { minPosts: 2, minSources: 3 }).reason], ['area_fit', 'below_min_sources(2/3)'])
  const cmp = compareCriteria(rows, [parseCriterion('3'), parseCriterion('2+2')], { prior, labels: new Map([['inkwell', { ok: true, sampled_for: ['3글'] }], ['시프트잇', { ok: false, sampled_for: ['3글'] }]]) })
  t('비교표: 기준별 후보 수가 나온다', cmp.map((c) => c.criterion), ['3글', '2글+2소스'])
  t('비교표: 그 기준 표본으로만 오탐률', [cmp[0].labeled, cmp[0].false_pos, cmp[0].fp_rate, cmp[1].fp_rate], [2, 1, 0.5, null])

  const P = (id, kind, area = '5') => ({ id, project_id: 'p', source_key: 's', area_code: area, raw_text: 'x', verdict_kind: kind })
  const pool = [P('a', 'approved'), P('b', 'relevant'), P('c', 'alt_seek'), { ...P('d', null) }]
  t('풀: approved', filterPool(pool, 'approved').map((p) => p.id), ['a', 'd'])
  t('풀: relevant', filterPool(pool, 'relevant').map((p) => p.id), ['a', 'b', 'd'])
  t('풀: wide', filterPool(pool, 'wide').length, 4)
  let badPool = false
  try { filterPool(pool, 'all') } catch { badPool = true }
  t('풀: 모르는 값이면 중단', badPool, true)

  const V = (id, area, fit, at = '2026-10-17T00:00:00Z') => ({ input_id: id, area_code: area, fit, judged_at: at })
  const av = applyAreaVerdicts([P('h1', null, 'out-founder'), P('h2', null, null), P('h3', null, 'hold'), P('h4', null, '5'), P('h5', null, 'out-founder')],
    [V('h1', '2', 0.8), V('h2', '1', 0.9), V('h3', '1', 0.9), V('h4', '1', 0.99), V('h5', '3', 0.6), V('h1', 'none', 0.9, '2026-10-01T00:00:00Z')])
  t('영역 어댑터: out-founder·NULL 만 올리고 hold·프로젝트 영역·fit 미달은 그대로, 최신 판정', [av.posts.map((p) => p.area_code), av.lifted], [['2', '1', 'hold', '5', 'out-founder'], 2])

  const sim = mergeSimilar(rows, [{ generator: 'similar_app', source_key: 'appstore', product_ref: 'kr:2222222222', label: '4:kr|시프트잇', expected_yield: 10 }, { generator: 'similar_app', source_key: 'appstore', product_ref: 'us:3', label: '5:us|nothing-here', expected_yield: 1 }])
  const sk = sim.rows.find((r) => r.key === '시프트잇')
  t('같은 개발사 고리: 이름 같은 언급 후보에 앱 ID 만 붙인다', [sim.matched, sk.app_ids, sk.similar_ref], [1, ['2222222222'], 'kr:2222222222'])
  t('같은 개발사 고리: 검증 없이 anchored 로 안 올림', verifyCandidate(sk, {}).state, 'lookup_failed')
  t('후보 생성기 입력(mention 갈래)', toGeneratorCandidates(g), [{ generator: 'mention', source_key: 'appstore', product_ref: 'us:1111111111', label: '5:us|inkwell', expected_yield: null, evidence: 'mention 3글·2소스' }])

  const L = (n, ok) => new Map(Array.from({ length: n }, (_, i) => [`k${i}`, { ok: i < ok }]))
  t('등록 문턱: 30건 중 27 적합 = pass', reviewGate(L(30, 27)).decision, 'pass')
  t('등록 문턱: 30건 중 26 = stop', reviewGate(L(30, 26)).decision, 'stop')
  t('등록 문턱: 10건뿐 = 확인 불가', reviewGate(L(10, 10)).decision, 'unverified')
  t('표본 라벨 CSV', [...parseSampleLabels('key,human_ok,sampled_for\ninkwell,Y,3글|2글+2소스\nfoo,,3글\nbar,n,3글\n')], [['inkwell', { ok: true, sampled_for: ['3글', '2글+2소스'] }], ['bar', { ok: false, sampled_for: ['3글'] }]])
  t('문맥 조각', snippet('blah I moved from Inkwell to X', 'Inkwell').includes('moved from Inkwell'), true)
  t('표본은 결정적', pickSample(rows, 3).map((r) => r.key), pickSample([...rows].reverse(), 3).map((r) => r.key))
}

// ── v71aj CLI: 비교·표본·등록 모드 ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-'))
  const lf = path.join(tmp, 'l.json')
  const sf = path.join(tmp, 's.json')
  fs.writeFileSync(lf, JSON.stringify(FIX._lookups))
  fs.writeFileSync(sf, JSON.stringify(FIX._searched))
  const ledger = path.join(tmp, 'ledger.json')
  fs.writeFileSync(ledger, JSON.stringify({ entries: {} }))
  const quiet = { log: () => {}, fileRegistry: REG, cfg: { exclude: EXCL } }
  const base = ['--input=fixtures/discovery/mention-loop-input.json', `--lookups=${lf}`, `--searched=${sf}`, `--ledger=${ledger}`, `--reports-dir=${path.join(tmp, 'r')}`, '--date=2026-10-17']
  const sample = path.join(tmp, 'sample.csv')
  const o = await main([...base, '--compare=3,2+2', `--sample-out=${sample}`, '--sample-n=20'], quiet)
  const csv = fs.readFileSync(sample, 'utf8').split('\n')
  t('CLI 비교: 기준 2개·표본 시트 머리줄', [o.comparison.length, csv[0]], [2, 'key,human_ok,sampled_for,name,posts,sources,area,area_fit,verify,context1,context2,context3'])
  t('CLI 비교: 표본 행은 human_ok 빈칸', csv.slice(1).filter(Boolean).every((l) => l.split(',')[1] === ''), true)
  const o2 = await main([...base, '--criterion=2+2'], quiet)
  t('CLI 시험 기준 2+2: 중단 없이 돌고 3글 미만은 등록에서 뺀다', [o2.criterion, o2.metrics.registered <= 1], ['2글+2소스', true])

  const migDir = path.join(tmp, 'mig')
  fs.mkdirSync(migDir)
  let e1 = null
  await main([...base, '--register'], quiet).catch((x) => (e1 = x))
  t('등록 모드: 채점 CSV 없으면 중단', !!e1, true)
  const rv = (n, ok) => {
    const f = path.join(tmp, `rv-${n}-${ok}.csv`)
    fs.writeFileSync(f, 'key,human_ok,sampled_for\n' + Array.from({ length: n }, (_, i) => `k${i},${i < ok ? 'Y' : 'N'},3글`).join('\n') + '\n')
    return f
  }
  let e2 = null
  await main([...base, '--register', `--review=${rv(30, 20)}`, `--migrations-dir=${migDir}`], quiet).catch((x) => (e2 = x))
  t('등록 모드: 적합 <90% 면 초안 안 만듦', [!!e2, fs.readdirSync(migDir).length], [true, 0])
  const o3 = await main([...base, '--register', `--review=${rv(30, 30)}`, `--migrations-dir=${migDir}`], quiet)
  const files = fs.readdirSync(migDir).sort()
  t('등록 모드: 통과면 마이그 초안+롤백(DB 쓰기 없음)', [o3.mode, files.length, files.every((f) => /_candidate_register_20261017(_rollback)?\.sql$/.test(f))], ['register_draft', 2, true])
  t('등록 모드: 초안에 inkwell 타깃', fs.readFileSync(path.join(migDir, files.find((f) => !f.includes('rollback'))), 'utf8').includes('us:1111111111'), true)

  // anchor-verify.mjs 결과 파일 → 확인 불가 후보 채움(이미 anchored 인 것은 덮지 않는다)
  const avf = path.join(tmp, 'av.json')
  fs.writeFileSync(avf, JSON.stringify([
    { slug: 'driftly', name: 'Driftly', country: 'kr', verdict: { state: 'anchored', appId: 4444444444, trackName: 'Driftly', sellerName: 'D', domain: null, ratingCount: 120, reason: 'x' } },
    { slug: 'inkwell', name: 'Inkwell', country: 'us', verdict: { state: 'no_match', reason: 'x' } },
  ]))
  const o4 = await main([...base, `--anchor-verdicts=${avf}`], quiet)
  const st = Object.fromEntries(o4.rows.map((r) => [r.key, r.verify?.state]))
  t('이름 검색 판정: lookup_failed 만 채우고 anchored 는 그대로', [st.driftly, st.inkwell], ['anchored', 'anchored'])
}

// ── live lookup: robots 먼저, 차단이면 즉시 중단 ──
{
  const robots = (body) => async (url) => (String(url).endsWith('/robots.txt') ? { status: 200, text: async () => body } : { status: 429, text: async () => '' })
  const r1 = await liveLookups(['1'], { fetchFn: robots('User-agent: *\nDisallow: /lookup\n'), gapMs: 0, log: () => {} })
  t('lookup: robots 금지면 요청 0', [r1.requests, r1.blocked], [0, true])
  const r2 = await liveLookups(['1', '2'], { fetchFn: robots('User-agent: *\nDisallow: /search*\nDisallow: /*/lookup?\n'), gapMs: 0, log: () => {} })
  t('lookup: 429 면 첫 요청에서 중단·차단', [r2.requests, r2.blocked], [1, true])
  const r3 = await liveLookups(['1'], { fetchFn: async () => ({ status: 503, text: async () => '' }), gapMs: 0, log: () => {} })
  t('lookup: robots 못 읽으면 요청 0(허용으로 접지 않음)', [r3.requests, r3.blocked], [0, false])
}

// ── 정적: DB 접근·쓰기 없음 ──
{
  const src = fs.readFileSync('scripts/mention-loop.mjs', 'utf8') + fs.readFileSync('lib/discovery/mention-loop.ts', 'utf8')
  const code = src.replace(/\/\/.*$/gm, '')
  t('정적: supabase import 없음', /from\s+['"][^'"]*supabase/i.test(code), false)
  t('정적: .insert/.update/.upsert 호출 없음', /\.(insert|update|upsert|delete)\s*\(/i.test(code), false)
  t('정적: 이름 검색 경로(/search) 요청 없음', /itunes\.apple\.com\/search/.test(code), false)
}

console.log(`mention-loop selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
