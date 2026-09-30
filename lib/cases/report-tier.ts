/**
 * `/cases/report` 로그인전/후 티어(I3-T, reports/2026-09-30/design-direction-ia-insights-report.md I3-2).
 *
 * 로그인전은 섹션마다 상한만큼만 **서버에서 잘라** 렌더한다 — 잘린 무브·경고·짝은 반환값에 없고 건수만 남는다
 * (CSS 숨김·`<details>` 접기 금지: 숨긴·접힌 요소도 HTML·RSC 페이로드에 실린다). 로그인후는 자르지 않는다
 * (무브 상위 5 + 접기는 페이지가 지금처럼 한다).
 * 결제·RBAC 아님. 화면 전환일 뿐이다(허용목록 전원 같은 권한, CLAUDE.md §5-1).
 */
export const REPORT_TIER = {
  anon: { moves: 3, failed: 2, pairs: 1 },
  member: { moves: Infinity, failed: Infinity, pairs: Infinity },
} as const

export const tierOf = (signedIn: boolean) => (signedIn ? REPORT_TIER.member : REPORT_TIER.anon)

/** 섹션 셋을 티어 상한으로 자른다. `locked` = 잘려서 화면에 안 나가는 건수(0 이면 잠금 줄 없음). */
export function cutReport<M, F, P>(signedIn: boolean, all: { moves: M[]; failed: F[]; pairs: P[] }) {
  const t = tierOf(signedIn)
  const cut = <T>(xs: T[], n: number) => ({ shown: xs.slice(0, n), locked: Math.max(0, xs.length - n) })
  const moves = cut(all.moves, t.moves)
  const failed = cut(all.failed, t.failed)
  const pairs = cut(all.pairs, t.pairs)
  return {
    moves: moves.shown, failed: failed.shown, pairs: pairs.shown,
    locked: { moves: moves.locked, failed: failed.locked, pairs: pairs.locked },
  }
}
