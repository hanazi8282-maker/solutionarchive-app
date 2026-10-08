-- ============================================================
-- 20261008000040_five_arm_sources — 영역 ⑤(리뷰 관리) 3갈래 시험의 소스 2개 등록 + 램프 50% 출발 + 타깃 19개
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1·§10.2). 적용은 오케스트레이터가 검토 뒤에 한다.
-- 근거: v37 작업 4 · 약관 점검 reports/2026-10-08/five-b-terms-check.md · 등록 메모 reports/2026-10-08/five-arm-sources-notes.md
-- 선행: 20261005000001(정책 컬럼) · 20261005000003(quote_policy·tos CHECK) · 20260930000034 + 20261006000002(review_source_ramp·퍼센트 칸).
--       없으면 실패한다 — 그게 맞다.
-- 코드 짝: lib/review/adapters/wordpress.ts · lib/review/adapters/shopify.ts · scripts/review-collect.mjs ADAPTERS ·
--          lib/review/target-ref.ts REF_BUILDERS · scripts/review-five-arm-selftest.mjs. 코드가 main 에 없으면 이 타깃들은
--          매일 밤 "알 수 없는 소스"가 아니라 --source=all 목록 밖이라 조용히 안 돈다 — 코드 머지 뒤에 적용한다.
--
-- ── (A) wordpress_org — 깨끗한 소스(§10.1 "발굴 적재" 바로 등록 갈래, cap_base 첫 값도 세션 몫) ──
--   robots(2026-10-08 실측, robotsVerdict): wordpress.org/robots.txt `*` Disallow = /wp-admin/ · /search · /?s= · /plugins/search/
--     → `/support/plugin/<slug>/reviews/feed/` allowed → robots_status='allowed'.
--     ⛔ api.wordpress.org 는 `User-agent: * / Disallow: /` — 어댑터는 그 호스트를 쓰지 않는다.
--   약관: https://wordpress.org/about/terms/ → 404(약관 문서 없음). 개인정보처리방침(2026-06-29)·포럼 가이드라인(2026-04-25)에
--     자동 접근·스크래핑·복제·상업 이용 문장 없음 → tos_status='silent'(어휘: "조항 없음", 20261005000003 COMMENT).
--   저작권 귀속 조항 없음(= 작성자 권리) → quote_policy='short_only', citation_allowed=true.
--   로그인·캡차 없음(RSS 200 application/rss+xml, item 30). 개인정보 낮음 — 사용자명(dc:creator)은 저장하지 않는다.
--   시드: min_interval_ms 5000 · daily_request_cap 40 · 램프 cap_base 40 → 50% = 하루 20요청. 타깃 9개 × 피드 1요청.
--
-- ── (B) shopify_apps — 약관 금지, 남헌 owner override(2026-10-08 사전 승인, v37) ──
--   약관: Shopify Terms of Service(Last updated 2026-08-01) https://www.shopify.com/legal/terms
--     1조 9항 원문: "You agree not to access the Services or monitor any material or information from the Services using any robot,
--       spider, scraper, or other automated means."
--     1조 7항 원문(일부): "You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service, use of the
--       Services, or access to the Services without the express written permission by Shopify."
--   남헌 예외 기록: "Shopify ToS 1조 9항(자동 수단 접근 금지)·7항(무단 복제 금지)을 알고, 영역 ⑤ 3갈래 시험을 위해 소유자 예외로 켠다
--     — 남헌 승인 2026-10-08(v37 사전 승인)." → override='owner_2026-10-08'.
--   ⚠️ 이 override 는 **약관 예외 기록**이다. 러너 OWNER_ROBOTS_OVERRIDES(robots 금지 예외)에 넣지 않았다 — 이 소스는 robots 가
--      허용이라 필요 없고, robots 가 나중에 금지로 바뀌면 멈춰야 한다. override 값이 실제로 읽히는 곳:
--      target-supply tos_flag 억제(lib/review/target-supply.ts) · 요청 상한 자동 상향 제외(lib/review/request-cap.ts → 'fixed') ·
--      실행 행 스냅샷(review_collection_runs.override_value, runner RunResult.overrideValue). 카카오(owner_2026-10-06)와 같은 구조.
--   tos_status='prohibited' → CHECK 로 quote_allowed=false · quote_policy<>'full'. 보수적으로 quote_policy='none'
--     (1조 7항이 "any portion" 복제를 막는다 — 고객 화면 인용·요약 0). citation_allowed=true(내부 분석 근거로는 쓴다).
--   robots(2026-10-08 실측): apps.shopify.com/robots.txt `*` Disallow = /internal/ · /services/ · `*q=*` · `/*?*shpxid=*` · `/*?*auth=*`
--     → `/<앱>/reviews?sort_by=newest&page=N` allowed → robots_status='allowed'. 쿼리 규칙은 어댑터 isAllowedReviewUrl 이 지킨다.
--   중단: 403·429·빈 응답·캡차 즉시 중단(abortOnChallenge), 리뷰 표지 없는 200 = 파싱 실패. 우회(UA 위장·쿠키·프록시) 없음.
--   시드: min_interval_ms 8000(요구 ≥5초) · daily_request_cap 30 · 램프 cap_base 30 → 50% = 하루 15요청. 타깃 10개 × 최대 2페이지.
--     소유자 예외 소스라 야간 cap 자동 상향 대상이 아니다(request-cap 'fixed').
--
-- ── 타깃 ─────────────────────────────────────────────────────
--   라벨 `5:wp|<플러그인 slug>` · `5:shopify|<앱 slug>` — 영역 판독 정규식 `^([1-5]):`(target-supply areaOf) 호환.
--   project_id: 제품 사전(reports/2026-10-05/product-dictionary/area-07) 영역 ⑤ 제품은 사전 투입기와 **같은 pitch** 로 프로젝트를
--     찾고(없으면 만든다) — scripts/dictionary-targets.mjs findProjectsByPitch 와 같은 키라 kakao q: 타깃과 한 프로젝트에 모인다.
--     사전 밖 제품(Stamped·Fera·Ali Reviews·Rivyo, WP 플러그인 7개)은 전용 프로젝트 1개씩(business_model='SAAS').
--   status='active' · cursor NULL(review_targets 기본 규칙). 타깃 INSERT 는 두 소스가 enabled=true 일 때만(§10.1).
--
-- 🟢 비파괴·멱등. INSERT 만: review_sources 2행(ON CONFLICT (key) DO NOTHING) · review_source_ramp 2행(ON CONFLICT DO NOTHING) ·
--    analysis_projects ≤17행(같은 pitch 있으면 건너뜀) · review_targets 19행(같은 source_key+product_ref 있으면 건너뜀).
--    UPDATE·DELETE·DDL 없음. 끝의 DO 블록이 값을 대조하고 어긋나면 RAISE → 전체 롤백(§7.1 — DO NOTHING 이 값을 못 바꾼 경우 포함).
--    §10.2 사람 판단 예외: (B)는 4번(새 법적 리스크)에 해당하지만 남헌 사전 승인(2026-10-08 v37)으로 해소. 나머지 해당 없음.
-- 롤백: 20261008000040_five_arm_sources_rollback.sql
-- ============================================================

-- ── 적용 전 확인(information_schema·직접 SELECT — PostgREST head:true 금지, §7.1) ──
--   SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_sources'
--      AND column_name IN ('robots_status','tos_status','override','quote_policy','citation_allowed','quote_allowed','privacy_check');  -- 기대: 7
--   SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_source_ramp'
--      AND column_name IN ('pct_step','cap_base','daily_request_target');                                                              -- 기대: 3
--   SELECT key FROM public.review_sources WHERE key IN ('wordpress_org','shopify_apps');                                              -- 기대: 0행
--   SELECT source_key, product_ref FROM public.review_targets WHERE source_key IN ('wordpress_org','shopify_apps');                   -- 기대: 0행

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result
) VALUES
  (
    'wordpress_org',
    'WordPress.org 플러그인 리뷰',
    true,
    NULL,
    'ok', 5000, 40,
    'allowed', 'silent', NULL, 'short_only', true, true,
    '낮음 — 공개 사용자명·Gravatar 만. 사용자명은 저장 안 함(authorMasked=null). 본문은 플러그인 사용 경험 중심.',
    '2026-10-08 미실행 — 구조 확인 RSS 1회(site-reviews, 200 rss+xml, item 30). 셀프테스트 scripts/review-five-arm-selftest.mjs.'
  ),
  (
    'shopify_apps',
    'Shopify 앱스토어 리뷰',
    true,
    NULL,
    'ok', 8000, 30,
    'allowed', 'prohibited', 'owner_2026-10-08', 'none', false, true,
    '낮음 — 작성자는 상점명·국가. 둘 다 저장 안 함(authorMasked=null). 본문은 앱 사용 경험 중심.',
    '2026-10-08 미실행 — 남헌 소유자 예외(ToS 1조 9항·7항 인지). 구조 확인 HTML 1회(loox ?page=2, 200, 리뷰 10·캡차 0).'
  )
ON CONFLICT (key) DO NOTHING;

-- 퍼센트 램프 50% 출발(§10.1 cap_base 첫 입력 — wordpress_org 는 깨끗한 소스 예외, shopify_apps 는 남헌 사전 승인).
INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
VALUES
  ('wordpress_org', 0, 10, 'v37 작업 4 — 새 소스 50% 출발(깨끗한 소스, 세션 등록)', 50, 40, 20),
  ('shopify_apps',  0, 10, 'v37 작업 4 — 새 소스 50% 출발(owner_2026-10-08 남헌 사전 승인)', 50, 30, 15)
ON CONFLICT (source_key) DO NOTHING;

-- 타깃은 enabled 소스에만(§10.1).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key IN ('wordpress_org', 'shopify_apps') AND enabled) <> 2 THEN
    RAISE EXCEPTION 'wordpress_org·shopify_apps 중 없거나 enabled=false 인 소스가 있다 — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _five_arm (
  src text NOT NULL, ref text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL
) ON COMMIT DROP;

INSERT INTO _five_arm (src, ref, label, pitch, url) VALUES
  -- (B) Shopify — 사전 영역 ⑤ 제품 6개(pitch = 사전 투입기 productPitch 그대로)
  ('shopify_apps', 'app:judgeme',              '5:shopify|judgeme',              'Judge.me (저지미) — Shopify 중심 상품 리뷰 수집·표시 앱', 'https://judge.me/'),
  ('shopify_apps', 'app:loox',                 '5:shopify|loox',                 'Loox (룩스) — 사진·영상 리뷰 중심 Shopify 리뷰·추천 앱', 'https://loox.app/'),
  ('shopify_apps', 'app:yotpo-social-reviews', '5:shopify|yotpo-social-reviews', 'Yotpo (욧포) — 이커머스 리뷰·UGC·로열티 플랫폼', 'https://www.yotpo.com/'),
  ('shopify_apps', 'app:okendo-reviews',       '5:shopify|okendo-reviews',       'Okendo (오켄도) — Shopify 리뷰·로열티·추천·퀴즈 고객 마케팅 플랫폼', 'https://okendo.io/'),
  ('shopify_apps', 'app:crema-review',         '5:shopify|crema-review',         'CREMA (크리마) — 자사몰 리뷰 수집·마케팅 솔루션(타 플랫폼 리뷰 연동, AI 분석)', 'https://www.cre.ma/'),
  ('shopify_apps', 'app:alphareview',          '5:shopify|alphareview',          'Alpha Review (알파리뷰) — 샐러드랩(알파앱스)의 쇼핑몰 리뷰 앱 — 텍스트·사진·Q&A 리뷰, 리뷰 데이터 분석', 'https://alph.kr/'),
  -- (B) Shopify — 사전 밖 4개(전용 프로젝트)
  ('shopify_apps', 'app:product-reviews-addon', '5:shopify|product-reviews-addon', 'Stamped Reviews & Loyalty (Stamped.io) — Shopify 리뷰·로열티 앱. 영역 ⑤ 3갈래 시험(v37).', 'https://apps.shopify.com/product-reviews-addon'),
  ('shopify_apps', 'app:fera',                 '5:shopify|fera',                 'Fera Product Reviews App (Fera Commerce) — Shopify 상품 리뷰 앱. 영역 ⑤ 3갈래 시험(v37).', 'https://apps.shopify.com/fera'),
  ('shopify_apps', 'app:ali-reviews',          '5:shopify|ali-reviews',          'Ali Reviews: AI Product Review (FireApps) — Shopify 리뷰 수집·가져오기 앱. 영역 ⑤ 3갈래 시험(v37).', 'https://apps.shopify.com/ali-reviews'),
  ('shopify_apps', 'app:rivyo-product-review', '5:shopify|rivyo-product-review', 'Rivyo Product Reviews App (Nexfal) — Shopify 상품 리뷰 앱. 영역 ⑤ 3갈래 시험(v37).', 'https://apps.shopify.com/rivyo-product-review'),
  -- (A) WordPress.org — Judge.me·Yotpo 의 WooCommerce 플러그인은 같은 제품 프로젝트에 붙인다
  ('wordpress_org', 'plugin:judgeme-product-reviews-woocommerce', '5:wp|judgeme-product-reviews-woocommerce', 'Judge.me (저지미) — Shopify 중심 상품 리뷰 수집·표시 앱', 'https://judge.me/'),
  ('wordpress_org', 'plugin:yotpo-social-reviews-for-woocommerce', '5:wp|yotpo-social-reviews-for-woocommerce', 'Yotpo (욧포) — 이커머스 리뷰·UGC·로열티 플랫폼', 'https://www.yotpo.com/'),
  ('wordpress_org', 'plugin:customer-reviews-woocommerce', '5:wp|customer-reviews-woocommerce', 'Customer Reviews for WooCommerce (CusRev) — WooCommerce 리뷰 수집·리마인더 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/customer-reviews-woocommerce/'),
  ('wordpress_org', 'plugin:site-reviews',     '5:wp|site-reviews',     'Site Reviews — WordPress 사이트 리뷰 수집·표시 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/site-reviews/'),
  ('wordpress_org', 'plugin:wp-reviews-plugin-for-google', '5:wp|wp-reviews-plugin-for-google', 'Widgets for Google Reviews (Trustindex) — 구글 리뷰 위젯 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/wp-reviews-plugin-for-google/'),
  ('wordpress_org', 'plugin:wp-customer-reviews', '5:wp|wp-customer-reviews', 'WP Customer Reviews — WordPress 고객 리뷰 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/wp-customer-reviews/'),
  ('wordpress_org', 'plugin:woo-photo-reviews', '5:wp|woo-photo-reviews', 'Photo Reviews for WooCommerce (VillaTheme) — 사진 리뷰 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/woo-photo-reviews/'),
  ('wordpress_org', 'plugin:trustpilot-reviews', '5:wp|trustpilot-reviews', 'Trustpilot Reviews — Trustpilot 리뷰 연동 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/trustpilot-reviews/'),
  ('wordpress_org', 'plugin:reviews-feed',     '5:wp|reviews-feed',     'Reviews Feed (Smash Balloon) — 외부 리뷰 피드 표시 플러그인. 영역 ⑤ 3갈래 시험(v37).', 'https://wordpress.org/plugins/reviews-feed/');

-- 프로젝트: 같은 pitch 가 이미 있으면 재사용(사전 투입기와 같은 키). 없으면 collecting 으로 새로(§10.1).
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model)
SELECT DISTINCT ON (f.pitch) f.url, f.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS'
  FROM _five_arm f
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = f.pitch)
 ORDER BY f.pitch;

-- 타깃: pitch 당 가장 오래된 프로젝트 1개에 붙인다. 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 건너뛴다
-- (DB UNIQUE 는 project_id 포함이라 프로젝트 빼고 대조 — dictionary-targets.mjs 와 같은 규칙).
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, f.src, f.ref, f.label, NULL, 'active'
  FROM _five_arm f
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = f.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = f.src AND t.product_ref = f.ref);

DO $$
DECLARE n int; bad int;
BEGIN
  -- 소스 값 대조(ON CONFLICT 로 기존 행이 남았으면 여기서 잡힌다).
  SELECT count(*) INTO n FROM public.review_sources
   WHERE (key = 'wordpress_org' AND enabled AND robots_status = 'allowed' AND tos_status = 'silent' AND override IS NULL
          AND quote_policy = 'short_only' AND min_interval_ms = 5000 AND daily_request_cap = 40)
      OR (key = 'shopify_apps' AND enabled AND robots_status = 'allowed' AND tos_status = 'prohibited' AND override = 'owner_2026-10-08'
          AND quote_policy = 'none' AND NOT quote_allowed AND min_interval_ms >= 5000 AND daily_request_cap = 30);
  IF n <> 2 THEN RAISE EXCEPTION 'review_sources 값 불일치 — 기대 2행, 일치 %행(기존 행이 있었는지 확인)', n; END IF;

  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE (source_key = 'wordpress_org' AND cap_base = 40 AND pct_step = 50 AND daily_request_target = 20)
      OR (source_key = 'shopify_apps' AND cap_base = 30 AND pct_step = 50 AND daily_request_target = 15);
  IF n <> 2 THEN RAISE EXCEPTION 'review_source_ramp 50%% 출발 행 불일치 — 기대 2, 일치 %', n; END IF;

  SELECT count(*) INTO n FROM public.review_targets t JOIN _five_arm f ON f.src = t.source_key AND f.ref = t.product_ref;
  IF n <> 19 THEN RAISE EXCEPTION '타깃 % 개(기대 19)', n; END IF;
  SELECT count(*) INTO bad FROM public.review_targets t JOIN _five_arm f ON f.src = t.source_key AND f.ref = t.product_ref
   WHERE t.label !~ '^5:(wp|shopify)\|' OR t.product_ref ~ '(q|shpxid|auth)=';
  IF bad <> 0 THEN RAISE EXCEPTION '라벨·ref 규칙 위반 %행', bad; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
--   SELECT key, enabled, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, min_interval_ms, daily_request_cap
--     FROM public.review_sources WHERE key IN ('shopify_apps','wordpress_org') ORDER BY key;
--   -- 기대 2행: shopify_apps · t · allowed · prohibited · owner_2026-10-08 · none · f · t · 8000 · 30
--   --          wordpress_org · t · allowed · silent · NULL · short_only · t · t · 5000 · 40
--   SELECT source_key, pct_step, cap_base, daily_request_target, targets_per_run FROM public.review_source_ramp
--    WHERE source_key IN ('shopify_apps','wordpress_org') ORDER BY 1;     -- 기대: 50·30·15·10 / 50·40·20·10
--   SELECT t.source_key, count(*), count(*) FILTER (WHERE t.status='active' AND t.cursor IS NULL) AS fresh
--     FROM public.review_targets t WHERE t.source_key IN ('shopify_apps','wordpress_org') GROUP BY 1 ORDER BY 1;
--   -- 기대: shopify_apps 10·10 / wordpress_org 9·9
--   SELECT t.label, p.product_elevator_pitch FROM public.review_targets t JOIN public.analysis_projects p ON p.id = t.project_id
--    WHERE t.source_key IN ('shopify_apps','wordpress_org') ORDER BY 1;   -- judgeme 두 타깃(shopify·wp)이 같은 pitch 프로젝트
-- 음성(롤백되는 형태 — 데이터 남기지 않음):
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'shopify_apps'; ROLLBACK;     -- 기대: 23514 review_sources_tos_restricts_quote_policy
--   BEGIN; UPDATE public.review_sources SET quote_allowed = true WHERE key = 'shopify_apps'; ROLLBACK;      -- 기대: 23514 review_sources_tos_prohibited_no_quote
--   BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, pct_step)
--          VALUES ('wordpress_org', 10, 'x', 50) ON CONFLICT (source_key) DO NOTHING; ROLLBACK;            -- 기대: INSERT 0 0
--   SELECT count(*) FROM public.review_targets WHERE source_key IN ('shopify_apps','wordpress_org') AND product_ref ~ '(q|shpxid|auth)=';  -- 기대: 0
-- 첫 실행 뒤(§7.2): review_collection_runs 의 shopify_apps 행 override_value='owner_2026-10-08' · robots_owner_override=0(robots 예외 미사용) ·
--   blocked_responses=0 이어야 한다. blocked_responses>0 이면 우회하지 말고 소스를 끈다(롤백 파일).
