'use client'

import { useActionState, useState } from 'react'
import { linkDraft, type ActionState } from './actions'
import { Choice, Field, Input, labelStyle } from '../_ds/components/Field'
import { Button } from '../_ds/components/Button'
import { REQUIRED, ResultMessage } from './form-ui'
import { MANUAL_SUGGEST_MIN, candidateMatchesQuery, suggestedCandidates } from '@/lib/threads/match'

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

/**
 * 수동 연결 후보 1건. 점수를 문자열에 말아 넣지 않고 필드로 들고 있다 —
 * 화면이 판정 근거(유사도·어느 초안·언제 만든 것·앞 문장)를 그대로 노출하고
 * 검색도 걸어야 하기 때문이다(SP-024: 근거를 숨기지 않는다).
 */
export type ThreadCandidate = {
  id: string
  /** 본문 유사도 0~1 (lib/threads/match.ts diceSimilarity). */
  score: number
  /** 어느 초안인지 알아볼 표지. content_code 가 없으면 status. */
  code: string
  /** 초안 생성 시각(KST) 또는 '생성일 없음'. */
  createdKst: string
  /** 초안 본문 앞부분. 근거이면서 검색 대상이다. */
  preview: string
}

export type UnlinkedThread = {
  id: string
  text: string
  permalink: string | null
  /** Threads API 원문 타임스탬프(오프셋 포함). 그대로 published_at 으로 보낸다. */
  timestamp: string | null
  whenKst: string
  /**
   * 본문 유사도 내림차순 **전체** 후보. 화면이 상위 몇 건만 펼치고 나머지는
   * 검색으로 닿게 한다 — 여기서 잘려 오면 우회할 길이 없다.
   * 후보 목록을 만드는 쿼리(app/dashboard/page.tsx)가 늘어나도 이 화면은 그대로 돈다.
   */
  candidates: ThreadCandidate[]
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

/** 검색으로 찾은 후보를 한 번에 몇 건까지 그릴지. 넘치면 넘쳤다고 화면에 적는다(§7.2). */
const FILTER_LIMIT = 15

const noteStyle = { margin: '6px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' } as const

/** 검색 대상 문자열. 본문 전체가 아니라 화면에 보이는 것만 본다 — 보이는 것으로 찾게 한다. */
const candidateHaystack = (c: ThreadCandidate) => `${c.code} ${c.createdKst} ${c.preview}`

/**
 * 후보 1건 = 라디오 1개. 드롭다운이 아니라 라디오인 이유: 유사도·초안 코드·생성일·앞
 * 문장을 한 줄에 다 보여야 사람이 판단할 수 있고, `<option>` 안에서는 그게 안 된다.
 * name 은 반드시 draft_id — 그대로 linkDraft 서버 액션으로 간다.
 */
function CandidateChoice({ c }: { c: ThreadCandidate }) {
  return (
    <Choice
      type="radio"
      name="draft_id"
      value={c.id}
      required
      style={{ display: 'flex', width: '100%' }}
      label={
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
          <b style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{c.score.toFixed(3)}</b>
          <span>{c.code}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>초안 {c.createdKst}</span>
        </span>
      }
      hint={c.preview || '(본문 없음)'}
    />
  )
}

function UnlinkedThreadRow({ t }: { t: UnlinkedThread }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(linkDraft, null)
  const [query, setQuery] = useState('')

  // 유사도 상위 몇 건만 먼저 펼친다. 0건은 오류가 아니라 정상 결과이고,
  // 그때는 빈 목록을 두지 않고 그 사실을 문장으로 말한다.
  const suggested = suggestedCandidates(t.candidates)
  const suggestedIds = new Set(suggested.map(c => c.id))
  // candidates 는 점수 내림차순이라 0번이 최고점이다.
  const best = t.candidates[0] ?? null
  // 검색은 순위가 틀렸을 때의 우회로다. 위에 이미 보인 건 뺀다 — 같은 라디오(name·value
  // 동일)가 두 군데 그려지면 어느 쪽이 선택됐는지 화면이 어긋난다.
  const hits = query.trim()
    ? t.candidates.filter(c => !suggestedIds.has(c.id) && candidateMatchesQuery(candidateHaystack(c), query))
    : []

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

      <form action={formAction} style={{ display: 'grid', gap: 14 }}>
        {/* 게시물 쪽 값은 전부 API 가 준 그대로 보낸다 — 사람이 옮겨 적다 틀릴 자리를 없앤다. */}
        <input type="hidden" name="external_id" value={t.id} />
        <input type="hidden" name="published_at" value={t.timestamp ?? ''} />
        <input type="hidden" name="permalink" value={t.permalink ?? ''} />
        <input type="hidden" name="published_body" value={t.text} />

        <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
          <legend style={{ ...labelStyle, padding: 0 }}>
            어느 초안의 발행본인가 — 앞 숫자가 본문 유사도(1.000 = 글자까지 같음)
          </legend>

          {t.candidates.length === 0 ? (
            <p style={noteStyle}>연결할 초안이 없습니다 — 고를 대상이 아예 없어 이 게시물은 여기서 연결할 수 없습니다.</p>
          ) : suggested.length === 0 ? (
            /* 임계값을 넘은 후보가 없다. 빈 목록으로 두면 "고를 게 없다"와 "찾지 못했다"가
               같은 화면이 된다(§7.1). 가장 높은 점수를 함께 적어 사람이 판단하게 한다. */
            <p style={noteStyle}>
              자동으로 후보를 찾지 못했습니다 — 초안 {t.candidates.length}건 중 본문 유사도가{' '}
              {MANUAL_SUGGEST_MIN} 이상인 것이 없습니다(가장 높은 값 {best!.score.toFixed(3)}).
              아래에서 검색해 직접 고르세요. 초안 없이 쓴 글이면 연결하지 말고 두면 됩니다.
            </p>
          ) : (
            <>
              <p style={noteStyle}>
                유사도 상위 {suggested.length}건 (전체 초안 {t.candidates.length}건 중).
                점수가 낮아도 같은 글이면 연결하면 됩니다.
              </p>
              {/* 1등을 미리 고르지 않는다(defaultChecked 없음). 저점수 구간에서는 1등이
                  틀릴 수 있고, 미리 골라 두면 확인 없이 누르게 된다. */}
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {suggested.map(c => <CandidateChoice key={c.id} c={c} />)}
              </div>
            </>
          )}
        </fieldset>

        {t.candidates.length > 0 && (
          <div style={{ minWidth: 0 }}>
            <Field
              label="위에 없으면 검색해서 고르세요"
              htmlFor={`q-${t.id}`}
              hint="소재 코드·생성일·본문 앞부분을 봅니다. 띄어쓰기는 무시합니다."
            >
              <Input
                id={`q-${t.id}`}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="예: SP-024, 재고 300"
              />
            </Field>

            {query.trim() && (hits.length === 0 ? (
              <p style={noteStyle}>
                검색 결과 0건 — 위 추천을 뺀 초안 {t.candidates.length - suggested.length}건 중 일치하는 것이 없습니다.
              </p>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {hits.slice(0, FILTER_LIMIT).map(c => <CandidateChoice key={c.id} c={c} />)}
                </div>
                <p style={noteStyle}>
                  {hits.length > FILTER_LIMIT
                    ? `${hits.length}건 중 ${FILTER_LIMIT}건만 표시했습니다 — 검색어를 좁히세요.`
                    : `검색 결과 ${hits.length}건.`}
                </p>
              </>
            ))}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={pending || !t.timestamp || t.candidates.length === 0}
          style={{ justifySelf: 'start' }}
        >
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
  + '고르세요. 유사도 상위 몇 건을 근거와 함께 먼저 보여 주고, 그 순위가 틀렸으면 검색으로 전체 초안에 '
  + '닿을 수 있습니다. 점수가 낮아도 같은 글이면 연결하면 됩니다. 연결하면 초안 본문이 발행본으로 바뀌고 '
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
