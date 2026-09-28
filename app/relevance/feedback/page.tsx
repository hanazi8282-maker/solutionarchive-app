import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  STRATA, STRATUM_LABEL, columnAvailability, dailyTrend, disagreements, kstDate, stratumStats, type Stratum, type StratumStats,
} from '@/lib/relevance-feedback/sample'
import { KILL } from '@/lib/analysis/auto-approval'
import { FEEDBACK_MIGRATION, isMissingRelation, loadAllVerdicts } from '@/lib/relevance-feedback/db'
import { ButtonLink } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { FilterChip } from '../../_ds/components/FilterChip'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../../_ds/components/Shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: '관련성 기준 피드백' }

// 읽기 전용. 숫자는 review_relevance_verdicts 의 human_verdict 에서 바로 센다 — 킬스위치 감사와 같은 데이터라
// 따로 적립하지 않는다. 메모만 relevance_criteria_feedback(000032)에서 온다.

const DAYS = [7, 14, 30, 90] as const
const PER_STRATUM = 10

function Shell({ children }: { children: ReactNode }) {
  return <div className="sa-v2"><PageShell maxWidth={1040}>{children}</PageShell></div>
}

const KO: Record<string, string> = { relevant: '관련', irrelevant: '무관', unknown: '모름' }
const ko = (v: string | null | undefined) => (v ? KO[v] ?? v : '없음')
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** 층별 한 칸. 무엇이 "기준이 잘 돈다"인지가 층마다 다르다 — caption 에 분모와 뜻을 적는다. */
function tile(s: Stratum, st: StratumStats) {
  if (!st.available) return <StatTile key={s} label={STRATUM_LABEL[s]} value="확인 불가" caption="이 층을 가를 컬럼이 없다(0 건이 아니다)" tone="warning" />
  const n = st.graded
  const unk = st.humanUnknown ? ` · 모름 ${st.humanUnknown}` : ''
  const infCap = st.informativeGraded ? ` · 사람 정보있음 ${st.informativeTrue}/${st.informativeGraded}` : ''
  if (s === 'A') return <StatTile key={s} label="A 자동승인 정밀도" value={pct(st.agree ?? 0, n)} caption={`사람도 관련 ${st.agree}/${n}${unk}${infCap}`} tone={n && (st.rate ?? 1) < 1 - KILL.p0 ? 'danger' : undefined} />
  if (s === 'B') return <StatTile key={s} label="B 경계 — 사람도 관련" value={pct(st.agree ?? 0, n)} caption={`${st.agree}/${n}${unk}${infCap} (정보있음이 많으면 정보성 기준이 빡빡하다)`} />
  if (s === 'C') return <StatTile key={s} label="C 불일치 — 1차 편 / 2차 편" value={n ? `${st.firstRight} / ${st.secondRight}` : '—'} caption={`채점 ${n}${unk} — 한쪽으로 쏠리면 다른 쪽 기준을 고친다`} />
  return <StatTile key={s} label="D 놓친 비율(사람은 관련)" value={pct(n - (st.agree ?? 0), n)} caption={`${n - (st.agree ?? 0)}/${n}${unk}`} tone={n && n - (st.agree ?? 0) > 0 ? 'warning' : undefined} />
}

export default async function RelevanceFeedbackPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams
  const days = DAYS.find((d) => String(d) === sp.days) ?? 14
  const header = <PageHeader title="관련성 기준 피드백" subtitle="층별로 사람과 모델이 얼마나 맞았나 — 기준이 제대로 도는지, 무엇을 보완할지." action={<ButtonLink href="/relevance/grade">오늘 채점하기</ButtonLink>} />

  const sb = await createClient()
  if (!sb) return <Shell>{header}<Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">숫자를 세지 못했다.</Notice></Shell>
  const loaded = await loadAllVerdicts(sb)
  if ('error' in loaded) return <Shell>{header}<Notice tone="danger" title="확인 불가 — 판정 조회 실패">{loaded.error}</Notice></Shell>

  const avail = columnAvailability(loaded.rows)
  const graded = loaded.rows.filter((r) => r.human_verdict != null)
  const stats = stratumStats(graded, avail)
  const today = kstDate(new Date().toISOString()) ?? ''
  const trend = today ? dailyTrend(graded, { today, days }, avail) : []

  const dis = disagreements(graded, avail)
  const shown = STRATA.flatMap((s) => dis.filter((d) => d.stratum === s).slice(0, PER_STRATUM))
  const ids = shown.map((d) => d.row.input_id)
  const texts = new Map<string, string>()
  if (ids.length) {
    const { data } = await sb.from('analysis_inputs').select('id, raw_text').in('id', ids)
    for (const r of data ?? []) texts.set(r.id, r.raw_text ?? '')
  }

  const memo = await sb.from('relevance_criteria_feedback').select('id, input_id, stratum, human_verdict, note, created_by, created_at').order('created_at', { ascending: false }).limit(50)
  const memoState = memo.error ? (isMissingRelation(memo.error) ? 'missing' : 'unknown') : 'present'
  const memos = (memo.data ?? []) as { id: string; input_id: string | null; stratum: string | null; human_verdict: string | null; note: string; created_by: string | null; created_at: string }[]
  const memoByInput = new Map(memos.filter((m) => m.input_id).map((m) => [m.input_id as string, m.note]))

  return (
    <Shell>
      {header}
      <Card title="층별 일치율 (전체 기간)" subtitle={`사람 채점 ${graded.length}건 기준. 층은 지금의 1차·2차 판정으로 다시 가른다. 사람 '모름'은 분모에서 뺀다.`}>
        <StatGrid min={200}>{STRATA.map((s) => tile(s, stats[s]))}</StatGrid>
        {avail.informative !== true && (
          <p className="v2-note v2-flag v2-mt-sm">A·B 층은 정보성 컬럼(000031)이 {avail.informative === null ? '있는지 모른다(행 0)' : '없다'} — 두 층은 확인 불가다.</p>
        )}
      </Card>

      <Card title={`최근 ${days}일 추이`} subtitle="날짜별(KST) 채점 수와 일치. A 는 사람도 관련, D 는 사람도 무관, C 는 1차 편 수.">
        <nav aria-label="기간" className="v2-chiprow">
          {DAYS.map((d) => <FilterChip key={d} href={`/relevance/feedback?days=${d}`} active={d === days}>{d}일</FilterChip>)}
        </nav>
        <div className="v2-table-wrap v2-mt-sm">
          <table className="v2-table">
            <thead><tr><th>날짜</th>{STRATA.map((s) => <th key={s}>{s} 일치/채점</th>)}</tr></thead>
            <tbody>
              {trend.filter((t) => STRATA.some((s) => t.strata[s].graded > 0)).map((t) => (
                <tr key={t.date}>
                  <td>{t.date}</td>
                  {STRATA.map((s) => <td key={s}>{t.strata[s].graded ? `${t.strata[s].agree}/${t.strata[s].graded}` : '·'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trend.every((t) => STRATA.every((s) => t.strata[s].graded === 0)) && <p className="v2-note">최근 {days}일 채점 0건 — 기준을 감시하지 않고 있다는 뜻이다.</p>}
      </Card>

      <Card title="층별 어긋난 사례" subtitle={`사람이 층의 기대와 다르게 본 것(C 는 채점된 전부). 층마다 최근 ${PER_STRATUM}건.`}>
        {shown.length === 0 ? <p className="v2-note">어긋난 사례 0건 (조회는 정상).</p> : (
          <ul className="v2-bullets v2-stack-tight">
            {shown.map(({ row, stratum }) => (
              <li key={row.input_id} className="v2-wrap">
                <b>{stratum}</b> · 사람 {ko(row.human_verdict)} · 1차 {ko(row.verdict)} · 2차 {ko(row.second_verdict)} · {kstDate(row.human_graded_at) ?? '시각 미기재'}
                {' — '}{texts.has(row.input_id) ? clip(texts.get(row.input_id) || '(원문 없음)', 200) : '(원문 조회 실패)'}
                {memoByInput.has(row.input_id) && <><br /><span className="v2-muted">메모: {memoByInput.get(row.input_id)}</span></>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="기준 보완 메모" subtitle="채점 카드에서 적은 것, 최근 50건.">
        {memoState === 'missing' ? <Notice tone="warning" title="미적용">메모 테이블이 없다 — 마이그 {FEEDBACK_MIGRATION} 미적용.</Notice>
          : memoState === 'unknown' ? <Notice tone="danger" title="확인 불가">메모 조회 실패: {memo.error?.message}</Notice>
          : memos.length === 0 ? <p className="v2-note">메모 0건 (조회는 정상).</p>
          : (
            <ul className="v2-bullets v2-stack-tight">
              {memos.map((m) => (
                <li key={m.id} className="v2-wrap">
                  <b>{m.stratum ?? '층 없음'}</b> · 사람 {ko(m.human_verdict)} · {kstDate(m.created_at)} · {m.created_by ?? '?'} — {m.note}
                </li>
              ))}
            </ul>
          )}
      </Card>
    </Shell>
  )
}
