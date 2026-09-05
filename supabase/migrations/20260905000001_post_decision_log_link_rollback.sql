-- ============================================================
-- 20260905000001_post_decision_log_link.sql 되돌리기
--
-- ⛔ 아직 적용하지 않았다. 원본도 미적용이므로 이 파일도 지금은 돌릴 일이 없다.
--
-- ⚠️ 이 롤백은 **데이터를 파괴한다.** decision_log_code 에 채워진 값은
--   posts 행 어디에도 남지 않는다. 그 값은 "이 글이 어느 판정에서 나왔는가"라는
--   정보이고, 지표에서 규칙으로 되돌아가는 유일한 다리다. 지우면 그 다리가
--   끊기고, 이미 계산된 규칙 신뢰도(§5)의 근거를 재현할 수 없게 된다.
--
--   실행 전 반드시 빼둘 것:
--     SELECT id, external_id, published_at, decision_log_code
--       FROM public.posts
--      WHERE decision_log_code IS NOT NULL
--      ORDER BY published_at;
--
-- ⚠️ 코드를 먼저 되돌릴 것. score-predictions.mjs 가 이 컬럼으로 조회하므로
--   컬럼이 먼저 사라지면 42703(undefined_column)으로 실패한다.
-- ============================================================

DROP INDEX IF EXISTS public.posts_decision_log_code_idx;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_decision_log_code_format_check;

ALTER TABLE public.posts
  DROP COLUMN IF EXISTS decision_log_code;
