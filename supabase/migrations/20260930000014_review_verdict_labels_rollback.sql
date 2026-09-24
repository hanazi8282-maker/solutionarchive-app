-- 20260930000014_review_verdict_labels 롤백.
--
-- 잃는 것은 T2 라벨 4칸뿐이다(판정 verdict·사람 채점 human_verdict 는 그대로). 라벨은 재판정하면 다시 생긴다.
-- 되돌린 뒤 야간 배치는 "라벨 미기록(마이그 미적용)" 경고를 남기고 verdict·reason 만 저장한다 — 멈추지 않는다.

ALTER TABLE public.review_relevance_verdicts
  DROP COLUMN IF EXISTS impact,
  DROP COLUMN IF EXISTS frequency,
  DROP COLUMN IF EXISTS community_signal,
  DROP COLUMN IF EXISTS wtp_mentioned;

-- 확인: select count(*) from information_schema.columns
--        where table_schema='public' and table_name='review_relevance_verdicts'
--          and column_name in ('impact','frequency','community_signal','wtp_mentioned');  -- 0
