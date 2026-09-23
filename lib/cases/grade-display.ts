// 화면·랭킹에 내보내는 등급 한 줄 — **여기가 그 한 곳이다.**
//
// 왜 함수 하나를 위해 파일을 두나: 등급축이 바뀔 예정이었고(PMF 축), 고칠 자리가 여러
// 화면에 흩어져 있으면 일부만 바뀐 상태로 굳는다(이 리포에서 "등급"이 두 축으로 갈린 뒤
// 셀러 화면에 한 축만 나가고 있던 게 정확히 그 꼴이었다 — advisor-cards.tsx 주석).
// 2026-09-23 에 그 전환이 실제로 일어났고, 바뀐 것은 아래 `displayGrade` 한 줄이다.
//
// ⚠️ 이 파일은 등급을 **계산하지 않는다.** 산식 정본은 `lib/cases/draft.ts` 의
//    `pmfGrade`(PMF 축) / `gradeMove`(인사이트) / `factCheckGrade`(사실확인)이고, 저장값을
//    바꾸는 것은 사람이 CLI regrade 로 한다(CLAUDE.md §10.1). 여기는 "저장된 것 중 무엇을
//    보여줄지"만 고른다.

/** 등급 1자. 조회에서 컬럼을 빼면 `undefined` 로 온다 — 그건 "D" 가 아니라 미기재다. */
export type DisplayGradeInput = {
  evidence_grade?: string | null
  /**
   * PMF 등급축(`case_moves.pmf_grade`, 마이그 20260930000004). 있으면 이게 표시 축이다.
   * 컬럼이 아직 적용되지 않았거나 재채점 전이면 `null`/`undefined` 이고, 그때는
   * `evidence_grade` 로 폴백한다 — 화면이 빈칸이 되지 않게.
   */
  pmf_grade?: string | null
  /** 사람이 S·이식성을 확정하지 않은 잠정 등급인가(`case_moves.pmf_provisional`). */
  pmf_provisional?: boolean | null
  /** 성과 방향. 실패(negative) 무브도 A 가 될 수 있으므로 등급과 함께 보여야 한다. */
  outcome_direction?: string | null
}

/**
 * 화면용 등급 — **PMF 축이 먼저다**(남헌 2026-09-23 결정).
 *
 *   `pmf_grade ?? evidence_grade`
 *
 * 이 한 줄이 전 화면(상세·카드·검색·랭킹)에 동시에 먹는 것이 이 파일의 존재 이유다.
 *
 * `null` 은 **미기재**다. 'D'(결과 불분명)와 섞지 않는다(§7.1) — 섞으면 "조회에서
 * 컬럼을 빼먹었다"가 "가져갈 게 없는 무브"로 읽힌다.
 */
export function displayGrade(move: DisplayGradeInput | null | undefined): string | null {
  const g = move?.pmf_grade ?? move?.evidence_grade
  return typeof g === 'string' && g.trim() ? g.trim() : null
}

/** 배지에 그대로 쓰는 문자열. 미기재를 'D' 로 접지 않는다. */
export function displayGradeLabel(move: DisplayGradeInput | null | undefined): string {
  return displayGrade(move) ?? '미기재'
}

/** 사실확인 등급 — 같은 규칙으로 미기재를 가른다(등급 D 와 다른 상태다). */
export function factCheckLabel(move: { fact_check_grade?: string | null } | null | undefined): string {
  const g = move?.fact_check_grade
  return typeof g === 'string' && g.trim() ? g.trim() : '미기재'
}

/**
 * 성과 방향 아이콘. PMF 축에서는 **실패 케이스도 A** 다(반증 강도가 신호 강도와 같은 값을
 * 가진다 — 설계 §8-3, 남헌 2026-09-23). 그래서 등급만 보면 "블루 에이프런 A" 가 성공
 * 사례처럼 읽힌다. 배지 옆에 이 한 글자를 같이 붙여 가른다. 등급 축을 셋으로 늘리는 것보다 싸다.
 *
 * 미기재는 빈 문자열이다 — '↑' 로 접지 않는다(§7.1).
 */
export function directionMark(move: { outcome_direction?: string | null } | null | undefined): string {
  switch (move?.outcome_direction) {
    case 'positive': return '↑'
    case 'negative': return '↓'
    case 'mixed': return '↕'
    default: return ''
  }
}

/** 잠정 표시 — 사람이 S·이식성을 확정하지 않은 등급. 확정과 같게 보이면 §7.1 위반이다. */
export function isProvisionalGrade(move: DisplayGradeInput | null | undefined): boolean {
  return move?.pmf_provisional === true && typeof move?.pmf_grade === 'string'
}

/**
 * 등급 순위. A 가 가장 세다. D 는 결과가 불분명한 무브라 매칭 결과에서 뺀다.
 *
 * ★ 정의가 여기 있는 이유: 랭킹이 보는 등급과 화면이 보여 주는 등급이 **같아야** 한다.
 *   match.ts 에 두고 각 호출부가 `GRADE_RANK[m.evidence_grade]` 를 쓰던 동안, 축이 바뀌면
 *   화면은 PMF 등급인데 순위는 옛 축이라는 상태가 될 수 있었다. `gradeRankOf` 하나만
 *   쓰면 그게 구조적으로 불가능해진다. (match.ts 는 이 상수를 재수출한다)
 */
export const GRADE_RANK: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 }

/**
 * 무브의 표시 등급(= PMF 우선)으로 계산한 랭크. 미기재는 0 이 아니라 `null` 이 맞지만,
 * 호출부가 전부 "0 이하면 뺀다" 로 쓰므로 `?? 0` 을 각자 붙이게 둔다 — 여기서 0 으로
 * 접으면 "미기재"와 "등급 D" 가 섞인다.
 */
export function gradeRankOf(move: DisplayGradeInput | null | undefined): number | undefined {
  const g = displayGrade(move)
  return g === null ? undefined : GRADE_RANK[g]
}
