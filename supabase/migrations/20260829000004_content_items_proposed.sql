-- ============================================================
-- content_items.status 에 'proposed' 추가 — 수집 발견을 소재은행 대기열로
--
-- 설계: docs/review-collection-design.md §7
-- ⛔ 적용은 사용자가 대시보드에서 직접 한다(CLAUDE.md §10).
--
-- ── 왜 필요한가 ──
--
--   경쟁사 리뷰 분석에서 나온 발견(analysis_aspects 중 quadrant='DIFFERENTIATOR'
--   이고 opportunity_score 가 높은 속성 = "중요한데 아무도 못 채운 것")을
--   Threads 소재로 잇는 경로다. 그게 "조사하면서 나온 인사이트를 콘텐츠로"의
--   실체다.
--
--   그런데 자동 생성분을 곧장 status='available' 로 넣으면 안 된다.
--   .claude/commands/threads-draft.md 가 소재를 status=eq.available 로 읽기
--   때문에, 검수되지 않은 소재가 그대로 초안에 쓰인다. 그리고 CLAUDE.md §10
--   의 자동 반영 예외는 인사이트 피드백 루프 한정이지 소재은행까지 넓어진
--   적이 없다.
--
--   'proposed' 를 거치면 threads-draft.md 를 **한 줄도 고치지 않아도** 된다 —
--   이미 available 만 읽으므로 proposed 는 자동으로 안 잡힌다. 사람이 보고
--   available 로 올린 것만 초안에 들어간다.
--
-- ── 왜 별도 마이그레이션인가 ──
--
--   20260829000003 은 리뷰 수집 계층이고 이건 Threads 소재은행이다.
--   관심사가 다르고, 수집을 먼저 굴려 보고 소재 연결은 나중에 열 수도 있다.
--   그때 003 만 적용하고 이건 미루면 된다.
--
-- 영향: 제약을 넓히기만 한다. 기존 행(available/used/retired)은 전부 통과한다.
-- 가역: 동명 rollback 파일 참조.
-- ============================================================

ALTER TABLE public.content_items
  DROP CONSTRAINT IF EXISTS content_items_status_check;

ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_status_check
    CHECK (status = ANY (ARRAY[
      'proposed'::text,   -- 신규: 자동 제안. 사람이 고르기 전까지 초안에 안 잡힌다
      'available'::text,
      'used'::text,
      'retired'::text
    ]));

COMMENT ON COLUMN public.content_items.status IS
  'proposed: 분석에서 자동 제안됨(사람 승인 대기, threads-draft 가 읽지 않는다) / available: 쓸 수 있음 / used: 초안에 쓰임 / retired: 폐기';

-- 자동 제안분의 출처를 남긴다. 어느 분석 프로젝트의 어느 속성에서 나왔는지가
-- 없으면 "이 소재 왜 있지"를 되짚을 방법이 사라진다.
--
-- 둘 다 nullable 이라 기존 행(사람이 만든 소재)은 영향 0 이다.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS source_aspect_id  uuid,
  ADD COLUMN IF NOT EXISTS proposed_at       timestamptz;

ALTER TABLE public.content_items
  DROP CONSTRAINT IF EXISTS content_items_source_aspect_id_fkey;
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_source_aspect_id_fkey
    FOREIGN KEY (source_aspect_id) REFERENCES public.analysis_aspects(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.content_items.source_aspect_id IS
  '자동 제안된 소재의 근거 속성. null = 사람이 만든 소재. 속성이 지워져도 소재는 남는다(ON DELETE SET NULL).';

-- 승인 대기 큐를 사람이 훑는 경로.
CREATE INDEX IF NOT EXISTS content_items_proposed_idx
  ON public.content_items (proposed_at DESC)
  WHERE status = 'proposed';
