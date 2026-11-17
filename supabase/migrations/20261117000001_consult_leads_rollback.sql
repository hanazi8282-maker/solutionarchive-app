-- 롤백: 리드 표 제거(열람 주소가 전부 죽는다). 데이터가 쌓인 뒤에는 사람 판단.
DROP TABLE IF EXISTS public.consult_leads;
