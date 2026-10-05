-- 롤백: 20261006000003_review_sources_kakao — 카카오 검색 소스 2행을 끈다.
-- 행 DELETE 가 아니라 enabled=false 로 둔다: 적용 뒤 수집이 돌았으면 review_targets·analysis_inputs·지문이
-- source_key 로 이 행을 가리킨다(FK). 행 삭제는 데이터 삭제라 사람 판단(§10.2 예외 1).
-- 수집이 한 번도 안 돌았다면(타깃 0) 등록 자체를 지워도 되지만, 그 판단은 이 파일이 하지 않는다.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '20261006000003 롤백 — 카카오 검색 소스 비활성'
 WHERE key IN ('kakao_blog', 'kakao_cafe');

COMMIT;

-- 확인: SELECT key, enabled, disabled_reason FROM public.review_sources WHERE key IN ('kakao_blog', 'kakao_cafe');
--   기대: 2행(또는 미적용이면 0행) · false · '20261006000003 롤백 …'
-- 수집 0 확인: 다음 실행 요약에 kakao_blog·kakao_cafe "건너뜀 — 소스가 비활성 상태다".
