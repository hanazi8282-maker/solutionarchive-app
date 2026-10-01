#!/usr/bin/env node
// 한국어 윤문 측정 도구(lib/content/ko-style.ts) 셀프테스트 — 네트워크·DB·LLM 0. 예문은 전부 지어낸 것(실제 DB 글 아님).
//   node scripts/ko-style-metrics-selftest.mjs            (정상 — 전부 통과해야 한다)
//   node scripts/ko-style-metrics-selftest.mjs --mutate   (뮤테이션 — lib 를 일부러 깨면 해당 그룹이 **실패**해야 한다)
//
// 그룹: doc(patterns.md ↔ 코드 상수 양방향) · split · ending · runs · metrics · patterns · numbers · latin · proper · urls · quotes
//       · qualifiers · negation · conditional · length · change · voice · gate(§7.1: 확인 불가는 통과가 아니다) · pure
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as real from '../lib/content/ko-style.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'lib/content/ko-style.ts')
const DOC = path.join(ROOT, 'content/guides/korean-naturalness/patterns.md')
const MUTATE = process.argv.includes('--mutate')
const say = (s) => process.stdout.write(`${s}\n`)

// ── patterns.md 파서(selftest 전용) ─────────────────────────────────────────
// [X 이름] 절의 "- " 항목(들여쓴 다음 줄은 이어 붙임)을 괄호 설명 제거 → "라벨: " 제거 → ", " 로 나눈다.
function parseDoc(md) {
  const sections = {}
  let cur = null
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = line.match(/^\[([^\]]+)\]/)
    if (h) { cur = h[1]; sections[cur] = []; continue }
    if (!cur) continue
    if (line.startsWith('- ')) sections[cur].push(line.slice(2))
    else if (/^\s+\S/.test(line) && sections[cur].length) sections[cur][sections[cur].length - 1] += ' ' + line.trim()
  }
  const items = (bullets) => bullets.flatMap((b) => b.replace(/\s?\([^)]*\)/g, '').replace(/^[^,:"]+:\s/, '').split(/,\s*/).map((x) => x.trim()).filter(Boolean))
  const pick = (letter) => Object.entries(sections).find(([k]) => k.startsWith(`${letter} `))?.[1] ?? null
  return { sections, items, pick }
}

// ── 예문(지어낸 것) ─────────────────────────────────────────────────────────
const EXAMPLES = {
  'A-tonghae': '이 전략을 통해 매출이 늘었다.',
  'A-isseoseo': '마케팅에 있어서 가격은 중요했다.',
  'A-daehan': '가격에 대한 불만이 많았다.',
  'A-uihae': '이 제품은 창업자에 의해 만들어졌다.',
  'A-inhae': '품절로 인해 매출이 줄었다.',
  'A-ganeung': '하루 만에 배송하는 것이 가능하다.',
  'A-su-itda': '고객은 언제든 환불할 수 있다.',
  'A-doeeojin': '이 방식은 업계에서 널리 사용되어진다.',
  'A-boyeojin': '성장세가 뚜렷하게 보여진다.',
  'A-bullyeojin': '이 제품은 국민 샴푸로 불려진다.',
  'A-geu': '그는 회사를 떠났다.',
  'A-geunyeo': '그녀는 매장을 열었다.',
  'A-geudeul': '그들은 가격을 내렸다.',
  'A-ui3': '회사의 제품의 품질의 개선이 필요했다.',
  'B-cheotjjae': '첫째, 가격을 내렸다.',
  'B-dansunhan': '이것은 단순한 할인이 아니라 전략이다.',
  'B-ppunman': '가격뿐만 아니라 품질도 좋았다.',
  'B-ibeon-geul': '이번 글에서는 가격 전략을 본다.',
  'B-gyeollon': '결론적으로 가격이 답이었다.',
  'B-triad': '속도, 가격, 그리고 품질을 모두 잡았다.',
  'B-yangbi': '이 전략은 장점도 있지만 과제도 있다.',
  'C-sisa': '이 사례는 시사하는 바가 크다.',
  'C-jumok': '이 수치는 주목할 만하다.',
  'C-haeksim': '후기가 핵심적인 역할을 했다.',
  'C-hyeoksin': '혁신적인 제품이었다.',
  'C-dayang': '다양한 고객이 찾았다.',
  'C-paradigm': '시장의 패러다임이 바뀌었다.',
  'C-ireohan': '이러한 흐름이 이어졌다.',
  'C-rago-hal-su': '이것이 성공 요인이라고 할 수 있다.',
  'C-jungyo-end': '고객 후기를 읽는 것이 중요하다.',
  'C-geuchiji': '효과는 매출에 그치지 않는다.',
  'E-arrow': '가격 인하 → 매출 증가였다.',
  'E-emoji': '매출이 늘었다 🚀',
  'E-emdash': '가격을 내렸다 — 그런데 매출은 줄었다.',
  'E-bold': '**가격**을 내렸다.',
  'E-byeonggi': '글로시에(Glossier)는 커뮤니티를 키웠다. 이후 글로시에(Glossier)는 매장을 열었다.',
}
// 패턴이 하나도 없어야 하는 자연스러운 평어체 글. 관형사 "그", 명사 "수", 천단위 쉼표, 2개 나열이 들어 있다.
const CLEAN = '그 브랜드는 2019년에 첫 매장을 열었다. 첫해 매출은 1,200만 원이었다. 회원 수는 늘지 않았다. 창업자는 매일 아침 고객 후기를 읽었고 가격과 포장을 고쳤다.'

const BASE = [
  '김민수 대표는 2019년에 회사를 세웠다.',
  '첫해 매출은 약 1,200만 원이었고, 재구매율은 최대 35.5%까지 올랐다.',
  '회사는 Glossier의 커뮤니티 전략을 참고했다.',
  '업계에서는 "후기가 곧 광고다"라는 말이 돌았다.',
  '가격을 내리지 않았다면 성장은 없었을 것이다.',
  '자세한 내용은 https://example.com/report.pdf 에 있다.',
].join(' ')

async function suite(m) {
  const fails = {}
  const ok = (group, name, cond) => { if (!cond) { fails[group] = (fails[group] ?? 0) + 1; if (!MUTATE) say(`❌ [${group}] ${name}`) } }
  const guard = (group, fn) => { try { fn() } catch (e) { ok(group, `예외: ${e?.message ?? e}`, false) } }
  const check = (b, a, id, opts) => m.invariants(b, a, opts).find((c) => c.id === id)
  const failsOnly = (b, a, id) => { const cs = m.invariants(b, a); return cs.find((c) => c.id === id)?.status === 'fail' }

  // doc — patterns.md 항목과 코드 상수가 양방향으로 맞는다
  guard('doc', () => {
    const md = fs.readFileSync(DOC, 'utf8')
    const { items, pick } = parseDoc(md)
    for (const g of ['A', 'B', 'C', 'E']) {
      const bullets = pick(g)
      ok('doc', `patterns.md 에 [${g} …] 절이 있다`, bullets && bullets.length > 0)
      if (!bullets) continue
      const mdItems = items(bullets).sort()
      const code = [...m.PATTERNS.filter((p) => p.group === g).map((p) => p.doc), ...Object.keys(m.UNMEASURED).filter((k) => mdItems.includes(k))].sort()
      const missingInCode = mdItems.filter((x) => !code.includes(x))
      const missingInDoc = code.filter((x) => !mdItems.includes(x))
      ok('doc', `[${g}] md 항목이 코드에 다 있다 (없음: ${missingInCode.join(' | ')})`, missingInCode.length === 0)
      ok('doc', `[${g}] 코드 패턴이 md 에 다 있다 (없음: ${missingInDoc.join(' | ')})`, missingInDoc.length === 0)
      ok('doc', `[${g}] 항목 수 일치 md ${mdItems.length} = 코드 ${code.length}`, mdItems.length === code.length)
    }
    const allMd = ['A', 'B', 'C', 'E'].flatMap((g) => items(pick(g) ?? []))
    ok('doc', 'UNMEASURED 항목이 전부 md 에 있다', Object.keys(m.UNMEASURED).every((k) => allMd.includes(k)))
    ok('doc', 'UNMEASURED 는 이유가 비어 있지 않다', Object.values(m.UNMEASURED).every((v) => v.length > 10))
    ok('doc', '패턴 id 중복 없음', new Set(m.PATTERNS.map((p) => p.id)).size === m.PATTERNS.length)
    // [D 리듬]
    const d = (pick('D') ?? []).join('\n')
    const conj = d.match(/문두 접속사\(([^)]+)\)/)?.[1].split('·') ?? []
    ok('doc', `[D] 문두 접속사 ${conj.length}개가 OPENING_CONJ 에 다 있다`, conj.length >= 5 && conj.every((w) => m.OPENING_CONJ.includes(w)))
    ok('doc', '[D] 평어체 연속 기준 = RUN_MIN.plain', Number(d.match(/평어체는 (\d+)문장/)?.[1]) === m.RUN_MIN.plain)
    ok('doc', '[D] 합쇼체 연속 기준 = RUN_MIN.polite', Number(d.match(/합쇼체는 (\d+)문장/)?.[1]) === m.RUN_MIN.polite)
    ok('doc', '[D] 쉼표 밀도·표준편차 항목이 있다', /쉼표 밀도/.test(d) && /표준편차/.test(d))
    // [보존]
    const keep = Object.entries(parseDoc(md).sections).find(([k]) => k.startsWith('보존'))?.[1] ?? []
    const qLine = keep.find((b) => b.startsWith('한정어:'))
    const qMd = qLine ? qLine.replace(/^한정어:\s*/, '').split(/,\s*/).map((x) => x.trim()).sort() : []
    const qCode = m.QUALIFIERS.map((q) => q.doc).sort()
    ok('doc', `[보존] 한정어 목록 일치 md(${qMd.join('·')}) = 코드(${qCode.join('·')})`, qMd.length > 0 && JSON.stringify(qMd) === JSON.stringify(qCode))
    ok('doc', '[우선순위] voice-guide §0 우선 문장이 있다', /voice-guide\.md §0/.test(md))
  })

  // split — 문장 분리
  guard('split', () => {
    const n = (t) => m.splitSentences(t).length
    ok('split', '소수점 3.5 에서 안 끊는다', n('매출은 3.5배 늘었다. 이익도 늘었다.') === 2)
    ok('split', 'U.S. 약어에서 안 끊는다', n('U.S. 시장에서 팔았다. 반응이 좋았다.') === 2)
    ok('split', '따옴표 안 마침표에서 안 끊는다', n('그는 "좋다. 정말 좋다."라고 말했다. 끝났다.') === 2)
    ok('split', '굽은 따옴표 안에서도 안 끊는다', n('그는 “좋다. 정말.”이라고 했다. 끝났다.') === 2)
    ok('split', '괄호 안 마침표에서 안 끊는다', n('(2024년 기준. 자체 집계) 매출이 늘었다.') === 1)
    ok('split', '날짜 2024. 3. 15. 에서 안 끊는다', n('2024. 3. 15. 출시했다. 잘 팔렸다.') === 2)
    ok('split', '도메인 a.com 에서 안 끊는다', n('www.example.com 에서 샀다? 정말 샀다!') === 2)
    ok('split', '?! 연속은 한 번만 끊는다', n('정말?! 그랬다.') === 2)
    ok('split', '제목 줄은 문장이 아니다', n('# 제목\n본문이다.') === 1)
    ok('split', '목록 표시를 떼고 줄마다 끊는다', JSON.stringify(m.splitSentences('- 첫 항목이다.\n- 둘째 항목이다.')) === JSON.stringify(['첫 항목이다.', '둘째 항목이다.']))
    ok('split', '코드 블록은 건너뛴다', n('본문이다.\n```\nconst a = 1. b = 2.\n```\n끝이다.') === 2)
    ok('split', '마침표 없는 마지막 문장도 센다', n('늘었다. 줄었다') === 2)
  })

  // ending — 어미 분류
  guard('ending', () => {
    const cases = [['했다.', '~ㅆ다'], ['됐다.', '~ㅆ다'], ['열었다.', '~ㅆ다'], ['한다.', '~ㄴ다'], ['먹는다.', '~ㄴ다'], ['회사이다.', '~이다'], ['있다.', '~다'], ['있었다.', '~ㅆ다'],
      ['했습니다.', '합쇼체'], ['입니까?', '합쇼체'], ['했어요.', '해요체'], ['그랬죠.', '해요체'], ['왜 샀을까?', '~까'], ['"좋습니다."', '인용'], ['그는 "감사합니다"라고 말했다.', '~ㅆ다'], ['매출 증가', '기타']]
    for (const [s, e] of cases) ok('ending', `"${s}" → ${e} (실제 ${m.endingOf(s)})`, m.endingOf(s) === e)
  })

  // runs — 같은 어미 연속
  guard('runs', () => {
    const r = (t) => m.metrics(t)
    ok('runs', '~했다 4연속(했다·됐다 섞임) = 1건', r('매출이 늘었다. 고객이 왔다. 직원이 늘었다. 사업이 커졌다.').plainRuns === 1)
    ok('runs', '3연속은 0건', r('매출이 늘었다. 고객이 왔다. 직원이 늘었다. 사업이 큰다.').plainRuns === 0)
    ok('runs', '중간에 끊기면 0건', r('늘었다. 왔다. 한다. 늘었다. 왔다.').plainRuns === 0)
    ok('runs', 'maxRun 은 가장 긴 연속', r('늘었다. 왔다. 갔다. 한다.').maxRun === 3)
    ok('runs', '합쇼체 4연속은 0건', r('늘었습니다. 왔습니다. 갔습니다. 했습니다.').politeRuns === 0)
    ok('runs', '합쇼체 5연속은 1건', r('늘었습니다. 왔습니다. 갔습니다. 했습니다. 됐습니다.').politeRuns === 1)
  })

  // metrics — 쉼표·길이·접속사
  guard('metrics', () => {
    const withC = '가격은, 솔직히, 높았다. 고객은, 그래도, 샀다. 매출이 늘었다.'
    const noC = '가격은 솔직히 높았다. 고객은 그래도 샀다. 매출이 늘었다.'
    const b = m.metrics(withC)
    const a = m.metrics(noC)
    ok('metrics', `쉼표 제거 → 문장당 쉼표 하락 (${b.commasPerSentence}→${a.commasPerSentence})`, b.commasPerSentence > a.commasPerSentence && a.commasPerSentence === 0)
    ok('metrics', `쉼표 제거 → 쉼표 문장 비율 하락 (${b.commaSentenceRatio}→${a.commaSentenceRatio})`, b.commaSentenceRatio > a.commaSentenceRatio)
    ok('metrics', '쉼표 문장 비율 2/3', Math.abs(b.commaSentenceRatio - 0.667) < 0.001)
    ok('metrics', 'compare delta 가 음수', m.compare(withC, noC).delta.commasPerSentence < 0)
    ok('metrics', '천단위 쉼표는 쉼표로 안 센다', m.metrics('매출은 1,200,000원이었다.').commasPerSentence === 0)
    ok('metrics', '길이가 같으면 표준편차 0', m.metrics('가나다라다. 마바사아다.').lengthStd === 0)
    ok('metrics', '길이 평균 = 공백 뺀 글자 수', m.metrics('가나 다라다.').lengthMean === 6)
    const c = m.metrics('또한 늘었다. 그러나 줄었다. 매출이 늘었다. 즉, 좋았다. 즉시 샀다.')
    ok('metrics', `문두 접속사 3/5 (실제 ${c.openingConjCount})`, c.openingConjCount === 3 && c.openingConjRatio === 0.6)
    const f = m.metrics('이러한 흐름이 있었다. 이러한 결과가 나왔다 — 그런데 줄었다 → 다시 늘었다 🚀 **굵게** 했다.')
    ok('metrics', `이러한 2 · em-dash 1 · 화살표 1 · 이모지 1 · 굵은 글씨 1`, f.ireohan === 2 && f.emDash === 1 && f.arrows === 1 && f.emoji === 1 && f.bold === 1)
    ok('metrics', '빈 글은 0 으로 (NaN 아님)', m.metrics('').commasPerSentence === 0 && m.metrics('').sentences === 0)
  })

  // patterns — 예문마다 해당 패턴이 잡히고, 자연스러운 글은 0
  guard('patterns', () => {
    for (const p of m.PATTERNS) {
      const ex = EXAMPLES[p.id]
      ok('patterns', `${p.id} 예문이 있다`, typeof ex === 'string')
      if (ex) ok('patterns', `${p.id} 이 예문에서 잡힌다: ${ex}`, (m.metrics(ex).patterns[p.group].byId[p.id] ?? 0) >= 1)
    }
    const clean = m.metrics(CLEAN)
    const hit = Object.entries({ ...clean.patterns.A.byId, ...clean.patterns.B.byId, ...clean.patterns.C.byId, ...clean.patterns.E.byId }).filter(([, v]) => v > 0)
    ok('patterns', `자연스러운 글은 패턴 0 (오탐: ${hit.map(([k]) => k).join(', ')})`, clean.patterns.total === 0)
    ok('patterns', '명사 "수" 뒤 "있"은 "할 수 있다"가 아니다', m.metrics('가입자 수 있는 그대로 공개했다.').patterns.A.byId['A-su-itda'] === 0)
    ok('patterns', '3개 나열 1건', m.metrics(EXAMPLES['B-triad']).triads === 1)
    ok('patterns', '2개 나열은 3개 나열이 아니다', m.metrics('가격, 품질을 잡았다.').triads === 0)
    ok('patterns', '병기 첫 등장 1회는 안 센다', m.metrics('글로시에(Glossier)는 컸다.').patterns.E.byId['E-byeonggi'] === 0)
    ok('patterns', '그룹 합계 = byId 합', ['A', 'B', 'C', 'E'].every((g) => { const x = m.metrics(EXAMPLES['C-rago-hal-su'] + EXAMPLES['A-tonghae']).patterns[g]; return x.total === Object.values(x.byId).reduce((a, b) => a + b, 0) }))
  })

  // 불변 검사 — 각각 양성·음성
  guard('numbers', () => {
    ok('numbers', '동일 → pass', check(BASE, BASE, 'numbers').status === 'pass')
    ok('numbers', '35.5% → 36.5% fail', failsOnly(BASE, BASE.replace('35.5%', '36.5%'), 'numbers'))
    ok('numbers', '1,200만 → 1200만 fail(형식도 보존)', failsOnly(BASE, BASE.replace('1,200만', '1200만'), 'numbers'))
    ok('numbers', '단위 바뀜 35.5% → 35.5배 fail', failsOnly(BASE, BASE.replace('35.5%', '35.5배'), 'numbers'))
    ok('numbers', '숫자와 단위 사이 띄어쓰기만 바뀜 → pass', check('35.5 % 늘었다.', '35.5% 늘었다.', 'numbers').status === 'pass')
    ok('numbers', '사유에 바뀐 숫자가 나온다', /35\.5%/.test(check(BASE, BASE.replace('35.5%', '36.5%'), 'numbers').reason))
    ok('numbers', 'URL 안 숫자는 숫자로 안 센다', !m.numbers('https://a.com/x2024 에 있다.').length)
  })
  guard('latin', () => {
    ok('latin', 'Glossier → 글로시에 fail', failsOnly(BASE, BASE.replace('Glossier', '글로시에'), 'latin'))
    ok('latin', '대소문자 바뀜 fail', failsOnly('SaaS 회사였다.', 'Saas 회사였다.', 'latin'))
    ok('latin', '동일 → pass', check(BASE, BASE, 'latin').status === 'pass')
  })
  guard('proper', () => {
    ok('proper', '직함 앞 이름 김민수 → 김영희 fail', failsOnly(BASE, BASE.replace('김민수', '김영희'), 'proper-hangul'))
    ok('proper', '병기 한글 글로시에 → 글로시아 fail', failsOnly('글로시에(Glossier)는 컸다.', '글로시아(Glossier)는 컸다.', 'proper-hangul'))
    ok('proper', '조직 접미사 어절 삼성전자 → 삼성 fail', failsOnly('삼성전자는 컸다.', '삼성은 컸다.', 'proper-hangul'))
    ok('proper', '조사만 바뀜 → pass', check('김민수 대표가 세웠다.', '김민수 대표는 세웠다.', 'proper-hangul').status === 'pass')
    ok('proper', '"회사의 대표"의 회사의는 후보가 아니다', !m.hangulProperCandidates('회사의 대표가 바뀌었다.').includes('회사의'))
  })
  guard('urls', () => {
    ok('urls', 'URL 경로 바뀜 fail', failsOnly(BASE, BASE.replace('report.pdf', 'report2.pdf'), 'urls'))
    ok('urls', '문장 끝 마침표는 URL 이 아니다', m.invariants('https://a.com.', 'https://a.com').find((c) => c.id === 'urls').status === 'pass')
  })
  guard('quotes', () => {
    ok('quotes', '따옴표 안 한 글자 바뀜 fail', failsOnly(BASE, BASE.replace('후기가 곧', '후기는 곧'), 'quotes'))
    ok('quotes', '홑따옴표 강조어 바뀜 fail', failsOnly("'탈모샴푸' 시장이었다.", "'탈모 샴푸' 시장이었다.", 'quotes'))
    ok('quotes', "영어 아포스트로피(it's)는 인용이 아니다", m.quotes("it's fine, don't.").length === 0)
  })
  guard('qualifiers', () => {
    ok('qualifiers', "'약' 삭제 fail", failsOnly(BASE, BASE.replace('약 1,200만', '1,200만'), 'qualifiers'))
    ok('qualifiers', "'최대' 삭제 fail", failsOnly(BASE, BASE.replace('최대 ', ''), 'qualifiers'))
    ok('qualifiers', "'추정' 추가도 fail", failsOnly('매출은 10억 원이었다.', '매출은 10억 원으로 추정됐다.', 'qualifiers'))
    ok('qualifiers', "'약을'(의약)은 한정어가 아니다", check('약을 먹었다.', '약을 먹었다.', 'qualifiers').status === 'pass' && m.QUALIFIERS[0].re.test('약을') === false)
    ok('qualifiers', '사유에 한정어 이름이 나온다', /'약' 1→0/.test(check(BASE, BASE.replace('약 1,200만', '1,200만'), 'qualifiers').reason))
  })
  guard('negation', () => {
    ok('negation', '부정 뒤집힘 "내리지 않았다면" → "내렸다면" fail', failsOnly(BASE, BASE.replace('내리지 않았다면', '내렸다면'), 'negation'))
    ok('negation', '"없었을" → "컸을" fail', failsOnly(BASE, BASE.replace('없었을', '컸을'), 'negation'))
    ok('negation', '"하지 않았다" ↔ "안 했다" 바꿔 쓰기는 pass', check('그는 사지 않았다.', '그는 안 샀다.', 'negation').status === 'pass')
    ok('negation', '"뿐만 아니라" 삭제는 부정 변화가 아니다', check('가격뿐만 아니라 품질도 좋았다.', '가격도 품질도 좋았다.', 'negation').status === 'pass')
  })
  guard('conditional', () => {
    ok('conditional', '가정 "않았다면" → "않았기에" fail', failsOnly(BASE, BASE.replace('않았다면', '않았기에'), 'conditional'))
    ok('conditional', '"~면" ↔ "~할 경우" 바꿔 쓰기는 pass', check('값을 내리면 팔렸다.', '값을 내릴 경우 팔렸다.', 'conditional').status === 'pass')
    ok('conditional', '"반면"은 가정이 아니다', check('반면 이익은 줄었다.', '이익은 줄었다.', 'conditional').status === 'pass')
  })
  guard('length', () => {
    ok('length', '두 배로 폭주 fail', check(BASE, BASE + ' ' + BASE, 'length-ratio').status === 'fail')
    ok('length', '첫 문장만 남김 fail', check(BASE, BASE.split('. ')[0] + '.', 'length-ratio').status === 'fail')
    ok('length', '빈 after fail', check(BASE, '', 'length-ratio').status === 'fail')
    ok('length', '동일 1.0 pass', check(BASE, BASE, 'length-ratio').status === 'pass')
  })
  guard('change', () => {
    ok('change', 'kitten/sitting = 3', m.editDistance('kitten', 'sitting') === 3)
    ok('change', '빈 문자열 = 길이', m.editDistance('', '가나다') === 3)
    ok('change', '이모지는 1글자', m.editDistance('a🚀b', 'ab') === 1)
    ok('change', '동일 = 0', m.editDistance(BASE, BASE) === 0)
    ok('change', '상한 초과 → null(계산 안 함)', m.editDistance('가나다', '라마바', 1) === null)
    const shuffled = BASE.split(/(?<=[.]) /).reverse().join(' ')
    const sc = m.invariants(BASE, shuffled)
    ok('change', `문장 순서 뒤집기 → 변경률 fail (${sc.find((c) => c.id === 'change-rate').after})`, sc.find((c) => c.id === 'change-rate').status === 'fail')
    ok('change', '문장 순서 뒤집기 — 다른 불변은 pass(변경률만 잡는다)', sc.filter((c) => c.id !== 'change-rate').every((c) => c.status === 'pass'))
    const lim = check(BASE, BASE.replace('35.5', '36.5'), 'change-rate', { editCellLimit: 0 })
    ok('change', '계산 상한 초과 → unknown (pass 로 접지 않는다)', lim.status === 'unknown')
  })
  guard('voice', () => {
    const polite = BASE.replace('세웠다.', '세웠습니다.').replace('참고했다.', '참고했습니다.')
    ok('voice', '합쇼체 변환 fail', failsOnly(BASE, polite, 'voice'))
    ok('voice', '해요체 변환 fail', failsOnly(BASE, BASE.replace('세웠다.', '세웠어요.'), 'voice'))
    ok('voice', '따옴표 안 합쇼체는 평어체 위반이 아니다', check('그는 말했다.', '그는 "감사합니다."라고 말했다.', 'voice').status === 'pass')
    ok('voice', '원래 합쇼체였던 글은 그대로면 pass', check('저는 샀습니다.', '저는 샀습니다.', 'voice').status === 'pass')
  })
  // gate — §7.1
  guard('gate', () => {
    const same = m.gate(BASE, BASE)
    ok('gate', '동일 텍스트 → 전부 pass · passed · warn 없음', same.passed && !same.warn && same.checks.every((c) => c.status === 'pass') && same.reasons.length === 0)
    ok('gate', '동일 텍스트 → 변경률 0', same.checks.find((c) => c.id === 'change-rate').after === 0)
    ok('gate', '숫자 하나 바뀌면 not passed', !m.gate(BASE, BASE.replace('35.5%', '36.5%')).passed)
    const bad = m.gate(BASE, BASE.replace('35.5%', '36.5%'))
    ok('gate', '실패 사유가 문장으로 나온다', bad.reasons.some((r) => r.startsWith('[실패 numbers]') && r.length > 20))
    const unk = m.gate(BASE, BASE.replace('35.5', '36.5'), { editCellLimit: 0 })
    ok('gate', '확인 불가가 하나라도 있으면 not passed', !unk.passed && unk.reasons.some((r) => r.includes('[확인 불가 change-rate]')))
    const nonStr = m.gate(BASE, null)
    ok('gate', '입력이 문자열이 아니면 전부 unknown · not passed', !nonStr.passed && nonStr.checks.every((c) => c.status === 'unknown'))
    ok('gate', '빈 before → unknown · not passed', !m.gate('  ', BASE).passed && m.gate('  ', BASE).checks.every((c) => c.status === 'unknown'))
    const pre = '가'.repeat(100) + '다.'
    const w = m.gate(pre, '나'.repeat(40) + '가'.repeat(60) + '다.')
    ok('gate', `변경률 0.3~0.5 → passed + warn (${w.checks.find((c) => c.id === 'change-rate').after})`, w.passed && w.warn && w.reasons.some((r) => r.startsWith('[경고')))
    const w2 = m.gate(pre, '나'.repeat(20) + '가'.repeat(80) + '다.')
    ok('gate', '변경률 0.3 이하 → warn 없음', w2.passed && !w2.warn)
    ok('gate', '변경률 0.5 초과 → not passed', !m.gate(pre, '나'.repeat(60) + '가'.repeat(40) + '다.').passed)
    ok('gate', '게이트 상수 0.7~1.3 / 0.5 / 0.3', JSON.stringify(m.GATE) === JSON.stringify({ lengthRatio: [0.7, 1.3], changeMax: 0.5, changeWarn: 0.3 }))
  })
  guard('pure', () => {
    const b = String(BASE)
    const r1 = JSON.stringify(m.gate(b, b.replace('약 ', '')))
    const r2 = JSON.stringify(m.gate(b, b.replace('약 ', '')))
    ok('pure', '같은 입력 → 같은 출력', r1 === r2)
    ok('pure', '입력 문자열이 그대로다', b === BASE)
    ok('pure', 'metrics 두 번 같은 값(정규식 lastIndex 누수 없음)', JSON.stringify(m.metrics(BASE)) === JSON.stringify(m.metrics(BASE)))
  })
  return fails
}

if (!MUTATE) {
  const res = await suite(real)
  const n = Object.values(res).reduce((a, b) => a + b, 0)
  say(n ? `ko-style-metrics-selftest: 실패 ${n}건 (${JSON.stringify(res)})` : 'ko-style-metrics-selftest: 통과 — doc · split · ending · runs · metrics · patterns · numbers · latin · proper · urls · quotes · qualifiers · negation · conditional · length · change · voice · gate · pure')
  process.exitCode = n ? 1 : 0
} else {
  const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n') // Windows CRLF 체크아웃에서도 치환 대상이 맞게
  const MUTANTS = [
    ['doc', '패턴 하나 삭제(md 와 어긋남)', "  { id: 'C-paradigm', group: 'C', doc: '패러다임', count: all(/패러다임/g) },\n", ''],
    ['doc', '평어체 연속 기준 4→5', 'export const RUN_MIN = { plain: 4,', 'export const RUN_MIN = { plain: 5,'],
    ['split', '마침표 뒤 공백 검사 끄기(3.5·U.S. 오분리)', "if (next !== undefined && !/\\s/.test(next)) { i = j; continue }", 'if (false) { i = j; continue }'],
    ['split', '큰따옴표 깊이 무시', "if (c === '\"') { ascii = !ascii; continue }", "if (c === '\"') { continue }"],
    ['ending', 'ㅆ 받침 과거 분류 끄기', "if (jong(pen) === 20 && pen !== '있') return '~ㅆ다'", "if (false) return '~ㅆ다'"],
    ['ending', '인용 문장 분류 끄기', "if (/^[\"“「『]/.test(s) && /[\"”」』][.!?]?$/.test(s)) return '인용'", ''],
    ['metrics', '천단위 쉼표도 쉼표로 셈', ".replace(/(?<=\\d)[,，](?=\\d)/g, '')", ''],
    ['patterns', '"할 수 있다" ㄹ 받침 필터 끄기', '.filter((m) => jong(m[1]) === 8).length', '.length'],
    ['patterns', '3개 나열을 4개부터', '(?:[^\\s,.!?]+,\\s+){2,}', '(?:[^\\s,.!?]+,\\s+){3,}'],
    ['numbers', '숫자 검사가 after 를 안 봄', "multisetCheck('numbers', '숫자(단위 포함)', numbers(before), numbers(after))", "multisetCheck('numbers', '숫자(단위 포함)', numbers(before), numbers(before))"],
    ['latin', '영문 검사가 after 를 안 봄', "latinTokens(before), latinTokens(after))", "latinTokens(before), latinTokens(before))"],
    ['proper', '한글 고유명사 누락을 안 봄', 'const lost = cands.filter((w) => !after.includes(w))', 'const lost: string[] = []'],
    ['urls', 'URL 검사가 after 를 안 봄', "multisetCheck('urls', 'URL', urls(before), urls(after))", "multisetCheck('urls', 'URL', urls(before), urls(before))"],
    ['quotes', '인용 검사가 after 를 안 봄', "quotes(before), quotes(after))", "quotes(before), quotes(before))"],
    ['qualifiers', "'약' 패턴 무력화", "{ doc: '약', re: /(?<![가-힣])약(?=\\s)/g }", "{ doc: '약', re: /$^/g }"],
    ['negation', "'않' 을 부정에서 뺌", "  ['않', /않/g],\n", ''],
    ['conditional', '~면 을 가정에서 뺌', '.filter((m) => !MYEON_NOUN.test(m[0])).length', '.filter(() => false).length'],
    ['length', '길이비 상한 검사 끄기', 'ratio >= lo && ratio <= hi', 'ratio >= lo'],
    ['change', '변경률 상한 검사 끄기', 'checks.push(rate <= GATE.changeMax', 'checks.push(true'],
    ['change', '계산 상한 무시(unknown 대신 계산)', '  if (a.length * b.length > limit) return null\n', ''],
    ['voice', '합쇼체 증가 무시', 'cnt(ea, k) > cnt(eb, k))', 'cnt(ea, k) > cnt(eb, k) + 99)'],
    ['gate', '확인 불가를 통과로 접기(§7.1 위반)', "passed: checks.every((c) => c.status === 'pass')", "passed: checks.every((c) => c.status !== 'fail')"],
    ['gate', '경고 기준을 0.5 로', "rate.after > GATE.changeWarn\n", "rate.after > GATE.changeMax\n"],
  ]
  let pass = 0, fail = 0
  const base = await suite(real)
  if (Object.keys(base).length) { fail++; say(`❌ 뮤테이션 전 원본이 실패한다: ${JSON.stringify(base)}`) } else pass++
  for (const [i, [group, name, from, to]] of MUTANTS.entries()) {
    if (!src.includes(from)) { fail++; say(`❌ 뮤테이션 대상 문자열이 원본에 없다: ${name}`); continue }
    const tmp = path.join(ROOT, 'lib/content', `.mutant-ko-style-${i}.ts`)
    try {
      fs.writeFileSync(tmp, src.replace(from, to))
      const res = await suite(await import(pathToFileURL(tmp).href))
      if ((res[group] ?? 0) > 0) { pass++; say(`✅ 잡힘  [${group}] ${name}`) }
      else { fail++; say(`❌ 뮤테이션 "${name}" → ${group} 그룹이 실패하지 않았다(살아남은 뮤턴트)`) }
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  say(fail ? `ko-style-metrics-selftest --mutate: 실패 ${fail}건 / 통과 ${pass}건` : `ko-style-metrics-selftest --mutate: 뮤턴트 ${MUTANTS.length}개 전부 잡힘(+원본 통과)`)
  process.exitCode = fail ? 1 : 0
}
