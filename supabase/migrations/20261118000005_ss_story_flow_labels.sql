-- v71ct/[꼬리표 재설계]: 스토리 단위 꼬리표(상황+흐름+장 비중+인과) + 에피소드 꼬리표(역경→행동→극복→결과) + 장 정의.
-- 추가 전용. 기존 ss_moves·ss_move_tags(4,390줄)·남헌 판정은 건드리지 않는다. 다시 달면 새 label_run 으로 줄을 더한다.
-- 장은 숫자(1~8 기초 가이드, 새 장은 9부터 ss_chapter_defs 에 정의를 남긴 뒤 쓴다 — v71ct-1 §3). 상한 CHECK 를 두지 않는 이유.
-- 시험 회차는 label_run 이 'test_' 로 시작한다 — *_current 뷰는 시험 회차를 제외한다.
-- 접근: service_role 전용(RLS 켜고 anon·authenticated 권한 제거). 원문 전문은 DB 에 넣지 않는다(quote_orig 는 에피소드당 2~3문장).
BEGIN;

CREATE TABLE IF NOT EXISTS public.ss_chapter_defs (
  chapter        int PRIMARY KEY CHECK (chapter >= 1),
  name_ko        text NOT NULL,
  definition_ko  text NOT NULL,
  example_episodes jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 새 장(9~)은 대표 에피소드 3개 이상: [{slug, episode_idx}]
  created_by     text NOT NULL DEFAULT 'seed',
  created_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ss_chapter_defs (chapter, name_ko, definition_ko) VALUES
  (1, '아이템 계기',            '어떤 문제·기회를 보고 이 아이템을 하게 됐는가'),
  (2, '시장·손님 고르기',        '누구를 손님으로 정하고 어떤 시장·자리(포지셔닝)를 잡는가'),
  (3, '검증(빠르고 많이)',       '만들기 전·직후에 수요를 빠르게 여러 번 확인하는 행동'),
  (4, '만들기·제품 개발',        '제품·기능을 만들고 고치는 행동'),
  (5, '마케팅·새 손님',          '채널·콘텐츠·제휴·커뮤니티로 새 손님을 데려오는 행동'),
  (6, '판매·구매 전환·가격',      '제안·가격·패키지·신뢰 장치로 사게 만드는 행동'),
  (7, '성장·리텐션·이탈 방지',    '온보딩·지원·재구매로 계속 쓰게 하고 끊는 것을 막는 행동'),
  (8, '막혔을 때·운영·방향 전환', '막혔을 때의 대응, 운영 방식, 피벗·종료 결정')
ON CONFLICT (chapter) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ss_story_labels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key          text NOT NULL DEFAULT 'starterstory',
  slug                text NOT NULL,
  label_run           text NOT NULL,
  label_model         text NOT NULL,
  source_text_sha256  text,
  text_depth          text NOT NULL DEFAULT 'story' CHECK (text_depth IN ('story','lite')),
  -- 상황(칸마다 근거 문장은 situation_basis, 없으면 unknown)
  domain              text,
  customer            text NOT NULL DEFAULT 'unknown' CHECK (customer IN ('smb','consumer','enterprise','creator','dev','unknown')),
  pricing_model       text NOT NULL DEFAULT 'unknown',
  price_band          text NOT NULL DEFAULT 'unknown' CHECK (price_band IN ('<10','10-49','50-249','250+','unknown')),
  stage               text NOT NULL DEFAULT 'unknown' CHECK (stage IN ('prelaunch','zero_rev','early_rev','growing','unknown')),
  team_size           text NOT NULL DEFAULT 'unknown' CHECK (team_size IN ('solo','2-10','11+','unknown')),
  revenue_band        text NOT NULL DEFAULT 'unknown' CHECK (revenue_band IN ('<1k','1-5k','5-10k','10-50k','50-100k','100k+','unknown')),
  situation_basis     jsonb NOT NULL DEFAULT '{}'::jsonb,
  story_arc_ko        text,
  focus               jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{chapter,weight,why_ko}] 합 100·10단위·최대 4장·20 미만 버림
  causal_chain        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{from_ep,to_ep,because_ko}]
  success_tier        text NOT NULL DEFAULT 'S0' CHECK (success_tier IN ('S1','S2','S0')),
  relevance_tier      text NOT NULL DEFAULT 'R3' CHECK (relevance_tier IN ('R1','R2','R3')),
  principle_ko        text,
  transfer_ko         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ss_story_labels_run_key UNIQUE (source_key, slug, label_run)
);
CREATE INDEX IF NOT EXISTS ss_story_labels_run_idx ON public.ss_story_labels (label_run);

CREATE TABLE IF NOT EXISTS public.ss_episode_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key      text NOT NULL DEFAULT 'starterstory',
  slug            text NOT NULL,
  label_run       text NOT NULL,
  episode_idx     int  NOT NULL CHECK (episode_idx >= 0),
  move_id         uuid REFERENCES public.ss_moves(id),   -- 기존 행동과 같으면 연결, 새로 찾았으면 NULL
  chapter         int  NOT NULL CHECK (chapter >= 1),
  role            text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','secondary')),
  sub_topic       text,
  adversity_ko    text,
  action_ko       text,
  overcome_ko     text,
  result_class    text NOT NULL DEFAULT 'unknown' CHECK (result_class IN ('positive','negative','mixed','none','unknown')),
  result_grain    text CHECK (result_grain IS NULL OR result_grain IN ('metric','qual','signal','learned')),
  result_ko       text,
  why_ko          text,
  condition_ko    text,
  mechanism       text,                                  -- 업종을 지운 원리 태그(예: reduce_purchase_doubt_by_transparency)
  quote_orig      text,                                  -- 문장 단위, 에피소드당 2~3문장 이내(내부 분석용)
  quote_ko        text,                                  -- 우리 맥락으로 재구성한 한국어
  evidence_strength text NOT NULL DEFAULT 'C' CHECK (evidence_strength IN ('A','B','C')),
  basis           jsonb NOT NULL DEFAULT '{}'::jsonb,
  text_depth      text NOT NULL DEFAULT 'story' CHECK (text_depth IN ('story','lite')),
  label_model     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ss_episode_tags_key UNIQUE (source_key, slug, label_run, episode_idx),
  CONSTRAINT ss_episode_tags_story_fk FOREIGN KEY (source_key, slug, label_run)
    REFERENCES public.ss_story_labels (source_key, slug, label_run)
);
CREATE INDEX IF NOT EXISTS ss_episode_tags_chapter_idx ON public.ss_episode_tags (chapter, result_class);
CREATE INDEX IF NOT EXISTS ss_episode_tags_subtopic_idx ON public.ss_episode_tags (chapter, sub_topic);
CREATE INDEX IF NOT EXISTS ss_episode_tags_move_idx ON public.ss_episode_tags (move_id) WHERE move_id IS NOT NULL;

ALTER TABLE public.ss_chapter_defs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_story_labels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_episode_tags  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_chapter_defs, public.ss_story_labels, public.ss_episode_tags FROM anon, authenticated;

-- 읽는 쪽 뷰: 스토리마다 가장 나중의 (시험이 아닌) label_run. 에피소드는 그 회차 것만.
CREATE OR REPLACE VIEW public.ss_story_labels_current WITH (security_invoker = true) AS
SELECT DISTINCT ON (source_key, slug) *
FROM public.ss_story_labels
WHERE label_run NOT LIKE 'test\_%' ESCAPE '\'
ORDER BY source_key, slug, created_at DESC, label_run DESC;

CREATE OR REPLACE VIEW public.ss_episode_tags_current WITH (security_invoker = true) AS
SELECT e.*
FROM public.ss_episode_tags e
JOIN public.ss_story_labels_current s
  ON s.source_key = e.source_key AND s.slug = e.slug AND s.label_run = e.label_run;

-- 읽기용 흐름 카드: 스토리 × 장(focus 에 든 장). 에피소드는 그 장에 달린 것만 묶는다.
CREATE OR REPLACE VIEW public.story_flow_cards WITH (security_invoker = true) AS
SELECT s.source_key, s.slug, s.label_run,
       (f.value->>'chapter')::int AS chapter,
       (f.value->>'weight')::int  AS weight,
       f.value->>'why_ko'         AS chapter_why_ko,
       s.domain, s.customer, s.pricing_model, s.price_band, s.stage, s.team_size, s.revenue_band,
       s.story_arc_ko, s.causal_chain, s.success_tier, s.relevance_tier, s.principle_ko, s.transfer_ko, s.text_depth,
       COALESCE((
         SELECT jsonb_agg(to_jsonb(e) - 'id' - 'basis' ORDER BY e.episode_idx)
         FROM public.ss_episode_tags e
         WHERE e.source_key = s.source_key AND e.slug = s.slug AND e.label_run = s.label_run
           AND e.chapter = (f.value->>'chapter')::int
       ), '[]'::jsonb) AS episodes
FROM public.ss_story_labels_current s
CROSS JOIN LATERAL jsonb_array_elements(s.focus) AS f(value);

-- 쌍 찾기(v71ct §6): 같은 장·같은 sub_topic 에서 한 곳은 됐고(positive, signal 아님) 한 곳은 안 됐거나(negative) 섞인(mixed) 쌍.
CREATE OR REPLACE VIEW public.outcome_pairs WITH (security_invoker = true) AS
SELECT a.chapter, a.sub_topic,
       a.slug AS win_slug, a.episode_idx AS win_ep, b.slug AS lose_slug, b.episode_idx AS lose_ep, b.result_class AS lose_class,
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
  ON a.chapter = b.chapter AND a.sub_topic = b.sub_topic AND a.slug <> b.slug
 AND b.result_class IN ('negative','mixed')
JOIN public.ss_story_labels_current sa ON sa.source_key = a.source_key AND sa.slug = a.slug
JOIN public.ss_story_labels_current sb ON sb.source_key = b.source_key AND sb.slug = b.slug
WHERE a.result_class = 'positive' AND a.result_grain IS DISTINCT FROM 'signal'
  AND a.sub_topic IS NOT NULL AND a.sub_topic <> '';

REVOKE ALL ON public.ss_story_labels_current, public.ss_episode_tags_current, public.story_flow_cards, public.outcome_pairs FROM anon, authenticated;
COMMIT;
-- 확인(양성): to_regclass 로 표 3·뷰 4 존재, relrowsecurity=true 3개, ss_chapter_defs 8행
-- 음성: has_table_privilege('anon','public.ss_story_labels','SELECT') = false
