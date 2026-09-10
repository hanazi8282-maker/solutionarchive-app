// app/api/analyze/angle/validate/route.ts 의 요청 바디 검증. 순수 함수로 뗀
// 이유는 app/api/analyze/angle-adaptation.ts 와 같다 — route.ts 는 next/server 등
// 런타임 전용 import 를 갖고 있어 순수 node 셀프테스트가 직접 import 할 수 없다
// (scripts/analyze-angle-validate-selftest.mjs).

export type ValidateAngleBody =
  | { ok: true; angleId: string; outcomeNote: string; validatedBy: string | null }
  | { ok: false; error: string }

/**
 * POST 바디 { angle_id, outcome_note, validated_by? } 를 검증한다.
 * angle_id/outcome_note 는 필수(빈 문자열·공백뿐인 값 거절). validated_by 는
 * 선택 — 안 주면 null(DB 컬럼 기본값 '남헌' 이 채운다, 1인 운영 내부 도구라
 * 세션에서 가져올 사용자가 없다).
 */
export function parseValidateAngleBody(body: unknown): ValidateAngleBody {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: '요청 본문이 올바르지 않습니다.' }
  }
  const b = body as Record<string, unknown>

  const angleId = typeof b.angle_id === 'string' ? b.angle_id.trim() : ''
  if (!angleId) return { ok: false, error: 'angle_id 가 필요합니다.' }

  const outcomeNote = typeof b.outcome_note === 'string' ? b.outcome_note.trim() : ''
  if (!outcomeNote) return { ok: false, error: 'outcome_note 가 필요합니다.' }

  const validatedByRaw = typeof b.validated_by === 'string' ? b.validated_by.trim() : ''
  const validatedBy = validatedByRaw ? validatedByRaw : null

  return { ok: true, angleId, outcomeNote, validatedBy }
}
