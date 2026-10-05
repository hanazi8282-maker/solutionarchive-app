-- 롤백: 20261005000005_review_sources_googleplay — googleplay 소스를 끄고 소유자 예외(override='owner_2026-10-06')를 거둔다.
-- 행 DELETE 가 아니라 enabled=false 로 되돌린다: 적용 뒤 수집이 돌았으면 review_targets·analysis_inputs·지문이
-- source_key 로 이 행을 가리킨다(FK). 행 삭제는 데이터 삭제라 사람 판단(§10.2 예외 1).
-- override 를 NULL 로 비운다 — 누가 enabled 만 다시 true 로 올려도 robots 금지를 통과하지 못하게(러너 isOwnerRobotsOverride).
-- robots_status='disallowed' · tos_status 는 실측·약관 사실이라 그대로 둔다.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       override = NULL,
       disabled_reason = '20261005000005 롤백 — 소유자 예외(owner_2026-10-06) 철회'
 WHERE key = 'googleplay';

COMMIT;

-- 확인: SELECT key, enabled, override, disabled_reason FROM public.review_sources WHERE key = 'googleplay';
--   기대: false · NULL · '20261005000005 롤백 …'
-- 수집 0 확인: 다음 실행 요약에 googleplay "건너뜀 — 소스가 비활성 상태다".
