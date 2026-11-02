#!/usr/bin/env node
// 입금 안내(v71bv) 셀프테스트 — env 3키 전부 있어야 ok, mailto 는 이메일 형식만, 계좌 값 하드코딩 0.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readDepositAccount, depositMailto, depositBody } from '../lib/deposit/notice.ts'

const env = { DEPOSIT_BANK_NAME: 'B', DEPOSIT_ACCOUNT_HOLDER: 'H', DEPOSIT_ACCOUNT_NUMBER: '000-1' }
const ok = readDepositAccount(env)
assert.equal(ok.ok, true)
assert.deepEqual(readDepositAccount({ ...env, DEPOSIT_ACCOUNT_NUMBER: '  ' }), { ok: false, missing: ['DEPOSIT_ACCOUNT_NUMBER'] })
assert.equal(readDepositAccount({}).ok, false)

const a = ok.account
assert.match(depositBody(a, ''), /DRAFT/)
assert.match(depositBody(a, ''), /\[금액 확인 필요\]/)
assert.equal(depositMailto('not-an-email', a, ''), null)
assert.equal(depositMailto('a@b.co?cc=x@y.z', a, ''), null) // 헤더 주입 차단
const m = depositMailto(' a@b.co ', a, '1원')
assert.ok(m.startsWith('mailto:a@b.co?subject='))
assert.ok(decodeURIComponent(m).includes('000-1'))

// 공개 리포 — 계좌 실값이 코드에 박히면 실패한다.
for (const f of ['lib/deposit/notice.ts', 'app/legal-draft/deposit/page.tsx', 'app/legal-draft/deposit/SendDepositNotice.tsx']) {
  const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.ok(!/\d{3,}-\d{2,}-\d{3,}|\d{10,}/.test(src), `${f}: 계좌번호 하드코딩 의심`)
  assert.ok(/process\.env|env\[/.test(src) || !f.endsWith('page.tsx'), `${f}: env 에서 읽지 않는다`)
}
console.log('deposit-notice-selftest: ok')
