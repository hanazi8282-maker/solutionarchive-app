'use client'

import { useActionState } from 'react'
import { gradeRelevance, type RelevanceActionState } from '../actions'
import { NOTE_MAX } from '@/lib/relevance-feedback/sample'
import { Badge } from '../../_ds/components/Badge'
import { Button } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { Choice, Textarea } from '../../_ds/components/Field'
import { Notice } from '../../_ds/components/Shell'

// 카드 1장 = 리뷰 1건 = 제출 1회. 채점 전 카드는 모델 판정·층을 **props 로도 받지 않는다** —
// 클라이언트로 넘어가는 순간 DOM·RSC 페이로드에서 보인다(끌림 방지). 공개는 저장 뒤(revealed)에만.

export type Revealed = { stratum: string; human: string; lines: string[] }

const PREVIEW = 400

export function RelevanceCard(props: {
  inputId: string
  n: number
  project: string
  text: string
  informativeReady: boolean
  noteState: 'present' | 'missing' | 'unknown'
  revealed: Revealed | null
}) {
  const [state, action, pending] = useActionState<RelevanceActionState, FormData>(gradeRelevance, null)
  const { text } = props
  const body = text.length > PREVIEW ? (
    <details>
      <summary className="v2-summary v2-wrap">{text.slice(0, PREVIEW)}… <span className="v2-muted">(전체 {text.length}자 펼치기)</span></summary>
      <p className="v2-body v2-wrap v2-mt-sm">{text}</p>
    </details>
  ) : <p className="v2-body v2-wrap">{text}</p>

  if (props.revealed) {
    return (
      <Card title={`#${props.n} ${props.project}`} action={<Badge tone="success" size="sm">채점 완료 · {props.revealed.human}</Badge>}>
        <div className="v2-stack">
          {body}
          <p className="v2-note"><b>{props.revealed.stratum}</b> · {props.revealed.lines.join(' · ')}</p>
        </div>
      </Card>
    )
  }

  const noteDisabled = props.noteState !== 'present'
  return (
    <Card title={`#${props.n} ${props.project}`} action={<Badge tone="warning" dot size="sm">채점 전</Badge>}>
      <form action={action} className="v2-stack">
        <input type="hidden" name="input_id" value={props.inputId} />
        {body}
        <div className="v2-actions">
          {([['relevant', '관련'], ['irrelevant', '무관'], ['unknown', '모름']] as const).map(([v, l]) => (
            <Choice key={v} type="radio" name="verdict" value={v} required disabled={pending} label={<b>{l}</b>} />
          ))}
        </div>
        {props.informativeReady ? (
          <div className="v2-actions">
            <Choice type="radio" name="informative" value="true" disabled={pending} label="정보있음" />
            <Choice type="radio" name="informative" value="false" disabled={pending} label="정보없음" />
            <span className="v2-note">선택 — 제품에 대해 뭔가 알려 주는가</span>
          </div>
        ) : (
          <p className="v2-note">정보있음/없음 — 미적용(마이그 000031 전). 판정만 저장된다.</p>
        )}
        <Textarea
          name="note"
          rows={2}
          maxLength={NOTE_MAX}
          disabled={pending || noteDisabled}
          placeholder={noteDisabled
            ? (props.noteState === 'missing' ? '기준 보완 메모 — 미적용(마이그 000032 전)' : '기준 보완 메모 — 테이블 확인 불가')
            : '기준 보완 메모(선택) — 기준이 이 건을 어떻게 다뤄야 했나'}
        />
        <div className="v2-actions">
          <Button type="submit" variant="primary" size="sm" disabled={pending}>저장</Button>
          {pending && <span className="v2-note">저장 중…</span>}
        </div>
        {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
      </form>
    </Card>
  )
}
