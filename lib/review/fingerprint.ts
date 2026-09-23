// 중복 제거 지문 계산.
//
// 설계 근거: docs/review-collection-design.md §4.5
//
// ⚠️ 이 파일이 원문 삭제와 증분 수집의 충돌을 푼다.
//
//    원문(analysis_inputs.raw_text)은 30일 뒤 비운다. 그러면 "이미 본 리뷰"를
//    판별할 근거가 사라진다. 해결은 하나뿐이다 — 지문을 원문에서 파생시키되
//    **지문이 원문에 의존하지 않게** 만드는 것. 한 번 계산해 저장하면 원문이
//    없어도 비교가 된다. 그래서 원문 30일 / 지문 무기한이다.
//
// ⚠️ 키가 둘인 이유:
//
//      identity_key — "같은 리뷰인가" 판별용. UNIQUE 대상. **본문을 넣지 않는다.**
//      content_hash — "내용이 바뀌었는가" 감지용. 제약이 아니라 관측값.
//
//    하나로는 안 된다. 본문만 해싱하면 "빠른배송 잘 받았습니다" 같은 짧고
//    흔한 리뷰가 충돌해 서로 다른 사람의 글을 중복으로 버린다. 본문까지 넣어
//    해싱하면 리뷰가 수정될 때 다른 지문이 되어 중복 적재된다.
//
//    둘 중 중복 적재가 훨씬 비싸다. 이 파이프라인의 산출물이 속성별
//    importance 인데, 같은 리뷰가 두 번 들어가면 그 불만이 두 번 세어져
//    중요도가 부풀려진다. 조용히 왜곡되고 나중에 추적이 안 된다.

import { createHash } from 'node:crypto'
import type { Fingerprint, ParsedReview } from './types.ts'

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * 본문 정규화.
 *
 * 공백 압축과 트림만 한다. 소문자화·구두점 제거까지 가면 "좋아요"와
 * "좋아요!"가 같은 해시가 되는데, 그건 수정 감지의 민감도를 떨어뜨린다.
 * content_hash 는 아무것도 막지 않으므로 민감한 편이 낫다.
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * 본문 길이 하한 — 이 길이 미만은 **교차 타깃 content_hash 방어(2차)를 적용하지
 * 않는다**(store.ts `recordFingerprint`).
 *
 * ⚠️ 이 상수가 없으면 이 파일 맨 위 경고를 정면으로 어긴다. "감사합니다" 같은
 *    짧고 흔한 본문은 서로 다른 사람의 글이 같은 해시가 되고, 그걸 중복으로
 *    버리면 조용히 데이터를 잃는다. 긴 본문의 완전 일치만 "같은 글"로 본다.
 *
 * ponytail: 120자는 실측 없이 고른 보수적 값이다. 실제로 걸러지는 건수를 보고
 * 조이거나 풀 수 있다 — 올리면 방어가 약해지고, 내리면 오탐이 늘어난다.
 */
export const CROSS_TARGET_MIN_TEXT_LEN = 120

/**
 * 지문을 만든다. 만들 수 없으면 null.
 *
 * null 을 돌려주는 경우: 소스가 준 고유번호도 없고, 조합에 쓸 재료
 * (판매처·작성자·작성일)도 전부 비었을 때.
 *
 * ⚠️ 이때 "본문 해시를 정체성으로 쓰면 되지 않나"는 함정이다. 그러면
 *    수정된 리뷰가 매번 새 리뷰로 들어가 importance 를 부풀린다 — 애초에
 *    키를 둘로 나눈 이유를 정면으로 어긴다.
 *
 *    반대로 빈 조합으로 키를 만들면 그 상품의 모든 리뷰가 **같은
 *    identity_key** 를 갖게 되어 하나만 남고 전부 사라진다. 더 나쁘다.
 *
 *    그래서 지문을 포기하고 호출부가 파싱 실패로 세게 한다. 이 상황은
 *    파서가 이미 missingIdentity 로 실패 처리하는 경우와 같아서
 *    (lib/review/adapters/danawa.ts), 건강도가 broken 으로 떨어져 소스가
 *    멈춘다. 조용히 데이터를 망가뜨리는 것보다 멈추는 게 낫다.
 *
 * ── ⚠️ 2026-09-24: externalId 가 있으면 productRef 를 키에서 뺀다 ──
 *
 *    원래는 `sha256(sourceKey|productRef|externalId)` 였다. 그래서 **같은 글이
 *    `url:` 타깃과 `board:` 타깃 두 경로로 들어오면 서로 다른 키가 되어
 *    analysis_inputs 에 두 행**이 됐다(SP-031 과 같은 형태 — 그때는 어댑터가
 *    비켜 갔지만, 게시판 순회가 붙으면서 소스 8곳이 같은 함정에 들어왔다).
 *
 *    글·댓글의 정체성은 **사이트 + 그 사이트가 준 식별자**다. 어느 타깃으로
 *    들어왔는지는 정체성이 아니라 경로이고, 그건 `review_fingerprints.product_ref`
 *    컬럼이 이미 따로 남긴다.
 *
 *    두 갈래로 갈리는 자리:
 *
 *      · `productScopedExternalId = false`(기본) — externalId 가 사이트 전역
 *        유일하다. 정규화된 경로(`/service/board/use/12345`)나 플랫폼 전역 id
 *        (HN objectID · YouTube 댓글 id · `tbr:245885`)를 쓰는 어댑터가 전부 여기다.
 *        → `sha256(sourceKey|externalId)`
 *
 *      · `productScopedExternalId = true` — externalId 가 **타깃 안에서만** 유일하다.
 *        다나와가 그렇다: 판매처 리뷰 seq 가 몰마다 다른 id 공간에서 와서
 *        (9자리 vs 11자리 0패딩) 상품으로 좁혀야 한다는 게 원래 설계 판단이다
 *        (20260829000003 마이그레이션 주석). 여기서 productRef 를 빼면 **다른
 *        상품의 다른 리뷰 둘이 한 리뷰로 뭉개진다** — 중복 적재보다 나쁜 방향이다.
 *        → `sha256(sourceKey|productRef|externalId)` (= 옛 키 그대로, 이행 없음)
 *
 *    `legacyIdentityKey` 는 **이미 옛 키로 저장된 행을 찾기 위한 것**이다.
 *    옛 키는 externalId 를 DB 에 남기지 않아 SQL 로 되계산할 수 없다 — 그래서
 *    백필이 아니라 **조회 폴백 + 히트 시 새 키로 승격**으로 이행한다
 *    (store.ts · supabase/migrations/20260930000012_fingerprint_dedupe.sql 헤더).
 */
export function computeFingerprint(
  sourceKey: string,
  productRef: string,
  review: ParsedReview,
  productScopedExternalId = false,
): Fingerprint | null {
  const normalized = normalizeText(review.text)
  const contentHash = sha256(normalized)
  const textLength = normalized.length

  if (review.externalId) {
    const scoped = sha256(`${sourceKey}|${productRef}|${review.externalId}`)
    return {
      sourceKey,
      identityKey: productScopedExternalId ? scoped : sha256(`${sourceKey}|${review.externalId}`),
      // 타깃 범위 id 는 옛 키와 새 키가 같으므로 폴백할 것이 없다(null).
      legacyIdentityKey: productScopedExternalId ? null : scoped,
      contentHash,
      textLength,
      kind: 'seq',
      productRef,
      writtenAt: review.writtenAt,
    }
  }

  const seller = review.seller ?? ''
  const author = review.authorMasked ?? ''
  const written = review.writtenAt ?? ''

  // 재료가 하나도 없으면 신뢰할 수 있는 정체성을 만들 수 없다.
  if (!seller && !author && !written) return null

  return {
    sourceKey,
    // ⚠️ 폴백 조합은 productRef 를 **그대로 남긴다.** `판매처|작성자|작성일` 만으로는
    //    사이트 안에서 유일하지 않다 — 같은 날 같은 판매처에서 같은 마스킹 이름
    //    (`vl****`)으로 다른 상품에 쓴 리뷰가 한 리뷰로 뭉개진다. 여기서는 중복
    //    적재보다 오식별이 더 비싸다.
    identityKey: sha256(`${sourceKey}|${productRef}|${seller}|${author}|${written}`),
    legacyIdentityKey: null,
    contentHash,
    textLength,
    kind: 'composite',
    productRef,
    writtenAt: review.writtenAt,
  }
}
