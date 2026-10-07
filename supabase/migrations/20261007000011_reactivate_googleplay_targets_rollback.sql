-- ============================================================
-- 20261007000011_reactivate_googleplay_targets — 롤백
--
-- 🟠 남헌 적용. 데이터를 지우지 않는다 — 스냅샷에 적힌 행만 원래 status·consecutive_empty 로 되돌리고
--    스냅샷 테이블을 없앤다. 되살아난 동안 들어온 analysis_inputs 는 남는다.
-- ⚠️ 코드(incrementalOnly·maxPagesPerRun)는 이 파일이 되돌리지 않는다. 코드를 두면 롤백 효과는
--    다음 수집까지만 의미가 있다 — 정말 되돌리려면 PR 을 revert 한다.
-- ============================================================

BEGIN;

UPDATE public.review_targets t
   SET status = s.prev_status,
       consecutive_empty = s.prev_consecutive_empty
  FROM public.review_targets_reactivated_20261007 s
 WHERE t.id = s.target_id;

DROP TABLE IF EXISTS public.review_targets_reactivated_20261007;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='review_targets_reactivated_20261007';  -- 기대 0
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='exhausted';  -- 기대 ≈20
