-- ============================================================
-- 롤백: 20260829000003_review_collection.sql
--
-- ⚠️⚠️ 되돌릴 수 없는 지점이 하나 있다. 실행 전에 반드시 읽을 것.
--
--   원본 마이그레이션은 analysis_inputs.raw_text 의 NOT NULL 을 풀었다.
--   폐기 배치가 한 번이라도 돌았다면 raw_text 가 null 인 행이 존재하고,
--   그 상태에서 NOT NULL 을 다시 걸면 실패한다. **그 원문은 이미 없다 —
--   복구할 방법이 없다.**
--
--   아래 A 단계가 그 상황을 먼저 확인시킨다. 건수가 0 이 아니면 멈추고
--   판단할 것. 선택지는 둘이다:
--     (1) NOT NULL 복원을 포기한다(나머지는 롤백하고 이 제약만 둔다)
--     (2) null 행을 지운다 — 그 입력에서 나온 analysis_aspects 와의
--         연결이 끊긴다. 권하지 않는다.
--
-- ⚠️ 지문을 지우면 증분 수집이 처음부터 다시 돈다. 이미 수집한 리뷰를
--    전부 다시 긁게 되고, analysis_inputs 에 중복이 쌓인다.
--    수집을 잠시 멈추고 싶은 것뿐이라면 롤백하지 말고 이렇게 할 것:
--      UPDATE review_sources SET enabled = false, disabled_reason = '...';
-- ============================================================


-- ── A) 되돌릴 수 없는 지점 확인 (먼저 이것만 실행할 것) ──────
--
-- 결과가 0 이 아니면 아래 D 단계의 NOT NULL 복원이 실패한다.
SELECT count(*) AS purged_rows_cannot_restore
  FROM public.analysis_inputs
 WHERE raw_text IS NULL;


-- ── B) 새 테이블 제거 ────────────────────────────────────────
-- 순서는 FK 역순이다. fingerprints / targets / runs 가 review_sources 를
-- 참조하므로 sources 가 마지막이다.
DROP TABLE IF EXISTS public.review_fingerprints;
DROP TABLE IF EXISTS public.review_targets;
DROP TABLE IF EXISTS public.review_collection_runs;

-- analysis_inputs 의 FK 가 review_sources 를 물고 있으므로 먼저 푼다.
ALTER TABLE public.analysis_inputs
  DROP CONSTRAINT IF EXISTS analysis_inputs_source_key_fkey;

DROP TABLE IF EXISTS public.review_sources;


-- ── C) analysis_inputs 확장 되돌리기 ─────────────────────────
DROP INDEX IF EXISTS public.analysis_inputs_purgeable_idx;

ALTER TABLE public.analysis_inputs
  DROP CONSTRAINT IF EXISTS analysis_inputs_purge_trace_check;

ALTER TABLE public.analysis_inputs
  DROP COLUMN IF EXISTS source_key,
  DROP COLUMN IF EXISTS collected_at,
  DROP COLUMN IF EXISTS purged_at;


-- ── D) raw_text NOT NULL 복원 ────────────────────────────────
--
-- ⛔ A 단계 결과가 0 일 때만 실행할 것. 0 이 아니면 이 문장은 실패하고,
--    실패하는 게 맞다 — 조용히 성공하면 데이터가 없어진 사실이 묻힌다.
ALTER TABLE public.analysis_inputs
  ALTER COLUMN raw_text SET NOT NULL;
