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

// ── 2026-09-29 남헌 결정 3건 — 칼럼과 스레드가 한 벌로 쓰는 규칙 ─────────────────
// 정본: content/guides/케이스-작성-가이드.md §7-3(읽기 수준)·§8-2(출처 흘려 쓰기), voice-guide.md §7(편 자족성).
// 아카이브: pdp/04-decisions.md NEW-20260929-01~03. scripts/column-check.mjs 가 칼럼·편 양쪽에 같은 함수를 건다.

/** "이 근거는 ~에서 나왔다" — 근거·출처·수치를 주어로 놓고 어디서 왔는지 말하는 문장. 본문에서는 오류다(§8-2). */
const CITATION_META = /(근거|출처|자료|수치|숫자|데이터)(는|은|가|이)\s*[^.\n]{0,40}?(에서\s*(나왔|나온|가져왔|가져온|왔|확인했|읽었)|에\s*(있다|나온다|적혀|실려)|에\s*따른\s*것)|출처\s*[:：]|출처는\s/
/** 귀속 표현. 지우라는 게 아니다 — 한 편 1회(칼럼 1,000자당 1회)까지가 §8-2 의 상한이고, CG-1 귀속은 그 1회 안에서 쓴다. */
const ATTRIBUTION = /에\s*따르면|(고|라고)\s*(밝혔|전했|썼|적었|말했)|밝힌\s*바로는|(회사|본인|당사자)가\s*(밝힌|발표한|공개한|직접\s*밝힌)|자체\s*집계|자사\s*(발표|집계|기준)|보도로는|기사에\s*따르면/g
/** SC-1 다른 편·앞 글을 가리키는 말. 이 편만 읽은 사람에게는 빈 참조다. */
const SERIES_REF = /(\d+|앞|지난|이전|다음|첫|마지막)\s*(편|글|회)에서|앞서\s*(말한|본|다룬|적은|얘기한)|위에서\s*(본|말한|적은)|이어서\s*보면|지난\s*글|앞\s*글에|다음\s*편에/
/** SC-2 첫 문장이 정체 모를 지시어로 시작 — 선행사가 다른 편에 있다는 뜻이다. */
const ANAPHORA_OPEN = /^(그|이|저)\s?(회사|팀|사람|대표|창업자|서비스|제품|결정|방법|시도|실험|뒤|다음|때|숫자|공식|가격)(는|은|가|이|도|에|부터|로|를|을)\s/
/** SC-3 주체 추정 — 실명을 못 알아보니 로마자 이름이나 역할어(대표·창업자…)가 앞 40% 안에 있는지만 본다. subject 를 주면 그 이름으로 정확히 본다. */
const SUBJECT_HINT = /[A-Za-z][A-Za-z.&'-]{1,}|(대표|창업자|공동창업자|회사|브랜드|팀|앱|서비스|스타트업|사장|개발자)/
/** SC-4 마지막 문단이 독자에게 넘기는 문장(질문·정리·행동)으로 닫히는가. */
const APPLY_CLOSE = /(는가|을까|할까|있나|인가|일까)\?|해\s?보(라|자|면|고)|부터\s*(본다|한다|찾는다|잰다|정한다)|옮길\s*(건|것은|수)|하면\s*된다|해\s*볼\s*일|그래서\s*.{0,20}(한다|이다)\.?$/

const sentences = (text: string): string[] =>
  text
    .replace(/"[^"\n]*"|“[^”\n]*”/g, '')   // 인용문 안은 남의 문장이라 길이를 재지 않는다
    .replace(/^#+ .*$/gm, '')             // 소제목
    .replace(/([.!?。])\s+/g, '$1\n')     // 문장 끝 → 줄 (lookbehind 는 target ES2017 에서 못 쓴다)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => len(s) >= 6)

export type ReadabilityResult = { avg: number; max: number; long: string[]; acronyms: string[] }

/**
 * 읽기 수준(§7-3). 문장 평균 40자 안팎·90자 초과 0·약어는 첫 등장에서 풀이.
 * 판정은 부르는 쪽이 한다 — 스레드·칼럼이 같은 수치로 경고를 낸다.
 */
export function readability(text: string): ReadabilityResult {
  const ss = sentences(text)
  const lens = ss.map(len)
  const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0
  const max = lens.length ? Math.max(...lens) : 0
  const long = ss.filter((s) => len(s) > 90).map((s) => s.slice(0, 30) + '…')
  // 영문 약어(ARR·GDPR·MRR…). 처음 나온 자리 뒤 40자 안에 괄호 풀이·"이란/라는/즉" 이 없으면 풀이 없이 쓴 것으로 본다.
  const acronyms: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/\b[A-Z]{2,6}\b/g)) {
    const a = m[0]
    if (seen.has(a)) continue
    seen.add(a)
    const after = text.slice(m.index! + a.length, m.index! + a.length + 40)
    if (!/[(（]|이란|라는|즉|말하자면|,\s*그러니까/.test(after)) acronyms.push(a)
  }
  return { avg, max, long, acronyms }
}

export type CitationResult = { meta: string | null; attributions: number }

/** 출처 흘려 쓰기(§8-2). meta = 금지 문장이 걸린 자리, attributions = 귀속 문장 수(한 문장에 표현이 둘이어도 1 — "회사가 밝힌 자체 집계"는 귀속 한 번이다). */
export function checkCitation(text: string): CitationResult {
  const m = CITATION_META.exec(text)
  const one = new RegExp(ATTRIBUTION.source)
  return { meta: m ? m[0].trim() : null, attributions: sentences(text).filter((s) => one.test(s)).length }
}

export type SelfContainedOpts = { subject?: string | null }

/**
 * 편 자족성 SC-1~SC-5 (voice-guide §7-2). 이 편만 읽은 사람에게 인사이트가 온전히 서는가.
 * 오류 = 그 편은 발행 대기로 못 간다(column-threads-stage.mjs 가 막는다). 경고 = 사람이 본다.
 */
export function checkThreadSelfContained(body: string, opts: SelfContainedOpts = {}): { errors: string[]; warns: string[] } {
  const text = (body ?? '').replace(/\r/g, '').trim()
  const errors: string[] = []
  const warns: string[] = []
  const n = len(text)
  const head = [...text].slice(0, Math.ceil(n * 0.4)).join('')
  const first = sentences(text)[0] ?? text
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const last = paras[paras.length - 1] ?? ''

  const ref = SERIES_REF.exec(text)
  if (ref) errors.push(`SC-1 다른 편을 가리킨다("${ref[0]}") — 이 편만 읽는 사람에게는 빈 참조다`)
  if (ANAPHORA_OPEN.test(first)) errors.push(`SC-2 첫 문장이 지시어로 시작("${first.slice(0, 20)}…") — 회사·사람을 실명으로 먼저 세운다`)
  const subject = opts.subject?.trim()
  if (subject) {
    if (!head.includes(subject)) errors.push(`SC-3 주체 "${subject}" 가 본문 앞 40% 안에 없다 — 배경 두 문장을 앞에 넣는다`)
  } else if (!SUBJECT_HINT.test(head)) {
    warns.push('SC-3 앞 40% 안에 회사·사람 이름으로 보이는 말이 없다 — 주체를 확인한다(subject 를 주면 정확히 본다)')
  }
  if (!APPLY_CLOSE.test(last)) warns.push('SC-4 마지막 문단에 독자에게 넘기는 문장(질문·정리·행동)이 안 보인다')
  if (n < 200) warns.push(`SC-5 본문 ${n}자 — 200자 미만이면 배경(회사·제품·막힌 지점)이 들어갈 자리가 없다`)
  return { errors, warns }
}

export function checkThreadPost(body: string, createdAt: string | Date): ThreadCheckResult {
  const text = (body ?? '').replace(/\r/g, '').trim()
  const errors: string[] = []
  const warns: string[] = []
  const chars = len(text)

  if (chars > 500) errors.push(`본문 ${chars}자 — 500자 초과(voice-guide §4). 넘으면 Threads 가 자동 분할한다`)
  if (SYMBOLS.test(text)) errors.push('본문에 기호(→ ⇒ ← —) — voice-guide §2-3/§5')
  if (GATE_TERMS.test(text)) errors.push('본문에 출처 괄호·게이트 용어(S-1/8-K/10-K/제3자 검증) — 자기답글로 빼야 한다(voice-guide §2-3)')
  const cit = checkCitation(text)
  if (cit.meta) errors.push(`출처 설명 문장("${cit.meta.slice(0, 30)}…") — 본문에서 지우고 자기답글로(케이스-작성-가이드 §8-2)`)
  if (cit.attributions > 1) warns.push(`귀속 표현 ${cit.attributions}회 — 한 편 1회까지(§8-2). 등급 C 면 그 1회가 CG-1 귀속이다`)
  const rd = readability(text)
  if (rd.long.length) warns.push(`90자 넘는 문장 ${rd.long.length}개("${rd.long[0]}") — 둘로 자른다(§7-3 고1·고2 기준)`)
  if (rd.acronyms.length) warns.push(`풀이 없는 약어 ${rd.acronyms.join(', ')} — 첫 등장에서 우리말로 풀어 준다(§7-3)`)

  const date = typeof createdAt === 'string' ? createdAt : createdAt.toISOString()
  if (date >= VOICE_GUIDE_SETTLED_FROM && POLITE_ENDING.test(text)) {
    warns.push('마무리가 해요체/합쇼체로 끝남 — 모드 A(케이스 서술)는 평어체 질문이 2026-09-11부터 정착(voice-guide §2-2)')
  }
  const firstLine = text.split('\n')[0] ?? ''
  if (GENERIC_OPEN.test(firstLine)) warns.push(`훅이 일반론으로 시작("${firstLine.slice(0, 20)}…") — 이 사례만의 문장인지 확인`)

  return { errors, warns, chars }
}
