'use client'

import { useActionState } from 'react'
import { createSnapshot, type ActionState } from './actions'
import { Field, Input, Select, labelStyle } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { ResultMessage, formGrid, span2 } from './form-ui'

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
    <form action={formAction} style={formGrid}>
      <Field label="대상 글 (post)" htmlFor="post_id" style={span2}>
        <Select id="post_id" name="post_id" defaultValue="" required>
          <option value="">— 선택하세요 —</option>
          {posts.map(p => (
            <option key={p.id} value={p.id}>
              {preview(p.body, p.published_at)}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset style={{ ...span2, border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
        <legend style={{ ...labelStyle, padding: 0, marginBottom: 8 }}>
          발행 후 경과 (hours_since_publish)
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[1, 24, 168].map(h => (
            <label
              key={h}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 12px',
                border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
                background: 'var(--surface-card)', fontSize: 14, cursor: 'pointer',
              }}
            >
              <input type="radio" name="hours_since_publish" value={h} required style={{ accentColor: 'var(--ring)', margin: 0 }} />
              {h}시간
            </label>
          ))}
        </div>
      </fieldset>

      {METRIC_FIELDS.map(f => (
        <Field key={f.name} label={f.label} htmlFor={f.name}>
          <Input id={f.name} name={f.name} type="number" min={0} step={1} defaultValue={0} />
        </Field>
      ))}

      <div style={span2}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? '저장 중…' : '성과 기록'}
        </Button>
      </div>

      {state && <ResultMessage state={state} style={span2} />}
    </form>
  )
}
