-- 롤백(붙여넣기용): v2 함수를 지우고 v1 함수(20261120000010 본문 그대로)를 되살린다. v2 가 표에 더한 칸 4개·색인도 지운다.
-- 표 outcome_pairs_matched 는 ss_* 에서 다시 계산되는 파생 스냅샷이라 원본 손실이 없다(더한 칸의 값도 파생값). 롤백 뒤 v1 로 다시 채운다:
--   SELECT public.refresh_outcome_pairs_matched();
-- 순서: 이 파일 먼저, 그다음 20261120000011_ss_sub_topic_norm_rollback.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.refresh_outcome_pairs_matched(int, int, boolean, boolean, boolean);
DROP INDEX IF EXISTS public.outcome_pairs_matched_subcell_idx;
ALTER TABLE public.outcome_pairs_matched DROP COLUMN IF EXISTS refresh_opts;
ALTER TABLE public.outcome_pairs_matched DROP COLUMN IF EXISTS win_run;
ALTER TABLE public.outcome_pairs_matched DROP COLUMN IF EXISTS lose_run;
ALTER TABLE public.outcome_pairs_matched DROP COLUMN IF EXISTS sub_topic_norm;

-- ↓ 20261120000010 의 함수 정의·권한·표 주석 그대로
CREATE OR REPLACE FUNCTION public.refresh_outcome_pairs_matched(k int DEFAULT 3, min_score int DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET work_mem = '64MB'
AS $$
DECLARE n integer;
BEGIN
  IF k IS NULL OR k NOT BETWEEN 1 AND 10 OR min_score IS NULL OR min_score NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'refresh_outcome_pairs_matched: k 는 1~10, min_score 는 0~10 (k=%, min_score=%)', k, min_score;
  END IF;
  -- 동시에 두 번 돌면 뒤의 것이 앞의 것이 끝날 때까지 기다린다(PK 충돌 대신 순서대로).
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('public.outcome_pairs_matched'));
  -- 파생 스냅샷 비우기. 원본은 읽기만 한다. WHERE true: API 역할에는 WHERE 없는 DELETE 를 막는 safeupdate 가 걸려 있을 수 있다.
  DELETE FROM public.outcome_pairs_matched WHERE true;

  -- 재료를 임시 표에 한 번만 담고 통계를 잡는다. CTE 로 두면 통계가 없어 계획이 중첩 루프로 떨어지고 순위 계산이 행마다 다시 돈다(로컬 Postgres 로 확인).
  DROP TABLE IF EXISTS pg_temp._opm_ep;
  CREATE TEMP TABLE _opm_ep ON COMMIT DROP AS
  WITH st AS MATERIALIZED (       -- 글마다 최신 회차 1행. DISTINCT ON 정렬을 한 번만 돈다(뷰 위의 뷰는 네 번 돌았다)
    SELECT source_key, slug, label_run,
           NULLIF(NULLIF(btrim(lower(domain)), ''), 'unknown')        AS domain,
           NULLIF(customer, 'unknown')                                AS customer,
           NULLIF(stage, 'unknown')                                   AS stage,
           NULLIF(price_band, 'unknown')                              AS price_band,
           NULLIF(team_size, 'unknown')                               AS team_size,
           NULLIF(NULLIF(btrim(lower(pricing_model)), ''), 'unknown') AS pricing_model
    FROM public.ss_story_labels_current
  )                               -- ss_episode_tags_current 와 같은 조인(source_key, slug, label_run)을 직접 한다
    SELECT e.id, e.source_key, e.slug, e.episode_idx, e.chapter, e.mechanism_norm, e.result_class,
           (e.result_class = 'positive') AS is_win,
           e.evidence_strength, e.text_depth, e.condition_ko, e.adversity_ko,
           NULLIF(NULLIF(btrim(lower(e.sub_topic)), ''), 'unknown') AS sub_topic,
           s.domain, s.customer, s.stage, s.price_band, s.team_size, s.pricing_model
    FROM public.ss_episode_tags e
    JOIN st s ON s.source_key = e.source_key AND s.slug = e.slug AND s.label_run = e.label_run
    WHERE e.mechanism_norm IS NOT NULL AND e.mechanism_norm <> '기타'
      AND (e.result_class IN ('negative','mixed')
           OR (e.result_class = 'positive' AND e.result_grain IS DISTINCT FROM 'signal'));
  CREATE INDEX ON pg_temp._opm_ep (chapter, mechanism_norm);
  CREATE INDEX ON pg_temp._opm_ep (id);
  ANALYZE pg_temp._opm_ep;

  WITH scored AS (                  -- 좁은 행(id·순위 재료)만 들고 정렬한다. 긴 문장 칸은 마지막에 k 행에만 붙인다
    SELECT l.id AS lose_id, w.id AS win_id, l.slug AS lose_slug,
           w.source_key AS win_source, w.slug AS win_slug, w.episode_idx AS win_ep, w.evidence_strength AS win_ev,
           -- NULL = NULL 은 NULL 이라 CASE 가 0 으로 떨어진다(모름은 일치가 아니다)
           (CASE WHEN l.sub_topic     = w.sub_topic     THEN 3 ELSE 0 END
          + CASE WHEN l.domain        = w.domain        THEN 2 ELSE 0 END
          + CASE WHEN l.customer      = w.customer      THEN 1 ELSE 0 END
          + CASE WHEN l.stage         = w.stage         THEN 1 ELSE 0 END
          + CASE WHEN l.price_band    = w.price_band    THEN 1 ELSE 0 END
          + CASE WHEN l.team_size     = w.team_size     THEN 1 ELSE 0 END
          + CASE WHEN l.pricing_model = w.pricing_model THEN 1 ELSE 0 END) AS score
    FROM pg_temp._opm_ep l
    JOIN pg_temp._opm_ep w ON w.chapter = l.chapter AND w.mechanism_norm = l.mechanism_norm
             AND w.is_win AND (w.source_key, w.slug) <> (l.source_key, l.slug)
    WHERE NOT l.is_win
  ), per_story AS (               -- 된 쪽 글 하나에서 가장 비슷한 에피소드 1개만
    SELECT sc.*, row_number() OVER (PARTITION BY sc.lose_id, sc.win_source, sc.win_slug
                                    ORDER BY sc.score DESC, sc.win_ev COLLATE "C", sc.win_ep) AS rs
    FROM scored sc
    WHERE sc.score >= min_score
  ), ranked AS MATERIALIZED (
    SELECT ps.*, row_number() OVER (PARTITION BY ps.lose_id
                                    ORDER BY ps.score DESC, ps.win_ev COLLATE "C",
                                             md5(ps.lose_slug || '|' || ps.win_slug) COLLATE "C",
                                             ps.win_source COLLATE "C", ps.win_slug COLLATE "C") AS rk
    FROM per_story ps
    WHERE ps.rs = 1
  )
  INSERT INTO public.outcome_pairs_matched
    (chapter, mechanism_norm, lose_source, lose_slug, lose_ep, lose_class, win_source, win_slug, win_ep,
     rank, score, cross_domain, lose_depth, diff_candidates)
  SELECT l.chapter, l.mechanism_norm, l.source_key, l.slug, l.episode_idx, l.result_class,
         w.source_key, w.slug, w.episode_idx,
         r.rk::int, r.score, (l.domain <> w.domain), l.text_depth,
         jsonb_strip_nulls(jsonb_build_object(
           'stage',        CASE WHEN w.stage      <> l.stage      THEN jsonb_build_array(w.stage, l.stage) END,
           'team_size',    CASE WHEN w.team_size  <> l.team_size  THEN jsonb_build_array(w.team_size, l.team_size) END,
           'customer',     CASE WHEN w.customer   <> l.customer   THEN jsonb_build_array(w.customer, l.customer) END,
           'price_band',   CASE WHEN w.price_band <> l.price_band THEN jsonb_build_array(w.price_band, l.price_band) END,
           'condition_ko', CASE WHEN w.condition_ko IS DISTINCT FROM l.condition_ko THEN jsonb_build_array(w.condition_ko, l.condition_ko) END,
           'adversity_ko', CASE WHEN w.adversity_ko IS DISTINCT FROM l.adversity_ko THEN jsonb_build_array(w.adversity_ko, l.adversity_ko) END))
  FROM ranked r
  JOIN pg_temp._opm_ep l ON l.id = r.lose_id
  JOIN pg_temp._opm_ep w ON w.id = r.win_id
  WHERE r.rk <= k;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_outcome_pairs_matched(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_outcome_pairs_matched(int, int) TO service_role;
COMMENT ON TABLE public.outcome_pairs_matched IS '쌍 찾기 스냅샷: 안 된 에피소드마다 같은 장·같은 mechanism_norm 의 가장 비슷한 된 쪽 상위 k. refresh_outcome_pairs_matched() 로만 갱신. 인과가 아니라 차이 후보. v71cu';
COMMIT;
