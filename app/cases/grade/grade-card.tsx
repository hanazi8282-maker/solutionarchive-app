'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { gradeCase, type ReviewActionState } from '../actions'
import { caseApproveDefault } from '@/lib/cases/grade-queue'
import { PMF_SIGNALS, TRANSFERABILITY_REASON_MAX } from '@/lib/cases/grade-queue'
import { TRANSFERABILITY, TRANSFERABILITY_LABEL, TRANSFERABILITY_UNRATED_HINT, caseApprovalWarning, moveApprovalWarning } from '@/lib/cases/review'
import { Badge } from '../../_ds/components/Badge'
import { Button } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { Choice, Select, Textarea } from '../../_ds/components/Field'
import { Notice } from '../../_ds/components/Shell'

// 카드 1장 = 케이스 1건 = 폼 1개 = 제출 1회. 클릭은 무브당 체크 1 + 라디오 1뿐이다.
// 반려 버튼을 일부러 두지 않았다 — 체크 안 한 무브는 draft 로 남고, 반려는 /cases 에서 사유와 함께 한다.

export type GradeEvidence = { id: string; url: string; domain: string | null; case_move_id: string | null; snippet: string | null }
export type GradeMove = {
  id: string
  lever: string
  claim: string
  outcome_direction: string | null
  transfer_note: string | null
  preconditions: string | null
  evidence_grade: string
  fact_check_grade: string | null
  review_status: string
  // 전후 수치 — "왜 택했나"의 유일한 관측값이다. 전부 nullable 이고 미기재를 0 으로 접지 않는다.
  metric_name: string | null
  metric_before: number | null
  metric_after: number | null
  metric_unit: string | null
  observed_period_start: string | null
  observed_period_end: string | null
  evidence: GradeEvidence[]
}
export type GradeCaseData = {
  id: string
  slug: string
  brand_name: string
  business_model: string | null
  bottleneck: string | null
  reader_problem: string | null
  summary: string | null
  review_status: string
  // 배경 — 카드만 보고 판단하기에 부족했던 자리(남헌 2026-09-23). 전부 DB 에 이미 있는 사실이다.
  market: string | null
  geo: string | null
  period_start: string | null
  period_end: string | null
  outcome_status: string | null
  buyer_type: string | null
  price_band: string | null
  moves: GradeMove[]
}

// 등급 A~D 는 분류이지 결과 방향이 아니다 — 색을 입히지 않는다(M1 과 같은 규칙, app/_pub/README.md 색 표 ⚠️).
// 초록 A·앰버 C 로 칠하면 "C 는 경고"로 읽힌다. 뜻은 배지 글자("근거 A")가 말한다.

/** 스니펫 미리보기 길이. 저장 상한은 300(case_evidence CHECK)이고, 카드에선 앞부분만 본다. */
const SNIPPET_PREVIEW = 160
const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? ''))

/**
 * 배경 한 줄 — **DB 에 이미 있는 값만** 이어 붙인다. 미기재 칸은 아예 만들지 않는다.
 * 여기서 서술을 생성하지 않는다(§10.1). `outcome_status='unknown'` 은 기본값이라 빼고 —
 * "확인 안 했다"를 사실처럼 한 줄에 올리면 배경이 아니라 소음이다(§7.1 은 이 값을 지우라는 뜻이 아니라,
 * 뒤집어 "active" 로 읽지 말라는 뜻이다. 미확인은 아래 케이스 상세에서 본다).
 */
function backgroundBits(c: GradeCaseData): string[] {
  const has = (v: string | null | undefined) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  const period = has(c.period_start) || has(c.period_end) ? `${c.period_start ?? '?'}~${c.period_end ?? '?'}` : null
  return [
    has(c.market) && `시장 ${c.market}`,
    has(c.geo) && `지역 ${c.geo}`,
    period && `기간 ${period}`,
    has(c.outcome_status) && c.outcome_status !== 'unknown' && `결과 ${c.outcome_status}`,
    has(c.buyer_type) && `구매자 ${c.buyer_type}`,
    has(c.price_band) && `가격대 ${c.price_band}`,
  ].filter((v): v is string => typeof v === 'string')
}

/**
 * 전후 한 줄. 수치·시점은 미기재와 0 을 가른다 — `?` 는 "그 칸이 비었다"는 표시다.
 * 관측 시점이 통째로 없으면 "시점 미확인"이라고 적는다. 날짜를 추정해 넣지 않는다.
 */
function metricLine(m: GradeMove): string {
  const num = (v: number | null) => (v === null ? '?' : String(v))
  const nums = m.metric_before === null && m.metric_after === null
    ? '수치 미기재'
    : `${m.metric_name ?? '지표명 미기재'} ${num(m.metric_before)}→${num(m.metric_after)}${m.metric_unit ? ` ${m.metric_unit}` : ''}`
  const when = m.observed_period_start || m.observed_period_end
    ? `${m.observed_period_start ?? '?'}~${m.observed_period_end ?? '?'}`
    : '시점 미확인'
  return `전후: ${nums} · ${when}`
}

/** PMF 신호 강도 S 의 한 줄 기준. 정본은 reports/2026-09-23/pmf-grade-axis-design.md §3-1. */
const PMF_SIGNAL_HINT: Readonly<Record<string, string>> = {
  '3': '3 — 결과 확정 + 규모 큼 (≥2배 / ≥10pp / 실패 확정+수치)',
  '2': '2 — 20~99% 또는 5~10pp, 또는 벤치마크 대비 명백. 투입 지표는 여기까지',
  '1': '1 — 20% 미만, 또는 단일 시점·벤치마크 없음, 또는 사업 결과가 아닌 지표',
  '0': '0 — 수치 없음 또는 방향 불분명 (등급 D)',
}

/** 등급 배지 2종. `app/analyze/[id]/advisor-cards.tsx` 의 GradeBadge 와 같은 모양(Badge size="sm"). */
function GradeBadges({ m }: { m: GradeMove }) {
  return (
    <span className="v2-chiprow v2-push">
      <Badge tone="neutral" size="sm">근거 {m.evidence_grade}</Badge>
      <Badge tone="neutral" size="sm">사실확인 {m.fact_check_grade ?? '미기재'}</Badge>
    </span>
  )
}

/** 근거는 펼치지 않아도 링크가 보인다 — 펼치기 클릭 1회가 케이스마다 붙던 자리다. */
function EvidenceLinks({ rows }: { rows: GradeEvidence[] }) {
  if (rows.length === 0) return <p className="v2-note">근거 0건 — 조회는 정상이다(이 무브에 걸린 행이 없다)</p>
  const snippets = rows.filter((e) => (e.snippet ?? '').trim() !== '')
  return (
    <>
      <p className="v2-note v2-inline">
        <span>근거 {rows.length}건:</span>
        {rows.map((e) => (
          <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer">{e.domain ?? e.url}</a>
        ))}
      </p>
      {/* 스니펫이 "왜 택했나·전후 상황"의 실제 출처다. 여기 없는 맥락을 추측해 채우지 않는다(§10.1).
          접어 두는 이유는 카드 10장이 한 화면에 들어와야 하기 때문이다 — 펼침은 필요할 때만. */}
      {snippets.length > 0 ? (
        <details>
          <summary className="v2-summary v2-muted">근거 원문 발췌 {snippets.length}건 펼치기</summary>
          <ul className="v2-bullets v2-stack-tight v2-mt-sm">
            {snippets.map((e) => (
              <li key={e.id} className="v2-wrap">
                <b>{e.domain ?? '출처 미기재'}</b> — {clip(e.snippet, SNIPPET_PREVIEW)}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="v2-note">근거 원문 발췌 0건 — 수집 시 스니펫을 안 남긴 것이다(근거가 없다는 뜻이 아니다)</p>
      )}
    </>
  )
}

export function GradeCard({ c, nextAnchor }: { c: GradeCaseData; nextAnchor: string | null }) {
  const [checked, setChecked] = useState<string[]>([])
  const [caseOverride, setCaseOverride] = useState<boolean | null>(null)
  const [openClaim, setOpenClaim] = useState<string[]>([])
  // 이식성 라디오를 제어 상태로 올린 이유 하나: LOW/MEDIUM 일 때만 이유 칸을 띄우기 위해서다.
  // HIGH 에는 이유를 묻지 않는다 — 물으면 칸이 늘고, 늘어난 칸은 안 채워진다.
  const [transfer, setTransfer] = useState<Record<string, string>>({})
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(gradeCase, null)

  const draftMoves = c.moves.filter((m) => m.review_status === 'draft')
  const caseChecked = caseOverride ?? caseApproveDefault(checked.length)
  // 제출 뒤 상태로 경고를 만든다 — "체크 안 한 무브는 그대로 draft" 라는 사실을 숫자로 보여준다.
  const caseWarn = caseChecked
    ? caseApprovalWarning(c.moves.map((m) => (checked.includes(m.id) ? { review_status: 'approved' } : m)))
    : null
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const row = (m: GradeMove, i: number) => {
    const on = checked.includes(m.id)
    const warn = on ? moveApprovalWarning(m) : null
    return (
      <div className="v2-form">
        <div className="v2-chiprow">
          <b className="v2-mono">#{i}</b>
          <Badge tone="neutral" size="sm">{m.lever}</Badge>
          {m.outcome_direction === 'negative' && <Badge tone="danger" size="sm">부정 사례</Badge>}
          <GradeBadges m={m} />
        </div>
        {/* claim 은 한 줄. 전체는 펼쳐서 본다 — 카드 10장이 한 화면에 들어와야 하는 게 이 모드의 목적이다. */}
        <p
          onClick={() => setOpenClaim((s) => toggle(s, m.id))}
          className={openClaim.includes(m.id) ? 'v2-claim' : 'v2-claim v2-clamp1'}
          title="눌러서 전체 보기"
        >
          {m.claim}
        </p>
        <p className="v2-body">
          {m.transfer_note
            ? <>→ {m.transfer_note}</>
            : <span className="v2-flag">→ 옮길 행동 미기재</span>}
        </p>
        <p className="v2-note">{metricLine(m)}</p>
        <p className="v2-note">{m.preconditions ? `전제: ${m.preconditions}` : '전제: 미기재 (— "전제 없음"이 아니다)'}</p>
        <EvidenceLinks rows={m.evidence} />
        <div className="v2-actions">
          <Choice
            type="checkbox"
            name="move"
            value={m.id}
            checked={on}
            onChange={() => setChecked((s) => toggle(s, m.id))}
            disabled={pending}
            label={<b>이 무브 승인</b>}
          />
          {/* 이식성 — 사람만 고를 수 있는 유일한 값. 미선택도 승인된다(lib/cases/review.ts).
              라벨은 한 낱말만 쓴다(전문은 title). 카드 10장이 한 화면에 들어와야 하는 게 이 모드의 목적이다. */}
          {TRANSFERABILITY.map((v) => (
            <Choice
              key={v}
              type="radio"
              name={`transferability:${m.id}`}
              value={v}
              checked={transfer[m.id] === v}
              onChange={() => setTransfer((s) => ({ ...s, [m.id]: v }))}
              disabled={pending}
              title={TRANSFERABILITY_LABEL[v]}
              label={<span>{v} {TRANSFERABILITY_LABEL[v].split(' — ')[0]}</span>}
            />
          ))}
        </div>
        {/* LOW/MEDIUM 일 때만 나온다. 필수가 아니다 — 필수로 걸면 검수 병목이 더 심해지고,
            빈칸은 "이유 없음"이 아니라 미기재로 남는다(§7.1). 이 칸이 하루치 다이제스트의 입력이다. */}
        {(transfer[m.id] === 'LOW' || transfer[m.id] === 'MEDIUM') && (
          <Textarea
            name={`transferability_reason:${m.id}`}
            rows={2}
            maxLength={TRANSFERABILITY_REASON_MAX}
            disabled={pending}
            placeholder={`왜 옮기기 어려운가 한 줄 (${TRANSFERABILITY_REASON_MAX}자, 선택 — 빈칸은 "미기재"로 남는다)`}
          />
        )}
        {/* S·지표종류 — 컬럼은 D 트랙 마이그(20260930000004)가 만든다. 미적용이면 이 두 값만
            저장에서 빠지고 화면이 그렇게 말한다(app/cases/actions.ts writeMoveContext). */}
        <div className="v2-actions">
          <label className="v2-note v2-field-inline">
            PMF 신호 강도(S)
            <Select name={`pmf_signal:${m.id}`} defaultValue="" disabled={pending}>
              <option value="">코드 제안값 사용</option>
              {PMF_SIGNALS.map((v) => <option key={v} value={v}>{PMF_SIGNAL_HINT[v]}</option>)}
            </Select>
          </label>
          <label className="v2-note v2-field-inline">
            지표 종류
            <Select name={`metric_kind:${m.id}`} defaultValue="outcome" disabled={pending}>
              <option value="outcome">outcome — 결과 지표</option>
              <option value="input">input — 투입 지표(최대 S2)</option>
            </Select>
          </label>
        </div>
        {warn && <p className="v2-note v2-flag">승인 시 주의 — {warn}</p>}
      </div>
    )
  }

  return (
    <Card
      id={`grade-${c.slug}`}
      title={c.brand_name}
      subtitle={<>{c.slug} · {c.business_model ?? '모델 미기재'} · 병목 {c.bottleneck ?? '미기재'} · 독자 문제 {c.reader_problem ?? '미지정'}</>}
      action={<Badge tone="warning" dot size="sm">검수 대기</Badge>}
    >
      <form action={action} className="v2-stack">
        <input type="hidden" name="case_id" value={c.id} />
        {/* 배경 — 남헌 2026-09-23: "카드만 보고는 맥락이 부족하다". 있는 값만, 한 줄만. */}
        {backgroundBits(c).length > 0 && <p className="v2-note">배경 — {backgroundBits(c).join(' · ')}</p>}
        {c.summary && <p className="v2-body">{c.summary}</p>}

        {draftMoves.length === 0 && <p className="v2-note">검수 대기 무브 0건 — 케이스 승인만 남았다.</p>}
        {draftMoves.map((m, i) =>
          // transfer_note 가 없으면 독자가 가져갈 게 없다(등급 D 의 실체). 접어 두되 배지로 보인다 —
          // 승인을 막지는 않는다. 기계가 반려하지 않는 것과 같은 이유다(CLAUDE.md §10.1).
          m.transfer_note ? (
            <section key={m.id} className="v2-divided">{row(m, i)}</section>
          ) : (
            <details key={m.id} className="v2-divided">
              <summary className="v2-summary v2-chiprow">
                <b className="v2-mono">#{i}</b>
                <Badge tone="neutral" size="sm">{m.lever}</Badge>
                <Badge tone="danger" size="sm">독자 행동 없음(D)</Badge>
                <span className="v2-muted">펼쳐서 채점</span>
              </summary>
              <div className="v2-mt-sm">{row(m, i)}</div>
            </details>
          ),
        )}

        <section className="v2-callout">
          <Choice
            type="checkbox"
            name="approve_case"
            checked={caseChecked}
            onChange={() => setCaseOverride(!caseChecked)}
            disabled={pending}
            label={<b>케이스 승인</b>}
            hint="무브를 하나라도 승인하면 기본으로 켜진다. 케이스와 무브가 둘 다 승인돼야 매칭에 들어간다."
          />
          {caseWarn && <p className="v2-note v2-flag">{caseWarn}</p>}
          <p className="v2-note">{checked.length === 0 ? '고른 무브 0건 — 체크한 것만 반영된다.' : `고른 무브 ${checked.length}건 · ${TRANSFERABILITY_UNRATED_HINT}`}</p>
          <div className="v2-actions">
            <Button type="submit" variant="primary" size="sm" disabled={pending || (checked.length === 0 && !caseChecked)}>제출</Button>
            {nextAnchor
              ? <a href={`#${nextAnchor}`} className="v2-link">보류(다음에) ↓</a>
              : <span className="v2-note">마지막 카드다.</span>}
            {pending && <span className="v2-note">저장 중…</span>}
          </div>
        </section>

        {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
      </form>
    </Card>
  )
}
