import { displayGradeLabel, factCheckLabel, type DisplayGradeInput } from '@/lib/cases/grade-display'
import { Chip } from './Chip'
import { IconChevronDown } from '../icons'

/**
 * 등급 2축 칩 — **인사이트**("내가 옮겨 쓸 게 있나") + **사실확인**("그 수치를 믿을 수 있나").
 * 한 무브가 인사이트 A · 사실확인 C 일 수 있으므로 둘을 항상 같이 낸다. 하나만 내면
 * 읽는 사람이 그걸 "그 케이스의 등급"으로 읽는다.
 *
 * 라벨 계산은 `lib/cases/grade-display.ts` 한 벌이다(미기재를 'D' 로 접지 않는 판정이
 * 거기 있다 — §7.1). 여기서 다시 판단하지 않는다.
 *
 * ★ 방향 아이콘(됐다/안 됐다)은 아직 안 붙인다. `grade-display.ts` 에 그 헬퍼가 들어오면
 *   여기 한 곳에 칩을 더한다 — 지금 없는 것을 아이콘으로 지어내지 않는다.
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

/**
 * 등급 범례 — "무엇이 A 인가"를 화면에서 답한다. 배지에 A/B/C/D 만 떠 있으면 읽는 사람은
 * 그게 학점인지 신선도인지 모른다.
 *
 * ⚠️ 산식을 여기 적지 않는다. 정본은 `docs/evidence-rules.md §3`(사실확인) ·
 *    `lib/cases/draft.ts gradeMove`(인사이트) 이고, 재채점으로 바뀐다 — 화면에 복사해 두면
 *    조용히 옛말이 된다. 여기 있는 것은 요약이다.
 * ⚠️ 등급 배지에는 판정 색(`--pub-verdict-*`)을 쓰지 않는다. 등급은 감성이 아니라 **분류**이고,
 *    색이 붙는 순간 A 가 "좋음", D 가 "나쁨"으로 읽힌다 — D 는 "아직 안 적혔다"이지 실패가 아니다.
 *    판정 3색은 결과 방향(됐다/안 됐다/갈렸다)에만 쓴다(Chip 주석).
 */
const INSIGHT: readonly [string, string][] = [
  ['A', '옮길 행동 + 그 전제 + 뒷받침 근거가 다 있다'],
  ['B', '옮길 행동은 구체적인데 전제(무엇이 있어야 되나)가 비어 있다'],
  ['C', '행동이 짧거나 다른 사례에도 붙는 일반론이다'],
  ['D', '옮길 행동이 안 적혀 있다 — 사실이 맞아도 가져갈 게 없다'],
]

const FACT: readonly [string, string][] = [
  ['A', '법정 공시이거나, 결제사 자동집계 공개 대시보드이거나, 당사자가 아닌 1차 출처이거나, 서로 다른 원 관측 2개 이상'],
  ['B', '당사자가 말한 1차 출처 + 다른 관측 하나'],
  ['C', '근거는 있으나 위에 못 미친다 — 인용할 때 출처를 본문에 밝혀야 한다'],
  ['D', '수치 자체가 없다. 서술만 있다'],
]

function Axis({ title, rows }: { title: string; rows: readonly [string, string][] }) {
  return (
    <div className="pub-deflist">
      <p className="pub-caption"><b>{title}</b></p>
      {rows.map(([g, text]) => (
        <p key={g} className="pub-caption"><b>{g}</b> — {text}</p>
      ))}
    </div>
  )
}

export function PubGradeLegend() {
  return (
    <details className="pub-details">
      <summary><IconChevronDown />등급이 무슨 뜻인가 (A~D 범례)</summary>
      <div className="pub-details-body">
        <p className="pub-caption">
          등급은 <b>두 축</b>이다. <b>인사이트 등급</b>은 &quot;내가 옮겨 쓸 게 있나&quot;,
          <b> 사실확인 등급</b>은 &quot;그 수치를 믿을 수 있나&quot;. 한 무브가 인사이트 A ·
          사실확인 C 일 수 있다.
        </p>
        <Axis title="인사이트 등급" rows={INSIGHT} />
        <Axis title="사실확인 등급" rows={FACT} />
        <p className="pub-caption">
          요약이다. 산식 정본은 <code className="pub-code">docs/evidence-rules.md §3</code>(사실확인) ·{' '}
          <code className="pub-code">lib/cases/draft.ts gradeMove</code>(인사이트) 이고, 재채점으로 바뀐다.
          등급 D 무브는 검색 결과에서 아예 빠진다.
        </p>
      </div>
    </details>
  )
}
