-- v71cu S5-3: 새 포럼 7곳 켜기(표준 Discourse). 남헌 2026-11-19 결정(override='owner_2026-11-19', quote_policy='none'). 끄는 짝: 20261119000005_disable_forums_batch_20261119.sql
-- 약관(/tos, 2026-11-19 직접 읽음): frappe·suitecrm·invoiceninja = Discourse 기본 자동 접근 금지 문구 → forbids_automation / obsidian(spiders·screen scraping)·shopify(robot·spider·scraper) → prohibited /
--   mautic(약관 화면이 스크립트 응답)·ghost(자동수집 문구 없음, 확인 못 함) → unverified. Shopify 커뮤니티는 Shopify 앱스토어(약관 금지·차단 이력)와 같은 회사 — note 에 적음.
-- 비파괴·멱등: INSERT 만(ON CONFLICT DO NOTHING). onboard_batch='onboard_20261119' 로 변수 COLLECT_ONBOARD_DISABLED_BATCHES 에 넣어 건너뛸 수 있다.
BEGIN;
INSERT INTO public.review_sources (key, display_name, enabled, health, min_interval_ms, daily_request_cap, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result) VALUES
 ('mautic_forum','Mautic 포럼(Discourse)',true,'ok',6000,40,'allowed','unverified','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. 약관 화면을 읽지 못함(unverified).'),
 ('frappe_forum','Frappe·ERPNext 포럼(Discourse)',true,'ok',6000,40,'allowed','forbids_automation','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. Discourse 기본 자동 접근 금지 문구.'),
 ('suitecrm_community','SuiteCRM 커뮤니티(Discourse)',true,'ok',6000,40,'allowed','forbids_automation','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. Discourse 기본 자동 접근 금지 문구.'),
 ('invoiceninja_forum','Invoice Ninja 포럼(Discourse)',true,'ok',6000,40,'allowed','forbids_automation','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. Discourse 기본 자동 접근 금지 문구.'),
 ('obsidian_forum','Obsidian 포럼(Discourse)',true,'ok',6000,40,'allowed','prohibited','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. 약관: spiders/screen scraping 금지 문구.'),
 ('ghost_forum','Ghost 포럼(Discourse)',true,'ok',6000,40,'allowed','unverified','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. 약관에서 자동수집 문구를 찾지 못함(unverified).'),
 ('shopify_community','Shopify 커뮤니티(Discourse)',true,'ok',6000,40,'allowed','prohibited','owner_2026-11-19','none',false,true,'낮음 — 공개 포럼. 사용자명·프로필·아바타 미저장, @멘션 치환.','2026-11-19 categories.json 200. 약관: robot/spider/scraper 금지. Shopify 앱스토어(약관 금지·차단 이력)와 같은 회사 — 브리핑 별도 표시.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
SELECT k, 0, 2, 'v71cu S5 — 새 소스 50% 출발(owner_2026-11-19 남헌 결정)', 50, 40, 20
  FROM unnest(ARRAY['mautic_forum','frappe_forum','suitecrm_community','invoiceninja_forum','obsidian_forum','ghost_forum','shopify_community']) k
ON CONFLICT (source_key) DO NOTHING;

CREATE TEMP TABLE _f (src text, ref text, label text, pitch text, url text) ON COMMIT DROP;
INSERT INTO _f VALUES
 ('mautic_forum','board:support','Mautic 포럼 · 지원','Mautic — 오픈소스 마케팅 자동화','https://www.mautic.org/'),
 ('mautic_forum','board:ideas','Mautic 포럼 · 아이디어','Mautic — 오픈소스 마케팅 자동화','https://www.mautic.org/'),
 ('frappe_forum','board:erpnext','Frappe 포럼 · ERPNext','ERPNext — 오픈소스 ERP·회계','https://erpnext.com/'),
 ('frappe_forum','board:hr','Frappe 포럼 · HR','ERPNext — 오픈소스 ERP·회계','https://erpnext.com/'),
 ('suitecrm_community','board:suitecrm-general-discussion','SuiteCRM 커뮤니티 · 일반','SuiteCRM — 오픈소스 CRM','https://suitecrm.com/'),
 ('suitecrm_community','board:suggestion-box','SuiteCRM 커뮤니티 · 제안','SuiteCRM — 오픈소스 CRM','https://suitecrm.com/'),
 ('invoiceninja_forum','board:self-hosted','Invoice Ninja 포럼 · 셀프호스트','Invoice Ninja — 오픈소스 청구서·결제','https://invoiceninja.com/'),
 ('invoiceninja_forum','board:hosted','Invoice Ninja 포럼 · 호스티드','Invoice Ninja — 오픈소스 청구서·결제','https://invoiceninja.com/'),
 ('obsidian_forum','board:feature-requests','Obsidian 포럼 · 기능 요청','Obsidian — 노트·지식관리','https://obsidian.md/'),
 ('obsidian_forum','board:get-help','Obsidian 포럼 · 도움','Obsidian — 노트·지식관리','https://obsidian.md/'),
 ('ghost_forum','board:ideas','Ghost 포럼 · 아이디어','Ghost — 뉴스레터·퍼블리싱','https://ghost.org/'),
 ('ghost_forum','board:help','Ghost 포럼 · 도움','Ghost — 뉴스레터·퍼블리싱','https://ghost.org/'),
 ('shopify_community','board:shopify-apps','Shopify 커뮤니티 · 앱','Shopify — 이커머스 플랫폼','https://www.shopify.com/'),
 ('shopify_community','board:payments-shipping-fulfilment','Shopify 커뮤니티 · 결제·배송','Shopify — 이커머스 플랫폼','https://www.shopify.com/');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, status, mode, business_model)
SELECT DISTINCT ON (pitch) url, pitch, 'product_fit', 'collecting', 'forward', 'SAAS' FROM _f
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = _f.pitch) ORDER BY pitch;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status, onboard_batch, layer)
SELECT pj.id, f.src, f.ref, f.label, NULL, 'active', 'onboard_20261119', 'board' FROM _f f
 JOIN LATERAL (SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = f.pitch ORDER BY p.created_at NULLS LAST, p.id LIMIT 1) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = f.src AND t.product_ref = f.ref);

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.review_sources WHERE override = 'owner_2026-11-19' AND enabled AND quote_policy = 'none';
  IF n < 7 THEN RAISE EXCEPTION 'sources % (expected 7)', n; END IF;
  SELECT count(*) INTO n FROM public.review_targets WHERE onboard_batch = 'onboard_20261119';
  IF n < 14 THEN RAISE EXCEPTION 'targets % (expected 14)', n; END IF;
END $$;
COMMIT;
