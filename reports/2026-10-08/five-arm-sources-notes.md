# 영역 ⑤ 3갈래 시험 — 소스 2개 등록 메모 (v37 작업 4)

- 대상: `wordpress_org`(wordpress.org 플러그인 리뷰) · `shopify_apps`(Shopify 앱스토어 리뷰)
- 산출물: 어댑터 `lib/review/adapters/wordpress.ts` · `lib/review/adapters/shopify.ts`, 셀프테스트 `scripts/review-five-arm-selftest.mjs`,
  마이그 `supabase/migrations/20261008000040_five_arm_sources.sql`(+`_rollback.sql`). **마이그는 미적용**(서브에이전트, §10.1·§10.2).
- 선행 점검: `reports/2026-10-08/five-b-terms-check.md`(robots·약관 원문, 2026-10-08 14:35~14:50 UTC).
- 이 메모를 쓰며 보낸 요청: 구조 확인용 2회(우리 UA) — `wordpress.org/support/plugin/site-reviews/reviews/feed/` 1회 · `apps.shopify.com/loox/reviews?page=2` 1회.
  타깃 후보 확인용 WebFetch 페이지 1회씩(wordpress.org 플러그인 10개 · Shopify 앱 8개). 응답 본문은 저장하지 않았다(픽스처는 합성본).

---

## 수집 전 라이선스·약관 메모 (수집 문 앞에 둔다)

### (A) wordpress.org — 깨끗한 소스, 세션 등록

- robots: `wordpress.org/robots.txt` 200 · `*` Disallow = `/wp-admin/` `/search` `/?s=` `/plugins/search/` → `/support/plugin/<slug>/reviews/feed/` **허용**(robotsVerdict).
  AI 봇 그룹은 `Allow: /`, Content-Signal 없음.
- ⛔ `api.wordpress.org/robots.txt` = `User-agent: *` / `Disallow: /` → 쓰지 않는다. 어댑터 HOST 상수가 `https://wordpress.org` 고정이고 셀프테스트가 단정한다.
- 약관: `wordpress.org/about/terms/` **404 — 약관 문서가 없다.** 개인정보처리방침(2026-06-29)·포럼 가이드라인(2026-04-25)에
  자동 접근·스크래핑·복제·상업 이용 문장 없음 → `tos_status='silent'`(DB 어휘 "조항 없음", 마이그 20261005000003 COMMENT).
  `permitted` 는 "명시적 허용"이라 쓰지 않았고, `unverified` 는 읽은 문서가 있으니 맞지 않다.
- 저작권: 리뷰 글 권리 귀속 조항이 없다 = 작성자 권리로 본다 → `quote_policy='short_only'`(고객 화면 한국어 130·영어 240자, 소스명·링크·작성자 비표시 — `lib/analysis/evidence-quotes.ts`).
- 로그인·캡차 없음. 개인정보 낮음 — `dc:creator`(사용자명, 실명일 수 있음)는 **저장하지 않는다**(googleplay·kakao 와 같은 정책, `authorMasked=null`).
- §10.1 "깨끗한 소스 → 세션이 바로 등록" 갈래. cap_base 첫 값도 세션 몫(50% 출발).

### (B) Shopify 앱스토어 — 약관 금지, 남헌 소유자 예외

- 약관: Shopify Terms of Service, Last updated 2026-08-01, `https://www.shopify.com/legal/terms`
  - 1조 9항 원문: "You agree not to access the Services or monitor any material or information from the Services using any robot, spider, scraper, or other automated means."
  - 1조 7항 원문(일부): "You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service, use of the Services, or access to the Services without the express written permission by Shopify."
  - 앱스토어 전용 약관 `shopify.com/legal/app-store-terms` 404. API Terms 2조 14호도 자동 수집 금지(우리는 API 를 쓰지 않는다).
- **남헌 예외 기록 문구(DB·문서 공통)**:
  > Shopify ToS 1조 9항(자동 수단 접근 금지)·7항(무단 복제 금지)을 알고, 영역 ⑤ 3갈래 시험을 위해 소유자 예외로 켠다 — 남헌 승인 2026-10-08(v37 사전 승인).
  → `review_sources.override='owner_2026-10-08'` · `tos_status='prohibited'` · `quote_allowed=false`(CHECK 강제) · `quote_policy='none'` · `citation_allowed=true`.
  - `quote_policy` 는 `none` 으로 더 보수적으로 잡았다 — 7항이 "any portion" 복제를 막으므로 고객 화면 인용·요약 0. 내부 분석 근거로는 쓴다.
    googleplay·kakao 처럼 `short_only` 로 풀 수 있다(값 하나, CHECK 는 `full` 만 막는다) — 오케스트레이터 판단.
  - tos_status 는 지시대로 `prohibited`. 어휘상 1조 9항만 보면 `forbids_automation` 이 더 좁은 값이지만 7항(복제 금지)이 함께 걸려 `prohibited` 가 맞다.
- robots: `apps.shopify.com/robots.txt` 200 · `*` Disallow = `/internal/` `/services/` `*q=*` `/*?*shpxid=*` `/*?*auth=*` → `/<앱>/reviews?sort_by=newest&page=N` **허용** → `robots_status='allowed'`.
- 로그인·캡차 없음(1회 요청: 200 · 리뷰 블록 10 · 캡차 표지 0). 개인정보 낮음 — 작성자(상점명)·국가·사용기간은 **저장하지 않는다**.
- 남는 위험: Shopify 계정(파트너·가맹점)이 있다면 같은 약관에 묶인다 — 계정 유무는 리포로 확인 불가.

### 약관 예외(override)가 코드에서 실제로 어디에 쓰이나 — 확인 결과

- 러너 `OWNER_ROBOTS_OVERRIDES`(`lib/review/runner.ts`)는 **robots 금지 예외 전용**이고 `robots_status='disallowed'` 행만 연다.
  `shopify_apps` 는 robots 가 허용이라 필요 없고, **집합에 넣지 않았다** — robots 가 나중에 금지로 바뀌면 멈춰야 한다(셀프테스트가 단정).
- 약관 예외 값이 실제로 읽히는 곳(코드 변경 없이 이미 동작 — 카카오 `owner_2026-10-06` 과 같은 구조):
  - `lib/review/target-supply.ts` `tos_flag` — 약관 금지인데 override 가 없는 소스만 "⚠️약관 플래그". override 있으면 꺼진다(셀프테스트 단정).
  - `lib/review/request-cap.ts` / `scripts/review-request-cap.mjs` — override 있는 소스는 야간 cap 자동 상향 대상 밖(`fixed`).
  - 실행 기록 `review_collection_runs.override_value`(runner `RunResult.overrideValue` → `lib/review/run-log.ts`) — 매 실행 스냅샷.
  - 사람용 기록: `docs/review-collection-design.md` §1.3(이번에 추가), `ops/state/source-review-queue.md`(승인 줄).
- 그래서 **약관 예외를 위해 러너를 넓히지 않았다.**

### 코드를 넓힌 곳 — 하나, 근거와 함께

- `ReviewSourceAdapter.isChallenge?(body)`(types.ts) + `isStrictBlock(res, isChallenge?)`(runner.ts) — 엄격 모드의 **캡차 판정만** 어댑터 것으로 바꾼다.
  - 이유: 러너 기본 표지는 본문에 `captcha` 낱말만 있어도 차단이다. 리뷰 관리 플러그인·앱 후기에는 "captcha"(스팸 방지 기능)가 흔해서,
    정상 피드 하나가 소스 전체를 매일 "차단"으로 멈추고 램프를 되돌린다(§7.2 — 안전장치가 오작동을 정상 종료로 가린다).
  - 판정: WP = RSS 가 아닌 2xx 본문은 차단(모양이 기대와 다르면 멈추는 쪽) · Shopify = 리뷰 페이지 표지(`<title>Reviews:`) 없이 캡차 표지가 있으면 차단.
  - 빈 본문·`/sorry/` 는 그대로 언제나 차단. 어댑터가 판정을 안 주면 기존과 똑같다(googleplay·기존 테스트 전부 통과).

---

## 중단 조건 (두 소스 공통, 우회 없음)

- 403·429 → 차단으로 즉시 실행 중단(같은 소스 남은 타깃 0요청). `quotaMarkers` 미선언 = 전부 차단.
- 2xx 빈 응답·캡차·사람 확인 화면 → `abortOnChallenge` 로 즉시 중단(위 `isChallenge`).
- robots 금지·확인 불가(404·403·5xx·HTML) → 0요청(`proceedWhenRobotsUnverified` 없음).
- 리뷰 표지 없는 200(로그인 벽 등) → 그 타깃 `parseFailures` 1 + 종료, 누적되면 러너 파싱 브레이크.
- Shopify URL 은 어댑터가 조립한 `?sort_by=newest&page=<정수>` 하나뿐 — `q=`·`shpxid=`·`auth=` 가 섞이면 `isAllowedReviewUrl` 이 null(0요청).
  러너 robots 판정은 pathname 만 보므로(SP-026) 쿼리 규칙은 어댑터가 지킨다.
- UA 는 러너 고정(`solutionarchive-review-collector/0.1`). 쿠키·프록시·IP 회전·헤더 위장·캡차 풀이 없음.
- 첫 실행 뒤 확인: `review_collection_runs` 의 `blocked_responses` 가 0 이 아니면 우회하지 말고 롤백 파일로 소스를 끈다.

## 한도 (기존 램프 규칙 — 50% 출발)

- wordpress_org: `min_interval_ms` 5000 · `daily_request_cap` 40 · 램프 cap_base 40 → 첫날 목표 20요청. 타깃 9 × 피드 1요청.
- shopify_apps: `min_interval_ms` 8000(요구 ≥5초) · `daily_request_cap` 30 · 램프 cap_base 30 → 첫날 목표 15요청. 타깃 10 × 최대 2쪽.
  소유자 예외 소스라 cap 자동 상향 없음. `P_SAFE` 맵에 없음 → 회당 기본 10(ramp.ts, 첫 수집 뒤 값 넣기).

## 타깃 후보와 근거 URL (2026-10-08~09 확인)

라벨 `5:wp|<플러그인 slug>` · `5:shopify|<앱 slug>`(영역 정규식 `^([1-5]):` 호환). 리뷰 수는 각 페이지 1회 WebFetch 값.

### wordpress_org (9)

- `customer-reviews-woocommerce` — 1,536 리뷰 · 80,000+ 설치 — https://wordpress.org/plugins/customer-reviews-woocommerce/
- `wp-reviews-plugin-for-google` (Trustindex) — 2,652 · 1M+ — https://wordpress.org/plugins/wp-reviews-plugin-for-google/
- `judgeme-product-reviews-woocommerce` — 670 · **2025-08-13 폐쇄(다운로드 불가)**, 리뷰 피드 생존 여부 미확인 — https://wordpress.org/plugins/judgeme-product-reviews-woocommerce/
- `wp-customer-reviews` — 527 · 20,000+ — https://wordpress.org/plugins/wp-customer-reviews/
- `site-reviews` — 373 · 60,000+ — https://wordpress.org/plugins/site-reviews/ (RSS 구조 실측 대상)
- `yotpo-social-reviews-for-woocommerce` — 192 · 2,000+ — https://wordpress.org/plugins/yotpo-social-reviews-for-woocommerce/
- `woo-photo-reviews` — 77 · 10,000+ — https://wordpress.org/plugins/woo-photo-reviews/
- `trustpilot-reviews` — 72~73(페이지 내 불일치) · 평균 1.8 — https://wordpress.org/plugins/trustpilot-reviews/
- `reviews-feed` (Smash Balloon) — 37 · 100,000+ — https://wordpress.org/plugins/reviews-feed/
- 뺀 것: `wp-review` — 2025-05-09 보안 문제로 폐쇄, 리뷰 사이트 빌더라 영역 ⑤(리뷰 관리) 와 결이 다름.

### shopify_apps (10)

- `judgeme` (Judge.me) — 48,196 — https://apps.shopify.com/judgeme
- `loox` — 9,779 — https://apps.shopify.com/loox
- `yotpo-social-reviews` — 4,629 — https://apps.shopify.com/yotpo-social-reviews
- `product-reviews-addon` (Stamped.io) — 3,753 — https://apps.shopify.com/product-reviews-addon
- `fera` — 2,033 — https://apps.shopify.com/fera
- `ali-reviews` (FireApps) — 1,442 — https://apps.shopify.com/ali-reviews
- `okendo-reviews` — 1,427 — https://apps.shopify.com/okendo-reviews
- `rivyo-product-review` (Nexfal) — 936 — https://apps.shopify.com/rivyo-product-review
- `crema-review` (CREMA) — 리뷰 수 **이번에 확인 안 함**, slug 는 제품 사전 2026-10-05 확인값 — https://apps.shopify.com/crema-review
- `alphareview` (Alpha Review) — 리뷰 수 **이번에 확인 안 함**, slug 는 제품 사전 2026-10-05 확인값 — https://apps.shopify.com/alphareview

### project_id

- 제품 사전 영역 ⑤ 제품(judge-me·loox·yotpo·okendo·crema·alpha-review)은 사전 투입기(`scripts/dictionary-targets.mjs`)와 **같은 pitch** 로 프로젝트를 찾는다 —
  카카오 `q:` 타깃과 한 프로젝트에 모인다. 없으면 같은 pitch 로 새로 만든다. WP 의 Judge.me·Yotpo WooCommerce 플러그인도 같은 제품 프로젝트에 붙였다.
- 사전 밖(Stamped·Fera·Ali Reviews·Rivyo, WP 7개)은 전용 프로젝트(`business_model='SAAS'`, `status='collecting'`).

## 확인 못 한 것 (§7.1 — 확인 불가)

- Shopify `sort_by=newest` 가 실제로 최신순인지(1회 요청은 기본 정렬 2쪽이었다). 아니면 증분 종료가 늦어질 뿐 중복은 지문이 막는다.
- Shopify 리뷰별 고유 주소(`/reviews/<id>` 공유 링크) — 그래서 `sourceUrl` 은 비운다. `data-review-content-id` 의 전역 유일성 — 그래서 `productScopedExternalId=true`.
- 폐쇄된 Judge.me WP 플러그인의 리뷰 피드가 아직 열리는지. 404 면 그 타깃만 `failed`.
- crema-review·alphareview 의 현재 리뷰 수.
- WP 저볼륨 플러그인(reviews-feed 37건 등)은 증분형 연속 0건 안전장치(MAX_CONSECUTIVE_EMPTY=3)에 걸려 며칠 안에 `exhausted` 로 닫힐 수 있다 — 고장이 아니라 설계된 종료다. 되살리기는 `scripts/target-revive.mjs`.
- HTML 목록(`/support/plugin/<slug>/reviews/page/N/`)으로 과거를 훑는 보조 경로는 만들지 않았다(실측 픽스처 없음). RSS 최신 30건만.
