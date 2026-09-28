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
//
// 번역·제품 배경·스레드 제목(2026-09-29)도 같은 규칙 아래 있다: **순수 사실만** 싣는다. 만든 쪽(lib/relevance-feedback/translate.ts)이
// 프롬프트 제한 + 사후검사로 평가 문구를 걸러 failed 로 남기고, 이 카드는 그 본문 문자열만 받는다 — 판정 계열 prop 은 없다.

export type Revealed = { stratum: string; human: string; lines: string[] }

/** 번역·맥락 — 전부 사실 문자열이거나 "없음"의 이유다. */
export type CardContext = {
  /** 제품 배경 1~2문장(프로젝트 단위 캐시). 없으면 null. */
  background: string | null
  /** 한국어 번역 본문. 없으면 null 이고 translationNote 가 이유를 말한다. */
  translation: string | null
  /** 번역이 없을 때 이유("번역 준비 중"·"번역 실패"·"미적용"·"한국어 원문"). 번역이 있으면 null. */
  translationNote: string | null
  /** 이 댓글이 달린 스레드(저장돼 있는 것만). 원제가 없는 소스(PH·YouTube)는 ref 만 있다. */
  thread: { title: string | null; titleKo: string | null; ref: string | null } | null
}

const PREVIEW = 400

function longText(text: string, className: string) {
  return text.length > PREVIEW ? (
    <details>
      <summary className="v2-summary v2-wrap">{text.slice(0, PREVIEW)}… <span className="v2-muted">(전체 {text.length}자 펼치기)</span></summary>
      <p className={`${className} v2-wrap v2-mt-sm`}>{text}</p>
    </details>
  ) : <p className={`${className} v2-wrap`}>{text}</p>
}

function ThreadLine({ t }: { t: NonNullable<CardContext['thread']> }) {
  const shown = t.titleKo ?? t.title ?? t.ref
  if (!shown) return null
  return (
    <p className="v2-note">
      스레드: <b>{shown}</b>
      {t.titleKo && t.title ? <span className="v2-muted"> (원제 {t.title})</span> : null}
      {!t.title && t.ref ? <span className="v2-muted"> — 제목 미저장(식별자만)</span> : null}
    </p>
  )
}

function Translation({ c }: { c: CardContext }) {
  if (c.translation) return <div className="v2-inset">{longText(c.translation, 'v2-body')}</div>
  return c.translationNote ? <p className="v2-note v2-muted">번역 — {c.translationNote}</p> : null
}

export function RelevanceCard(props: {
  inputId: string
  n: number
  project: string
  text: string
  context: CardContext
  informativeReady: boolean
  noteState: 'present' | 'missing' | 'unknown'
  revealed: Revealed | null
}) {
  const [state, action, pending] = useActionState<RelevanceActionState, FormData>(gradeRelevance, null)
  const { text, context } = props
  const body = (
    <>
      {context.thread && <ThreadLine t={context.thread} />}
      {longText(text, 'v2-body')}
      <Translation c={context} />
    </>
  )

  if (props.revealed) {
    return (
      <Card title={`#${props.n} ${props.project}`} subtitle={context.background ?? undefined} action={<Badge tone="success" size="sm">채점 완료 · {props.revealed.human}</Badge>}>
        <div className="v2-stack">
          {body}
          <p className="v2-note"><b>{props.revealed.stratum}</b> · {props.revealed.lines.join(' · ')}</p>
        </div>
      </Card>
    )
  }

  const noteDisabled = props.noteState !== 'present'
  return (
    <Card title={`#${props.n} ${props.project}`} subtitle={context.background ?? undefined} action={<Badge tone="warning" dot size="sm">채점 전</Badge>}>
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
