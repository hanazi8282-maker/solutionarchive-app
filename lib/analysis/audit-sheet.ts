// 감사 표본 시트(남헌 v71al §2-2) — relevance-grading-sample.mjs --sheet 가 쓰는 순수 함수 두 개.
//
// 시트는 채점자용이라 **번호·원문 일부·빈 human_verdict** 만 담는다(모델 판정은 가린다 — 먼저 보면 그 답에 끌린다).
// 번호 → input_id·모델 판정 대조표는 따로 낸다(채점 뒤 되돌려 넣을 때만 연다).

/** KST 날짜 'YYYY-MM-DD' 가 every 일 주기의 생성일인가. 1970-01-01 기준 일수 % every === 0. every<=1 이면 매일. */
export function isSheetDay(kstDate: string, every: number): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kstDate)
  if (!m) return false
  if (!(every > 1)) return true
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
  return day % Math.floor(every) === 0
}

const csv = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""').replace(/\s*[\r\n]+\s*/g, ' ').trim()}"`
const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)

export interface SheetRow { input_id: string; verdict: string; text: string }

/** 엑셀이 한글을 깨지 않게 BOM 을 붙인다. */
export function buildAuditSheet(rows: readonly SheetRow[], textLen = 300): { sheet: string; key: string } {
  const BOM = '﻿'
  const sheet = [
    '번호,원문 일부,human_verdict',
    ...rows.map((r, i) => [i + 1, csv(cut(String(r.text ?? ''), textLen)), ''].join(',')),
  ].join('\n')
  const key = [
    '번호,input_id,model_verdict',
    ...rows.map((r, i) => [i + 1, csv(r.input_id), csv(r.verdict)].join(',')),
  ].join('\n')
  return { sheet: BOM + sheet + '\n', key: BOM + key + '\n' }
}
