-- ============================================================
-- RLS 보안 패치: RLS 비활성 테이블 4개 차단
-- ad_metrics, _archive_* 3개 — anon 키 전체 노출 차단
-- 패턴: admin+(super_admin/admin) 전체. member 직접 접근 불필요(전부 service_role 경유).
-- 가역: 동명 rollback 파일 참조.
-- ============================================================

-- ── ad_metrics ───────────────────────────────────────────────
-- 런타임 접근(diagnose/alerts/meta_ads adapter/kpi snapshot)은 전부 service_role(server-side).
-- member 는 kpi_snapshots 경유로만 지표를 보므로 ad_metrics 직접 SELECT 불필요.
ALTER TABLE public.ad_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_metrics: admin+ 전체"
  ON public.ad_metrics FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

-- ── _archive_set_compositions_20260614 ───────────────────────
ALTER TABLE public._archive_set_compositions_20260614 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_set_comp: admin+ 전체"
  ON public._archive_set_compositions_20260614 FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

-- ── _archive_packaging_rules_20260614 ────────────────────────
ALTER TABLE public._archive_packaging_rules_20260614 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_pkg_rules: admin+ 전체"
  ON public._archive_packaging_rules_20260614 FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));

-- ── _archive_sku_keywords_20260614 ───────────────────────────
ALTER TABLE public._archive_sku_keywords_20260614 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_sku_kw: admin+ 전체"
  ON public._archive_sku_keywords_20260614 FOR ALL TO authenticated
  USING ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK ((get_user_role())::text = ANY (ARRAY['super_admin'::text, 'admin'::text]));
