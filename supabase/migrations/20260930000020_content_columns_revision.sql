-- ============================================================
-- 20260930000020_content_columns_revision
--
-- 칼럼 전수검수(남헌 2026-09-25 결정 4) — claude-cli 가 미발행 초안의 문체·가독성을 고쳐 쓴 **수정본을 원문과 나란히** 둔다.
-- 원문(body)은 덮어쓰지 않는다. 남헌이 /columns 에서 전/후를 보고 재승인한다(자동 발행 아님, §10 그대로).
--
-- 🟢 비파괴. nullable ADD COLUMN 5개 + CHECK.
--   body_revised      — 수정본 전문(마크다운). NULL = 수정본 없음.
--   revision_summary  — 무엇을 왜 고쳤는지 한 단락(모델 출력).
--   revision_status   — 'pending'(재승인 대기) | 'approved'(수정본 채택) | 'rejected'(원문 유지). NULL = 수정본 없음.
--   revised_by        — 모델 라벨(예: claude-cli · claude-opus-5). revised_at — 시각.
--   review_status(draft/approved/rejected)는 그대로다 — 재승인은 revision_status 로 가른다.
-- 롤백: 20260930000020_content_columns_revision_rollback.sql
-- ============================================================

ALTER TABLE public.content_columns
  ADD COLUMN IF NOT EXISTS body_revised     text,
  ADD COLUMN IF NOT EXISTS revision_summary text,
  ADD COLUMN IF NOT EXISTS revision_status  text
    CHECK (revision_status IS NULL OR revision_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS revised_by       text,
  ADD COLUMN IF NOT EXISTS revised_at       timestamptz;

COMMENT ON COLUMN public.content_columns.body_revised IS '검수 모델이 고쳐 쓴 수정본 전문. 원문 body 는 그대로. 사람이 revision_status 로 채택/기각한다.';
COMMENT ON COLUMN public.content_columns.revision_status IS 'pending = 재승인 대기(사람이 전/후 비교) · approved = 수정본 채택 · rejected = 원문 유지. NULL = 수정본 없음.';

-- 확인 쿼리
--   SELECT slug, review_status, revision_status, length(body_revised) FROM public.content_columns ORDER BY staged_at DESC;
