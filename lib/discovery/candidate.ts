// 발굴 후보 판정 — 순수 함수만. 네트워크·DB 없음.
//
// 이 파일이 답하는 것은 셋뿐이다:
//   1. 오늘은 어느 축(kind)을 뽑나            → nextKind()
//   2. 이 후보를 프로브까지 보낼 가치가 있나  → screen()
//   3. 프로브 결과로 채택인가                 → judge()
//
// ⚠️ **verdict 는 세 값이다: accepted / rejected / unverified.**
//    `unverified` 는 "못 알아봤다"이고 `rejected` 는 "알아봤는데 아니다"다.
//    이 둘을 섞으면 다나와가 구조를 바꿔 프로브가 전부 실패하는 날,
//    로그에는 "후보 2건 기각"만 찍히고 발굴이 영영 0건이 된다(CLAUDE.md §7.1).
//    그래서 judge 는 hits=null 과 hits=0 을 **반드시 다르게** 판정한다.

export type Kind = 'physical' | 'saas' | 'service'

/**
 * 이번에 뽑을 수 있는 축.
 *
 * ⚠️ `service`(무형 컨설팅·대행)는 **뺀다.** CHECK 제약에는 있지만 로직이
 *    고르지 않는다 — 검증할 VOC 프로브 경로가 아직 없어서다. 경로 없이 뽑으면
 *    전부 unverified 로 쌓여 큐만 더럽힌다. 한국어 서비스 VOC 소스를 실측해
 *    붙인 뒤에 여기 추가한다.
 */
export const ACTIVE_KINDS: Kind[] = ['physical', 'saas']

/** 같은 카테고리에서 이 수만큼 채택되면 포화. 더 뽑아도 같은 얘기만 나온다. */
export const SATURATION_LIMIT = 3

/**
 * 채택 최소 VOC 건수.
 *
 * 30 은 "한 상품/키워드에서 분석할 거리가 나오는 최소선"이다. 이보다 적으면
 * 수집을 붙여 봐야 analysis_inputs 가 한 자릿수로 끝난다.
 * env `DISCOVERY_MIN_VOC_HITS` 로 조정한다 — 상수를 고치러 오지 마라.
 */
export const MIN_VOC_HITS = 30

/**
 * 채택 최대 VOC 건수.
 *
 * 하한만 있으면 **초대형 브랜드가 전부 통과한다.** 2026-09-17 dry-run 실측:
 * Notion 79,072 · Heroku 25,461 · 다이슨 999+ · 하기스 648 — 네 건 전부
 * accepted 였다. 그 규모는 VOC 가 없어서 문제인 게 아니라 **우리 독자에게
 * 이식 가능한 규모가 아니다.** 상한도 하한과 똑같이 **실측값으로만** 거른다 —
 * LLM 에게 "대형 브랜드는 빼라"고 시키는 방식은 채택 근거를 다시 LLM 의 주장으로
 * 되돌리므로 쓰지 않는다(남헌 2026-09-18 기각).
 *
 * 500 의 근거(읽을 수 있는 실측 두 점 사이):
 *   -  93  필립스 에어프라이어 XXL — 남헌이 kept 로 판정한 값. 창 안에 있어야 한다.
 *   - 648  하기스(킴벌리클라크) — 걸러야 하는 쪽. 그래서 93 < 500 < 648.
 *   - 999  다나와 리뷰수 캡. 상한을 999 이상으로 두면 캡된 값이 전부 판정 불가가
 *          되어 physical 쪽 상한이 사실상 죽는다(judge 주석 참조).
 * env `DISCOVERY_MAX_VOC_HITS` 로 조정한다 — 상수를 고치러 오지 마라.
 *
 * ponytail: 두 축의 hits 는 스케일이 다르다(다나와=한 상품 리뷰수, 캡 999 /
 * HN=구절 댓글수, 캡 없음, 실측 최대 79,072). 지금은 한 값으로 본다. 한쪽 축만
 * 기각이 몰리면 env 를 `DISCOVERY_MAX_VOC_HITS_{PHYSICAL,SAAS}` 로 쪼개라.
 */
export const MAX_VOC_HITS = 500

export type Verdict = 'accepted' | 'rejected' | 'unverified'

export interface Judgement {
  verdict: Verdict
  reason: string
}

export interface Candidate {
  kind: Kind
  name: string
  categoryHint?: string | null
}

/** 이미 아는 것들. 이름 키는 `${kind}:${소문자 이름}`. */
export interface KnownState {
  /** 기존 후보 + 기존 프로젝트 이름 전부. */
  names: Set<string>
  /** category_hint → 채택(accepted) 건수. */
  acceptedByCategory: Map<string, number>
}

export function nameKey(kind: string, name: string): string {
  // 공백·대소문자 차이만 있는 이름은 같은 것으로 본다. UNIQUE(kind, lower(name))
  // 인덱스와 판정이 갈리면 INSERT 가 23505 로 터진다.
  return `${kind}:${(name ?? '').trim().toLowerCase()}`
}

/**
 * 이번 실행에서 뽑을 축.
 *
 * `recent` 는 **최근 것이 앞**인 kind 이력이다(created_at DESC). 가장 오래
 * 안 나온 축을 고른다 — 이력에 아예 없으면 그게 1순위다. 같은 축이 연속으로
 * 두 번 나오지 않는다(축이 2개 이상인 한).
 */
export function nextKind(recent: Array<string | null | undefined>, kinds: Kind[] = ACTIVE_KINDS): Kind {
  const lastSeen = (k: Kind): number => {
    const i = recent.findIndex((r) => r === k)
    return i < 0 ? Number.POSITIVE_INFINITY : i
  }
  // 가장 오래 안 나온 것 = lastSeen 이 가장 큰 것. 동률이면 kinds 순서.
  return kinds.reduce((best, k) => (lastSeen(k) > lastSeen(best) ? k : best), kinds[0])
}

/** 같은 카테고리 채택분이 한도에 찼나. */
export function saturated(categoryHint: string | null | undefined, known: KnownState): boolean {
  const hint = (categoryHint ?? '').trim().toLowerCase()
  if (!hint) return false
  return (known.acceptedByCategory.get(hint) ?? 0) >= SATURATION_LIMIT
}

/**
 * 프로브 전에 거르는 게이트. 통과하면 null, 걸리면 기각 사유.
 *
 * 네트워크를 쓰기 **전에** 돈다. 이미 아는 이름, 이미 충분한 카테고리에
 * 남의 서버를 때릴 이유가 없다.
 */
export function screen(cand: Candidate, known: KnownState): Judgement | null {
  const name = (cand.name ?? '').trim()
  if (!name) {
    return { verdict: 'rejected', reason: 'empty_name' }
  }
  if (known.names.has(nameKey(cand.kind, name))) {
    return { verdict: 'rejected', reason: 'already_known' }
  }
  if (saturated(cand.categoryHint, known)) {
    return { verdict: 'rejected', reason: 'duplicate_category' }
  }
  return null
}

export interface ProbeResult {
  /** 실측 VOC 건수. **null 은 "못 셌다"이지 0 이 아니다.** */
  hits: number | null
  /**
   * `999+` 처럼 소스가 상한에서 끊은 표기였나. true 면 `hits` 는 **하한선**이고
   * 진짜 값은 5만일 수도 있다. judge 가 이 필드를 못 받으면 캡된 값을 점으로
   * 오인해 초대형 상품을 "상한 이하"로 통과시킨다.
   */
  capped?: boolean
  /** 프로브가 찾아낸 product_ref. 채택되면 이게 곧 review_targets 의 값이다. */
  ref: string | null
  note: string
}

/**
 * 프로브 결과 → 판정.
 *
 * 채택 창은 **양쪽이 닫혀 있다**: `minHits ≤ hits ≤ maxHits`.
 * 하한은 "분석할 거리가 없다", 상한은 "우리 독자에게 이식 가능한 규모가 아니다"다.
 *
 * ⚠️ **실측값은 점이 아니라 구간이다.** 다나와는 리뷰수를 999 에서 끊는다
 *    (`capped=true`). `999+` 는 "999 이상"일 뿐 진짜 값을 모른다. 그래서
 *    구간 [hits, ∞) 로 판정한다:
 *      - 구간 전체가 창 밖  → rejected  (알아봤고, 아니다)
 *      - 구간이 경계를 걸침 → unverified (넘는지 아닌지 **알 수 없다**)
 *    캡된 값을 "상한 이하"로 접으면 5만 건짜리가 조용히 통과한다. 반대로
 *    전부 "상한 초과"로 접으면 정확히 999 인 멀쩡한 상품을 근거 없이 버린다.
 *    둘 다 하지 않는다 — 모르는 것은 모른다고 적는다(CLAUDE.md §7.1).
 *    기본 상한(500)에서는 `999+` 의 하한선이 이미 상한을 넘으므로 **판정이
 *    가능하고 rejected 다.** 판정 불가는 상한을 999 이상으로 올렸을 때만 난다.
 *
 * 판정 순서(바꾸지 마라):
 * - hits=null      → unverified (요청·파싱 실패. 다시 시도할 대상이다)
 * - min>max 설정   → unverified/config_error (전부 조용히 기각되는 것을 막는다)
 * - 구간 < 최소선  → rejected/insufficient_voc
 * - 구간 > 상한    → rejected/oversized_voc
 * - 경계 걸침      → unverified/bounds_unverifiable
 * - ref 없음       → unverified (셌는데 붙일 대상을 못 찾았다 = 파서가 반쪽만 읽었다)
 * - 그 밖          → accepted
 */
export function judge(
  probe: ProbeResult,
  minHits: number = MIN_VOC_HITS,
  maxHits: number = MAX_VOC_HITS,
): Judgement {
  if (probe.hits === null) {
    return { verdict: 'unverified', reason: `probe_failed: ${probe.note}` }
  }

  // 창이 뒤집힌 설정(env 오타 하나로 충분하다)은 모든 후보를 기각한다. 그걸
  // "정상 기각"으로 찍으면 발굴이 영영 0건이 되고 로그만 초록불이다(§7.2).
  if (minHits > maxHits) {
    return {
      verdict: 'unverified',
      reason: `config_error: 채택 창이 뒤집혔다 (최소 ${minHits} > 상한 ${maxHits})`,
    }
  }

  const lo = probe.hits
  const hi = probe.capped ? Number.POSITIVE_INFINITY : probe.hits
  const shown = probe.capped ? `${probe.hits}+(하한)` : String(probe.hits)

  if (hi < minHits) {
    return { verdict: 'rejected', reason: `insufficient_voc: ${shown} < ${minHits}` }
  }
  if (lo > maxHits) {
    return { verdict: 'rejected', reason: `oversized_voc: ${shown} > ${maxHits}` }
  }
  if (lo < minHits || hi > maxHits) {
    return {
      verdict: 'unverified',
      reason: `bounds_unverifiable: ${shown} 로는 채택 창 ${minHits}~${maxHits} 판정을 할 수 없다`,
    }
  }
  if (!probe.ref) {
    return { verdict: 'unverified', reason: `probe_failed: hits=${probe.hits} 인데 product_ref 를 못 만들었다` }
  }
  return { verdict: 'accepted', reason: `voc_ok: ${shown} hits` }
}
