-- ============================================================
-- 20261001000052_idea_pmf_retention_rls — PMF 판정 표 영구 보관 + 본인 행 SELECT 정책
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
--    선행: 20261001000049(idea_pmf_runs · idea_pmf_answers).
-- 근거: 남헌 결정 2026-10-01(v10) — idea_pmf_runs / idea_pmf_answers 영구 보관, 본인 행만 SELECT.
--
-- 1) 영구 보관: 앱 코드에 삭제·TTL·정리 코드는 없다(lib/cases/idea-pmf-run.ts 는 insert/update/select 만,
--    청소 sweepStale 은 status 를 failed 로 바꿀 뿐 행을 지우지 않는다 — 2026-10-01 grep 실측).
--    남은 삭제 경로는 000049 의 idea_pmf_answers.run_id ON DELETE CASCADE 하나 → NO ACTION 으로 바꾼다
--    (run 을 지우려 하면 답변이 있는 한 23503 으로 막힌다). 기존 행·값 불변.
-- 2) RLS 정책: 정책 0 → 표마다 SELECT 1개. 소유자 = requested_by(허용목록 이메일, lib/auth/policy.ts 가 trim·소문자로 저장).
--    이 표에는 auth.users.id(uuid) 컬럼이 없어 auth.uid() 로 직접 비교할 수 없다 — 같은 사용자의 JWT email 클레임으로 비교한다.
--    answers 는 소유자 컬럼이 없어 run_id → idea_pmf_runs.requested_by 로 판정한다.
--    ⚠️ 앱은 전부 service_role(lib/supabase/server.ts)이라 이 정책을 **우회**한다 — 앱 동작은 바뀌지 않는다.
--       앱의 본인 행 제한은 코드(.eq('requested_by'))가 한다. 이 정책은 authenticated 키로 PostgREST 를 직접 때릴 때의 천장이다.
--    INSERT/UPDATE/DELETE 정책은 만들지 않는다 = authenticated·anon 은 쓰기 불가(service_role 전용 그대로).
-- ============================================================

BEGIN;

-- 1) answers → runs FK: CASCADE → NO ACTION. 000049 는 이름 없이 인라인으로 만들었다 — 추측하지 않고 조회해 지운다.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.idea_pmf_answers'::regclass AND con.contype = 'f'
       AND con.confrelid = 'public.idea_pmf_runs'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.idea_pmf_answers DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.idea_pmf_answers ADD CONSTRAINT idea_pmf_answers_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.idea_pmf_runs (id) ON DELETE NO ACTION;

-- 2) 본인 행 SELECT. (select …) 로 감싸 행마다 다시 계산하지 않게 한다(initplan).
DROP POLICY IF EXISTS idea_pmf_runs_select_own ON public.idea_pmf_runs;
CREATE POLICY idea_pmf_runs_select_own ON public.idea_pmf_runs
  FOR SELECT TO authenticated
  USING (requested_by = (SELECT lower(trim(auth.jwt() ->> 'email'))));

DROP POLICY IF EXISTS idea_pmf_answers_select_own ON public.idea_pmf_answers;
CREATE POLICY idea_pmf_answers_select_own ON public.idea_pmf_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.idea_pmf_runs r
     WHERE r.id = idea_pmf_answers.run_id
       AND r.requested_by = (SELECT lower(trim(auth.jwt() ->> 'email')))
  ));

COMMENT ON POLICY idea_pmf_runs_select_own ON public.idea_pmf_runs IS
  '본인 행만 SELECT(JWT email = requested_by). 앱은 service_role 이라 이 정책을 우회한다 — 직접 PostgREST 접근의 천장. 20261001000052';
COMMENT ON POLICY idea_pmf_answers_select_own ON public.idea_pmf_answers IS
  '본인 run 의 답변만 SELECT(run_id → idea_pmf_runs.requested_by). 앱은 service_role 이라 우회한다. 20261001000052';

-- 적용 가드: 정책이 표마다 정확히 1개, FK 가 NO ACTION 1개가 아니면 전체 롤백.
DO $$
DECLARE p_runs int; p_ans int; fk text;
BEGIN
  SELECT count(*) INTO p_runs FROM pg_policies WHERE schemaname = 'public' AND tablename = 'idea_pmf_runs';
  SELECT count(*) INTO p_ans  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'idea_pmf_answers';
  SELECT string_agg(con.confdeltype::text, ',') INTO fk FROM pg_constraint con
   WHERE con.conrelid = 'public.idea_pmf_answers'::regclass AND con.contype = 'f' AND con.confrelid = 'public.idea_pmf_runs'::regclass;
  IF p_runs <> 1 OR p_ans <> 1 OR fk IS DISTINCT FROM 'a' THEN
    RAISE EXCEPTION 'pmf retention/rls guard: policies runs=% answers=% fk_deltype=%', p_runs, p_ans, fk;
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 (양성·음성, 음성은 롤백되는 형태) ─────────────────
-- 1) 정책 각 1개 · cmd SELECT · roles {authenticated}
--    SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE tablename IN ('idea_pmf_runs', 'idea_pmf_answers');
-- 2) FK 삭제 동작 'a'(NO ACTION) — 'c'(CASCADE) 가 아니어야 한다
--    SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'public.idea_pmf_answers'::regclass AND contype = 'f';
-- 3) 음성: 답변 있는 run DELETE → 23503
--    BEGIN; WITH r AS (INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by)
--      VALUES ('x', 'x', 'saas', 'x', 'awaiting_answers', 'x@x.io') RETURNING id)
--      INSERT INTO public.idea_pmf_answers (run_id, question_id, factor, question) SELECT id, 'q1', 'f', 'q' FROM r;
--    DELETE FROM public.idea_pmf_runs WHERE requested_by = 'x@x.io'; ROLLBACK;   -- 23503 기대
-- 4) 양성·음성: authenticated 로 본인/남의 행 (롤백)
--    BEGIN; INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by)
--      VALUES ('x', 'x', 'saas', 'x', 'done', 'me@x.io'), ('y', 'y', 'saas', 'y', 'done', 'other@x.io');
--    SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"email":"Me@x.io"}', true);
--    SELECT requested_by FROM public.idea_pmf_runs;   -- me@x.io 1행만
--    ROLLBACK;
-- 5) 음성: anon 은 0행
--    BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.idea_pmf_runs; ROLLBACK;   -- 0
