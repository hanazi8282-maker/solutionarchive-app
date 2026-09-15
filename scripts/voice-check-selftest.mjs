// lib/threads/voice-check.ts 자체 검증. 네트워크·DB 없음.
//   node scripts/voice-check-selftest.mjs
import { checkThreadPost } from '../lib/threads/voice-check.ts'

let passed = 0
const failures = []
function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return }
  failures.push(`${name} — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}
function ok(name, cond) { if (cond) passed++; else failures.push(name) }

const OLD = '2026-09-08T00:00:00Z' // 정착 전
const NEW = '2026-09-12T00:00:00Z' // 정착 후

ok('정상 본문 — 500자 이내', checkThreadPost('짧다. 평어체로 끝난다.', NEW).errors.length === 0)
ok('501자 초과는 에러', checkThreadPost('가'.repeat(501), NEW).errors.some(e => e.includes('500자')))
ok('500자 정확히는 통과', checkThreadPost('가'.repeat(500), NEW).errors.length === 0)
ok('기호 → 는 에러', checkThreadPost('16%에서 25%→ 늘었다.', NEW).errors.some(e => e.includes('기호')))
ok('em-dash 는 에러', checkThreadPost('반전이다 — 그렇게 됐다.', NEW).errors.some(e => e.includes('기호')))
ok('S-1 언급은 에러', checkThreadPost('S-1 공시에 그렇게 적혀 있다.', NEW).errors.some(e => e.includes('게이트 용어')))
ok('제3자 검증 언급은 에러', checkThreadPost('제3자 검증 없이 나온 수치다.', NEW).errors.some(e => e.includes('게이트 용어')))
ok('출처 괄호는 에러', checkThreadPost('그렇게 됐다(출처: 어딘가).', NEW).errors.some(e => e.includes('게이트 용어')))

ok('9/11 이후 해요체 마무리는 warn', checkThreadPost('그렇게 하고 있나요?', NEW).warns.some(w => w.includes('해요체')))
ok('9/11 이후 합쇼체 마무리도 warn', checkThreadPost('그런 것입니까?', NEW).warns.some(w => w.includes('해요체')))
ok('9/11 이전 해요체는 warn 없음(과거 기록)', checkThreadPost('그렇게 하고 있나요?', OLD).warns.length === 0)
ok('평어체 마무리는 warn 없음', checkThreadPost('그렇게 하고 있는가?', NEW).warns.length === 0)

ok('일반론으로 시작하면 warn', checkThreadPost('사람들은 보통 이렇게 한다.', NEW).warns.some(w => w.includes('일반론')))
ok('구체적 시작은 warn 없음', checkThreadPost('워비파커는 반대로 갔다.', NEW).warns.every(w => !w.includes('일반론')))

eq('chars 는 코드포인트 기준', checkThreadPost('안녕', NEW).chars, 2)

if (failures.length) {
  console.error(`FAIL ${failures.length} / PASS ${passed}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASS ${passed}`)
