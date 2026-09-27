-- ============================================================
-- 20260930000023_danawa_shrink_todayhumor_targets
--
-- 1) danawa 야간 수집 최소화 — CEO-STAFF 2026-09-27 결정.
--    소스는 끄지 않는다. /analyze/new(lib/review/danawa-url.ts)와 발굴 프로브가 사람 주도
--    소비재 분석에 danawa 를 쓰고, enabled=false 면 그 흐름이 조용히 깨진다.
--    대신 (a) 남은 active 타깃 1개(오랄비 전동칫솔)를 exhausted 로 닫고
--         (b) daily_request_cap 200 → 30 으로 내린다(새 타깃 1개가 한 실행에 쓰는 최대 20요청 + 여유).
--    health* 컬럼은 러너가 쓰는 자리라 건드리지 않는다.
--    exhausted 타깃을 자동으로 되살리는 코드는 없다(러너는 active 만 집고, 되살리기는 마이그뿐 — 000006 전례).
--    상한 30 이 모자라면 scripts/review-request-cap.mjs 가 2배 이내에서 스스로 올린다(내리지는 않는다).
--
-- 2) todayhumor 잔여 타깃 3개 정리 — 소스는 000019(2026-09-25)에서 이미 폐기(dead).
--    타깃이 status='active' 로 남아 상태 화면에 살아 있는 것처럼 보인다 → 'failed'(수집이 깨졌다는 뜻이 사실이다).
--
-- 🟢 비파괴. UPDATE 5행(각각 id·현재값 가드). 롤백 파일: 20260930000023_danawa_shrink_todayhumor_targets_rollback.sql
-- ============================================================

UPDATE public.review_targets
   SET status = 'exhausted'
 WHERE id = 'e2c1e0a0-1ec0-4ce4-85eb-1a65a5ba9e56'
   AND source_key = 'danawa'
   AND status = 'active';

UPDATE public.review_sources
   SET daily_request_cap = 30
 WHERE key = 'danawa'
   AND daily_request_cap = 200;

UPDATE public.review_targets
   SET status = 'failed'
 WHERE id IN ('493a26e8-f106-4428-bd6a-1af787323380',
              'e8d95e49-d9aa-40ae-bfc9-1d0e4e106b4f',
              'b2cbf13c-d5d6-4d8a-a597-758857952573')
   AND source_key = 'todayhumor'
   AND status = 'active';

-- 확인 쿼리
--   SELECT source_key, status, count(*) FROM public.review_targets
--    WHERE source_key IN ('danawa','todayhumor') GROUP BY 1,2 ORDER BY 1,2;
--   기대: danawa exhausted 17 · todayhumor failed 3 (active 0)
--   SELECT daily_request_cap FROM public.review_sources WHERE key = 'danawa';  -- 기대 30
