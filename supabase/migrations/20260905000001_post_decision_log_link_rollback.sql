-- ============================================================
-- 롤백: 20260905000001_post_decision_log_link.sql  (Option B)
--
-- ⛔ 적용도 롤백도 남헌이 Supabase 대시보드에서 직접 실행한다.
--
-- ⚠️ 파괴적이다. 이 테이블에 쌓인 "글 ↔ 판정" 연결이 전부 사라진다.
--    그 연결은 마크다운 판정 로그에 **없는 정보**다 (로그는 어떤 글이
--    발행됐는지를 모른다). 지우면 score-predictions.mjs 의 신뢰도(§5)
--    계산 근거가 없어지고, 되살리려면 사람이 다시 이어야 한다.
--
--    그러므로 DROP 전에 반드시 내용을 먼저 본다:
--
--      SELECT count(*) FROM public.post_decision_link;
--      SELECT * FROM public.post_decision_link ORDER BY created_at;
--
--    0 행이 아니면 백업부터:
--
--      CREATE TABLE public.post_decision_link_backup_20260905 AS
--      SELECT * FROM public.post_decision_link;
--
-- 반대로, Option A 롤백과 달리 **posts 테이블은 전혀 건드리지 않는다.**
-- 제품 트랙에 DDL 이 가지 않는다는 게 (B) 를 택한 이유 2번이었다.
-- ============================================================

-- 1) 인덱스 (테이블을 떨구면 같이 사라지지만, 부분 롤백을 할 수도 있어 명시한다)
DROP INDEX IF EXISTS public.post_decision_link_paired_idx;
DROP INDEX IF EXISTS public.post_decision_link_code_idx;

-- 2) 테이블
--    RESTRICT 를 쓴다. 이 테이블에 뷰·FK 가 붙은 게 있으면 여기서 멈추는 게 맞다.
--    CASCADE 로 자동으로 지워 버리면 무엇이 같이 사라졌는지 모른다.
DROP TABLE IF EXISTS public.post_decision_link RESTRICT;

-- ────────────────────────────────────────────────────────────
-- 3) 롤백 확인 (양성·음성 둘 다 — CLAUDE.md §7.1)
-- ────────────────────────────────────────────────────────────
--   -- 0 행이어야 함
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'post_decision_link';
--
--   -- posts 가 그대로인지 (이 롤백은 posts 를 건드리지 않았어야 한다)
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'posts'
--      AND column_name = 'decision_log_code';   -- 0 이어야 함 (A 를 적용한 적 없으므로)
-- ============================================================
