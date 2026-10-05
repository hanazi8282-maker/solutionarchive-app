-- 롤백: 20261005000005_review_sources_googleplay — googleplay 소스를 끈다.
-- 행 DELETE 가 아니라 enabled=false 로 되돌린다: 적용 뒤 수집이 돌았으면 review_targets·analysis_inputs·지문이
-- source_key 로 이 행을 가리킨다(FK). 행 삭제는 데이터 삭제라 사람 판단(§10.2 예외 1).

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '20261005000005 롤백 — 소유자 예외 철회'
 WHERE key = 'googleplay';

COMMIT;

-- 확인: SELECT key, enabled, disabled_reason FROM public.review_sources WHERE key = 'googleplay';  -- 기대: false · '20261005000005 롤백 …'
-- 수집 0 확인: 다음 실행 요약에 googleplay "건너뜀 — 소스가 비활성 상태다".
