'use client'

import { useActionState } from 'react'
import { linkDraft, type ActionState } from './actions'
import { Field, Input, Select } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { REQUIRED, ResultMessage } from './form-ui'

export type DraftOption = {
  id: string
  body: string | null
  created_at: string | null
  notes: string | null
  status: string
  content_code: string | null
  hook_type?: string | null
  closing_type?: string | null
  /** 발행 전 검수(app/dashboard/post-review-form.tsx) 결정 기록. */
  reviewed_at?: string | null
  reviewed_by?: string | null
  review_note?: string | null
}

export type UnlinkedThread = {
  id: string
  text: string
  permalink: string | null
  /** Threads API 원문 타임스탬프(오프셋 포함). 그대로 published_at 으로 보낸다. */
  timestamp: string | null
  whenKst: string
  /** 본문 유사도 내림차순. label 에 점수가 들어 있다. */
  candidates: { id: string; label: string }[]
  /** 왜 이 분류인지(최고 유사도·비교 불가 사유). 분류가 판단을 대신하지 않도록 근거를 같이 보여준다. */
  why?: string
}

const rowStyle = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--surface-card)',
  padding: 16,
} as const

function preview(body: string | null) {
  const head = (body ?? '').replace(/\s+/g, ' ').slice(0, 60)
  return `${head}${(body ?? '').length > 60 ? '…' : ''}`
}

function DraftRow({ draft }: { draft: DraftOption }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(linkDraft, null)

  return (
    <li style={rowStyle}>
      <p style={{
        margin: '0 0 4px', fontSize: 14, fontWeight: 600,
        color: 'var(--text-strong)', lineHeight: 1.55, overflowWrap: 'anywhere',
      }}>
        {preview(draft.body)}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
        생성 {draft.created_at ? draft.created_at.slice(0, 16).replace('T', ' ') : '날짜없음'}
        {draft.notes ? ` · ${draft.notes.replace(/\s+/g, ' ').slice(0, 60)}` : ''}
      </p>

      <form action={formAction} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
        gap: 12,
        alignItems: 'end',
      }}>
        <input type="hidden" name="draft_id" value={draft.id} />

        <Field label={<>Threads 게시물 ID{REQUIRED}</>} htmlFor={`external_id-${draft.id}`}>
          <Input id={`external_id-${draft.id}`} name="external_id" type="text" required placeholder="1784…" />
        </Field>

        <Field label={<>발행일시 (한국 시간){REQUIRED}</>} htmlFor={`published_at-${draft.id}`}>
          {/* status='published' 로 올리려면 반드시 필요하다
              (posts_published_at_required_check). 서버에서도 다시 막는다. */}
          <Input id={`published_at-${draft.id}`} name="published_at" type="datetime-local" required />
        </Field>

        <Field label="permalink(선택)" htmlFor={`permalink-${draft.id}`}>
          <Input id={`permalink-${draft.id}`} name="permalink" type="url" placeholder="https://www.threads.net/@…" />
        </Field>

        <Button type="submit" variant="primary" disabled={pending} style={{ justifySelf: 'start' }}>
          {pending ? '연결 중…' : '연결'}
        </Button>
      </form>

      {state && <ResultMessage state={state} style={{ marginTop: 12 }} />}
    </li>
  )
}

function UnlinkedThreadRow({ t }: { t: UnlinkedThread }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(linkDraft, null)

  return (
    <li style={rowStyle}>
      <p style={{
        margin: '0 0 4px', fontSize: 14, fontWeight: 600,
        color: 'var(--text-strong)', lineHeight: 1.55, overflowWrap: 'anywhere',
      }}>
        {t.text ? preview(t.text) : '(텍스트 없음)'}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
        발행 {t.whenKst} · 게시물 ID {t.id}
        {t.why ? ` · ${t.why}` : ''}
        {t.permalink ? <> · <a href={t.permalink} target="_blank" rel="noreferrer">게시물 열기 ↗</a></> : null}
      </p>

      <form action={formAction} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: 12,
        alignItems: 'end',
      }}>
        {/* 게시물 쪽 값은 전부 API 가 준 그대로 보낸다 — 사람이 옮겨 적다 틀릴 자리를 없앤다. */}
        <input type="hidden" name="external_id" value={t.id} />
        <input type="hidden" name="published_at" value={t.timestamp ?? ''} />
        <input type="hidden" name="permalink" value={t.permalink ?? ''} />
        <input type="hidden" name="published_body" value={t.text} />

        <Field label="어느 초안의 발행본인가 (앞 숫자 = 본문 유사도)" htmlFor={`draft-${t.id}`}>
          {/* 1등을 미리 고르지 않는다. 저점수 구간에서는 1등이 틀릴 수 있고,
              미리 골라 두면 확인 없이 누르게 된다. */}
          <Select id={`draft-${t.id}`} name="draft_id" required defaultValue="">
            <option value="" disabled>초안을 고르세요</option>
            {t.candidates.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>

        <Button type="submit" variant="primary" disabled={pending || !t.timestamp} style={{ justifySelf: 'start' }}>
          {pending ? '연결 중…' : '연결'}
        </Button>
      </form>

      {!t.timestamp && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--danger-fg)' }}>
          API 가 발행 시각을 주지 않아 여기서 연결할 수 없습니다. 아래 &quot;게시물 ID로 직접 연결&quot;을 쓰세요.
        </p>
      )}
      {state && <ResultMessage state={state} style={{ marginTop: 12 }} />}
    </li>
  )
}

const DEFAULT_INTRO =
  '사람이 올렸지만 매처가 어느 초안의 글인지 확신하지 못한 게시물입니다. 게시물을 열어 보고 맞는 초안을 '
  + '고르세요. 점수가 낮아도 같은 글이면 연결하면 됩니다. 연결하면 초안 본문이 발행본으로 바뀌고 '
  + '성과 수집(매시 30분)이 시작됩니다. 해당 초안이 없으면(초안 없이 쓴 글) 연결하지 말고 두세요.'

/**
 * 미연결 게시물 목록. `intro` 로 분류별 안내를 갈아 끼운다 — 어느 분류든 **연결 폼은 같다.**
 * "파이프라인 외"로 분류된 글도 사람이 나중에 초안에 붙일 수 있어야 한다(분류가 판단을 대신
 * 내리지 않는다). 폼을 빼거나 비활성화하지 마라.
 */
export function UnlinkedThreadList({ items, intro = DEFAULT_INTRO }: { items: UnlinkedThread[]; intro?: string }) {
  return (
    <>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
        {intro}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {items.map(t => (
          <UnlinkedThreadRow key={t.id} t={t} />
        ))}
      </ul>
    </>
  )
}

export default function DraftLinkForm({ drafts }: { drafts: DraftOption[] }) {
  return (
    <>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
        매처(/api/threads/match-posts)가 자동으로 연결하지 못한 초안입니다. 본문이 거의 같은
        A/B 변형처럼 텍스트만으로 구분이 안 되는 경우가 대부분이라, 어느 게시물인지는 사람이 지정해야 합니다.
        게시물 ID는 permalink 끝의 코드가 아니라 Threads API가 주는 숫자 ID입니다.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {drafts.map(d => (
          <DraftRow key={d.id} draft={d} />
        ))}
      </ul>
    </>
  )
}
