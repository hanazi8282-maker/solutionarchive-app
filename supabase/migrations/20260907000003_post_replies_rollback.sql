-- 20260907000003_post_replies_rollback.sql
--
-- 20260907000003 의 롤백. post_replies 테이블과 인덱스를 제거한다.
--
-- ⚠️ 이걸 돌리면 그때까지 수집한 답글 본문이 전부 사라진다. 되돌릴 수 없다.
--    /api/threads/collect-replies 라우트와 vercel.json 의 45분 크론을 먼저 걷어낸
--    다음에 돌린다 — 안 그러면 매시간 이 테이블을 다시 만들려다 실패한다.
-- ⚠️ 적용은 대시보드 SQL Editor 또는 supabase db push 로 사람이(§12-5).

BEGIN;

DROP TABLE IF EXISTS public.post_replies;

COMMIT;
