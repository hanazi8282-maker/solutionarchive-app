import Link from 'next/link'
import { clipTransferNote } from '@/lib/cases/detail'
import { caseExposure } from '@/lib/cases/case-auto-approval'
import { PubBrandLogo } from './PubBrandLogo'
import { PubStamp } from './PubStamp'
import type { PubCaseCardMove, PubCaseCardStudy } from './PubCaseCard'

/**
 * 색인 줄 — 라이브러리 목록·관련 케이스·랜딩 최신 케이스가 같은 줄을 쓴다
 * (남헌 09-29 결정 b: 카드 격자 대신 색인 줄). 왼쪽 44px 플레이트, 브랜드명, 요약 2줄,
 * 내일 할 행동 2줄, 오른쪽에 작은 스탬프와 무브 수·승인일.
 * props 는 카드와 같은 **행 조각**이다 — 데이터 조회는 부모가 한다.
 */
const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

function approvedOn(study: PubCaseCardStudy): string {
  if (caseExposure(study) === 'verifying') {
    return study.auto_approved_at ? `자동 승인 ${KST.format(new Date(study.auto_approved_at))}, 검수 전` : '자동 승인, 검수 전'
  }
  return study.reviewed_at ? `승인 ${KST.format(new Date(study.reviewed_at))}` : '승인일 미기재'
}

export function PubIndexRow({ study, move, moveCount, reason }: {
  study: PubCaseCardStudy
  move: PubCaseCardMove
  moveCount: number
  reason?: string
}) {
  const note = clipTransferNote(move?.transfer_note, 120)
  const summary = (study.summary ?? '').trim()
  return (
    <li>
      <Link className="pub-index-row" href={`/library/${study.slug}`}>
        <PubBrandLogo study={study} size="sm" />
        <span className="pub-index-main">
          <span className="pub-index-t">{study.brand_name ?? '브랜드명 미기재'}</span>
          {summary ? <span className="pub-index-s">{summary}</span> : null}
          <span className="pub-index-act">
            {note ? <><b>내일 할 행동</b> {note}</> : '가져갈 행동이 아직 안 적혀 있다 (인사이트 등급 D)'}
          </span>
        </span>
        <span className="pub-index-side">
          <PubStamp move={move} size="sm" />
          <span>무브 {moveCount}개 · {approvedOn(study)}{reason ? ` · ${reason}` : ''}</span>
        </span>
      </Link>
    </li>
  )
}
