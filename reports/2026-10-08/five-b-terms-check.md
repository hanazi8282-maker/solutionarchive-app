# 5-B 약관 점검 — wordpress.org 플러그인 리뷰 · Shopify 앱스토어 리뷰

- 목적: v37 작업 4 선행. 두 소스에 자동수집 금지 조항이 실제로 있는지 원문으로 확인한다.
- 기준: `docs/review-collection-design.md` §1.2(robots 3상태·약관 인용·로그인벽·개인정보), CLAUDE.md §7.1(확인 불가 ≠ 허용), §10.1 "깨끗한 소스".
- 확인 시각: 2026-10-08 14:35~14:50 UTC (23:35~23:50 KST).
- 방법: robots.txt 는 우리 UA(`solutionarchive-review-collector/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app)`)로 받아 `lib/review/robots.ts` robotsVerdict 로 판정. 약관은 원문 HTML 을 받아 키워드 대조 + WebFetch 로 조항 번호 확인. 리뷰 페이지 본문은 저장하지 않고 표지(marker) 개수만 셌다.
- 코드·DB·커밋 변경 없음.

---

## (A) wordpress.org 플러그인 리뷰

### robots.txt — 허용

- `https://wordpress.org/robots.txt` → 200 text/plain.
- `*` 그룹 Disallow 전문: `/wp-admin/`, `/search`, `/?s=`, `/plugins/search/` (나머지는 Allow).
- AI 봇 그룹(GPTBot·ClaudeBot·anthropic-ai·CCBot 등)은 전부 `Allow: /`. Content-Signal 없음.
- robotsVerdict 결과:
  - `/support/plugin/<slug>/reviews/` → allowed
  - `/support/plugin/<slug>/reviews/page/2/` → allowed
  - `/support/plugin/<slug>/reviews/feed/` (RSS) → allowed
- `https://api.wordpress.org/robots.txt` → 200, `User-agent: *` / `Disallow: /`
  - `/plugins/info/1.2/` → **disallowed**. 공식 API 경로는 robots 금지다. 리뷰는 RSS·HTML 로만 간다.

### 약관 — 금지 조항 없음 (약관 문서 자체가 없다)

- `https://wordpress.org/about/terms/` → **404**. 리뷰 페이지 푸터의 정책 링크는 두 개뿐이다: 포럼 가이드라인, 개인정보처리방침.
- 개인정보처리방침 `wordpress.org/about/privacy/` (Last modified 2026-06-29): 자동 접근·스크래핑·복제·상업 이용 문장 없음. 사용자 글의 라이선스 조항도 없음.
- 포럼 가이드라인 `wordpress.org/support/guidelines/` (Last modified 2026-04-25): 자동 접근·복제·상업 이용 문장 없음. 리뷰 관련 문장은 게시 규칙뿐이다 — "Reviews of commercial plugins/themes are acceptable on WordPress.org when such reviews discuss functionality".
- Plugin Directory 가이드라인은 플러그인 작성자 대상 규칙이라 제3자 열람·수집과 무관하다(읽은 범위 기준).
- api.wordpress.org 별도 약관: 찾지 못함. 어차피 robots 가 막으므로 쓰지 않는다.
- 남는 위험: 리뷰 글의 저작권 귀속 조항이 **없다** = 권리는 작성자에게 있다고 봐야 한다. 그래서 인용은 짧게.

### 로그인·유료벽 — 없음

- 리뷰 HTML `/support/plugin/woocommerce/reviews/` → 200, 캡차·챌린지 표지 0, "You must be logged in" 0, 리뷰 블록(`bbp-topic`) 다수.
- RSS `/support/plugin/woocommerce/reviews/feed/` → 200 `application/rss+xml`, `<item>` 30개.

### 개인정보 — 낮음

- 공개되는 것은 wordpress.org 사용자명과 아바타(Gravatar)다. 사용자명이 실명인 경우가 있다.
- 본문은 플러그인 사용 경험이 중심이다. 가이드라인이 타인 개인정보 게시를 금지·삭제 사유로 둔다.

### 결론 (A)

- (1) 금지 조항: **없음** — 약관 문서가 404 이고, 읽은 정책 두 개에도 해당 문장이 없다.
- (2) §10.1 깨끗한 소스: **통과** — 단 리뷰 페이지·RSS 경로 한정. api.wordpress.org 는 robots 금지라 쓰지 않는다.
- (3) 소유자 예외 필요: **없음**. 세션이 바로 등록하면 된다. 권장 조건:
  - RSS(`/reviews/feed/`) 우선, 낮은 요청 속도로 시작(50% 램프)
  - 403·429·캡차·빈 응답이 나오면 즉시 중단
  - 저작권 귀속 조항이 없으니 `quote_policy='short_only'`

---

## (B) Shopify 앱스토어 리뷰

### robots.txt — 허용 (경로 한정)

- `https://apps.shopify.com/robots.txt` → 200 text/plain.
- `*` 그룹 Disallow 전문: `/internal/`, `/services/`, `*q=*`, `/*?*shpxid=*`, `/*?*auth=*`.
- AI 사용자 에이전트(ChatGPT-User·Claude-User·Google-Agent·Perplexity-User)에는 별도 그룹이 있지만 내용은 같다. Content-Signal 없음.
- robotsVerdict 결과:
  - `/judgeme/reviews` → allowed
  - `/judgeme/reviews?page=2` → allowed
  - `/judgeme/reviews?sort_by=newest&page=2` → allowed
- 주의: 쿼리에 `q=` 가 들어간 URL(검색)이나 `shpxid=` 가 붙은 URL 은 금지다.

### 약관 — 금지 조항 있음 (예전 보고 맞음)

- 문서: Shopify Terms of Service `https://www.shopify.com/legal/terms`, Last updated **2026-08-01**.
- **1조(Account Terms) 9항 원문**: "You agree not to access the Services or monitor any material or information from the Services using any robot, spider, scraper, or other automated means."
  - 예전 조사의 "ToS 1조 9항"은 현행 번호 그대로 맞다.
- **1조 7항 원문(일부)**: "You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service, use of the Services, or access to the Services without the express written permission by Shopify."
- 적용 범위: 머리말 "By signing up for a Shopify Account ... or by using any Shopify Services ... you are agreeing to be bound by the following terms and conditions." 앱스토어 리뷰 페이지 푸터가 이 약관(`shopify.com/legal/terms`)으로 연결된다.
  - 약관이 계정 없는 방문자에게도 효력이 있는지는 법적 해석 문제다. 다만 §1.2 기준으로는 "약관이 자동수집을 금지한다"에 해당한다.
- 앱스토어 전용 약관: `shopify.com/legal/app-store-terms` → **404**. 별도 문서를 찾지 못했다. ToS 9.9조는 앱스토어를 제3자 서비스 경로로 언급할 뿐이다.
- API Terms `https://www.shopify.com/legal/api-terms`, Last updated **2026-10-07**, 2조 "API Restrictions":
  - 14호: "not use the Shopify API to conduct any systematic or automated data collection activities (including scraping, data mining, data extraction and data harvesting) or to build any commerce or product index"
  - 8호: "... copy, scrape, mine, or create derivative works of the Shopify API, Merchant Data, any Merchant Store, the Services ..."

### 공식 경로 — 리뷰를 주는 API 확인 불가

- Partner GraphQL API 는 앱 이벤트·수익·Experts 작업 데이터를 다룬다(shopify.dev changelog). 리뷰 필드는 찾지 못했다.
- Shopify Community 에서 직원 답변으로 "앱스토어 리뷰 관리용 API 없음, Partner 대시보드에서 보라"는 글이 있다. 날짜가 없어 현행 여부는 **확인 불가**다.
- 있더라도 Partner API 는 **자기 앱** 데이터만 주므로 경쟁 앱 리뷰 수집 경로는 아니다. API Terms 14호도 자동 수집을 막는다.

### 로그인·캡차 — 없음 (1회 요청)

- `GET https://apps.shopify.com/judgeme/reviews` 1회 → 200 text/html, 약 245KB.
- 캡차·`cf-chl`·challenge 표지 0. 리뷰 블록(`data-merchant-review`) 20개, `aggregateRating` 1개.
- "Log in" 8회는 상단 메뉴 링크로 보인다. 리뷰 본문은 비로그인으로 보였다.

### 개인정보 — 낮음 (추정, 필드 단위 미확인)

- 리뷰 작성자는 상점(가맹점) 단위로 표시되는 구조다. 1회 요청 제한 때문에 어떤 필드가 노출되는지는 확인하지 않았다. 등록 전에 한 번 더 본다.

### 결론 (B)

- (1) 금지 조항: **있음** — ToS 1조 9항(로봇·스파이더·스크레이퍼·자동 수단 금지), 1조 7항(무단 복제·이용 금지).
- (2) §10.1 깨끗한 소스: **불통과** — robots 와 로그인벽은 통과하지만 약관에서 걸린다. 큐(`ops/state/source-review-queue.md`)에 올릴 대상이다.
- (3) 소유자 예외: **필요**. 켠다면 제안 조건:
  - `override='owner_<결정일>'`, `tos_status='prohibited'`, `forbids_automation=true`
  - `quote_policy='short_only'`, `quote_allowed=false`
  - 요청 간격 크게(예: 5초 이상), 하루 상한은 낮게 시작
  - 403·429·캡차·빈 응답이 나오면 즉시 중단. 우회 수단(쿠키·프록시·UA 위장) 없음
  - URL 은 `/<app>/reviews?page=N` 만. `q=`·`shpxid=` 가 붙은 경로는 쓰지 않는다
  - 위험: Shopify 계정(파트너·가맹점)이 있다면 같은 약관에 묶인다. 계정이 있는지는 리포로 확인 불가

---

## 한눈에

| 항목 | wordpress.org | Shopify 앱스토어 |
|---|---|---|
| robots(리뷰 경로) | 허용 | 허용 |
| 금지 조항 | 없음 | 있음(ToS 1조 9항) |
| 로그인·캡차 | 없음 | 없음 |
| 깨끗한 소스 | 통과 | 불통과 |
| 소유자 예외 | 불필요 | 필요 |

## 출처 (확인 시각 2026-10-08 14:35~14:50 UTC)

- https://wordpress.org/robots.txt · https://api.wordpress.org/robots.txt
- https://wordpress.org/about/terms/ (404) · https://wordpress.org/about/privacy/ · https://wordpress.org/support/guidelines/
- https://wordpress.org/support/plugin/woocommerce/reviews/ · …/reviews/feed/
- https://apps.shopify.com/robots.txt · https://apps.shopify.com/judgeme/reviews (1회)
- https://www.shopify.com/legal/terms · https://www.shopify.com/legal/api-terms · https://www.shopify.com/legal/app-store-terms (404)
- https://community.shopify.com/t/is-there-api-for-app-store-reviews/209135 · https://shopify.dev/changelog/the-partner-api-is-now-available-for-accessing-app-events-earnings-and-experts-jobs-data.md

## 알려 둘 것

- api.wordpress.org 에 리뷰 필드가 있는지 보려고 요청 1회를 보냈다. robots 가 `Disallow: /` 인 걸 이미 받아 둔 뒤였으니 우리 규칙(robots 금지면 가지 않는다)에 어긋난 요청이다. 응답에 리뷰 영역(`"reviews"`)이 있었지만 수집 경로로는 쓰지 않는다.
