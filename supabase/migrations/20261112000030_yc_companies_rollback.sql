-- 롤백: 이 마이그가 만든 표 1개(전부 신규). 데이터는 yc-oss JSON 에서 다시 받을 수 있다.
BEGIN;
DROP TABLE IF EXISTS public.yc_companies;
COMMIT;
