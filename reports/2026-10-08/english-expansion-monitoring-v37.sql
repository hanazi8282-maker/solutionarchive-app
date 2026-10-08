-- ============================================================
-- v37 영어 확대 · ⑤ 글쓰기 시험 — 모니터링 SQL (읽기 전용, SELECT 만)
-- 짝: supabase/migrations/20261008000020_english_targets_v37.sql · reports/2026-10-08/english-expansion-targets-dryrun.md
-- 실행: 오케스트레이터(solutionarchive qmgrfqjfxqhxuufrnkwf). 서브에이전트는 돌리지 않았다 — 컬럼명은 마이그 파일 기준이고
--   운영 DB 에서 처음 돌릴 때 M-1 로 컬럼 존재부터 본다(§7.1 — 없는 컬럼을 0 으로 읽지 않는다).
-- 영역 귀속: review_targets.label 접두 ^([1-5]): (target-supply.ts areaOf 와 같은 규칙). 한 프로젝트에 접두가 둘 이상이면 'mixed'.
-- ⑤ 암 귀속: 드라이런 §5 규칙 — slug 가 글쓰기 10개 → writing · '5:wp|' → wordpress · '5:shopify|' → shopify · 그 밖 5: → review_mgmt_other.
-- ============================================================

-- M-1 컬럼 존재(먼저 한 번). 기대 11행. 모자라면 아래 쿼리를 돌리지 말고 "확인 불가" 로 보고.
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND (
   (table_name = 'analysis_inputs' AND column_name IN ('raw_text','collected_at','source_key','rating','purged_at','project_id'))
   OR (table_name = 'review_relevance_verdicts' AND column_name IN ('input_id','verdict','human_verdict'))
   OR (table_name = 'analysis_aspects' AND column_name IN ('evidence_quotes_ko','project_id')))
 ORDER BY 1, 2;

-- M0 가드레일 감시 — 구글 플레이 활성 수(예외분 제외 ≤ 80)와 하루 요청(≤ 30, 램프 목표 그대로인지)
WITH v37_gp_us(ref) AS (VALUES
  ('us:en:com.clari'),('us:en:io.outreach.sales'),('us:en:com.salesloftmobile'),('us:en:com.zoominfo.enterprise'),
  ('us:en:com.highspot.Highspot'),('us:en:ai.instantly.app'),('us:en:com.hubspot.android'),('us:en:ai.adcreative.m'),
  ('us:en:co.foreplay.ForeplayMobile'),('us:en:co.simplified.main'),('us:en:com.predis.app'),('us:en:com.fifteenfive.fifteenfiveapp'),
  ('us:en:com.lattice'),('us:en:com.grammarly.android.keyboard'),('us:en:com.quillbot.mobile'),('us:en:notion.id'),
  ('us:en:com.craft.docs'),('us:en:com.humanplusplus.sudowrite'),('us:en:app.gamma.mobile'),('us:en:com.gingersoftware.android.keyboard'))
SELECT count(*) FILTER (WHERE t.status = 'active') AS gp_active,
       count(*) FILTER (WHERE t.status = 'active' AND t.product_ref LIKE 'us:en:%'
                        AND t.product_ref NOT IN (SELECT ref FROM v37_gp_us)) AS pr464_exception_active,
       count(*) FILTER (WHERE t.status = 'active') - count(*) FILTER (WHERE t.status = 'active' AND t.product_ref LIKE 'us:en:%'
                        AND t.product_ref NOT IN (SELECT ref FROM v37_gp_us)) AS active_ex_exception   -- 기대 ≤ 80
  FROM public.review_targets t WHERE t.source_key = 'googleplay';
SELECT started_at::date AS d, count(*) AS runs, sum(requests) AS req, sum(new_reviews) AS new_reviews,
       sum(blocked_responses) AS blocked, sum(quota_responses) AS quota
  FROM public.review_collection_runs
 WHERE source_key = 'googleplay' AND NOT dry_run AND started_at > now() - interval '7 days'
 GROUP BY 1 ORDER BY 1;                                       -- 기대: req ≤ 30/일(v37 은 예산을 안 바꾼다) · blocked 0

-- M1 비한국어 입력 추이(일·소스별 14일). lang 은 구글 플레이만 채워지므로 "한글 없음"으로 센다(설계 §0).
SELECT i.collected_at::date AS d, i.source_key,
       count(*) AS inputs,
       count(*) FILTER (WHERE i.raw_text !~ '[가-힣ㄱ-ㅎㅏ-ㅣ]') AS non_korean,
       round(100.0 * count(*) FILTER (WHERE i.raw_text !~ '[가-힣ㄱ-ㅎㅏ-ㅣ]') / nullif(count(*), 0), 1) AS non_korean_pct
  FROM public.analysis_inputs i
 WHERE i.collected_at > now() - interval '14 days' AND i.purged_at IS NULL
 GROUP BY 1, 2 ORDER BY 1, 2;

-- M2 영어 입력 130자 초과율 — 5% 를 넘으면 "재질문"(설계 §1-3: 정책 수치는 안 바꾸고 프롬프트 한 줄을 묻는다).
-- M2a(판정 지표) 영어 인용의 한국어 번역문이 130자(QUOTE_MAX_KO)를 넘는 비율 — 넘으면 고객 화면에서 거부(빈 값)된다.
--   대상: v37 이후 영어 타깃이 붙은 프로젝트의 속성. 번역문 0개면 flag='확인 불가'(0% 로 접지 않는다).
WITH en_proj AS (
  SELECT DISTINCT project_id FROM public.review_targets
   WHERE label ~ '^[1-5]:(us-en|us)\|' OR label IN ('5:grammarly','5:quillbot','5:notion-ai','5:craft-docs','5:gamma','5:ginger')
), q AS (
  SELECT length(x) AS len
    FROM public.analysis_aspects a
    JOIN en_proj p ON p.project_id = a.project_id
    CROSS JOIN LATERAL jsonb_array_elements_text(a.evidence_quotes_ko) x
   WHERE a.evidence_quotes_ko IS NOT NULL AND jsonb_typeof(a.evidence_quotes_ko) = 'array'
)
SELECT count(*) AS quotes_ko, count(*) FILTER (WHERE len > 130) AS over_130,
       round(100.0 * count(*) FILTER (WHERE len > 130) / nullif(count(*), 0), 1) AS over_pct,
       CASE WHEN count(*) = 0 THEN '확인 불가'
            WHEN 100.0 * count(*) FILTER (WHERE len > 130) / count(*) > 5 THEN '재질문'
            ELSE 'ok' END AS flag
  FROM q;
-- M2b(참고) 영어 원문 입력 중 130자 초과 비율(14일) — 번역 전 길이 분포. 판정에는 M2a 를 쓴다.
SELECT i.source_key, count(*) AS en_inputs,
       count(*) FILTER (WHERE length(i.raw_text) > 130) AS over_130,
       round(100.0 * count(*) FILTER (WHERE length(i.raw_text) > 130) / nullif(count(*), 0), 1) AS over_pct
  FROM public.analysis_inputs i
 WHERE i.collected_at > now() - interval '14 days' AND i.purged_at IS NULL AND i.raw_text !~ '[가-힣ㄱ-ㅎㅏ-ㅣ]'
 GROUP BY 1 ORDER BY 2 DESC;

-- M3 영역별 수집량·평점 보유 비율·저평점(1~3) 비율 — 14일 · 전체 두 창
WITH pa AS (
  SELECT project_id,
         CASE WHEN count(DISTINCT (regexp_match(label, '^([1-5]):'))[1]) = 1
              THEN min((regexp_match(label, '^([1-5]):'))[1]) ELSE 'mixed' END AS area
    FROM public.review_targets WHERE label ~ '^[1-5]:' GROUP BY 1
)
SELECT pa.area,
       count(i.id) AS inputs_all,
       count(i.id) FILTER (WHERE i.collected_at > now() - interval '14 days') AS inputs_14d,
       round(100.0 * count(i.rating) / nullif(count(i.id), 0), 1) AS rated_pct,
       round(100.0 * count(*) FILTER (WHERE i.rating BETWEEN 1 AND 3) / nullif(count(i.rating), 0), 1) AS low_of_rated_pct,
       count(*) FILTER (WHERE i.raw_text !~ '[가-힣ㄱ-ㅎㅏ-ㅣ]') AS non_korean
  FROM pa JOIN public.analysis_inputs i ON i.project_id = pa.project_id AND i.purged_at IS NULL
 GROUP BY 1 ORDER BY 1;

-- M4 ⑤ 시험 지표 4종(암별): 수집량 · 판정 100건 relevant 비율 · 별점 보유 비율 · 저평점 비율
--   판정 표본 = 암별로 md5(input_id) 순 100건(재현 가능한 고정 표본 — random() 은 매번 달라 비교가 안 된다).
--   relevant 비율 분모 = relevant + irrelevant. unknown 은 빼고 따로 센다 — unknown > 20% 면 비율 자체가 확인 불가(설계 area-quota §3.2).
--   판정이 100건 미만이면 judged 칸 그대로 "n/100" 으로 읽는다(0% 로 접지 않는다).
WITH arm_t AS (
  SELECT t.project_id, t.source_key, t.created_at,
         CASE WHEN substring(t.label FROM '^5:(?:[^|]+\|)?(.+)$') IN
                   ('grammarly','quillbot','wordtune','notion-ai','craft-docs','sudowrite','gamma','ginger','wrtn','polaris-office-ai') THEN 'writing'
              WHEN t.label ~ '^5:wp\|' THEN 'wordpress'
              WHEN t.label ~ '^5:shopify\|' THEN 'shopify'
              ELSE 'review_mgmt_other' END AS arm
    FROM public.review_targets t WHERE t.label ~ '^5:'
), arm_p AS (
  SELECT project_id, CASE WHEN count(DISTINCT arm) = 1 THEN min(arm) ELSE 'mixed' END AS arm, min(created_at) AS since
    FROM arm_t GROUP BY 1
), inp AS (
  SELECT ap.arm, i.id, i.rating
    FROM arm_p ap JOIN public.analysis_inputs i ON i.project_id = ap.project_id AND i.purged_at IS NULL AND i.collected_at >= ap.since
), judged AS (
  SELECT x.arm, x.v FROM (
    SELECT inp.arm, coalesce(v.human_verdict, v.verdict) AS v,
           row_number() OVER (PARTITION BY inp.arm ORDER BY md5(inp.id::text)) AS rn
      FROM inp JOIN public.review_relevance_verdicts v ON v.input_id = inp.id
  ) x WHERE x.rn <= 100
)
SELECT a.arm,
       (SELECT count(*) FROM inp WHERE inp.arm = a.arm) AS inputs,
       (SELECT count(*) FROM judged j WHERE j.arm = a.arm) AS judged_of_100,
       (SELECT count(*) FILTER (WHERE v = 'relevant') FROM judged j WHERE j.arm = a.arm) AS relevant,
       (SELECT count(*) FILTER (WHERE v = 'unknown') FROM judged j WHERE j.arm = a.arm) AS unknown,
       (SELECT round(100.0 * count(*) FILTER (WHERE v = 'relevant') / nullif(count(*) FILTER (WHERE v IN ('relevant','irrelevant')), 0), 1)
          FROM judged j WHERE j.arm = a.arm) AS relevant_pct,
       (SELECT round(100.0 * count(rating) / nullif(count(*), 0), 1) FROM inp WHERE inp.arm = a.arm) AS rated_pct,
       (SELECT round(100.0 * count(*) FILTER (WHERE rating BETWEEN 1 AND 3) / nullif(count(rating), 0), 1) FROM inp WHERE inp.arm = a.arm) AS low_of_rated_pct
  FROM (SELECT DISTINCT arm FROM arm_p) a ORDER BY 1;

-- M5 v37 신규 타깃 수확(첫 방문 결과) — 0건·차단 조기 확인용
SELECT t.source_key, t.label, t.product_ref, t.status, t.total_collected, t.consecutive_empty, t.last_run_at
  FROM public.review_targets t
 WHERE (t.label ~ '^[2-5]:(us-en|us)\|' AND t.label <> '2:us-en|gong')
    OR t.label IN ('5:wrtn','5:polaris-office-ai','5:grammarly','5:quillbot','5:notion-ai','5:craft-docs','5:gamma','5:ginger')
 ORDER BY t.source_key, t.label;
