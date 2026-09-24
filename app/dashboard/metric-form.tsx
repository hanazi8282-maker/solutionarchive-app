'use client'

import { useActionState } from 'react'
import { createSnapshot, type ActionState } from './actions'
import { Choice, Field, Input, Select } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { REQUIRED, ResultMessage } from './form-ui'

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
    <form action={formAction} className="v2-formgrid">
      <div className="v2-span2">
      <Field label={<>대상 글 (post){REQUIRED}</>} htmlFor="post_id">
        <Select id="post_id" name="post_id" defaultValue="" required>
          <option value="">— 선택하세요 —</option>
          {posts.map(p => (
            <option key={p.id} value={p.id}>
              {preview(p.body, p.published_at)}
            </option>
          ))}
        </Select>
      </Field>
      </div>

      <fieldset className="v2-fieldset v2-span2">
        <legend className="v2-label v2-legend">
          발행 후 경과 (hours_since_publish){REQUIRED}
        </legend>
        <div className="v2-actions">
          {[1, 24, 168].map(h => (
            <Choice key={h} type="radio" name="hours_since_publish" value={h} required label={`${h}시간`} />
          ))}
        </div>
      </fieldset>

      {METRIC_FIELDS.map(f => (
        <Field key={f.name} label={f.label} htmlFor={f.name}>
          <Input id={f.name} name={f.name} type="number" min={0} step={1} defaultValue={0} />
        </Field>
      ))}

      <div className="v2-span2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? '저장 중…' : '성과 기록'}
        </Button>
      </div>

      {state && <ResultMessage state={state} className="v2-span2" />}
    </form>
  )
}
