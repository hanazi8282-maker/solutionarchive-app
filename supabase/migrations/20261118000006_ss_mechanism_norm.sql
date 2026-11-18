-- v71ct-3 §1: 원리 칸 정리. 원본 mechanism 은 그대로 두고 닫힌 목록 값을 새 칸 mechanism_norm 에 추가 전용으로 쓴다.
-- 쌍 뷰 outcome_pairs_norm: 같은 장 + 같은 mechanism_norm(기타·NULL 제외)에서 한 곳은 됐고 한 곳은 안 됨. 기존 outcome_pairs(sub_topic 기준)는 비교용으로 그대로 둔다.
-- source_key 가 다른 행끼리(비SaaS·다른 소스)도 쌍이 된다 — "다른 업종, 같은 원리" 는 mechanism_norm 일치 ∧ domain 이 다른 경우에만 표시(앱 코드).
BEGIN;
ALTER TABLE public.ss_episode_tags ADD COLUMN IF NOT EXISTS mechanism_norm text;
ALTER TABLE public.ss_episode_tags ADD COLUMN IF NOT EXISTS mechanism_norm_run text;
CREATE INDEX IF NOT EXISTS ss_episode_tags_mechnorm_idx ON public.ss_episode_tags (chapter, mechanism_norm) WHERE mechanism_norm IS NOT NULL;

-- 뷰는 e.* 를 만들 때 펼쳐 두므로 새 칸이 안 보인다 — 같은 정의로 다시 만든다(칸이 뒤에 붙는 변경이라 허용).
CREATE OR REPLACE VIEW public.ss_episode_tags_current WITH (security_invoker = true) AS
SELECT e.*
FROM public.ss_episode_tags e
JOIN public.ss_story_labels_current s
  ON s.source_key = e.source_key AND s.slug = e.slug AND s.label_run = e.label_run;
REVOKE ALL ON public.ss_episode_tags_current FROM anon, authenticated;

CREATE OR REPLACE VIEW public.outcome_pairs_norm WITH (security_invoker = true) AS
SELECT a.chapter, a.mechanism_norm,
       a.source_key AS win_source, a.slug AS win_slug, a.episode_idx AS win_ep,
       b.source_key AS lose_source, b.slug AS lose_slug, b.episode_idx AS lose_ep, b.result_class AS lose_class,
       (sa.domain IS DISTINCT FROM sb.domain) AS cross_domain,
       jsonb_strip_nulls(jsonb_build_object(
         'stage',      CASE WHEN sa.stage      IS DISTINCT FROM sb.stage      THEN jsonb_build_array(sa.stage, sb.stage) END,
         'team_size',  CASE WHEN sa.team_size  IS DISTINCT FROM sb.team_size  THEN jsonb_build_array(sa.team_size, sb.team_size) END,
         'customer',   CASE WHEN sa.customer   IS DISTINCT FROM sb.customer   THEN jsonb_build_array(sa.customer, sb.customer) END,
         'price_band', CASE WHEN sa.price_band IS DISTINCT FROM sb.price_band THEN jsonb_build_array(sa.price_band, sb.price_band) END,
         'condition_ko', CASE WHEN a.condition_ko IS DISTINCT FROM b.condition_ko THEN jsonb_build_array(a.condition_ko, b.condition_ko) END,
         'adversity_ko', CASE WHEN a.adversity_ko IS DISTINCT FROM b.adversity_ko THEN jsonb_build_array(a.adversity_ko, b.adversity_ko) END
       )) AS diff_candidates
FROM public.ss_episode_tags_current a
JOIN public.ss_episode_tags_current b
  ON a.chapter = b.chapter AND a.mechanism_norm = b.mechanism_norm AND (a.source_key, a.slug) <> (b.source_key, b.slug)
 AND b.result_class IN ('negative','mixed')
JOIN public.ss_story_labels_current sa ON sa.source_key = a.source_key AND sa.slug = a.slug
JOIN public.ss_story_labels_current sb ON sb.source_key = b.source_key AND sb.slug = b.slug
WHERE a.result_class = 'positive' AND a.result_grain IS DISTINCT FROM 'signal'
  AND a.mechanism_norm IS NOT NULL AND a.mechanism_norm <> '기타';
REVOKE ALL ON public.outcome_pairs_norm FROM anon, authenticated;
COMMIT;
-- 확인(양성): information_schema.columns 에 mechanism_norm·mechanism_norm_run, 뷰 존재 / 음성: has_table_privilege('anon','public.outcome_pairs_norm','SELECT') = false
