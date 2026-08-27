-- ============================================================
-- 20260827000002_posts_draft_status.sql 되돌리기
--
-- ⚠️ 되돌리기 전에 코드를 먼저 되돌릴 것.
--   매처(match-posts)·수집기(collect-metrics)·대시보드 서버액션이 status 로
--   조회·필터하므로, 컬럼이 먼저 사라지면 42703(undefined_column)으로 실패한다.
--
-- ⛔ 초안이 남아 있으면 이 롤백은 **데이터를 파괴한다.**
--   status='draft' 인 행은 published_at 이 null 인데, 아래에서 published_at 을
--   다시 NOT NULL 로 되돌리려면 그 행들이 먼저 없어져야 한다.
--   즉 "아직 발행되지 않은 초안"이 통째로 사라진다.
--
--   실행 전 반드시 확인하고, 살릴 초안이 있으면 먼저 마크다운으로 빼둘 것:
--     SELECT id, status, left(body, 60) AS head, created_at
--       FROM public.posts
--      WHERE status <> 'published'
--      ORDER BY created_at;
--
--   drafts/YYYY-MM-DD.md 파일이 남아 있다면 초안 본문은 거기에도 있다.
--
-- 이 롤백은 posts 를 "발행된 글만 담는 테이블"로 되돌린다.
-- ============================================================

-- ── 1) 초안·폐기분 제거 ──────────────────────────────────────
-- published_at 이 null 인 행은 아래 SET NOT NULL 을 통과할 수 없다.
-- CASCADE 로 해당 글의 metric_snapshots 도 함께 사라진다(초안엔 보통 없다).
DELETE FROM public.posts
 WHERE status <> 'published'
    OR published_at IS NULL;


-- ── 2) 제약·인덱스 제거 ──────────────────────────────────────
DROP INDEX IF EXISTS public.posts_status_idx;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_published_at_required_check;
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;


-- ── 3) published_at 의 NOT NULL 원복 ─────────────────────────
-- 1) 에서 null 행을 지웠으므로 통과한다. 여기서 23502(not_null_violation)가
-- 난다면 1) 의 DELETE 가 0행을 지운 것이다 — 그때는 아래를 확인하라:
--   SELECT count(*) FROM public.posts WHERE published_at IS NULL;
-- baseline 은 posts 에 FORCE ROW LEVEL SECURITY 를 걸지 않으므로 소유자 권한의
-- DELETE 가 RLS 에 막힐 일은 없다. 누군가 나중에 FORCE 를 추가했다면
-- NO FORCE 로 잠깐 풀고 1) 을 다시 실행한 뒤 되걸어야 한다.
ALTER TABLE public.posts
  ALTER COLUMN published_at SET NOT NULL;


-- ── 4) 컬럼 제거 ─────────────────────────────────────────────
ALTER TABLE public.posts DROP COLUMN IF EXISTS permalink;
ALTER TABLE public.posts DROP COLUMN IF EXISTS status;
