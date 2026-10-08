-- ============================================================
-- 20261009000040_area_t2_coverage_view
--
-- v37 작업 7 U3 · 영역 대시보드 열(설계 reports/2026-10-08/area-quota-and-abandon-design-v31.md §4).
-- 읽기 뷰 public.v_area_t2_coverage 하나 — 영역 코드별 입력·판정·평점·대기량 집계. 소비자: scripts/target-supply.mjs
-- (lib/review/target-supply.ts areaCoverage). 영역은 analysis_projects.area_code(마이그 20261009000020, 적용됨)를 따른다.
-- area_code NULL = '(미부여)' 한 줄로 모은다 — '영역 외'로 접지 않는다.
--
-- 칸(영역당 한 행):
--   projects            프로젝트 수
--   inputs              입력 수(purged 제외)
--   rated_inputs        그중 평점 있는 입력 · unrated_inputs 평점 없는 입력 · unrated_input_pct 평점 없는 비중(%, 입력 0 이면 NULL)
--   judged              review_relevance_verdicts 행 수(최소량 비교 대상) — **purged 입력의 판정도 센다**(아래 '기준 차이')
--   relevant/irrelevant/unknown  coalesce(human_verdict, verdict) 기준(사람 채점이 이긴다) — purged 입력 판정 포함
--   rated_judged        평점 있는 입력의 판정 수 · low_rated_judged 그중 평점 ≤3 — purged 입력 판정 포함
--   projects_100plus    입력(purged 제외) 100건↑ 프로젝트 수 — 포기 기준 (a). 100 은 config/areas.json abandon.project_input_min 과 같아야 한다
--   median_inputs       프로젝트당 입력 중앙값 — 포기 기준 (c)
--   pending_est         판정 대기량 **거친 추정(방향 불확정)**: T2 후보 상태(collecting·extracted·failed = extract-gate AUTO_EXTRACT_STATUSES)
--                       프로젝트마다 greatest(0, least(살아 있는 입력, 200) − 살아 있는 입력의 판정). 실제 대기량보다 클 수도 작을 수도 있다:
--                       T1 선별·사전필터·재추출 뒤 failed 제외를 재현하지 않아 크게, 표본(T1 상위 200) 밖 입력의 판정도 빼서 작게 나올 수 있다.
--                       ⚠️ 200 은 RELEVANCE_SAMPLE 기본값을 박은 것이다 — 리포 변수 RELEVANCE_SAMPLE 을 바꿔도 이 뷰는 따라가지 않는다.
--
-- 기준 차이(의도): inputs 는 지금 원문이 남은 입력(purged 제외) = 남은 공급이고, judged 계열은 **이미 한 판정** 전부다.
--   purge 는 30일 뒤 원문만 지운다 — 그 입력의 판정은 여전히 유효한 근거라 최소량(floor)·관련 비율에서 빼지 않는다.
--   T2 순서(lib/analysis/area-priority.ts loadAreaContext)도 판정 행 전부를 세므로 두 쪽의 최소량 비교가 같은 기준이다.
--   그래서 judged > inputs 일 수 있다(오래된 프로젝트). 대기량만은 살아 있는 입력 기준으로 맞췄다(공급 − 그 공급의 판정).
--
-- 🟢 비파괴: 뷰 1개 생성뿐. 테이블·열·행 무변경. CREATE OR REPLACE — 재실행 무해. 같은 이름 뷰가 다른 열 모양으로 이미 있으면
--   Postgres 가 오류로 멈춘다(바꾸지 않는다) — 그때는 롤백 파일로 지우고 다시 돌린다.
-- 보안: security_invoker(밑 테이블 RLS·권한을 호출자 기준으로) + anon·authenticated 권한 회수(선례 20260927000002·20261009000020).
--   호출자는 service_role(scripts/target-supply.mjs)뿐이다.
-- 롤백: 20261009000040_area_t2_coverage_view_rollback.sql (DROP VIEW IF EXISTS — 데이터 없음).
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 오케스트레이터가 독립 점검 뒤에. §10.2 예외 해당 없음(읽기 뷰, 권한을 좁힌다).
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 선행 조건: 영역 열(20261009000020)이 없으면 뷰가 무의미하다 — 조용히 만들지 않고 멈춘다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'analysis_projects' AND column_name = 'area_code') THEN
    RAISE EXCEPTION '선행 마이그 20261009000020 미적용 — analysis_projects.area_code 가 없다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'analysis_inputs' AND column_name = 'rating') THEN
    RAISE EXCEPTION '선행 마이그 20261005000001 미적용 — analysis_inputs.rating 이 없다';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.v_area_t2_coverage WITH (security_invoker = true) AS
WITH inp AS (
  SELECT i.project_id,
         count(*) FILTER (WHERE i.purged_at IS NULL)                         AS inputs,
         count(*) FILTER (WHERE i.purged_at IS NULL AND i.rating IS NOT NULL) AS rated_inputs
    FROM public.analysis_inputs i
   WHERE i.project_id IS NOT NULL
   GROUP BY i.project_id
), ver AS (
  SELECT v.project_id,
         count(*)                                                                    AS judged,
         count(*) FILTER (WHERE coalesce(v.human_verdict, v.verdict) = 'relevant')   AS relevant,
         count(*) FILTER (WHERE coalesce(v.human_verdict, v.verdict) = 'irrelevant') AS irrelevant,
         count(*) FILTER (WHERE coalesce(v.human_verdict, v.verdict) = 'unknown')    AS unknown,
         count(*) FILTER (WHERE i.rating IS NOT NULL)                                AS rated_judged,
         count(*) FILTER (WHERE i.rating <= 3)                                       AS low_rated_judged,
         count(*) FILTER (WHERE i.purged_at IS NULL)                                 AS judged_live
    FROM public.review_relevance_verdicts v
    JOIN public.analysis_inputs i ON i.id = v.input_id
   GROUP BY v.project_id
), per AS (
  SELECT coalesce(p.area_code, '(미부여)') AS area_code,
         p.status,
         coalesce(inp.inputs, 0)           AS inputs,
         coalesce(inp.rated_inputs, 0)     AS rated_inputs,
         coalesce(ver.judged, 0)           AS judged,
         coalesce(ver.relevant, 0)         AS relevant,
         coalesce(ver.irrelevant, 0)       AS irrelevant,
         coalesce(ver.unknown, 0)          AS unknown,
         coalesce(ver.rated_judged, 0)     AS rated_judged,
         coalesce(ver.low_rated_judged, 0) AS low_rated_judged,
         coalesce(ver.judged_live, 0)      AS judged_live
    FROM public.analysis_projects p
    LEFT JOIN inp ON inp.project_id = p.id
    LEFT JOIN ver ON ver.project_id = p.id
)
SELECT area_code,
       count(*)::int                                   AS projects,
       sum(inputs)::bigint                             AS inputs,
       sum(rated_inputs)::bigint                       AS rated_inputs,
       sum(inputs - rated_inputs)::bigint              AS unrated_inputs,
       CASE WHEN sum(inputs) > 0
            THEN round(100.0 * sum(inputs - rated_inputs) / sum(inputs), 1) END AS unrated_input_pct,
       sum(judged)::bigint                             AS judged,
       sum(relevant)::bigint                           AS relevant,
       sum(irrelevant)::bigint                         AS irrelevant,
       sum(unknown)::bigint                            AS unknown,
       sum(rated_judged)::bigint                       AS rated_judged,
       sum(low_rated_judged)::bigint                   AS low_rated_judged,
       (count(*) FILTER (WHERE inputs >= 100))::int    AS projects_100plus,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY inputs) AS median_inputs,
       coalesce(sum(greatest(0, least(inputs, 200) - judged_live))
                FILTER (WHERE status IN ('collecting', 'extracted', 'failed')), 0)::bigint AS pending_est
  FROM per
 GROUP BY area_code;

COMMENT ON VIEW public.v_area_t2_coverage IS
  '영역별 T2 커버리지(읽기 전용, v37 U3). area_code = analysis_projects.area_code, NULL 은 (미부여). judged 계열은 purged 입력의 판정 포함(inputs 는 purged 제외). pending_est 는 거친 추정(방향 불확정 — T1·사전필터 미반영, 표본 천장 200 고정·RELEVANCE_SAMPLE 미추종). 소비자 scripts/target-supply.mjs.';
REVOKE ALL ON public.v_area_t2_coverage FROM anon, authenticated;

COMMIT;

-- ── 적용 후 확인(오케스트레이터) ───────────────────────────────────
-- 양성: 뷰 1 · security_invoker · 권한(service_role true / anon·authenticated false)
--   SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'v_area_t2_coverage';   -- 1
--   SELECT reloptions FROM pg_class WHERE relname = 'v_area_t2_coverage';                                               -- {security_invoker=true}
--   SELECT has_table_privilege('service_role', 'public.v_area_t2_coverage', 'SELECT') AS sr,                            -- true
--          has_table_privilege('anon', 'public.v_area_t2_coverage', 'SELECT') AS anon,                                  -- false
--          has_table_privilege('authenticated', 'public.v_area_t2_coverage', 'SELECT') AS authd;                        -- false
-- 양성: 행 = 영역 코드 수(미부여 포함) · 프로젝트·입력·판정 합계가 밑 테이블과 같다(한 문장 = 한 스냅숏)
--   SELECT (SELECT sum(projects) FROM public.v_area_t2_coverage)                         = (SELECT count(*) FROM public.analysis_projects) AS projects_ok,
--          (SELECT sum(inputs)   FROM public.v_area_t2_coverage)
--            = (SELECT count(*) FROM public.analysis_inputs i JOIN public.analysis_projects p ON p.id = i.project_id WHERE i.purged_at IS NULL) AS inputs_ok,
--          (SELECT sum(judged)   FROM public.v_area_t2_coverage)
--            = (SELECT count(*) FROM public.review_relevance_verdicts v JOIN public.analysis_projects p ON p.id = v.project_id) AS judged_ok;   -- t · t · t
--   SELECT * FROM public.v_area_t2_coverage ORDER BY area_code;   -- 영역별 한 줄. relevant+irrelevant+unknown = judged
--   SELECT count(*) FROM public.v_area_t2_coverage WHERE relevant + irrelevant + unknown <> judged OR low_rated_judged > rated_judged
--      OR rated_inputs + unrated_inputs <> inputs OR projects_100plus > projects;                                          -- 0
-- 음성: anon 으로 읽으면 거부(42501) — 롤백되는 형태로
--   BEGIN; SET LOCAL ROLE anon; SELECT 1 FROM public.v_area_t2_coverage LIMIT 1; ROLLBACK;   -- ERROR: permission denied for view v_area_t2_coverage
-- 음성: 테이블·행 불변 — 뷰만 생겼다
--   SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_area_t2_coverage';  -- 15 (뷰 칸)
