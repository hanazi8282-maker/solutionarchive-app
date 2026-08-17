-- ============================================================
-- 경쟁사 분석 파이프라인 테이블 4종 (순수 추가, 파괴적 변경 0건)
-- analysis_projects : 분석 프로젝트 단위 (경쟁사 URL + 분석 목적)
-- analysis_inputs   : 수집 원문 (리뷰/광고/상세페이지)
-- analysis_aspects  : 속성별 중요도·만족도·기회점수 및 분류 태그
-- analysis_angles   : 속성에서 도출한 소구 앵글/카피 초안
-- 정책: admin+(super_admin/admin) 전체. anon 정책 없음.
-- 가역: 동명 rollback 파일 참조(20260816000001_analysis_pipeline_rollback.sql).
-- ============================================================

-- ── analysis_projects ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analysis_projects (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_url          text NOT NULL,
  product_elevator_pitch  text NOT NULL,
  purpose                 text NOT NULL CHECK (purpose IN ('hook', 'ad_conversion', 'detail_page', 'product_fit')),
  seller_own_guess        text,
  status                  text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'extracted', 'scored', 'reviewed', 'angled', 'done')),
  created_at              timestamptz DEFAULT now()
);

-- ── analysis_inputs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analysis_inputs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES public.analysis_projects (id) ON DELETE CASCADE,
  source_type  text NOT NULL CHECK (source_type IN ('review', 'ad', 'detail_page')),
  raw_text     text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ── analysis_aspects ─────────────────────────────────────────
-- opportunity_score 는 DB 계산(generated) 컬럼이다. 앱에서 INSERT/UPDATE 금지.
CREATE TABLE IF NOT EXISTS public.analysis_aspects (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                   uuid REFERENCES public.analysis_projects (id) ON DELETE CASCADE,
  name                         text NOT NULL,
  aspect_layer                 text CHECK (aspect_layer IN ('PRODUCT', 'PROCESS', 'OUTCOME')),
  importance                   numeric,
  satisfaction                 numeric,
  opportunity_score            numeric GENERATED ALWAYS AS (importance + greatest(importance - satisfaction, 0)) STORED,
  quadrant                     text CHECK (quadrant IN ('TABLE_STAKES', 'DIFFERENTIATOR', 'OVER_INVESTED', 'IGNORE')),
  attribution                  text CHECK (attribution IN ('PRODUCT_FAULT', 'USER_FAULT', 'ENVIRONMENT')),
  pain_timing                  text CHECK (pain_timing IN ('PRE_PURCHASE', 'POST_PURCHASE')),
  persona_role                 text CHECK (persona_role IN ('BUYER', 'USER', 'PAYER', 'INFLUENCER')),
  proxy_consumption            boolean DEFAULT false,
  is_segmentation_axis         boolean DEFAULT false,
  value_realization_frequency  text CHECK (value_realization_frequency IN ('HIGH', 'MEDIUM', 'LOW')),
  human_confirmed              boolean DEFAULT false,
  notes                        text,
  created_at                   timestamptz DEFAULT now()
);

-- ── analysis_angles ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analysis_angles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid REFERENCES public.analysis_projects (id) ON DELETE CASCADE,
  aspect_id               uuid REFERENCES public.analysis_aspects (id),
  angle_type              text CHECK (angle_type IN ('PAS', 'MECHANISM', 'COMPARISON', 'SOCIAL_PROOF', 'FEAR_FOMO', 'ASPIRATION', 'REATTRIBUTION', 'SELF_SELECTION')),
  output_type             text CHECK (output_type IN ('COPY', 'STRUCTURE', 'OFFER', 'PRODUCT_SPEC', 'BASELINE_SPEC')),
  headline_draft          text,
  substantiation_verdict  text CHECK (substantiation_verdict IN ('SUBSTANTIATED', 'EXPERIENTIAL', 'UNSUBSTANTIATED')),
  created_at              timestamptz DEFAULT now()
);

-- ── 인덱스 ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_analysis_inputs_project
  ON public.analysis_inputs (project_id);

CREATE INDEX IF NOT EXISTS idx_analysis_aspects_project
  ON public.analysis_aspects (project_id);

CREATE INDEX IF NOT EXISTS idx_analysis_angles_project
  ON public.analysis_angles (project_id);

CREATE INDEX IF NOT EXISTS idx_analysis_angles_aspect
  ON public.analysis_angles (aspect_id);

-- ── RLS: admin+(super_admin/admin) 전체 ──────────────────────
-- member 직접 접근 불필요(전부 service_role 경유). anon 정책 없음.
ALTER TABLE public.analysis_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analysis_projects: admin+ 전체" ON public.analysis_projects;
CREATE POLICY "analysis_projects: admin+ 전체"
  ON public.analysis_projects FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

ALTER TABLE public.analysis_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analysis_inputs: admin+ 전체" ON public.analysis_inputs;
CREATE POLICY "analysis_inputs: admin+ 전체"
  ON public.analysis_inputs FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

ALTER TABLE public.analysis_aspects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analysis_aspects: admin+ 전체" ON public.analysis_aspects;
CREATE POLICY "analysis_aspects: admin+ 전체"
  ON public.analysis_aspects FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

ALTER TABLE public.analysis_angles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analysis_angles: admin+ 전체" ON public.analysis_angles;
CREATE POLICY "analysis_angles: admin+ 전체"
  ON public.analysis_angles FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

-- ── 컬럼 의미 주석 ───────────────────────────────────────────
COMMENT ON COLUMN public.analysis_aspects.importance IS 'I_k: 속성 k의 중요도';
COMMENT ON COLUMN public.analysis_aspects.satisfaction IS 'S_k: 속성 k의 만족도';
COMMENT ON COLUMN public.analysis_aspects.opportunity_score IS 'O_k = I + max(I-S, 0). DB 계산(generated) 컬럼이므로 앱에서 INSERT/UPDATE 금지.';
COMMENT ON COLUMN public.analysis_aspects.human_confirmed IS '사람 검수 통과 여부';
