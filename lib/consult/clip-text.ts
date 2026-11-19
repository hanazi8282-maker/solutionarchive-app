// 문장·낱말 경계 자르기 — 순수 함수(import 없음). 고객 화면·평가 패킷·꼬리표 저장(lib/story-label/core.mjs)이 같은 규칙을 쓴다. story-flow-select.ts 가 다시 내보낸다.
/** 문장 끝: . ! ? 。 또는 한국어 종결(다·요·음·함·임, 뒤에 마침표 선택) 뒤 공백. "$1.2k" 처럼 공백 없는 마침표는 끝이 아니다. */
export const SENTENCE_END = /(?<=[.!?。]|[다요음함임][.!?]?)\s+/
/**
 * 고객 화면 문장 자르기 — 글자 수로 문장·낱말 중간을 끊지 않는다. 한도 안이면 그대로.
 * 넘치면 한도 안에 드는 완결 문장까지만, 완결 문장이 하나도 안 들어가면 낱말(공백) 경계에서 자르고 '…'. 공백 없는 토큰($1.2k·40%)은 쪼개지 않는다.
 */
export function clipText(raw: string, max: number): string {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  let out = ''
  for (const s of t.split(SENTENCE_END)) { const next = out ? `${out} ${s}` : s; if (next.length > max) break; out = next }
  if (out) return out
  const cut = t.slice(0, max).lastIndexOf(' ')
  return `${(cut > 0 ? t.slice(0, cut) : t.slice(0, max - 1)).replace(/[\s,·:;—\-/→]+$/, '')}…`
}
/** 인용 원문용 — 낱말 중간으로는 자르지 않는다. 한도 안이면 그대로, 넘치면 한도 안에 드는 완결 문장까지만, 한 문장도 안 들어가면 자르지 않고 전부 돌려준다('…' 없음 — 원문 대조가 깨지지 않게). */
export function clipSentences(raw: string, max: number): string {
  const t = (raw ?? '').trim()
  if (t.length <= max) return t
  let out = ''
  for (const s of t.replace(/\s+/g, ' ').split(SENTENCE_END)) { const next = out ? `${out} ${s}` : s; if (next.length > max) break; out = next }
  return out || t
}
/** 꼬리표 저장 한도(lib/story-label/core.mjs clip 기본값). 옛 꼬리표는 이 글자 수에서 낱말 중간으로 잘려 저장돼 있다. */
export const LABEL_CLIP = 200
/** 옛 저장본 고치기 — 정확히 한도 길이인데 문장 끝·'…' 로 끝나지 않으면 글자 수로 잘린 것으로 보고 문장·낱말 경계로 다시 자른다. 그 밖은 그대로. */
export function healClip(s: string | null | undefined, n = LABEL_CLIP): string | null {
  if (s == null) return null
  const t = s.trim()
  return t.length >= n && !/(?:[.!?。…"')\]]|[다요음함임])$/.test(t) ? clipText(t, n - 1) : t
}
