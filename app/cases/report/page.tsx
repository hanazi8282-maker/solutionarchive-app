import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { DEFAULT_SEARCH_KIND, QUERY_MAX, parseSearchQuery, searchMoves } from '@/lib/cases/search'
import { toTerms } from '@/lib/cases/advisor'
import { pairMoves, pairsForMoves } from '@/lib/cases/compare'
import { CaseMoveCards, FailedAngleCards } from '@/app/analyze/[id]/advisor-cards'
import { PairBlock } from '../pair-block'
import { Card } from '../../_ds/components/Card'
import { EmptyState } from '../../_ds/components/EmptyState'
import { FilterChip } from '../../_ds/components/FilterChip'
import { GradeLegend } from '../../_ds/components/GradeLegend'
import { ButtonLink } from '../../_ds/components/Button'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'

// 아이디어 한 줄 → 매칭 리포트 한 장 (경쟁사 기능 11a, 남헌 2026-09-24 승인).
//
// 새 매칭기가 아니다. /cases/search 의 searchMoves(무브 + 실패 앵글)와 compare.pairMoves(갈린 짝)를
// 그대로 돌려 **섹션 4개 한 장**으로 묶는다. 새 LLM 호출·마이그 없음.
//
// ★ 로그인 전용. lib/auth/policy.ts PUBLIC_PREFIXES 에 넣지 않는다(§10.2 예외 3) — 공개 입구는 11b(10/4 이후).
// ★ §7.1: 섹션마다 0건이면 "해당 없음"을 그대로 그리고, 조회 실패(not_run)는 "확인 불가"로 따로 말한다.
//   /cases/search 와 달리 **조건 없는 둘러보기를 하지 않는다** — 아이디어와 무관한 상위 N건을
//   리포트에 실으면 "내 아이디어에 매칭됐다"로 읽힌다.

export const dynamic = 'force-dynamic'
export const metadata = { title: '아이디어 매칭 리포트' }

const muted: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-muted)' }
/** 리포트는 한 장이다. 무브는 상위 N 만 싣고 나머지는 검색 화면으로 넘긴다(건수는 밝힌다). */
const REPORT_MOVES = 5

const HEADER = {
  title: '아이디어 매칭 리포트',
  subtitle: '아이디어 한 줄을 넣으면 승인된 케이스·실패 원장에서 닮은 것만 모아 한 장으로 보여준다. 없는 것은 "해당 없음"으로 적는다.',
} as const

/** 섹션 공통 상태 줄. matched 면 아무 말도 안 한다. not_run 과 no_match 를 같은 말로 쓰지 않는다. */
function SectionState({ status, reason, none }: { status: string; reason: string; none: string }) {
  if (status === 'matched') return null
  if (status === 'not_run') {
    return <p style={{ ...muted, color: 'var(--warning-fg)' }}>확인 불가 — {reason} (&quot;해당 없음&quot;이 아니다)</p>
  }
  return <EmptyState compact title={`해당 없음 — ${none}`} description={reason} />
}

export default async function IdeaReportPage({ searchParams }: {
  searchParams: Promise<{ q?: string; kind?: string }>
}) {
  const sp = await searchParams
  const { query, errors } = parseSearchQuery({ q: sp.q, kind: sp.kind })
  const terms = toTerms(query.q)

  const withParams = (path: string, kind: string) => {
    const p = new URLSearchParams()
    if (query.q) p.set('q', query.q)
    if (kind !== DEFAULT_SEARCH_KIND) p.set('kind', kind)
    const s = p.toString()
    return s ? `${path}?${s}` : path
  }
  const href = (kind: string) => withParams('/cases/report', kind)

  const form = (
    <form method="get" style={{ display: 'grid', gap: 10 }}>
      {query.kind !== DEFAULT_SEARCH_KIND && <input type="hidden" name="kind" value={query.kind} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input name="q" defaultValue={query.q ?? ''} maxLength={QUERY_MAX} required
          placeholder="내 아이디어 한 줄 (예: 프리랜서용 인보이스 자동 발송 SaaS)" aria-label="아이디어 한 줄"
          style={{ flex: '1 1 320px', height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-body)', fontSize: 13 }} />
        <button type="submit" style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--brand)', background: 'var(--brand)', color: 'var(--brand-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          리포트 만들기
        </button>
      </div>
    </form>
  )

  const chips = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <FilterChip href={href('saas')} active={query.kind === 'saas'}>SaaS만(기본)</FilterChip>
      <FilterChip href={href('all')} active={query.kind === 'all'}>소비재 포함</FilterChip>
    </div>
  )

  const shell = (body: ReactNode, meta?: ReactNode) => (
    <PageShell maxWidth={960}>
      <PageHeader {...HEADER} filters={chips} meta={meta} />
      <Card>{form}</Card>
      {errors.length > 0 && (
        <Notice tone="warning" title="질의를 그대로 쓰지 못했다">{errors.join(' / ')} — 그 조건은 빼고 만들었다.</Notice>
      )}
      {body}
    </PageShell>
  )

  // 입력 전. 둘러보기로 채우지 않는다(위 머리말).
  if (!query.q) {
    return shell(<EmptyState title="아이디어 한 줄을 넣으면 리포트가 나온다"
      description="닮은 성공 무브 · 실패 경고 앵글 · 갈린 짝 비교 · 다음 행동, 네 칸이다." />)
  }
  // 불용어·숫자만 들어와 낱말이 0개면 매칭을 돌릴 수 없다 — 0건이 아니라 못 돌린 것이다.
  // (여기서 막지 않으면 searchMoves 가 조건 없는 둘러보기로 떨어져 무관한 상위 20건을 낸다.)
  if (terms.length === 0) {
    return shell(<Notice tone="warning" title="확인 불가 — 매칭할 낱말을 뽑지 못했다">
      입력에서 두 글자 이상의 의미 있는 낱말이 나오지 않았다. 제품·대상·문제를 명사로 한 줄 적어 달라.
    </Notice>)
  }

  const sb = await createClient()
  if (!sb) {
    return shell(<Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">
      리포트를 만들지 못했다. 선례가 없다는 뜻이 아니다.
    </Notice>)
  }

  const corpora = await loadCaseCorpus(sb, 'cases/report')
  const result = searchMoves(query, corpora)
  const moveCards = result.moves.cards
  const pairs = pairsForMoves(pairMoves(corpora.studies, corpora.moves), moveCards, corpora.studies)

  const count = (s: string, n: number) => (s === 'not_run' ? '확인 불가' : s === 'matched' ? `${n}건` : '해당 없음')
  const meta = <>
    닮은 무브 {count(result.moves.status, moveCards.length)} · 실패 경고 {count(result.failed_angles.status, result.failed_angles.cards.length)}
    {' '}· 갈린 짝 {count(pairs.status, pairs.pairs.length)} · 매칭 낱말: {terms.join(', ')}
  </>

  return shell(<>
    <Card title="1. 닮은 성공 무브" subtitle={`승인된 케이스·무브만 · 등급 D 제외 · ${query.kind === 'saas' ? 'SaaS 케이스만(소비재는 숨김 — 위 "소비재 포함")' : '소비재 포함'}`}>
      <div style={{ display: 'grid', gap: 10 }}>
        <SectionState status={result.moves.status} reason={result.moves.reason} none={result.empty_state} />
        {moveCards.length > 0 && <>
          <CaseMoveCards cards={moveCards.slice(0, REPORT_MOVES)} />
          <GradeLegend />
          {moveCards.length > REPORT_MOVES && (
            <p style={muted}>상위 {REPORT_MOVES}건만 실었다 — 나머지 {moveCards.length - REPORT_MOVES}건은 <a href={withParams('/cases/search', query.kind)}>검색 화면</a>에서.</p>
          )}
        </>}
        {result.moves.status === 'no_match' && query.kind === 'saas' && (
          <div><ButtonLink href={href('all')} size="sm">소비재 포함해서 다시</ButtonLink></div>
        )}
      </div>
    </Card>

    <Card title="2. 실패 경고 앵글" subtitle="아이디어 낱말과 겹치는 실패 원장 행 — 같은 소구점으로 망한 적이 있나">
      <div style={{ display: 'grid', gap: 10 }}>
        <SectionState status={result.failed_angles.status} reason={result.failed_angles.reason} none="겹치는 실패 사례 0건" />
        <FailedAngleCards cards={result.failed_angles.cards} />
      </div>
    </Card>

    <Card title="3. 갈린 짝 비교" subtitle="1번에 매칭된 무브와 같은 병목·레버인데 한쪽은 됐고 한쪽은 안 된 승인 케이스 짝">
      <div style={{ display: 'grid', gap: 10 }}>
        <SectionState status={pairs.status} reason={pairs.reason} none="내 매칭과 겹치는 갈린 짝 0묶음" />
        {pairs.pairs.map((p) => <PairBlock key={p.key} p={p} />)}
      </div>
    </Card>

    {/* 아이디어 텍스트를 /analyze/new 쿼리스트링으로 넘기지 않는다(/cases/search 와 같은 이유 — 리퍼러·액세스 로그). */}
    <Card title="4. 다음 행동" subtitle="남의 사례는 방향이다. 내 시장에서도 그 문제가 아픈지는 내 경쟁사 리뷰가 답한다.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <ButtonLink href="/analyze/new" variant="primary">경쟁사 분석 시작</ButtonLink>
        <ButtonLink href="/analyze">PMF 진단 (분석 프로젝트에서)</ButtonLink>
        <p style={muted}>PMF 진단은 분석 프로젝트의 검토 화면에서 돈다 — 프로젝트가 없으면 경쟁사 분석부터.</p>
      </div>
    </Card>
  </>, meta)
}
