import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  GRADE_PAGE_SIZE, approvedMovesByBottleneck, countReviewedToday, gradeQueuePage, kstDate, sortGradeQueue,
} from '@/lib/cases/grade-queue'
import { Badge } from '../../_ds/components/Badge'
import { ButtonLink } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { EmptyState } from '../../_ds/components/EmptyState'
import { FilterChip } from '../../_ds/components/FilterChip'
import { ProgressBar } from '../../_ds/components/ProgressBar'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'
import { GradeCard, type GradeCaseData, type GradeEvidence, type GradeMove } from './grade-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: '카드 채점' }

// 읽기만 한다. 쓰기는 ../actions.ts 의 gradeCase(사람이 누르는 서버 액션) 하나다.
// 줄 세우기·10장 자르기는 lib/cases/grade-queue.ts(순수 모듈, 셀프테스트 있음)가 한다 —
// 정렬이 틀려도 화면은 멀쩡해 보이기 때문에 여기 인라인으로 두지 않았다.

type MoveRow = GradeMove & { created_at: string }
type CaseRow = GradeCaseData & { created_at: string; reviewed_at: string | null; case_moves: MoveRow[] | null; case_evidence: GradeEvidence[] | null }

const HEADER = {
  title: '카드 채점 (하루 10장)',
  subtitle: '카드 1장 = 케이스 1건. 무브마다 체크 1 + 이식성 1, 카드마다 제출 1회. 체크 안 한 무브는 draft 그대로다 — 반려는 전체 검수 화면에서 사유와 함께 한다.',
} as const

/** M2 v2 스코프 — 조기 반환 2곳과 정상 화면이 같은 껍데기를 쓴다. */
function Shell({ children }: { children: ReactNode }) {
  return <div className="sa-v2"><PageShell maxWidth={960}>{children}</PageShell></div>
}

export default async function CasesGradePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams
  const requested = Number(sp.page ?? '1')
  const sb = await createClient()
  const header = <PageHeader {...HEADER} action={<ButtonLink href="/cases">전체 검수 화면</ButtonLink>} />

  if (!sb) {
    return (
      <Shell>
        {header}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">큐를 조회하지 못했다. 채점할 카드가 없다는 뜻이 아니다.</Notice>
      </Shell>
    )
  }

  const res = await sb
    .from('case_studies')
    // 배경 6칸(market·geo·기간·결과·구매자·가격대)과 근거 snippet 은 카드의 "왜 택했나"를 받치는 자리다.
    // 전후 수치는 case_moves(*) 에 이미 들어온다. 새 컬럼을 추가하지 않았다 — 전부 20260906000001 에 있다.
    .select('id, slug, brand_name, business_model, bottleneck, reader_problem, summary, review_status, reviewed_at, created_at, market, geo, period_start, period_end, outcome_status, buyer_type, price_band, case_moves(*), case_evidence(id, url, domain, case_move_id, snippet)')

  if (res.error || !res.data) {
    return (
      <Shell>
        {header}
        <Notice tone="danger" title="확인 불가 — 케이스 조회 실패">
          {res.error?.message ?? '응답에 행이 없다'} · 채점할 카드가 없다는 뜻이 아니다.
        </Notice>
      </Shell>
    )
  }

  const all = (res.data as CaseRow[]).map((c) => ({
    ...c,
    moves: [...(c.case_moves ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((m) => ({ ...m, evidence: (c.case_evidence ?? []).filter((e) => e.case_move_id === m.id) })),
  }))

  const today = kstDate(new Date().toISOString()) ?? ''
  const doneToday = countReviewedToday(all, today)
  const queue = sortGradeQueue(all.filter((c) => c.review_status === 'draft'), approvedMovesByBottleneck(all))
  const { items, page, pages, total } = gradeQueuePage(queue, Number.isFinite(requested) ? requested : 1)

  return (
    <Shell>
      <PageHeader
        {...HEADER}
        action={<ButtonLink href="/cases">전체 검수 화면</ButtonLink>}
        meta={<>검수 대기 케이스 {total}건 · {page}/{pages} 페이지 (한 페이지 {GRADE_PAGE_SIZE}장) · SAAS 먼저 → 승인 사례가 적은 병목 먼저 → 오래된 것 먼저</>}
      />

      {/* 오늘 몇 장 했나. reviewed_at 이 오늘(KST)인 케이스를 센다 — 이 화면 밖(CLI·전체 검수 화면)에서 결정한 것도 들어온다. */}
      <Card>
        <div className="v2-form">
          <div className="v2-actions">
            <b className="v2-lead">오늘 {doneToday}/{GRADE_PAGE_SIZE}장</b>
            <Badge tone={doneToday >= GRADE_PAGE_SIZE ? 'success' : 'neutral'} size="sm">{today || '날짜 확인 불가'}</Badge>
          </div>
          <ProgressBar value={doneToday} max={GRADE_PAGE_SIZE} />
          <p className="v2-note">
            하루 30분 = 카드 10장(2026-09-23 결정). 결정된 케이스(승인·반려)를 KST 날짜로 센다.
          </p>
        </div>
      </Card>

      {items.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            compact
            title={total === 0 ? '검수 대기 카드 0장 (조회는 정상)' : `${page}페이지에는 카드가 없다 (조회는 정상)`}
            description={total === 0 ? `전체 케이스 ${all.length}건이 모두 결정됐다.` : `대기 ${total}건은 1~${pages}페이지에 있다.`}
          />
        </Card>
      ) : (
        <div className="v2-stack-lg">
          {items.map((c, i) => (
            <GradeCard key={c.id} c={c} nextAnchor={items[i + 1] ? `grade-${items[i + 1].slug}` : null} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="페이지" className="v2-chiprow">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <FilterChip key={p} href={p === 1 ? '/cases/grade' : `/cases/grade?page=${p}`} active={p === page}>
              {p}페이지
            </FilterChip>
          ))}
        </nav>
      )}
    </Shell>
  )
}
