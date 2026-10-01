'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { FACET_FIELDS } from '@/lib/analysis/facets'
import { PMF_ANSWER_MAX, PMF_CAPTION, PMF_DEMAND_LABEL, PMF_INPUT_MAX, PMF_REQUIRED, type PmfRunStatus } from '@/lib/cases/idea-pmf'
import { PMF_QUADRANT_ADVICE, PMF_QUADRANT_LABELS, demandAxis, quadrantOf, type Quadrant } from '@/lib/cases/match'
import type { PublicPmfRun } from '@/lib/cases/idea-pmf-run'
import { Panel } from '../../_pub/components/Panel'
import { Chip } from '../../_pub/components/Chip'
import { PubEmpty } from '../../_pub/components/PubEmpty'
import { Stat, StatRow } from '../../_pub/components/Stat'
import { IconChevronRight } from '../../_pub/icons'
import { Meta } from './angle-panel'

// PMF 판정 사분면 자가진단 패널(P4 — reports/2026-10-01/design-direction-pmf-judgment.md A8).
// 로그인후 `/cases/report#pmf` 의 클라이언트 섬. 마운트 시 자동 시작하지 않는다(입력이 필요하고 앵글 검증과 동시 실행을 피한다).
// 흐름: S0 입력 → POST → S1 질문 만드는 중(4초 폴링, 5분 상한) → S2 해당 없음 | S3 답변 → PUT → S4 점수 중 → S5 완료.
// ★ §7.1 확인 불가 ≠ 없음: 실패(failed) · 한도(limited) · 기록을 못 읽음(네트워크·HTTP) 을 서로 다른 제목으로 말하고,
//   어느 쪽이든 숫자를 그리지 않는다(0 으로 접지 않는다). 완료인데 축이 비었으면 그것도 확인 불가다.
// ★ 사분면 라벨·권고는 lib/cases/match.ts 의 PMF_QUADRANT_LABELS·ADVICE 그대로. 수요축 라벨은 항상 PMF_DEMAND_LABEL.
// ★ 종합 점수·등급·합격 표현 없음. 판정 색 없음(칩은 중립 라벨), 모션 없음.
// fetch·폴링은 angle-panel.tsx 의 start/stop 을 복제했다 — 두 벌째다. 세 벌째가 되면 훅으로 뽑는다.

const POLL_MS = 4_000
const POLL_CAP_MS = 5 * 60_000
const API = '/api/cases/report/pmf'
const ACTIVE: readonly PmfRunStatus[] = ['queued', 'running', 'scoring']

const FIELDS = [
  { key: 'core_feature', label: '핵심 기능 한 줄', example: '예: 청구서를 만들어 기한에 맞춰 자동으로 보낸다…' },
  { key: 'customer', label: '주 소비자층', example: '예: 1인 프리랜서 디자이너…' },
  { key: 'price', label: '예상 가격 (월·회 단위 포함)', example: '예: 월 9,900원…' },
  { key: 'alternative', label: '지금 고객이 대신 쓰는 것', example: '예: 엑셀 양식과 메일 수동 발송…' },
] as const
type FieldKey = (typeof FIELDS)[number]['key']
type Form = Record<FieldKey, string> & { bottleneck_override: string }
const EMPTY: Form = { core_feature: '', customer: '', price: '', alternative: '', bottleneck_override: '' }

const BN = FACET_FIELDS.find((f) => f.key === 'bottleneck')?.options ?? []
const bnLabel = (v: string | null) => BN.find((o) => o.value === v)?.label ?? v ?? '미지정'
/** lib 사유 원문은 두고 화면에서만 푼다(page.tsx tidy 와 같은 규칙: em 대시·직선 따옴표 금지). */
const tidy = (s: string) => s.replace(/\s[—–]\s/g, '. ').replace(/"([^"]*)"/g, '“$1”')
const isRequired = (k: FieldKey) => (PMF_REQUIRED as readonly string[]).includes(k)

/** 선례 무브 id → 케이스 슬러그·브랜드. 서버(page.tsx)가 로그인후에만 넘긴다. */
export type PmfAnchors = Record<string, { slug: string; brand: string }>
type Run = PublicPmfRun
/** 기록을 못 읽은 것(네트워크·HTTP·폴링 상한). 판정 실패(failed)·한도(limited)와 다른 사건이다. */
type Lookup = { error: string; runId: string | null }

const store = {
  get(key: string): string | null { try { return window.localStorage.getItem(key) } catch { return null } },
  set(key: string, v: string) { try { window.localStorage.setItem(key, v) } catch { /* 사생활 모드 — 초안 저장만 빠진다 */ } },
}

// ── 조각(렌더 셀프테스트가 따로 그린다) ─────────────────────────────

/** 남헌 v10(2026-10-01): AI 가 분류한 병목임을 배지와 한 줄로 밝힌다. */
export const PMF_AI_BADGE = '병목 AI 판독'
export const PMF_AI_NOTE = '이 아이디어의 병목은 AI 가 자동으로 분류한 것이다.'

/** 병목 배지 + 이유 + "다른 병목으로 다시". 바꾸면 새 실행(fresh)이다. */
export function BottleneckBadge({ run, onChange }: { run: Run; onChange?: (v: string) => void }) {
  const ai = run.bottleneck_source !== 'user'
  const src = ai
    ? `${PMF_AI_BADGE} · 확신 ${run.bottleneck_confidence === 'high' ? '높음' : run.bottleneck_confidence === 'low' ? '낮음' : '기록 없음'}`
    : '내가 고름'
  return (
    <div className="pub-pmf-badge">
      <span className="pub-chiprow">
        <Chip>병목 · {bnLabel(run.bottleneck)}</Chip>
        <Chip>{src}</Chip>
      </span>
      {ai ? <p className="pub-caption">{PMF_AI_NOTE}</p> : null}
      {run.bottleneck_reason ? <p className="pub-caption">{tidy(run.bottleneck_reason)}</p> : null}
      {run.bottleneck_source === 'llm' && run.bottleneck_confidence === 'low'
        ? <p className="pub-caption">확신 낮음. 병목을 직접 골라 다시 돌려 보라.</p> : null}
      {onChange ? (
        <label className="pub-pmf-field">
          <span className="pub-caption">다른 병목으로 다시 (새 판정)</span>
          <select className="pub-field" name="bottleneck_change" value="" onChange={(e) => { if (e.target.value) onChange(e.target.value) }}>
            <option value="">바꾸지 않음</option>
            {BN.filter((o) => o.value !== run.bottleneck).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  )
}

/** S6 확인 불가 3종. 숫자를 그리지 않는다. */
export function PmfFailure({ kind, error, action }: { kind: 'failed' | 'limited' | 'lookup'; error: string; action?: ReactNode }) {
  const title = kind === 'limited' ? '확인 불가. 사용 한도에 걸렸다'
    : kind === 'lookup' ? '확인 불가. 판정 기록을 읽지 못했다' : '확인 불가. 판정이 끝나지 못했다'
  const body = kind === 'limited' ? `이번 판정은 돌리지 않았다. ${tidy(error)}`
    : kind === 'lookup' ? `${tidy(error)}. 판정 결과가 없다는 뜻이 아니다.` : `지금은 수치를 못 냈다. ${tidy(error)}`
  return (
    <Panel tone="alert" title={title}>
      <p className="pub-text" data-pmf-fail={kind}>{body}</p>
      {action ? <div className="pub-actions">{action}</div> : null}
    </Panel>
  )
}

/** S2 해당 없음 — 조회는 정상인데 같은 병목 선례가 0건. 사분면을 내지 않는다(질문을 만들 선례가 없다). */
export function PmfNoMatch({ run, onChange }: { run: Run; onChange?: (v: string) => void }) {
  return (
    <>
      <PubEmpty compact title="해당 없음. 비슷한 사례가 없다" description={run.match_reason ? tidy(run.match_reason) : undefined} />
      <BottleneckBadge run={run} onChange={onChange} />
    </>
  )
}

const n1 = (v: number | null) => (v === null ? '점수 없음' : String(Math.round(v * 10) / 10))

/** S5 완료. 두 축·사분면이 전부 있어야 그린다 — 하나라도 비면 확인 불가(0 으로 그리지 않는다). */
export function PmfDone({ run, action }: { run: Run; action?: ReactNode }) {
  const d = run.demand_axis
  const p = run.precedent_axis
  const quad = run.quadrant && run.quadrant in PMF_QUADRANT_LABELS ? (run.quadrant as Quadrant) : null
  if (d === null || p === null || quad === null) {
    return <PmfFailure kind="lookup" error="완료로 기록됐지만 축 값이 비어 있다" action={action} />
  }
  const why = [quadrantOf(d, p).reason, demandAxis(run.answers.map((a) => a.opportunity_score), 10).reason]
  return (
    <>
      <div className="pub-angle-stat">
        <StatRow>
          <Stat label={PMF_DEMAND_LABEL} value={d.toFixed(2)} caption="내 답을 AI 가 읽은 값(0~1)" />
          <Stat label="선례축" value={p.toFixed(2)} caption={run.match_reason ? tidy(run.match_reason) : undefined} />
          <Stat label="사분면" value={PMF_QUADRANT_LABELS[quad]} />
        </StatRow>
      </div>
      <p className="pub-text"><strong>{PMF_QUADRANT_ADVICE[quad]}</strong></p>
      <p className="pub-caption">{PMF_CAPTION}</p>
      <BottleneckBadge run={run} />
      <ul className="pub-angles">
        {run.answers.map((a) => (
          <li key={a.question_id}>
            <b>{a.factor}</b>
            <span className="pub-caption">{a.question}</span>
            {a.answer_text === null ? (
              <span className="pub-chiprow"><Chip>건너뜀 · 점수 없음</Chip></span>
            ) : (
              <>
                <span className="pub-chiprow">
                  <Chip>중요도 {n1(a.importance)}</Chip>
                  <Chip>만족도 {n1(a.satisfaction)}</Chip>
                  <Chip>기회 {n1(a.opportunity_score)}</Chip>
                </span>
                {a.evidence_quote ? <span className="pub-angle-quote">“{a.evidence_quote}”</span> : null}
                {a.notes ? (
                  <details className="pub-fold pub-fold--inline">
                    <summary><IconChevronRight />메모</summary>
                    <div className="pub-fold-body"><p className="pub-text">{a.notes}</p></div>
                  </details>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <details className="pub-fold pub-fold--inline">
        <summary><IconChevronRight />왜 이 사분면인가</summary>
        <div className="pub-fold-body">{why.map((w, i) => <p key={i} className="pub-text">{tidy(w)}</p>)}</div>
      </details>
      <Meta run={run} />
      {action ? <div className="pub-actions">{action}</div> : null}
    </>
  )
}

/** S3 질문마다: 선례 앵커(케이스 링크 + 그 선례에서 본 근거 한 줄) · 답 칸(≤500자) · 건너뛰기. */
export function QuestionForm({ run, anchors, draft, setDraft, busy, onSubmit }: {
  run: Run
  anchors: PmfAnchors
  draft: Record<string, { text: string; skip: boolean }>
  setDraft: (next: Record<string, { text: string; skip: boolean }>) => void
  busy: boolean
  onSubmit: () => void
}) {
  const answered = run.questions.filter((q) => !draft[q.id]?.skip && (draft[q.id]?.text ?? '').trim()).length
  const put = (id: string, patch: Partial<{ text: string; skip: boolean }>) =>
    setDraft({ ...draft, [id]: { text: draft[id]?.text ?? '', skip: draft[id]?.skip ?? false, ...patch } })
  return (
    <form className="pub-pmf-form" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit() }}>
      <ol className="pub-angles">
        {run.questions.map((q) => {
          const a = draft[q.id] ?? { text: '', skip: false }
          const anchor = q.anchor_move_id ? anchors[q.anchor_move_id] : undefined
          const why = run.salient.find((s) => (q.anchor_move_id && s.anchor_move_id === q.anchor_move_id) || s.factor === q.factor)?.why
          return (
            <li key={q.id} className="pub-pmf-q">
              <b>{q.factor}</b>
              <label htmlFor={`pmf-${q.id}`} className="pub-text">{q.question}</label>
              <span className="pub-caption">
                {anchor
                  ? <>선례: <Link className="pub-link" href={`/library/${anchor.slug}`} translate="no">{anchor.brand}</Link></>
                  : q.anchor_move_id ? '선례: 목록에 없는 무브' : '선례 앵커 없음'}
                {why ? ` · ${tidy(why)}` : ''}
              </span>
              <textarea id={`pmf-${q.id}`} name={q.id} className="pub-field pub-pmf-textarea" rows={4} maxLength={PMF_ANSWER_MAX}
                value={a.text} disabled={a.skip} autoComplete="off" placeholder="내 계획으로 답한다. 누가·언제·얼마나를 적으면 점수가 구체적이다…"
                onChange={(e) => put(q.id, { text: e.target.value })} />
              <span className="pub-pmf-qfoot">
                <label className="pub-pmf-check">
                  <input type="checkbox" name={`${q.id}_skip`} checked={a.skip} onChange={(e) => put(q.id, { skip: e.target.checked })} />
                  이 질문은 건너뛴다
                </label>
                <span className="pub-caption pub-pmf-count">{[...a.text].length}/{PMF_ANSWER_MAX}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="pub-actions">
        <button type="submit" className="pub-btn pub-btn--primary" disabled={busy}>
          {busy ? '제출하는 중…' : '점수 내기'}
        </button>
      </div>
      <p className="pub-caption">
        {answered === 0 ? '최소 1개는 답해야 한다. ' : ''}답은 그대로 저장되고 AI 가 읽어 중요도·만족도를 매긴다. 자가진단이다.
      </p>
    </form>
  )
}

// ── 패널 본체 ───────────────────────────────────────────────────────

export function PmfPanel({ q, kind, anchors }: { q: string; kind: string; anchors: PmfAnchors }) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [resumed, setResumed] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraftState] = useState<Record<string, { text: string; skip: boolean }>>({})
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputKey = `pmf-input:${kind}:${q}`

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null }

  const land = useCallback((r: Run) => {
    setRun(r)
    if (r.status === 'awaiting_answers') {
      const saved = store.get(`pmf-draft:${r.run_id}`)
      try { setDraftState(saved ? JSON.parse(saved) : {}) } catch { setDraftState({}) }
    }
  }, [])

  const poll = useCallback((runId: string) => {
    stop()
    const began = Date.now()
    timer.current = setInterval(async () => {
      if (Date.now() - began > POLL_CAP_MS) {
        stop()
        setLookup({ error: '5분이 지나도 끝나지 않았다', runId })
        return
      }
      try {
        const r = await fetch(`${API}?run=${runId}`, { cache: 'no-store' })
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.run_id) {
          if (r.status === 404) { stop(); setLookup({ error: '그 판정 기록을 찾지 못했다', runId: null }) }
          return // 그 밖은 한 번 못 읽은 것 — 다음 폴링에서 다시(상한은 위 5분)
        }
        land(j as Run)
        if (!ACTIVE.includes((j as Run).status)) stop()
      } catch { /* 네트워크 한 번 끊김 — 다음 폴링 */ }
    }, POLL_MS)
  }, [land])

  const start = useCallback(async (f: Form, fresh: boolean) => {
    stop()
    setLookup(null)
    setFormError(null)
    setBusy(true)
    const input = {
      core_feature: f.core_feature, customer: f.customer, price: f.price || null, alternative: f.alternative || null,
      bottleneck_override: f.bottleneck_override || null,
    }
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, kind, input, fresh }) })
      const json = await res.json().catch(() => null)
      if (res.status === 400) {
        const field = FIELDS.find((x) => x.key === json?.field)
        setRun(null)
        setFormError(`${field ? field.label.split(' (')[0] + ': ' : ''}${json?.error ?? '입력을 확인해 달라'}`)
        return
      }
      if (!res.ok || !json?.run_id) { setLookup({ error: json?.error ?? `HTTP ${res.status}`, runId: null }); return }
      store.set(inputKey, JSON.stringify(f))
      land(json as Run)
      if (ACTIVE.includes((json as Run).status)) poll((json as Run).run_id)
    } catch (e) {
      setLookup({ error: e instanceof Error ? e.message : String(e), runId: null })
    } finally {
      setBusy(false)
    }
  }, [q, kind, inputKey, land, poll])

  const submit = useCallback(async () => {
    if (!run) return
    const answers = run.questions.map((x) => {
      const a = draft[x.id]
      const text = a && !a.skip ? a.text.trim() : ''
      return { id: x.id, text: text || null }
    })
    // 버튼은 막지 않고(요청 전까지 활성) 여기서 말한다 — 서버도 같은 규칙으로 400 을 준다.
    if (!answers.some((a) => a.text)) { setFormError('최소 1개는 답해야 한다. 건너뛰지 않은 칸에 답을 적어 달라.'); return }
    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: run.run_id, answers }) })
      const json = await res.json().catch(() => null)
      if (res.status === 400) { setFormError(json?.error ?? '답을 확인해 달라'); return }
      if (res.status === 409) { poll(run.run_id); return } // 이미 제출됨 — 지금 상태를 다시 읽는다
      if (!res.ok || !json?.run_id) { setLookup({ error: json?.error ?? `HTTP ${res.status}`, runId: run.run_id }); return }
      land(json as Run)
      if (ACTIVE.includes((json as Run).status)) poll((json as Run).run_id)
    } catch (e) {
      setLookup({ error: e instanceof Error ? e.message : String(e), runId: run.run_id })
    } finally {
      setBusy(false)
    }
  }, [run, draft, land, poll])

  useEffect(() => {
    // 외부 시스템(localStorage)과 동기화: 지난 입력이 있으면 폼을 채운다. 같은 입력으로 시작하면 캐시가 그 판정을 돌려준다.
    const saved = store.get(inputKey)
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm({ ...EMPTY, ...JSON.parse(saved) })
        setResumed(true)
      } catch { /* 깨진 값은 무시 */ }
    }
    return stop
  }, [inputKey])

  const setDraft = (next: Record<string, { text: string; skip: boolean }>) => {
    setDraftState(next)
    if (run) store.set(`pmf-draft:${run.run_id}`, JSON.stringify(next))
  }
  const rerun = (override: string) => { const f = { ...form, bottleneck_override: override }; setForm(f); void start(f, true) }
  const back = <button type="button" className="pub-btn pub-btn--ghost pub-btn--sm" onClick={() => { stop(); setRun(null); setLookup(null) }}>입력 고치기</button>
  const again = <button type="button" className="pub-btn pub-btn--ghost pub-btn--sm" onClick={() => void start(form, true)}>새로 판정</button>

  // 확인 불가 3종 — 기록을 못 읽음 / 한도 / 실패. 숫자 없음.
  if (lookup) {
    const retry = lookup.runId
      ? <button type="button" className="pub-btn pub-btn--ghost pub-btn--sm" onClick={() => { setLookup(null); poll(lookup.runId!) }}>다시 읽기</button>
      : <button type="button" className="pub-btn pub-btn--ghost pub-btn--sm" onClick={() => void start(form, false)}>다시 시도</button>
    return <div className="pub-pmf-panel" aria-live="polite"><PmfFailure kind="lookup" error={lookup.error} action={<>{retry}{back}</>} /></div>
  }
  if (run && (run.status === 'failed' || run.status === 'limited')) {
    const retry = <button type="button" className="pub-btn pub-btn--ghost pub-btn--sm" onClick={() => void start(form, false)}>다시 시도</button>
    return (
      <div className="pub-pmf-panel" aria-live="polite">
        <PmfFailure kind={run.status} error={run.error ?? '사유 미기록'} action={<>{retry}{back}</>} />
        {run.status === 'failed' ? <Meta run={run} /> : null}
      </div>
    )
  }

  if (run && ACTIVE.includes(run.status)) {
    const scoring = run.status === 'scoring'
    return (
      <div className="pub-pmf-panel" aria-live="polite" aria-busy="true">
        <p className="pub-caption">{scoring
          ? '답변을 읽고 중요도·만족도를 매기는 중(보통 20~40초)…'
          : '병목을 읽고 같은 병목의 선례를 찾아 질문을 만드는 중(보통 30초~1분)…'}</p>
        {[0, 1, 2].map((i) => <div key={i} className="pub-skel pub-angle-skel" aria-hidden="true" />)}
      </div>
    )
  }

  if (run?.status === 'no_match') {
    return <div className="pub-pmf-panel" aria-live="polite"><PmfNoMatch run={run} onChange={rerun} /><div className="pub-actions">{back}</div></div>
  }

  if (run?.status === 'awaiting_answers') {
    return (
      <div className="pub-pmf-panel" aria-live="polite">
        <BottleneckBadge run={run} onChange={rerun} />
        {formError ? <p className="pub-text" role="alert">{formError}</p> : null}
        <QuestionForm run={run} anchors={anchors} draft={draft} setDraft={setDraft} busy={busy} onSubmit={() => void submit()} />
        <div className="pub-actions">{back}</div>
      </div>
    )
  }

  if (run?.status === 'done') {
    return <div className="pub-pmf-panel" aria-live="polite"><PmfDone run={run} action={<>{again}{back}</>} /></div>
  }

  // S0 입력.
  return (
    <div className="pub-pmf-panel">
      <form className="pub-pmf-form" onSubmit={(e) => { e.preventDefault(); void start(form, false) }}>
        <div className="pub-pmf-grid">
          {FIELDS.map((f) => (
            <label key={f.key} className="pub-pmf-field">
              <span className="pub-caption">{f.label}{isRequired(f.key) ? ' (필수)' : ' (선택)'}</span>
              <input className="pub-field" name={f.key} value={form[f.key]} maxLength={PMF_INPUT_MAX[f.key]} required={isRequired(f.key)}
                autoComplete="off" placeholder={f.example} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </label>
          ))}
          <label className="pub-pmf-field">
            <span className="pub-caption">병목 (선택)</span>
            <select className="pub-field" name="bottleneck_override" value={form.bottleneck_override}
              onChange={(e) => setForm({ ...form, bottleneck_override: e.target.value })}>
              <option value="">AI 가 읽게 두기</option>
              {BN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        {formError ? <p className="pub-text" role="alert">{formError}</p> : null}
        <div className="pub-actions">
          <button type="submit" className="pub-btn pub-btn--primary" disabled={busy}>{busy ? '시작하는 중…' : 'PMF 판정 시작'}</button>
        </div>
        {resumed ? <p className="pub-caption">지난번 입력을 채워 두었다. 그대로 시작하면 7일 안의 같은 판정을 이어 본다.</p> : null}
        <p className="pub-caption">입력과 내 답변은 판정 기록으로 저장되고(본인만 열람), AI 처리를 위해 Anthropic 으로 전송된다(자세한 내용은 개인정보 고지).</p>
      </form>
    </div>
  )
}
