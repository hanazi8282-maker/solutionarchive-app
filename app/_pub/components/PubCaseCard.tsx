import Link from 'next/link'
import { clipTransferNote, detailTitle } from '@/lib/cases/detail'
import { READER_PROBLEM_LABEL } from '@/lib/cases/draft'
import { Chip } from './Chip'
import { PubBrandLogo } from './PubBrandLogo'
import { PubGradeBadge } from './PubGradeBadge'

/**
 * 케이스 카드 한 장 — §4 카드 그리드 스펙(reports/2026-09-23/ui-overhaul-reference-plan.md §4).
 * 구조는 `_ds/CaseCard` 와 같고 껍데기만 `_pub` 다(A2 이관: 두더지웍스 흔적 제거).
 *
 * 문제 유형 칩 + 병목 칩 · "문제 → 수" 제목 · **`transfer_note` 60자** · 메타 줄(브랜드명 ·
 * 등급 2축 · 무브 N · 승인일) · 우측 듀오톤 로고.
 *
 * 2줄 발췌 자리에 요약이 아니라 `transfer_note` 를 둔다. 카드에서 요약을 읽는 것은 "무슨
 * 이야기인가"를 아는 것뿐이고, 독자가 찾는 건 **가져갈 행동**이다(선정 1순위 축 = 이식성).
 *
 * ★ props 는 **케이스 행 + 대표 무브**만 받는다. 상세 로더 타입에 묶이면 그리드가 상세용
 *   조회를 통째로 해야 한다 — 필요한 필드만 구조적으로 받는다(행을 그대로 넘겨도 맞는 모양).
 */

export type PubCaseCardStudy = {
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

export type PubCaseCardMove = {
  transfer_note?: string | null
  evidence_grade?: string | null
  fact_check_grade?: string | null
} | null

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/** 승인일. `reviewed_at` 이 비면 **적립일이 아니라 "승인일 미기재"** 다 — 다른 날짜로 메우지 않는다. */
function approvedOn(study: PubCaseCardStudy): string {
  const at = study.reviewed_at
  return at ? `승인 ${KST.format(new Date(at))}` : '승인일 미기재'
}

export function PubCaseCard({ study, move, moveCount, reason }: {
  study: PubCaseCardStudy
  move: PubCaseCardMove
  /** 승인 무브 수. 0 이면 카드로 내지 않는 게 맞지만, 넘어오면 0 이라고 적는다. */
  moveCount: number
  /** 왜 이 카드가 여기 있나(관련 케이스 3장·근거 수). 없으면 줄 자체가 안 나온다. */
  reason?: string
}) {
  const problem = study.reader_problem
  const note = clipTransferNote(move?.transfer_note)

  return (
    <Link className="pub-card" href={`/library/${study.slug}`}>
      {/* [A] 카드 리듬: 듀오톤 썸네일(위) → 라벨 칩 → 제목 → 2줄 → 메타.
          v1 은 썸네일을 오른쪽에 붙였는데, 그러면 제목이 56px 만큼 좁아져 두 줄 자르기가
          거의 항상 걸린다. 위로 올리면 제목이 카드 폭을 다 쓴다. */}
      <PubBrandLogo study={study} bottleneck={study.bottleneck} size="cover" />

      <div className="pub-card-body">
        <div className="pub-chiprow">
          {problem ? <Chip>{READER_PROBLEM_LABEL[problem] ?? problem}</Chip> : null}
          {study.bottleneck ? <Chip>병목 {study.bottleneck}</Chip> : null}
        </div>

        <h3 className="pub-card-title">{detailTitle(study)}</h3>

        {/* 3상태(§7.1): 행동이 적혀 있으면 그것, 없으면 없다고 말한다. 요약으로 바꿔 채우지 않는다. */}
        <p className={note ? 'pub-card-note' : 'pub-card-note pub-card-note--empty'}>
          {note ? `내일 할 행동 · ${note}` : '가져갈 행동이 아직 안 적혀 있다 (인사이트 등급 D)'}
        </p>

        <div className="pub-card-meta">
          <span className="pub-card-brand">{study.brand_name ?? '브랜드명 미기재'}</span>
          <PubGradeBadge move={move} />
          <span>무브 {moveCount}</span>
          <span>{approvedOn(study)}</span>
        </div>

        {reason ? <p className="pub-caption">{reason}</p> : null}
      </div>
    </Link>
  )
}
