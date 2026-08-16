'use client'

import { useActionState } from 'react'
import { createPost, type ActionState } from './actions'

export type ContentItem = { code: string; title: string | null }
export type Hypothesis = { code: string; statement: string | null }

export default function PostForm({
  contentItems,
  hypotheses,
}: {
  contentItems: ContentItem[]
  hypotheses: Hypothesis[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPost, null)

  return (
    <form action={formAction}>
      <p>
        <label htmlFor="content_code">소재 (content_code)</label><br />
        <select id="content_code" name="content_code" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {contentItems.map(c => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.title ?? ''}
            </option>
          ))}
        </select>
      </p>

      <p>
        <label htmlFor="body">본문 (body)</label><br />
        <textarea id="body" name="body" rows={10} cols={70} required />
      </p>

      <p>
        <label htmlFor="published_at">발행일시 (published_at)</label><br />
        <input id="published_at" name="published_at" type="datetime-local" required />
      </p>

      <p>
        <label htmlFor="pattern">패턴 (pattern)</label><br />
        <select id="pattern" name="pattern" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </p>

      <p>
        <label htmlFor="hook_type">훅 유형 (hook_type)</label><br />
        <input id="hook_type" name="hook_type" type="text" size={40} />
      </p>

      <p>
        <label htmlFor="closing_type">마무리 유형 (closing_type)</label><br />
        <input id="closing_type" name="closing_type" type="text" size={40} />
      </p>

      <p>
        <label htmlFor="hypothesis_code">가설 (hypothesis_code)</label><br />
        <select id="hypothesis_code" name="hypothesis_code" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {hypotheses.map(h => (
            <option key={h.code} value={h.code}>
              {h.code} — {h.statement ?? ''}
            </option>
          ))}
        </select>
      </p>

      <p>
        <button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '글 등록'}
        </button>
      </p>

      {state && (
        <p style={{ color: state.ok ? 'green' : 'red' }}>{state.message}</p>
      )}
    </form>
  )
}
