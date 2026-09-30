'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ANGLE_TYPE_LABELS, type AngleType } from '@/lib/analysis/types'
import {
  IDEA_ANGLE_MAX, IDEA_VERDICT_CAPTION, IDEA_VERDICT_LABELS, summarizeVerdicts, type IdeaAngle,
} from '@/lib/cases/idea-angles'
import type { PublicRun } from '@/lib/cases/idea-angles-run'
import { Panel } from '../../_pub/components/Panel'
import { Chip } from '../../_pub/components/Chip'
import { Stat, StatRow } from '../../_pub/components/Stat'
import { IconChevronRight } from '../../_pub/icons'

// 앵글 검증 패널(I4-5) — 로그인후 `/cases/report` 의 클라이언트 섬. 리포트 본문(서버, LLM 0)은 먼저 뜨고
// 여기만 나중에 찬다: 마운트 시 POST → queued·running 이면 4초마다 GET ?run=, 5분 상한.
// 3상태: 대기·생성중(.pub-skel + 부분 결과) / 완료(Stat 3칸 + 앵글 목록) / 확인 불가(Panel alert + 다시 시도).
// 종합 점수는 만들지 않는다 — 판정 3종 건수와 인용 출처가 수치다(match.ts 2축 머리말·pmf 코멘트의 단일 점수 금지).
// 판정 색은 칩 테두리만(pub.css I4 블록이 글자·면 색을 뺀다).

const POLL_MS = 4_000
const POLL_CAP_MS = 5 * 60_000
const API = '/api/cases/report/angles'
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })

type Failure = { error: string; angles: IdeaAngle[] }

const verdictChip = (a: IdeaAngle) => {
  if (a.verdict === 'SUBSTANTIATED') return <Chip tone="positive">{IDEA_VERDICT_LABELS.SUBSTANTIATED}</Chip>
  if (a.verdict === 'EXPERIENTIAL') return <Chip>{IDEA_VERDICT_LABELS.EXPERIENTIAL}</Chip>
  // "순화됨"은 실제로 재작성했을 때만 붙인다(마감에 걸려 재작성 전이면 "선례 근거 없음"만).
  return <Chip tone="negative">{a.rewritten ? IDEA_VERDICT_LABELS.UNSUBSTANTIATED : '선례 근거 없음'}</Chip>
}

function AngleList({ angles }: { angles: IdeaAngle[] }) {
  return (
    <ul className="pub-angles">
      {angles.map((a, i) => (
        <li key={i}>
          <b>{a.headline}</b>
          <span className="pub-chiprow">
            {verdictChip(a)}
            {a.angle_type ? <Chip>{ANGLE_TYPE_LABELS[a.angle_type as AngleType] ?? a.angle_type}</Chip> : null}
          </span>
          {a.evidence_quote ? (
            <span className="pub-angle-quote">
              “{a.evidence_quote}”
              {a.evidence_ref ? <> · <Link className="pub-link" href={`/library/${a.evidence_ref.slug}`} translate="no">{a.evidence_ref.slug}</Link></> : null}
            </span>
          ) : null}
          {a.reason || a.headline_before || a.anchor ? (
            <details className="pub-fold pub-fold--inline">
              <summary><IconChevronRight />왜 이 판정인가</summary>
              <div className="pub-fold-body">
                {a.reason ? <p className="pub-text">{a.reason}</p> : null}
                {a.headline_before ? <p className="pub-text">재작성 전: {a.headline_before}</p> : null}
                {a.anchor ? (
                  <p className="pub-text">앵커 선례: <Link className="pub-link" href={`/library/${a.anchor.slug}`} translate="no">{a.anchor.slug}</Link></p>
                ) : null}
              </div>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function Meta({ run }: { run: PublicRun }) {
  const sec = run.started_at && run.finished_at
    ? Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000) : null
  const models = [...new Set(run.models)].join(', ') || '모델 기록 없음'
  const parts = [`호출 ${run.llm_calls}회`, models]
  if (sec !== null) parts.push(`${sec}초`)
  if (run.cost_usd !== null) parts.push(`명목 ${USD.format(run.cost_usd)}(구독이라 청구 아님)`)
  return <p className="pub-caption" translate="no">{parts.join(' · ')}</p>
}

export function AnglePanel({ q, kind }: { q: string; kind: string }) {
  const [run, setRun] = useState<PublicRun | null>(null)
  const [fail, setFail] = useState<Failure | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null }

  const start = useCallback(async () => {
    stop()
    setFail(null)
    setRun(null)
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, kind }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.run_id) { setFail({ error: json?.error ?? `HTTP ${res.status}`, angles: [] }); return }
      const first = json as PublicRun
      setRun(first)
      if (first.status !== 'queued' && first.status !== 'running') return
      const began = Date.now()
      timer.current = setInterval(async () => {
        if (Date.now() - began > POLL_CAP_MS) {
          stop()
          setFail((f) => f ?? { error: '5분이 지나도 끝나지 않았다', angles: [] })
          return
        }
        try {
          const r = await fetch(`${API}?run=${first.run_id}`, { cache: 'no-store' })
          const j = await r.json().catch(() => null)
          if (!r.ok || !j?.run_id) return // 한 번 못 읽은 것은 다음 폴링에서 다시(상한은 위 5분)
          setRun(j as PublicRun)
          if (j.status !== 'queued' && j.status !== 'running') stop()
        } catch { /* 네트워크 한 번 끊김 — 다음 폴링 */ }
      }, POLL_MS)
    } catch (e) {
      setFail({ error: e instanceof Error ? e.message : String(e), angles: [] })
    }
  }, [q, kind])

  useEffect(() => {
    // 외부 시스템(API)과 동기화: 마운트 시 한 번 시작하고, 언마운트 시 폴링을 끊는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start()
    return stop
  }, [start])

  const retry = <button type="button" className="pub-btn pub-btn--ghost pub-btn--sm" onClick={() => void start()}>다시 시도</button>
  const caption = <p className="pub-caption">{IDEA_VERDICT_CAPTION}</p>

  const failure = fail ?? (run && (run.status === 'failed' || run.status === 'limited') ? { error: run.error ?? '사유 미기록', angles: run.angles } : null)
  if (failure) {
    return (
      <div className="pub-angle-panel" aria-live="polite">
        <Panel tone="alert" title="확인 불가">
          <p className="pub-text">지금은 수치를 못 냈다. {failure.error}</p>
          {failure.angles.length > 0 ? <p className="pub-text">{IDEA_ANGLE_MAX}개 중 {failure.angles.length}개만 판정했다. 아래는 그 부분 결과다.</p> : null}
          <div className="pub-actions">{retry}</div>
        </Panel>
        {failure.angles.length > 0 ? <AngleList angles={failure.angles} /> : null}
        {run ? <Meta run={run} /> : null}
        {caption}
      </div>
    )
  }

  if (!run || run.status === 'queued' || run.status === 'running') {
    const partial = run?.angles ?? []
    return (
      <div className="pub-angle-panel" aria-live="polite" aria-busy="true">
        <p className="pub-caption">{partial.length > 0 ? `${IDEA_ANGLE_MAX}개 중 ${partial.length}개 완료 · ` : ''}앵글 {IDEA_ANGLE_MAX}개를 만들고 선례 근거로 판정하는 중(보통 1~2분)…</p>
        {partial.length > 0 ? <AngleList angles={partial} /> : null}
        {Array.from({ length: IDEA_ANGLE_MAX - partial.length }, (_, i) => <div key={i} className="pub-skel pub-angle-skel" aria-hidden="true" />)}
        {caption}
      </div>
    )
  }

  const n = summarizeVerdicts(run.angles)
  const of = (k: number) => `${k}/${n.total}`
  return (
    <div className="pub-angle-panel" aria-live="polite">
      <div className="pub-angle-stat">
        <StatRow>
          <Stat label={IDEA_VERDICT_LABELS.SUBSTANTIATED} value={of(n.SUBSTANTIATED)} caption="인용한 선례 문장이 있다" />
          <Stat label={IDEA_VERDICT_LABELS.EXPERIENTIAL} value={of(n.EXPERIENTIAL)} caption="결과를 주장하지 않는 사용감 서술" />
          <Stat label="선례 근거 없음" value={of(n.UNSUBSTANTIATED)} caption="재작성해도 근거를 못 찾은 문구" />
        </StatRow>
      </div>
      {n.total > 0 ? <AngleList angles={run.angles} /> : <p className="pub-text">앵글이 0개다. 다시 시도해 달라.</p>}
      <Meta run={run} />
      {caption}
    </div>
  )
}
