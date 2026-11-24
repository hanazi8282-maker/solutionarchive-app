-- 롤백(v71eg B2-②): 이 테이블 하나만 지운다. 쓰기 전체가 이 표에만 있어 다른 데이터에 영향 없음.
BEGIN;
DROP TABLE IF EXISTS public.case_signal_labels_v06;
COMMIT;
