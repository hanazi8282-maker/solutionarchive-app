-- ============================================================
-- 롤백: 20260829000004_content_items_proposed.sql
--
-- ⚠️ status='proposed' 인 행이 있으면 제약 복원이 실패한다.
--    아래 A 단계로 먼저 확인할 것. 있으면 판단이 필요하다:
--      - 그 제안들을 살릴 거면 available 로 올리거나 retired 로 내린다
--      - 버릴 거면 지운다
--    자동으로 어느 쪽이든 밀어넣지 않는다 — 사람이 고를 소재 목록이다.
-- ============================================================


-- ── A) 막히는 행 확인 (먼저 이것만 실행) ────────────────────
SELECT count(*) AS proposed_rows_blocking_rollback
  FROM public.content_items
 WHERE status = 'proposed';

-- 무엇이 걸려 있는지 눈으로 볼 것.
SELECT code, title, proposed_at
  FROM public.content_items
 WHERE status = 'proposed'
 ORDER BY proposed_at DESC;


-- ── B) 추가 컬럼 제거 ───────────────────────────────────────
DROP INDEX IF EXISTS public.content_items_proposed_idx;

ALTER TABLE public.content_items
  DROP CONSTRAINT IF EXISTS content_items_source_aspect_id_fkey;

ALTER TABLE public.content_items
  DROP COLUMN IF EXISTS source_aspect_id,
  DROP COLUMN IF EXISTS proposed_at;


-- ── C) 제약 복원 ────────────────────────────────────────────
--
-- ⛔ A 단계 결과가 0 일 때만 실행할 것.
ALTER TABLE public.content_items
  DROP CONSTRAINT IF EXISTS content_items_status_check;

ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_status_check
    CHECK (status = ANY (ARRAY['available'::text, 'used'::text, 'retired'::text]));

COMMENT ON COLUMN public.content_items.status IS NULL;
