-- ============================================================
-- 20260930000035_discovery_transfer_gate
--
-- 발굴 후보에 **이식성 판정**(1인·소규모 SaaS 창업가가 옮겨 쓸 교훈이 있나)과 **무효화 사유** 자리를 만든다.
-- nullable 컬럼 4개 추가뿐.
--
--   transfer_verdict  pass | fail | unverified — 판정자(lib/discovery/transfer.ts)의 세 상태.
--                     NULL = 판정 안 함(이 마이그 이전 행 · VOC 미통과 · 실물 축). NULL 은 통과가 아니다.
--   transfer_lesson   pass 일 때 1인 SaaS 창업가가 가져갈 교훈 한 줄
--   transfer_reason   판정 이유 / 확인 불가 사유
--   human_note        사람이 무효화할 때 남기는 사유(앱이 5자 이상 강제). 제안 프롬프트의 반례로도 쓴다.
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 4개 + CHECK 1개(NULL 허용이라 기존 행은 전부 통과). 백필 없음.
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음. 롤백 파일 있음.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). **코드(PR feat/discovery-transfer-gate)보다 먼저**
--    적용해야 한다: discovery-run 의 loadKnown 이 human_note 를 SELECT 하고 persist 가 transfer_* 를 INSERT 한다.
--   1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) information_schema 로 부재 확인
--   3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 한 줄
-- ============================================================

BEGIN;

ALTER TABLE public.discovery_candidates
  ADD COLUMN IF NOT EXISTS transfer_verdict text,
  ADD COLUMN IF NOT EXISTS transfer_lesson  text,
  ADD COLUMN IF NOT EXISTS transfer_reason  text,
  ADD COLUMN IF NOT EXISTS human_note       text;

ALTER TABLE public.discovery_candidates
  DROP CONSTRAINT IF EXISTS discovery_candidates_transfer_verdict_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_transfer_verdict_check
  CHECK (transfer_verdict IS NULL OR transfer_verdict IN ('pass', 'fail', 'unverified'));

COMMENT ON COLUMN public.discovery_candidates.transfer_verdict IS
  '이식성 판정(pass/fail/unverified). NULL=판정 안 함(레거시·VOC 미통과·실물 축) — 통과가 아니다. '
  'DISCOVERY_TRANSFER_GATE=on 이면 fail·unverified 는 프로젝트를 만들지 않는다, shadow 면 기록만 한다.';
COMMENT ON COLUMN public.discovery_candidates.transfer_lesson IS
  '판정자가 적은, 1인 SaaS 창업가가 가져갈 구체적 교훈(pass 일 때).';
COMMENT ON COLUMN public.discovery_candidates.transfer_reason IS
  '이식성 판정 이유 또는 확인 불가 사유.';
COMMENT ON COLUMN public.discovery_candidates.human_note IS
  '사람이 무효화한 사유. 다음 발굴의 제안 프롬프트에 반례로 들어간다.';

COMMIT;

-- 적용 후 확인
--   양성: SELECT column_name FROM information_schema.columns
--          WHERE table_schema='public' AND table_name='discovery_candidates'
--            AND column_name IN ('transfer_verdict','transfer_lesson','transfer_reason','human_note');
--         기대: 4행
--   음성(롤백되는 형태 — 데이터 안 남음):
--     BEGIN;
--       UPDATE public.discovery_candidates SET transfer_verdict='maybe'
--        WHERE id = (SELECT id FROM public.discovery_candidates LIMIT 1);
--       -- 기대: 23514 check_violation
--     ROLLBACK;
--   기존 행 무변경: SELECT count(*) FROM public.discovery_candidates WHERE transfer_verdict IS NOT NULL;  -- 기대 0
