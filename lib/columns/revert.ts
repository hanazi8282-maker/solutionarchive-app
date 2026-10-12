// 칼럼 승인 취소(approved → draft)의 감사 메모. 순수 함수 하나 — scripts/columns-markdown-selftest.mjs 가 검사한다.
//
// 승인 취소는 review_note 한 칸에 흔적을 남긴다(스키마 변경 없음): 누가·언제·왜 되돌렸고 이전 메모가 무엇이었나.
// 이전 메모를 지우지 않는다 — 앞에 취소 줄을 붙이고 이전 내용은 `이전 메모:` 뒤에 그대로 둔다.

export const REVERT_TAG = '[승인 취소]'

export function revertNote(o: { by: string; at: string; reason?: string | null; prev?: string | null }): string {
  const reason = (o.reason ?? '').trim() || '사유 미기재'
  const prev = (o.prev ?? '').trim()
  return `${REVERT_TAG} ${o.at} ${o.by} — ${reason}${prev ? ` | 이전 메모: ${prev}` : ''}`
}
