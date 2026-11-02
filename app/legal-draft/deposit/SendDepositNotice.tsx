'use client'

import { useState } from 'react'
import { depositBody, depositMailto, type DepositAccount } from '@/lib/deposit/notice'

// 수동 발송만. 버튼은 관리자 자신의 메일 앱을 열 뿐이고, 실제 "보내기"도 사람이 누른다. 서버 발송·예약·자동 발송 없음.
export function SendDepositNotice({ account }: { account: DepositAccount }) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const href = depositMailto(to, account, amount)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!href) { setErr('이메일 형식을 확인해 주세요. 예: name@example.com'); return } setErr(''); window.location.href = href }}>
      <p className="pub-text">
        <label htmlFor="deposit-to">받는 사람 이메일</label>{' '}
        <input id="deposit-to" name="email" type="email" autoComplete="off" spellCheck={false} className="pub-field"
          value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com…" required />
      </p>
      <p className="pub-text">
        <label htmlFor="deposit-amount">금액</label>{' '}
        <input id="deposit-amount" name="amount" autoComplete="off" className="pub-field"
          value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 300,000원…" />
      </p>
      <pre className="pub-text" style={{ whiteSpace: 'pre-wrap' }}>{depositBody(account, amount)}</pre>
      <p className="pub-text" aria-live="polite">{err}</p>
      <button type="submit" className="pub-btn pub-btn--primary">입금 안내 발송</button>
    </form>
  )
}
