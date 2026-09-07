// lib/cases/draft.ts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/case-pipeline-selftest.mjs
//
// 이 파이프라인이 조용히 틀리는 지점은 전부 근거 쪽이다. 케이스 데이터는
// 사람이 다시 읽어 보지 않는다 — 한 번 들어가면 "축적된 성과 데이터"로
// 취급되어 PMF 진단과 콘텐츠에 그대로 흘러 나간다. 그래서:
//
//   1) 근거 없는 수치가 통과하는가 — 환각이 들어오는 유일한 경로다
//   2) source_tier 와 is_self_reported 를 섞지 않는가 (창업자 인터뷰 함정)
//   3) 같은 도메인 여러 건을 "독립 출처 2개"로 세지 않는가
//   4) 어휘 밖 값이 로컬에서 통과해 DB CHECK(23514)까지 가지 않는가
//   5) 비었을 때와 못 읽었을 때를 가르는가 (§7.1)

import {
  BUSINESS_MODEL, BOTTLENECK, LEVER, SNIPPET_MAX, SLUG_RE,
  domainOf, foldObservations, gradeMove, validateDraft, toRows,
} from '../lib/cases/draft.ts'
import { attributionGate } from '../lib/cases/publish-gate.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

const errorsOf = (d) => validateDraft(d).filter(i => i.level === 'error')
const warnsOf = (d) => validateDraft(d).filter(i => i.level === 'warn')
const hasError = (d, re) => errorsOf(d).some(e => re.test(`${e.where} ${e.message}`))

// 최소한으로 유효한 초안. 각 테스트는 여기서 한 군데만 망가뜨린다.
const base = () => ({
  slug: 'acme-tea',
  brand_name: '에이스메 티',
  market: '건강차',
  business_model: 'D2C',
  buyer_type: 'B2C',
  purchase_frequency: 'REPEAT',
  price_band: 'MID',
  bottleneck: 'TRUST',
  outcome_status: 'active',
  period_start: '2023-01-01',
  period_end: '2024-06-30',
  summary: '리뷰 신뢰 문제를 정기구독 샘플로 풀었다',
  tags: ['차', '구독'],
  moves: [{
    lever: 'OFFER',
    claim: '첫 구매에 샘플 3종 동봉',
    outcome_direction: 'positive',
    metric_name: '재구매율',
    metric_before: 12,
    metric_after: 27,
    metric_unit: '%',
    observed_period_start: '2023-03-01',
    observed_period_end: '2023-09-30',
  }],
  evidence: [{
    move: 0,
    url: 'https://news.example.com/acme',
    source_tier: 'secondary',
    is_self_reported: false,
    published_at: '2023-10-05',
    snippet: '재구매율이 12%에서 27%로 올랐다고 밝혔다',
  }],
})

// ── 1) 도메인 추출 ────────────────────────────────────────────
eq('www 를 떼고 호스트를 준다', domainOf('https://www.Example.com/a/b'), 'example.com')
eq('URL 이 아니면 null', domainOf('그냥 문자열'), null)
eq('빈 문자열은 null', domainOf(''), null)

// ── 2) 근거 등급 ──────────────────────────────────────────────
const M = { lever: 'PRICING', claim: 'x', metric_name: 'a', metric_after: 10, metric_unit: '%' }
const NOMETRIC = { lever: 'PRICING', claim: 'x' }

eq('수치가 없으면 D', gradeMove(NOMETRIC, [{ url: 'https://a.com', source_tier: 'primary' }]).grade, 'D')
eq('근거 0건은 D', gradeMove(M, []).grade, 'D')
check('근거 0건 D 는 이유에 "저장 불가"가 있다', /저장 불가/.test(gradeMove(M, []).reason))

eq('비자기보고 1차 1건이면 A',
  gradeMove(M, [{ url: 'https://sec.gov/x', source_tier: 'primary', is_self_reported: false }]).grade, 'A')

// ★ 가장 중요한 구분. 창업자 인터뷰는 primary 지만 자기보고다.
//   tier 만 보면 A 로 올라간다 — 이게 이 파일에서 가장 잡고 싶은 오류다.
eq('자기보고 1차 단독은 A 가 아니다',
  gradeMove(M, [{ url: 'https://blog.acme.com/x', source_tier: 'primary', is_self_reported: true }]).grade, 'C')
eq('자기보고 1차 + 다른 원 관측이면 B',
  gradeMove(M, [
    { url: 'https://blog.acme.com/x', source_tier: 'primary', is_self_reported: true, observation_key: 'acme-blog-2024' },
    { url: 'https://news.example.com/y', source_tier: 'secondary', observation_key: 'news-reporting-2024', supports_metric: true },
  ]).grade, 'B')
// 당사자 발표를 옮겨 적은 3차 요약글은 교차 확인이 아니다. B 로 올려 주면 안 된다.
eq('자기보고 1차 + 3차 요약글은 B 가 아니라 C',
  gradeMove(M, [
    { url: 'https://blog.acme.com/x', source_tier: 'primary', is_self_reported: true },
    { url: 'https://seoblog.example.net/y', source_tier: 'tertiary' },
  ]).grade, 'C')

// ★ 같은 보도자료를 받아쓴 기사 5개는 출처 1개다.
eq('같은 도메인 3건은 독립 2곳이 아니다',
  gradeMove(M, [
    { url: 'https://news.example.com/1', source_tier: 'secondary' },
    { url: 'https://news.example.com/2', source_tier: 'secondary' },
    { url: 'https://news.example.com/3', source_tier: 'secondary' },
  ]).grade, 'C')
eq('서로 다른 원 관측 2건이면 A',
  gradeMove(M, [
    { url: 'https://news.example.com/1', source_tier: 'secondary', observation_key: 'reporter-a-2024', supports_metric: true },
    { url: 'https://other.example.org/2', source_tier: 'secondary', observation_key: 'reporter-b-2024', supports_metric: true },
  ]).grade, 'A')

// ★ 법정 공시는 자기보고여도 A 다. 이 축이 없으면 등급이 뒤집힌다 —
//   시범 5건에서 캐스퍼 S-1 과 듀오링고 8-K 가 블로그 2개보다 낮게 나왔다.
eq('법정 공시 1건이면 자기보고여도 A',
  gradeMove(M, [{ url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true }]).grade, 'A')
// ★ L-56: 공시 안에 있어도 발행사가 스스로 정의·집계한 지표는 A 를 만들지 않는다.
//   Nubank 20-F 가 본문에서 "not independently verified" 라고 밝힌 ARPAC 이,
//   "법정 공시 1건"이라는 이유만으로 A 로 올라가 있었다.
eq('발행사 자체 정의 지표는 공시여도 A 가 아니다',
  gradeMove(M, [{ url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: true }]).grade, 'C')
{
  // 관측 키가 있으면 "자기보고 1차뿐", 없으면 "판정할 수 없다" — 이유가 갈려야 한다.
  const keyed = gradeMove(M, [{ url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: true, observation_key: 'nu-20f-2023' }])
  check('키가 있으면 이유가 "자기보고 1차뿐"으로 읽힌다', /자기보고 1차뿐/.test(keyed.reason))
  check('그때는 잠정 등급이 아니다', keyed.provisional !== true)
}
// 같은 지표라도 **다른 원 관측**이 하나 더 붙으면 B 로 올라간다 — 이게 L-58 이 노리는 경로다.
eq('자체 정의 지표 + 다른 원 관측 1건이면 B',
  gradeMove(M, [
    { url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: true, observation_key: 'nu-20f-2023' },
    { url: 'https://www.reuters.com/y', source_tier: 'secondary', is_self_reported: false, observation_key: 'reuters-reporting-2023', supports_metric: true },
  ]).grade, 'B')
// 재무제표 본문 수치는 플래그를 달지 않는다 — 기존 A 경로가 그대로 살아 있어야 한다.
eq('플래그 없는 공시는 여전히 A',
  gradeMove(M, [{ url: 'https://www.sec.gov/z', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: false }]).grade, 'A')
eq('추정 딱지가 붙은 공시는 A 가 아니다',
  gradeMove(M, [{ url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_estimate: true }]).grade, 'C')
{
  const d = base()
  d.evidence[0].is_regulatory_filing = true // source_tier 는 secondary 인 채로
  check('공시를 2차로 적으면 error (DB CHECK 와 같은 규칙)', hasError(d, /법정 공시인데/))
}

// ★ 추정치는 뒷받침에 세지 않는다. 시범 5건에서 이 구멍이 드러났다 —
//   비상장사 매출은 조사기관 추정치뿐인데 tier·self_reported 만 보면 A 가 됐다.
eq('추정치 2곳은 A 가 아니다',
  gradeMove(M, [
    { url: 'https://sacra.com/1', source_tier: 'secondary', is_estimate: true },
    { url: 'https://other.example.org/2', source_tier: 'secondary', is_estimate: true },
  ]).grade, 'C')
check('추정치뿐이면 이유에 그렇게 적힌다',
  /추정치뿐/.test(gradeMove(M, [{ url: 'https://sacra.com/1', source_tier: 'secondary', is_estimate: true }]).reason))
eq('추정치 1곳 + 실측 1곳도 A 는 아니다 (독립 실측 1곳뿐)',
  gradeMove(M, [
    { url: 'https://sacra.com/1', source_tier: 'secondary', is_estimate: true },
    { url: 'https://news.example.com/2', source_tier: 'secondary' },
  ]).grade, 'C')
eq('추정 딱지가 붙은 1차는 A 가 아니다',
  gradeMove(M, [{ url: 'https://sec.gov/x', source_tier: 'primary', is_estimate: true }]).grade, 'C')

// 3차 출처는 수치를 확인해 주지 않는다. 원 수치를 옮겨 적은 것뿐이다.
eq('3차 출처 2곳은 A 가 아니다',
  gradeMove(M, [
    { url: 'https://blog1.example.com/1', source_tier: 'tertiary' },
    { url: 'https://blog2.example.org/2', source_tier: 'tertiary' },
  ]).grade, 'C')

// ── 3) 검증 — 통과해야 하는 것 ───────────────────────────────
eq('정상 초안은 error 0', errorsOf(base()).length, 0)

// ── 4) 검증 — 막아야 하는 것 ─────────────────────────────────
{
  const d = base(); d.evidence = []
  check('수치 있는데 근거 0건이면 error', hasError(d, /근거가 0건/))
}
{
  const d = base(); d.bottleneck = 'VIBES'
  check('어휘 밖 bottleneck 은 error', hasError(d, /bottleneck.*어휘 밖/))
}
{
  const d = base(); d.moves[0].lever = 'VIBES'
  check('어휘 밖 lever 는 error', hasError(d, /lever.*어휘 밖/))
}
{
  const d = base(); d.slug = 'Acme Tea!'
  check('공백·대문자 slug 는 error', hasError(d, /slug/))
}
{
  const d = base(); d.moves = []
  check('무브 0건은 error', hasError(d, /무브가 0건/))
}
{
  const d = base(); d.moves[0].metric_unit = null
  check('수치만 있고 단위가 없으면 error', hasError(d, /metric_name/))
}
{
  const d = base(); d.period_end = '2022-01-01'
  check('기간 역전은 error', hasError(d, /기간 역전/))
}
{
  const d = base(); d.moves[0].observed_period_end = '2022-01-01'
  check('관측 기간 역전은 error', hasError(d, /관측 기간 역전/))
}
{
  const d = base(); d.evidence[0].snippet = '가'.repeat(SNIPPET_MAX + 1)
  check('스니펫 상한 초과는 error', hasError(d, /스니펫/))
}
{
  const d = base(); d.evidence[0].published_at = '2099-01-01'
  check('미래 게시일은 error', hasError(d, /미래 날짜/))
}
{
  const d = base(); d.evidence[0].published_at = '2023/10/05'
  check('날짜 형식이 다르면 error', hasError(d, /YYYY-MM-DD/))
}
{
  const d = base(); d.evidence[0].move = 7
  check('근거가 없는 무브를 가리키면 error', hasError(d, /범위 밖/))
}
{
  const d = base(); d.evidence[0].url = '없는주소'
  check('URL 로 못 읽으면 error', hasError(d, /URL/))
}

// ── 5) 검증 — 막지는 않되 눈에 띄어야 하는 것 ────────────────
// ⚠️ warn 을 자동으로 지우면 "리서치가 얕다"는 정보 자체가 사라진다.
{
  const d = base(); d.evidence[0].published_at = null
  check('게시일 없음은 error 가 아니라 warn',
    !hasError(d, /published_at/) && warnsOf(d).some(w => /published_at/.test(w.message)))
}
{
  const d = base(); d.bottleneck = null
  check('병목 미상은 warn (매칭에서 빠진다는 경고)',
    !hasError(d, /bottleneck/) && warnsOf(d).some(w => /bottleneck/.test(w.where)))
}
{
  const d = base()
  delete d.moves[0].metric_after; delete d.moves[0].metric_before
  d.moves[0].metric_name = null; d.moves[0].metric_unit = null
  check('수치 없는 무브는 통과하되 warn', errorsOf(d).length === 0
    && warnsOf(d).some(w => /등급 D/.test(w.message)))
}
{
  const d = base()
  d.moves[0].outcome_direction = 'negative'
  d.evidence[0].source_tier = 'tertiary'
  check('부정 사례 + 낮은 등급은 발행 불가 warn',
    errorsOf(d).length === 0 && warnsOf(d).some(w => /발행 불가/.test(w.message)))
}
{
  const d = base()
  d.moves[0].outcome_direction = 'negative'
  d.evidence[0].source_tier = 'primary'
  d.evidence[0].is_self_reported = false
  check('부정 사례라도 등급 A 면 경고 없음',
    !warnsOf(d).some(w => /발행 불가/.test(w.message)))
}

// ── 6) toRows — 등급이 무브에 박히는가 ───────────────────────
{
  const { study, moves, evidence } = toRows(base())
  eq('study.tags 기본형 유지', Array.isArray(study.tags), true)
  eq('outcome_status 가 그대로 간다', study.outcome_status, 'active')
  eq('무브 1건', moves.length, 1)
  eq('secondary 단독은 C 로 박힌다', moves[0].row.evidence_grade, 'C')
  eq('근거는 손대지 않고 넘긴다', evidence.length, 1)
}
{
  // outcome_status 를 안 적었으면 'unknown' 이다. ★ 'active' 로 접지 않는다 (§7.1).
  const d = base(); delete d.outcome_status
  eq('결말 미상은 unknown 으로 저장된다', toRows(d).study.outcome_status, 'unknown')
}
{
  // 무브별로 자기 근거만 세야 한다. 다른 무브 근거를 빌려 오면 등급이 부풀려진다.
  const d = base()
  d.moves.push({ lever: 'CHANNEL', claim: 'y', metric_name: 'b', metric_after: 3, metric_unit: '배' })
  d.evidence.push({ move: 0, url: 'https://another.example.org/z', source_tier: 'secondary' })
  check('근거 없는 두 번째 무브는 error 로 잡힌다', hasError(d, /moves\[1\].*근거가 0건/))
  const { moves } = toRows(d)
  // ★ L-60 회귀. 도메인이 둘이지만 관측 키가 없다 → 독립인지 **모른다**. A 가 아니다.
  eq('0번은 도메인 2곳이어도 관측 키가 없으면 A 가 아니다', moves[0].row.evidence_grade, 'C')
  eq('1번은 자기 근거 0건이라 D', moves[1].row.evidence_grade, 'D')
}
{
  // 같은 데이터에 관측 키·수치 뒷받침을 채우면 그때 A 가 된다 — 축이 실제로 작동하는지.
  const d = base()
  d.evidence[0].observation_key = 'reporter-a-2023'
  d.evidence[0].supports_metric = true
  d.evidence.push({
    move: 0, url: 'https://another.example.org/z', source_tier: 'secondary',
    observation_key: 'reporter-b-2023', supports_metric: true,
  })
  eq('키를 채우면 같은 데이터가 A 로 올라간다', toRows(d).moves[0].row.evidence_grade, 'A')
}

// ── 6-1) L-60 / L-64 — 원 관측 키와 수치 뒷받침 ──────────────
{
  // ★ L-60. 같은 공시를 옮겨 적은 매체 2곳은 도메인 2개지만 관측 1개다.
  //   9차에 확보한 Retail Dive 원문이 정확히 이 모양이었다("according to the CFO").
  const sameObservation = [
    { url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: true, observation_key: 'chwy-10k-fy2023' },
    { url: 'https://www.retaildive.com/y', source_tier: 'secondary', is_self_reported: false, observation_key: 'chwy-10k-fy2023', supports_metric: true },
  ]
  eq('같은 공시를 받아쓴 매체는 도메인이 달라도 B 를 만들지 못한다',
    gradeMove(M, sameObservation).grade, 'C')
  check('그 이유에 "다른 원 관측 없음"이 있다',
    /다른 원 관측 없음/.test(gradeMove(M, sameObservation).reason))

  // ★ L-64. 서사만 받치는 독립 매체는 수치의 등급을 올리지 못한다.
  const narrativeOnly = [
    { url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: true, observation_key: 'chwy-10k-fy2023' },
    { url: 'https://www.dvm360.com/y', source_tier: 'secondary', is_self_reported: false, observation_key: 'dvm360-reporting-2020', supports_metric: false },
  ]
  eq('수치를 안 받치는 독립 매체는 B 를 만들지 못한다', gradeMove(M, narrativeOnly).grade, 'C')
  // 같은 행이 수치까지 받치면 그때는 B 다 — 차이를 만드는 게 supports_metric 하나뿐인지.
  const sameButOnMetric = [narrativeOnly[0], { ...narrativeOnly[1], supports_metric: true }]
  eq('그 행이 수치까지 받치면 B 가 된다', gradeMove(M, sameButOnMetric).grade, 'B')

  // ★ 미기재는 "아니다"가 아니라 "모른다". 등급은 보수적으로, 대신 provisional 로 표시.
  const unkeyed = gradeMove(M, [
    { url: 'https://www.sec.gov/x', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, is_issuer_defined_metric: true },
    { url: 'https://www.reuters.com/y', source_tier: 'secondary', is_self_reported: false },
  ])
  eq('키 미기재면 B 가 아니라 C', unkeyed.grade, 'C')
  check('그 C 는 잠정(provisional)으로 표시된다', unkeyed.provisional === true)
  check('세지 못한 건수를 돌려준다', unkeyed.unkeyed >= 1)
  check('이유가 "판정할 수 없다"로 읽힌다', /판정할 수 없다/.test(unkeyed.reason))

  // 문서 성격 경로(공시 1건 = A)는 키가 없어도 살아 있어야 한다.
  // 여기까지 보수적으로 막으면 백필 전에 A 가 통째로 무너진다 — 근거가 아니라 표기의 문제다.
  eq('키가 없어도 재무제표 공시는 여전히 A',
    gradeMove(M, [{ url: 'https://www.sec.gov/z', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true }]).grade, 'A')
  // 단, 그 공시가 "수치를 안 다룬다"고 **적혀** 있으면 A 를 만들지 못한다.
  eq('수치를 안 받친다고 적힌 공시는 A 가 아니다',
    gradeMove(M, [{ url: 'https://www.sec.gov/z', source_tier: 'primary', is_self_reported: true, is_regulatory_filing: true, supports_metric: false }]).grade, 'C')

  // foldObservations 자체
  const folded = foldObservations([
    { url: 'https://a.com', observation_key: 'k1' },
    { url: 'https://b.com', observation_key: 'k1' },
    { url: 'https://c.com', observation_key: 'k2' },
    { url: 'https://d.com' },
    { url: 'https://e.com', observation_key: '   ' },
  ])
  eq('관측 키 2종으로 접힌다', folded.keys.size, 2)
  eq('키 없는 행·공백 키는 미기재로 센다', folded.unkeyed, 2)
}

// ── 7) 어휘 사본이 마이그레이션과 어긋나지 않는가 ────────────
// 코드에서만 어휘를 늘리면 로컬은 통과하고 DB 가 23514 로 죽는다. 가장 늦게
// 발견되는 형태라, 사본이 정본(SQL CHECK)과 같은지 여기서 대조한다.
{
  const sql = await import('node:fs').then(fs =>
    fs.readFileSync('supabase/migrations/20260906000001_case_study_pipeline.sql', 'utf-8'))
  const vocabInSql = (col) => {
    const m = sql.match(new RegExp(`${col}\\s+IN \\(([^)]*)\\)`))
    return m ? m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)) : null
  }
  for (const [col, arr] of [
    ['business_model', BUSINESS_MODEL], ['bottleneck', BOTTLENECK], ['lever', LEVER],
  ]) {
    const fromSql = vocabInSql(col)
    // ★ 못 읽었으면 "일치"가 아니라 실패다. 정규식이 어긋난 걸 통과로 접지 않는다.
    check(`${col} 어휘를 SQL 에서 읽었다`, fromSql !== null && fromSql.length > 0,
      '마이그레이션에서 CHECK 를 못 찾았다 — 대조 자체가 안 됐다')
    if (fromSql) {
      eq(`${col} 어휘가 마이그레이션과 같다`, [...arr].sort().join(','), [...fromSql].sort().join(','))
    }
  }
}

// ── 8) slug 정규식 ────────────────────────────────────────────
eq('정상 slug', SLUG_RE.test('acme-tea-2023'), true)
eq('끝 하이픈 거부', SLUG_RE.test('acme-'), false)
eq('연속 하이픈 거부', SLUG_RE.test('a--b'), false)
eq('한글 slug 거부', SLUG_RE.test('에이스메'), false)

// ── 9) CG-1 발행 게이트 (L-62) ────────────────────────────────
//
// 등급 C 는 "근거가 없다"가 아니라 "제3자 확인이 없다"이다. 그래서 발행 금지가 아니라
// 조건부 발행으로 정했다 — 본문이 그 숫자의 출처를 밝히면 나간다. 여기서 지켜야 할 건
// 두 방향이다: 문구가 없는데 통과시키지 않는가, 그리고 대상이 아닌 초안을 붙잡지 않는가.
{
  const cMove = { evidence_grade: 'C', lever: 'PRODUCT_FEATURE', slug: 'chewy-autoship-retention', brand_name: 'Chewy' }
  const bMove = { evidence_grade: 'B', lever: 'PACKAGING', slug: 'chewy-autoship-retention', brand_name: 'Chewy' }

  // (a) C 등급인데 귀속 문구가 없다 → 막아야 한다
  const noAttr = '활성 고객당 순매출이 434달러에서 555달러로 올랐다. 구독을 끊을 때 잃는 것이 할인이 아니라 서비스 접근권이 되게 했다.'
  const rA = attributionGate([cMove], noAttr)
  eq('CG-1 — C 등급 + 귀속 문구 없음은 막는다', rA.ok, false)
  check('CG-1 — 막은 이유에 어느 무브인지 적는다', /chewy-autoship-retention\/PRODUCT_FEATURE/.test(rA.reason), rA.reason)

  // (b) 같은 본문에 귀속 문구를 넣으면 통과해야 한다
  const withAttr = `${noAttr} 회사가 밝힌 자체 집계 기준이다.`
  const rB = attributionGate([cMove], withAttr)
  eq('CG-1 — C 등급 + 귀속 문구 있음은 통과', rB.ok, true)
  check('CG-1 — 걸린 문구를 돌려준다', typeof rB.matched === 'string' && rB.matched.length > 0, JSON.stringify(rB.matched))
  check('CG-1 — 통과해도 확인 못 한 것을 말한다', typeof rB.caveat === 'string' && rB.caveat.length > 0, JSON.stringify(rB.caveat))

  // 브랜드 이름을 직접 대는 형태도 귀속이다
  eq('CG-1 — "Chewy가 밝힌" 도 귀속으로 센다',
    attributionGate([cMove], `${noAttr} Chewy가 밝힌 수치다.`).ok, true)

  // "업계에 따르면" 은 주체를 흐린다. 귀속이 아니다.
  eq('CG-1 — "업계에 따르면" 은 통과시키지 않는다',
    attributionGate([cMove], `${noAttr} 업계에 따르면 그렇다.`).ok, false)

  // B·A 는 이 게이트 대상이 아니다. 대상이 아닌 걸 붙잡으면 게이트가 무시당한다.
  eq('CG-1 — B 등급만이면 대상 아님', attributionGate([bMove], noAttr).ok, true)
  eq('CG-1 — A 등급만이면 대상 아님', attributionGate([{ ...bMove, evidence_grade: 'A' }], noAttr).ok, true)
  check('CG-1 — 대상 아닐 때 그 사실을 말한다', /대상이 아니다/.test(attributionGate([bMove], noAttr).reason))

  // 여러 무브 중 하나라도 C 면 대상이다
  eq('CG-1 — 무브 중 하나만 C 여도 대상', attributionGate([bMove, cMove], noAttr).ok, false)

  // 무브가 없으면 붙잡을 근거도 없다 (D 등급 단독은 애초에 수치가 없어 다른 검사가 막는다)
  eq('CG-1 — 무브 0건이면 대상 아님', attributionGate([], noAttr).ok, true)
}


// ── 결과 ──────────────────────────────────────────────────────
console.log(`\n통과 ${passed} / 실패 ${failures.length}`)
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ 케이스스터디 파이프라인 자체 검증 통과')
