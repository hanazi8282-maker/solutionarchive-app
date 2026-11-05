-- 20261103000010_dm_targets_register 롤백 — 스냅샷 표에 적힌 행만. 재활성화는 직전 status 로, 새 타깃·새 프로젝트는 삭제(수집분이 있으면 멈춘다).
BEGIN;

UPDATE public.review_targets t SET status = r.prev_status
  FROM public.review_targets_registered_20261103 r WHERE r.kind = 'reactivated' AND r.target_id = t.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.review_targets t JOIN public.review_targets_registered_20261103 r ON r.kind = 'new' AND r.target_id = t.id WHERE t.total_collected > 0) THEN
    RAISE EXCEPTION '새 타깃에 이미 수집분이 있다 — 삭제하지 않는다. 사람이 판단';
  END IF;
END $$;

DELETE FROM public.review_targets t USING public.review_targets_registered_20261103 r WHERE r.kind = 'new' AND r.target_id = t.id;
DELETE FROM public.analysis_projects p USING public.review_targets_registered_20261103 r
 WHERE r.kind = 'project' AND r.project_id = p.id
   AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id);

COMMIT;
