-- ============================================================
-- 20260930000015_analysis_inputs_purge_reason
--
-- analysis_inputs.purged_at 이 두 가지 뜻을 한 컬럼에 싣고 있다 — 이유를 따로 적는다.
--   · 'retention' — 30일 원문 폐기 배치(lib/review/purge.ts purgePatch → raw_text NULL)
--   · 'dedupe'    — 중복 정리 소프트 처리(마이그 000012 1회성, raw_text 보존)
-- 왜: 랜딩 소스 타일 등 "누적 수집" 집계가 purged_at IS NULL 만 세면 30일 보관분이
--   된다. 누적(중복 정리분만 제외) = purge_reason IS DISTINCT FROM 'dedupe'.
--
-- 불변식(코드가 지킨다, CHECK 로 강제하지 않는다):
--   purged_at IS NOT NULL ⇒ purge_reason IS NOT NULL
--   CHECK 로 걸면 백필 전 기존 행·컬럼 미적용 상태의 배치가 깨진다. CHECK 는 값 범위만.
--   30일 배치가 이미 dedupe 로 찍힌 행의 원문을 비울 때는 purged_at·purge_reason 을
--   덮지 않는다(raw_text 만 비운다) — 'dedupe' 가 'retention' 으로 바뀌면 누적 집계에 다시 섞인다.
--
-- 적용 4조건 (남헌 2026-09-24 5차 판단 4번):
--   1) 드라이런 — 아래 D-1~D-3 를 먼저 돌려 숫자를 본다
--   2) 롤백파일 — 20260930000015_analysis_inputs_purge_reason_rollback.sql
--   3) 무중단 — nullable 컬럼 추가(메타데이터만, 테이블 재작성 없음) + 50행 UPDATE.
--      읽는 코드(.is('purged_at', null))는 이 컬럼을 모른다 — 영향 없음.
--      쓰는 코드(review-purge.mjs)는 컬럼이 없으면 PGRST204 경고 후 옛 패치로 폴백한다.
--   4) Notion 기록 — 적용 후 결정 로그/일일 상태 로그에 드라이런·확인 숫자 기록
--
-- ── 드라이런 (적용 전) ────────────────────────────────────────
-- D-1) 백필 대상 — 예상 50
--   SELECT count(*) FROM public.analysis_inputs
--    WHERE id IN (SELECT input_id FROM public.review_dedupe_soft_purges);
-- D-2) purged_at 찍힌 행 전체와 대조 — 예상 total 50 · in_dedupe 50 · raw_null 0
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE id IN (SELECT input_id FROM public.review_dedupe_soft_purges)) AS in_dedupe,
--          count(*) FILTER (WHERE raw_text IS NULL) AS raw_null
--     FROM public.analysis_inputs WHERE purged_at IS NOT NULL;
-- D-3) 컬럼이 아직 없는지 — 예상 0행
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='analysis_inputs' AND column_name='purge_reason';
--
-- ── 확인 (적용 후) ───────────────────────────────────────────
-- 양성) dedupe 50 · 그 50행 모두 purged_at NOT NULL
--   SELECT purge_reason, count(*), count(*) FILTER (WHERE purged_at IS NOT NULL) AS purged
--     FROM public.analysis_inputs GROUP BY 1;
-- 음성) 불변식 위반 0 — purged_at 있는데 이유 없음
--   SELECT count(*) FROM public.analysis_inputs WHERE purged_at IS NOT NULL AND purge_reason IS NULL;
-- 음성) 이유 있는데 purged_at 없음 0
--   SELECT count(*) FROM public.analysis_inputs WHERE purged_at IS NULL AND purge_reason IS NOT NULL;
-- 음성) 범위 밖 값 거부 — 에러가 나야 정상(트랜잭션 안에서 ROLLBACK)
--   BEGIN; UPDATE public.analysis_inputs SET purge_reason='x' WHERE id=(SELECT id FROM public.analysis_inputs LIMIT 1); ROLLBACK;
--
-- 롤백: 20260930000015_analysis_inputs_purge_reason_rollback.sql
--   ⚠️ 000012 를 롤백할 일이 있으면 이 파일의 롤백을 먼저 돌린다(안 그러면 purged_at NULL · purge_reason 'dedupe' 행이 남는다).
-- ============================================================

ALTER TABLE public.analysis_inputs
  ADD COLUMN IF NOT EXISTS purge_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'analysis_inputs_purge_reason_check'
                    AND conrelid = 'public.analysis_inputs'::regclass) THEN
    ALTER TABLE public.analysis_inputs
      ADD CONSTRAINT analysis_inputs_purge_reason_check
      CHECK (purge_reason IS NULL OR purge_reason IN ('retention', 'dedupe'));
  END IF;
END $$;

COMMENT ON COLUMN public.analysis_inputs.purge_reason IS
  'purged_at 을 찍은 이유. retention = 30일 원문 폐기(raw_text NULL), dedupe = 중복 정리 소프트 처리(raw_text 보존, review_dedupe_soft_purges). 불변식: purged_at IS NOT NULL ⇒ purge_reason IS NOT NULL (코드가 지킨다). 누적 집계는 purge_reason IS DISTINCT FROM ''dedupe''.';

-- 백필 — 재실행 안전(IS NULL 조건). 드라이런 D-1 과 같은 행 수여야 한다.
UPDATE public.analysis_inputs
   SET purge_reason = 'dedupe'
 WHERE purge_reason IS NULL
   AND id IN (SELECT input_id FROM public.review_dedupe_soft_purges);
