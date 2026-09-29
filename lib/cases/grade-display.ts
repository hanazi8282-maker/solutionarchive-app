// 화면·랭킹에 내보내는 등급 한 줄 — **여기가 그 한 곳이다.**
//
// 왜 함수 하나를 위해 파일을 두나: 등급축이 바뀔 예정이었고(PMF 축), 고칠 자리가 여러
// 화면에 흩어져 있으면 일부만 바뀐 상태로 굳는다(이 리포에서 "등급"이 두 축으로 갈린 뒤
// 셀러 화면에 한 축만 나가고 있던 게 정확히 그 꼴이었다 — advisor-cards.tsx 주석).
// 2026-09-23 에 PMF 축으로, 2026-09-29 에 인사이트 축으로(2축 확정) 바뀌었고, 두 번 다 바뀐 것은
// 아래 `displayGrade` 한 줄이다.
//
// ⚠️ 이 파일은 등급을 **계산하지 않는다.** 산식 정본은 `lib/cases/draft.ts` 의
//    `pmfGrade`(PMF 축) / `gradeMove`(인사이트) / `factCheckGrade`(사실확인)이고, 저장값을
//    바꾸는 것은 사람이 CLI regrade 로 한다(CLAUDE.md §10.1). 여기는 "저장된 것 중 무엇을
//    보여줄지"만 고른다.

/**
 * `case_moves.insight_grade` 컬럼(마이그 20260930000039)이 적용됐나. **적용을
 * information_schema 로 실측한 뒤에만** true 로 바꾼다 — 없는 컬럼을 SELECT·INSERT 에 넣으면
 * 42703/PGRST204 로 요청 전체가 죽는다(POSTS_PILLAR_COLUMN_READY · LINK_TABLE_READY 와 같은 패턴).
 * false 여도 화면은 같다: 전환기에는 `evidence_grade` 가 같은 값(gradeMove)을 들고 있다.
 *
 * true (2026-09-30) — 마이그 20260930000039 적용 확인 + 000040 백필 125/125 완료·불일치 0건
 * (오케스트레이터 실측, CEO-STAFF 세션 남헌 확정 B안). `docs/migration-exceptions.md` 참고.
 */
export const INSIGHT_GRADE_COLUMN_READY = true

/** SELECT 에 넣는 인사이트 등급 컬럼 묶음. 플래그 하나로 전 조회가 같이 바뀐다. */
// 타입은 넓은 쪽 리터럴로 고정한다 — supabase-js 의 select 문자열 파서가 유니언·string 을 못 읽는다(ParserError).
// 미적용일 때 insight_grade 는 조회에 없어 undefined 로 오고, displayGrade 가 evidence_grade 로 폴백한다.
export const INSIGHT_COLS = (INSIGHT_GRADE_COLUMN_READY ? 'insight_grade, evidence_grade' : 'evidence_grade') as 'insight_grade, evidence_grade'

/** 등급 1자. 조회에서 컬럼을 빼면 `undefined` 로 온다 — 그건 "D" 가 아니라 미기재다. */
export type DisplayGradeInput = {
  /** 인사이트 등급(`case_moves.insight_grade`, gradeMove). 2축 확정(남헌 2026-09-29) 후의 정본 컬럼. */
  insight_grade?: string | null
  /** 레거시 이름 — 2026-09-16 부터 gradeMove(인사이트)를 담아 왔다. insight_grade 미적용·미백필 시 폴백. */
  evidence_grade?: string | null
  /**
   * PMF 등급(S×T, 마이그 20260930000004). **표시 축이 아니다**(남헌 2026-09-29: 등급은 인사이트·사실확인
   * 2축 확정). 2026-09-23~29 동안 "인사이트" 이름표 아래 이 값이 나갔던 것이 바로잡힌 자리다.
   */
  pmf_grade?: string | null
  pmf_provisional?: boolean | null
  /** 성과 방향. 실패(negative) 무브도 A 가 될 수 있으므로 등급과 함께 보여야 한다. */
  outcome_direction?: string | null
}

/**
 * 화면용 등급 = **인사이트 등급**(남헌 2026-09-29 2축 확정).
 *
 *   `insight_grade ?? evidence_grade`
 *
 * 이 한 줄이 전 화면(상세·카드·검색·랭킹·즉시발행 게이트)에 동시에 먹는 것이 이 파일의 존재 이유다.
 * 사실확인 축은 `factCheckLabel`. pmf_grade 는 보지 않는다.
 *
 * `null` 은 **미기재**다. 'D'(행동 없음)와 섞지 않는다(§7.1).
 */
export function displayGrade(move: DisplayGradeInput | null | undefined): string | null {
  const g = move?.insight_grade ?? move?.evidence_grade
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

/**
 * PMF 등급 순위 — **랭킹의 동점 결정자일 뿐**(남헌 2026-09-30 결정 B). 표시·랭킹 1순위 축은
 * 여전히 인사이트(`gradeRankOf`)다. 승인 무브의 인사이트 등급 분포가 치우쳐 있어(A 69 / C 12,
 * 2026-09-30 실측) 인사이트만으로는 동률이 흔하다 — 그때만 이 값으로 순서를 가른다.
 * 미기재는 -1 — D(0)보다 뒤로 보낸다(등급 없음을 D 와 섞지 않는다, §7.1).
 */
export function pmfRankOf(move: { pmf_grade?: string | null } | null | undefined): number {
  const g = move?.pmf_grade
  return typeof g === 'string' && g.trim() ? (GRADE_RANK[g.trim()] ?? -1) : -1
}
