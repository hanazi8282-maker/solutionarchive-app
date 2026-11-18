-- 끄는 짝(S5-3): onboard_20261119 새 포럼 7곳을 끈다. 모은 글은 지우지 않는다.
-- 되돌리기(다시 켜기): UPDATE public.review_sources SET enabled = true, disabled_reason = NULL, disabled_at = NULL WHERE override = 'owner_2026-11-19' AND key IN (아래 7개);
BEGIN;
UPDATE public.review_sources SET enabled = false, disabled_reason = 'owner_2026-11-19 묶음 끄기 (20261119000005)', disabled_at = now()
 WHERE override = 'owner_2026-11-19' AND key IN ('mautic_forum','frappe_forum','suitecrm_community','invoiceninja_forum','obsidian_forum','ghost_forum','shopify_community');
COMMIT;
