-- ============================================================
-- 20261001000053_idea_query_log_pmf_run_id_no_action — idea_query_log.pmf_run_id: idea_pmf_runs FK, ON DELETE NO ACTION
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
--    선행: 20261001000049(idea_pmf_runs). 20261001000050 과 순서 무관하게 같은 끝 상태가 되도록 썼다.
-- 근거: 남헌 결정 2026-10-01(v10) — idea_query_log.pmf_run_id 는 nullable uuid · idea_pmf_runs FK · ON DELETE **NO ACTION**
--   (영구 보관 정책: run 이 지워져 로그의 연결이 조용히 NULL 이 되는 일이 없어야 한다).
-- 20261001000050 이 같은 컬럼을 ON DELETE SET NULL 로 이미 정의한다(000050 머지됨, 적용 여부는 이 파일 작성 시점에 확인 불가).
--   그래서 이 파일은 (a) 컬럼이 없으면 만들고 (b) pmf_run_id 위의 FK 를 이름 추측 없이 조회해 지운 뒤 (c) NO ACTION 으로 다시 건다.
--   000050 을 나중에 적용해도 ADD COLUMN IF NOT EXISTS 가 통째로 건너뛰어(REFERENCES 포함) NO ACTION 이 유지된다.
-- 🟢 비파괴: 컬럼 추가(NULL 허용) · FK 삭제 동작만 변경. 기존 값 불변(SET NULL→NO ACTION 은 기존 행을 검증만 한다).
-- 코드: lib/cases/idea-pmf-run.ts logQuery 가 source='pmf_api' 행에 pmf_run_id 를 이미 싣는다(P3, #406) — 코드 변경 없음.
-- ============================================================

BEGIN;

ALTER TABLE public.idea_query_log ADD COLUMN IF NOT EXISTS pmf_run_id uuid;

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'public.idea_query_log'::regclass AND con.contype = 'f' AND a.attname = 'pmf_run_id'
  LOOP
    EXECUTE format('ALTER TABLE public.idea_query_log DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_pmf_run_id_fkey
  FOREIGN KEY (pmf_run_id) REFERENCES public.idea_pmf_runs (id) ON DELETE NO ACTION;

COMMENT ON COLUMN public.idea_query_log.pmf_run_id IS
  'source=pmf_api 행의 idea_pmf_runs.id(limited 도 행이 있다). ON DELETE NO ACTION — 영구 보관(남헌 2026-10-01 v10). run_id 는 idea_angle_runs 전용. 20261001000050 · 20261001000053';

-- 적용 가드: pmf_run_id FK 가 정확히 1개이고 NO ACTION('a') 이 아니면 전체 롤백.
DO $$
DECLARE fk text;
BEGIN
  SELECT string_agg(con.confdeltype::text, ',') INTO fk FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
   WHERE con.conrelid = 'public.idea_query_log'::regclass AND con.contype = 'f' AND a.attname = 'pmf_run_id';
  IF fk IS DISTINCT FROM 'a' THEN
    RAISE EXCEPTION 'pmf_run_id fk guard: expected one NO ACTION fk, got %', fk;
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 (양성·음성, 음성은 롤백되는 형태) ─────────────────
-- 1) 컬럼: pmf_run_id uuid · is_nullable YES
--    SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'idea_query_log' AND column_name = 'pmf_run_id';
-- 2) FK 1개 · confdeltype 'a'(NO ACTION) · 참조 idea_pmf_runs
--    SELECT conname, confdeltype, confrelid::regclass FROM pg_constraint WHERE conrelid = 'public.idea_query_log'::regclass AND contype = 'f';
-- 3) 음성: 없는 pmf_run_id → 23503 (000050 의 source CHECK 가 있으면 source='pmf_api' 로 넣는다)
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source, pmf_run_id) VALUES ('x', 'x', 'saas', 'new', 'pmf_api', gen_random_uuid()); ROLLBACK;
-- 4) 음성: 로그가 가리키는 run DELETE → 23503 (SET NULL 이면 통과해 버린다 — 이게 이 파일이 막는 것)
--    BEGIN; WITH r AS (INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by)
--      VALUES ('x', 'x', 'saas', 'x', 'done', 'x@x.io') RETURNING id)
--      INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source, pmf_run_id) SELECT 'x', 'x', 'saas', 'new', 'pmf_api', id FROM r;
--    DELETE FROM public.idea_pmf_runs WHERE requested_by = 'x@x.io'; ROLLBACK;   -- 23503 기대
-- 5) 기존 행 불변: SELECT source, count(*), count(pmf_run_id) FROM public.idea_query_log GROUP BY 1;
