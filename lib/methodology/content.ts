// 방법론 공개 페이지의 **내용**. 렌더는 app/library/methodology/page.tsx 가 한다.
//
// 왜 데이터와 렌더를 갈랐나: 공개 디자인 시스템(`app/_pub/`)이 아직 없다. 껍데기가
// 나중에 `_pub` 컴포넌트로 갈릴 예정이라, 그때 이 파일은 손대지 않는다.
//
// ★ 여기 적는 것은 **이미 문서·코드에 있는 규칙뿐**이다. 새 규칙을 이 파일에서
//   만들지 않는다. 각 섹션의 `sources` 가 그 정본 경로다. 등급표가 실제 산식과
//   갈리면 `scripts/methodology-selftest.mjs` 가 실패한다 (CLAUDE.md §7.1).

import {
  READER_PROBLEMS, READER_PROBLEM_LABEL,
  type Evidence, type Grade, type Move,
} from '../cases/draft.ts'

/** 이 페이지 기준의 최종 갱신일. 코드·문서를 고치면 같이 올린다. */
export const UPDATED_AT = '2026-09-23'

export type Table = {
  caption: string
  head: readonly string[]
  rows: readonly (readonly string[])[]
}

export type Section = {
  id: string
  title: string
  /** 300자 이내. 규칙의 요약이고, 정본은 sources 다. */
  body: string
  table: Table
  sources: readonly string[]
}

// ── 1) 무엇을 케이스로 삼나 ──────────────────────────────────────
// 독자 문제 어휘는 config/reader-problems.json 이 정본이라 여기서 옮겨 적지 않고 읽는다.
// (사본을 두면 그게 드리프트 지점이 된다 — 파일이 바뀌면 이 표도 같이 바뀐다.)
const readerProblemTable: Table = {
  caption: '독자 문제 7코드 — 어휘 정본은 config/reader-problems.json (잠정)',
  head: ['코드', '뜻'],
  rows: READER_PROBLEMS.map((code) => [code, READER_PROBLEM_LABEL[code] ?? '(라벨 미기재)']),
}

// ── 2) 사실확인 등급 ────────────────────────────────────────────
const factCheckTable: Table = {
  caption: '사실확인 등급 — "이 수치가 얼마나 검증 가능한가"만 본다',
  head: ['등급', '조건'],
  rows: [
    ['A', '법정 공시 1개(발행사가 스스로 정의·집계한 지표는 제외) · 또는 비자기보고 1차 출처 1개 · 또는 서로 다른 원 관측 2개 이상'],
    ['B', '자기보고 1차 출처 1개 + 다른 원 관측 1개'],
    ['C', '근거는 있으나 위에 못 미침 (자기보고뿐 · 추정치뿐 · 교차 확인 없음)'],
    ['D', '수치 자체가 없다 — 서술만'],
  ],
}

// ── 3) 인사이트 등급 ────────────────────────────────────────────
const insightTable: Table = {
  caption: '인사이트 등급 — 케이스 목록의 "등급" 배지. 독자가 옮길 게 있나를 본다',
  head: ['등급', '조건'],
  rows: [
    ['A', '구체적 행동 + 전제 + 뒷받침 근거 전부 있음'],
    ['B', '구체적 행동은 있으나 전제(옮기려면 뭐가 있어야 하나) 미기재'],
    ['C', '행동이 짧거나(15자 미만) 다른 사례에도 붙는 일반론 · 또는 구체적 행동인데 뒷받침 근거가 없다'],
    ['D', '행동(내일 할 수 있는 최소 행동 1개) 미기재 — 사실이 맞아도 독자가 할 게 없다'],
  ],
}

// ── 4) PMF 등급 S×T ────────────────────────────────────────────
const pmfTable: Table = {
  caption: 'PMF 등급 = 신호 강도 S(0~3) × 이식성 T(0~3) 합성 — 설계 확정, 코드 구현은 아직 없다',
  head: ['등급', '조건', '뜻'],
  rows: [
    ['A', 'S3 & T≥2, 또는 S2 & T3', '크게 됐고, 내일 옮길 수 있다'],
    ['B', 'S2 & T2, S3 & T1, S1 & T3', '하나가 아쉽다'],
    ['C', 'S1 & T≤2, S2 & T1', '작거나 옮기기 어렵다'],
    ['D', 'S0 (수치 없음 또는 방향 불분명)', '결과 불분명 — 매칭·스코어링 입력에서 빼되 저장은 유지'],
  ],
}

/**
 * PMF 등급은 아직 코드에 없다. `lib/cases/draft.ts` 에 `pmfGrade` 가 생기면 위 표는
 * "설계"가 아니라 "산식"이 되므로, 그때 이 플래그와 화면 문구를 함께 고쳐야 한다.
 * 셀프테스트가 그 시점을 잡는다.
 */
export const PMF_GRADE_IMPLEMENTED = false

// ── 5) 발행하지 않는 것 ────────────────────────────────────────
const gateTable: Table = {
  caption: '발행 게이트 — 판정만 하고, 실제 게시는 사람이 직접 한다',
  head: ['코드·사유', '무엇을 막나'],
  rows: [
    ['CG-1', '사실확인 C 무브를 인용한 글: 본문에 출처 귀속 문구가 없으면 발행 대기함으로 올라가지 않는다. "업계에 따르면" 같은 얼버무림은 통과하지 않는다'],
    ['CG-2', '사실확인 D 무브를 인용한 글에 수치 표기가 있으면 막는다. D 는 정의상 수치가 없는 무브라, 그 글의 숫자는 우리 근거에서 나온 게 아니다'],
    ['인사이트 D', '앵글 후보에서 제외. 예외는 사람이 이식성 HIGH 로 판정한 무브 한정이고, 그 문에 CG-2 가 자물쇠로 붙는다'],
    ['확인 불가', '미기재를 "아니다"로 접지 않는다. 판정할 수 없으면 등급을 올리지 않고 "잠정"으로 표시한다'],
  ],
}

// ── 6) 리뷰 소스 판정 ──────────────────────────────────────────
const sourceTable: Table = {
  caption: '리뷰 소스 3종 판정 — 켜기 전에 사람이 robots·약관을 읽고 정한다',
  head: ['판정', '뜻', '실제 예'],
  rows: [
    ['채택', 'robots 가 리뷰 경로를 허용하고, 리뷰 원문·별점·날짜가 실제로 읽힌다', '다나와'],
    ['불가(robots)', 'robots 가 리뷰 경로를 금지한다. 같은 User-agent 그룹이 여러 번 나오면 병합해서 본다(RFC 9309 §2.2.1)', '화해'],
    ['불가(기술)', 'robots 는 허용하나 정적 fetch 로 리뷰 본문이 오지 않는다. 봇을 명시적으로 막아 둔 곳은 규칙의 문자가 허용이어도 가지 않는다', '글로우픽'],
  ],
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'case-unit',
    title: '무엇을 케이스로 삼나',
    body:
      '단위는 브랜드가 아니라 무브다 — 레버 하나로 내린 결정 한 번. 케이스마다 '
      + '"이 이야기를 옮겨 쓸 독자가 지금 막혀 있는 지점"을 코드 1개로 붙인다. 선정 1순위는 '
      + '브랜드 이름도 등급도 아니고 이식성이다. 어휘는 아래 7개로 고정돼 있고 아직 잠정이다. '
      + '브랜드가 겪은 병목에서 독자 문제를 자동으로 채우지 않는다 — 짐작값이 다음 조사 수요를 '
      + '결정하는 오염 경로라서다.',
    table: readerProblemTable,
    sources: ['config/reader-problems.json', 'docs/case-study-pipeline-design.md §9'],
  },
  {
    id: 'evidence',
    title: '근거를 어떻게 매기나',
    body:
      '출처는 서로 독립인 축으로 적는다: 1·2·3차 등급, 자기보고 여부, 추정치 여부, 법정 공시 '
      + '여부. 창업자 인터뷰는 1차이면서 자기보고다. 독립은 도메인이 아니라 원 관측으로 센다 — '
      + '같은 10-K 를 받아쓴 기사 둘은 관측 1개다. 3차 출처와 추정치는 수치 뒷받침으로 세지 '
      + '않고, 미기재는 "아니다"가 아니라 "확인하지 않았다"라서 역시 세지 않는다.',
    table: factCheckTable,
    sources: ['docs/evidence-rules.md §1·§3', 'lib/cases/draft.ts factCheckGrade'],
  },
  {
    id: 'insight',
    title: '인사이트 등급',
    body:
      '케이스 목록에 찍히는 등급은 "수치가 얼마나 검증됐나"가 아니라 "독자가 읽고 옮길 게 '
      + '있나"를 본다. 행동·전제·뒷받침 근거 세 가지로 갈린다. 전제가 비어 있는 것은 "전제가 '
      + '없다"가 아니라 "아직 안 적었다"로 읽는다. 사실확인은 없어지지 않았고, 발행 게이트가 '
      + '보는 바닥으로 남는다.',
    table: insightTable,
    sources: ['lib/cases/draft.ts gradeMove', 'docs/case-study-pipeline-design.md §9'],
  },
  {
    id: 'pmf',
    title: 'PMF 등급 S×T',
    body:
      '2026-09-23 확정한 축. 신호 강도 S("그래서 얼마나 됐나")와 이식성 T("타인이 내일 할 수 '
      + '있나")를 0~3 으로 매겨 합성한다. S 는 사람이 채점 카드에서 고른다. T 는 사람 판정이 '
      + '먼저이고, 미판정이면 전제 문장으로 뽑되 "잠정"을 붙인다 — 미판정을 LOW 로 접지 않는다. '
      + '실패 사례도 A 가 될 수 있고(반증 강도로 센다), 성공·실패 방향을 함께 적는다.',
    table: pmfTable,
    sources: ['reports/2026-09-23/pmf-grade-axis-design.md §3'],
  },
  {
    id: 'not-published',
    title: '무엇을 발행하지 않나',
    body:
      '등급이 낮다고 지우지 않는다. 대신 문 앞에 자물쇠를 둔다. 막힌 글은 버려지지 않고 초안으로 '
      + '눕는다 — 본문을 날리면 사람이 고칠 대상 자체가 사라진다. 게이트가 확인하는 것은 귀속 '
      + '문구가 본문에 있는가뿐이고, 그것이 문제의 그 수치에 붙어 있는지는 못 본다. 그래서 통과는 '
      + '"사람이 안 봐도 된다"가 아니라 "사람이 볼 준비가 됐다"는 뜻이다.',
    table: gateTable,
    sources: [
      'docs/case-study-pipeline-design.md §7',
      'docs/evidence-rules.md §5',
      'lib/cases/publish-gate.ts',
      'CLAUDE.md §7.1',
    ],
  },
  {
    id: 'review-sources',
    title: '리뷰 소스를 어떻게 고르나',
    body:
      '소스를 켜기 전에 robots.txt 와 약관을 사람이 읽는다. robots 를 못 받은 것은 "허용"이 '
      + '아니라 "판단 불가"이고, 그때는 가지 않는다. 봇을 명시적으로 막아 둔 곳은 규칙의 문자가 '
      + '허용이어도 자동 수집을 원하지 않는다는 의사표시로 읽는다. 403·429 를 한 번이라도 받으면 '
      + '그 소스를 그 자리에서 끄고 재시도하지 않는다.',
    table: sourceTable,
    sources: ['docs/review-collection-design.md §1·§5', 'lib/review/robots.ts', 'CLAUDE.md §7.1'],
  },
]

/**
 * 위 등급표가 실제 산식과 갈리지 않는지 확인할 대표 케이스.
 * `scripts/methodology-selftest.mjs` 가 `factCheckGrade`/`gradeMove` 를 실제로 돌려
 * `expect` 와 맞춰 보고, `expect` 가 표의 등급 행에 있는지도 본다.
 * 문서와 코드가 갈리면 실패한다 — 이 페이지는 공개물이라 조용한 드리프트가 가장 비싸다.
 */
export type GradeFixture = {
  label: string
  axis: 'fact_check' | 'insight'
  expect: Grade
  move: Move
  evidence: Evidence[]
}

const numbered: Move = {
  lever: 'PRICING',
  claim: '가격을 올리면서 반품 보장을 붙였다',
  metric_name: '재구매율',
  metric_before: 21,
  metric_after: 50,
  metric_unit: '%',
}

const filing: Evidence = {
  url: 'https://www.sec.gov/example-10k',
  source_tier: 'primary',
  is_self_reported: true,
  is_regulatory_filing: true,
  is_estimate: false,
  is_issuer_defined_metric: false,
  observation_key: 'example-10k-fy2023',
  supports_metric: true,
}

const founderInterview: Evidence = {
  url: 'https://brand.example.com/interview',
  source_tier: 'primary',
  is_self_reported: true,
  is_estimate: false,
  is_regulatory_filing: false,
  observation_key: 'founder-interview-2023',
  supports_metric: true,
}

const tradePress: Evidence = {
  url: 'https://trade.example.com/article',
  source_tier: 'secondary',
  is_self_reported: false,
  is_estimate: false,
  is_regulatory_filing: false,
  observation_key: 'trade-audit-2023',
  supports_metric: true,
}

const action = '가격표에서 최저가 옵션을 빼고 보장 문구를 상세 첫 화면으로 올린다'

export const GRADE_FIXTURES: readonly GradeFixture[] = [
  { label: '법정 공시 1건', axis: 'fact_check', expect: 'A', move: numbered, evidence: [filing] },
  {
    label: '자기보고 1차 + 다른 원 관측 1개', axis: 'fact_check', expect: 'B',
    move: numbered, evidence: [founderInterview, tradePress],
  },
  { label: '자기보고 1차뿐', axis: 'fact_check', expect: 'C', move: numbered, evidence: [founderInterview] },
  {
    label: '수치 없음(서술만)', axis: 'fact_check', expect: 'D',
    move: { ...numbered, metric_after: null }, evidence: [founderInterview],
  },
  {
    label: '행동 + 전제 + 근거', axis: 'insight', expect: 'A',
    move: { ...numbered, transfer_note: action, preconditions: '지난 3개월 재구매 데이터와 반품 처리 여력' },
    evidence: [filing],
  },
  {
    label: '행동은 있고 전제 미기재', axis: 'insight', expect: 'B',
    move: { ...numbered, transfer_note: action }, evidence: [filing],
  },
  {
    label: '행동이 일반론', axis: 'insight', expect: 'C',
    move: { ...numbered, transfer_note: '다른 브랜드도 가격을 올리면서 보장을 붙였다', preconditions: '없음' },
    evidence: [filing],
  },
  { label: '행동 미기재', axis: 'insight', expect: 'D', move: numbered, evidence: [filing] },
]

/** 셀프테스트가 `expect` 를 대조할 표. 화면에 나가는 그 표와 같은 객체다. */
export const GRADE_TABLE: Readonly<Record<GradeFixture['axis'], Table>> = {
  fact_check: factCheckTable,
  insight: insightTable,
}
