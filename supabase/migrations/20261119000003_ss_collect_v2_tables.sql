-- v71cu S5/S6/S8/S9/S10/S12: 수집 v2 새 표(추가 전용). 롤백 파일 짝 있음.
CREATE TABLE IF NOT EXISTS public.collect_frontier (
  id bigserial PRIMARY KEY, layer text NOT NULL CHECK (layer IN ('community','board','app','repo','query','channel','video','feed')),
  source_key text NOT NULL, parent_id bigint REFERENCES public.collect_frontier(id), ref text NOT NULL, engine text, title text, lang text,
  area_guess text, discovered_by text, discovered_at timestamptz NOT NULL DEFAULT now(), target_id uuid REFERENCES public.review_targets(id) ON DELETE SET NULL,
  onboard_batch text, UNIQUE (source_key, layer, ref));
CREATE TABLE IF NOT EXISTS public.collect_frontier_events (
  id bigserial PRIMARY KEY, frontier_id bigint NOT NULL REFERENCES public.collect_frontier(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('candidate','probing','provisional','promoted','dormant','blocked','needs_key','owner_disabled')),
  reason text, stats jsonb, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS collect_frontier_events_f_idx ON public.collect_frontier_events (frontier_id, at DESC);
CREATE OR REPLACE VIEW public.v_frontier_state WITH (security_invoker = true) AS
  SELECT DISTINCT ON (f.id) f.id AS frontier_id, f.layer, f.source_key, f.ref, f.onboard_batch, e.state, e.reason, e.at
  FROM public.collect_frontier f LEFT JOIN public.collect_frontier_events e ON e.frontier_id = f.id ORDER BY f.id, e.at DESC NULLS LAST;
CREATE TABLE IF NOT EXISTS public.source_candidates (
  id bigserial PRIMARY KEY, domain text NOT NULL UNIQUE, engine text, robots_status text, robots_checked_at timestamptz, robots_excerpt text,
  ai_signal text, tos_status text, tos_url text, tos_excerpt text, legal_label text NOT NULL, public_api boolean, area_guess text,
  tech_feasible boolean, tech_block_reason text, onboarded_source_key text, onboard_batch text, owner_decision text, owner_decided_at timestamptz,
  note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.target_yield_daily (
  report_date date NOT NULL, target_id uuid NOT NULL, source_key text NOT NULL, area text, collected int NOT NULL DEFAULT 0, judged int NOT NULL DEFAULT 0,
  usable int NOT NULL DEFAULT 0, duplicates int NOT NULL DEFAULT 0, promo int NOT NULL DEFAULT 0, requests int NOT NULL DEFAULT 0, empty_runs int NOT NULL DEFAULT 0,
  PRIMARY KEY (report_date, target_id));
CREATE TABLE IF NOT EXISTS public.content_quality_flags (
  id bigserial PRIMARY KEY, input_id uuid NOT NULL REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  flag text NOT NULL CHECK (flag IN ('near_dup','promo','dev_reply','quote_only','too_short')), rule_ver text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (input_id, flag, rule_ver));
CREATE TABLE IF NOT EXISTS public.api_quota_log (
  id bigserial PRIMARY KEY, date date NOT NULL, api text NOT NULL, bucket text NOT NULL, used int NOT NULL DEFAULT 0, "limit" int NOT NULL, UNIQUE (date, api, bucket));
CREATE TABLE IF NOT EXISTS public.case_feed_items (
  id bigserial PRIMARY KEY, source text NOT NULL, url text NOT NULL, title text, published_at timestamptz, content_hash text, ground_path text,
  status text NOT NULL DEFAULT 'new', summary text, labels jsonb, onboard_batch text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (source, url));
CREATE TABLE IF NOT EXISTS public.collect_daily_report (report_date date PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['collect_frontier','collect_frontier_events','source_candidates','target_yield_daily','content_quality_flags','api_quota_log','case_feed_items','collect_daily_report'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t); END LOOP; END $$;
REVOKE ALL ON public.v_frontier_state FROM anon, authenticated;
