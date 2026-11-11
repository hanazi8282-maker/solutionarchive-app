-- 롤백: 이 마이그가 만든 3표만 지운다(전부 신규). 데이터가 쌓인 뒤에는 먼저 백업.
BEGIN;
DROP TABLE IF EXISTS public.newsletter_changes, public.newsletter_items, public.newsletter_sender_labels;
COMMIT;
