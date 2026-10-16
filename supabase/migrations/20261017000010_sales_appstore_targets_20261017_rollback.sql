-- ============================================================
-- 20261017000010_sales_appstore_targets_20261017 — ROLLBACK
--
-- ⛔ 미적용 초안. 삭제 없음:
--   · review_targets: public.review_targets_sales_batch_20261017 에 기록된 행(이 마이그가 넣은 행)만 status='failed'
--     (planRevive 대상 아님 — 자동 부활 없음). 활성에서 빠지므로 30% 게이트 칸이 그만큼 돌아온다.
--   · analysis_projects: 손대지 않는다. 이 마이그가 만든 프로젝트(area_rule_ver='sales-v71ad')는 실제 ② 영업 제품이라 영역 값이 사실이고,
--     타깃이 failed 면 수집이 멈춰 빈 collecting 프로젝트로 남는다. 이미 수집된 리뷰(analysis_inputs)도 그대로.
--     완전 삭제는 §10.2 예외 1번 — 사람 판단.
--   · 기록 표 자체는 남긴다(감사용). 지우려면 롤백 확인 뒤 사람이 DROP 한다.
-- 순서: #554(20261017000020)가 적용돼 있으면 그쪽을 먼저 되돌릴 필요는 없다 — 이 롤백은 게이트를 줄이기만 한다(활성 감소).
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE running_at text;
BEGIN
  IF to_regclass('public.review_targets_sales_batch_20261017') IS NULL THEN RAISE EXCEPTION '기록 표가 없다 — 정방향이 적용되지 않았다'; END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key = 'appstore' AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

UPDATE public.review_targets t SET status = 'failed'
  FROM public.review_targets_sales_batch_20261017 b
 WHERE t.id = b.target_id AND t.status <> 'failed';

DO $$
DECLARE still int;
BEGIN
  SELECT count(*) INTO still FROM public.review_targets t JOIN public.review_targets_sales_batch_20261017 b ON b.target_id = t.id WHERE t.status <> 'failed';
  IF still <> 0 THEN RAISE EXCEPTION '%행이 아직 failed 가 아니다', still; END IF;
END $$;

COMMIT;
