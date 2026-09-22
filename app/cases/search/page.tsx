import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { parseSearchQuery, searchMoves } from '@/lib/cases/search'
import { pairMoves, saasPairNotice, type MovePair } from '@/lib/cases/compare'
import { READER_PROBLEM_LABEL, READER_PROBLEMS } from '@/lib/cases/draft'
import { FACET_FIELDS } from '@/lib/analysis/facets'
import { CaseMoveCards, FailedAngleCards } from '@/app/analyze/[id]/advisor-cards'
import { Badge } from '../../_ds/components/Badge'
import { Card } from '../../_ds/components/Card'
import { EmptyState } from '../../_ds/components/EmptyState'
import { FilterChip } from '../../_ds/components/FilterChip'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'

// "내 문제 → 유사 케이스" 검색 화면.
//
// 입력 3칸(문제 유형 칩 · 병목 select · 자유 텍스트)은 **전부 선택**이고 하나만 있으면 된다.
// 서버 컴포넌트 + GET 폼이라 클라이언트 상태가 0이다 — 결과가 URL 에 있어 그대로 공유된다.
//
// ★ 3상태를 문장으로 가른다(§7.1): 0건은 "아직 없다", 못 찾은 것은 "검색을 못 했다".
//   빈 상태를 다른 말로 채우지 않는다 — 숫자는 DB 에서 센 것(승인 SaaS 케이스 수)만 쓴다.

export const dynamic = 'force-dynamic'
export const metadata = { title: '유사 케이스 검색' }

const muted: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-muted)' }
const BOTTLENECK_OPTIONS = FACET_FIELDS.find((f) => f.key === 'bottleneck')?.options ?? []

/**
 * 갈린 짝 한 묶음 — 같은 병목·레버인데 한쪽은 됐고 한쪽은 안 됐다.
 * 성공만 보여주면 "이 수를 쓰면 된다"로 읽힌다. 실패를 같은 칸에 붙여야 대조가 된다.
 */
function PairBlock({ p }: { p: MovePair }) {
  return (
    <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-muted)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge tone="neutral" size="sm">{p.bottleneck}</Badge>
        <Badge tone="neutral" size="sm">{p.lever}</Badge>
        {p.saas && <Badge tone="info" size="sm">SaaS 끼리</Badge>}
      </div>
      {p.positive.map((s) => (
        <p key={s.move.id} style={{ margin: 0, fontSize: 13 }}>
          <b>됐다 · {s.study.brand_name}</b> — {s.move.claim}
        </p>
      ))}
      {p.negative.map((s) => (
        <p key={s.move.id} style={{ margin: 0, fontSize: 13, color: 'var(--danger-fg)' }}>
          <b>안 됐다 · {s.study.brand_name}</b> — {s.move.claim}
        </p>
      ))}
    </div>
  )
}

const HEADER = {
  title: '내 문제 → 유사 케이스',
  subtitle: '지금 막힌 것과 같은 문제를 남들은 어떻게 풀었나. 승인된 케이스·무브만 나온다(등급 D 제외).',
} as const

/** 3상태 한 줄. matched 가 아닐 때만 문장을 낸다 — 0건과 "못 찾았다"를 절대 같은 말로 쓰지 않는다. */
function StatusLine({ status, reason, empty }: { status: string; reason: string; empty?: string }) {
  if (status === 'matched') return null
  if (status === 'not_run') {
    return <p style={{ ...muted, color: 'var(--warning-fg)' }}>검색을 못 했다 — {reason}</p>
  }
  return <p style={muted}>{empty ?? '조회는 정상인데 0건이다'} · {reason}</p>
}

export default async function CaseSearchPage({ searchParams }: {
  searchParams: Promise<{ bottleneck?: string; problem?: string; q?: string }>
}) {
  const sp = await searchParams
  const { query, errors } = parseSearchQuery(sp)
  // 칩 링크는 **다른 입력을 지우지 않는다.** 하나 고칠 때마다 나머지를 다시 쓰게 만들지 않는다.
  const href = (patch: { problem?: string | null }) => {
    const p = new URLSearchParams()
    const problem = patch.problem === undefined ? query.problem : patch.problem
    if (problem) p.set('problem', problem)
    if (query.bottleneck) p.set('bottleneck', query.bottleneck)
    if (query.q) p.set('q', query.q)
    const s = p.toString()
    return s ? `/cases/search?${s}` : '/cases/search'
  }

  const form = (
    <form method="get" style={{ display: 'grid', gap: 10 }}>
      {/* 칩으로 고른 문제 유형을 폼이 들고 간다 — 링크와 폼이 같은 URL 을 만든다. */}
      {query.problem && <input type="hidden" name="problem" value={query.problem} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select name="bottleneck" defaultValue={query.bottleneck ?? ''} aria-label="지금 막힌 곳 (병목)"
          style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-body)', fontSize: 13 }}>
          <option value="">병목 — 선택 안 함</option>
          {BOTTLENECK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input name="q" defaultValue={query.q ?? ''} placeholder="내 말로 한 줄 (예: 무료로는 쓰는데 결제를 안 한다)"
          aria-label="자유 텍스트 검색어" maxLength={200}
          style={{ flex: '1 1 260px', height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-body)', fontSize: 13 }} />
        <button type="submit" style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--brand)', background: 'var(--brand)', color: 'var(--brand-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          찾기
        </button>
      </div>
    </form>
  )

  const chips = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <FilterChip href={href({ problem: null })} active={!query.problem}>문제 유형 전체</FilterChip>
      {READER_PROBLEMS.map((code) => (
        <FilterChip key={code} href={href({ problem: code })} active={query.problem === code}>
          {READER_PROBLEM_LABEL[code] ?? code}
        </FilterChip>
      ))}
    </div>
  )

  const sb = await createClient()
  if (!sb) {
    return (
      <PageShell maxWidth={960}>
        <PageHeader {...HEADER} filters={chips} />
        <Card>{form}</Card>
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">
          검색을 돌리지 못했다. 선례가 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }

  const corpora = await loadCaseCorpus(sb, 'cases/search')
  const result = searchMoves(query, corpora)
  // 비교 섹션은 질의와 무관하게 **코퍼스 전체**를 본다 — 짝 자체가 몇 묶음 없어서
  // 검색 조건까지 걸면 항상 0 이 나오고, 그 0 이 "짝이 없다"로 읽힌다.
  const pairs = pairMoves(corpora.studies, corpora.moves)
  const saasPairs = pairs.pairs.filter((p) => p.saas)
  const otherPairs = pairs.pairs.filter((p) => !p.saas)

  return (
    <PageShell maxWidth={960}>
      <PageHeader {...HEADER} filters={chips} meta={<>{result.reason}</>} />
      <Card>{form}</Card>

      {errors.length > 0 && (
        <Notice tone="warning" title="질의를 그대로 쓰지 못했다">
          {errors.join(' / ')} — 그 조건은 빼고 검색했다.
        </Notice>
      )}

      <Card title="남들은 어떻게 풀었나 (선례 무브)" subtitle={`승인된 케이스·무브만 · 등급 D 제외 · 같은 종류(${result.kind === 'software' ? 'SaaS' : '실물'})가 먼저`}>
        <div style={{ display: 'grid', gap: 10 }}>
          <StatusLine status={result.moves.status} reason={result.moves.reason} empty={result.empty_state} />
          {result.moves.cards.length > 0
            ? <CaseMoveCards cards={result.moves.cards} />
            : result.moves.status === 'no_match' && (
              <EmptyState compact title={result.empty_state}
                description="조회는 정상이다. 지금 이 조건에 맞는 승인 무브가 없다는 뜻이고, 없는 것을 다른 사례로 채우지 않는다." />
            )}
        </div>
      </Card>

      <Card title="이 소구점으로 망한 적 있나 (실패 앵글)" subtitle="자유 텍스트와 겹치는 실패 원장 행">
        <div style={{ display: 'grid', gap: 10 }}>
          <StatusLine status={result.failed_angles.status} reason={result.failed_angles.reason}
            empty="겹치는 실패 사례가 0건이다" />
          <FailedAngleCards cards={result.failed_angles.cards} />
        </div>
      </Card>

      {/* 같은 수를 썼는데 갈린 사례. SaaS 짝이 0이면 없는 것을 지어내지 않고 그대로 말한다. */}
      <Card title="같은 수를 썼는데 갈린 사례" subtitle="같은 병목·레버인데 한쪽은 됐고 한쪽은 안 된 승인 케이스 짝 · 검색 조건과 무관하게 코퍼스 전체에서 셈">
        <div style={{ display: 'grid', gap: 10 }}>
          {pairs.status === 'not_run' && (
            <p style={{ ...muted, color: 'var(--warning-fg)' }}>검색을 못 했다 — {pairs.reason}</p>
          )}
          {pairs.status === 'no_match' && (
            <EmptyState compact title="갈린 짝이 아직 0묶음 (조회는 정상)"
              description="같은 병목·레버로 성공과 실패가 함께 승인된 케이스가 아직 없다. 없는 것을 비슷한 사례로 채우지 않는다." />
          )}
          {saasPairs.length > 0 && saasPairs.map((p) => <PairBlock key={p.key} p={p} />)}
          {pairs.status === 'matched' && saasPairs.length === 0 && (
            <>
              <p style={muted}>{saasPairNotice(otherPairs.length)}</p>
              <details className="dgy-details">
                <summary>소비재 짝 {otherPairs.length}묶음 펼치기 — 업종은 다르지만 갈린 이유는 읽을 만하다</summary>
                <div style={{ display: 'grid', gap: 10, padding: '8px 0 0' }}>
                  {otherPairs.map((p) => <PairBlock key={p.key} p={p} />)}
                </div>
              </details>
            </>
          )}
        </div>
      </Card>
    </PageShell>
  )
}
