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
 */
export function computeFingerprint(
  sourceKey: string,
  productRef: string,
  review: ParsedReview,
): Fingerprint | null {
  const contentHash = sha256(normalizeText(review.text))

  if (review.externalId) {
    return {
      sourceKey,
      identityKey: sha256(`${sourceKey}|${productRef}|${review.externalId}`),
      contentHash,
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
    identityKey: sha256(`${sourceKey}|${productRef}|${seller}|${author}|${written}`),
    contentHash,
    kind: 'composite',
    productRef,
    writtenAt: review.writtenAt,
  }
}
