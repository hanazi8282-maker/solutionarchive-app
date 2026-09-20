'use client'

import { useState } from 'react'
import { Button } from '../../../_ds/components/Button'
import { Textarea } from '../../../_ds/components/Field'

// ── 요약 마크다운 복사 (§3-1 8) ────────────────────────────────────
// 공개 URL 을 만들지 않는다(§6). 나가는 것은 사용자가 직접 복사한 텍스트뿐이다.
//
// navigator.clipboard 는 권한·비보안 컨텍스트·구형 브라우저에서 조용히 실패한다. 실패를 "복사됨"
// 으로 보이게 두면 사용자가 빈 클립보드를 붙여 넣는다 — 그래서 실패하면 텍스트를 그 자리에 펴고
// 직접 복사하게 한다(§7.1: 확인 불가를 성공으로 접지 않는다).

export function CopySummary({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'copied' | 'manual' | 'error'>('idle')
  const [error, setError] = useState('')

  const run = async () => {
    setBusy(true); setError(''); setState('idle')
    try {
      const res = await fetch(`/api/analyze/summary?project_id=${encodeURIComponent(projectId)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? '요약을 만들지 못했습니다.'); setState('error'); return }
      const md = String(json.markdown ?? '')
      setText(md)
      try {
        await navigator.clipboard.writeText(md)
        setState('copied')
      } catch {
        setState('manual')
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.'); setState('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Button variant="primary" size="lg" fullWidth onClick={run} disabled={busy}>
        {busy ? '요약 만드는 중…' : '요약 마크다운 복사'}
      </Button>
      {state === 'copied' && <p role="status" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--success-fg)' }}>클립보드에 복사했습니다.</p>}
      {state === 'error' && <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--danger-fg)' }}>{error}</p>}
      {state === 'manual' && (
        <>
          <p role="status" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--warning-fg)' }}>
            브라우저가 클립보드를 막았습니다. 아래 내용을 직접 복사하세요.
          </p>
          <Textarea readOnly rows={12} value={text} onFocus={(e) => e.currentTarget.select()} aria-label="요약 마크다운" />
        </>
      )}
    </div>
  )
}
