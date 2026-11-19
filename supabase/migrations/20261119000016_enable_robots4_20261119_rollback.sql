-- 롤백 = 끄는 짝(20261119000017) 적용 + source_candidates 라벨 복원. 소스·타깃·수집분 행은 지우지 않는다(FK·수집 이력).
BEGIN;
UPDATE public.review_sources SET enabled = false, disabled_reason = 'owner_2026-11-19 robots4 롤백 (20261119000014)', disabled_at = now()
 WHERE override = 'owner_2026-11-19' AND key IN ('dcinside','ruliweb');
UPDATE public.source_candidates SET onboarded_source_key = NULL, onboard_batch = 'onboard_pending_robots4', note = 'v71cu-seed robots 금지에 가까움 — 남헌 11-19 결정으로 켬' WHERE domain IN ('gall.dcinside.com','bbs.ruliweb.com');
UPDATE public.source_candidates SET tech_feasible = true, tech_block_reason = NULL, note = 'v71cu-seed robots 금지에 가까움 — 남헌 11-19 결정으로 켬' WHERE domain IN ('squarespace.com','chromewebstore.google.com');
COMMIT;
