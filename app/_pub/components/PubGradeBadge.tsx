import { displayGradeLabel, factCheckLabel, type DisplayGradeInput } from '@/lib/cases/grade-display'
import { Chip } from './Chip'
import { IconChevronRight } from '../icons'

/**
 * 등급 2축 칩(인사이트 = `displayGradeLabel` · 사실확인 = `factCheckLabel`)을 **항상 같이** 낸다.
 * DS v1 공개 화면은 `PubStamp` 를 쓰고, 이 칩은 `/library/saved` 카드에 남아 있다.
 * 방향 아이콘은 `grade-display.ts` 에 헬퍼가 들어오면 여기 한 곳에 더한다(없는 것을 지어내지 않는다).
 */
export function PubGradeBadge({ move }: {
  move: (DisplayGradeInput & { fact_check_grade?: string | null }) | null | undefined
}) {
  return (
    <>
      <Chip title="인사이트 등급 — 내가 옮겨 쓸 게 있나">인사이트 {displayGradeLabel(move)}</Chip>
      <Chip title="사실확인 등급 — 그 수치를 믿을 수 있나. 미기재는 D 가 아니다">사실확인 {factCheckLabel(move)}</Chip>
    </>
  )
}

/** 등급 한 줄 설명. 상세 머리의 판정 메모(PubStamp 옆)와 범례가 같은 문장을 쓴다. */
export const INSIGHT: readonly [string, string][] = [
  ['A', '옮길 행동 + 그 전제 + 뒷받침 근거가 다 있다'],
  ['B', '옮길 행동은 구체적인데 전제(무엇이 있어야 되나)가 비어 있다'],
  ['C', '행동이 짧거나 다른 사례에도 붙는 일반론이다'],
  ['D', '옮길 행동이 안 적혀 있다 — 사실이 맞아도 가져갈 게 없다'],
]

export const FACT: readonly [string, string][] = [
  ['A', '법정 공시이거나, 결제사 자동집계 공개 대시보드이거나, 당사자가 아닌 1차 출처이거나, 서로 다른 원 관측 2개 이상'],
  ['B', '당사자가 말한 1차 출처 + 다른 관측 하나'],
  ['C', '근거는 있으나 위에 못 미친다 — 인용할 때 출처를 본문에 밝혀야 한다'],
  ['D', '수치 자체가 없다. 서술만 있다'],
]

/** 공개 카피에 em 대시를 내지 않는다(DESIGN.md §5). 범례 문장(정본, PR #356 과 공유)은 그대로 두고 렌더에서만 푼다. */
const noDash = (s: string) => s.replace(/\s[—–]\s/g, '. ').replace(/ \+ /g, ', ')

export function gradeSentence(rows: readonly [string, string][], grade: string): string | null {
  const t = rows.find(([g]) => g === grade)?.[1]
  return t ? noDash(t) : null
}

function Axis({ title, rows }: { title: string; rows: readonly [string, string][] }) {
  return (
    <div>
      <p className="pub-caption"><b>{title}</b></p>
      <ul className="pub-legend">
        {rows.map(([g, text]) => <li key={g}><b>{g}</b><span>{noDash(text)}</span></li>)}
      </ul>
    </div>
  )
}

export function PubGradeLegend() {
  return (
    <details className="pub-fold">
      <summary><IconChevronRight />등급이 무슨 뜻인가 (A~D 범례)</summary>
      <div className="pub-fold-body">
        <p className="pub-caption">
          등급은 두 축이다. 인사이트 등급은 &ldquo;내가 옮겨 쓸 게 있나&rdquo;, 사실확인 등급은 &ldquo;그 수치를 믿을 수 있나&rdquo;.
          한 무브가 인사이트 A 에 사실확인 C 일 수 있다.
        </p>
        <div className="pub-legend-grid">
          <Axis title="인사이트 등급" rows={INSIGHT} />
          <Axis title="사실확인 등급" rows={FACT} />
        </div>
        <p className="pub-caption">
          요약이다. 등급 D 무브는 검색 결과에서 아예 빠진다. 산식 정본은 <code className="pub-code">docs/evidence-rules.md §3</code>(사실확인) ·{' '}
          <code className="pub-code">lib/cases/draft.ts gradeMove</code>(인사이트) 이고, 재채점으로 바뀐다.
        </p>
      </div>
    </details>
  )
}
