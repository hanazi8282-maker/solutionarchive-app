// posts.body(발행 대기 Threads 초안) 문체 기계 점검 — content/guides/voice-guide.md 요약.
// scripts/column-check.mjs checkThreads() 와 같은 규칙 집합이지만 대상 형식이 다르다
// (거긴 drafts/columns/*.threads.md 의 "## N편" 블록, 여긴 posts.body 평문).
//
// 사람 검수를 대신하지 않는다 — 기계로 거를 수 있는 것만 본다(§10-9 인과 표현처럼
// "맥락상 맞는지"는 여전히 사람 몫). 통과해도 배지일 뿐, 최종 판단은 /dashboard 에서 사람이.

const len = (s: string) => [...s].length
const SYMBOLS = /[→⇒←—]/
const GATE_TERMS = /\(출처|S-1|8-K|10-K|제3자 검증/
// voice-guide.md §2-2: 2026-09-11 이후 케이스 서술(모드 A)은 평어체 질문으로 정착했다.
// 그 전 초안은 과거 기록이라 위반으로 세지 않는다 — 규칙이 생기기 전 글이다.
const POLITE_ENDING = /(나요|가요|습니까|입니까)\??\s*$/
const VOICE_GUIDE_SETTLED_FROM = '2026-09-11'
const GENERIC_OPEN = /^(사람들은|소비자는|고객은|창업자는|보통은?|누구나|대부분은)\s/

export type ThreadCheckResult = { errors: string[]; warns: string[]; chars: number }

export function checkThreadPost(body: string, createdAt: string | Date): ThreadCheckResult {
  const text = (body ?? '').replace(/\r/g, '').trim()
  const errors: string[] = []
  const warns: string[] = []
  const chars = len(text)

  if (chars > 500) errors.push(`본문 ${chars}자 — 500자 초과(voice-guide §4). 넘으면 Threads 가 자동 분할한다`)
  if (SYMBOLS.test(text)) errors.push('본문에 기호(→ ⇒ ← —) — voice-guide §2-3/§5')
  if (GATE_TERMS.test(text)) errors.push('본문에 출처 괄호·게이트 용어(S-1/8-K/10-K/제3자 검증) — 자기답글로 빼야 한다(voice-guide §2-3)')

  const date = typeof createdAt === 'string' ? createdAt : createdAt.toISOString()
  if (date >= VOICE_GUIDE_SETTLED_FROM && POLITE_ENDING.test(text)) {
    warns.push('마무리가 해요체/합쇼체로 끝남 — 모드 A(케이스 서술)는 평어체 질문이 2026-09-11부터 정착(voice-guide §2-2)')
  }
  const firstLine = text.split('\n')[0] ?? ''
  if (GENERIC_OPEN.test(firstLine)) warns.push(`훅이 일반론으로 시작("${firstLine.slice(0, 20)}…") — 이 사례만의 문장인지 확인`)

  return { errors, warns, chars }
}
