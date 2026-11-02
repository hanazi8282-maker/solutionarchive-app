#!/usr/bin/env node
// 입금 안내(v71bv) 셀프테스트 — env 3키 전부 있어야 ok, mailto 는 이메일 형식만, 계좌 값 하드코딩 0.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readDepositAccount, depositMailto, depositBody, DEPOSIT_PRODUCTS } from '../lib/deposit/notice.ts'

const env = { DEPOSIT_BANK_NAME: 'B', DEPOSIT_ACCOUNT_HOLDER: 'H', DEPOSIT_ACCOUNT_NUMBER: '000-1' }
const ok = readDepositAccount(env)
assert.equal(ok.ok, true)
assert.deepEqual(readDepositAccount({ ...env, DEPOSIT_ACCOUNT_NUMBER: '  ' }), { ok: false, missing: ['DEPOSIT_ACCOUNT_NUMBER'] })
assert.equal(readDepositAccount({}).ok, false)

const a = ok.account
assert.match(depositBody(a, ''), /DRAFT/)
assert.match(depositBody(a, ''), /\[상품 선택 필요\]/)
assert.equal(depositMailto('not-an-email', a, 'single'), null)
assert.equal(depositMailto('a@b.co?cc=x@y.z', a, 'single'), null) // 헤더 주입 차단
assert.equal(depositMailto('a@b.co', a, ''), null) // 상품 미선택이면 발송 주소 없음

// D-6 가격·환불 — 상품은 두 개뿐(팀 플랜 없음), 금액은 선택값에서만 나온다.
assert.deepEqual(Object.keys(DEPOSIT_PRODUCTS), ['single', 'monthly'])
assert.match(depositBody(a, 'single'), /단건 리포트 19,000원\(경쟁사 1곳\)/)
assert.match(depositBody(a, 'monthly'), /구독 월 29,000원\/1인/)
for (const p of ['single', 'monthly']) {
  assert.ok(depositBody(a, p).includes('입금 확인 후 7일 이내 요청 시 100% 환불'), `${p}: 환불 문구 없음`)
  assert.match(depositBody(a, p), /DRAFT/)
}
const m = depositMailto(' a@b.co ', a, 'single')
assert.ok(decodeURIComponent(m).includes('19,000원'))
assert.ok(m.startsWith('mailto:a@b.co?subject='))
assert.ok(decodeURIComponent(m).includes('000-1'))

// 공개 리포 — 계좌 실값이 코드에 박히면 실패한다.
for (const f of ['lib/deposit/notice.ts', 'app/legal-draft/deposit/page.tsx', 'app/legal-draft/deposit/SendDepositNotice.tsx']) {
  const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.ok(!/\d{3,}-\d{2,}-\d{3,}|\d{10,}/.test(src), `${f}: 계좌번호 하드코딩 의심`)
  assert.ok(/process\.env|env\[/.test(src) || !f.endsWith('page.tsx'), `${f}: env 에서 읽지 않는다`)
  // 금지 문구 — 세금계산서·현금영수증 안내 없음, 옛 가격·'첫 달' 환불 문구 없음.
  for (const bad of ['세금계산서', '현금영수증', '49,000', '49000', '99,000', '99000', '첫 달']) {
    assert.ok(!src.includes(bad), `${f}: 금지 문구 "${bad}"`)
  }
}
assert.ok(fs.readFileSync(new URL('../app/legal-draft/deposit/page.tsx', import.meta.url), 'utf8').includes("title: '입금 안내 (DRAFT)'"), '페이지 제목 DRAFT')
console.log('deposit-notice-selftest: ok')
