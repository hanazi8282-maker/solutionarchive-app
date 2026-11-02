'use client'

import { useState } from 'react'
import { DEPOSIT_PRODUCTS, depositBody, depositMailto, isDepositEmail, type DepositAccount, type DepositProduct } from '@/lib/deposit/notice'

type Err = { field: 'email' | 'product'; msg: string } | null

// 수동 발송만. 버튼은 관리자 자신의 메일 앱을 열 뿐이고, 실제 "보내기"도 사람이 누른다. 서버 발송·예약·자동 발송 없음.
// 제출 버튼은 항상 활성 — 막지 않고 칸 옆 인라인 오류 + 첫 오류 칸으로 포커스.
export function SendDepositNotice({ account }: { account: DepositAccount }) {
  const [to, setTo] = useState('')
  const [product, setProduct] = useState<DepositProduct | ''>('')
  const [err, setErr] = useState<Err>(null)
  const keys = Object.keys(DEPOSIT_PRODUCTS) as DepositProduct[]
  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault()
      if (!isDepositEmail(to)) {
        setErr({ field: 'email', msg: '이메일 형식을 확인해 주세요. 예: name@example.com' })
        document.getElementById('deposit-to')?.focus()
        return
      }
      const href = depositMailto(to, account, product)
      if (!href) {
        setErr({ field: 'product', msg: '상품을 골라 주세요.' })
        document.getElementById(`deposit-product-${keys[0]}`)?.focus()
        return
      }
      setErr(null)
      window.location.href = href
    }}>
      <p className="pub-text">
        <label htmlFor="deposit-to">받는 사람 이메일</label>{' '}
        <input id="deposit-to" name="email" type="email" autoComplete="off" spellCheck={false} className="pub-field"
          aria-invalid={err?.field === 'email'} aria-describedby="deposit-to-err"
          value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com…" />{' '}
        <span id="deposit-to-err" aria-live="polite">{err?.field === 'email' ? err.msg : ''}</span>
      </p>
      <fieldset className="pub-text" aria-describedby="deposit-product-err">
        <legend>상품</legend>
        {keys.map((k) => (
          <label key={k} style={{ display: 'block' }}>
            <input id={`deposit-product-${k}`} type="radio" name="product" value={k}
              checked={product === k} onChange={() => setProduct(k)} />{' '}
            {DEPOSIT_PRODUCTS[k].label}
          </label>
        ))}
        <span id="deposit-product-err" aria-live="polite">{err?.field === 'product' ? err.msg : ''}</span>
      </fieldset>
      <pre className="pub-text" style={{ whiteSpace: 'pre-wrap' }}>{depositBody(account, product)}</pre>
      <button type="submit" className="pub-btn pub-btn--primary">입금 안내 발송</button>
    </form>
  )
}
