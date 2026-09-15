// 케이스스터디 발행 게이트 — 사실확인 등급이 낮은 무브를 인용할 때의 조건.
// 네트워크도 DB 도 안 탄다. 순수 텍스트 검사다.
//
// ★ 2026-09-16: 여기서 보는 등급은 DB `case_moves.fact_check_grade`(예전 이름
//   `evidence_grade`)다. `evidence_grade` 는 그날 독자 인사이트 등급으로 의미가
//   바뀌었다(`lib/cases/draft.ts::gradeMove` 재설계) — 이 게이트가 막으려는 건
//   "사실 검증이 약한 수치가 조용히 본문에 들어가는 것"이라 사실확인 축에
//   그대로 묶는다. `lib/cases/draft.ts::factCheckGrade` 산식 그대로, 이름만 옮겼다.
//
// ★ 코드 네임스페이스: `CG-` (Case Gate). 방법론 아카이브의 `G-`(solfa 02-gate G-0~G-10,
//   pdp 02-gate G-0~G-13)와 **일부러 다른 접두사**를 쓴다. 저쪽은 남헌의 글쓰기 방법론이고
//   이건 케이스 데이터의 근거 강도에 관한 규칙이라 층위가 다르다. 같은 `G-` 아래에 번호만
//   이어 붙이면 "게이트 P-10 vs 규칙 P-10"(사고 4)과 똑같은 모양이 된다.
//   정본 설명은 `docs/case-study-pipeline-design.md`.

/** 사실확인 등급 C 무브를 인용하는 초안은 본문에 출처 귀속 문구가 있어야 발행 대기로 간다. */
export const CG_1 = 'CG-1'

/** 사실확인 등급 D 무브를 인용하는 초안 본문에는 수치가 들어갈 수 없다. */
export const CG_2 = 'CG-2'

export type GateMove = {
  /** DB 컬럼명은 `fact_check_grade`(2026-09-16 분리 전 `evidence_grade`). */
  fact_check_grade: string
  lever?: string | null
  slug?: string | null
  brand_name?: string | null
}

export type GateResult = {
  ok: boolean
  code: string
  reason: string
  /** 실제로 걸린 문구. 통과했을 때만 채워진다. 사람이 눈으로 확인하라고 돌려준다. */
  matched: string | null
  /** 이 검사가 확인하지 **못한** 것. 통과했어도 읽어야 한다. */
  caveat: string | null
}

// 주체가 '그 회사 자신'임을 문장이 스스로 밝히는 표현들.
//
// ★ 왜 이렇게 좁게 잡았나. "~에 따르면" 같은 일반 표현을 넣으면 "업계에 따르면"으로도
//   통과한다. 그건 귀속이 아니라 얼버무림이다. 검사가 통과시켜야 할 것은 "이 숫자를 말한
//   주체가 회사 자신"이라는 사실을 독자가 알 수 있는 문장뿐이다.
const SELF_MARKERS: { re: RegExp; label: string }[] = [
  { re: /자사\s*(발표|집계|기준|자료|추산)/, label: '자사 발표/집계/기준' },
  { re: /회사\s*(발표|자료|추산)/, label: '회사 발표/자료' },
  { re: /회사(가|는|의)\s*(밝힌|밝혔|발표한|발표했|공개한|공개했|공시한|공시했|집계한|집계했)/, label: '회사가 밝힌/발표한' },
  { re: /자체\s*(집계|발표|정의|기준|측정|추산)/, label: '자체 집계/정의/기준' },
  { re: /스스로\s*(밝힌|밝혔|공개한|공개했|집계한)/, label: '스스로 밝힌' },
  { re: /(공시|사업보고서|연차보고서|감사보고서|20-F|10-K|8-K|S-1)\s*(기준|상|에\s*따르면|에서\s*밝힌|에\s*적힌)/, label: '공시 기준' },
  { re: /제3자\s*검증(을|은)?\s*(받지|거치지)\s*않/, label: '제3자 검증 없음 명시' },
  { re: /독립(적으로)?\s*검증(되지|하지)\s*않/, label: '독립 검증 없음 명시' },
]

// 브랜드 이름을 직접 대고 "밝혔다/발표했다"로 잇는 형태.
const ATTRIBUTION_VERB = /(밝힌|밝혔|발표한|발표했|공개한|공개했|공시한|공시했|집계한|집계했)/
/** 브랜드명과 귀속 동사 사이에 이 정도까지는 다른 말이 끼어도 같은 문장으로 본다. */
const NAMED_WINDOW = 25

function findSelfMarker(body: string): string | null {
  for (const { re, label } of SELF_MARKERS) {
    const m = re.exec(body)
    if (m) return `${label} ("${m[0]}")`
  }
  return null
}

function findNamedMarker(body: string, names: string[]): string | null {
  for (const name of names) {
    if (!name) continue
    let from = 0
    for (;;) {
      const at = body.indexOf(name, from)
      if (at < 0) break
      const window = body.slice(at + name.length, at + name.length + NAMED_WINDOW)
      const v = ATTRIBUTION_VERB.exec(window)
      if (v) return `이름 귀속 ("${name}…${v[0]}")`
      from = at + name.length
    }
  }
  return null
}

/**
 * CG-1. 사실확인 등급 C 무브를 인용하는 초안은 본문에 출처 귀속 문구를 달아야 한다.
 *
 * 왜 금지가 아니라 조건부인가: C 는 "근거가 없다"가 아니라 "제3자 확인이 없다"이다.
 * 버리면 케이스 13건이 죽는다. 대신 독자가 그 숫자의 출처를 알고 읽게 만든다 —
 * Nubank 20-F 가 스스로 "not independently verified"라고 적는 것과 같은 수위다.
 *
 * ★ 이 검사가 확인하는 것: **귀속 문구가 본문에 있는가.**
 *   확인하지 못하는 것: 그 문구가 **문제의 그 수치에 붙어 있는가.**
 *   문구를 아무 데나 한 줄 넣어도 통과한다. 그래서 통과는 "사람이 안 봐도 된다"가 아니라
 *   "사람이 볼 준비가 됐다"는 뜻이다(§7.1 — 통과를 양성으로 읽지 마라).
 */
export function attributionGate(moves: GateMove[], body: string): GateResult {
  const cMoves = moves.filter(m => m.fact_check_grade === 'C')
  if (cMoves.length === 0) {
    return {
      ok: true,
      code: CG_1,
      reason: `사실확인 등급 C 무브가 없다 — ${CG_1} 대상이 아니다 (사실확인 등급 ${moves.map(m => m.fact_check_grade).join(',') || '없음'})`,
      matched: null,
      caveat: null,
    }
  }

  const names = cMoves.flatMap(m => [m.brand_name, m.slug]).filter(Boolean) as string[]
  const matched = findSelfMarker(body) ?? findNamedMarker(body, names)

  const where = cMoves.map(m => `${m.slug ?? '?'}/${m.lever ?? '?'}`).join(', ')
  if (matched) {
    return {
      ok: true,
      code: CG_1,
      reason: `사실확인 등급 C 무브 ${cMoves.length}건(${where})을 인용하는데 귀속 문구가 있다`,
      matched,
      caveat: '문구가 본문에 있다는 것만 확인했다. 그 문구가 그 수치에 붙어 있는지는 사람이 읽어야 안다.',
    }
  }

  return {
    ok: false,
    code: CG_1,
    reason: `사실확인 등급 C 무브 ${cMoves.length}건(${where})을 인용하는데 본문에 출처 귀속 문구가 없다`,
    matched: null,
    caveat: null,
  }
}

// ────────────────────────────────────────────────────────────
// CG-2 — 사실확인 등급 D 초안의 숫자 차단
// ────────────────────────────────────────────────────────────
//
// 왜 지금 생겼나. 이식성 축(20260915000001)이 **사실확인 등급 D 무브를 여는 문을 하나 냈다** —
// `transferability === 'HIGH'` 인 D 는 앵글 후보가 된다. 사실확인 D 는 정의상 "수치가
// 없는 무브"다. 그러니 그 무브를 딛고 쓴 글에 숫자가 나오면 그 숫자는 우리 근거에서
// 나온 게 아니다. 작가의 기억이거나 모델의 환각이다.
//
// "등급을 내려도 §7.1 은 안 내려간다"의 구체적 장치다. 근거 없는 숫자가 본문에
// 들어오는 **유일한 신규 경로**를 그 자리에서 닫는다.
//
// ★ 이 검사가 확인하는 것: 사실확인 등급 D 를 인용한 본문에 수치 표기가 있는가.
//   확인하지 못하는 것: 그 숫자가 **그 D 무브에 대한 것인가.** 다른 A 무브의
//   숫자를 같은 글에 적었어도 걸린다. 그건 과차단이 아니라 설계다 — 한 글은
//   무브 1개를 딛고 쓰고(작가 규칙), 그래서 본문의 숫자는 그 무브의 것이어야 한다.
const NUMERIC_CLAIM = /\d+\s*(%|배|억|만원|명|[xX])/

/** 사실확인 등급 D 무브를 인용하는 초안 본문에 수치 표기가 있으면 막는다. */
export function numericGate(moves: GateMove[], body: string): GateResult {
  const dMoves = moves.filter(m => m.fact_check_grade === 'D')
  if (dMoves.length === 0) {
    return {
      ok: true,
      code: CG_2,
      reason: `사실확인 등급 D 무브가 없다 — ${CG_2} 대상이 아니다 (사실확인 등급 ${moves.map(m => m.fact_check_grade).join(',') || '없음'})`,
      matched: null,
      caveat: null,
    }
  }

  const where = dMoves.map(m => `${m.slug ?? '?'}/${m.lever ?? '?'}`).join(', ')
  const hit = NUMERIC_CLAIM.exec(body)
  if (!hit) {
    return {
      ok: true,
      code: CG_2,
      reason: `사실확인 등급 D 무브 ${dMoves.length}건(${where})을 인용하는데 본문에 수치 표기가 없다`,
      matched: null,
      caveat: '수치 표기가 없다는 것만 확인했다. 숫자 없이 쓴 문장이 과장인지는 사람이 읽어야 안다.',
    }
  }
  return {
    ok: false,
    code: CG_2,
    reason: `사실확인 등급 D 무브 ${dMoves.length}건(${where})을 인용하는데 본문에 수치 "${hit[0]}" 가 있다 — 사실확인 D 는 수치가 없는 무브다. 이 숫자는 우리 근거에서 나오지 않았다`,
    matched: null,
    caveat: null,
  }
}

export function numericHint(): string[] {
  return [
    '사실확인 등급 D 는 "근거가 약하다"가 아니라 **"수치 자체가 없다"**이다. 그 무브에서 나올 수 있는 숫자는 없다.',
    '고르는 길은 둘뿐이다:',
    '  · 본문에서 숫자를 빼라. 수치 없이 메커니즘만으로 쓴다 — D 무브가 원래 그런 소재다.',
    '  · 숫자가 꼭 필요하면 그 숫자의 출처를 case_evidence 에 넣고 재채점해라(등급이 올라간다).',
    '기억이나 짐작으로 숫자를 적지 마라. 그게 이 파이프라인을 통째로 무효로 만드는 한 가지다.',
  ]
}

/** 사람에게 뭘 쓰라고 알려 주는 문구. 에러 메시지에서 그대로 쓴다. */
export function attributionHint(): string[] {
  return [
    '사실확인 등급 C 는 "근거가 없다"가 아니라 "제3자 확인이 없다"이다. 그 사실을 독자가 알고 읽게 하라.',
    '본문에 아래 중 하나를 넣어라 (자기 귀속이 드러나는 표현이어야 한다):',
    ...SELF_MARKERS.map(m => `  · ${m.label}`),
    '  · 브랜드 이름 + 밝혔다/발표했다 (예: "Chewy가 밝힌 바로는")',
    '"업계에 따르면" 처럼 주체를 흐리는 표현은 통과하지 않는다 — 그건 귀속이 아니라 얼버무림이다.',
  ]
}
