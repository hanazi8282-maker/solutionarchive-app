'use client'

import { useActionState } from 'react'
import { linkDraft, type ActionState } from './actions'

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
    <li style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid #ddd' }}>
      <p style={{ margin: '0 0 .25rem' }}>
        <strong>{preview(draft.body)}</strong>
      </p>
      <p style={{ margin: '0 0 .5rem', fontSize: '.85rem', color: '#666' }}>
        생성 {draft.created_at ? draft.created_at.slice(0, 16).replace('T', ' ') : '날짜없음'}
        {draft.notes ? ` · ${draft.notes.replace(/\s+/g, ' ').slice(0, 60)}` : ''}
      </p>

      <form action={formAction}>
        <input type="hidden" name="draft_id" value={draft.id} />

        <label style={{ marginRight: '1rem' }}>
          Threads 게시물 ID{' '}
          <input name="external_id" type="text" required placeholder="1784…" style={{ width: 180 }} />
        </label>

        <label style={{ marginRight: '1rem' }}>
          발행일시{' '}
          {/* status='published' 로 올리려면 반드시 필요하다
              (posts_published_at_required_check). 서버에서도 다시 막는다. */}
          <input name="published_at" type="datetime-local" required />
        </label>

        <label style={{ marginRight: '1rem' }}>
          permalink(선택){' '}
          <input name="permalink" type="url" placeholder="https://www.threads.net/@…" style={{ width: 220 }} />
        </label>

        <button type="submit" disabled={pending}>
          {pending ? '연결 중…' : '연결'}
        </button>
      </form>

      {state && (
        <p style={{ margin: '.4rem 0 0', color: state.ok ? 'green' : 'red' }}>{state.message}</p>
      )}
    </li>
  )
}

export default function DraftLinkForm({ drafts }: { drafts: DraftOption[] }) {
  return (
    <>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        매처(/api/threads/match-posts)가 자동으로 연결하지 못한 초안입니다. 본문이 거의 같은
        A/B 변형처럼 텍스트만으로 구분이 안 되는 경우가 대부분이라, 어느 게시물인지는 사람이 지정해야 합니다.
        게시물 ID는 permalink 끝의 코드가 아니라 Threads API가 주는 숫자 ID입니다.
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {drafts.map(d => (
          <DraftRow key={d.id} draft={d} />
        ))}
      </ul>
    </>
  )
}
