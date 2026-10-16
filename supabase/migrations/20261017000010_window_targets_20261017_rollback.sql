-- ============================================================
-- 20261017000010_window_targets_20261017 — ROLLBACK
--
-- ⛔ 미적용 초안. 삭제 없음: public.review_targets_window_batch_20261017 에 기록된 행(이 마이그가 넣은 행)만 status='failed'
--   (planRevive 대상 아님 — 자동 부활 없음). 기록 표에 없는 행(나중에 nightly 가 같은 라벨로 넣은 행 포함)은 건드리지 않는다.
--   수집된 리뷰(analysis_inputs)는 그대로 남는다. 완전 삭제는 §10.2 예외 1번 — 사람 판단.
--   기록 표 자체는 남긴다(감사용). 지우려면 롤백 확인 뒤 사람이 DROP 한다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE running_at text;
BEGIN
  IF to_regclass('public.review_targets_window_batch_20261017') IS NULL THEN RAISE EXCEPTION '기록 표가 없다 — 정방향이 적용되지 않았다'; END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key = 'appstore' AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

UPDATE public.review_targets t SET status = 'failed'
  FROM public.review_targets_window_batch_20261017 b
 WHERE t.id = b.target_id AND t.status <> 'failed';

DO $$
DECLARE still int;
BEGIN
  SELECT count(*) INTO still FROM public.review_targets t JOIN public.review_targets_window_batch_20261017 b ON b.target_id = t.id WHERE t.status <> 'failed';
  IF still <> 0 THEN RAISE EXCEPTION '%행이 아직 failed 가 아니다', still; END IF;
END $$;

COMMIT;
