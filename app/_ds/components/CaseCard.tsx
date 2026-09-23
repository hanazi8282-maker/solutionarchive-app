import Link from 'next/link'
import { Badge } from './Badge'
import { BrandLogo } from './BrandLogo'
import { clipTransferNote, detailTitle } from '@/lib/cases/detail'
import { displayGradeLabel, factCheckLabel } from '@/lib/cases/grade-display'
import { READER_PROBLEM_LABEL } from '@/lib/cases/draft'

/**
 * 케이스 카드 한 장 — §4 카드 그리드 스펙(EO Planet 구조 + Atria 썸네일).
 * `reports/2026-09-23/ui-overhaul-reference-plan.md §4`.
 *
 * 구조: 문제 유형 칩 + 병목 칩 · 제목 · **`transfer_note` 60자** · 메타 줄(브랜드명 ·
 * 등급 2축 · 무브 N · 승인일) · 우측 듀오톤 로고.
 *
 * EO Planet 의 "2줄 발췌" 자리에 요약이 아니라 `transfer_note` 를 둔다. 카드에서 요약을
 * 읽는 것은 "무슨 이야기인가"를 아는 것뿐이고, 이 아카이브에서 독자가 찾는 건
 * **가져갈 행동**이다(선정 1순위 축 = 독자 이식성).
 *
 * ★ props 는 **케이스 행 + 대표 무브**만 받는다. 트랙 3 `/library` 그리드가 이 컴포넌트를
 *   그대로 쓸 것이므로, 상세 페이지의 로더 타입에 묶이면 그리드가 상세용 조회를 통째로
 *   해야 한다. 그래서 필요한 필드만 구조적으로 받는다(행을 그대로 넘겨도 맞는 모양이다).
 */

export type CaseCardStudy = {
  slug: string
  brand_name?: string | null
  summary?: string | null
  bottleneck?: string | null
  reader_problem?: string | null
  reviewed_at?: string | null
  created_at?: string | null
  logo_url?: string | null
  brand_domain?: string | null
}

export type CaseCardMove = {
  transfer_note?: string | null
  evidence_grade?: string | null
  fact_check_grade?: string | null
} | null

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/** 승인일. `reviewed_at` 이 비면 **적립일이 아니라 "승인일 미기재"** 다 — 다른 날짜로 메우지 않는다. */
function approvedOn(study: CaseCardStudy): string {
  const at = study.reviewed_at
  return at ? `승인 ${KST.format(new Date(at))}` : '승인일 미기재'
}

export function CaseCard({ study, move, moveCount, reason }: {
  study: CaseCardStudy
  move: CaseCardMove
  /** 승인 무브 수. 0 이면 카드로 내지 않는 게 맞지만, 넘어오면 0 이라고 적는다. */
  moveCount: number
  /** 왜 이 카드가 여기 있나(관련 케이스 3장에서 쓴다). 없으면 줄이 안 나온다. */
  reason?: string
}) {
  const problem = study.reader_problem
  const note = clipTransferNote(move?.transfer_note)

  return (
    <Link
      href={`/library/${study.slug}`}
      className="dgy-tile sa-card"
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        padding: 16,
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {problem ? <Badge tone="violet" size="sm">{READER_PROBLEM_LABEL[problem] ?? problem}</Badge> : null}
          {study.bottleneck ? <Badge tone="neutral" size="sm">병목 {study.bottleneck}</Badge> : null}
        </div>

        <h3 style={{
          margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 'var(--fw-semibold)',
          lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)', overflowWrap: 'anywhere',
        }}>
          {detailTitle(study)}
        </h3>

        {/* 3상태(§7.1): 행동이 적혀 있으면 그것, 없으면 없다고 말한다. 요약으로 바꿔 채우지 않는다. */}
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: note ? 'var(--text-body)' : 'var(--text-muted)' }}>
          {note ? `내일 할 행동 · ${note}` : '가져갈 행동이 아직 안 적혀 있다 (인사이트 등급 D)'}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{study.brand_name ?? '브랜드명 미기재'}</span>
          <Badge tone="info" size="sm" title="인사이트 등급 — 내가 옮겨 쓸 게 있나">인사이트 {displayGradeLabel(move)}</Badge>
          <Badge tone="neutral" size="sm" title="사실확인 등급 — 그 수치를 믿을 수 있나. 미기재는 D 가 아니다">사실확인 {factCheckLabel(move)}</Badge>
          <span>무브 {moveCount}</span>
          <span>{approvedOn(study)}</span>
        </div>

        {reason ? (
          <p style={{ margin: 0, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{reason}</p>
        ) : null}
      </div>

      <BrandLogo study={study} bottleneck={study.bottleneck} size={56} />
    </Link>
  )
}
