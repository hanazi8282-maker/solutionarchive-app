-- 롤백(v71cu S14). 표가 이 마이그 전부터 있었다면 마지막 DROP TABLE 줄은 빼고 칸 두 개만 지운다.
BEGIN;
ALTER TABLE IF EXISTS public.company_candidates DROP COLUMN IF EXISTS thin_reasons;
ALTER TABLE IF EXISTS public.company_candidates DROP COLUMN IF EXISTS thin_evidence;
DROP TABLE IF EXISTS public.company_candidates; -- 표가 이전부터 있었다면 이 줄 삭제
COMMIT;
