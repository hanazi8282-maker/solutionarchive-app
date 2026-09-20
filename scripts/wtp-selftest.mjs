// 지불의사(WTP) 검증기 셀프테스트 — parseWtpBody 가 DB CHECK 와 같은 말을 하는지.
//   node scripts/wtp-selftest.mjs
//
// 정본은 supabase/migrations/20260924000001_wtp_signals.sql 의 CHECK 다. 여기서 막지 못하면
// INSERT 가 23514 로 죽는데, 그건 사람이 답을 다 채우고 버튼을 누른 뒤에야 보이는 형태다.
// 네트워크·DB 없음.

import { parseWtpBody, WTP_AMOUNT_MAX, WTP_NOTE_MAX } from '../lib/analysis/wtp.ts'

let pass = 0, fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}

const ok = (body) => parseWtpBody(body)
const err = (body) => { const r = parseWtpBody(body); return r.ok ? '(통과해 버렸다)' : r.error }

// ── 1. would_pay — 필수. 빠진 답과 "안 낸다"를 가른다 ──────────────
t('would_pay 없음 → 거절', parseWtpBody({}).ok, false)
t('would_pay 없음 → 필드 이름을 말한다', /would_pay/.test(err({})), true)
t('would_pay 문자열 "true" → 거절(불리언만)', parseWtpBody({ would_pay: 'true' }).ok, false)
t('would_pay null → 거절 (안 냄으로 접지 않는다)', parseWtpBody({ would_pay: null }).ok, false)
t('안 낸다 → 통과', ok({ would_pay: false }).ok, true)
t('안 낸다 → 금액 null', ok({ would_pay: false }).row.amount_krw, null)
t('안 낸다 → 결제 형태 null', ok({ would_pay: false }).row.billing, null)

// ── 2. DB CHECK 거울 1: wtp_signals_no_amount_when_no_pay ──────────
t('안 낸다는데 금액이 왔다 → 거절', parseWtpBody({ would_pay: false, amount_krw: 5000 }).ok, false)
t('그 거절문이 금액 필드를 짚는다', /amount_krw/.test(err({ would_pay: false, amount_krw: 5000 })), true)
t('안 낸다 + 금액 0 → 거절 (0원도 사람이 고른 값이다)', parseWtpBody({ would_pay: false, amount_krw: 0 }).ok, false)
t('안 낸다 + 결제 형태 → 거절', parseWtpBody({ would_pay: false, billing: 'monthly' }).ok, false)

// ── 3. DB CHECK 거울 2: billing IN ('one_off','monthly') ───────────
t('billing 어휘 밖 → 거절', parseWtpBody({ would_pay: true, billing: 'yearly' }).ok, false)
t('그 거절문이 허용 어휘를 알려 준다', /one_off/.test(err({ would_pay: true, billing: 'yearly' })), true)
t('billing one_off → 통과', ok({ would_pay: true, billing: 'one_off' }).row.billing, 'one_off')
t('billing monthly → 통과', ok({ would_pay: true, billing: 'monthly' }).row.billing, 'monthly')
t('billing 생략 → null (임의로 고르지 않는다)', ok({ would_pay: true }).row.billing, null)

// ── 4. amount_krw 범위 0 ~ 10,000,000 정수 ─────────────────────────
t('금액 0 → 통과', ok({ would_pay: true, amount_krw: 0 }).row.amount_krw, 0)
t(`금액 상한 ${WTP_AMOUNT_MAX} → 통과`, ok({ would_pay: true, amount_krw: WTP_AMOUNT_MAX }).row.amount_krw, WTP_AMOUNT_MAX)
t('금액 상한 + 1 → 거절 (오타 방어)', parseWtpBody({ would_pay: true, amount_krw: WTP_AMOUNT_MAX + 1 }).ok, false)
t('금액 음수 → 거절', parseWtpBody({ would_pay: true, amount_krw: -1 }).ok, false)
t('금액 소수 → 거절 (원 단위 정수)', parseWtpBody({ would_pay: true, amount_krw: 5000.5 }).ok, false)
t('금액 숫자 아닌 문자열 → 거절', parseWtpBody({ would_pay: true, amount_krw: '오천원' }).ok, false)
t('금액 폼 문자열 "5000" → 숫자로 통과', ok({ would_pay: true, amount_krw: '5000' }).row.amount_krw, 5000)
t('금액 빈 문자열 → null (0 으로 접지 않는다)', ok({ would_pay: true, amount_krw: '' }).row.amount_krw, null)
t('금액 생략 → null', ok({ would_pay: true, billing: 'monthly' }).row.amount_krw, null)

// ── 5. note ≤ 500 자 ────────────────────────────────────────────────
t(`메모 ${WTP_NOTE_MAX}자 → 통과`, ok({ would_pay: true, note: 'ㄱ'.repeat(WTP_NOTE_MAX) }).row.note.length, WTP_NOTE_MAX)
t(`메모 ${WTP_NOTE_MAX + 1}자 → 거절 (자르지 않는다)`, parseWtpBody({ would_pay: true, note: 'ㄱ'.repeat(WTP_NOTE_MAX + 1) }).ok, false)
t('그 거절문이 메모 필드를 짚는다', /note/.test(err({ would_pay: true, note: 'ㄱ'.repeat(WTP_NOTE_MAX + 1) })), true)
t('메모 공백뿐 → null', ok({ would_pay: true, note: '   ' }).row.note, null)
t('메모 앞뒤 공백 제거', ok({ would_pay: true, note: '  선례가 얇다  ' }).row.note, '선례가 얇다')
t('메모 숫자 → 거절', parseWtpBody({ would_pay: true, note: 123 }).ok, false)

// ── 6. surface 기본값·어휘 ─────────────────────────────────────────
t('surface 생략 → result 기본값', ok({ would_pay: false }).row.surface, 'result')
t('surface 빈 문자열 → result 기본값', ok({ would_pay: false, surface: '' }).row.surface, 'result')
t('surface review → 통과', ok({ would_pay: false, surface: 'review' }).row.surface, 'review')
t('surface angles → 통과', ok({ would_pay: false, surface: 'angles' }).row.surface, 'angles')
t('surface 어휘 밖 → 거절 (result 로 접지 않는다)', parseWtpBody({ would_pay: false, surface: 'pricing' }).ok, false)

// ── 7. 본문 자체가 없을 때 · 행에 가격 정책이 섞이지 않는지 ─────────
t('본문 null → 거절', parseWtpBody(null).ok, false)
t('본문 문자열 → 거절', parseWtpBody('would_pay=true').ok, false)
t('행 키는 5개뿐 (project_id·owner_email 은 라우트가 붙인다)',
  Object.keys(ok({ would_pay: true, project_id: 'x', owner_email: 'a@b.c' }).row).sort().join(','),
  'amount_krw,billing,note,surface,would_pay')
t('본문의 owner_email 은 행에 들어가지 않는다',
  JSON.stringify(ok({ would_pay: true, owner_email: 'a@b.c' }).row).includes('a@b.c'), false)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('WTP 검증기 정상 — DB CHECK 4개(금액 범위·무지불 금액·billing 어휘·메모 길이)와 surface 기본값이 코드 쪽에서도 같다.')
