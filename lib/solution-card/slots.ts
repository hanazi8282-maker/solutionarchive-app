// 결론서 연결(v71eg-3 2-3) — 카드 → 기존 초기형 결론서 슬롯 매핑 + 플래그 SOLUTION_CARD_SLOTS(기본 OFF) + 본문 한도·금지 규칙 검사.
// 매핑: ②→제목, ①⑤→왜, ③→근거 사례, ④→단계 목록, ⑥→귀사에 맞게 바꾼 점, ⑦→끝 한 줄, 조심할 것→주의/안 된 것. 슬롯에 안 맞는 카드는 넣지 않는다.
// 이 저장소에는 초기형 결론서 생성 코드(결론서 세션의 HTML 생성기·lint.py·EC/EF 검사)가 없다 — 그쪽 초안 JSON(`Draft`)을 받아 슬롯만 바꿔 돌려주는 순수 함수다.
// ⚠️ Node 타입 스트리핑 직접 로드: `@/` 별칭·enum 금지.
import type { CardV2 } from './card-v2.ts'

export const FLAG_NAME = 'SOLUTION_CARD_SLOTS'
/** 플래그는 문자열 'true' 일 때만 ON. 없음·그 밖의 값 = OFF(기존 결론서 그대로). 이 함수는 켜는 쪽 코드가 아니다 — 변수는 만들기만 한다. */
export const slotsEnabled = (v: string | undefined | null = typeof process !== 'undefined' ? process.env?.SOLUTION_CARD_SLOTS : undefined): boolean => String(v ?? '').trim().toLowerCase() === 'true'

export const LIMITS = { body: 6800, chapter2: 2300 } as const

export type SolutionBox = { title: string; why: string; evidence_case: string; steps: string[]; adapted: string; closing: string; caution: string | null }
export type Draft = {
  company: string
  chapter2: { solution_box: SolutionBox | null; extras: { title: string; line: string }[]; text_chars?: number }
  chapter3_cases: { who: string; line: string }[] // 3장 사례 표
  body_chars?: number
}

const sent = (s: string) => String(s ?? '').trim()
/** 카드 한 장 → 강조 솔루션 상자. 필수 칸이 비면 null(슬롯에 안 맞는 카드는 넣지 않는다). */
export function cardToSolutionBox(card: CardV2 | null | undefined): SolutionBox | null {
  if (!card || !sent(card.direction) || !Array.isArray(card.steps) || card.steps.length < 3 || !sent(card.case?.who) || !sent(card.fit) || !sent(card.after)) return null
  const c = card.cautions?.[0]
  return {
    title: sent(card.direction),
    why: [sent(card.situation?.text), sent(card.why)].filter(Boolean).join(' '),
    evidence_case: `${sent(card.case.who)}: ${sent(card.case.did)} → ${sent(card.case.result)}`,
    steps: card.steps.map((s) => `${sent(s.title)}: ${sent(s.how)}`),
    adapted: sent(card.fit), closing: sent(card.after),
    caution: c ? `${sent(c.closed_place)} — ${sent(c.cause)}. ${sent(c.reaches_us)}. ${sent(c.avoid)}` : null,
  }
}

const len = (d: Draft) => JSON.stringify(d.chapter2).length // 글자 수의 근사(JSON 구조 글자 포함 → 보수적으로 크게 잡는다)
const textLen = (b: SolutionBox | null, extras: Draft['chapter2']['extras']) => [b?.title, b?.why, b?.evidence_case, ...(b?.steps ?? []), b?.adapted, b?.closing, b?.caution, ...extras.flatMap((e) => [e.title, e.line])].filter(Boolean).join('').length

/** 플래그 ON 이고 카드가 슬롯에 맞으면 2장을 카드로 채운 새 초안을, 아니면 원본을 그대로 돌려준다(OFF = 항상 원본). 한도를 넘으면 카드를 줄인다(단계 → 주의 → 추가 제안 순). */
export function applyCardSlots(draft: Draft, cards: (CardV2 | null)[], enabled = slotsEnabled()): { draft: Draft; applied: boolean; trimmed: string[]; reason: string } {
  if (!enabled) return { draft, applied: false, trimmed: [], reason: '플래그 OFF — 기존 그대로' }
  const boxes = cards.map(cardToSolutionBox).filter((b): b is SolutionBox => !!b)
  if (!boxes.length) return { draft, applied: false, trimmed: [], reason: '슬롯에 맞는 카드 없음 — 기존 그대로' }
  const main = boxes[0], extras = boxes.slice(1).map((b) => ({ title: b.title, line: b.adapted }))
  const trimmed: string[] = []
  let box: SolutionBox = { ...main }, ex = [...extras]
  const room = () => LIMITS.chapter2 - 0
  while (textLen(box, ex) > room()) {
    if (ex.length) { ex.pop(); trimmed.push('추가 제안 1건 제외(2장 한도)'); continue }
    if (box.caution) { box = { ...box, caution: null }; trimmed.push('주의 문장 제외(2장 한도)'); continue }
    if (box.steps.length > 3) { box = { ...box, steps: box.steps.slice(0, 3) }; trimmed.push('단계 4→3(2장 한도)'); continue }
    break
  }
  const out: Draft = { ...draft, chapter2: { solution_box: box, extras: ex, text_chars: textLen(box, ex) } }
  const over = textLen(box, ex) > LIMITS.chapter2
  return { draft: out, applied: true, trimmed, reason: over ? '카드를 줄여도 2장 한도 초과 — 사람 확인' : 'ok' }
}

// ── 대체 검사(원본 EC1~EC17·EF1~EF10 코드는 이 머신에 없다 → 확인 불가. 정본 묶음 §7 과 lint.py 에서 확인된 규칙만 옮겼다) ──
const FORBID = ['완벽본', '검토용 초안', '당신', '그래서 무엇', '읽는 법', '가져간다', '보증', '고객 목소리', '소비자 언어', '이번 판', '측정 범위', '회사 발표', '확인 안 됨', '확인 못 함', 'NDIS', '왜 벽인가', '넘는 법', '매출에 닿는 길', '왜 지금인가']
export type LintResult = { rule: string; ok: boolean; detail?: string }
export function lintDraft(d: Draft): LintResult[] {
  const b = d.chapter2.solution_box
  const text = [b?.title, b?.why, b?.evidence_case, ...(b?.steps ?? []), b?.adapted, b?.closing, b?.caution, ...d.chapter2.extras.flatMap((e) => [e.title, e.line])].filter(Boolean).join('\n')
  const res: LintResult[] = []
  res.push({ rule: '2장 본문 한도 ≤2,300자', ok: textLen(b, d.chapter2.extras) <= LIMITS.chapter2, detail: String(textLen(b, d.chapter2.extras)) })
  res.push({ rule: '금지어(lint.py FORBID)', ok: !FORBID.some((w) => text.includes(w)), detail: FORBID.filter((w) => text.includes(w)).join(',') })
  res.push({ rule: '"귀사 고객이 ~합니다" 금지', ok: !/귀사 고객이[^.]*합니다/.test(text) })
  res.push({ rule: '본문에 출처 괄호 없음(부록에만 주소)', ok: !/\((https?:|www\.|출처)/.test(text) && !/https?:\/\//.test(text) })
  res.push({ rule: '이번 주 첫 행동: 1단계가 있다', ok: !!b && b.steps.length >= 3 })
  res.push({ rule: '한 문장 한 범위(문장당 쉼표 5개 이하 근사)', ok: text.split(/[.!?。]\s*/).every((s) => (s.match(/,|，/g) ?? []).length <= 5) })
  return res
}
