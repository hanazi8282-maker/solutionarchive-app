-- v71cu S1: 분야 이름표 통일 (추가 전용). 롤백: 20261119000001_ss_area_registry_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.area_registry (
  slug text PRIMARY KEY, name_ko text NOT NULL, legacy_code text, status text NOT NULL DEFAULT 'active',
  opened_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.area_registry(slug,name_ko,legacy_code,status) VALUES
 ('meeting_notes','회의·통화 기록','1','active'),
 ('sales_assistant','영업 도우미(영역②)','2','active'),
 ('marketing_tools','마케팅 도구(영역③)','3','active'),
 ('hr_ops','인사 운영·근태(영역④)','4','active'),
 ('review_writing','리뷰 관리·글쓰기(영역⑤)','5','active'),
 ('design','디자인','design','active'),
 ('hold','보류','hold','hold'),
 ('out_founder','영역 밖(창업가 일반)','out-founder','out'),
 ('out_consumer','영역 밖(소비재)','out-consumer','out'),
 ('payments_billing_accounting','결제·정산·회계(4분야)','pay','active'),
 ('booking_scheduling_forms','예약·일정·폼(4분야)',NULL,'active'),
 ('marketing_automation','마케팅 자동화(4분야)',NULL,'active'),
 ('sales_crm','SMB 영업·CRM(4분야)',NULL,'active')
ON CONFLICT (slug) DO NOTHING;
ALTER TABLE public.area_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.area_registry FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.target_area_links (
  id bigserial PRIMARY KEY, target_id uuid NOT NULL REFERENCES public.review_targets(id) ON DELETE CASCADE,
  area_slug text NOT NULL REFERENCES public.area_registry(slug), basis text NOT NULL, rule_ver text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (target_id, area_slug));
ALTER TABLE public.target_area_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.target_area_links FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.review_targets_area_filled_20261119 (target_id uuid PRIMARY KEY, prev_area text, new_area text NOT NULL, filled_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.review_targets_area_filled_20261119 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_targets_area_filled_20261119 FROM anon, authenticated;

-- review_area_verdicts: 빈 표(0행)의 CHECK 를 슬러그까지 넓힌다(좁히기 아님).
ALTER TABLE public.review_area_verdicts DROP CONSTRAINT IF EXISTS review_area_verdicts_area_code_check;
ALTER TABLE public.review_area_verdicts ADD CONSTRAINT review_area_verdicts_area_code_check
  CHECK (area_code = ANY (ARRAY['1','2','3','4','5','none','meeting_notes','sales_assistant','marketing_tools','hr_ops','review_writing','design','hold','out_founder','out_consumer','payments_billing_accounting','booking_scheduling_forms','marketing_automation','sales_crm']));
COMMIT;
