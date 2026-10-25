// 리뷰 수집(nightly-review-collect) 결과 → Notion "일일 상태 로그" CTO 행 입력.
// review-collect.mjs 는 import 되는 순간 수집을 돌리는 스크립트라, 테스트할 수 있게
// 순수 함수만 여기로 뺐다. 의존성 0 (notion-status-log-selftest.mjs 가 네트워크 없이 검사).
//
// 사람판단필요: 항상 false (남헌 v17→v19, 2026-10-05 — CLAUDE.md §10.2 예외 항목 = §11 기준). 실패 소스·차단 응답·건강도 경보·경고는
//   막힘 사실이라 막힌것 칸에만 싣는다.
//   extract 실행 판단은 매일 서 있는 판단이라 플래그에 넣지 않는다(매일 true 가 되면 아무도 안 본다).

const MAX_LINES = 5

/** v71be 1-1 고정 칸 상수 — 수집 신규 목표(v71au 10-19, 기준선 1,306×3)와 쓸 수 있는 정보 하한(v71be 10-25). */
export const GOAL_COLLECT = 3917
export const FLOOR_USABLE = 300

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const fmt = (n) => Number(n).toLocaleString('en-US')

/**
 * 매일 고정 칸 한 줄. rows = v_goal_daily [{dt,new_in,new_in_area,usable}] (null = 못 읽음 → 확인 불가, §7.1), today = KST 'YYYY-MM-DD'.
 * "어제" 는 하루가 끝난 마지막 날이다. 수확률 = 구간 쓸 수 있는 정보 합 ÷ 수집 신규 합.
 * 7일 값은 백필·밀린 2차 판정 해소분이 섞여 부풀 수 있어 3일 값을 같이 쓴다.
 */
export function goalLine(rows, today) {
  if (!Array.isArray(rows)) return '[목표] 확인 불가(v_goal_daily 조회 실패)'
  const by = new Map(rows.map((r) => [String(r.dt), r]))
  const at = (d) => by.get(d) ?? { new_in: 0, new_in_area: 0, usable: 0 }
  const days = (n) => Array.from({ length: n }, (_, i) => addDays(today, -(i + 1))) // 어제부터 거슬러
  const sum = (ds, k) => ds.reduce((a, d) => a + Number(at(d)[k] ?? 0), 0)
  const y = (ds) => { const n = sum(ds, 'new_in'); return n > 0 ? sum(ds, 'usable') / n : null }
  const yest = addDays(today, -1)
  const y7 = y(days(7)), y3 = y(days(3))
  const need = (r) => (r && r > 0 ? fmt(Math.ceil(FLOOR_USABLE / r)) : '계산 불가')
  const low3 = days(3).every((d) => Number(at(d).usable) < FLOOR_USABLE)
  const pct = (a, b) => `${Math.round((a / b) * 100)}%`
  return [
    `[목표 ${today}]`,
    `어제(${yest.slice(5)}) 수집 신규 ${fmt(at(yest).new_in)}(영역 안 ${fmt(at(yest).new_in_area)}) · 목표 ${fmt(GOAL_COLLECT)} 대비 ${pct(at(yest).new_in, GOAL_COLLECT)}`,
    `쓸 수 있는 정보 ${fmt(at(yest).usable)} · 하한 ${FLOOR_USABLE} 대비 ${pct(at(yest).usable, FLOOR_USABLE)}`,
    `최근 7일 수확률 ${y7 === null ? '계산 불가' : (y7 * 100).toFixed(1) + '%'}(최근 3일 ${y3 === null ? '계산 불가' : (y3 * 100).toFixed(1) + '%'})`,
    `하한 ${FLOOR_USABLE} 에 필요한 수집량 ${need(y7)}건(3일 기준 ${need(y3)}건)`,
    low3 ? '⚠ 쓸 수 있는 정보가 3일 연속 하한 미만 — 수집 확대안 필요' : null,
  ].filter(Boolean).join(' · ')
}

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
/**
 * "[꺼진 소스]" 칸(남헌 10-15, CLAUDE.md §10.1 차단 시 즉시 정지 조건 4) — 소스 / 꺼진 시각 / 사유 / 며칠째, 한 줄씩.
 * rows = scripts/block-stop.mjs loadOffSources 결과(override='owner_2026-10-14' ∧ enabled=false). null = 못 읽음(확인 불가), [] = 없음.
 */
export function offSourcesBlock(rows, date) {
  if (rows === null) return '[꺼진 소스] 확인 불가(review_sources 조회 실패)'
  if (!rows.length) return '[꺼진 소스] 없음'
  const day = (iso) => Date.parse(new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10))
  return ['[꺼진 소스]', ...rows.map((r) => {
    const at = r.disabled_at ? new Date(Date.parse(r.disabled_at) + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' KST' : '시각 미기록'
    const n = r.disabled_at ? `${Math.round((Date.parse(date) - day(r.disabled_at)) / 86_400_000) + 1}일째` : '며칠째 확인 불가'
    const why = String(r.disabled_reason ?? '사유 미기록')
    return `- ${r.key} / ${at} / ${why.length > 160 ? `${why.slice(0, 159)}…` : why} / ${n}`
  })].join('\n')
}

export function buildReviewCollectEntry({ date, sources = [], failures = [], topProject = null, extractLine = null, goal = null, runUrl = null, supply = undefined, offSources = undefined }) {
  const sum = (k) => sources.reduce((a, s) => a + Number(s.stats?.[k] ?? 0), 0)
  const more = runUrl ? `Actions 실행 요약 ${runUrl}` : 'Actions 실행 요약'

  // v69 D7: 수집 연료계 한 줄을 맨 앞에. supply === null 은 "게이지를 못 읽었다" — 정상으로 접지 않고 그대로 적는다(§7.1). undefined 는 호출부가 게이지를 안 쓰는 경우(기존 동작).
  const fuel = supply === undefined ? null : supply === null ? '수집 연료계: 확인 불가(게이지 파일 없음 — target-revive 스텝 확인)' : supply.fuel_line
  const done = capLines([
    goal,
    fuel,
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
    // extract 는 nightly-extract 가 자동으로 돈다(신규 ≥EXTRACT_AUTO_MIN_NEW 프로젝트). 사람 판단 줄이 아니라 결론 줄이다 — 근거는 extractLine(agent_runs).
    topProject ? `${extractLine ?? 'extract: 자동 실행 중(nightly-extract) — 실행 이력 확인 불가'} · 누적 리뷰 최다 프로젝트 ${topProject.id} ${topProject.n}건` : null,
  ].filter(Boolean)

  // v69 D7 + 남헌 10-14: [자율 공급] 비고 — 재고 이상·증분형 시계 관찰 + 건너뛴 소스 수(soft-skip·꺼짐)를 매일 적는다(0이어도 적는다 — 빠진 날과 0건인 날이 구분돼야 한다, §7.1).
  const softSkips = sources.filter((x) => x.skipped && /soft-skip/.test(x.skipReason ?? ''))
  const offSkips = sources.filter((x) => x.skipped && !/soft-skip/.test(x.skipReason ?? ''))
  const supplyParts = [
    supply && supply.abnormal.length ? `재고 이상 ${supply.abnormal.slice(0, 6).join('; ')}${supply.abnormal.length > 6 ? ` 외 ${supply.abnormal.length - 6}곳` : ''}` : null,
    supply && supply.observe ? `증분형 시계 관찰 ${supply.observe.n}개(예상 신규 ${supply.observe.expected_new}건, 쓰기 0)` : null,
    `건너뛴 소스 ${softSkips.length + offSkips.length}곳(soft-skip ${softSkips.length}${softSkips.length ? `: ${softSkips.map((x) => x.key).join(', ')}` : ''} · 꺼짐 ${offSkips.length})`,
  ].filter(Boolean)
  const supplyNote = supply === undefined && !sources.some((x) => x.skipped) ? '' : `[자율 공급] ${supplyParts.join(' · ')} · `
  return {
    date,
    track: 'CTO',
    done: done.join('\n'),
    blocked: blockedLines.length ? blockedLines.join('\n') : '없음',
    next: (next.length ? next : ['사람 할 일 없음 — 다음 크론이 이어서 돈다']).join('\n'),
    needsHuman: false,
    note: `${supplyNote}nightly-review-collect · ${runUrl ?? '로컬 실행(run URL 없음)'} · 날짜는 KST(행을 쓰는 시점) · 원문 폐기(purge) 결과는 이 행에 없다${offSources === undefined ? '' : `\n${offSourcesBlock(offSources, date)}`}`,
  }
}
