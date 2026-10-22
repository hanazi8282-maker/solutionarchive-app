'use server'

import { requireAllowedUser } from '@/lib/auth/session'
import { logLine, parseEntry, pmfBEnabled, resultOf, type EntryResult } from '@/lib/pmf-b/entry'

// 서버 액션(POST) — 아이디어 원문·답변은 이 함수 안에서만 살고 응답 뒤 버려진다(저장 안 함, A안).
// URL·쿠키·DB 어디에도 쓰지 않는다. 기존 idea_query_log 도 건드리지 않는다.
export type PmfBState = { error?: string; area?: string; result?: EntryResult } | null

export async function submitPmfB(_prev: PmfBState, fd: FormData): Promise<PmfBState> {
  if (!pmfBEnabled()) return { error: '지금은 열려 있지 않습니다.' }
  const guard = await requireAllowedUser()
  if (!guard.ok) return { error: '로그인이 필요합니다.' }
  const parsed = parseEntry(fd)
  if (!parsed.ok) return { error: parsed.error }
  console.log(logLine(parsed.entry))
  return { area: parsed.entry.area, result: resultOf(parsed.entry) }
}
