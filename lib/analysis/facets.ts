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
} from '../cases/draft.ts'

/** 어휘가 정해진 5개. `market` 은 자유 텍스트라 따로 다룬다. */
export const FACET_KEYS = ['bottleneck', 'business_model', 'buyer_type', 'price_band', 'purchase_frequency'] as const
export type FacetKey = (typeof FACET_KEYS)[number]

/** 패싯 6개(= 5 + market). 진단 입력 한 벌의 이름. */
export const FACET_INPUT_KEYS = ['market', ...FACET_KEYS] as const
export type FacetInputKey = (typeof FACET_INPUT_KEYS)[number]

export type FacetOption = { value: string; label: string; hint: string }
export type FacetField = { key: FacetKey; label: string; hint: string; options: readonly FacetOption[] }

const opts = (vocab: readonly string[], table: Record<string, [string, string]>): FacetOption[] =>
  vocab.map((v) => ({ value: v, label: table[v]?.[0] ?? v, hint: table[v]?.[1] ?? '' }))

/**
 * 화면이 그대로 렌더하는 선택지. 옵션마다 한 줄 설명을 붙인다 — 어휘가 영어 대문자라
 * 라벨만 보면 D2C 와 MARKETPLACE_SELLER 를 셀러가 반대로 고른다. 패싯은 거르는 데
 * 쓰지 않고 정렬(matchMoves)에만 쓰므로, 틀리게 고르면 조용히 엉뚱한 선례가 올라온다.
 */
export const FACET_FIELDS: readonly FacetField[] = [
  {
    key: 'bottleneck',
    label: '지금 막힌 곳 (병목)',
    hint: '하나만 고른다. 여러 개가 막혀 있어도 이번 분석에서 풀 것 하나.',
    options: opts(BOTTLENECK, {
      AWARENESS:       ['인지 — 아무도 모른다', '사람들이 우리 상품이 있다는 것 자체를 모른다'],
      TRUST:           ['신뢰 — 믿지 못한다', '알긴 아는데 처음 보는 브랜드라 못 믿는다'],
      CONVERSION:      ['전환 — 보고 나간다', '상세페이지까지 왔는데 안 산다'],
      RETENTION:       ['재구매 — 한 번 사고 끝', '첫 구매는 나는데 다시 안 온다'],
      UNIT_ECONOMICS:  ['단위경제 — 팔수록 손해', '팔리는데 광고비·원가를 빼면 남는 게 없다'],
      DISTRIBUTION:    ['유통 — 놓을 자리가 없다', '입점·채널 확보가 안 된다'],
      SUPPLY:          ['공급 — 못 만든다', '주문은 오는데 생산·재고가 못 따라간다'],
    }),
  },
  {
    key: 'business_model',
    label: '사업 모델',
    hint: '돈이 들어오는 형태로 고른다.',
    options: opts(BUSINESS_MODEL, {
      D2C:                ['자사몰 D2C', '우리 사이트에서 직접 판다'],
      MARKETPLACE_SELLER: ['오픈마켓 입점', '스마트스토어·쿠팡 등 남의 장터에서 판다'],
      SUBSCRIPTION:       ['구독', '정기 결제로 매달 받는다'],
      SAAS:               ['SaaS', '소프트웨어를 월·연 단위로 빌려준다'],
      CREATOR:            ['크리에이터', '콘텐츠·팬덤이 먼저고 상품이 뒤따른다'],
      SERVICE:            ['서비스·용역', '사람이 시간을 팔아 돈을 받는다'],
      WHOLESALE:          ['도매·B2B 납품', '소매점·기업에 묶어서 넘긴다'],
      OTHER:              ['그 밖', '위 어디에도 안 맞는다'],
    }),
  },
  {
    key: 'buyer_type',
    label: '누가 사나',
    hint: '돈을 내는 쪽 기준이다. 쓰는 사람과 다르면 내는 쪽으로 고른다.',
    options: opts(BUYER_TYPE, {
      B2C:   ['개인', '개인이 자기 돈으로 산다'],
      B2B:   ['기업', '회사가 법인 카드로 산다'],
      B2B2C: ['기업 거쳐 개인에게', '기업에 팔지만 실제로 쓰는 건 그 회사 고객이다'],
    }),
  },
  {
    key: 'price_band',
    label: '가격대',
    hint: '1회 결제 기준. 구독이면 월 결제액으로 본다.',
    options: opts(PRICE_BAND, {
      LOW:        ['저가 — 3만원 미만', '고민 없이 사는 가격'],
      MID:        ['중가 — 3~15만원', '한 번은 비교해 보고 사는 가격'],
      HIGH:       ['고가 — 15만원 이상', '설득이 필요한 가격'],
      ENTERPRISE: ['엔터프라이즈 — 견적', '가격표가 없고 상담으로 정한다'],
    }),
  },
  {
    key: 'purchase_frequency',
    label: '얼마나 자주 사나',
    hint: '한 사람이 같은 상품을 다시 사는 주기.',
    options: opts(PURCHASE_FREQUENCY, {
      ONE_OFF:    ['한 번뿐', '평생 한 번 살까 말까 하는 물건'],
      OCCASIONAL: ['가끔', '몇 달에 한 번 생각날 때 산다'],
      REPEAT:     ['정기적', '떨어지면 다시 사는 소모품'],
      CONTRACT:   ['계약·구독', '끊지 않으면 계속 결제된다'],
    }),
  },
]

const VOCAB: Record<FacetKey, readonly string[]> = {
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
