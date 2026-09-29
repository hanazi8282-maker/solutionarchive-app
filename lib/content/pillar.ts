// 콘텐츠 필러 — 케이스 / 숫자한줄 / 빌드로그 / VOC발굴.
//
// 스테이징 시점(case-draft-stage.mjs / column-threads-stage.mjs / 대시보드 "글 등록")에
// 붙여야 나중에 소급 분류하는 일이 반복되지 않는다. 근거·마이그레이션은
// supabase/migrations/20260930000038_posts_pillar.sql.
//
// ⛔ posts.pillar 컬럼은 아직 적용되지 않았다(파일만 존재 — §10.2, 남헌/오케스트레이터
//    적용 대기). 적용 전에 INSERT/UPDATE payload 에 pillar 를 넣으면 PGRST204/42703 으로
//    그 요청 전체가 실패한다 — 이미 되던 글 등록까지 함께 막는다. CLICKS_COLUMN_READY
//    (collect-metrics/route.ts)·LINK_TABLE_READY(lib/predictions/link.ts)와 같은 패턴이다.
//    적용을 `information_schema` 로 실측 확인한 뒤에만 아래 플래그를 true 로 바꾼다.
export const POSTS_PILLAR_COLUMN_READY = false

export const PILLARS = ['케이스', '숫자한줄', '빌드로그', 'VOC발굴'] as const
export type Pillar = (typeof PILLARS)[number]

export function isPillar(v: unknown): v is Pillar {
  return typeof v === 'string' && (PILLARS as readonly string[]).includes(v)
}

/**
 * INSERT/UPDATE payload 에 섞어 넣을 조각. 컬럼이 아직 없으면 **키 자체를 안 보낸다**
 * (빈 객체) — `pillar: null` 을 보내는 것과 다르다. 컬럼이 없는 스키마에서는 존재하지
 * 않는 컬럼명을 payload 에 넣는 것 자체가 오류이므로, 이 헬퍼를 거치면 준비 전/후
 * 코드가 똑같이 안전하다.
 */
export function pillarField(pillar: Pillar | null | undefined): { pillar?: Pillar | null } {
  if (!POSTS_PILLAR_COLUMN_READY) return {}
  return { pillar: pillar ?? null }
}
