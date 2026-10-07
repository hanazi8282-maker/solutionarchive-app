// 추출(Stage1~2) 을 지금 시작할 수 있는지 판정하는 규칙 — 한 벌.
//
// 서버 게이트(app/api/analyze/extract/route.ts POST)와 버튼 노출
// (app/analyze/[id]/review/page.tsx)이 같이 쓴다. 두 벌이 되는 순간 화면에 뜨는 버튼과
// 서버가 실제로 받아 주는 상태가 갈라진다 — 눌러도 409 만 나는 버튼, 혹은 반대로
// 시작할 수 있는데 버튼이 없는 화면. 후자가 실제로 났다(배치로 만든 collecting
// 프로젝트 12건에 시작 버튼이 어디에도 없었다).
//
// import 가 하나도 없다. scripts/analyze-extract-gate-selftest.mjs 가 node 로 바로 불러 검사한다.

/**
 * processing 이 이 시간보다 오래 방치되면 죽은 잡으로 보고 재시도를 허용한다.
 * (Vercel 함수가 중간에 죽으면 status 가 processing 에 영구히 갇히기 때문)
 */
export const STALE_AFTER_MS = 10 * 60 * 1000

/** force 로 재분석을 허용하는 상태. 사람 검수가 끝난 이후 단계는 제외한다. */
export const REANALYZABLE = ['extracted']

/**
 * 야간 자동 extract(scripts/extract-auto.mjs)의 후보 상태 — 이 목록이 정본이다.
 * failed 는 canStart 가 force 없이 받는다(첫 추출 취급). 2026-09-27 전까지는 failed 가 빠져 있어
 * Gemini 503 한 번이 프로젝트를 야간 루프에서 영구히 뺐다(fac878dc·f6900c17·8207483a).
 */
export const AUTO_EXTRACT_STATUSES = ['collecting', ...REANALYZABLE, 'failed']

/**
 * failed 자동 재시도 상한 — extract_attempts(누적 시도 수, claimExtraction 이 +1)가 이 값 미만일 때만.
 * 일시 오류(503)와 영구 오류를 가르지 않는다. 이 상한이 영구 오류의 비용을 막는 안전장치다.
 */
export const AUTO_RETRY_MAX_ATTEMPTS = 3

/**
 * 1차 관련성 판정(scripts/relevance-judge-auto.mjs)이 failed 프로젝트를 어떻게 다루나 — 남헌 v28 #10.
 * 첫 실패(extract_attempts=1)는 야간 extract 의 자동 재추출을 기다리는 중이라 판정한다('retry').
 * 재추출을 1회 이상 하고도 failed(attempts ≥ 2)면 판정에서 뺀다('excluded').
 * attempts 를 못 읽으면 'unknown' — 제외로도 판정으로도 접지 않는다(§7.1). failed 가 아니면 'n/a'.
 */
export function relevanceFailedState(status: string, attempts: unknown): 'n/a' | 'retry' | 'excluded' | 'unknown' {
  if (status !== 'failed') return 'n/a'
  if (typeof attempts !== 'number' || !Number.isFinite(attempts)) return 'unknown'
  return attempts >= 2 ? 'excluded' : 'retry'
}

export type StartVerdict = { ok: true } | { ok: false; reason: string }

/**
 * 지금 추출을 새로 시작할 수 있는 상태인지 판정한다.
 * force=true 면 extracted 상태에서도 재분석을 허용한다(기존 aspects 는 교체된다).
 * 단 실행 중(fresh processing)은 force 여도 막는다 — 같은 프로젝트에 잡이 둘 붙으면
 * 서로의 결과를 덮어쓰기 때문이다.
 *
 * now 는 테스트가 stale 경계를 고정하기 위한 주입점이다. 호출부는 넘기지 않는다.
 */
export function canStart(
  status: string,
  startedAt: string | null,
  force = false,
  now: number = Date.now(),
): StartVerdict {
  if (status === 'collecting' || status === 'failed') return { ok: true }
  if (status === 'processing') {
    const t = startedAt ? Date.parse(startedAt) : NaN
    if (Number.isFinite(t) && now - t > STALE_AFTER_MS) return { ok: true } // stale 복구
    return { ok: false, reason: '이미 분석이 진행 중입니다.' }
  }
  if (force && REANALYZABLE.includes(status)) return { ok: true }
  return {
    ok: false,
    reason: REANALYZABLE.includes(status)
      ? '이미 분석이 끝난 프로젝트입니다. 다시 분석하려면 force 옵션이 필요합니다.'
      : '검수 이후 단계라 재분석할 수 없습니다.',
  }
}
