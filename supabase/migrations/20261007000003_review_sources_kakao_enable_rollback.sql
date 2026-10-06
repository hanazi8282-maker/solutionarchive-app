-- ============================================================
-- 20261007000003_review_sources_kakao_enable_rollback — 카카오 2행을 20261006000003 상태(비활성)로 되돌린다
--
-- 되돌림 = 소스 비활성화. 수집은 다음 실행부터 0요청이 된다. 이미 적재된 원문은 이 파일이 건드리지 않는다
-- (원문 보존 기간 purge 가 지운다 — 즉시 지워야 하면 별도 판단, §10.2 예외 1번).
-- 한 소스만 끄려면 WHERE 의 key 를 하나만 남긴다.
-- ============================================================

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '소유자 예외 철회 — 카카오 운영정책 제5조 20·30호 충돌(docs/review-collection-design.md §1.3)',
       override = NULL,
       tos_status = 'unverified',
       quote_allowed = true,
       quote_policy = 'short_only'
 WHERE key IN ('kakao_blog', 'kakao_cafe');
-- 기대: UPDATE 2

COMMIT;

-- 확인: SELECT key, enabled, override, tos_status, quote_allowed FROM public.review_sources
--        WHERE key IN ('kakao_blog','kakao_cafe') ORDER BY key;
--   기대 2행: false · NULL · unverified · true
