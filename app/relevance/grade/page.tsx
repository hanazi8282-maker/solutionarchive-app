import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { BATCH_SIZE, DEFAULT_QUOTA, STRATA, STRATUM_LABEL, kstDate, pickBatch, type Batch, type FeedbackRow } from '@/lib/relevance-feedback/sample'
import { feedbackTableState, loadAllVerdicts } from '@/lib/relevance-feedback/db'
import { ButtonLink } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { EmptyState } from '../../_ds/components/EmptyState'
import { ProgressBar } from '../../_ds/components/ProgressBar'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'
import { RelevanceCard, type Revealed } from './relevance-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: '관련성 기준 채점' }

// 읽기만 한다. 쓰기는 ../actions.ts 의 gradeRelevance 하나. 표본 선택은 lib/relevance-feedback/sample.ts(순수, 셀프테스트).

const HEADER = {
  title: `관련성 기준 채점 (하루 ${BATCH_SIZE}장)`,
  subtitle: '자동승인 통과·경계·불일치·둘 다 무관을 섞어 뽑았다. 모델 판정과 어느 묶음인지는 저장한 뒤에 보인다.',
} as const

function Shell({ children }: { children: ReactNode }) {
  return <div className="sa-v2"><PageShell maxWidth={960}>{children}</PageShell></div>
}

const KO: Record<string, string> = { relevant: '관련', irrelevant: '무관', unknown: '모름' }
const ko = (v: string | null | undefined) => (v ? KO[v] ?? v : '없음')
const inf = (v: boolean | null | undefined) => (v === true ? '정보있음' : v === false ? '정보없음' : '미기재')

export default async function RelevanceGradePage() {
  const header = <PageHeader {...HEADER} action={<ButtonLink href="/relevance/feedback">기준 피드백 요약</ButtonLink>} />
  const sb = await createClient()
  if (!sb) return <Shell>{header}<Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">채점할 카드가 없다는 뜻이 아니다.</Notice></Shell>

  const loaded = await loadAllVerdicts(sb)
  if ('error' in loaded) return <Shell>{header}<Notice tone="danger" title="확인 불가 — 판정 조회 실패">{loaded.error} · 채점할 카드가 없다는 뜻이 아니다.</Notice></Shell>

  const today = kstDate(new Date().toISOString()) ?? ''
  // 원문이 폐기된 행(raw_text 없음)은 채점할 게 없다 — 빼고 다시 뽑는다. 세 번이면 충분하다(빈 원문은 드물다).
  const exclude = new Set<string>()
  const texts = new Map<string, string>()
  let batch: Batch = pickBatch(loaded.rows, { today })
  for (let round = 0; round < 3; round++) {
    const ids = batch.items.map((i) => i.row.input_id).filter((id) => !texts.has(id))
    if (ids.length === 0) break
    const { data, error } = await sb.from('analysis_inputs').select('id, raw_text').in('id', ids)
    if (error) return <Shell>{header}<Notice tone="danger" title="확인 불가 — 원문 조회 실패">{error.message}</Notice></Shell>
    for (const r of data ?? []) if ((r.raw_text ?? '').trim()) texts.set(r.id, r.raw_text)
    const empty = ids.filter((id) => !texts.has(id))
    if (empty.length === 0) break
    empty.forEach((id) => exclude.add(id))
    batch = pickBatch(loaded.rows, { today, exclude })
  }
  const items = batch.items.filter((i) => texts.has(i.row.input_id))

  const projectIds = [...new Set(items.map((i) => i.row.project_id).filter((v): v is string => !!v))]
  const { data: projects } = projectIds.length
    ? await sb.from('analysis_projects').select('id, product_elevator_pitch').in('id', projectIds)
    : { data: [] as { id: string; product_elevator_pitch: string | null }[] }
  const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s)
  const projectOf = new Map((projects ?? []).map((p) => [p.id, clip(p.product_elevator_pitch ?? '(소개 없음)')]))

  const noteState = await feedbackTableState(sb)
  const done = items.filter((i) => i.row.human_verdict != null).length
  const a = batch.availability
  const unavailable = STRATA.filter((s) => !batch.strata[s].available)

  const reveal = (r: FeedbackRow, s: (typeof STRATA)[number]): Revealed => ({
    stratum: STRATUM_LABEL[s],
    human: `${ko(r.human_verdict)}${r.human_product_informative == null ? '' : ` · ${inf(r.human_product_informative)}`}`,
    lines: [`1차 ${ko(r.verdict)}`, `2차 ${ko(r.second_verdict)}`, ...(a.informative ? [`정보성 1차 ${inf(r.product_informative)} / 2차 ${inf(r.second_product_informative)}`] : [])],
  })

  return (
    <Shell>
      {header}
      <Card>
        <div className="v2-form">
          <b className="v2-lead">오늘 {done}/{items.length}장 · {today || '날짜 확인 불가'}</b>
          <ProgressBar value={done} max={Math.max(items.length, 1)} />
          <p className="v2-note">
            배분 기본 {STRATA.map((s) => `${s} ${DEFAULT_QUOTA[s]}`).join(' · ')} — 오늘 {STRATA.map((s) => `${s} ${batch.strata[s].picked}`).join(' · ')}
            {' '}(층이 모자라면 다른 층에서 채운다). 같은 날엔 같은 묶음이다(seed = KST 날짜).
          </p>
          {unavailable.length > 0 && (
            <p className="v2-note v2-flag">
              확인 불가 층: {unavailable.map((s) => STRATUM_LABEL[s]).join(', ')} —{' '}
              {a.second === null ? '판정 행이 0 건이라 컬럼 유무를 모른다' : a.second === false ? '2차 판정 컬럼(000027) 없음' : '정보성 컬럼(000031) 미적용'}. 0 건이 아니라 못 가른 것이다.
            </p>
          )}
          {noteState !== 'present' && (
            <p className="v2-note v2-flag">기준 보완 메모 — {noteState === 'missing' ? '미적용(마이그 20260930000032 전)' : '테이블 확인 불가'}. 판정 저장은 된다.</p>
          )}
        </div>
      </Card>

      {items.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact title="오늘 채점할 카드 0장 (조회는 정상)" description={`판정 ${loaded.rows.length}행 중 층에 들고 아직 안 본 것이 없다.`} />
        </Card>
      ) : (
        <div className="v2-stack-lg">
          {items.map(({ row, stratum }, i) => (
            <RelevanceCard
              key={row.input_id}
              n={i + 1}
              inputId={row.input_id}
              project={projectOf.get(row.project_id ?? '') ?? '(프로젝트 미상)'}
              text={texts.get(row.input_id) ?? ''}
              informativeReady={a.informative === true}
              noteState={noteState}
              revealed={row.human_verdict != null ? reveal(row, stratum) : null}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}
