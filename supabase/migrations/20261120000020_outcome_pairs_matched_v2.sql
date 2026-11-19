-- 쌍 찾기 v2 (선행: 20261120000010 적용됨, 20261120000011 sub_topic_norm 칸). 추가 전용 + 함수 교체.
-- 배경: 독립 채점 4회 — mechanism_norm 칸만 같은 쌍은 "비교할 만함" 15~35%, 같은 sub_topic 까지 요구하면 65%. sub_topic 은 자유 문장이라 정확 일치가 거의 없다
--   → sub_topic_norm(닫힌 목록) 일치를 점수와 거르기 조건에 넣는다.
-- 바뀌는 것:
--   점수: 기존(sub_topic 원문 일치 +3 · domain +2 · 닫힌 칸 5개 각 +1) 에 sub_topic_norm 일치 +3 을 더하고 LEAST(10, …) 로 상한. '기타'·NULL 은 일치로 치지 않는다.
--   옵션 3개(전부 기본 false — 기본 호출의 결과는 v1 과 같다. sub_topic_norm 이 비어 있으면 점수도 v1 과 같다):
--     require_same_sub_norm  true 면 같은 sub_topic_norm(기타 제외) 쌍만
--     lose_negative_only     true 면 안 된 쪽이 result_class='negative' ∧ result_grain IN (metric, qual, learned) 인 것만(mixed·signal·NULL 제외)
--     evidence_ab_only       true 면 양쪽 evidence_strength 가 A 또는 B 인 쌍만
--   표에 칸 4개 추가(파생 스냅샷): sub_topic_norm(두 쪽이 같을 때 그 값, 아니면 NULL), lose_run·win_run(회차), refresh_opts(이 스냅샷을 만든 인자).
-- 쌍 중복(같은 안 된 에피소드-된 글이 label_run 만 달라 두 번)에 대해:
--   함수 안에서는 생기지 않는다 — ss_story_labels_current 가 글(source_key, slug)마다 1회차만 남기고(DISTINCT ON, 시험 회차 제외),
--   에피소드를 그 회차(label_run 일치)로만 붙이므로 앵커(source, slug, ep)는 1번만 나오고, 된 쪽은 per_story 가 글당 1개만 남긴다.
--   표의 PK(앵커, rank)·UNIQUE(앵커, 된 쪽 글)가 같은 것을 강제한다(어기면 INSERT 가 실패한다).
--   중복이 보였다면 읽는 쪽이 표를 회차 없이 ss_episode_tags(기본 표)에 (source_key, slug, episode_idx) 로 다시 붙인 경우다 — 그 조인은 v1_sonnet·p4a_sonnet 두 회차에 다 걸린다.
--   그래서 lose_run·win_run 을 표에 남긴다. 다시 붙일 때는 (source_key, slug, label_run, episode_idx) 로 붙인다.
-- 시그니처가 (int,int) → (int,int,boolean,boolean,boolean) 로 바뀐다. CREATE OR REPLACE 만 하면 옛 2인자 함수가 남아 refresh_outcome_pairs_matched() 호출이
--   "is not unique" 로 깨지므로, 같은 트랜잭션에서 옛 시그니처를 지우고 새로 만든다. 인자 이름·기본값(k=3, min_score=2)은 그대로라 기존 호출
--   SELECT refresh_outcome_pairs_matched(); · (5, 2) · rpc {k, min_score} 는 그대로 된다.
-- 건드리지 않는 것: ss_* 원본(읽기만), 뷰 정의, PAIR_FINDER_ENABLED(OFF).
BEGIN;

ALTER TABLE public.outcome_pairs_matched ADD COLUMN IF NOT EXISTS sub_topic_norm text;
ALTER TABLE public.outcome_pairs_matched ADD COLUMN IF NOT EXISTS lose_run text;
ALTER TABLE public.outcome_pairs_matched ADD COLUMN IF NOT EXISTS win_run text;
ALTER TABLE public.outcome_pairs_matched ADD COLUMN IF NOT EXISTS refresh_opts jsonb;
CREATE INDEX IF NOT EXISTS outcome_pairs_matched_subcell_idx ON public.outcome_pairs_matched (chapter, mechanism_norm, sub_topic_norm) WHERE sub_topic_norm IS NOT NULL;

DROP FUNCTION IF EXISTS public.refresh_outcome_pairs_matched(int, int);

CREATE OR REPLACE FUNCTION public.refresh_outcome_pairs_matched(
  k int DEFAULT 3, min_score int DEFAULT 2,
  require_same_sub_norm boolean DEFAULT false, lose_negative_only boolean DEFAULT false, evidence_ab_only boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET work_mem = '64MB'
AS $$
DECLARE n integer; opts jsonb;
BEGIN
  IF k IS NULL OR k NOT BETWEEN 1 AND 10 OR min_score IS NULL OR min_score NOT BETWEEN 0 AND 10
     OR require_same_sub_norm IS NULL OR lose_negative_only IS NULL OR evidence_ab_only IS NULL THEN
    RAISE EXCEPTION 'refresh_outcome_pairs_matched: k 는 1~10, min_score 는 0~10, 옵션은 NULL 불가 (k=%, min_score=%)', k, min_score;
  END IF;
  opts := jsonb_build_object('v', 2, 'k', k, 'min_score', min_score, 'require_same_sub_norm', require_same_sub_norm,
                             'lose_negative_only', lose_negative_only, 'evidence_ab_only', evidence_ab_only);
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('public.outcome_pairs_matched'));
  DELETE FROM public.outcome_pairs_matched WHERE true;   -- 파생 스냅샷 비우기(원본은 읽기만)

  DROP TABLE IF EXISTS pg_temp._opm_ep;
  CREATE TEMP TABLE _opm_ep ON COMMIT DROP AS
  WITH st AS MATERIALIZED (       -- 글마다 최신 회차 1행(ss_story_labels_current). 이 한 줄이 회차 중복을 막는다
    SELECT source_key, slug, label_run,
           NULLIF(NULLIF(btrim(lower(domain)), ''), 'unknown')        AS domain,
           NULLIF(customer, 'unknown')                                AS customer,
           NULLIF(stage, 'unknown')                                   AS stage,
           NULLIF(price_band, 'unknown')                              AS price_band,
           NULLIF(team_size, 'unknown')                               AS team_size,
           NULLIF(NULLIF(btrim(lower(pricing_model)), ''), 'unknown') AS pricing_model
    FROM public.ss_story_labels_current
  )
    SELECT e.id, e.source_key, e.slug, e.label_run, e.episode_idx, e.chapter, e.mechanism_norm, e.result_class, e.result_grain,
           (e.result_class = 'positive') AS is_win,
           e.evidence_strength, e.text_depth, e.condition_ko, e.adversity_ko,
           NULLIF(NULLIF(btrim(lower(e.sub_topic)), ''), 'unknown') AS sub_topic,
           NULLIF(NULLIF(btrim(e.sub_topic_norm), ''), '기타')       AS sub_norm,   -- 기타는 모름과 같게: 일치로 치지 않는다
           s.domain, s.customer, s.stage, s.price_band, s.team_size, s.pricing_model
    FROM public.ss_episode_tags e
    JOIN st s ON s.source_key = e.source_key AND s.slug = e.slug AND s.label_run = e.label_run
    WHERE e.mechanism_norm IS NOT NULL AND e.mechanism_norm <> '기타'
      AND (e.result_class IN ('negative','mixed')
           OR (e.result_class = 'positive' AND e.result_grain IS DISTINCT FROM 'signal'));
  CREATE INDEX ON pg_temp._opm_ep (chapter, mechanism_norm);
  CREATE INDEX ON pg_temp._opm_ep (id);
  ANALYZE pg_temp._opm_ep;

  WITH scored AS (
    SELECT l.id AS lose_id, w.id AS win_id, l.slug AS lose_slug,
           w.source_key AS win_source, w.slug AS win_slug, w.episode_idx AS win_ep, w.evidence_strength AS win_ev,
           LEAST(10,
             CASE WHEN l.sub_topic     = w.sub_topic     THEN 3 ELSE 0 END
           + CASE WHEN l.sub_norm      = w.sub_norm      THEN 3 ELSE 0 END
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
      AND (NOT require_same_sub_norm OR w.sub_norm = l.sub_norm)                                  -- NULL = NULL 은 거짓 쪽
      AND (NOT lose_negative_only OR (l.result_class = 'negative' AND l.result_grain IN ('metric','qual','learned')))
      AND (NOT evidence_ab_only OR (l.evidence_strength IN ('A','B') AND w.evidence_strength IN ('A','B')))
  ), per_story AS (
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
     rank, score, cross_domain, lose_depth, diff_candidates, sub_topic_norm, lose_run, win_run, refresh_opts)
  SELECT l.chapter, l.mechanism_norm, l.source_key, l.slug, l.episode_idx, l.result_class,
         w.source_key, w.slug, w.episode_idx,
         r.rk::int, r.score, (l.domain <> w.domain), l.text_depth,
         jsonb_strip_nulls(jsonb_build_object(
           'stage',        CASE WHEN w.stage      <> l.stage      THEN jsonb_build_array(w.stage, l.stage) END,
           'team_size',    CASE WHEN w.team_size  <> l.team_size  THEN jsonb_build_array(w.team_size, l.team_size) END,
           'customer',     CASE WHEN w.customer   <> l.customer   THEN jsonb_build_array(w.customer, l.customer) END,
           'price_band',   CASE WHEN w.price_band <> l.price_band THEN jsonb_build_array(w.price_band, l.price_band) END,
           'condition_ko', CASE WHEN w.condition_ko IS DISTINCT FROM l.condition_ko THEN jsonb_build_array(w.condition_ko, l.condition_ko) END,
           'adversity_ko', CASE WHEN w.adversity_ko IS DISTINCT FROM l.adversity_ko THEN jsonb_build_array(w.adversity_ko, l.adversity_ko) END)),
         CASE WHEN l.sub_norm = w.sub_norm THEN l.sub_norm END,
         l.label_run, w.label_run, opts
  FROM ranked r
  JOIN pg_temp._opm_ep l ON l.id = r.lose_id
  JOIN pg_temp._opm_ep w ON w.id = r.win_id
  WHERE r.rk <= k;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_outcome_pairs_matched(int, int, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_outcome_pairs_matched(int, int, boolean, boolean, boolean) TO service_role;

COMMENT ON TABLE public.outcome_pairs_matched IS '쌍 찾기 스냅샷: 안 된 에피소드마다 같은 장·같은 mechanism_norm 의 가장 비슷한 된 쪽 상위 k. refresh_outcome_pairs_matched() 로만 갱신, 만든 인자는 refresh_opts. 원본에 다시 붙일 때는 lose_run·win_run 까지 붙인다. 인과가 아니라 차이 후보. v71cu v2';
COMMIT;
-- 확인(양성): SELECT public.refresh_outcome_pairs_matched();                → 반환값 = SELECT count(*) FROM public.outcome_pairs_matched
--            SELECT count(*) FILTER (WHERE refresh_opts->>'v' = '2') = count(*), max(score) <= 10 FROM public.outcome_pairs_matched;
--            SELECT public.refresh_outcome_pairs_matched(k => 3, min_score => 2, require_same_sub_norm => true);
--            SELECT count(*) FILTER (WHERE sub_topic_norm IS NULL) FROM public.outcome_pairs_matched;     → 0 (옵션 true 일 때)
--            중복 0: SELECT count(*) FROM (SELECT 1 FROM public.outcome_pairs_matched GROUP BY lose_source, lose_slug, lose_ep, win_source, win_slug HAVING count(*) > 1) d;
-- 음성:      SELECT has_function_privilege('anon','public.refresh_outcome_pairs_matched(int,int,boolean,boolean,boolean)','EXECUTE') = false
--            SELECT has_function_privilege('authenticated','public.refresh_outcome_pairs_matched(int,int,boolean,boolean,boolean)','EXECUTE') = false
--            SELECT to_regprocedure('public.refresh_outcome_pairs_matched(int,int)') IS NULL       -- 옛 시그니처가 남지 않았다
