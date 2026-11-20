-- v71cu S7/S9 v2: 발굴 실행 기록(후보→타깃 연결 수) + 새 도메인 시험 기록 + 언급 후보 채택 조건 보정. 추가 전용·멱등. ⛔ 미적용(적용은 세션, §10.2). 롤백: 20261120000001_discovery_v2_log_rollback.sql
BEGIN;

-- 통로별 하루 실행 기록: 후보 수·연결(프로젝트+타깃 등록) 수·일반어 제외 수·요청 수·중단 사유.
CREATE TABLE IF NOT EXISTS public.discovery_run_log (
  id bigserial PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL CHECK (channel IN ('mention','chart','search','community')),
  candidates int NOT NULL DEFAULT 0, linked int NOT NULL DEFAULT 0, rejected_generic int NOT NULL DEFAULT 0, requests int NOT NULL DEFAULT 0,
  stopped text, detail jsonb);
CREATE INDEX IF NOT EXISTS discovery_run_log_run_at_idx ON public.discovery_run_log (run_at DESC);

-- 새 도메인 시험 기록(같은 도메인을 매일 다시 시험하지 않기 위한 장부). source_candidates 에 안 오른 실패(지문 없음·접속 불가)도 남는다.
CREATE TABLE IF NOT EXISTS public.source_probe_log (
  domain text PRIMARY KEY, probed_at timestamptz NOT NULL DEFAULT now(), outcome text NOT NULL, engine text, requests int NOT NULL DEFAULT 0);

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['discovery_run_log','source_probe_log'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t); END LOOP; END $$;

-- 통로별 연결 수(완료 기준 쿼리용).
CREATE OR REPLACE VIEW public.v_discovery_link_daily WITH (security_invoker = true) AS
SELECT run_at::date AS day, channel, sum(candidates) AS candidates, sum(linked) AS linked, sum(rejected_generic) AS rejected_generic, sum(requests) AS requests
FROM public.discovery_run_log GROUP BY 1, 2;
REVOKE ALL ON public.v_discovery_link_daily FROM anon, authenticated;

-- 언급 후보 채택 조건: 옛 조건(근거 글 3+·영역 적합 0.9·영역 ①~⑤)은 HN 시험 시절 것이다. 스토어 시험(앱스토어·구글 플레이 이름 일치 + 평가 수)을 통과한 후보는
-- 영역 칸 없이도 채택할 수 있게 OR 로 넓힌다(post_count>=3·근거 3건은 그대로 요구). 기존 행은 옛 조건 통과 → 깨지지 않는다.
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_mention_accept_check;
ALTER TABLE public.discovery_candidates ADD CONSTRAINT discovery_candidates_mention_accept_check CHECK (
  origin IS DISTINCT FROM 'mention' OR verdict <> 'accepted'
  OR (post_count >= 3 AND cardinality(evidence_input_ids) >= 3 AND (
        (area_fit >= 0.9 AND area_code IN ('1','2','3','4','5'))
        OR (probe_source_key IN ('appstore','googleplay') AND probe_ref IS NOT NULL AND probe_hits >= 50))));

COMMIT;

-- 확인(적용 후): SELECT count(*) FROM information_schema.tables WHERE table_name IN ('discovery_run_log','source_probe_log');  -- 2
--               SELECT count(*) FROM public.discovery_candidates WHERE origin='mention' AND verdict='accepted';           -- 기존 행 전부 새 조건 통과(적용이 안 깨짐)
