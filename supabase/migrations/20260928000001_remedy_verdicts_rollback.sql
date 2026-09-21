-- 20260928000001_remedy_verdicts.sql 되돌리기.
-- 판정 캐시만 사라진다 — 참조하는 테이블이 없고, scripts/remedy-judge.mjs 로 다시 채울 수 있다.
-- 단 사람이 채점한 human_verdict 는 복원되지 않는다. 지우기 전에 CSV 로 빼 둘 것.
DROP TABLE IF EXISTS public.remedy_verdicts;
