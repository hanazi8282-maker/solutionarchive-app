// 리뷰 수집(nightly-review-collect) 결과 → Notion "일일 상태 로그" CTO 행 입력.
// review-collect.mjs 는 import 되는 순간 수집을 돌리는 스크립트라, 테스트할 수 있게
// 순수 함수만 여기로 뺐다. 의존성 0 (notion-status-log-selftest.mjs 가 네트워크 없이 검사).
//
// 사람판단필요 규칙: 실패 소스 · 차단 응답(403/429) · 건강도 경보 · 경고가 하나라도 있으면 true.
//   extract 실행 판단은 매일 서 있는 판단이라 플래그에 넣지 않는다(매일 true 가 되면 아무도 안 본다).

const MAX_LINES = 5

/** 5줄 상한. 넘치면 마지막 줄을 "외 N건" 으로 바꾼다 — 잘린 걸 숨기지 않는다. */
export function capLines(lines, more) {
  const xs = lines.filter(Boolean)
  if (xs.length <= MAX_LINES) return xs
  return [...xs.slice(0, MAX_LINES - 1), `외 ${xs.length - (MAX_LINES - 1)}건 — ${more}`]
}

/**
 * @param sources [{ key, fatal?, skipped?, skipReason?, stats?, alert?, warnings? }]
 * @param topProject { id, n } | null — 누적 리뷰 최다 프로젝트
 */
export function buildReviewCollectEntry({ date, sources = [], failures = [], topProject = null, runUrl = null }) {
  const sum = (k) => sources.reduce((a, s) => a + Number(s.stats?.[k] ?? 0), 0)
  const more = runUrl ? `Actions 실행 요약 ${runUrl}` : 'Actions 실행 요약'

  const done = capLines([
    `리뷰 수집 ${sources.length}개 소스 — 신규 ${sum('newReviews')}건 · 파싱 ${sum('reviewsParsed')}건(실패 ${sum('parseFailures')})`,
    ...sources.map((s) => s.fatal ? `${s.key}: 실패`
      : s.skipped ? `${s.key}: 건너뜀 — ${s.skipReason ?? '사유 미기록'}`
        : `${s.key}: 신규 ${s.stats?.newReviews ?? 0} · 파싱 ${s.stats?.reviewsParsed ?? 0}(실패 ${s.stats?.parseFailures ?? 0})`),
  ], more)

  const blockedLines = capLines(sources.flatMap((s) => [
    s.fatal ? `${s.key}: ${s.fatal}` : null,
    Number(s.stats?.blockedResponses ?? 0) > 0 ? `${s.key}: 차단 응답 ${s.stats.blockedResponses}건(403/429)` : null,
    s.alert ? `${s.key}: ${String(s.alert).replace(/^[-\s]+/, '')}` : null,
    ...(s.warnings ?? []).map((w) => `${s.key}: ${w}`),
  ]), more)

  const next = [
    failures.length ? `실패 소스 ${failures.join(', ')} 원인 확인 — 2일 연속이면 CTO 에스컬레이션` : null,
    topProject ? `extract 실행 여부 판단 — 누적 리뷰 최다 프로젝트 ${topProject.id} ${topProject.n}건` : null,
  ].filter(Boolean)

  return {
    date,
    track: 'CTO',
    done: done.join('\n'),
    blocked: blockedLines.length ? blockedLines.join('\n') : '없음',
    next: (next.length ? next : ['사람 할 일 없음 — 다음 크론이 이어서 돈다']).join('\n'),
    needsHuman: blockedLines.length > 0 || failures.length > 0,
    note: `nightly-review-collect · ${runUrl ?? '로컬 실행(run URL 없음)'} · 날짜는 실행 시각 UTC 기준 · 원문 폐기(purge) 결과는 이 행에 없다`,
  }
}
