'use client'

import { useActionState } from 'react'
import { createSnapshot, type ActionState } from './actions'

export type PostOption = {
  id: string
  body: string | null
  published_at: string | null
}

const METRIC_FIELDS = [
  { name: 'views', label: '노출 (views)' },
  { name: 'likes', label: '좋아요 (likes)' },
  { name: 'replies', label: '답글 (replies)' },
  { name: 'reposts', label: '리포스트 (reposts)' },
  { name: 'profile_clicks', label: '프로필 클릭 (profile_clicks)' },
  { name: 'follows', label: '팔로우 (follows)' },
] as const

function preview(body: string | null, publishedAt: string | null) {
  const head = (body ?? '').replace(/\s+/g, ' ').slice(0, 40)
  const date = publishedAt ? publishedAt.slice(0, 10) : '날짜없음'
  return `[${date}] ${head}${(body ?? '').length > 40 ? '…' : ''}`
}

export default function MetricForm({ posts }: { posts: PostOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createSnapshot, null)

  return (
    <form action={formAction}>
      <p>
        <label htmlFor="post_id">대상 글 (post)</label><br />
        <select id="post_id" name="post_id" defaultValue="" required>
          <option value="">— 선택하세요 —</option>
          {posts.map(p => (
            <option key={p.id} value={p.id}>
              {preview(p.body, p.published_at)}
            </option>
          ))}
        </select>
      </p>

      <fieldset>
        <legend>발행 후 경과 (hours_since_publish)</legend>
        {[1, 24, 168].map(h => (
          <label key={h} style={{ marginRight: '1rem' }}>
            <input type="radio" name="hours_since_publish" value={h} required />
            {h}시간
          </label>
        ))}
      </fieldset>

      {METRIC_FIELDS.map(f => (
        <p key={f.name}>
          <label htmlFor={f.name}>{f.label}</label><br />
          <input id={f.name} name={f.name} type="number" min={0} step={1} defaultValue={0} />
        </p>
      ))}

      <p>
        <button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '성과 기록'}
        </button>
      </p>

      {state && (
        <p style={{ color: state.ok ? 'green' : 'red' }}>{state.message}</p>
      )}
    </form>
  )
}
