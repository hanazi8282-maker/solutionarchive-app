-- 롤백: 수신 거부 목록 제거(거부한 주소가 다시 발송 대상이 될 수 있다 — 데이터가 쌓인 뒤에는 사람 판단).
DROP TABLE IF EXISTS public.consult_optouts;
