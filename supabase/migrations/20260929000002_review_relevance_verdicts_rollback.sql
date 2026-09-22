-- 20260929000002_review_relevance_verdicts 롤백.
--
-- 되돌려도 잃는 것은 판정 캐시뿐이다 — 원문(analysis_inputs)은 건드리지 않는다.
-- 다만 **사람 채점(human_verdict)은 다시 만들 수 없다.** 손으로 채점한 표본이 있으면
-- 먼저 내려받아라:
--   select input_id, human_verdict, human_graded_at from public.review_relevance_verdicts
--    where human_verdict is not null;
--
-- 되돌린 뒤 extract 는 아무것도 제외하지 않는다(dropIrrelevant 는 조회 실패·빈 캐시를
-- "무제외"로 읽는다). 파이프라인은 T2 이전 상태로 돌아갈 뿐 멈추지 않는다.

DROP TABLE IF EXISTS public.review_relevance_verdicts;

-- 확인: select count(*) from information_schema.tables
--        where table_schema='public' and table_name='review_relevance_verdicts';  -- 0
