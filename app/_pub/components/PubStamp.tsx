import { displayGradeLabel, factCheckLabel, type DisplayGradeInput } from '@/lib/cases/grade-display'

/**
 * 2축 등급 스탬프 (DESIGN.md §3, 남헌 09-29 결정 a: 이중선 도장 유지).
 * 인사이트(내가 옮겨 쓸 게 있나) · 사실확인(그 수치를 믿을 수 있나)을 **항상 같이** 낸다.
 * 등급 값은 `grade-display.ts` 가 정한다 — 여기서 계산하지 않는다(미기재는 D 가 아니다).
 * 판정색은 글자 밑 선에만: A·B 긍정 · C 혼합 · D 부정 · 미기재 없음(회색).
 */
type StampMove = (DisplayGradeInput & { fact_check_grade?: string | null }) | null | undefined

export function verdictOf(grade: string): 'pos' | 'mix' | 'neg' | 'none' {
  if (grade === 'A' || grade === 'B') return 'pos'
  if (grade === 'C') return 'mix'
  if (grade === 'D') return 'neg'
  return 'none'
}

function Axis({ grade, label }: { grade: string; label: string }) {
  const v = verdictOf(grade)
  return (
    <span>
      <span className={v === 'none' ? 'pub-stamp-g pub-stamp-g--none' : 'pub-stamp-g'} data-v={v}>{grade}</span>
      <span className="pub-stamp-l">{label}</span>
    </span>
  )
}

export function PubStamp({ move, size = 'md' }: { move: StampMove; size?: 'md' | 'sm' }) {
  const insight = displayGradeLabel(move)
  const fact = factCheckLabel(move)
  return (
    <span
      className={size === 'sm' ? 'pub-stamp pub-stamp--sm' : 'pub-stamp'}
      role="img"
      aria-label={`인사이트 등급 ${insight}, 사실확인 등급 ${fact}`}
    >
      <Axis grade={insight} label="인사이트" />
      <Axis grade={fact} label="사실확인" />
    </span>
  )
}
