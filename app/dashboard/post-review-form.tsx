'use client'

import { useActionState, useState } from 'react'
import { reviewPost, type ReviewActionState } from './actions'
import { Badge, type Tone } from '../_ds/components/Badge'
import { Button } from '../_ds/components/Button'
import { Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

export type PendingPost = {
  id: string
  body: string
  content_code: string | null
  hook_type: string | null
  closing_type: string | null
  notes: string | null
  created_at: string | null
  check: { errors: string[]; warns: string[]; chars: number }
}


/** 문체 점검 배지. lib/threads/voice-check.ts 결과를 그대로 보여준다 — 사람 검수를 대신하지 않는다. */
function VoiceBadge({ check }: { check: PendingPost['check'] }) {
  if (check.errors.length) return <Badge tone="danger" size="sm">문체 오류 {check.errors.length}건</Badge>
  if (check.warns.length) return <Badge tone="warning" size="sm">확인할 점 {check.warns.length}건</Badge>
  return <Badge tone="success" size="sm">문체 점검 통과</Badge>
}

export function PostReviewCard({ post }: { post: PendingPost }) {
  const [body, setBody] = useState(post.body)
  const [note, setNote] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(reviewPost, null)
  const changed = body !== post.body

  return (
    <li className="v2-panel v2-stack">
      <div className="v2-chiprow">
        <VoiceBadge check={post.check} />
        <Badge tone="neutral" size="sm">{post.check.chars}자</Badge>
        {post.hook_type && <Badge tone="neutral" size="sm">{post.hook_type}</Badge>}
        {post.closing_type && <Badge tone="neutral" size="sm">{post.closing_type}</Badge>}
        <span className="v2-note v2-mono v2-push">
          {post.content_code ?? '코드 없음'}
        </span>
      </div>

      {(post.check.errors.length > 0 || post.check.warns.length > 0) && (
        <ul className="v2-bullets">
          {post.check.errors.map((e, i) => <li key={`e${i}`} className="v2-bullet-err">{e}</li>)}
          {post.check.warns.map((w, i) => <li key={`w${i}`}>{w}</li>)}
        </ul>
      )}

      {/* 본문 — 그대로 두거나 여기서 고쳐서 승인한다. 승인 시 이 칸의 내용이 그대로 저장된다. */}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(20, Math.max(6, Math.ceil(post.body.length / 40)))}
        aria-label="본문 (수정 가능)"
      />
      {changed && <p className="v2-note">원문에서 수정됨 — 승인하면 이 수정본이 저장됩니다.</p>}

      {post.notes && (
        <details>
          <summary className="v2-summary v2-muted">근거·게이트 판정 전문 보기</summary>
          <pre className="v2-inset v2-pre v2-mt-sm">{post.notes}</pre>
        </details>
      )}

      <form action={action} className="v2-form">
        <input type="hidden" name="id" value={post.id} />
        <input type="hidden" name="body" value={body} />
        <Textarea
          name="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="반려 사유 (선택) · 승인 메모 (선택)" aria-label="반려 사유 또는 승인 메모"
        />
        <div className="v2-actions">
          <Button type="submit" name="decision" value="approved" variant="primary" size="sm" disabled={pending || !body.trim()}>
            승인{changed ? ' (수정본 저장)' : ''}
          </Button>
          <Button type="submit" name="decision" value="rejected" variant="destructive" size="sm" className="v2-btn-danger" disabled={pending}>
            반려
          </Button>
          {pending && <span className="v2-note">저장 중…</span>}
        </div>
        {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
      </form>
    </li>
  )
}
