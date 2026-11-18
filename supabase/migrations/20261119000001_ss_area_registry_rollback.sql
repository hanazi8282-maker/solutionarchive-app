-- 롤백(S1): 새 표만 지우고 CHECK 를 원래대로. review_targets.area 채움은 롤백 표로 되돌린다(채운 행만 NULL 로).
BEGIN;
UPDATE public.review_targets t SET area = NULL FROM public.review_targets_area_filled_20261119 f WHERE f.target_id = t.id AND t.area = f.new_area AND f.prev_area IS NULL;
ALTER TABLE public.review_area_verdicts DROP CONSTRAINT IF EXISTS review_area_verdicts_area_code_check;
ALTER TABLE public.review_area_verdicts ADD CONSTRAINT review_area_verdicts_area_code_check CHECK (area_code = ANY (ARRAY['1','2','3','4','5','none']));
DROP TABLE IF EXISTS public.target_area_links;
DROP TABLE IF EXISTS public.review_targets_area_filled_20261119;
DROP TABLE IF EXISTS public.area_registry;
COMMIT;
