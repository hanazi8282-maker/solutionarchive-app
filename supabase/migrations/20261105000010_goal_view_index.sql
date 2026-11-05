-- 20261105000010_goal_view_index — v71cb: v_goal_daily 가 두 큰 표를 순차 스캔(EXPLAIN 3,664ms)하던 것을 줄인다.
-- add-only: 부분 인덱스 2개 + 같은 뜻의 뷰 재정의(열·순서·security_invoker·권한 그대로).
--
-- 인덱스
--   1) analysis_inputs(collected_at) WHERE purged_at IS NULL — 뷰 n 절의 조건 그대로.
--      기존 analysis_inputs_purgeable_idx(collected_at) 는 술어가 source_key/raw_text IS NOT NULL 이라 planner 가 쓸 수 없다.
--   2) review_relevance_verdicts(second_judged_at) WHERE verdict = 'relevant' — 뷰 u 절의 2차 판정 쪽.
--   auto_approved_at 쪽은 새로 만들지 않는다: idx_review_relevance_verdicts_auto_approved
--      (20260930000027, (auto_approved_at DESC) WHERE auto_approved_at IS NOT NULL) 가 이미 있다.
--      `auto_approved_at >= X` 는 strict 연산자라 IS NOT NULL 을 함의 → 부분 술어 충족, DESC 도 범위 스캔 가능.
--
-- CONCURRENTLY 를 쓰지 않는 이유: 이 리포 마이그는 전부 BEGIN/COMMIT(apply_migration 도 트랜잭션) 안에서
--   CREATE INDEX IF NOT EXISTS 를 쓴다(CONCURRENTLY 사용례 0). 표가 ~17만 행이라 SHARE 락(쓰기만 막음, 읽기는 됨)이 수 초.
--   수집 크론(nightly-review-collect·judge) 슬롯 사이에 적용하면 끊기는 실행이 없다.
--
-- 뷰: usable 필터를 GREATEST(COALESCE(a,-inf),COALESCE(b,-inf)) >= X 에서 (a >= X OR b >= X) 로 — 같은 뜻.
--   X 는 유한값이다. NULL 은 -infinity 로 바뀌어 >= X 가 거짓 = OR 쪽 NULL >= X 도 참이 아님(WHERE 에서 탈락) → 같은 행 집합.
--   dt 계산식(GREATEST…)은 그대로 둔다 — 날짜 귀속이 바뀌면 결과가 달라진다.
-- 롤백: 20261105000010_goal_view_index_rollback.sql

BEGIN;

CREATE INDEX IF NOT EXISTS idx_analysis_inputs_collected_live
  ON public.analysis_inputs (collected_at)
  WHERE purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_review_relevance_verdicts_second_judged_relevant
  ON public.review_relevance_verdicts (second_judged_at)
  WHERE verdict = 'relevant';

CREATE OR REPLACE VIEW public.v_goal_daily WITH (security_invoker = true) AS
WITH n AS (
  SELECT (i.collected_at AT TIME ZONE 'Asia/Seoul')::date AS dt,
         count(*) AS new_in,
         count(*) FILTER (WHERE p.area_code IN ('1','2','3','4','5')) AS new_in_area
    FROM public.analysis_inputs i
    JOIN public.analysis_projects p ON p.id = i.project_id
   WHERE i.purged_at IS NULL AND i.collected_at >= (now() - interval '16 days')
   GROUP BY 1
), u AS (
  SELECT (greatest(coalesce(v.second_judged_at, '-infinity'::timestamptz), coalesce(v.auto_approved_at, '-infinity'::timestamptz)) AT TIME ZONE 'Asia/Seoul')::date AS dt,
         count(*) AS usable
    FROM public.review_relevance_verdicts v
    JOIN public.analysis_inputs i ON i.id = v.input_id
    JOIN public.analysis_projects p ON p.id = i.project_id
   WHERE v.verdict = 'relevant'
     AND (v.second_verdict = 'relevant' OR v.auto_approved_at IS NOT NULL)
     AND p.area_code IN ('1','2','3','4','5')
     AND (v.second_judged_at >= (now() - interval '16 days') OR v.auto_approved_at >= (now() - interval '16 days'))
   GROUP BY 1
)
SELECT coalesce(n.dt, u.dt) AS dt, coalesce(n.new_in, 0) AS new_in, coalesce(n.new_in_area, 0) AS new_in_area, coalesce(u.usable, 0) AS usable
  FROM n FULL JOIN u ON u.dt = n.dt;
COMMENT ON VIEW public.v_goal_daily IS '일별 수집 신규·영역 안 신규·쓸 수 있는 정보(①~⑤, KST). v71be 1-1 고정 칸의 근거.';
REVOKE ALL ON public.v_goal_daily FROM anon, authenticated;

COMMIT;

-- 적용 후 확인(양성): 인덱스 2개 존재 + 뷰 결과가 적용 전 스냅샷과 같다.
--   SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_analysis_inputs_collected_live','idx_review_relevance_verdicts_second_judged_relevant');
--   SELECT reloptions FROM pg_class WHERE oid = 'public.v_goal_daily'::regclass;  -- {security_invoker=true}
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.v_goal_daily;
-- 음성: anon 권한이 여전히 없다 — SELECT has_table_privilege('anon','public.v_goal_daily','SELECT');  -- false
