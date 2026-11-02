-- 20261102000010_hubspot_microsaas_ideas 롤백 — 이 마이그가 만든 표를 지운다. 원본 CSV 는 ~/sa-private/ground/hubspot/ 에 보관돼 있어 다시 적재 가능.
BEGIN;
DROP TABLE IF EXISTS public.hubspot_microsaas_ideas;
COMMIT;
