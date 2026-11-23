// 판정 기준 v2.6b **후보**(v71dx, 2026-11-23) — 운영에 적용하지 않는다. ⛔ 머지 금지·스위치 켜기 금지.
// v2.6b = v2.6 그대로 + 규칙 (24) 한 줄: 스토어 후기의 한 줄 증상은 "정보 약함"이지 오류가 아니다(남헌 11/23 확정 규칙).
//   - 근거: 남헌이 정한 채점 규칙 — 한 줄 증상만 있으면 정보약(오류 아님), 한 줄 이유가 있으면 정보있음.
//   - 이 파일은 relevance-criteria-v26.ts 를 건드리지 않고 그 시스템 프롬프트 끝에 (24)를 덧붙인다(추가 전용).
//   - 예시는 지어낸 것이다(실제 수집 글·채점 표본을 싣지 않는다).
// ⚠️ Node 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 금지.

import { RELEVANCE_V26_BLOCK, RELEVANCE_V26_VERSION } from './relevance-criteria-v26.ts'

export const RELEVANCE_V26B_VERSION = 'v26b-2026-11-23'

export const RELEVANCE_V26B_ADD = [
  '',
  '(24) 앱스토어·구글 플레이 후기에서 제품의 고장·불편을 한 줄로만 적은 글(이유·재현 조건·비교가 없다)은 관련(relevant)이고 info=true 다 — 약한 정보지만 오류가 아니다. ' +
    '"정보 없음"은 제품에 대해 아무 판단도 없는 글(감탄만, 제품과 무관한 이야기)에만 쓴다. 한 줄이라도 이유가 붙으면 약하지 않은 정보다. ' +
    '지어낸 예: relevant·info=true — "X 에서 메신저로 문자를 보내는 기능이 안 된다", "Y 는 업데이트 뒤로 자꾸 로그인 화면으로 돌아간다". ' +
    'info=false — "좋아요!!", "별로".',
].join('\n')

/** v2.6 시스템 프롬프트(systemV26FromV24 결과)를 받아 v2.6b 로 바꾼다(순수). v2.6 블록을 못 찾으면 던진다(§7.1). */
export function systemV26bFromV26(v26System: string): string {
  if (!v26System.includes(RELEVANCE_V26_BLOCK)) throw new Error('v2.6b: v2.6 블록을 못 찾았다')
  const out = v26System.replace(RELEVANCE_V26_BLOCK, () => RELEVANCE_V26_BLOCK + RELEVANCE_V26B_ADD).replace(RELEVANCE_V26_VERSION, RELEVANCE_V26B_VERSION)
  if (!out.includes('(24) 앱스토어') || out.includes(RELEVANCE_V26_VERSION)) throw new Error('v2.6b 치환 실패')
  return out
}
