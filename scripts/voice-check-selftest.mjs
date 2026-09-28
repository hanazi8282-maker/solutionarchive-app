// lib/threads/voice-check.ts 자체 검증. 네트워크·DB 없음.
//   node scripts/voice-check-selftest.mjs
import { checkThreadPost, checkThreadSelfContained, detectVoiceMode, voiceModeHint } from '../lib/threads/voice-check.ts'

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

// ── 2026-09-29 모드 A/B — 모드 A 전용 경고를 모드 B(1인칭 합쇼체)에 걸지 않는다 ────
// T1-3 A/B(be0bd0da/68e9bab7)·T3-5(2e067d2f)·T3-1 이 전부 "해요체 마무리" 경고를 받던 오탐.
const T13 = '기저귀 리뷰에서 가장 칭찬받은 항목이, 정작 아기에겐 아무 상관이 없었습니다.\n\n리뷰를 쓰는 건 엄마고, 기저귀를 차는 건 아기니까요. 저는 그 숫자를 한참 고객 만족도라고 불렀습니다.\n\n여러분 카테고리는 어떤가요? 돈 내는 사람과 실제로 쓰는 사람이 같으신가요?'
const T35 = '솔직히 말하면, 제가 만든 리서치 자동화가 존재하지 않는 회사를 하나 만들어냈습니다.\n\n검색해보니 그런 회사는 없었습니다.\n\n아직 못 푼 부분이 하나 남아 있는데, 그건 다음 글에 적겠습니다.'
eq('1인칭 저/제 → 모드 B', detectVoiceMode(T13), 'B')
eq('3인칭 → 모드 A', detectVoiceMode('워비파커는 반대로 갔다. 그렇게 하고 있는가?'), 'A')
eq('대명사 없어도 합쇼체 본문(T3-1)은 모드 B', detectVoiceMode('클로드에게 시키면 될 줄 알았는데 결국 노가다를 해야만 합니다. 14번을 돌렸죠.'), 'B')
eq('인용문 안의 합쇼체는 모드 판정에 안 쓴다', detectVoiceMode('대표는 "될 줄 알았습니다."라고 썼다. 그게 문제였다.'), 'A')
eq('`- 모드: B` 줄을 읽는다', voiceModeHint('# t\n\n- 주체: x\n- 모드: B\n'), 'B')
eq('모드 줄 없으면 null', voiceModeHint('# t\n\n- 주체: x\n'), null)
ok('모드 B(T1-3) 해요체 마무리는 warn 없음', checkThreadPost(T13, NEW).warns.every(w => !w.includes('해요체')))
ok('모드 B(T1-3) SC-4 는 해요체 질문을 마무리로 인정', checkThreadSelfContained(T13).warns.every(w => !w.startsWith('SC-4')))
ok('모드 A 해요체 마무리는 여전히 warn', checkThreadPost('워비파커는 반대로 갔다. 그렇게 하고 있나요?', NEW).warns.some(w => w.includes('해요체')))
ok('모드 A SC-4 는 여전히 평어체 질문만', checkThreadSelfContained('워비파커는 반대로 갔다. ' + '가'.repeat(200) + '\n\n그렇게 하고 있나요?').warns.some(w => w.startsWith('SC-4')))
ok('명시 mode=B 가 본문 판정을 이긴다', checkThreadPost('워비파커는 반대로 갔다. 그렇게 하고 있나요?', NEW, { mode: 'B' }).warns.every(w => !w.includes('해요체')))
ok('명시 mode=A 가 본문 판정을 이긴다', checkThreadPost(T13, NEW, { mode: 'A' }).warns.some(w => w.includes('해요체')))
// 예고형 마무리(T3-5) — SC-1 오류. NEW-20260929-05.
ok('T3-5 "다음 글에 적겠습니다" 는 SC-1 오류', checkThreadSelfContained(T35).errors.some(e => e.startsWith('SC-1') && e.includes('예고')))
ok('"그건 다음에 정리하겠습니다" 도 SC-1', checkThreadSelfContained('워비파커는 반대로 갔다. 그건 다음에 정리하겠습니다.').errors.some(e => e.startsWith('SC-1')))
ok('"다음 날" 같은 일반 표현은 SC-1 아님', checkThreadSelfContained('워비파커는 다음 날 매장을 닫았다. ' + '가'.repeat(200) + '\n\n당신은 어디서 막히는가?').errors.length === 0)
// 카피 문장 규칙(§7-4) — 완충 표현·재진술은 warn.
ok('"~로 보인다" 는 완충 표현 warn', checkThreadPost('워비파커는 그래서 성공한 것으로 보인다.', NEW).warns.some(w => w.includes('완충 표현')))
ok('"정리하자면" 은 재진술 warn', checkThreadPost('워비파커는 반대로 갔다. 정리하자면 그렇다.', NEW).warns.some(w => w.includes('재진술')))
ok('인용문 안의 "것 같다" 는 세지 않는다', checkThreadPost('대표는 "될 것 같다"고 썼다.', NEW).warns.every(w => !w.includes('완충 표현')))

if (failures.length) {
  console.error(`FAIL ${failures.length} / PASS ${passed}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASS ${passed}`)
