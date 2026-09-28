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

// ── 모드 A/B (voice-guide §0) — 2026-09-29: 모드 A 전용 규칙을 모드 B 글에 걸던 오탐 수정 ──
// 모드 B 의 정의가 곧 판정 기준이다: "1인칭 '저/제' + 합쇼체(~습니다/~죠/~더군요)". 둘 중 하나가 본문에 있으면 B, 없으면 A —
// 모드 A 는 합쇼체 어미 자체를 금지하니(§2-2) 어미만으로도 가른다. 파일에 `- 모드: B` 줄이 있으면(column-check 가 읽어
// opts.mode 로 넘긴다) 그쪽이 우선한다. 추측이 아니라 정의를 그대로 세는 것이라 T1-3 A/B(be0bd0da/68e9bab7)·T3-5(2e067d2f)·
// T3-1(1인칭 대명사 없이 합쇼체만) 이 전부 B 로 잡힌다.
export type VoiceMode = 'A' | 'B'
const FIRST_PERSON = /(^|[^가-힣])(저는|제가|저희|저도|저를|저의|제게|저한테|제\s)/
const POLITE_BODY = /(니다|죠|더군요|는데요|니까요|거든요)[.!?]/ // 합니다·입니다·했죠 — 음절이 합쳐져 있어 "습니다/었죠"로는 못 잡는다
export function detectVoiceMode(text: string): VoiceMode {
  const t = text.replace(/"[^"\n]*"|“[^”\n]*”/g, '') // 인용문 안의 합쇼체는 남의 말이다
  return FIRST_PERSON.test(t) || POLITE_BODY.test(t) ? 'B' : 'A'
}
/** 파일 머리·편 블록의 `- 모드: A|B` 줄. 없으면 null(본문에서 판정). */
export function voiceModeHint(text: string): VoiceMode | null {
  const m = /^-\s*\*{0,2}모드\*{0,2}\s*[:：]\s*\*{0,2}\s*([AB])\b/m.exec(text.replace(/\r/g, ''))
  return (m?.[1] as VoiceMode | undefined) ?? null
}

// ── 2026-09-29 남헌 결정 3건 — 칼럼과 스레드가 한 벌로 쓰는 규칙 ─────────────────
// 정본: content/guides/케이스-작성-가이드.md §7-3(읽기 수준)·§8-2(출처 흘려 쓰기), voice-guide.md §7(편 자족성).
// 아카이브: pdp/04-decisions.md NEW-20260929-01~03. scripts/column-check.mjs 가 칼럼·편 양쪽에 같은 함수를 건다.

/** "이 근거는 ~에서 나왔다" — 근거·출처·수치를 주어로 놓고 어디서 왔는지 말하는 문장. 본문에서는 오류다(§8-2). */
const CITATION_META = /(근거|출처|자료|수치|숫자|데이터)(는|은|가|이)\s*[^.\n]{0,40}?(에서\s*(나왔|나온|가져왔|가져온|왔|확인했|읽었)|에\s*(있다|나온다|적혀|실려)|에\s*따른\s*것)|출처\s*[:：]|출처는\s/
/** 귀속 표현. 지우라는 게 아니다 — 한 편 1회(칼럼 1,000자당 1회)까지가 §8-2 의 상한. 2026-09-29 부터 등급 C 귀속(CG-1)은 본문 의무가 아니다 — 자기답글·근거 메모의 "자사 공시" 가 그 자리다(UPD-20260929-01). */
const ATTRIBUTION = /에\s*따르면|(고|라고)\s*(밝혔|전했|썼|적었|말했)|밝힌\s*바로는|(회사|본인|당사자)가\s*(밝힌|발표한|공개한|직접\s*밝힌)|자체\s*집계|자사\s*(발표|집계|기준)|보도로는|기사에\s*따르면/g
/** SC-1 다른 편·앞 글을 가리키는 말. 이 편만 읽은 사람에게는 빈 참조다. */
const SERIES_REF = /(\d+|앞|지난|이전|다음|첫|마지막)\s*(편|글|회)에서|앞서\s*(말한|본|다룬|적은|얘기한)|위에서\s*(본|말한|적은)|이어서\s*보면|지난\s*글|앞\s*글에|다음\s*편에/
/** SC-1 예고형 마무리 — "다음 글에 적겠습니다" 류. 편은 그 안에서 끝나야 한다(2026-09-29, NEW-20260929-05). T3-5 가 이걸로 빠져나갔다. */
const TEASER = /다음\s*(글|편|회|포스팅|번)에(서)?\s*(적|쓰|다루|이어|말|얘기|풀|정리|공개|올리)|다음에\s*(적|쓰|다루|이어|얘기|정리|공개)(하)?겠|(다음|이어지는|후속)\s*(글|편)(을|에서|이)\s*(기다|기대|보|나옵|올라)/
/** 완충 표현(§7-4 확신형). 지우라는 게 아니라 "확인" — 근거 메모가 받치니 본문은 단정해도 된다. */
const HEDGE = /(으로|로)\s*보인다|(으로|로)\s*보이는|일\s*수(도)?\s*있다|것\s*같다|듯하다|듯싶다|(으로|로)\s*추정된다|(으로|로)\s*추측된다|아마도|어쩌면/g
/** 재진술·요약 문장(§7-4). 한 번 말한 근거를 다시 풀거나 "정리하자면"으로 닫는 것 — playbook 6-5 금지 목록과 같다. */
const RESTATE = /다시\s*말(하면|해서|해)|앞서\s*(봤|말했|적었)듯이|요컨대|정리하자면|정리하면|다시\s*정리/g
/** SC-2 첫 문장이 정체 모를 지시어로 시작 — 선행사가 다른 편에 있다는 뜻이다. */
const ANAPHORA_OPEN = /^(그|이|저)\s?(회사|팀|사람|대표|창업자|서비스|제품|결정|방법|시도|실험|뒤|다음|때|숫자|공식|가격)(는|은|가|이|도|에|부터|로|를|을)\s/
/** SC-3 주체 추정 — 실명을 못 알아보니 로마자 이름이나 역할어(대표·창업자…)가 앞 40% 안에 있는지만 본다. subject 를 주면 그 이름으로 정확히 본다. */
const SUBJECT_HINT = /[A-Za-z][A-Za-z.&'-]{1,}|(대표|창업자|공동창업자|회사|브랜드|팀|앱|서비스|스타트업|사장|개발자)/
/** SC-4 마지막 문단이 독자에게 넘기는 문장(질문·정리·행동)으로 닫히는가. */
const APPLY_CLOSE = /(는가|을까|할까|있나|인가|일까)\?|해\s?보(라|자|면|고)|부터\s*(본다|한다|찾는다|잰다|정한다)|옮길\s*(건|것은|수)|하면\s*된다|해\s*볼\s*일|그래서\s*.{0,20}(한다|이다)\.?$/
/** SC-4 모드 B 마무리 — 해요체 질문(`~돌려보셨나요?` voice-guide §3-2). 모드 A 의 평어체 질문 규칙을 B 에 걸면 오탐이다. */
const APPLY_CLOSE_B = /(나요|가요|세요|시죠|까요|습니까|입니까)\?|보세요|해\s*보시/

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

/** 카피 문장 규칙(케이스-작성-가이드 §7-4, 2026-09-29) — 완충 표현·재진술은 "확인". 판정 문구는 부르는 쪽이 만든다. */
export function checkCopy(text: string): { hedges: string[]; restates: string[] } {
  const t = (text ?? '').replace(/"[^"\n]*"|“[^”\n]*”/g, '') // 인용문 안의 "~것 같다"는 남의 말이다
  return {
    hedges: [...new Set((t.match(HEDGE) ?? []).map((s) => s.trim()))],
    restates: [...new Set((t.match(RESTATE) ?? []).map((s) => s.trim()))],
  }
}

export type SelfContainedOpts = { subject?: string | null; mode?: VoiceMode | null }

/**
 * 편 자족성 SC-1~SC-5 (voice-guide §7-2). 이 편만 읽은 사람에게 인사이트가 온전히 서는가.
 * 오류 = 그 편은 발행 대기로 못 간다(column-threads-stage.mjs 가 막는다). 경고 = 사람이 본다.
 * mode 를 안 주면 본문에서 판정한다(detectVoiceMode) — SC-4 는 모드 B 면 해요체 질문을 마무리로 인정한다.
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
  const mode = opts.mode ?? detectVoiceMode(text)

  const ref = SERIES_REF.exec(text)
  if (ref) errors.push(`SC-1 다른 편을 가리킨다("${ref[0]}") — 이 편만 읽는 사람에게는 빈 참조다`)
  const tz = TEASER.exec(text)
  if (tz && !ref) errors.push(`SC-1 다음 글을 예고한다("${tz[0]}") — 편은 그 안에서 끝나야 한다. 예고형 마무리는 시리즈 전용 포맷으로 따로 재검토(NEW-20260929-05)`)
  if (ANAPHORA_OPEN.test(first)) errors.push(`SC-2 첫 문장이 지시어로 시작("${first.slice(0, 20)}…") — 회사·사람을 실명으로 먼저 세운다`)
  const subject = opts.subject?.trim()
  if (subject) {
    if (!head.includes(subject)) errors.push(`SC-3 주체 "${subject}" 가 본문 앞 40% 안에 없다 — 배경 두 문장을 앞에 넣는다`)
  } else if (!SUBJECT_HINT.test(head)) {
    warns.push('SC-3 앞 40% 안에 회사·사람 이름으로 보이는 말이 없다 — 주체를 확인한다(subject 를 주면 정확히 본다)')
  }
  const closed = mode === 'B' ? APPLY_CLOSE_B.test(last) || APPLY_CLOSE.test(last) : APPLY_CLOSE.test(last)
  if (!closed) warns.push(`SC-4 마지막 문단에 독자에게 넘기는 문장(질문·정리·행동)이 안 보인다 (모드 ${mode})`)
  if (n < 200) warns.push(`SC-5 본문 ${n}자 — 200자 미만이면 배경(회사·제품·막힌 지점)이 들어갈 자리가 없다`)
  return { errors, warns }
}

export type ThreadPostOpts = { mode?: VoiceMode | null }

export function checkThreadPost(body: string, createdAt: string | Date, opts: ThreadPostOpts = {}): ThreadCheckResult {
  const text = (body ?? '').replace(/\r/g, '').trim()
  const errors: string[] = []
  const warns: string[] = []
  const chars = len(text)
  const mode = opts.mode ?? detectVoiceMode(text)

  if (chars > 500) errors.push(`본문 ${chars}자 — 500자 초과(voice-guide §4). 넘으면 Threads 가 자동 분할한다`)
  if (SYMBOLS.test(text)) errors.push('본문에 기호(→ ⇒ ← —) — voice-guide §2-3/§5')
  if (GATE_TERMS.test(text)) errors.push('본문에 출처 괄호·게이트 용어(S-1/8-K/10-K/제3자 검증) — 자기답글로 빼야 한다(voice-guide §2-3)')
  const cit = checkCitation(text)
  if (cit.meta) errors.push(`출처 설명 문장("${cit.meta.slice(0, 30)}…") — 본문에서 지우고 자기답글로(케이스-작성-가이드 §8-2)`)
  if (cit.attributions > 1) warns.push(`귀속 표현 ${cit.attributions}회 — 한 편 1회까지(§8-2). 등급 C 귀속은 본문이 아니라 자기답글 "자사 공시"로(UPD-20260929-01)`)
  const rd = readability(text)
  if (rd.long.length) warns.push(`90자 넘는 문장 ${rd.long.length}개("${rd.long[0]}") — 둘로 자른다(§7-3 고1·고2 기준)`)
  if (rd.acronyms.length) warns.push(`풀이 없는 약어 ${rd.acronyms.join(', ')} — 첫 등장에서 우리말로 풀어 준다(§7-3)`)
  const cp = checkCopy(text)
  if (cp.hedges.length) warns.push(`완충 표현 ${cp.hedges.length}종("${cp.hedges[0]}") — 확신형으로 쓴다, 근거 메모·자기답글이 받친다(§7-4)`)
  if (cp.restates.length) warns.push(`재진술·요약 문장("${cp.restates[0]}") — 한 번 말한 근거를 다시 풀지 않는다(§7-4)`)

  const date = typeof createdAt === 'string' ? createdAt : createdAt.toISOString()
  // 모드 A 전용 규칙. 모드 B(1인칭 합쇼체)는 해요체 질문이 정본 마무리다(voice-guide §3-2) — 걸면 오탐이다.
  if (mode === 'A' && date >= VOICE_GUIDE_SETTLED_FROM && POLITE_ENDING.test(text)) {
    warns.push('마무리가 해요체/합쇼체로 끝남 — 모드 A(케이스 서술)는 평어체 질문이 2026-09-11부터 정착(voice-guide §2-2)')
  }
  const firstLine = text.split('\n')[0] ?? ''
  if (GENERIC_OPEN.test(firstLine)) warns.push(`훅이 일반론으로 시작("${firstLine.slice(0, 20)}…") — 이 사례만의 문장인지 확인`)

  return { errors, warns, chars }
}
