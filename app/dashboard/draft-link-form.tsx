'use client'

import { useActionState } from 'react'
import { linkDraft, type ActionState } from './actions'
import { Field, Input } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { ResultMessage } from './form-ui'

export type DraftOption = {
  id: string
  body: string | null
  created_at: string | null
  notes: string | null
}

function preview(body: string | null) {
  const head = (body ?? '').replace(/\s+/g, ' ').slice(0, 60)
  return `${head}${(body ?? '').length > 60 ? '…' : ''}`
}

function DraftRow({ draft }: { draft: DraftOption }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(linkDraft, null)

  return (
    <li style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-card)',
      padding: 16,
    }}>
      <p style={{
        margin: '0 0 4px', fontSize: 14, fontWeight: 600,
        color: 'var(--text-strong)', lineHeight: 1.55, overflowWrap: 'anywhere',
      }}>
        {preview(draft.body)}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-faint)', overflowWrap: 'anywhere' }}>
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

        <Field label="Threads 게시물 ID" htmlFor={`external_id-${draft.id}`}>
          <Input id={`external_id-${draft.id}`} name="external_id" type="text" required placeholder="1784…" />
        </Field>

        <Field label="발행일시" htmlFor={`published_at-${draft.id}`}>
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
