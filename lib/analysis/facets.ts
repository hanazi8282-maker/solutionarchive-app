// PMF 진단 입력(패싯) 어휘 · 한국어 라벨 · 순수 검증기.
//
// 어휘의 정본은 마이그레이션 CHECK 이고, 코드 사본은 `lib/cases/draft.ts` 한 벌이다.
// 여기서 배열을 다시 적지 않고 그걸 그대로 가져온다 — 어긋나면 INSERT 가 23514 로 죽는데
// 그건 가장 늦게 발견되는 형태다(draft.ts 헤더). 라벨만 이 파일이 가진다.
//
// 쓰는 곳: POST/PATCH /api/analyze/projects · GET/PUT /api/profile · /analyze/new · /settings/profile.
// DB·네트워크를 타지 않는다 — scripts/analyze-projects-facets-selftest.mjs 가 이 파일만 돌린다.

import {
  BOTTLENECK, BUSINESS_MODEL, BUYER_TYPE, PRICE_BAND, PURCHASE_FREQUENCY,
  READER_PROBLEM_LABEL, READER_PROBLEMS,
} from '../cases/draft.ts'

/**
 * 어휘가 정해진 6개. `market` 은 자유 텍스트라 따로 다룬다.
 *
 * `reader_problem` 이 **맨 앞**이다 — 케이스 추천의 유일한 하드필터라 화면에서 먼저 물어야 한다
 * (docs/profile-recommend-analysis-design.md). 나머지는 정렬에만 쓴다.
 * ⚠️ 이 키가 늘면 POST /api/analyze/projects · PUT /api/profile 이 INSERT 에 그 컬럼을 싣는다.
 *    마이그 20260930000003 이 배포보다 먼저 가야 하고, 안 갔을 때의 방어막은 이 파일 맨 아래
 *    `isMissingColumn` 이다.
 */
export const FACET_KEYS = ['reader_problem', 'bottleneck', 'business_model', 'buyer_type', 'price_band', 'purchase_frequency'] as const
export type FacetKey = (typeof FACET_KEYS)[number]

/** 패싯 6개(= 5 + market). 진단 입력 한 벌의 이름. */
export const FACET_INPUT_KEYS = ['market', ...FACET_KEYS] as const
export type FacetInputKey = (typeof FACET_INPUT_KEYS)[number]

export type FacetOption = { value: string; label: string; hint: string }
export type FacetField = { key: FacetKey; label: string; hint: string; options: readonly FacetOption[] }

const opts = (vocab: readonly string[], table: Record<string, [string, string]>): FacetOption[] =>
  vocab.map((v) => ({ value: v, label: table[v]?.[0] ?? v, hint: table[v]?.[1] ?? '' }))

/**
 * 문제 유형 한 줄 설명. **라벨은 여기 없다** — 라벨 정본은 config/reader-problems.json
 * (`READER_PROBLEM_LABEL`)이고 그건 이미 완성된 문장이다. 여기는 셀러 어투로 한 번 더 풀어 주는 줄만 둔다.
 * 어휘가 통째로 갈아끼워지면 이 표에 없는 코드는 설명 없이 라벨만 뜬다 — 값이 사라지는 것보다 낫다.
 */
const READER_PROBLEM_HINT: Record<string, string> = {
  MAKE_BUT_NO_MONEY: '제품은 돌아가는데 결제가 안 붙는다',
  NO_FIRST_CUSTOMER: '만들어는 놨는데 아직 아무도 안 썼다',
  PRICE_TOO_LOW:     '팔리긴 하는데 남는 게 없다',
  ONE_OFF_ONLY:      '한 번 결제하고 갱신이 안 된다',
  NO_CHANNEL:        '어디에 내놓아야 할지 모르겠다',
  SOLO_CEILING:      '문의는 오는데 혼자라 못 따라간다',
  NOBODY_TRUSTS_ME:  '무명이라 첫 거래가 안 붙는다',
}

/**
 * 화면이 그대로 렌더하는 선택지. 옵션마다 한 줄 설명을 붙인다 — 어휘가 영어 대문자라
 * 라벨만 보면 D2C 와 MARKETPLACE_SELLER 를 셀러가 반대로 고른다. 패싯은 거르는 데
 * 쓰지 않고 정렬(matchMoves)에만 쓰므로, 틀리게 고르면 조용히 엉뚱한 선례가 올라온다.
 *
 * 2026-09-23: 라벨·설명만 SaaS 1인 창업가 어투로 고쳤다(가격대는 원화 월 결제액 기준).
 * **어휘(value)는 그대로다** — DB CHECK + lib/cases/draft.ts 3중 결합이라 건드리면 23514 다.
 */
export const FACET_FIELDS: readonly FacetField[] = [
  {
    // 어휘·라벨 정본은 config/reader-problems.json 이다(READER_PROBLEM_LABEL 이 그걸 읽는다).
    // 여기서 코드를 다시 적지 않는다 — 어긋나면 INSERT 가 23514/400 으로 죽는다(이 파일 헤더 규약).
    // 라벨 자체가 완성된 문장이라 옵션별 hint 는 비워 둔다.
    key: 'reader_problem',
    label: '지금 겪는 문제 유형',
    hint: '이 값이 추천을 좁히는 유일한 조건이다. 비워 두면 전체에서 고른다.',
    options: READER_PROBLEMS.map((code) => ({
      value: code, label: READER_PROBLEM_LABEL[code] ?? code, hint: READER_PROBLEM_HINT[code] ?? '',
    })),
  },
  {
    key: 'bottleneck',
    label: '지금 막힌 곳 (병목)',
    hint: '하나만 고른다. 여러 개가 막혀 있어도 이번 분석에서 풀 것 하나.',
    options: opts(BOTTLENECK, {
      AWARENESS:       ['인지 — 아무도 모른다', '이런 도구가 있다는 것 자체를 모른다'],
      TRUST:           ['신뢰 — 믿지 못한다', '알긴 아는데 처음 보는 팀이라 데이터·결제를 못 맡긴다'],
      CONVERSION:      ['전환 — 결제를 안 한다', '무료로는 쓰는데 유료 플랜으로 안 넘어간다'],
      RETENTION:       ['잔존 — 몇 달 쓰고 해지', '결제는 시작하는데 얼마 안 가 구독을 끊는다'],
      UNIT_ECONOMICS:  ['단위경제 — 쓸수록 손해', '요금보다 인프라·지원·획득 비용이 더 든다'],
      DISTRIBUTION:    ['유통 — 알릴 자리가 없다', '검색·커뮤니티·마켓플레이스 어디에도 자리가 없다'],
      SUPPLY:          ['공급 — 손이 모자란다', '문의·요청은 오는데 혼자라 개발·대응이 못 따라간다'],
    }),
  },
  {
    key: 'business_model',
    label: '사업 모델',
    hint: '돈이 들어오는 형태로 고른다.',
    options: opts(BUSINESS_MODEL, {
      D2C:                ['자사몰 D2C', '우리 사이트에서 직접 판다'],
      MARKETPLACE_SELLER: ['오픈마켓 입점', '스마트스토어·쿠팡 등 남의 장터에서 판다'],
      SUBSCRIPTION:       ['구독', '소프트웨어가 아닌 것을 정기 결제로 매달 받는다'],
      SAAS:               ['SaaS', '웹·앱 제품을 월·연 구독으로 빌려준다'],
      CREATOR:            ['크리에이터', '콘텐츠·팬덤이 먼저고 제품이 뒤따른다'],
      SERVICE:            ['서비스·용역', '사람이 시간을 팔아 돈을 받는다(외주·컨설팅)'],
      WHOLESALE:          ['도매·B2B 납품', '소매점·기업에 묶어서 넘긴다'],
      OTHER:              ['그 밖', '위 어디에도 안 맞는다'],
    }),
  },
  {
    key: 'buyer_type',
    label: '누가 사나',
    hint: '돈을 내는 쪽 기준이다. 쓰는 사람과 다르면 내는 쪽으로 고른다.',
    options: opts(BUYER_TYPE, {
      B2C:   ['개인', '개인이 자기 카드로 결제한다'],
      B2B:   ['기업', '회사가 법인 카드·세금계산서로 결제한다'],
      B2B2C: ['기업 거쳐 개인에게', '기업에 팔지만 실제로 쓰는 건 그 회사 고객이다'],
    }),
  },
  {
    key: 'price_band',
    label: '가격대',
    hint: '월 결제액 기준. 연 결제면 12로 나눈 값으로 본다.',
    options: opts(PRICE_BAND, {
      LOW:        ['저가 — 월 1만원 미만 / 무료', '고민 없이 카드 꽂는 가격'],
      MID:        ['중가 — 월 1~10만원', '한 번은 비교해 보고 결제하는 가격'],
      HIGH:       ['고가 — 월 10만원 이상', '팀장 결재가 필요한 가격'],
      ENTERPRISE: ['엔터프라이즈 — 견적', '가격표가 없고 상담으로 정한다'],
    }),
  },
  {
    key: 'purchase_frequency',
    label: '얼마나 자주 결제하나',
    hint: '한 고객이 같은 제품에 다시 돈을 내는 주기.',
    options: opts(PURCHASE_FREQUENCY, {
      ONE_OFF:    ['한 번뿐', '평생 라이선스처럼 한 번 사면 끝'],
      OCCASIONAL: ['가끔', '필요한 달에만 켰다 끈다'],
      REPEAT:     ['정기적', '매달 결제하는 구독 — 언제든 해지할 수 있다'],
      CONTRACT:   ['계약·약정', '연 단위 계약이라 중간에 못 끊는다'],
    }),
  },
]

const VOCAB: Record<FacetKey, readonly string[]> = {
  reader_problem:     READER_PROBLEMS,
  bottleneck:         BOTTLENECK,
  business_model:     BUSINESS_MODEL,
  buyer_type:         BUYER_TYPE,
  price_band:         PRICE_BAND,
  purchase_frequency: PURCHASE_FREQUENCY,
}

const LABEL_OF: Record<FacetInputKey, string> =
  Object.fromEntries([['market', '시장'], ...FACET_FIELDS.map((f) => [f.key, f.label])]) as Record<FacetInputKey, string>

export type FacetPatch = Partial<Record<FacetInputKey, string | null>>

export type FacetParse =
  | { ok: true; values: FacetPatch; keys: FacetInputKey[] }
  | { ok: false; field: FacetInputKey; error: string }

/** 시장 한 줄이 무한정 길어지면 진단 프롬프트를 먹는다. 자르지 않고 막는다(조용히 버리지 않는다). */
export const MARKET_MAX = 200

/**
 * 요청 본문에서 패싯만 뽑아 검증한다. **없는 키는 건드리지 않는다**(PATCH 의미).
 * 빈 문자열·null 은 "지운다"(null)로 읽는다 — 화면의 "선택 안 함" 이 그것이다.
 * 어휘 밖 값은 조용히 null 로 접지 않고 실패시킨다: 접으면 사람이 고른 값이 사라진 걸
 * 아무도 모른 채 진단이 다른 선례를 물어 온다(§7.1).
 */
export function parseFacets(body: unknown): FacetParse {
  const src = (body ?? {}) as Record<string, unknown>
  const values: FacetPatch = {}
  const keys: FacetInputKey[] = []

  for (const key of FACET_KEYS) {
    if (!(key in src)) continue
    const raw = src[key]
    keys.push(key)
    if (raw == null || raw === '') { values[key] = null; continue }
    if (typeof raw !== 'string') {
      return { ok: false, field: key, error: `${LABEL_OF[key]}(${key}) 값이 문자열이 아니다.` }
    }
    const v = raw.trim()
    if (v === '') { values[key] = null; continue }
    if (!VOCAB[key].includes(v)) {
      return {
        ok: false,
        field: key,
        error: `${LABEL_OF[key]}(${key}) 값이 어휘에 없다: "${v}". 허용: ${VOCAB[key].join(', ')}`,
      }
    }
    values[key] = v
  }

  if ('market' in src) {
    const raw = src.market
    keys.push('market')
    if (raw == null) values.market = null
    else if (typeof raw !== 'string') {
      return { ok: false, field: 'market', error: '시장(market) 값이 문자열이 아니다.' }
    } else {
      const v = raw.trim()
      if (v.length > MARKET_MAX) {
        return { ok: false, field: 'market', error: `시장(market) 은 ${MARKET_MAX}자를 넘을 수 없다 (현재 ${v.length}자).` }
      }
      values.market = v === '' ? null : v
    }
  }

  return { ok: true, values, keys }
}

// ── 컬럼 미적용 방어 ─────────────────────────────────────────
/**
 * "그 컬럼이 없다"를 뜻하는 코드 — PostgREST 는 `PGRST204`, Postgres 는 `42703` 으로 답한다.
 *
 * 왜 필요한가: `FACET_KEYS` 에 `reader_problem` 이 들어간 순간 POST /api/analyze/projects 와
 * PUT /api/profile 이 그 키를 INSERT/UPSERT 에 싣는다. 마이그 20260930000003 이 배포보다 늦게
 * 적용되면 두 라우트가 통째로 죽는다(설계서 리스크). 그래서 쓰는 곳은 그 키를 빼고 **1회만**
 * 재시도하고, 무엇을 왜 뺐는지 로그에 남긴다 — 조용히 무시하면 사람이 고른 문제 유형이 저장되지
 * 않은 것을 아무도 모르고, 그건 안전장치가 버그를 감추는 꼴이다(§7.1 · §7.2).
 */
export const MISSING_COLUMN_CODES: readonly string[] = ['42703', 'PGRST204']
/** 로그에 그대로 박는 문구. 이 줄이 보이면 마이그레이션을 적용하라는 뜻이다. */
export const MISSING_COLUMN_HINT = '마이그 20260930000003 미적용'
/** 마이그 20260930000003 으로 생기는 컬럼들 — 재시도할 때 빼는 키가 이것뿐이다. */
export const MIGRATION_20260930000003_KEYS: readonly string[] = ['reader_problem', 'competitor_url']

export function isMissingColumn(code: string | null | undefined): boolean {
  return typeof code === 'string' && MISSING_COLUMN_CODES.includes(code)
}

/** 키 몇 개를 뺀 사본. 원본은 건드리지 않는다(재시도 payload 용). */
export function omitKeys<T extends Record<string, unknown>>(row: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)))
}
