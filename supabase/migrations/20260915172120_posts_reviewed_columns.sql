-- ============================================================
-- 20260915172120_posts_reviewed_columns
--
-- posts 검토 이력 — /dashboard 발행 전 검수(승인/반려) 화면 신설(2026-09-16, PR #104).
--
-- ⚠️ 이 파일은 사후 문서화다. 실제 DB에는 이미 적용돼 있다
--   (supabase_migrations.schema_migrations 에 version 20260915172120,
--    프로젝트 소유자 계정으로 기록됨 — Supabase 대시보드/MCP로
--    직접 적용되고 리포에는 파일이 없던 상태였다. 2026-09-16 CEO-STAFF
--    세션이 마이그레이션 이력 대조 중 발견해 원본 SQL 그대로 복원했다).
--
-- 순수 추가. status 는 그대로(pending_review→discarded 는 기존 vocabulary 안).
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.posts.reviewed_at IS
  '사람이 /dashboard 발행 전 검수에서 승인(그대로 두거나 수정 반영)·반려(discarded) 한 시각. 승인은 status 를 안 바꾼다 — pending_review 자체가 이미 "발행 대기".';
COMMENT ON COLUMN public.posts.reviewed_by IS '검수한 로그인 이메일.';
COMMENT ON COLUMN public.posts.review_note IS '반려 사유(선택) 또는 승인 메모.';
