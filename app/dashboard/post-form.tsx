'use client'

import { useActionState } from 'react'
import { createPost, type ActionState } from './actions'
import { Field, Input, Select, Textarea } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { ResultMessage, formGrid, span2 } from './form-ui'

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
    <form action={formAction} style={formGrid}>
      <Field label="소재 (content_code)" htmlFor="content_code" style={span2}>
        <Select id="content_code" name="content_code" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {contentItems.map(c => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.title ?? ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="본문 (body)" htmlFor="body" style={span2}>
        <Textarea id="body" name="body" rows={10} required />
      </Field>

      <Field label="발행일시 (published_at)" htmlFor="published_at">
        <Input id="published_at" name="published_at" type="datetime-local" required />
      </Field>

      <Field label="패턴 (pattern)" htmlFor="pattern">
        <Select id="pattern" name="pattern" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>
      </Field>

      <Field label="훅 유형 (hook_type)" htmlFor="hook_type">
        <Input id="hook_type" name="hook_type" type="text" />
      </Field>

      <Field label="마무리 유형 (closing_type)" htmlFor="closing_type">
        <Input id="closing_type" name="closing_type" type="text" />
      </Field>

      <Field label="가설 (hypothesis_code)" htmlFor="hypothesis_code" style={span2}>
        <Select id="hypothesis_code" name="hypothesis_code" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {hypotheses.map(h => (
            <option key={h.code} value={h.code}>
              {h.code} — {h.statement ?? ''}
            </option>
          ))}
        </Select>
      </Field>

      <div style={span2}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? '저장 중…' : '글 등록'}
        </Button>
      </div>

      {state && <ResultMessage state={state} style={span2} />}
    </form>
  )
}
