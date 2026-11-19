-- [v71cu 쌍 찾기] 오케스트레이터용 확인 쿼리. 대상 solutionarchive `qmgrfqjfxqhxuufrnkwf` (호스티드 MCP 면 project_id 명시).
-- 번호는 설계서 reports/2026-11-19-v71cu/pair-finder-design.md §6 의 Q 번호 그대로다. 구현에 필요한 것만 옮겼다(Q4·Q6·Q9 는 후보 비교용이라 뺐다).
-- Q*·V* 는 전부 읽기 전용이다. D1(드라이런)만 함수를 부르지만 ROLLBACK 으로 끝나 아무것도 남기지 않는다.
-- 순서: [적용 전] Q1 Q2 Q3 Q5 Q7 Q8 → 마이그 적용 → D1 → refresh → V1~V6 → Q11.   자세한 명령은 reports/2026-11-20-pair-finder/impl.md

-- ───────────── 적용 전 ─────────────

-- Q1. 현재 회차 행 수와 결과 분포, 원리 칸 채움. (기대: 합 17,998 근처 · positive 12,549 · negative 1,487 · mixed 630 — 11/20 지시서 값. 다르면 옛 회차가 섞였는지 본다)
SELECT result_class, count(*) AS rows, count(*) FILTER (WHERE mechanism_norm IS NULL) AS norm_null,
       count(*) FILTER (WHERE mechanism_norm = '기타') AS etc, count(*) FILTER (WHERE result_grain = 'signal') AS signal
FROM public.ss_episode_tags_current GROUP BY 1 ORDER BY 2 DESC;

-- Q2. 뷰를 돌리지 않고 센 "전부 대 전부" 쌍 수(에피소드 단위·글 단위)와 앵커 수, 장별. 갱신 함수가 점수를 매기는 횟수 = pairs_ep 합.
WITH c AS (
  SELECT chapter, mechanism_norm,
         count(*) FILTER (WHERE result_class='positive' AND result_grain IS DISTINCT FROM 'signal') AS p_ep,
         count(*) FILTER (WHERE result_class IN ('negative','mixed')) AS n_ep,
         count(DISTINCT (source_key,slug)) FILTER (WHERE result_class='positive' AND result_grain IS DISTINCT FROM 'signal') AS p_st,
         count(DISTINCT (source_key,slug)) FILTER (WHERE result_class IN ('negative','mixed')) AS n_st
  FROM public.ss_episode_tags_current
  WHERE mechanism_norm IS NOT NULL AND mechanism_norm <> '기타' GROUP BY 1,2)
SELECT chapter, sum(p_ep*n_ep) AS pairs_ep, sum(p_st*n_st) AS pairs_story, sum(n_ep) AS anchors,
       count(*) FILTER (WHERE n_ep > 0 AND p_ep > 0) AS cells
FROM c GROUP BY 1 ORDER BY 1;

-- Q3. 앵커 수(= 표 행 수의 상한 ÷ k): 장별 negative / mixed, 기타·NULL 제외.
SELECT chapter, result_class, count(*) AS eps, count(DISTINCT (source_key,slug)) AS stories
FROM public.ss_episode_tags_current
WHERE result_class IN ('negative','mixed') AND mechanism_norm IS NOT NULL AND mechanism_norm <> '기타'
GROUP BY 1,2 ORDER BY 1,2;

-- Q5. 점수 재료의 상태: 자유 문장 가짓수와 unknown 비율. (sub_topic·domain 일치가 드물면 점수는 사실상 닫힌 칸 5개로만 갈린다 → 문턱 2 가 빡빡한지 판단)
SELECT count(*) AS stories, count(DISTINCT lower(btrim(domain))) AS domain_kinds,
       count(*) FILTER (WHERE domain IS NULL OR btrim(domain)='') AS domain_empty,
       count(DISTINCT lower(btrim(pricing_model))) AS pm_kinds,
       count(*) FILTER (WHERE customer='unknown') AS cust_unk, count(*) FILTER (WHERE stage='unknown') AS stage_unk,
       count(*) FILTER (WHERE price_band='unknown') AS price_unk, count(*) FILTER (WHERE team_size='unknown') AS team_unk,
       count(*) FILTER (WHERE pricing_model='unknown') AS pm_unk
FROM public.ss_story_labels_current;
SELECT count(DISTINCT lower(btrim(sub_topic))) AS sub_topic_kinds, count(*) FILTER (WHERE sub_topic IS NULL OR sub_topic='') AS empty
FROM public.ss_episode_tags_current;

-- Q7. 리포에 정의가 없는 outcome_pairs_repeated 의 실제 모습(기록용 — 이 PR 은 그 표·함수를 참조하지도 바꾸지도 않는다).
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='outcome_pairs_repeated' ORDER BY ordinal_position;
SELECT p.oid::regprocedure AS fn, pg_get_functiondef(p.oid) AS def
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'refresh_outcome_pairs_repeated';
SELECT count(*) FROM public.outcome_pairs_repeated;

-- Q8. 역할별 타임아웃(rpc 로 부를 수 있는지 판단). 선행 객체·부분 적용 흔적도 같이 본다(§10.2 절차 3).
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('anon','authenticated','authenticator','service_role','postgres');
SELECT to_regclass('public.ss_episode_tags') AS eps, to_regclass('public.ss_story_labels_current') AS stories_cur,
       to_regclass('public.outcome_pairs_norm') AS norm_view, to_regclass('public.outcome_pairs_matched') AS matched_already,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_episode_tags' AND column_name='mechanism_norm') AS has_norm_col,
       (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='refresh_outcome_pairs_matched') AS fn_already;
-- 기대: eps·stories_cur·norm_view 있음, has_norm_col=1, matched_already NULL, fn_already 0.

-- ───────────── 적용 뒤 ─────────────

-- D1(=설계 Q10). 드라이런: 함수를 넉넉한 k=5 로 돌려 시간·쌍 수·점수 분포를 보고 되돌린다. 한 묶음으로 붙여 넣는다.
--   마지막 결과만 돌려주는 도구면 SELECT 를 하나씩 남기고 여러 번 돌린다(매번 BEGIN … ROLLBACK).
BEGIN;
EXPLAIN (ANALYZE, BUFFERS) SELECT public.refresh_outcome_pairs_matched(5, 2);   -- Execution Time 이 실행 시간(추정 수 초, 미측정)
SELECT chapter, count(*) FILTER (WHERE rank <= 3) AS pairs_k3, count(*) AS pairs_k5,
       count(DISTINCT (lose_source, lose_slug, lose_ep)) AS anchors_matched,
       round(avg(score) FILTER (WHERE rank <= 3), 2) AS avg_score_k3
FROM public.outcome_pairs_matched GROUP BY 1 ORDER BY 1;
SELECT score, count(*) FILTER (WHERE rank <= 3) AS k3, count(*) AS k5 FROM public.outcome_pairs_matched GROUP BY 1 ORDER BY 1;
ROLLBACK;
-- 문턱이 맞는지(점수 0~1 에 몰려 앵커가 많이 빠지면 문턱을 1 로 낮춰 다시): 문턱 없이 앵커가 몇 개 짝을 얻는지 비교.
BEGIN;
SELECT public.refresh_outcome_pairs_matched(3, 0);
SELECT count(DISTINCT (lose_source, lose_slug, lose_ep)) AS anchors_any, count(*) FILTER (WHERE score < 2) AS pairs_below_2, count(*) AS pairs FROM public.outcome_pairs_matched;
ROLLBACK;

-- V1. 양성: 행 수(= refresh 가 돌려준 수)와 갱신 시각 1개.
SELECT count(*) AS rows, count(DISTINCT refreshed_at) AS refresh_stamps, max(refreshed_at) AS refreshed_at FROM public.outcome_pairs_matched;

-- V2. 규칙 위반 0 이어야 한다(전부 0 = 통과). k·min_score 는 부른 값으로 바꿔 본다.
SELECT count(*) FILTER (WHERE rank > 3)                                             AS rank_over_k,
       count(*) FILTER (WHERE score < 2)                                            AS score_under_min,
       count(*) FILTER (WHERE (lose_source, lose_slug) = (win_source, win_slug))    AS self_pair,
       count(*) FILTER (WHERE mechanism_norm = '기타')                               AS etc_cell,
       (SELECT count(*) FROM (SELECT 1 FROM public.outcome_pairs_matched GROUP BY lose_source, lose_slug, lose_ep
                              HAVING max(rank) <> count(*)) g)                      AS rank_gap_anchors,
       (SELECT count(*) FROM public.outcome_pairs_matched m
         WHERE NOT EXISTS (SELECT 1 FROM public.ss_episode_tags_current e
                           WHERE e.source_key = m.lose_source AND e.slug = m.lose_slug AND e.episode_idx = m.lose_ep
                             AND e.result_class = m.lose_class AND e.chapter = m.chapter AND e.mechanism_norm = m.mechanism_norm)) AS lose_not_in_source,
       (SELECT count(*) FROM public.outcome_pairs_matched m
         WHERE NOT EXISTS (SELECT 1 FROM public.ss_episode_tags_current e
                           WHERE e.source_key = m.win_source AND e.slug = m.win_slug AND e.episode_idx = m.win_ep
                             AND e.result_class = 'positive' AND e.result_grain IS DISTINCT FROM 'signal'
                             AND e.chapter = m.chapter AND e.mechanism_norm = m.mechanism_norm))                                  AS win_not_in_source
FROM public.outcome_pairs_matched;

-- V3. 멱등 지문: refresh 를 한 번 더 돌린 뒤 이 값이 그대로면 통과(refreshed_at 은 지문에서 뺐다).
SELECT count(*) AS rows,
       md5(string_agg(concat_ws('|', lose_source, lose_slug, lose_ep, rank, win_source, win_slug, win_ep, score, cross_domain, diff_candidates::text),
                      E'\n' ORDER BY lose_source, lose_slug, lose_ep, rank)) AS fingerprint
FROM public.outcome_pairs_matched;

-- V4. 음성: 전부 false 여야 한다. 마지막 두 칸(service_role)은 true.
SELECT has_table_privilege('anon', 'public.outcome_pairs_matched', 'SELECT')                                  AS anon_select,
       has_table_privilege('authenticated', 'public.outcome_pairs_matched', 'SELECT')                         AS auth_select,
       has_function_privilege('anon', 'public.refresh_outcome_pairs_matched(int,int)', 'EXECUTE')             AS anon_exec,
       has_function_privilege('authenticated', 'public.refresh_outcome_pairs_matched(int,int)', 'EXECUTE')    AS auth_exec,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='outcome_pairs_matched') > 0 AS has_policy,
       NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.outcome_pairs_matched'::regclass)         AS rls_off,
       has_table_privilege('service_role', 'public.outcome_pairs_matched', 'SELECT')                          AS service_select,
       has_function_privilege('service_role', 'public.refresh_outcome_pairs_matched(int,int)', 'EXECUTE')     AS service_exec;

-- V5. 장별 쌍 수 · 통과 칸(서로 다른 안 된 글 ≥3 ∧ 서로 다른 된 글 ≥2, rank<=3 기준). scripts/pair-finder-refresh.mjs 출력과 같아야 한다.
WITH c AS (
  SELECT chapter, mechanism_norm, count(*) AS pairs,
         count(DISTINCT (lose_source, lose_slug)) AS lose_stories, count(DISTINCT (win_source, win_slug)) AS win_stories,
         count(DISTINCT (lose_source, lose_slug, lose_ep)) AS anchors, count(*) FILTER (WHERE lose_class = 'negative') AS neg_pairs
  FROM public.outcome_pairs_matched WHERE rank <= 3 GROUP BY 1, 2)
SELECT chapter, sum(pairs) AS pairs, sum(anchors) AS anchors, sum(neg_pairs) AS negative_pairs, count(*) AS cells,
       count(*) FILTER (WHERE lose_stories >= 3 AND win_stories >= 2) AS passing_cells
FROM c GROUP BY ROLLUP (chapter) ORDER BY chapter NULLS LAST;

-- V6. 된 쪽 재사용: 한 글이 한 칸 쌍의 20% 를 넘으면(쌍 10개 이상 칸) 재사용 상한을 검토한다(설계 §3-6).
SELECT chapter, mechanism_norm, win_slug, count(*) AS pairs,
       round(count(*)::numeric / sum(count(*)) OVER (PARTITION BY chapter, mechanism_norm), 3) AS share
FROM public.outcome_pairs_matched WHERE rank <= 3 GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20;

-- Q11. 내부 점검표 표시 규칙(결과 있는 글 n ≥ 10 ∧ 안 된 글 ≥ 2)을 통과하는 칸 수. 쌍 표와 무관한 칸 통계다.
WITH c AS (
  SELECT chapter, mechanism_norm,
         count(DISTINCT (source_key,slug)) FILTER (WHERE result_class IN ('positive','negative','mixed')) AS n,
         count(DISTINCT (source_key,slug)) FILTER (WHERE result_class IN ('negative','mixed')) AS n_lose
  FROM public.ss_episode_tags_current WHERE mechanism_norm IS NOT NULL AND mechanism_norm <> '기타' GROUP BY 1,2)
SELECT count(*) AS cells, count(*) FILTER (WHERE n >= 10) AS n10, count(*) FILTER (WHERE n >= 10 AND n_lose >= 2) AS shown,
       count(*) FILTER (WHERE n_lose >= 3) AS lose3, count(*) FILTER (WHERE n_lose >= 10) AS lose10
FROM c;
