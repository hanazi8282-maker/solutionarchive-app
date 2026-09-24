'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../../_ds/components/Button'
import { Card } from '../../../_ds/components/Card'
import { Choice, Field, Input } from '../../../_ds/components/Field'
import { Notice } from '../../../_ds/components/Shell'

// ── 지불의사(WTP) 신호 카드 ─────────────────────────────────────────
// 가격표가 아니라 **질문**이다. 여기서 받은 답으로 화면에 가격을 띄우지 않는다 —
// 가격 정책은 사업 방향 결정이라 사람이 정한다(CLAUDE.md §10.2). 이 카드가 하는 일은 재료 수집뿐이다.
//
// ★ 답을 덮어쓰지 않는다. 생각이 바뀌면 다시 답할 수 있고, 이력은 전부 남는다(마이그레이션 헤더).
// ★ 이전 답을 못 읽은 것과 답한 적 없는 것을 가른다(§7.1) — 못 읽었으면 "이전 답을 읽지 못했다" 라고 말한다.
//   접어서 "답 없음" 으로 보여 주면 사람이 이미 낸 답을 잃어버린 줄 모르고 같은 답을 다시 넣는다.

type Mine = {
  would_pay: boolean
  amount_krw: number | null
  billing: 'one_off' | 'monthly' | null
  note: string | null
  created_at: string | null
}

type Answer = 'no' | 'one_off' | 'monthly'

const ANSWERS: { value: Answer; label: string; hint: string }[] = [
  { value: 'no', label: '안 낼 것 같다', hint: '지금 형태로는 돈을 낼 만큼은 아니다' },
  { value: 'one_off', label: '일회성으로 낸다', hint: '진단 한 번에 얼마' },
  { value: 'monthly', label: '매달 낸다', hint: '계속 쓸 것 같아서 월 단위로' },
]

/** 입력을 거들기만 하는 보기값. 우리가 받는 가격이 아니다 — 숫자를 직접 고쳐 쓸 수 있다. */
const CHIPS = [5000, 20000, 50000, 100000]

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

function mineLine(m: Mine): string {
  if (!m.would_pay) return '안 낼 것 같다'
  const form = m.billing === 'monthly' ? '매달' : m.billing === 'one_off' ? '일회성으로' : ''
  const amount = m.amount_krw == null ? '금액은 적지 않음' : won(m.amount_krw)
  return `${form} ${amount}`.trim()
}

export function WtpCard({ projectId }: { projectId: string }) {
  const [answer, setAnswer] = useState<Answer | ''>('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [mine, setMine] = useState<Mine | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/wtp?project_id=${encodeURIComponent(projectId)}`)
      if (!res.ok) { setLoadError('이전 답을 읽지 못했다 — 답이 없다는 뜻이 아니다.'); return }
      const json = await res.json().catch(() => null)
      if (!json) { setLoadError('이전 답을 읽지 못했다 — 답이 없다는 뜻이 아니다.'); return }
      setLoadError('')
      setMine((json.mine ?? null) as Mine | null)
    } catch {
      setLoadError('이전 답을 읽지 못했다 — 답이 없다는 뜻이 아니다.')
    }
  }, [projectId])

  // 마운트 때 한 번 읽는다. setState 는 전부 await 뒤에 있다 — effect 본문에서 동기로 부르지 않는다.
  useEffect(() => { void (async () => { await load() })() }, [load])

  const paying = answer === 'one_off' || answer === 'monthly'

  const submit = async () => {
    setBusy(true); setError(''); setDone('')
    try {
      if (!answer) { setError('셋 중 하나를 골라 주세요. 안 고르면 기록하지 않습니다.'); return }
      const res = await fetch('/api/analyze/wtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          would_pay: paying,
          amount_krw: paying && amount.trim() !== '' ? Number(amount.trim()) : null,
          billing: paying ? answer : null,
          note: note.trim() || null,
          surface: 'result',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? '답을 기록하지 못했습니다.'); return }
      setDone('기록했다 — 가격은 이 신호를 보고 사람이 정한다.')
      setAnswer(''); setAmount(''); setNote('')
      await load()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="이 진단, 얼마짜리였나"
      subtitle="묻는 것이지 값을 매긴 게 아니다. 아직 가격이 없고, 이 답으로 가격이 정해지지도 않는다 — 사람이 정할 때 재료로 쓴다."
    >
      <div className="v2-stack">
        {loadError && <Notice tone="warning">{loadError}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}

        {mine && (
          <p className="v2-text v2-text--muted">
            내 지난 답 · {mineLine(mine)}
            {mine.note ? ` — “${mine.note}”` : ''}
            {mine.created_at ? ` (${KST.format(Date.parse(mine.created_at))} KST)` : ''}
            {' · '}생각이 바뀌면 다시 답해도 된다. 지난 답도 그대로 남는다.
          </p>
        )}

        <div className="v2-stack-sm">
          {ANSWERS.map((a) => (
            <Choice
              key={a.value}
              type="radio"
              name="wtp-answer"
              value={a.value}
              label={a.label}
              hint={a.hint}
              checked={answer === a.value}
              disabled={busy}
              onChange={() => { setAnswer(a.value); setDone('') }}
            />
          ))}
        </div>

        {paying && (
          <>
            <Field
              label={answer === 'monthly' ? '매달 얼마 (원)' : '한 번에 얼마 (원)'}
              htmlFor="wtp-amount"
              hint="아래 보기는 입력을 거들 뿐 우리가 받는 값이 아니다. 숫자를 직접 고쳐도 된다. 비워도 답은 기록된다."
            >
              <Input
                id="wtp-amount"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000000}
                step={1000}
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="숫자만"
              />
            </Field>
            <div className="v2-chiprow">
              {CHIPS.map((c) => (
                <Button key={c} variant="outline" size="sm" disabled={busy} onClick={() => setAmount(String(c))}>
                  {won(c)}
                </Button>
              ))}
            </div>
          </>
        )}

        <Field label="한 줄 메모 (선택)" htmlFor="wtp-note" hint="왜 그렇게 답했는지 한 줄. 500자까지.">
          <Input
            id="wtp-note"
            value={note}
            disabled={busy}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 속성 목록은 쓸 만한데 선례가 얇다"
          />
        </Field>

        <Button variant="primary" size="lg" fullWidth onClick={submit} disabled={busy || !answer}>
          {busy ? '기록하는 중…' : '답 기록하기'}
        </Button>
      </div>
    </Card>
  )
}
