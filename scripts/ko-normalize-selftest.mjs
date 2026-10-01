#!/usr/bin/env node
// 한국어 기계적 정규화(lib/content/ko-normalize.ts) 셀프테스트 — 네트워크·DB·LLM 0. 예문은 전부 지어낸 것(실제 DB 글 아님).
//   node scripts/ko-normalize-selftest.mjs            (정상 — 전부 통과해야 한다)
//   node scripts/ko-normalize-selftest.mjs --mutate   (뮤테이션 — lib 를 일부러 깨면 해당 그룹이 **실패**해야 한다)
//
// 그룹: particle · arrow · dash · bold · emoji · rollback · idempotent · pure
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as real from '../lib/content/ko-normalize.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'lib/content/ko-normalize.ts')
const MUTATE = process.argv.includes('--mutate')
const say = (s) => process.stdout.write(`${s}\n`)

async function suite(m) {
  const fails = {}
  const ok = (group, name, cond) => { if (!cond) { fails[group] = (fails[group] ?? 0) + 1; if (!MUTATE) say(`❌ [${group}] ${name}`) } }
  const guard = (group, fn) => { try { fn() } catch (e) { ok(group, `예외: ${e?.message ?? e}`, false) } }
  const N = (t, o) => m.normalizeKo(t, o)
  const same = (t) => N(t).text === t
  const hasManual = (t, rule, re) => N(t).manual.some((x) => x.rule === rule && re.test(x.reason))

  guard('particle', () => {
    ok('particle', '"Acme 가" → "Acme가"', N('그해 Acme 가 공장을 샀다.').text === '그해 Acme가 공장을 샀다.')
    ok('particle', '"41.5% 로" → "41.5%로"', N('비중은 41.5% 로 올랐다.').text === '비중은 41.5%로 올랐다.')
    ok('particle', '"B&Q 에" → "B&Q에"', N('제품을 B&Q 에 넣었다.').text === '제품을 B&Q에 넣었다.')
    ok('particle', '"20-F 에" → "20-F에"', N('회사는 20-F 에 적었다.').text === '회사는 20-F에 적었다.')
    ok('particle', '문장 끝 조사도: "Acme 의." 류 → 공백만 지운다', N('주인은 Acme 의.').text === '주인은 Acme의.')
    ok('particle', '"Acme 가격" 은 조사가 아니다 → 그대로', same('Acme 가격을 내렸다.'))
    ok('particle', '"5 달러"·"2 배" 단위는 그대로', same('값은 5 달러였고 2 배가 됐다.'))
    ok('particle', '수 뒤 "만"·"도"(1,000 만 · 섭씨 3 도)는 그대로', same('매출은 1,000 만 원이었고 기온은 3 도였다.'))
    ok('particle', '뒤에 공백이 오는 "이"(FY2025 이 회사)는 그대로 + manual', same('FY2025 이 회사는 컸다.') && hasManual('FY2025 이 회사는 컸다.', 'particle-space', /지시 관형사/))
    ok('particle', '"Acme 이." 처럼 뒤가 문장부호인 "이"는 붙인다', N('남은 것은 Acme 이.').text === '남은 것은 Acme이.')
    ok('particle', '두 글자 조사 "Acme 에서"는 그대로 + manual', same('Acme 에서 샀다.') && hasManual('Acme 에서 샀다.', 'particle-space', /에서/))
    ok('particle', '괄호 뒤 "(...) 가"는 그대로 + manual', same('공장(2호기) 가 섰다.') && hasManual('공장(2호기) 가 섰다.', 'particle-space', /괄호/))
    ok('particle', '변경 기록에 규칙·전후가 남는다', N('Acme 는 컸다.').changes.length === 1 && N('Acme 는 컸다.').changes[0].rule === 'particle-space')
  })

  guard('arrow', () => {
    ok('arrow', '"12.5% → 18.0%로" → "12.5%에서 18.0%로"', N('비중은 12.5% → 18.0%로 올랐다.').text === '비중은 12.5%에서 18.0%로 올랐다.')
    ok('arrow', '공백 없는 "3억2,000만→4억 원으로" 는 "원으로"(두 글자)라 그대로', same('매출은 3억2,000만→4억 원으로 늘었다.'))
    ok('arrow', '"1,200만→2,400만 달러로" → "1,200만에서 2,400만 달러로"', N('비용은 1,200만→2,400만 달러로 늘었다.').text === '비용은 1,200만에서 2,400만 달러로 늘었다.')
    ok('arrow', '오른쪽이 "~로"로 안 끝나면("40%였다") 그대로 + manual', same('비중은 90% → 40%였다.') && hasManual('비중은 90% → 40%였다.', 'arrow', /오른쪽/))
    ok('arrow', '왼쪽이 수치가 아니면(출시 → 30%로) 그대로 + manual', same('출시 → 30%로 늘었다.') && hasManual('출시 → 30%로 늘었다.', 'arrow', /왼쪽/))
    ok('arrow', '연쇄 "10% → 20% → 30%로" 는 그대로 + manual', same('비중은 10% → 20% → 30%로 늘었다.') && hasManual('비중은 10% → 20% → 30%로 늘었다.', 'arrow', /연쇄/))
    ok('arrow', '흐름 "조사→설계→생산" 은 그대로 + manual', same('조사→설계→생산을 묶었다.') && hasManual('조사→설계→생산을 묶었다.', 'arrow', /연쇄/))
  })

  guard('dash', () => {
    ok('dash', '"줄였다 — 매출도 줄었다." → 문장 나눔', N('광고비를 줄였다 — 매출도 같이 줄었다.').text === '광고비를 줄였다. 매출도 같이 줄었다.')
    ok('dash', '앞이 명사구("한계 — 느렸다")면 그대로 + manual', same('외주 제조의 한계 — 속도가 느렸다.') && hasManual('외주 제조의 한계 — 속도가 느렸다.', 'em-dash', /앞이/))
    ok('dash', '뒤가 명사구("버렸다 — 큐레이션 포기.")면 그대로 + manual', same('차별점을 버렸다 — 큐레이션 포기.') && hasManual('차별점을 버렸다 — 큐레이션 포기.', 'em-dash', /뒤 절/))
    ok('dash', '따옴표 안 줄표는 그대로 + manual(괄호·따옴표)', hasManual("회사는 '가격을 올렸다 — 곧 내렸다'고 말했다.", 'em-dash', /괄호·따옴표 안/) && same("회사는 '가격을 올렸다 — 곧 내렸다'고 말했다."))
    ok('dash', '짝 줄표 셋 "A다 — B다 — C다." 는 고정점까지 돌아 전부 나뉜다', N('가격을 올렸다 — 고객이 떠났다 — 매출이 줄었다.').text === '가격을 올렸다. 고객이 떠났다. 매출이 줄었다.')
    ok('dash', '나중 바퀴에 해소된 자리는 manual 에 남지 않는다', N('가격을 올렸다 — 고객이 떠났다 — 매출이 줄었다.').manual.length === 0)
  })

  guard('bold', () => {
    ok('bold', '"**가격**을" → "가격을"', N('회사는 그해 봄에 **가격**을 내리고 포장을 바꿨다.').text === '회사는 그해 봄에 가격을 내리고 포장을 바꿨다.')
    ok('bold', '짧은 글에서 길이비(0.7)를 넘게 줄면 roll-back', same('**가격**을 내렸다.') && hasManual('**가격**을 내렸다.', 'bold', /roll-back/))
    ok('bold', '짝 안 맞는 ** 는 그대로 + manual', same('가격을 **내렸다.') && hasManual('가격을 **내렸다.', 'bold', /짝/))
  })
  guard('emoji', () => {
    ok('emoji', '문장 끝 이모지 제거', N('매출이 늘었다 🚀').text === '매출이 늘었다')
    ok('emoji', '사이 이모지는 공백 하나 남김', N('매출이 늘었다 🚀 이익도 늘었다.').text === '매출이 늘었다 이익도 늘었다.')
  })

  guard('rollback', () => {
    // 따옴표 안 공백을 고치면 인용 불변이 깨진다 → 그 한 건만 되돌리고 manual
    const q = "창업자는 'Acme 는 작다'고 했고 Acme 는 컸다."
    const r = N(q)
    ok('rollback', '따옴표 안 "Acme 는" 은 roll-back, 밖은 고친다', r.text === "창업자는 'Acme 는 작다'고 했고 Acme는 컸다.")
    ok('rollback', 'roll-back 사유에 실패한 불변 id 가 나온다', r.manual.some((x) => x.rule === 'particle-space' && x.reason.startsWith('roll-back') && x.reason.includes('[실패 quotes]')))
    ok('rollback', '결과는 원문 대비 gate 통과(숫자·영문·한정어·부정 불변)', r.changes.length === 1)
  })

  guard('idempotent', () => {
    const texts = ['그해 Acme 가 공장을 샀다 — 비용은 12.5% → 18.0%로 늘었다.', '그해 봄 **Acme** 가 공장을 새로 짓고 포장을 바꿨다.', '가격을 올렸다 — 고객이 떠났다 — 매출이 줄었다.', "창업자는 'Acme 는 작다'고 했고 Acme 는 컸다.", '매출이 늘었다 🚀 Acme 는 웃었다.', '흐름은 조사→설계→생산이었다.']
    for (const t of texts) {
      const a = N(t)
      const b = N(a.text)
      ok('idempotent', `두 번 돌려도 같다: ${t.slice(0, 20)}`, b.text === a.text && b.changes.length === 0)
    }
    ok('idempotent', '굵은 글씨를 걷은 자리 "Acme 가"도 같은 실행에서 붙인다', N('그해 봄 **Acme** 가 공장을 새로 짓고 포장을 바꿨다.').text === '그해 봄 Acme가 공장을 새로 짓고 포장을 바꿨다.')
  })

  guard('pure', () => {
    const t = String('그해 Acme 가 공장을 샀다.')
    ok('pure', '같은 입력 → 같은 출력', JSON.stringify(N(t)) === JSON.stringify(N(t)))
    ok('pure', '입력 문자열이 그대로다', t === '그해 Acme 가 공장을 샀다.')
    ok('pure', '빈 글은 그대로', N('').text === '' && N('').changes.length === 0)
    let threw = false
    try { m.normalizeKo(null) } catch { threw = true }
    ok('pure', '문자열이 아니면 예외(조용히 통과시키지 않는다)', threw)
  })
  return fails
}

if (!MUTATE) {
  const res = await suite(real)
  const n = Object.values(res).reduce((a, b) => a + b, 0)
  say(n ? `ko-normalize-selftest: 실패 ${n}건 (${JSON.stringify(res)})` : 'ko-normalize-selftest: 통과 — particle · arrow · dash · bold · emoji · rollback · idempotent · pure')
  process.exitCode = n ? 1 : 0
} else {
  const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n')
  const MUTANTS = [
    ['particle', '수 뒤 만·도 제외 끄기', '    if (/\\d/.test(prev) && DIGIT_UNIT_LIKE.test(p)) continue\n', ''],
    ['particle', "지시 관형사 '이' 보호 끄기", "    if (p === '이' && /\\s/.test(t[at + sp.length + 1] ?? ''))", '    if (false)'],
    ['particle', '조사 뒤 경계 검사 끄기(Acme 가격 오탐)', "([가는은를을이와과로에의도만께])(?=[\\s.,!?;:)\\]'\"’”]|$)/g", '([가는은를을이와과로에의도만께])/g'],
    ['arrow', '연쇄 검사 끄기', "if (ahead.endsWith('→') || /^\\S+?[ \\t]*→/.test(right))", 'if (false)'],
    ['arrow', '오른쪽 "수치로" 검사 끄기', '    if (!RIGHT_VALUE_RE.test(right))', '    if (false)'],
    ['arrow', '왼쪽 수치 검사 끄기', '    if (!LEFT_VALUE_RE.test(left))', '    if (false)'],
    ['dash', '앞 문장 완결 검사 끄기', "    if (!/[가-힣]다$/.test(leftSent) || !PLAIN_ENDINGS.includes(endingOf(leftSent)))", '    if (false)'],
    ['dash', '뒤 절 완결 검사 끄기', "    if (!rightSent || rightSent.includes('—') || !PLAIN_ENDINGS.includes(endingOf(rightSent)))", '    if (false)'],
    ['dash', '괄호·따옴표 균형 검사 끄기', '    if (!balanced(leftSent))', '    if (false)'],
    ['dash', '고정점 반복을 1바퀴로', 'const MAX_ROUNDS = 5', 'const MAX_ROUNDS = 1'],
    ['bold', '짝 안 맞는 ** manual 끄기', "const manual = /\\*\\*/.test(left) ?", 'const manual = false ?'],
    ['emoji', '이모지 양옆 공백을 다 지움', "to: m[1] && m[3] ? ' ' : ''", "to: ''"],
    ['rollback', '건별 gate 무시(롤백 안 함)', '        if (g.passed) {', '        if (true) {'],
    ['dash', 'manual 을 바퀴마다 비우지 않음(해소된 자리가 manual 에 남음)', '    manual = [] //', '    //'],
  ]
  let pass = 0, fail = 0
  const base = await suite(real)
  if (Object.keys(base).length) { fail++; say(`❌ 뮤테이션 전 원본이 실패한다: ${JSON.stringify(base)}`) } else pass++
  for (const [i, [group, name, from, to]] of MUTANTS.entries()) {
    if (!src.includes(from)) { fail++; say(`❌ 뮤테이션 대상 문자열이 원본에 없다: ${name}`); continue }
    const tmp = path.join(ROOT, 'lib/content', `.mutant-ko-normalize-${i}.ts`)
    try {
      fs.writeFileSync(tmp, src.replace(from, to))
      const res = await suite(await import(pathToFileURL(tmp).href))
      if ((res[group] ?? 0) > 0) { pass++; say(`✅ 잡힘  [${group}] ${name}`) }
      else { fail++; say(`❌ 뮤테이션 "${name}" → ${group} 그룹이 실패하지 않았다(살아남은 뮤턴트)`) }
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  say(fail ? `ko-normalize-selftest --mutate: 실패 ${fail}건 / 통과 ${pass}건` : `ko-normalize-selftest --mutate: 뮤턴트 ${MUTANTS.length}개 전부 잡힘(+원본 통과)`)
  process.exitCode = fail ? 1 : 0
}
