-- ============================================================
-- 20261001000050_idea_query_log_source_pmf_api — idea_query_log 에 PMF 판정 POST 출처(pmf_api) 추가
--
-- ⛔ 미적용 — 적용은 세션 자체 판단(§10.2, 예외 5개 해당 없음: CHECK 값 추가 · NULL 허용 컬럼 추가만. 기존 행·값 불변,
--    롤백 파일 있음). 서브에이전트가 파일만 만들었다. 선행: 20261001000048 · 20261001000049. 적용 후 docs/migration-exceptions.md 에 한 줄.
-- 정본: reports/2026-10-01/design-direction-pmf-judgment.md A4 끝 · A7 "idea_query_log 기록".
--
-- PMF POST 1회 = 1행(source='pmf_api', outcome new/cache_hit/limited/failed — 어휘 그대로). PUT 은 기록하지 않는다.
-- ⚠️ 설계 문서와 다른 점 하나: 문서는 "run_id 에 idea_pmf_runs.id 를 넣고 FK 는 걸지 않는다" 인데, 실물 run_id 는
--    이미 idea_angle_runs(id) FK 다(20261001000046 L46) — PMF id 를 넣으면 23503 으로 죽는다. 그래서 run_id 는 앵글 전용으로
--    두고 **pmf_run_id** 컬럼을 새로 둔다(idea_pmf_runs FK, ON DELETE SET NULL). 출처별로 한쪽만 채운다(CHECK).
-- ============================================================

BEGIN;

-- source CHECK 교체: 000048 이 이름을 붙였지만(idea_query_log_source_check) 추측하지 않고 정의로 조회해 지운다.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.idea_query_log'::regclass AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.idea_query_log DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_source_check
  CHECK (source IN ('angle_api', 'report_view', 'pmf_api'));

ALTER TABLE public.idea_query_log
  ADD COLUMN IF NOT EXISTS pmf_run_id uuid REFERENCES public.idea_pmf_runs (id) ON DELETE SET NULL;
-- 한 행은 한 표만 가리킨다: pmf_api 행은 run_id(앵글) NULL, 그 밖의 행은 pmf_run_id NULL. 기존 행은 전부 pmf_run_id NULL 이라 통과.
ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_run_matches_source
  CHECK (CASE WHEN source = 'pmf_api' THEN run_id IS NULL ELSE pmf_run_id IS NULL END);

COMMENT ON COLUMN public.idea_query_log.source IS 'angle_api | report_view | pmf_api. 같은 사람이 리포트 보고 앵글·PMF 까지 돌리면 세 행이다 — source 로 갈라 센다.';
COMMENT ON COLUMN public.idea_query_log.pmf_run_id IS 'source=pmf_api 행의 idea_pmf_runs.id(limited 도 행이 있다). run_id 는 idea_angle_runs 전용 — source 로 어느 표인지 가른다. 20261001000050';

COMMIT;

-- ── 적용 후 확인 (양성·음성, 전부 롤백되는 형태) ─────────────────
-- 1) 제약: source CHECK 1개에 'pmf_api' 포함 · run_matches_source 1개 · pmf_run_id FK
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.idea_query_log'::regclass AND contype IN ('c', 'f');
-- 2) 기존 행 불변: pmf_run_id 전부 NULL
--    SELECT source, count(*), count(pmf_run_id) FROM public.idea_query_log GROUP BY 1;
-- 3) 양성: pmf_api 행(pmf_run_id NULL 도 허용 — 입력 검증 전 실패 등)
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, requested_by, outcome, source) VALUES ('x', 'x', 'saas', 'x', 'new', 'pmf_api'); ROLLBACK;
-- 4) 음성: 어휘 밖 source → 23514 / pmf_api 인데 run_id(앵글) 채움 → 23514 / 없는 pmf_run_id → 23503
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source) VALUES ('x', 'x', 'saas', 'new', 'bogus'); ROLLBACK;
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source, run_id) SELECT 'x', 'x', 'saas', 'new', 'pmf_api', id FROM public.idea_angle_runs LIMIT 1; ROLLBACK;
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source, pmf_run_id) VALUES ('x', 'x', 'saas', 'new', 'pmf_api', gen_random_uuid()); ROLLBACK;
