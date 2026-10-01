// 한국어 케이스 글 기계적 정규화 — 순수 함수. AI 호출 0 · 네트워크 0 · 부수효과 0.
// 범위: voice-guide.md §0·§2(본문 기호 금지) 위반 중 **공백·기호 수준**만 고친다. 어휘·어순·의미는 손대지 않는다(윤문 금지).
//
//   normalizeKo(text, opts?) → { text, changes, manual }
//     particle-space  영문·숫자·% 뒤 공백 + 한 글자 조사  "Deckers 가" → "Deckers가", "52.5% 로" → "52.5%로"
//     arrow           수치 전후 비교 "A → B로" → "A에서 B로" (왼쪽이 수치 한 덩이, 오른쪽이 "수치(+단위)로" 일 때만)
//     em-dash         완결 평어체 문장 뒤 " — " + 다음 절도 평어체로 끝남 → ". " (문장 나눔)
//     bold · emoji    마크다운 굵은 글씨 표시 제거 · 이모지 제거
// 확신 없는 자리는 고치지 않고 manual 에 올린다. 고친 것도 한 건씩 ko-style gate 를 통과해야 남는다 —
// 실패하면 그 한 건을 되돌리고(roll-back) manual 로 보낸다. 마지막에 원문↔결과 전체 gate 를 한 번 더 본다.
// 멱등: 결과를 다시 넣으면 changes 0, 텍스트 동일(selftest 가 확인).
import { endingOf, gate, PLAIN_ENDINGS, splitSentences, type InvariantOpts } from './ko-style.ts'

export type Rule = 'particle-space' | 'arrow' | 'em-dash' | 'bold' | 'emoji' | 'fixpoint'
export type Change = { rule: Rule; before: string; after: string; at: number } // at = 그 규칙 패스 시작 시점 텍스트의 위치
export type Manual = { rule: Rule; excerpt: string; reason: string }
export type NormalizeResult = { text: string; changes: Change[]; manual: Manual[] }
type Edit = { start: number; end: number; to: string }
type Found = { edits: Edit[]; manual: { at: number; reason: string }[] }

// ── 조사 앞 공백 ─────────────────────────────────────────────────────────────
// 한 글자 조사만. 뒤가 공백·문장부호·끝이어야 한다("Deckers 가격"의 '가'는 조사가 아니다).
export const PARTICLE_SPACE_RE = /([A-Za-z0-9%])( +)([가는은를을이와과로에의도만께])(?=[\s.,!?;:)\]'"’”]|$)/g
// 수 뒤 '만'(1,000 만)·'도'(섭씨 2 도)는 수사·단위라 조사가 아닐 수 있다 → 손대지 않는다(manual 에도 안 올린다).
const DIGIT_UNIT_LIKE = /^[만도]$/
/** 스캔용: 자동 후보가 될 수 있는 조사 앞 공백 건수(수 뒤 만·도 제외). 지시 관형사 의심 '이'도 센다. */
export const particleSpaceCount = (t: string) => [...t.matchAll(PARTICLE_SPACE_RE)].filter((m) => !(/\d/.test(m[1]) && DIGIT_UNIT_LIKE.test(m[3]))).length
// 자동 목록 밖이지만 사람이 볼 자리: 두 글자 이상 조사, 괄호·따옴표 뒤 조사
const MULTI_PARTICLE_RE = /([A-Za-z0-9%])( +)(에서|으로|에게|까지|부터|보다|처럼|이다|이며|이고|였다|이었다|에는|에도|와의|과의|이라는|라는)(?=[\s.,!?;:)\]'"’”]|$)/g
const AFTER_CLOSER_RE = /([)\]'"’”])( +)([가는은를을이와과로에의도만])(?=[\s.,!?;:)\]'"’”]|$)/g

function findParticleSpace(t: string): Found {
  const edits: Edit[] = []
  const manual: Found['manual'] = []
  for (const m of t.matchAll(PARTICLE_SPACE_RE)) {
    const [, prev, sp, p] = m
    const at = m.index! + 1
    if (/\d/.test(prev) && DIGIT_UNIT_LIKE.test(p)) continue
    // "FY2024 이 회사는" — 지시 관형사 '이'와 주격 조사 '이'를 공백만으로는 못 가른다
    if (p === '이' && /\s/.test(t[at + sp.length + 1] ?? '')) { manual.push({ at, reason: "뒤에 공백이 오는 '이'는 지시 관형사('이 회사')일 수 있다" }); continue }
    edits.push({ start: at, end: at + sp.length, to: '' })
  }
  for (const m of t.matchAll(MULTI_PARTICLE_RE)) manual.push({ at: m.index! + 1, reason: `두 글자 이상 조사 '${m[3]}' 앞 공백 — 자동 목록 밖이라 사람이 본다` })
  for (const m of t.matchAll(AFTER_CLOSER_RE)) manual.push({ at: m.index! + 1, reason: '괄호·따옴표 뒤 조사 앞 공백 — 괄호 안이 수식인지 주어인지 기계가 못 가른다' })
  return { edits, manual }
}

// ── 화살표 ──────────────────────────────────────────────────────────────────
// 수치 한 덩이: 1억5,450만 · 19.8백만 · 33.6% · $125 · 750명
const NUM_CHUNK = String.raw`\$?\d[\d,]*(?:\.\d+)?(?:조|억|천만|백만|만|천)?`
const VALUE = String.raw`(?:${NUM_CHUNK})+(?:%|배|명|원|달러|개|건|곳|회|점|위)?`
const LEFT_VALUE_RE = new RegExp(`^${VALUE}$`)
const RIGHT_VALUE_RE = new RegExp(String.raw`^${VALUE}(?: (?:달러|원|엔|유로|명|개|건))?로(?=[\s,.!?;:)]|$)`)
const ARROW_RE = /[ \t]*→[ \t]*/g

function findArrow(t: string): Found {
  const edits: Edit[] = []
  const manual: Found['manual'] = []
  for (const m of t.matchAll(ARROW_RE)) {
    const start = m.index!
    const end = start + m[0].length
    const before = t.slice(0, start)
    const left = before.match(/(\S+)$/)?.[1] ?? ''
    const ahead = before.slice(0, before.length - left.length).trimEnd()
    const right = t.slice(end)
    if (ahead.endsWith('→') || /^\S+?[ \t]*→/.test(right)) { manual.push({ at: start, reason: '화살표가 셋 이상 이어진 연쇄 — "A에서 B로"로 풀 수 없다' }); continue }
    if (!LEFT_VALUE_RE.test(left)) { manual.push({ at: start, reason: '화살표 왼쪽이 수치 한 덩이가 아니다(흐름·시점 나열일 수 있다)' }); continue }
    if (!RIGHT_VALUE_RE.test(right)) { manual.push({ at: start, reason: '화살표 오른쪽이 "수치(+단위)로"로 끝나지 않는다 — 조사를 지어 붙여야 해서 손대지 않는다' }); continue }
    edits.push({ start, end, to: '에서 ' })
  }
  return { edits, manual }
}

// ── em-dash ─────────────────────────────────────────────────────────────────
const DASH_RE = /[ \t]*—[ \t]*/g
const balanced = (s: string) => {
  const n = (re: RegExp) => (s.match(re) ?? []).length
  return n(/\(/g) === n(/\)/g) && n(/'/g) % 2 === 0 && n(/"/g) % 2 === 0 && n(/“/g) === n(/”/g) && n(/‘/g) === n(/’/g) && n(/\[/g) === n(/]/g)
}
function findDash(t: string): Found {
  const edits: Edit[] = []
  const manual: Found['manual'] = []
  for (const m of t.matchAll(DASH_RE)) {
    const start = m.index!
    const end = start + m[0].length
    const leftSent = splitSentences(t.slice(0, start)).pop() ?? ''
    const rightSent = splitSentences(t.slice(end))[0] ?? ''
    if (!/[가-힣]다$/.test(leftSent) || !PLAIN_ENDINGS.includes(endingOf(leftSent))) { manual.push({ at: start, reason: '줄표 앞이 완결된 평어체 문장이 아니다(삽입구·명사구일 수 있다)' }); continue }
    if (!balanced(leftSent)) { manual.push({ at: start, reason: '줄표가 괄호·따옴표 안에 있다' }); continue }
    if (!rightSent || rightSent.includes('—') || !PLAIN_ENDINGS.includes(endingOf(rightSent))) { manual.push({ at: start, reason: '줄표 뒤 절이 평어체 문장으로 끝나지 않는다(명사구·인용·짝 줄표) — 나누면 조각 문장이 된다' }); continue }
    edits.push({ start, end, to: '. ' })
  }
  return { edits, manual }
}

// ── 굵은 글씨 · 이모지 ──────────────────────────────────────────────────────
function findBold(t: string): Found {
  const edits: Edit[] = []
  for (const m of t.matchAll(/\*\*([^*\n]+)\*\*/g)) edits.push({ start: m.index!, end: m.index! + m[0].length, to: m[1] })
  const left = t.replace(/\*\*([^*\n]+)\*\*/g, '')
  const manual = /\*\*/.test(left) ? [{ at: t.indexOf('**'), reason: '짝이 안 맞거나 여러 줄에 걸친 굵은 글씨 표시' }] : []
  return { edits, manual }
}
const EMOJI_RE = /( ?)(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)( ?)/gu
function findEmoji(t: string): Found {
  const edits: Edit[] = []
  for (const m of t.matchAll(EMOJI_RE)) edits.push({ start: m.index!, end: m.index! + m[0].length, to: m[1] && m[3] ? ' ' : '' })
  return { edits, manual: [] }
}

// 순서: 굵은 글씨·이모지를 먼저 걷는다("**Deckers** 가" → "Deckers 가" → 같은 바퀴에서 붙임). 아래 고정점 반복이 있어 순서가 결과를 바꾸지는 않는다.
const PASSES: [Rule, (t: string) => Found][] = [['bold', findBold], ['emoji', findEmoji], ['particle-space', findParticleSpace], ['arrow', findArrow], ['em-dash', findDash]]
const excerpt = (t: string, at: number, w = 20) => t.slice(Math.max(0, at - w), at + w).replace(/\s+/g, ' ')
// 한 규칙의 변환이 다른 자리를 새로 자격 있게 만들 수 있다(짝 줄표 "A다 — B다 — C다"). 더 바뀌지 않을 때까지 돌려야 멱등이다.
// ponytail: 상한 5바퀴 — 실제로는 2바퀴면 끝난다. 상한에 걸리면 조용히 끝내지 않고 manual 에 남긴다(§7.2).
const MAX_ROUNDS = 5

export function normalizeKo(text: string, opts: InvariantOpts = {}): NormalizeResult {
  if (typeof text !== 'string') throw new TypeError('normalizeKo: text 가 문자열이 아니다')
  let cur = text
  const changes: Change[] = []
  let manual: Manual[] = []
  let settled = false
  for (let round = 0; round < MAX_ROUNDS && !settled; round++) {
    manual = [] // manual 은 마지막(아무것도 안 바뀐) 바퀴 것만 남긴다 — 그게 최종 텍스트 기준이다
    settled = true
    for (const [rule, find] of PASSES) {
      const { edits, manual: man } = find(cur)
      const base = cur
      for (const m of man) manual.push({ rule, excerpt: excerpt(base, m.at), reason: m.reason })
      // 뒤에서부터 적용하면 앞쪽 위치가 안 밀린다. 한 건마다 gate — 실패하면 그 한 건만 되돌린다.
      const done: Change[] = []
      for (const e of [...edits].sort((a, b) => b.start - a.start)) {
        const next = cur.slice(0, e.start) + e.to + cur.slice(e.end)
        const g = gate(cur, next, opts)
        if (g.passed) { cur = next; settled = false; done.push({ rule, before: excerpt(base, e.start, 12), after: excerpt(next, e.start, 12), at: e.start }) }
        else manual.push({ rule, excerpt: excerpt(base, e.start), reason: `roll-back: '${base.slice(e.start, e.end)}'→'${e.to}' 가 불변 검사를 못 넘었다 — ${g.reasons.join(' / ')}` })
      }
      changes.push(...done.reverse())
    }
  }
  if (!settled) return { text, changes: [], manual: [...manual, { rule: 'fixpoint', excerpt: excerpt(text, 0), reason: `${MAX_ROUNDS}바퀴 안에 고정점에 못 갔다 — 멱등이 보장되지 않아 원문을 그대로 두고 사람이 본다` }] }
  if (cur !== text) {
    const g = gate(text, cur, opts)
    if (!g.passed) {
      return { text, changes: [], manual: [...manual, ...changes.map((c) => ({ rule: c.rule, excerpt: c.before, reason: `roll-back(전체): 건별로는 통과했지만 원문 대비 전체 gate 실패 — ${g.reasons.join(' / ')}` }))] }
    }
  }
  return { text: cur, changes, manual }
}
