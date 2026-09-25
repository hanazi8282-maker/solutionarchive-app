// 즉시발행 게이트 셀프테스트 — BP-1~3 + CG + 등급, 3상태(pass/fail/needs_human).
//   node scripts/instant-gate-selftest.mjs
import { instantGate, BP3_FORBIDDEN, bpNoteLine, parseBpDeclaration } from '../lib/threads/instant-gate.ts'

let pass = 0, fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${g}\n      want=${w}`) }
}

const ok = { body: '지난달 우리 랜딩 전환율이 2.1%에서 3.4%로 올랐다. 당신 페이지에서도 첫 화면 문장 하나를 바꿔 보라.',
  declared: { exclusiveNumbers: true, transferable: true }, cgOk: true, grade: 'A' }

// 전부 통과
t('전 축 통과 → pass', instantGate(ok).status, 'pass')
t('등급 B 도 통과', instantGate({ ...ok, grade: 'b' }).status, 'pass')

// BP-1
t('수치 없음 → fail', instantGate({ ...ok, body: '전환율이 올랐다. 당신도 해 보라.' }).failed, ['BP-1: 수치가 없다'])
t('검색 가능한 통계 선언 → fail', instantGate({ ...ok, declared: { exclusiveNumbers: false, transferable: true } }).status, 'fail')
t('독점성 미선언 → needs_human', instantGate({ ...ok, declared: { transferable: true } }).status, 'needs_human')
t('독점성 미선언 사유', instantGate({ ...ok, declared: { transferable: true } }).pending, ['BP-1: 수치가 남헌 실측치인지 선언 필요'])

// BP-2
t('전이 불가 선언 → fail', instantGate({ ...ok, declared: { exclusiveNumbers: true, transferable: false } }).status, 'fail')
t('전이성 미선언 → needs_human', instantGate({ ...ok, declared: { exclusiveNumbers: true } }).status, 'needs_human')
t('declared 자체 없음 → needs_human 2축', instantGate({ ...ok, declared: null }).pending.length, 2)

// BP-3 — 원문 금지어 12개 전부 걸린다
for (const f of BP3_FORBIDDEN) {
  const sample = f.label === 'PR번호' ? 'PR #12' : f.label === '허용목록' ? '허용 목록' : f.label === '승인·반려' ? '승인' : f.label
  t(`BP-3 금지어 "${f.label}" → fail`, instantGate({ ...ok, body: `${ok.body} ${sample}` }).status, 'fail')
}
t('BP-3 사유에 걸린 용어 나열', instantGate({ ...ok, body: `${ok.body} 이 무브는 게이트를 통과했다` }).failed, ['BP-3: 내부 용어 무브·게이트'])
t('BP-3 무관한 문장은 안 걸림', instantGate({ ...ok, body: `${ok.body} 승합차 반납` }).status, 'pass')

// CG
t('CG 미통과 → fail', instantGate({ ...ok, cgOk: false }).status, 'fail')
t('CG 미실행 → needs_human', instantGate({ ...ok, cgOk: null }).pending, ['CG: 근거 게이트 미실행'])

// 등급
t('등급 C → fail', instantGate({ ...ok, grade: 'C' }).failed, ['등급: C (A/B 만 즉시발행)'])
t('등급 D → fail', instantGate({ ...ok, grade: 'D' }).status, 'fail')
t('등급 모름 → needs_human', instantGate({ ...ok, grade: null }).status, 'needs_human')

// fail 이 pending 보다 우선 — 사람이 답해도 실격인 글에 답을 요구하지 않는다
t('fail + pending 동시 → fail', instantGate({ ...ok, declared: null, grade: 'D' }).status, 'fail')

// notes 트레일러 왕복 — stage.json 선언 → posts.notes 한 줄 → 게이트 입력
t('bpNoteLine 둘 다 불리언이면 한 줄', bpNoteLine({ exclusiveNumbers: true, transferable: false }), 'BP: 독점수치=true · 전이=false')
t('bpNoteLine 하나라도 미선언이면 null(줄을 안 쓴다)', bpNoteLine({ exclusiveNumbers: true }), null)
t('bpNoteLine 문자열 "true" 는 불리언이 아니다 → null', bpNoteLine({ exclusiveNumbers: 'true', transferable: true }), null)
t('parse 왕복', parseBpDeclaration('게이트: 통과\nBP: 독점수치=true · 전이=false\n메모'), { exclusiveNumbers: true, transferable: false })
t('parse CRLF 도 읽는다', parseBpDeclaration('게이트: 통과\r\nBP: 독점수치=false · 전이=true\r\n'), { exclusiveNumbers: false, transferable: true })
t('parse 줄 없음 → 둘 다 null', parseBpDeclaration('게이트: 통과'), { exclusiveNumbers: null, transferable: null })
t('parse notes null', parseBpDeclaration(null), { exclusiveNumbers: null, transferable: null })
t('parse 결과를 declared 로 넣으면 pass', instantGate({ ...ok, declared: parseBpDeclaration('BP: 독점수치=true · 전이=true') }).status, 'pass')

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('즉시발행 게이트가 실격을 통과시키거나 미판정을 통과로 접는다.'); process.exit(1) }
console.log('즉시발행 게이트 정상 — pass 는 전 축 기계 확인이 끝났을 때만.')
