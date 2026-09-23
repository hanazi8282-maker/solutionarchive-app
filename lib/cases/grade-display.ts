// 화면에 내보내는 인사이트 등급 한 줄 — **여기가 그 한 곳이다.**
//
// 왜 함수 하나를 위해 파일을 두나: PMF 등급축(`pmf_grade`)이 논의 중이다. 그게 승인되면
// 화면은 `pmf_grade ?? evidence_grade` 를 보여야 하고, 그때 고칠 자리가 여러 화면에
// 흩어져 있으면 일부만 바뀐 상태로 굳는다(이 리포에서 "등급"이 이미 두 축으로 갈린 뒤
// 셀러 화면에 한 축만 나가고 있던 게 정확히 그 꼴이었다 — advisor-cards.tsx 주석).
//
// ⚠️ 이 함수는 등급을 **계산하지 않는다.** 산식 정본은 `lib/cases/draft.ts gradeMove`
//    (인사이트) / `factCheckGrade`(사실확인)이고, 저장값을 바꾸는 것은 사람이 CLI regrade 로
//    한다(CLAUDE.md §10.1). 여기는 "저장된 것 중 무엇을 보여줄지"만 고른다.

/** 등급 1자. 조회에서 컬럼을 빼면 `undefined` 로 온다 — 그건 "D" 가 아니라 미기재다. */
export type DisplayGradeInput = {
  evidence_grade?: string | null
  /**
   * PMF 등급축. **아직 DB 에 없다**(2026-09-23 실측: 리포 전체에 `pmf_grade` 를 쓰는
   * 코드·마이그레이션이 0건). 승인되면 아래 한 줄의 주석을 풀면 된다.
   */
  pmf_grade?: string | null
}

/**
 * 화면용 인사이트 등급. 지금은 `evidence_grade` 를 그대로 돌려준다.
 *
 * pmf_grade 축이 승인되면 이 한 줄을 `move.pmf_grade ?? move.evidence_grade ?? null` 로
 * 바꾼다 — 그 한 줄이 전 화면(상세·카드·검색)에 동시에 먹는 것이 이 파일의 존재 이유다.
 *
 * `null` 은 **미기재**다. 'D'(수치 없음·옮길 행동 없음)와 섞지 않는다(§7.1) —
 * 섞으면 "조회에서 컬럼을 빼먹었다"가 "가져갈 게 없는 무브"로 읽힌다.
 */
export function displayGrade(move: DisplayGradeInput | null | undefined): string | null {
  const g = move?.evidence_grade
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
