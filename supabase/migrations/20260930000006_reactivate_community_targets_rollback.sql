-- ============================================================
-- 20260930000006_reactivate_community_targets — 롤백
--
-- 🟠 사람 적용. (되돌리는 방향도 대량 UPDATE 다)
--
-- 🟢 데이터를 지우지 않는다. 앞 마이그레이션이 바꾼 그 행의 status 를
--    원래 값(`exhausted`)으로 되돌리고 스냅샷 테이블을 없앤다.
--    수집된 analysis_inputs 는 손대지 않는다 — 되살아난 동안 들어온 리뷰는 남는다.
--
-- ⚠️ **스냅샷에 적힌 행만 되돌린다.** "11개 소스의 active 전부"를 닫으면 그 사이
--    사람이 새로 등록한 정상 타깃까지 같이 닫힌다. 그래서 여기서 소스 목록으로
--    다시 고르지 않는다.
--
-- ⚠️ 코드 쪽(`incrementalOnly: true`)은 이 파일이 되돌리지 않는다. 그걸 그대로 두면
--    다음 수집에서 커서가 끝나도 `active` 로 남아 이 롤백의 효과가 하루만 간다.
--    정말 되돌리려면 lib/review/adapters/*.ts 11개의 플래그도 같이 지워야 한다.
--
-- 되돌리기 전에 무엇이 되살아났고 얼마를 더 모았는지 남길 것:
--   SELECT t.source_key, t.product_ref, t.status, t.total_collected, t.last_run_at
--     FROM public.review_targets t
--     JOIN public.review_targets_reactivated_20260930 s ON s.target_id = t.id
--    ORDER BY t.source_key, t.product_ref;
-- ============================================================

BEGIN;

UPDATE public.review_targets t
   SET status = s.prev_status
  FROM public.review_targets_reactivated_20260930 s
 WHERE t.id = s.target_id;

DROP TABLE IF EXISTS public.review_targets_reactivated_20260930;

COMMIT;

-- 확인
-- 양성: 스냅샷 테이블이 없다.
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='review_targets_reactivated_20260930';  -- 기대: 0
--
-- 양성: 커뮤니티 11개 소스의 exhausted 가 다시 ≈82건이다.
-- SELECT source_key, count(*) FROM public.review_targets
--  WHERE status='exhausted'
--    AND source_key IN ('82cook','bobaedream','brunch','clien','damoang','fmkorea',
--                       'okky','theqoo','todayhumor','tumblbug','velog')
--  GROUP BY source_key ORDER BY 2 DESC;
