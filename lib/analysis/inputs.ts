// 수기 입력 경로의 순수 검증기 — 경쟁사 URL(선택) · 붙여넣기 원문(길이).
//
// 왜 route 밖에 있나. route 파일은 `@/lib/supabase/server` 를 끌고 와서 node 로 바로
// 못 돌린다 — 검증을 그 안에 두면 셀프테스트가 소스 문자열을 grep 하는 수밖에 없고,
// 그건 "검사 방법이 주장과 다른" 검사다(CLAUDE.md §7.1). facets.ts 와 같은 모양으로
// 뺀다. DB·네트워크를 타지 않는다.
//
// 쓰는 곳: POST /api/analyze/projects · POST /api/analyze/inputs.

import { parseDanawaProductUrl } from '../review/danawa-url.ts'
import type { AnalysisMode } from './types.ts'

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * 붙여넣기 원문 1건의 안전 상한.
 *
 * 남헌 2026-09-23 결정: "붙여넣은 원문은 발행 안 됨, 30일 후 삭제(기존 review-purge),
 * 케이스 근거 스니펫 300자 상한 유지." → **분석용 전문에는 길이 제한을 두지 않는다**
 * (발행 경계는 케이스 근거 쪽에 있다). 다만 상한이 아예 없으면 1건 100만 자 같은
 * 사고가 나므로 넉넉한 안전판만 둔다. 긴 글은 여러 건으로 나눠 붙여넣는다.
 */
export const MAX_RAW_TEXT_CHARS = 20_000

/** 붙여넣기 원문. 비면 거절, 상한을 넘으면 **자르지 않고** 거절한다(조용히 잘리면 뒷부분이 사라진 줄 모른다). */
export function parseRawText(value: unknown): Parsed<string> {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { ok: false, error: '수집 원문을 입력해주세요.' }
  if (text.length > MAX_RAW_TEXT_CHARS) {
    return {
      ok: false,
      error:
        `수집 원문이 너무 깁니다. 1건당 ${MAX_RAW_TEXT_CHARS.toLocaleString('ko-KR')}자까지 받습니다. ` +
        `(지금 ${text.length.toLocaleString('ko-KR')}자) 여러 건으로 나눠 붙여넣어 주세요.`,
    }
  }
  return { ok: true, value: text }
}

/**
 * 경쟁사·비교 대상 URL. **forward 에서는 선택**이다(남헌 2026-09-23 Q4-A,
 * reports/2026-09-23/data-velocity-plan.md §1) — 아직 제품도 경쟁사도 없는 사람이
 * 자기 경험담을 붙여넣는 경로를 이 한 칸이 막고 있었다. 비면 null 로 저장한다.
 *
 * reverse 는 역설계할 대상이 곧 그 URL 이라 여전히 필수이고, 다나와만 커버한다
 * (스마트스토어·쿠팡은 미지원, G2·Capterra 는 ToS 상 스크래핑 금지 SP-007).
 * 조용히 빈 결과를 주지 않고 여기서 명확히 막는다(§7.1).
 */
export function parseCompetitorUrl(value: unknown, mode: AnalysisMode): Parsed<string | null> {
  const url = typeof value === 'string' ? value.trim() : ''
  if (!url) {
    if (mode === 'reverse') {
      return { ok: false, error: '역설계할 성공 상품 URL(다나와)을 입력해주세요.' }
    }
    return { ok: true, value: null }
  }

  if (mode === 'reverse') {
    const danawa = parseDanawaProductUrl(url)
    if (!danawa.ok) {
      return {
        ok: false,
        error:
          '지금은 다나와가 커버하는 상품만 역방향 분석이 가능합니다. ' +
          '다나와 상품 상세 URL을 입력해주세요. (예: https://prod.danawa.com/info/?pcode=252495223)',
      }
    }
  }

  return { ok: true, value: url }
}
