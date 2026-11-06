// PMF 판정 B 입구(v71f L-18, Notion "[PMF 판정 B 설계 초안 2026-10-13]") — 순수 함수. 저장 없음(A안).
// 아이디어 원문·답변은 이 모듈이 어디에도 쓰지 않는다. 로그에는 길이·영역·일시만(logLine).

export const IDEA_MAX = 200
export const AUDIENCE_MAX = 100
export const ANSWER_MAX = 300

export const AREAS = [
  { code: 'a1', label: '① 회의·통화 기록' },
  { code: 'a2', label: '② 영업' },
  { code: 'a3', label: '③ 마케팅' },
  { code: 'a4', label: '④ 인사 운영' },
  { code: 'a5', label: '⑤ 리뷰 관리' },
  { code: 'out', label: '잘 모르겠음 / 영역 밖' },
] as const
export type AreaCode = (typeof AREAS)[number]['code']

/** 안내 질문 5개(모두 선택). */
export const QUESTIONS = [
  '지금 쓰는 도구는 무엇인가요?',
  '가장 불편한 순간은 언제인가요?',
  '하루(또는 한 주)에 몇 번 겪나요?',
  '이 문제로 돈을 내 본 적이 있나요?',
  '이미 시도한 우회 방법이 있나요?',
] as const

/**
 * 영역별 결론서(4칸 지도) 경로. 결론서 화면이 생긴 영역만 채운다.
 * 비어 있으면 "준비 중"으로 말한다(시제품 결론서는 별도 지시 — 이 PR 범위 밖).
 */
export const CONCLUSION_HREF: Partial<Record<AreaCode, string>> = {}

export type Entry = { idea: string; area: AreaCode; audience: string; answers: string[] }
export type ParseResult = { ok: true; entry: Entry } | { ok: false; error: string }
export type EntryResult = { kind: 'map'; href: string } | { kind: 'pending' } | { kind: 'outside' }

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function parseEntry(fd: FormData): ParseResult {
  const rawIdea = String(fd.get('idea') ?? '').replace(/\s+/g, ' ').trim()
  if (!rawIdea) return { ok: false, error: '아이디어를 한 문장으로 적어 주세요.' }
  if (rawIdea.length > IDEA_MAX) return { ok: false, error: `아이디어는 ${IDEA_MAX}자 이내로 적어 주세요.` }
  const area = String(fd.get('area') ?? '')
  if (!AREAS.some(a => a.code === area)) return { ok: false, error: '영역을 골라 주세요.' }
  return {
    ok: true,
    entry: {
      idea: rawIdea,
      area: area as AreaCode,
      audience: clip(fd.get('audience'), AUDIENCE_MAX),
      answers: QUESTIONS.map((_, i) => clip(fd.get(`q${i}`), ANSWER_MAX)),
    },
  }
}

export function resultOf(entry: Entry): EntryResult {
  if (entry.area === 'out') return { kind: 'outside' }
  const href = CONCLUSION_HREF[entry.area]
  return href ? { kind: 'map', href } : { kind: 'pending' }
}

/** 로그 한 줄 — 원문·답변·이메일은 넣지 않는다. */
export function logLine(entry: Entry, now = new Date()): string {
  return `[pmf-b] idea_len=${entry.idea.length} area=${entry.area} at=${now.toISOString()}`
}

export const pmfBEnabled = () => process.env.PMF_B_ENTRY === 'on'
