-- 롤백: 20260930000023_danawa_shrink_todayhumor_targets — 2026-09-27 적용 전 값으로 되돌린다.
UPDATE public.review_targets
   SET status = 'active'
 WHERE id = 'e2c1e0a0-1ec0-4ce4-85eb-1a65a5ba9e56'
   AND status = 'exhausted';

UPDATE public.review_sources
   SET daily_request_cap = 200
 WHERE key = 'danawa';

UPDATE public.review_targets
   SET status = 'active'
 WHERE id IN ('493a26e8-f106-4428-bd6a-1af787323380',
              'e8d95e49-d9aa-40ae-bfc9-1d0e4e106b4f',
              'b2cbf13c-d5d6-4d8a-a597-758857952573')
   AND status = 'failed';
