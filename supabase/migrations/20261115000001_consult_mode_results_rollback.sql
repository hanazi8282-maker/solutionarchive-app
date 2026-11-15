-- 롤백: 20261115000001_consult_mode_results. 새 표라서 지워도 기존 데이터에 영향 없음(모드 B/C1/C2 결과만 사라진다).
BEGIN;
DROP TABLE IF EXISTS public.consult_mode_results;
COMMIT;
