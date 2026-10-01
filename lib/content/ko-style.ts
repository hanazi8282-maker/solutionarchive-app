// 한국어 윤문 검증용 측정 도구 — 순수 함수만. AI 호출 0 · 네트워크 0 · 부수효과 0.
// 정본 패턴 목록: content/guides/korean-naturalness/patterns.md (selftest 가 이 파일과 코드 상수를 양방향 대조한다).
//
//   metrics(text)          문장 리듬·패턴 건수 (전/후 변화로 본다 — 절대 기준값 없음)
//   compare(before, after) 두 텍스트의 지표 + 차이
//   invariants(before, after) 보존 검사. 각 검사는 pass / fail / unknown 3상태(CLAUDE.md §7.1)
//   gate(before, after)    불변 전부 pass ∧ 길이비 0.7~1.3 ∧ 변경률 ≤ 0.5 ∧ 평어체 유지 → {passed, warn, reasons}
//                          후속 단계의 DB 적용 게이트로도 쓴다. unknown 은 통과가 아니다.
//
// 근사인 곳(한계): 문장 분리(줄바꿈=경계, 약어 목록 고정), 어미 분류(마지막 1~2음절), 한글 고유명사(병기·직함·조직 접미사 3경로만).
// 이 파일은 상대 import 가 없어야 한다 — selftest --mutate 가 같은 폴더에 사본을 만들어 import 한다.

export type Group = 'A' | 'B' | 'C' | 'E'
export type Status = 'pass' | 'fail' | 'unknown'
type Ctx = { text: string; sentences: string[] }
export type Pattern = { id: string; group: Group; doc: string; count: (c: Ctx) => number }

const cp = (s: string) => [...s].length
const nonWs = (s: string) => cp(s.replace(/\s+/g, ''))
const all = (re: RegExp) => (c: Ctx) => (c.text.match(re) ?? []).length
const HANGUL = /[가-힣]/
const jong = (ch: string) => (HANGUL.test(ch) ? (ch.charCodeAt(0) - 0xac00) % 28 : -1) // 받침 인덱스: ㄴ=4 ㄹ=8 ㅆ=20

// ── 패턴(patterns.md [A][B][C][E]) ──────────────────────────────────────────
// doc = patterns.md 에 적힌 항목 문자열(괄호 설명 제거본). selftest 가 이 문자열이 md 의 해당 그룹에 정확히 있는지 본다.
export const PATTERNS: Pattern[] = [
  { id: 'A-tonghae', group: 'A', doc: '~을/를 통해', count: all(/[을를]\s?통해/g) },
  { id: 'A-isseoseo', group: 'A', doc: '~에 있어서', count: all(/에\s?있어서/g) },
  { id: 'A-daehan', group: 'A', doc: '~에 대한', count: all(/에\s?대한/g) },
  { id: 'A-uihae', group: 'A', doc: '~에 의해', count: all(/에\s?의(해|하여|한)/g) },
  { id: 'A-inhae', group: 'A', doc: '~로 인해', count: all(/로\s?인(해|하여|한)/g) },
  { id: 'A-ganeung', group: 'A', doc: '~하는 것이 가능하다', count: all(/것이\s?가능(하|한|했)/g) },
  // "할 수 있다" — 앞 음절이 ㄹ 받침(할·될·볼·쓸)일 때만. "회원 수 있다" 같은 명사 '수'를 뺀다.
  { id: 'A-su-itda', group: 'A', doc: '~할 수 있다 반복', count: (c) => [...c.text.matchAll(/([가-힣])\s수\s?있/g)].filter((m) => jong(m[1]) === 8).length },
  { id: 'A-doeeojin', group: 'A', doc: '~되어진다', count: all(/되어\s?(지|진|졌)/g) },
  { id: 'A-boyeojin', group: 'A', doc: '~보여진다', count: all(/보여\s?(지|진|졌)/g) },
  { id: 'A-bullyeojin', group: 'A', doc: '~불려진다', count: all(/불려\s?(지|진|졌)/g) },
  // 대명사 '그' = 조사가 붙은 꼴만(그는·그가·그의·그를·그에게). 관형사 "그 회사"는 자연스러운 한국어라 세지 않는다.
  { id: 'A-geu', group: 'A', doc: '그', count: all(/(?<![가-힣])그(는|가|의|를|에게)(?![가-힣])/g) },
  { id: 'A-geunyeo', group: 'A', doc: '그녀', count: all(/그녀/g) },
  { id: 'A-geudeul', group: 'A', doc: '그들', count: all(/(?<![가-힣])그들/g) },
  // ponytail: '~의'로 끝나는 명사(회의·주의·논의)도 센다. 3연속일 때만이라 드물다 — 오탐이 보이면 불용어 목록을 붙인다.
  { id: 'A-ui3', group: 'A', doc: '관형격 "의" 3연속 이상', count: all(/(?:[가-힣A-Za-z0-9]+의\s+){3,}/g) },

  { id: 'B-cheotjjae', group: 'B', doc: '첫째·둘째·셋째 기계적 나열', count: (c) => c.sentences.filter((s) => /^(첫째|둘째|셋째|넷째|다섯째)(?=[,\s]|로)/.test(s)).length },
  { id: 'B-dansunhan', group: 'B', doc: '"단순한 ~가 아니라 ~다"', count: all(/단순(한|히)[^.!?\n]{0,40}?아니(라|다)/g) },
  { id: 'B-ppunman', group: 'B', doc: '~뿐만 아니라 ~도', count: all(/뿐(만)?\s?아니라/g) },
  { id: 'B-ibeon-geul', group: 'B', doc: '"이번 글에서는"', count: all(/이번\s?글에서/g) },
  { id: 'B-gyeollon', group: 'B', doc: '결론적으로·요약하면·정리하자면', count: all(/결론적으로|요약하(면|자면)|정리하(자면|면)/g) },
  // "A, B, 그리고 C" — 쉼표+공백으로 이어진 한 어절 항목 3개 이상. "1,000" 은 쉼표 뒤 공백이 없어 안 걸린다.
  { id: 'B-triad', group: 'B', doc: '3개 나열이 문단마다 반복', count: all(/(?:[^\s,.!?]+,\s+){2,}(?:그리고\s+|및\s+|또는\s+)?[^\s,.!?]+/g) },
  { id: 'B-yangbi', group: 'B', doc: '"장점도 있지만 과제도 있다"식 양비론 결말', count: all(/(장점|기회|가능성|성과)[^.!?\n]{0,20}있지만[^.!?\n]{0,20}(과제|한계|우려|위험|리스크|단점)/g) },

  { id: 'C-sisa', group: 'C', doc: '시사하는 바가 크다', count: all(/시사하는\s?바/g) },
  { id: 'C-jumok', group: 'C', doc: '주목할 만하다', count: all(/주목할\s?만(하|한)/g) },
  { id: 'C-haeksim', group: 'C', doc: '핵심적인 역할', count: all(/핵심적(인|으로)?\s?역할/g) },
  { id: 'C-hyeoksin', group: 'C', doc: '혁신적인·획기적인', count: all(/혁신적|획기적/g) },
  { id: 'C-dayang', group: 'C', doc: '다양한', count: all(/다양한/g) },
  { id: 'C-paradigm', group: 'C', doc: '패러다임', count: all(/패러다임/g) },
  { id: 'C-ireohan', group: 'C', doc: '이러한', count: all(/이러한/g) },
  { id: 'C-rago-hal-su', group: 'C', doc: '~라고 할 수 있다', count: all(/라고\s?할\s?수\s?있/g) },
  { id: 'C-jungyo-end', group: 'C', doc: '"~하는 것이 중요하다"로 끝나는 문장', count: (c) => c.sentences.filter((s) => /것이\s?중요(하다|합니다|해요)$/.test(trimEnd(s))).length },
  { id: 'C-geuchiji', group: 'C', doc: '~에 그치지 않는다', count: all(/에\s?그치지\s?않/g) },

  { id: 'E-arrow', group: 'E', doc: '화살표 →', count: all(/[→⇒➔➜←↔]/g) },
  { id: 'E-emoji', group: 'E', doc: '이모지', count: all(/\p{Extended_Pictographic}/gu) },
  { id: 'E-emdash', group: 'E', doc: 'em-dash로 반전 만들기', count: all(/—/g) },
  { id: 'E-bold', group: 'E', doc: '굵은 글씨 남발', count: all(/\*\*[^*\n]+\*\*/g) },
  // 한글(English) 병기: 같은 영문이 두 번째 이후로 또 병기되면 센다.
  {
    id: 'E-byeonggi', group: 'E', doc: '한글 병기를 첫 등장 이후에도 반복',
    count: (c) => { const seen = [...c.text.matchAll(/[가-힣]+\s?\(([A-Za-z][A-Za-z0-9 .&'-]*)\)/g)].map((m) => m[1].trim().toLowerCase()); return seen.length - new Set(seen).size },
  },
]

// patterns.md 항목 중 기계로 못 재는 것. 이유 없는 제외는 두지 않는다.
export const UNMEASURED: Record<string, string> = {
  '무생물 주어 + ~들': '주어가 무생물인지는 의미 판단이라 규칙으로 못 가른다',
  '주어보다 긴 관계절이 앞에 쌓이는 문장': '주어·관계절 경계는 구문 분석기 없이 못 찾는다',
}

// [D 리듬]
export const OPENING_CONJ = ['또한', '따라서', '즉', '그러나', '하지만', '그리고', '그래서', '그러므로', '게다가', '더불어', '한편', '반면', '결국', '이처럼', '나아가']
export const RUN_MIN = { plain: 4, polite: 5 } as const

// [보존] 한정어 — 전/후 개수가 같아야 한다
export const QUALIFIERS: { doc: string; re: RegExp }[] = [
  { doc: '약', re: /(?<![가-힣])약(?=\s)/g }, // "약 30%"·"약 두 배". "약을"(의약)은 뒤에 공백이 없어 안 센다
  { doc: '최대', re: /최대/g },
  { doc: '최소', re: /최소/g },
  { doc: '추정', re: /추정/g },
  { doc: '보도에 따르면', re: /보도에\s?따르면/g },
  { doc: '자체 보고', re: /자체\s?보고/g },
  { doc: '공시', re: /공시/g },
  { doc: '~로 알려진', re: /알려(진|졌|져)/g },
]
const NEGATION: [string, RegExp][] = [
  ['않', /않/g],
  ['못', /(?<![가-힣])못(?=\s|하|했|한|할|해)/g],
  ['없', /없/g],
  // "뿐만 아니라"는 부정이 아니라 첨가(B 패턴)라 뺀다
  ['아니', /(?<!뿐만?\s?)아니/g],
  ['안(부사)', /(?<![가-힣])안\s(?=[가-힣])/g],
]
// 어절 끝 '면' 중 명사(측면·반면·화면…)를 뺀 것 + 만약·만일·경우. 서로 바꿔 써도 합계가 같으면 통과다.
// '라면'·'이면' 단독 어절은 명사. 가정 '~라면'·'~이면'은 "회사라면"처럼 앞에 붙어 다른 어절이 되니 안 겹친다.
const MYEON_NOUN = /^(측면|반면|표면|전면|화면|정면|국면|단면|지면|이면|대면|비대면|양면|일면|내면|외면|방면|장면|평면|수면|당면|직면|냉면|라면)$/
const CONDITIONAL: [string, (t: string) => number][] = [
  ['~면', (t) => [...t.matchAll(/([가-힣]+)면(?=[\s,.!?]|$)/g)].filter((m) => !MYEON_NOUN.test(m[0])).length],
  ['만약·만일', (t) => (t.match(/만약|만일/g) ?? []).length],
  ['~경우', (t) => (t.match(/경우(?=[에엔,\s])/g) ?? []).length],
]

// ── 문장 분리 ────────────────────────────────────────────────────────────────
// 줄바꿈 = 경계(이 리포 마크다운은 한 문단 한 줄). 제목·표·코드블록·구분선 줄은 문장이 아니다.
// 마침표가 끝이 아닌 경우: 따옴표·괄호 안, 바로 뒤가 공백이 아님(3.5 · U.S. · a.com), 맨숫자 뒤(2024. 3. 15.), 영문 약어 뒤.
const ABBR = /^(?:[A-Za-z]|Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|Inc|Co|Corp|Ltd|No|e\.g|i\.e|U\.S|U\.K)$/i
const OPEN: Record<string, string> = { '“': '”', '‘': '’', '(': ')', '[': ']', '「': '」', '『': '』', '《': '》', '〈': '〉' }
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let fence = false
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line0 = raw.trim()
    if (/^(```|~~~)/.test(line0)) { fence = !fence; continue }
    if (fence || !line0 || /^(#{1,6}\s|\||-{3,}$|\*{3,}$)/.test(line0)) continue
    const line = line0.replace(/^(?:[-*+]\s+|\d{1,3}[.)]\s+|>\s*)+/, '')
    const ch = [...line]
    const stack: string[] = []
    let ascii = false
    let start = 0
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]
      if (c === '"') { ascii = !ascii; continue }
      if (OPEN[c]) { stack.push(OPEN[c]); continue }
      if (stack.length && c === stack[stack.length - 1]) { stack.pop(); continue }
      if (ascii || stack.length || !/[.!?…。]/.test(c)) continue
      let j = i
      while (j + 1 < ch.length && /[.!?…。~]/.test(ch[j + 1])) j++
      while (j + 1 < ch.length && /["'”’)\]」』]/.test(ch[j + 1])) j++
      const next = ch[j + 1]
      if (next !== undefined && !/\s/.test(next)) { i = j; continue }
      if (c === '.' && j === i) {
        const prevTok = ch.slice(start, i).join('').split(/\s+/).pop() ?? ''
        // 숫자만 있는 토큰 뒤 마침표(2024. 3. 15.)는 날짜·번호다. 한국어 문장은 "~다."로 끝나지 맨숫자로 끝나지 않는다.
        if (/^\(?\d+$/.test(prevTok) || ABBR.test(prevTok)) continue
      }
      const s = ch.slice(start, j + 1).join('').trim()
      if (s) out.push(s)
      start = j + 1
      i = j
    }
    const rest = ch.slice(start).join('').trim()
    if (rest) out.push(rest)
  }
  return out
}

// ── 어미 분류 ────────────────────────────────────────────────────────────────
// 마지막 1~2음절만 본다. 평어체 키: ~ㅆ다(했다·됐다·였다) · ~ㄴ다(한다·된다·먹는다) · ~이다 · ~다(있다·크다) · ~까(의문)
export type Ending = '~ㅆ다' | '~ㄴ다' | '~이다' | '~다' | '~까' | '합쇼체' | '해요체' | '인용' | '기타'
export const PLAIN_ENDINGS: Ending[] = ['~ㅆ다', '~ㄴ다', '~이다', '~다', '~까']
function trimEnd(s: string) { return s.replace(/[\s.!?…。~"'”’)\]」』*]+$/u, '') }
export function endingOf(sentence: string): Ending {
  const s = sentence.trim()
  if (/^["“「『]/.test(s) && /["”」』][.!?]?$/.test(s)) return '인용'
  const t = trimEnd(s)
  if (/(니다|니까|십시오)$/.test(t)) return '합쇼체'
  if (/(요|죠)$/.test(t)) return '해요체'
  const last = t.slice(-1)
  const pen = t.slice(-2, -1)
  if (last === '다') {
    if (jong(pen) === 20 && pen !== '있') return '~ㅆ다' // '있다'는 받침이 ㅆ 이지만 과거가 아니다
    if (jong(pen) === 4 || pen === '는') return '~ㄴ다'
    if (pen === '이') return '~이다'
    return '~다'
  }
  if (/[까가나냐니]$/.test(t) && /\?\s*$/.test(s)) return '~까'
  return '기타'
}

// ── 지표 ────────────────────────────────────────────────────────────────────
const round = (n: number) => Math.round(n * 1000) / 1000
const commasIn = (s: string) => (s.replace(/(?<=\d)[,，](?=\d)/g, '').match(/[,，]/g) ?? []).length
export type Run = { key: Ending; length: number; start: number }
export type Metrics = {
  sentences: number
  commasPerSentence: number
  commaSentenceRatio: number
  lengthMean: number
  lengthStd: number
  openingConjCount: number
  openingConjRatio: number
  endings: Partial<Record<Ending, number>>
  plainRuns: number
  politeRuns: number
  maxRun: number
  runs: Run[]
  patterns: Record<Group, { total: number; byId: Record<string, number> }> & { total: number }
  ireohan: number
  triads: number
  emDash: number
  arrows: number
  emoji: number
  bold: number
}
export function metrics(text: string): Metrics {
  const sentences = splitSentences(text)
  const n = sentences.length
  const lens = sentences.map(nonWs)
  const mean = n ? lens.reduce((a, b) => a + b, 0) / n : 0
  const std = n ? Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0
  const commas = sentences.map(commasIn)
  const conj = sentences.filter((s) => OPENING_CONJ.some((w) => s.startsWith(w) && /^[\s,，]/.test(s.slice(w.length)))).length
  const ends = sentences.map(endingOf)
  const endings: Partial<Record<Ending, number>> = {}
  for (const e of ends) endings[e] = (endings[e] ?? 0) + 1
  // 같은 어미 연속: 평어체 키 4문장↑, 합쇼체 5문장↑ 를 1건으로 센다
  const runs: Run[] = []
  let maxRun = 0
  for (let i = 0; i < ends.length;) {
    let j = i
    while (j + 1 < ends.length && ends[j + 1] === ends[i]) j++
    const len = j - i + 1
    if (ends[i] !== '기타' && ends[i] !== '인용') maxRun = Math.max(maxRun, len)
    const min = PLAIN_ENDINGS.includes(ends[i]) ? RUN_MIN.plain : ends[i] === '합쇼체' || ends[i] === '해요체' ? RUN_MIN.polite : Infinity
    if (len >= min) runs.push({ key: ends[i], length: len, start: i })
    i = j + 1
  }
  const ctx: Ctx = { text, sentences }
  const patterns = { total: 0, A: { total: 0, byId: {} }, B: { total: 0, byId: {} }, C: { total: 0, byId: {} }, E: { total: 0, byId: {} } } as Metrics['patterns']
  const byId: Record<string, number> = {}
  for (const p of PATTERNS) {
    const k = p.count(ctx)
    byId[p.id] = k
    patterns[p.group].byId[p.id] = k
    patterns[p.group].total += k
    patterns.total += k
  }
  return {
    sentences: n,
    commasPerSentence: n ? round(commas.reduce((a, b) => a + b, 0) / n) : 0,
    commaSentenceRatio: n ? round(commas.filter((k) => k > 0).length / n) : 0,
    lengthMean: round(mean),
    lengthStd: round(std),
    openingConjCount: conj,
    openingConjRatio: n ? round(conj / n) : 0,
    endings,
    plainRuns: runs.filter((r) => PLAIN_ENDINGS.includes(r.key)).length,
    politeRuns: runs.filter((r) => !PLAIN_ENDINGS.includes(r.key)).length,
    maxRun,
    runs,
    patterns,
    ireohan: byId['C-ireohan'],
    triads: byId['B-triad'],
    emDash: byId['E-emdash'],
    arrows: byId['E-arrow'],
    emoji: byId['E-emoji'],
    bold: byId['E-bold'],
  }
}

const NUMERIC_KEYS = ['sentences', 'commasPerSentence', 'commaSentenceRatio', 'lengthMean', 'lengthStd', 'openingConjCount', 'openingConjRatio', 'plainRuns', 'politeRuns', 'maxRun', 'ireohan', 'triads', 'emDash', 'arrows', 'emoji', 'bold'] as const
export function compare(before: string, after: string) {
  const b = metrics(before)
  const a = metrics(after)
  const delta: Record<string, number> = {}
  for (const k of NUMERIC_KEYS) delta[k] = round(a[k] - b[k])
  for (const g of ['A', 'B', 'C', 'E'] as const) delta[`patterns${g}`] = a.patterns[g].total - b.patterns[g].total
  delta.patternsTotal = a.patterns.total - b.patterns.total
  return { before: b, after: a, delta }
}

// ── 불변 검사 ────────────────────────────────────────────────────────────────
export type Check = { id: string; status: Status; reason: string; before?: unknown; after?: unknown }
const URL_RE = /https?:\/\/[^\s<>"'“”)\]]+/g
const urls = (t: string) => (t.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''))
const stripUrls = (t: string) => t.replace(URL_RE, ' ')
const UNITS = '퍼센트|개월|시간|달러|유로|%|％|배|원|엔|만|억|조|천|개|명|건|년|월|일|시|분|초|주|위|곳|회|차|쪽|장|대|점|살|세|kg|km|cm|mm|ml|GB|MB|TB|KB|g|m|L|x'
const NUM_RE = new RegExp(`\\$?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:${UNITS})(?![A-Za-z]))?`, 'g')
export const numbers = (t: string) => (stripUrls(t).match(NUM_RE) ?? []).map((s) => s.replace(/\s/g, '').replace(/,$/, ''))
export const latinTokens = (t: string) => stripUrls(t).match(/[A-Za-z][A-Za-z0-9&+'’.-]*[A-Za-z0-9+]|[A-Za-z]/g) ?? []
export const quotes = (t: string) => [
  ...[...t.matchAll(/"([^"\n]+)"|“([^”\n]+)”|「([^」\n]+)」|『([^』\n]+)』|‘([^’\n]+)’/g)].map((m) => m.slice(1).find((x) => x !== undefined) as string),
  ...[...t.matchAll(/(?<![A-Za-z])'([^'\n]+?)'(?![A-Za-z])/g)].map((m) => m[1]),
]
// 한글 고유명사 후보 — 근사. ① 한글(English) 병기의 한글 ② 직함 앞 이름(김철수 대표) ③ 조직 접미사 어절(삼성전자·OO코리아).
const TITLES = '대표|창업자|공동창업자|CEO|최고경영자|회장|교수|기자|의원|씨'
// 일반명사로도 흔한 접미사(은행·통신·화장품)는 뺐다 — 띄어쓰기만 바꿔도 거짓 실패가 난다
const ORG_SUFFIX = '코리아|전자|그룹|랩스|컴퍼니|홀딩스|스튜디오|제약|증권|항공|건설'
export function hangulProperCandidates(t: string): string[] {
  const c = new Set<string>()
  for (const m of t.matchAll(/([가-힣]{2,})\s?\([A-Za-z]/g)) c.add(m[1])
  for (const m of t.matchAll(new RegExp(`(?<![가-힣])([가-힣]{2,4})\\s(?:${TITLES})`, 'g'))) if (!/의$/.test(m[1])) c.add(m[1]) // "회사의 대표"의 '회사의'는 이름이 아니다
  for (const m of t.matchAll(new RegExp(`(?<![가-힣])([가-힣]{1,8}(?:${ORG_SUFFIX}))`, 'g'))) c.add(m[1])
  return [...c]
}
const countOf = (t: string, re: RegExp) => (t.match(re) ?? []).length
const negationCounts = (t: string) => Object.fromEntries(NEGATION.map(([k, re]) => [k, countOf(t, re)]))
const conditionalCounts = (t: string) => Object.fromEntries(CONDITIONAL.map(([k, f]) => [k, f(t)]))
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

function multisetDiff(b: string[], a: string[]) {
  const m = new Map<string, number>()
  for (const x of b) m.set(x, (m.get(x) ?? 0) + 1)
  for (const x of a) m.set(x, (m.get(x) ?? 0) - 1)
  const missing: string[] = []
  const added: string[] = []
  for (const [k, v] of m) { if (v > 0) missing.push(...Array(v).fill(k)); if (v < 0) added.push(...Array(-v).fill(k)) }
  return { missing, added }
}
function multisetCheck(id: string, label: string, b: string[], a: string[]): Check {
  const { missing, added } = multisetDiff(b, a)
  if (!missing.length && !added.length) return { id, status: 'pass', reason: `${label} ${b.length}개가 그대로 남았다`, before: b, after: a }
  const parts = [missing.length ? `빠짐/바뀜: ${missing.join(', ')}` : '', added.length ? `새로 생김: ${added.join(', ')}` : ''].filter(Boolean)
  return { id, status: 'fail', reason: `${label}가 달라졌다 — ${parts.join(' / ')}`, before: b, after: a }
}

// 편집거리(Levenshtein, 코드포인트 단위). 공통 앞뒤를 먼저 잘라 실제 계산량을 줄이고, 두 줄 배열만 써서 메모리는 O(min(n,m)).
// 그래도 남은 n·m 이 상한을 넘으면 계산하지 않고 null — 호출자가 unknown 으로 보고한다(지어낸 값 대신).
export const EDIT_CELL_LIMIT = 2e8
export function editDistance(x: string, y: string, limit = EDIT_CELL_LIMIT): number | null {
  let a = [...x]
  let b = [...y]
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  a = a.slice(p); b = b.slice(p)
  let s = 0
  while (s < a.length && s < b.length && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  a = a.slice(0, a.length - s); b = b.slice(0, b.length - s)
  if (a.length < b.length) [a, b] = [b, a]
  if (!b.length) return a.length
  if (a.length * b.length > limit) return null
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  let cur = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

export const GATE = { lengthRatio: [0.7, 1.3] as const, changeMax: 0.5, changeWarn: 0.3 }

export function invariants(before: unknown, after: unknown, opts: { editCellLimit?: number } = {}): Check[] {
  const ids = ['numbers', 'latin', 'proper-hangul', 'urls', 'quotes', 'qualifiers', 'negation', 'conditional', 'length-ratio', 'change-rate', 'voice']
  if (typeof before !== 'string' || typeof after !== 'string') return ids.map((id) => ({ id, status: 'unknown', reason: '입력이 문자열이 아니라 비교하지 못했다' }))
  if (!before.trim()) return ids.map((id) => ({ id, status: 'unknown', reason: '원문(before)이 비어 있어 보존 여부를 판단할 기준이 없다' }))
  const checks: Check[] = [
    multisetCheck('numbers', '숫자(단위 포함)', numbers(before), numbers(after)),
    multisetCheck('latin', '영문 토큰(약어·브랜드)', latinTokens(before), latinTokens(after)),
  ]
  const cands = hangulProperCandidates(before)
  const lost = cands.filter((w) => !after.includes(w))
  checks.push(lost.length
    ? { id: 'proper-hangul', status: 'fail', reason: `한글 고유명사 후보가 원형 그대로 남지 않았다 — ${lost.join(', ')}`, before: cands, after: cands.filter((w) => after.includes(w)) }
    : { id: 'proper-hangul', status: 'pass', reason: cands.length ? `한글 고유명사 후보 ${cands.length}개(${cands.join(', ')})가 원형 그대로 남았다` : '한글 고유명사 후보 0개(병기·직함·조직 접미사로 잡힌 것 없음 — 근사라 놓친 이름이 있을 수 있다)', before: cands, after: cands })
  checks.push(multisetCheck('urls', 'URL', urls(before), urls(after)))
  checks.push(multisetCheck('quotes', '따옴표 안 인용', quotes(before), quotes(after)))

  const qDiff = QUALIFIERS.map((q) => ({ doc: q.doc, b: countOf(before, q.re), a: countOf(after, q.re) })).filter((d) => d.a !== d.b)
  checks.push(qDiff.length
    ? { id: 'qualifiers', status: 'fail', reason: `한정어 개수가 바뀌었다 — ${qDiff.map((d) => `'${d.doc}' ${d.b}→${d.a}`).join(', ')}`, before: qDiff }
    : { id: 'qualifiers', status: 'pass', reason: '한정어(약·최대·최소·추정·보도에 따르면·자체 보고·공시·알려진) 개수가 그대로다' })
  for (const [id, label, f] of [['negation', '부정 표현(않·못·없·아니·안)', negationCounts], ['conditional', '가정 표현(~면·만약·경우)', conditionalCounts]] as const) {
    const b = f(before)
    const a = f(after)
    checks.push(sum(b) === sum(a)
      ? { id, status: 'pass', reason: `${label} 합계 ${sum(b)}개가 그대로다`, before: b, after: a }
      : { id, status: 'fail', reason: `${label} 합계가 ${sum(b)}→${sum(a)}로 바뀌었다 — 의미가 뒤집혔을 수 있다`, before: b, after: a })
  }

  const ratio = nonWs(after) / nonWs(before)
  const [lo, hi] = GATE.lengthRatio
  checks.push(ratio >= lo && ratio <= hi
    ? { id: 'length-ratio', status: 'pass', reason: `길이비 ${round(ratio)} (허용 ${lo}~${hi})`, after: round(ratio) }
    : { id: 'length-ratio', status: 'fail', reason: `길이비 ${round(ratio)} 가 허용 범위 ${lo}~${hi} 밖이다`, after: round(ratio) })

  const d = editDistance(before, after, opts.editCellLimit)
  if (d === null) checks.push({ id: 'change-rate', status: 'unknown', reason: `글이 길어 편집거리 계산 상한(${opts.editCellLimit ?? EDIT_CELL_LIMIT} 칸)을 넘었다 — 변경률을 확인하지 못했다` })
  else {
    const rate = round(d / Math.max(cp(before), cp(after)))
    checks.push(rate <= GATE.changeMax
      ? { id: 'change-rate', status: 'pass', reason: `문자 변경률 ${rate} (상한 ${GATE.changeMax}${rate > GATE.changeWarn ? `, ${GATE.changeWarn} 초과라 경고` : ''})`, after: rate }
      : { id: 'change-rate', status: 'fail', reason: `문자 변경률 ${rate} 가 상한 ${GATE.changeMax} 를 넘었다 — 윤문이 아니라 다시 쓴 수준이다`, after: rate })
  }

  const eb = splitSentences(before).map(endingOf)
  const ea = splitSentences(after).map(endingOf)
  const cnt = (e: Ending[], k: Ending) => e.filter((x) => x === k).length
  const grew = (['합쇼체', '해요체'] as const).filter((k) => cnt(ea, k) > cnt(eb, k))
  checks.push(grew.length
    ? { id: 'voice', status: 'fail', reason: `평어체가 깨졌다 — ${grew.map((k) => `${k} 문장 ${cnt(eb, k)}→${cnt(ea, k)}`).join(', ')}`, before: { 합쇼체: cnt(eb, '합쇼체'), 해요체: cnt(eb, '해요체') }, after: { 합쇼체: cnt(ea, '합쇼체'), 해요체: cnt(ea, '해요체') } }
    : { id: 'voice', status: 'pass', reason: `합쇼체·해요체 문장이 늘지 않았다(평어체 유지)` })
  return checks
}

export type GateResult = { passed: boolean; warn: boolean; reasons: string[]; checks: Check[] }
export function gate(before: unknown, after: unknown, opts: { editCellLimit?: number } = {}): GateResult {
  const checks = invariants(before, after, opts)
  const reasons: string[] = []
  for (const c of checks) {
    if (c.status === 'fail') reasons.push(`[실패 ${c.id}] ${c.reason}`)
    if (c.status === 'unknown') reasons.push(`[확인 불가 ${c.id}] ${c.reason}`)
  }
  const rate = checks.find((c) => c.id === 'change-rate')
  const warn = rate?.status === 'pass' && typeof rate.after === 'number' && rate.after > GATE.changeWarn
  if (warn) reasons.push(`[경고 change-rate] 변경률 ${rate.after} 가 ${GATE.changeWarn} 를 넘었다 — 사람이 한 번 보는 편이 낫다`)
  return { passed: checks.every((c) => c.status === 'pass'), warn, reasons, checks }
}
