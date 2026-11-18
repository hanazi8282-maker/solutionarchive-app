-- v71cu S6: collect_build_report(date) — 브리핑 뷰를 굳혀 collect_daily_report 에 그날 1행 upsert(자기 표). 느린 뷰라 함수 단위 statement_timeout 180s. service_role 만 실행. 롤백: DROP FUNCTION.
-- (적용은 MCP apply_migration 으로 완료 — 본문은 이 파일과 동일: jsonb_build_object(briefing,new_onboarded,source_yield_30d,area_progress,generated_at) → INSERT ... ON CONFLICT (report_date) DO UPDATE)
CREATE OR REPLACE FUNCTION public.collect_build_report(p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '180s' AS $$
DECLARE payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'briefing', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.section, b.sort), '[]') FROM public.v_collect_briefing_daily b),
    'new_onboarded', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.label_weight), '[]') FROM public.v_collect_new_onboarded n),
    'source_yield_30d', (SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.source_key), '[]') FROM public.v_source_yield_30d y),
    'area_progress', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM public.v_area_asset_progress a),
    'generated_at', now()) INTO payload;
  INSERT INTO public.collect_daily_report(report_date, payload) VALUES (p_date, payload)
    ON CONFLICT (report_date) DO UPDATE SET payload = EXCLUDED.payload, created_at = now();
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.collect_build_report(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_build_report(date) TO service_role;
