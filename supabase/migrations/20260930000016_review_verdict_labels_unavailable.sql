-- ============================================================
-- 20260930000016_review_verdict_labels_unavailable
--
-- T2 라벨 "불가" 표시 — 모델이 라벨 4개(impact·frequency·community_signal·wtp_mentioned)를
-- 일관되게 전부 null 로 돌려주는 행을 미해결 잔여로 계속 세지 않게 한다.
--
-- 왜: 2026-09-25 남헌이 소급을 2회 돌린 뒤 남은 34행은 평판·의견성 글(YouTube 댓글 19·HN 12·다나와 3)이라
--     영향·빈도·신호·지불의사 어느 축에도 안 걸린다. 재실행마다 같은 34행이 다시 대상이 돼 호출 5회씩 헛돈다.
--     "라벨이 비었다"(아직 안 함)와 "라벨이 없다"(할 게 없음)를 컬럼 하나로 가른다(§7.1 3상태).
--
-- 🟢 비파괴. nullable ADD COLUMN 1개 + 허용값 CHECK. 기존 행·컬럼은 건드리지 않는다.
--     읽는 자리: scripts/relevance-labels-backfill.mjs 대상 선정(IS NULL 만). 공개 화면(lib/signals/feed.ts)은
--     라벨 값으로만 거르므로 이 컬럼과 무관하다.
-- 롤백: 20260930000016_review_verdict_labels_unavailable_rollback.sql
-- ============================================================

ALTER TABLE public.review_relevance_verdicts
  ADD COLUMN IF NOT EXISTS labels_unavailable_reason text
    CHECK (labels_unavailable_reason IS NULL OR labels_unavailable_reason IN ('opinion_no_pain_signal'));

COMMENT ON COLUMN public.review_relevance_verdicts.labels_unavailable_reason IS
  'T2 라벨을 붙일 수 없는 이유. NULL = 해당 없음(라벨이 있거나 아직 시도 중). opinion_no_pain_signal = 평판·의견성 글이라 4축 어디에도 안 걸림(사람/CEO-STAFF 가 표시). 소급 스크립트는 이 값이 있는 행을 대상에서 뺀다.';

-- 확인 쿼리
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'review_relevance_verdicts' AND column_name = 'labels_unavailable_reason';
--   SELECT labels_unavailable_reason, count(*) FROM public.review_relevance_verdicts GROUP BY 1;
