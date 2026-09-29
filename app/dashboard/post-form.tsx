'use client'

import { useActionState } from 'react'
import { createPost, type ActionState } from './actions'
import { Field, Input, Select, Textarea } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { Notice } from '../_ds/components/Shell'
import { REQUIRED, ResultMessage } from './form-ui'
import { PILLARS } from '@/lib/content/pillar'

export type ContentItem = { code: string; title: string | null }
export type Hypothesis = { code: string; statement: string | null }

export default function PostForm({
  contentItems,
  hypotheses,
  refsError,
}: {
  contentItems: ContentItem[]
  hypotheses: Hypothesis[]
  /** 소재·가설 조회 실패 사유. 있으면 선택지가 비어 보여도 "없음"이 아니다 — 제출을 막는다(§7.1). */
  refsError: string | null
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPost, null)

  return (
    <form action={formAction} className="v2-formgrid">
      {refsError && (
        <div className="v2-span2">
          <Notice tone="danger" title="등록을 막았습니다 — 소재·가설 목록 확인 불가">
            {refsError} 선택지가 비어 보여도 소재·가설이 없다는 뜻이 아닙니다. 새로고침 후 다시 시도하세요.
          </Notice>
        </div>
      )}
      {/* 서버 액션이 이 값을 본다. 화면이 막아도 오래 열린 탭·직접 POST 는 서버가 거른다. */}
      <input type="hidden" name="refs_loaded" value={refsError ? '0' : '1'} />

      <div className="v2-span2">
      <Field label="소재 (content_code)" htmlFor="content_code">
        <Select id="content_code" name="content_code" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {contentItems.map(c => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.title ?? ''}
            </option>
          ))}
        </Select>
      </Field>
      </div>

      <div className="v2-span2">
      <Field label={<>본문 (body){REQUIRED}</>} htmlFor="body">
        <Textarea id="body" name="body" rows={8} required />
      </Field>
      </div>

      <Field label={<>발행일시 (published_at, 한국 시간){REQUIRED}</>} htmlFor="published_at">
        <Input id="published_at" name="published_at" type="datetime-local" required />
      </Field>

      {/* 초안 없이 외부에서 이미 올린 글 — 두 칸을 채우면 published_via='external' 로 등록되고 성과 수집이 붙는다. 발행은 하지 않는다. */}
      <Field label="외부 게시물 ID (external_id, Threads media id)" htmlFor="external_id">
        <Input id="external_id" name="external_id" type="text" inputMode="numeric" pattern="\d{15,20}" placeholder="예: 18109270787178013" />
      </Field>

      <Field label="외부 게시물 퍼머링크 (permalink)" htmlFor="permalink">
        <Input id="permalink" name="permalink" type="url" placeholder="https://www.threads.com/@계정/post/코드" />
      </Field>

      <Field label="패턴 (pattern)" htmlFor="pattern">
        <Select id="pattern" name="pattern" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>
      </Field>

      <Field label="필러 (pillar)" htmlFor="pillar">
        <Select id="pillar" name="pillar" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {PILLARS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </Field>

      <Field label="훅 유형 (hook_type)" htmlFor="hook_type">
        <Input id="hook_type" name="hook_type" type="text" />
      </Field>

      <Field label="마무리 유형 (closing_type)" htmlFor="closing_type">
        <Input id="closing_type" name="closing_type" type="text" />
      </Field>

      <div className="v2-span2">
      <Field label="가설 (hypothesis_code)" htmlFor="hypothesis_code">
        <Select id="hypothesis_code" name="hypothesis_code" defaultValue="">
          <option value="">— 선택 안 함 —</option>
          {hypotheses.map(h => (
            <option key={h.code} value={h.code}>
              {h.code} — {h.statement ?? ''}
            </option>
          ))}
        </Select>
      </Field>
      </div>

      <div className="v2-span2">
        <Button type="submit" variant="primary" disabled={pending || Boolean(refsError)}>
          {pending ? '저장 중…' : '글 등록'}
        </Button>
      </div>

      {state && <ResultMessage state={state} className="v2-span2" />}
    </form>
  )
}
