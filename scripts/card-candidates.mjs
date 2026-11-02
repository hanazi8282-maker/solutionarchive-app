// 카드 후보 행(v71bv) — CMO 일일 루프 해설(analyst) 끝의 `## 카드 후보` 목록을 Notion "일일 상태 로그"에
// `[카드 후보 YYYY-MM-DD]` 제목 행 1개로 올린다. 아침 브리핑(07:00 KST)이 이 DB 만 읽기 때문이다.
// 새 크론·새 시크릿 없음 — daily-cmo-loop(05:17 KST 예약, Actions 지연 1~3h 가능)의 해설 단계에 붙는다.
// 후보가 없으면 행을 만들지 않는다(빈 행 = "후보 0"이 아니라 "해설이 형식을 안 지킴"이라 구분해 돌려준다).
import { existingTitles, recordStatusLog, DEFAULT_STATUS_LOG_DB_ID } from './notion-status-log.mjs'

export const cardTitle = (date) => `[카드 후보 ${date}]`

/** `## 카드 후보` 제목 아래 `- `/`1. ` 목록 최대 3줄. 섹션이 없으면 null(형식 미준수), 있는데 비면 []. */
export function extractCardCandidates(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const at = lines.findIndex((l) => /^#{1,4}\s*카드 후보\s*$/.test(l.trim()))
  if (at < 0) return null
  const out = []
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,4}\s/.test(l.trim())) break
    const m = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(l)
    if (m && out.length < 3) out.push(m[1].trim())
  }
  return out
}

/** 반환: { status: 'written'|'exists'|'no_section'|'empty'|'failed', ... }. throw 하지 않는다. */
export async function recordCardCandidates({ text, date, runUrl = null, pendingDir = null,
  token = process.env.NOTION_API_TOKEN, dbId = process.env.NOTION_STATUS_LOG_DB_ID || DEFAULT_STATUS_LOG_DB_ID,
  lookup = existingTitles, record = recordStatusLog }) {
  const items = extractCardCandidates(text)
  if (items === null) return { status: 'no_section' }
  if (!items.length) return { status: 'empty' }
  const title = cardTitle(date)
  try {
    if (token) {
      const q = await lookup(token, dbId, title)
      if (!q.ok) return { status: 'failed', error: `기존 행 조회 실패 — ${q.error}` } // 못 봤으면 만들지 않는다(중복 방지)
      if (q.titles.includes(title)) return { status: 'exists', title }
    }
    const r = await record({
      date, track: 'CMO', title,
      done: items.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      blocked: '', next: '남헌·CMO 가 3개 중 고른다(자동 제작·발행 없음)',
      needsHuman: false, note: `v71bv 카드 후보 · ${runUrl ?? '로컬 실행'}`,
    }, { token, dbId, pendingDir })
    return r.ok ? { status: 'written', title } : { status: 'failed', error: `${r.stage}: ${r.error}`, pendingPath: r.pendingPath }
  } catch (e) {
    return { status: 'failed', error: e.message }
  }
}
