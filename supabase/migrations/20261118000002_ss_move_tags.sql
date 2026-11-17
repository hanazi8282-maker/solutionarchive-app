-- v71cr/[꼬리표]: 장별 꼬리표(상황×행동×결과×먹힌 이유×통하는 조건×증거 강도). ss_moves 한 줄(행동)당 label_run 별로 한 줄, 추가 전용.
-- 영어 원문 인용은 넣지 않는다(한국어 요약만). 접근: service_role 전용(RLS 켜고 anon·authenticated 권한 제거).
BEGIN;
CREATE TABLE IF NOT EXISTS public.ss_move_tags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  move_id          uuid NOT NULL REFERENCES public.ss_moves(id),
  chapter          text NOT NULL CHECK (chapter IN ('1','2','3','4','5','6','7')),
  stage            text NOT NULL DEFAULT 'unknown' CHECK (stage IN ('prelaunch','zero_rev','early_rev','growing','unknown')),
  team_size        text NOT NULL DEFAULT 'unknown' CHECK (team_size IN ('solo','2-10','11+','unknown')),
  customer         text NOT NULL DEFAULT 'unknown' CHECK (customer IN ('smb','consumer','dev','enterprise','creator','unknown')),
  price_band       text NOT NULL DEFAULT 'unknown' CHECK (price_band IN ('<10','10-49','50-249','250+','unknown')),
  revenue_band     text NOT NULL DEFAULT 'unknown' CHECK (revenue_band IN ('<1k','1-5k','5-10k','10-50k','50-100k','100k+','unknown')),
  action_kind      text NOT NULL DEFAULT 'unknown',
  result_class     text NOT NULL DEFAULT 'unknown' CHECK (result_class IN ('positive','mixed','negative','none','unknown')),
  result_ko        text CHECK (result_ko IS NULL OR length(result_ko) <= 200),
  why_worked_ko    text CHECK (why_worked_ko IS NULL OR length(why_worked_ko) <= 200),
  condition_ko     text CHECK (condition_ko IS NULL OR length(condition_ko) <= 200),
  evidence_strength text NOT NULL DEFAULT 'C' CHECK (evidence_strength IN ('A','B','C')),
  basis            jsonb NOT NULL DEFAULT '{}'::jsonb,
  label_model      text NOT NULL,
  label_run        text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ss_move_tags_move_run_key UNIQUE (move_id, label_run)
);
CREATE INDEX IF NOT EXISTS ss_move_tags_chapter_idx ON public.ss_move_tags (chapter, result_class);
CREATE INDEX IF NOT EXISTS ss_move_tags_run_idx ON public.ss_move_tags (label_run);
ALTER TABLE public.ss_move_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ss_move_tags FROM anon, authenticated;
COMMIT;
-- 확인(양성): to_regclass('public.ss_move_tags') 존재 · relrowsecurity=true / 음성: has_table_privilege('anon','public.ss_move_tags','SELECT') = false
