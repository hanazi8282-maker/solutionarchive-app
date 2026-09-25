# 리뷰 수집 소스 실측 결과 (2026-08-29)

수집 계층을 설계하기 **전에** 데이터센터 IP 에서 뭐가 실제로 되는지 잰 결과다.
설계를 먼저 하면 "쿠팡에서 리뷰를 받아온다" 같은 문장이 스펙에 들어가고, 나중에
그게 불가능한 걸 알았을 때 그 위에 쌓은 것들이 같이 무너진다.

재현: `gh workflow run review-source-probe.yml` (`scripts/review-source-probe.mjs`).

## 측정 조건

| 항목 | 값 |
|---|---|
| Actions 러너 egress | `68.154.115.178` (Azure) |
| 로컬 대조군 egress | `115.22.94.146` (한국 가정용) |
| User-Agent | `solutionarchive-review-probe/0.1` — **위장하지 않음** |
| 규칙 | robots.txt 준수 · 재시도 없음 · 요청 간 4초 · IP 로테이션/프록시 없음 |

## 결론 먼저

**차단은 IP 기반이 아니다.** Azure 와 한국 가정용 IP 의 결과가 거의 같았다
(네이버 쇼핑 루트 하나만 갈렸다). 즉 **VPN·IP 로테이션은 애초에 해결책이
아니었다.** 막는 건 봇 탐지와 robots 정책이다.

**쓸 만한 소스는 사실상 하나 — 다나와.** 다만 그 하나가 여러 쇼핑몰의 리뷰를
집약하는 소스라, 쿠팡·11번가를 직접 못 가도 그 몰들의 리뷰를 만난다.

## 사이트 직접 접근

| 소스 | 판정 | 근거 |
|---|---|---|
| 다나와 | ✅ 접근 가능 | HTTP 200 · robots 허용 · 리뷰 원문까지 확인 |
| 화해 (뷰티) | ⛔ 규칙상 금지 | robots 가 `/product-information` `/goods-view` `/hwahae-rank` `/product-search` 를 전부 금지 |
| 글로우픽 (뷰티) | ❌ 정적 수집 불가 | robots 는 허용하나 CSR — `/product/976` 이 HTTP 200 · 129KB 인데 렌더 텍스트 1,449자(대부분 CSS) |
| Amazon | ❌ 사실상 차단 | 리뷰 페이지가 HTTP 200 이지만 내용은 로그인 벽 |
| 네이버 스마트스토어 | ⛔ 규칙상 금지 | robots.txt `Disallow: /` |
| 11번가 | ⛔ 규칙상 금지 | robots.txt `Disallow: /` |
| 무신사 | ⛔ 규칙상 금지 | robots.txt `Disallow: /` |
| 쿠팡 | ❌ 차단 | robots.txt 자체가 HTTP 403 — 규칙을 읽을 수조차 없다 |
| G마켓 | ❌ 차단 | robots.txt HTTP 403 |
| 올리브영 | ❌ 차단 | robots.txt HTTP 403 |
| 네이버 쇼핑 | ❌ 차단 | robots.txt HTTP 418 · 검색 418 |
| iHerb | ❌ 차단 | HTTP 403 |

⛔ 와 ❌ 를 구분해 적는다. **규칙상 금지는 기술 문제가 아니다.** 사이트가
"오지 말라"고 명시한 것이고, 나중에 누가 "여기 되는데?" 하고 다시 긁는 걸
막으려면 이 구분이 문서에 남아 있어야 한다.

## 리뷰 원문 도달 여부 — 상태 코드로 판정하면 안 되는 이유

| 대상 | 판정 | 근거 |
|---|---|---|
| 다나와 판매처 리뷰 | ✅ 원문 확인 | HTTP 200 · 20KB · 리뷰 본문·별점·판매처명·날짜 |
| Amazon 리뷰 페이지 | ❌ 껍데기 | HTTP 200 · 319KB 인데 내용이 Sign-In 페이지 |

Amazon 이 정확히 함정이었다. `/product-reviews/` 가 200 에 319KB 를 준다.
상태 코드만 봤으면 "된다"고 적었을 것이다. 실제로는 `data-hook="review"` 가
하나도 없고 로그인 폼만 있다. 그래서 프로브에 **내용 기반 판정 단계**를 넣었다.

다나와에서 실제로 받은 것(발췌):

```
5.0 점 (3)  |  유용한 리뷰순 / 최신순 / 포토 리뷰만 보기
100점 ㅣ 11번가 ㅣ 2025.09.06. ㅣ vl****
  빠른배송 잘 받았습니다 ...
100점 ㅣ 롯데하이마트 ㅣ 2025.10.27. ㅣ fl****
  가벼운데 성능도 만족합니다!
```

별점(100점 척도) · 판매처명 · 작성일 · 마스킹된 작성자 · 본문이 전부 있다.
**판매처명이 붙어 온다는 게 중요하다** — 몰별 비교가 가능해진다.

## 카테고리 커버리지 (이 회사가 실제로 다루는 것)

다나와가 뷰티·건기식을 커버하는지가 관건이었다. 가전·PC 강세 사이트라
안 될 가능성을 의심했는데, 검색 결과는 충분했다.

| 검색어 | 응답 | 고유 상품 수 |
|---|---|---|
| 탈모샴푸 | HTTP 200 · 1.8MB | 165 |
| 유산균 | HTTP 200 · 2.2MB | 316 |
| 무선이어폰 | HTTP 200 · 2.6MB | 80 |

## 공식 API 도달성

인증 없이 때려 살아 있는지만 봤다. 401/405 는 여기서 성공 신호다.

| API | 응답 | 쓸모 |
|---|---|---|
| 네이버 검색 API (쇼핑) | HTTP 401 | 상품 메타·가격. **리뷰 본문은 없다** |
| 네이버 데이터랩 | HTTP 405 | 카테고리 검색 트렌드 |
| 쿠팡 파트너스 | HTTP 401 | 상품 메타. 파트너스 승인 필요. 리뷰 없음 |
| 11번가 오픈 API | HTTP 200 | 키 발급 필요 |
| Amazon PA-API 5 | HTTP 405 | 어소시에이트 + 판매실적 요건. 리뷰는 이미지 링크만 |

**공식 API 중 리뷰 본문을 주는 곳은 하나도 없다.** 전부 상품 메타·가격이다.
리뷰 원문이 필요하면 API 로는 대체가 안 된다 — 이게 이번 조사의 가장 중요한
제약이다. 다만 상품 메타·가격·트렌드는 API 로 받는 게 낫다(차단 없음, 형식 안정).

## 파서 수정 후 전체 재검증 (2026-08-29)

robots 파서에 버그가 있었으므로 **이 표 전체의 신뢰도가 의심 대상**이 됐다.
고친 파서로 12개 소스 전부를 다시 판정했다. 결과: **바뀐 건 화해 하나뿐이다.**

| 소스 | `*` 그룹 수 | 재검증 결과 |
|---|---|---|
| 화해 | **2** ⚠️ | **판정 뒤집힘** — 허용 → 금지 |
| 네이버 스마트스토어 | 1 | 변화 없음 (`Disallow: /`) |
| 11번가 | 1 | 변화 없음 (`Disallow: /`) |
| 무신사 | 1 | 변화 없음 (`Disallow: /`) |
| 다나와 · Amazon · iHerb · 글로우픽 | 각 1 | 변화 없음 |
| 쿠팡 · G마켓 · 올리브영 · 네이버 쇼핑 | 0 | robots.txt 를 못 읽음(403/418) — 파서와 무관 |

버그는 `User-agent: *` 그룹이 **두 번 이상** 나오는 robots.txt 에서만 발현한다.
12곳 중 그 형태는 화해뿐이었다. 그래서 영향 범위가 거기서 끝난다.

재발 방지로 프로브 출력에 `⚠️ * 그룹 N개(병합 대상)` 표시를 넣었다. 새 소스를
추가할 때 이 표시를 먼저 보면 된다.

### 읽지 못한 규칙을 "허용"이라 적지 않는다

쿠팡·G마켓·올리브영은 robots.txt 자체가 HTTP 403 이다. **우리는 그들의
규칙을 읽지 못했다.** RFC 9309 상 4xx 는 "허용"으로 다루지만, 403 은 그
자체가 "너를 막고 있다"는 신호다. 그래서 이 소스들의 판정 근거는 robots 가
아니라 **실제 요청이 403 으로 거절된 결과**다. 표의 근거 칸을 그렇게 적었다.

## 남은 위험

1. **소스 집중.** 실질 소스가 다나와 하나다. 다나와가 차단하거나 구조를 바꾸면
   수집이 통째로 멈춘다. 그래서 소스별 이력 테이블과 즉시 중단 스위치가
   설계에 반드시 들어가야 한다.
2. **2차 출처.** 다나와의 리뷰는 다나와가 쓴 게 아니라 판매처에서 온 것이다.
   robots 상 허용되지만, 원 몰이 직접 금지한 데이터를 우회 경로로 얻는 모양새가
   된다. 파생 데이터(속성·점수·빈도)만 저장하고 원문은 분석 기간만 보관하는
   설계가 이 점에서도 맞다.
3. **뷰티 전문 소스 둘 다 탈락(추가 조사 결과).**
   - 화해: robots.txt 에 `User-agent: *` 그룹이 **두 번** 나온다. 첫 그룹이
     `Allow: /` 라 파서가 두 번째 그룹의 Disallow 목록을 통째로 무시했다.
     RFC 9309 §2.2.1 대로 같은 UA 그룹을 병합하도록 고치자 리뷰 경로가 전부
     금지로 바뀌었다. **판정이 뒤집힌 사례다** — 파서가 틀리면 금지된 곳을 긁는다.
   - 글로우픽: robots 는 허용한다. 다만 CSR 이라 정적 fetch 로 리뷰 본문이
     안 오고, `ClaudeBot` / `GPTBot` / `Bytespider` / `meta-externalagent` 를
     명시적으로 `Disallow: /` 한다. AI 크롤러를 원하지 않는다는 의사가 분명해
     headless 브라우저를 띄우지 않기로 했다.
4. **다나와 리뷰 엔드포인트는 내부 AJAX 다.** 공개 API 가 아니라 언제든 바뀐다.
   깨졌을 때 조용히 0건을 반환하지 않고 시끄럽게 실패해야 한다.

## 하지 않은 것 / 하지 않을 것

- VPN·IP 로테이션·프록시 — 실측상 효과도 없고(차단이 IP 기반이 아니다), 금지다
- User-Agent 위장 — 하지 않았다. 403 이 답이다
- robots.txt Disallow 경로 요청 — 요청 자체를 보내지 않았다
- 재시도 — 한 번 보고 결과를 적었다

---

## 2차 소스 실측 — 확장 후보 10곳 (2026-09-02)

다나와 하나로는 카테고리가 제품에 갇힌다(§1.1 편향). SaaS·앱까지 넓히기
위해 후보를 실측했다. **방법론은 1차와 같다** — robots 를 이 리포의
RFC 9309 파서(`lib/review/robots.ts`)로 먼저 읽고, 허용일 때만 요청하고,
상태코드가 아니라 **기대하는 내용의 표지**로 판정했다. 우회는 하지 않았다.

### 판정표

| 소스 | robots | 실제 도달 | 판정 |
|---|---|---|---|
| **Apple App Store RSS** | 허용 | 200 · 리뷰 35건 본문 확인 | ✅ **즉시 채택** |
| **Google Play** | 허용 | 200 · 리뷰 본문 확인 | ✅ 채택 가능(파싱 난이도 높음) |
| YouTube Data API | 해당 없음(공식 API) | 키 필요 | 🔑 사용자 키 필요 |
| 네이버 검색 API | 해당 없음(공식 API) | 키 필요 | 🔑 사용자 키 필요 |
| G2 | 허용 | **403 · captcha** | ⛔ 차단 |
| Capterra | 허용 | **403 · Cloudflare** | ⛔ 차단 |
| Trustpilot | **Disallow: /** | 요청 안 함 | ⛔ robots 금지 |
| Product Hunt | 허용 | 200 이나 Captcha 페이지 | ⛔ 사실상 차단 |
| 화해(재확인) | Disallow: /goods-view | — | ⛔ 변동 없음 |
| 글로우픽(재확인) | **robots 자체가 403** | — | ⛔ 판단 불가 → 가지 않음 |

### ✅ Apple App Store RSS — 확정. 이번 확장의 본체다

`https://itunes.apple.com/kr/rss/customerreviews/id=<앱ID>/sortBy=mostRecent/json`

실측(Slack, id=1459969523):

```
HTTP 200 · entry 35건
평점  : 1
제목  : 환불
본문  : ㅋㅋ1달러 결제했더니 더보려면 더 결제해야된다고함 결제 자동으로 되고 …
작성자: 이게머냐구욬ㅋㅋㅋ · 날짜: 2026-08-26T22:59:35-07:00
버전  : 6.53.1
```

**애플이 공식으로 제공하는 RSS 다.** 키도, 인증도, 우회도 필요 없다.
평점·제목·본문·작성자·날짜에 더해 **앱 버전**까지 온다 — 다나와에 없던
축이다. "어느 버전부터 불만이 늘었나"를 볼 수 있다.

SaaS 확장에 이게 결정적인 이유: **SaaS 는 앱이 있다.** 다나와가 못 담는
Slack·Notion·Figma·토스·뱅크샐러드가 전부 여기 있다.

### ✅ Google Play — 되지만 파싱이 비싸다

robots 는 `/store/apps/details` 를 막지 않고, 200 으로 오며, **리뷰 본문이
실제로 HTML 안에 있다.** `AF_initDataCallback(...)` 블롭 13개 중 하나에
한국어 리뷰가 들어 있다(개발자 답변까지 포함).

다만 구글 내부 직렬화 포맷이라 구조가 문서화돼 있지 않고 언제든 바뀐다.
Apple RSS 가 안정적인 계약인 것과 대조된다. **Apple 을 먼저 붙이고,
안드로이드 전용 앱이 필요해질 때 Play 를 붙이는 순서가 맞다.**

### 🔑 공식 API 2종 — robots 는 판정 기준이 아니다

프로브가 `openapi.naver.com/robots.txt` 에서 `Disallow: /` 를,
`googleapis.com/robots.txt` 에서 404 를 받았다. **이걸 "차단"으로 읽으면
틀린다.**

**robots.txt 는 크롤러를 규율하는 문서이고, 키를 발급받아 쓰는 공식 API 는
그 대상이 아니다.** 이 경우 지켜야 할 것은 각 API 의 이용약관과 쿼터다.
1차 실측 때 세운 "robots 를 못 읽으면 가지 않는다" 규칙을 API 에 그대로
적용하면 **합법적이고 공식적인 경로를 스스로 막게 된다.**

- **YouTube Data API** — `commentThreads` 로 영상 댓글 수집. 무료 쿼터
  일 10,000 units. 리뷰 영상 댓글은 "사용 경험"의 밀도가 높다
- **네이버 검색 API** — 블로그·카페 검색. 국내 제품 사용후기의 주 서식지다

둘 다 **사용자가 키를 발급해야 한다**(§아래).

### ⛔ SaaS 리뷰 집계 3사 — 전부 막혔다

G2·Capterra 는 robots 상으로는 허용인데 실제 요청이 403 이다. G2 는
captcha, Capterra 는 Cloudflare. **robots 가 허용해도 서버가 막으면 막힌
것이다** — 규칙과 실행이 다를 수 있다는 걸 다시 확인했다.
Trustpilot 은 robots 단계에서 `Disallow: /` 다.

**우회하지 않는다.** 세 곳 다 기록만 남기고 넘어간다. SaaS 리뷰는
App Store RSS 로 대체한다 — 오히려 한국어 사용자 목소리는 이쪽이 많다.

### ⚠️ 이번 프로브에서 내가 낸 검사 오류 2건 (§7.1)

기록해 둔다. 같은 실수를 반복하지 않기 위해서다.

1. **표지 함수가 길이만 봤다.** Capterra 의 403 응답(5486B)을
   "본문 5486B" 로 찍어 도달한 것처럼 보이게 했다. 상태코드를 표지 판정에
   함께 넣지 않은 탓이다. 길이는 내용의 증거가 아니다
2. **공식 API 에 robots 를 적용했다.** 위에 적은 대로 범주 오류다.
   규칙을 기계적으로 넓히면 보수적인 쪽으로도 틀릴 수 있다

### 사람이 해야 할 일 (자동화가 못 뚫는 지점)

자동화로 안 되는 건 **키 발급 두 건뿐**이다. 둘 다 무료다.

- **YouTube Data API 키** — Google Cloud Console → 프로젝트 생성 →
  YouTube Data API v3 사용 설정 → API 키 발급.
  발급 후 `gh secret set YOUTUBE_API_KEY -R hanazi8282-maker/solutionarchive-app`
- **네이버 검색 API** — developers.naver.com → 애플리케이션 등록 →
  검색 API 선택 → Client ID / Secret 발급.
  `gh secret set NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`

Apple App Store RSS 와 Google Play 는 **사람이 할 일이 없다.**

---

## Hacker News (Algolia) 실측 — 2026-09-10

SaaS·디지털 경쟁사의 페인포인트 통로를 찾는 작업. 다나와는 물리 제품만,
App Store 는 앱 사용자만 담아서 "Show HN 스레드에서 개발자·창업자가 경쟁
도구를 왜 버렸는지" 말하는 자리가 파이프라인에 없었다.

### robots.txt — `hn.algolia.com`

수집 코드를 쓰기 전에 먼저 확인했다. **HTTP 404 다.**

```
$ curl -sS -D - https://hn.algolia.com/robots.txt
HTTP/1.1 404 Not Found
content-type: text/html; charset=utf-8
server: Google Frontend
content-length: 207

<!doctype html>
<html lang=en>
<title>404 Not Found</title>
<h1>Not Found</h1>
<p>The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again.</p>
```

**판정: 허용.** robots.txt 가 존재하지 않으므로 `/api/` 를 막는 규칙도 없다.
RFC 9309 §2.3.1.3 은 4xx("Unavailable")를 받으면 크롤러가 모든 경로에 접근해도
된다고 정한다.

⚠️ **이건 "못 읽었다"가 아니다.** CLAUDE.md §7.1 의 "읽지 못한 규칙을 허용으로
해석하지 마라"는 5xx·네트워크 오류처럼 **규칙이 있는지조차 알 수 없는** 경우를
말한다. 404 는 서버가 "그런 파일 없다"고 확정적으로 답한 것이라 사건이 다르다.

> **⚠️ 2026-09-18 정정 — 러너의 동작이 바뀌었다.**
> 이 판단(404 는 확정 응답이다)은 유지하지만, **러너는 더 이상 4xx 를 허용으로
> 처리하지 않는다.** 4xx 본문이 사실은 robots 를 감춘 HTML 인 경우가 실측에서
> 줄줄이 나왔기 때문이다(킥스타터 403 · tistory 404 · 클리앙 SP-027).
> 지금은 4xx = `unverified` = 요청하지 않음이고, `hn.algolia.com` 은
> `lib/review/adapters/hackernews.ts` 의 `proceedWhenRobotsUnverified` 표식으로
> 통과한다. **그 한 줄이 이 소스를 살려 두는 유일한 장치다** — 지우면 수집이
> 통째로 0건이 된다. 자세한 설계는 아래 §robots 확인 불가 3상태.

### API 형태

`https://hn.algolia.com/api/v1/search_by_date?query=<키워드>&tags=comment&hitsPerPage=50&page=<n>`

- **키·인증 없음.** 무료다.
- `comment_text` 에 **본문 전체가 그대로 온다.** 그래서 Firebase 상세조회
  없이 1단계(검색)만으로 수집이 완결된다.
- `objectID` = HN item id. 지문이 전부 `seq` 로 잡힌다(폴백 0건).
- `created_at` 이 ISO 8601 이라 `slice(0,10)` 으로 날짜가 나온다.
- 본문은 HTML 조각이다 — `<p>` 문단, `<a>` 링크, `&#x27;` 같은 수치 엔티티.
  평문화가 필요하다.

**`search` 가 아니라 `search_by_date` 를 쓴다.** 러너의 증분 종료(연속 STALE
5건)가 시간 역순 정렬을 전제한다. 관련도순인 `search` 를 쓰면 오래된 댓글이
앞에 섞여 나와 첫 페이지에서 조기 종료하거나 반대로 끝없이 훑는다.

### ⚠️ 페이지네이션 상한 1000

`paginationLimitedTo=1000` 이라 `page * hitsPerPage >= 1000` 이면 400 이 온다.
`hitsPerPage=50` 이면 **20페이지부터 막힌다**(실측 `nbPages=20`).

애플 RSS 11페이지 사건과 **같은 형태**다. 러너 상한(`MAX_PAGES_PER_TARGET=20`)
보다 낮으므로 어댑터가 스스로 멈추지 않으면 400 을 받고 러너가 그 타깃을
`failed` 로 찍는다 — 정상적인 경계를 고장으로 기록하는 형태다(§7.2).
어댑터가 먼저 `null` 을 돌려준다.

### 🔴 Firebase 상세조회(2단계)는 보류 — robots 가 막는다

Algolia 인덱스가 라이브 HN 상태보다 지연될 수 있어서(작성자 삭제·관리자
`dead` 처리된 댓글이 인덱스에 한동안 남는다), 공식 Firebase API 로
`dead`/`deleted` 를 걸러내는 2단계를 검토했다. **막혔다.**

```
$ curl -sS https://hacker-news.firebaseio.com/robots.txt   # HTTP 200
User-agent: *
Allow: /*.json$
Allow: /*.json?*$
Disallow: /
```

#### ✅ 현재 상태 (2026-09-18 확인) — 와일드카드·끝앵커는 **구현돼 있다**

**결론을 먼저 둔다. 이 절의 아래 "2026-09-10 당시 기록"은 이미 해소된 상태의
기록이고, 현재 코드 설명으로 읽으면 틀린다.** 2026-09-18 세션에서 조사 에이전트
둘이 이 문단을 현재형으로 읽고 각각 잘못된 전제로 출발했다. 그래서 순서를 뒤집었다.

- `lib/review/robots.ts` 의 `pathMatches()` 는 `*`(길이 0 이상 임의 문자열)와
  끝 앵커 `$` 를 **구현한다.** 정규식이 아니라 **투 포인터 글롭 매처**다 —
  악성 robots.txt 로 nightly 수집기를 멈출 수 있는 ReDoS 를 실측으로 확인해
  정규식을 버렸다. 그래서 선형 시간이다.
- SP-018 이 `fix/robots-wildcard` 로 수정했고, 그 결과 appstore 가 Apple
  robots.txt 위반 상태였음이 드러나 `enabled=false` 가 됐다(SP-019/021).

2026-09-18 실측(실제 robots.txt 원문을 `parseRobots`→`robotsVerdict` 에 통과):

```
Allow: /*.json$                                 → /v0/item/1.json 매칭됨
Disallow: /companies/*/salaries_of_job_rank/    → 해당 경로만 금지, 형제 경로는 허용
Allow: /$                                       → `/` 만 허용(하위 경로는 아님)
Disallow: /*?keyword=                           → 쿼리 붙은 경로 매칭됨
```

2026-09-16 실측(다모앙 실제 robots.txt):

```
/free/7341567         => allowed     reason='Allow: /'
/free/7341567?page=2  => disallowed  reason='Disallow: /*?page='
/admin/x              => disallowed  reason='Disallow: /admin/'
```

재현: `node scripts/review-robots-selftest.mjs` — 와일드카드·끝앵커·리터럴
특수문자·ReDoS 방어를 못박은 블록이 그대로 있다.

**남은 별개 결함 2건.** 와일드카드 구현과 무관하다.

- **SP-026 (미해소, 2026-09-18 확인)** — `lib/review/runner.ts` 가 판정에
  `u.pathname` 만 넘기고 `u.search` 를 뺀다. 그래서 위 `Disallow: /*?page=` 같은
  **쿼리 대상 규칙은 실제 수집 경로에서 영영 매칭되지 않는다.** 파서는 맞게
  판정하는데 호출부에서 잘린다.
- **robots 확인 불가 (2026-09-18 해소, `fix/robots-fail-closed`)** — 러너가
  4xx 를 "규칙 0개 = 허용"으로 캐시했다. 아래 §robots 확인 불가 3상태 참조.

<details>
<summary>2026-09-10 당시 기록 (지금은 사실이 아니다 — 펼치기)</summary>

~~사이트의 의도는 "`.json` 은 허용, 나머지는 금지"로 읽힌다. 그런데 **이 리포의
`lib/review/robots.ts` 는 와일드카드(`*`)와 끝 앵커(`$`)를 구현하지 않는다.**
경로 규칙을 문자열 접두사로만 비교한다. 그래서 실제 판정은 이렇게 나온다:~~

```
robotsVerdict(groups, '/v0/item/49628981.json', 'solutionarchive-review-collector')
  → { allowed: false, reason: 'Disallow: /' }     ← 2026-09-10 당시. 지금은 allowed 다.
```

~~`/*.json$` 은 `/v0/...` 의 접두사가 아니라 매칭되지 않고, `Disallow: /` 만
남아서 **금지**가 된다. 우리 자신의 안전장치가 이 호스트를 막고 있다.~~

그래서 그때 2단계를 구현하지 않았다. 뚫고 지나가지 않았다. (HN Firebase 2단계는
이후 별도 이유로 은퇴했다 — 코호트를 고정하지 못해 "검증 못함"이다.)

~~**와일드카드로 쓴 `Disallow` 규칙을 우리가 지금 하나도 안 지키고 있다**는
뜻이기도 하다. 예를 들어 `Disallow: /*?sort=` 나 `Disallow: /*.pdf$` 같은
규칙은 어떤 경로와도 매칭되지 않아 조용히 무시된다.~~ → **해소됐다.**

당시 적어 둔 판단은 지금도 유효하다: 이 방향(과하게 막힘)보다 **반대 방향
(막아야 할 걸 안 막음)이 위험하다.**

</details>

#### robots 확인 불가 3상태 (2026-09-18, `fix/robots-fail-closed`)

위 `hn.algolia.com` 항목이 "**판정: 허용.** robots.txt 가 존재하지 않으므로 …
404 는 서버가 확정적으로 답한 것이라 사건이 다르다"고 적고 있다. 그 판단 자체는
유지하지만, **그걸 러너의 기본값으로 두는 것은 폐기했다.** 2026-09-18 VOC 소스
조사 20곳에서 4xx 본문이 사실은 robots 를 감춘 HTML 인 경우가 줄줄이 나왔다 —
킥스타터 403(Cloudflare 챌린지) · `www.tistory.com` 404 · 클리앙은 우리 UA 에게만
404(SP-027). "규칙이 없다"와 "규칙을 안 보여 준다"가 한 값이 되어 있었다.

- 판정이 3상태가 됐다: `allowed` / `disallowed` / `unverified`.
- `unverified` 는 **요청하지 않는다**(fail-closed).
- 이미 robots 가 404 인 상태로 등록된 소스는 어댑터의
  `proceedWhenRobotsUnverified` 호스트 표식으로만 통과한다 — 근거는 각 어댑터
  주석. 표식 없는 신규 호스트는 막힌다.
- 표식은 `disallowed` 와 5xx·네트워크 오류를 **뚫지 못한다.**

### 남헌 2026-09-10 결정 — Algolia HN Search API evidence_grade=B로 확정

Algolia HN Search API(`hn.algolia.com/api`) 자체는 이용약관 문서가 없다(§ 위
Firebase 항목과는 별개 호스트). 확인한 건 "명시적 상업이용 금지 문구가 없다"는
것뿐이지 "명시적으로 허용됐다"가 아니다. 그래서 이 판단은 `evidence_grade=B`
(3자·정황 근거, 1차 출처의 명시적 확인 아님)로 취급하고, `review_sources`에
`enabled=false`로 등록해 사람이 켜야 실제 수집이 시작되게 했다(마이그레이션
`20260910000001_hackernews_source.sql`). Tier4(G2/Capterra — 이용약관 원문에
스크래핑 금지가 명시된 경우)와는 확인의 강도가 다르다는 걸 여기 남긴다.

## 커뮤니티 소스 실측 — damoang · 82cook (2026-09-16)

`feat/review-community-sources` 의 AC-0(선행 실측 게이트) 결과다. **어댑터 코드는
쓰지 않았다** — 아래 2·3번 발견 때문에 게이트에서 멈추고 사람 판단으로 넘겼다.

모든 요청은 정직한 UA `solutionarchive-review-collector/0.1 (+contact)` 로,
호스트당 3~4회만 보냈다.

### 측정한 URL과 결과

| 호스트 | URL | 일시(UTC) | HTTP | charset | 확인한 표지 |
|---|---|---|---|---|---|
| damoang.net | `/robots.txt` | 2026-09-16 07:00 | 200 | utf-8 | 3,752 bytes |
| damoang.net | `/free` (목록) | 2026-09-16 07:01 | 200 | utf-8 | `href="/free/<id>"` 다수 |
| damoang.net | `/free/7341567` | 2026-09-16 07:02 | 200 | utf-8 | `comment-body` ×13 = 댓글수(13) 일치 |
| www.82cook.com | `/robots.txt` | 2026-09-16 07:00 | 200 | (charset 없음, ASCII) | 325 bytes |
| www.82cook.com | `/entiz/enti.php?bn=15` (목록) | 2026-09-16 07:01 | 200 | **utf-8** | `read.php?bn=15&num=...` 다수 |
| www.82cook.com | `/entiz/read.php?bn=15&num=4060855&page=1` | 2026-09-16 07:02 | 200 | utf-8 | `id="articleBody"`, 댓글 0건 |
| www.82cook.com | `/entiz/read.php?num=4239440` | 2026-09-16 07:05 | 200 | utf-8 | `total_reple`=72, `li.rp` ×72 |

### 1. 셀렉터 — 기록과 실물의 차이 (AC-0d)

**damoang**: 기록된 `comment-body` 는 **오늘도 유효함을 확인**했다. 기록에 없던
더 나은 것도 찾았다.
- 댓글: `<li id="c_7341577" class="comment-item ...">` → 앵커 id 확보 가능(externalId 1순위 충족)
- 댓글 본문: `<div class="comment-body ...">` ✓
- 댓글 수: `<h2>댓글 <span>(13)</span></h2>` → "0건"과 "컨테이너 소실" 구분 가능
- 본문: `articleBody` 는 **damoang 셀렉터가 아니다(0건)**. 대신 `application/ld+json`
  의 `DiscussionForumPosting` 이 `headline`·`text`·`datePublished`(ISO)·`comment[]`
  를 통째로 제공한다. Svelte 해시 클래스(`svelte-1gn3ynt`)보다 훨씬 안정적이다.
  단 `text` 는 약 200자에서 잘린다 — 전문이 필요하면 HTML 을 봐야 한다.
- 작성일: 본문은 JSON-LD 에 ISO 로 있음. 댓글 HTML 표기는 `09.15` 로 **연도가 없다**
  (JSON-LD `comment[].datePublished` 에는 연도 포함 ISO 가 있으므로 그쪽을 쓴다).

**82cook**: 기록된 `articleBody`·`rp` 둘 다 **유효**. 역시 기록에 없던 것 추가.
- 본문: `<div id="articleBody">` ✓
- 글 번호: `<div id="contNum">4060855</div>`
- 댓글: `<ul class="reples"><li data-rn="41169700" class="rp">` → `data-rn` 이 댓글
  고유 id(externalId 1순위 충족)
- 댓글 수: `<strong class="total_reple">72</strong>` → 0건/소실 구분 가능
- 작성자: `<h5>...<strong>닉네임</strong></h5>`, 작성일: `<em>'26.9.15 8:00 PM</em>`
  (2자리 연도 — 파싱 필요, 상대시간 아님)
- 댓글은 **정적 HTML**이다. `/ajax/`(robots 금지) 호출에 의존하지 않는다.

### 2. 🔴 인코딩은 문제가 아니었다 — damoang 의 수집 거부 의사가 문제다 (AC-0c/0a)

설계가 걱정한 82cook EUC-KR 은 **기우였다. 실측 UTF-8 이다**(`file` 판정 및 한글
정상 출력 확인). `fetchText` 수정 불필요.

대신 예상 못한 것이 damoang robots.txt 에 있었다. 원문 그대로:

```
# AI 크롤러 차단 (콘텐츠 학습 방지)
User-agent: GPTBot
Disallow: /
User-agent: ChatGPT-User
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: anthropic-ai
Disallow: /
User-agent: Claude-Web
Disallow: /
User-agent: Bytespider
Disallow: /
User-agent: cohere-ai
Disallow: /

# ⛔ 무단 수집기 차단 — 2026-09-15 실측으로 확인
#    /rss 요청 7일 810건 중 631건(78%)이 자칭 수집기였다.
#      trend-archive/0.1  337건  robots.txt 를 읽지 않는다(형식상 명시만 한다)
#      CollectorHub/0.1   294건  robots.txt 를 30번 읽었다 → 막으면 지킬 가능성이 높다
#    ⭐ 근본 대응은 피드에서 본문·이미지를 뺀 것이다(별건). robots 는 **의사 표시**다 —
#       나중에 분쟁이 생기면 "금지 의사를 밝혔다"는 근거가 된다.
User-agent: trend-archive
Disallow: /
User-agent: CollectorHub
Disallow: /
```

우리 UA(`solutionarchive-review-collector/0.1`)는 이 목록에 **없다**. 그래서
`User-agent: *` / `Allow: /` 가 적용되고 **기계적 판정은 allowed=true** 다.

그런데 차단 목록의 두 UA 는 우리와 **형태가 같다** — `<이름>/0.1` 꼴의 자칭
수집기다. 사이트는 (a) AI 학습 목적 수집을 명시적으로 거부하고, (b) 자칭 수집기를
이름이 확인되는 대로 추가하고 있으며, (c) 그 robots 항목이 **분쟁 시 근거**임을
문서에 적어 뒀다. 우리 파이프라인은 수집한 텍스트를 AI 분석·콘텐츠 생성에 쓴다.

**"목록에 우리 이름이 아직 없다"를 "허용"으로 읽는 것은 §7.1 이 금지하는
'확인 불가를 양성으로 접는' 판정이다.** 기술 판단이 아니라 사업·법무 판단이므로
구현자가 결정하지 않는다. → 사람 판단 대기.

82cook robots.txt 에는 이런 조항이 **없다**(원문 전체가 아래 3번에 있다).

### 3. 🔴 두 호스트 모두 쿼리 대상 금지 규칙이 있는데 러너가 못 읽는다

82cook robots.txt 원문 전체:

```
User-agent: Googlebot
Disallow:

User-agent: *
Disallow: /tempfile/
Disallow: /tempimg/
Disallow: /ajax/
Disallow: /temp/
Disallow: /zb41/
Disallow: /entiz/read.php?bn=15&num=1166440&page=6

User-agent: Mediapartners-Google
Disallow:

User-agent: KaBot
Disallow:

sitemap: http://www.82cook.com/sitemap.xml
```

`?`·`=` 를 포함한 규칙이 양쪽에 있다:
- damoang: `Disallow: /*?page=` · `Disallow: /*&page=` (깊은 페이지네이션 — robots
  주석에 2026-07-30 OOM 장애 원인으로 기록돼 있다)
- 82cook: `Disallow: /entiz/read.php?bn=15&num=1166440&page=6` (특정 글 1건)

**수집 대상 글 경로 자체는 어느 규칙에도 안 걸린다**(damoang `/free/<id>` 는 쿼리가
없고, 82cook 글은 그 특정 1건이 아니다). 진입 자체는 허용이다.

문제는 판정 경로다. `lib/review/runner.ts:153`:

```ts
return robotsVerdict(cached, u.pathname, PRODUCT_TOKEN)
//                          ^^^^^^^^^^ u.search 가 없다
```

`robots.ts` 는 쿼리를 포함한 경로를 주면 정확히 판정한다(위 §정정 블록의 실측).
하지만 러너가 `pathname` 만 넘겨서 **쿼리스트링이 잘린다.** 결과:

- damoang 댓글 페이지네이션을 `?page=N` 으로 구현하면 → 실제로는 robots 위반인데
  러너는 `/free/<id>` 로 잘라 판정해 **allowed=true 를 돌려준다.** 안전장치가
  위반을 못 막는다(§7.2).
- 82cook 의 금지된 그 글 1건도 같은 이유로 막히지 않는다.

이건 커뮤니티 소스만의 문제가 아니라 **전 소스 공통 결함**이다. appstore 때
(SP-019) 와 같은 종류의 사고가 재발할 자리다. 수정은 러너 한 줄이지만 모든 소스의
robots 판정에 동시에 영향을 주므로 별건 PR 로 다룬다.

### 남헌 2026-09-16 결정 — 리스크를 인지하고 진행 (SP-025)

위 2번을 사람에게 올렸고, **두 소스 모두 진행**으로 결정됐다. 다모앙이 AI 학습
크롤러와 자칭 수집기를 거부하고 있다는 사실을 인지한 채로 내린 결정이다
(Reddit/SP-005 와 같은 리스크 수용 방식). 결정의 전문은 `docs/strategy-principles.md`
SP-025 에 있다.

따라서 AC-0 게이트를 통과해 구현했다:

- 어댑터 `lib/review/adapters/damoang.ts` · `82cook.ts`, 공용 ref 검증
  `url-ref.ts`(SSRF 경계)
- 픽스처 각 4종(정상 / 댓글0건 / 댓글영역소실 / 본문소실) — 실측 응답에서 깎았다
- 셀프테스트 `scripts/review-damoang-selftest.mjs`(62건) ·
  `review-82cook-selftest.mjs`(63건)
- 마이그레이션 `20260917000001_review_sources_community.sql` — **파일만. 미적용**
  (enabled=false 2행, DDL 없음)

**두 소스 다 `enabled=false` 다.** 이용약관 원문 확인이 끝난 뒤 사람이 켠다.

### 라이브 프로브 결과 (2026-09-16, DB 쓰기 없음)

실제 응답을 실제 어댑터의 `parse()` 에 통과시킨 결과다. 픽스처가 아니다.

```
damoang  https://damoang.net/free/7341567
  HTTP 200 · 409,235 bytes · utf-8
  reviews=11  parseFailures=0  nextCursor=null
  본문: "뉴스·펌글 작성 기준 안내\n\n안녕하세요, 다모앙입니다.뉴스 펌글 규칙의 적용 기준에 …"
  댓글[0]: /free/7341567#c_7341623  "확인했습니다."  writtenAt=null

82cook   https://www.82cook.com/entiz/read.php?num=4239440
  HTTP 200 · 61,041 bytes · utf-8
  reviews=79  parseFailures=0  nextCursor=null
  본문: "창고형 약국이 동네에 생겨서 가봤더니\n평소 처방없이 사먹던 약들이\n최소 반값이고 …"
  댓글[0]: …#41169700  "저도 가봤어요. 거의 반값인게 많더라구요."  writtenAt=2026-09-15
```

한글이 깨지지 않고 실제 글 내용과 일치한다. 양쪽 다 `parseFailures=0`,
`robotsSkips=0` 이고 `nextCursor=null` 이라 타깃이 곧바로 닫힌다(1글=1요청).

damoang 이 11건인 것은 댓글 13건 중 3건이 이모티콘만 달린 것이라 본문이 없어서다
(실패가 아니다 — 마커가 센 13건과 앵커 13건이 일치하므로 구조는 멀쩡하다).

### 알아 둘 것 — 이번 구현이 안고 가는 한계

- **다모앙 글 본문이 잘린다.** JSON-LD 의 `text` 가 약 200자에서 끊긴다(실측 160자).
  제목·작성일이 안정적으로 있는 곳이 여기뿐이라 이걸 썼다. 전문이 필요하면 HTML 의
  `#…-post-content` / `.prose` 를 읽어야 하는데, 그 id 가 게시판마다 달라 보여서
  이번엔 손대지 않았다.
- **다모앙 댓글 작성일이 전부 null 이다.** 화면 표기가 `09.15` 로 연도가 없고,
  JSON-LD 의 `comment[]` 는 일부만 실어 준다(실측 13건 중 3건). 순서로 맞추면
  어긋난 날짜를 조용히 붙이게 되므로 채우지 않았다.
- **82cook 은 삭제 표시 댓글(`class="rp delReple"`)도 수집한다.** 본문이 그대로
  실려 오고 개수 마커(`total_reple`)가 그것까지 세기 때문이다. 빼면 마커와 실제
  수가 어긋나 멀쩡한 글이 파싱 실패로 잡힌다.
- **두 사이트 이용약관 원문 확인 — 여전히 미실시(확인 불가).** robots 만 쟀다.
  `enabled=true` 전환 전에 사람이 봐야 한다.

## VOC 소스 3종 실측 — tumblbug · naver_blog · bobaedream (2026-09-17)

코드를 쓰기 전에 AC-0 게이트로 셋 다 실제 응답을 받아 봤다. 그 결과
**bobaedream 만 무조건 통과**였고 나머지 둘은 "제외" 로 보고했다.
**그 보고를 받고 남헌이 2026-09-17 둘 다 진행으로 결정했다**(SP-030 · SP-031).

그래서 이 절은 두 층으로 읽어야 한다:
**(1) 실측이 말한 것** — 아래 본문. 사실이고 바뀌지 않는다.
**(2) 사람이 그걸 알고 내린 결정** — 각 소스의 "결정" 단락. 리스크 수용이다.

측정 조건은 이 문서 맨 위와 같다 — 정직한 UA, 재시도 없음, 요청 간 2.5~4초,
robots 선확인. 로컬(한국 가정용 IP)에서 쟀다.

### 요약

| 소스 | 실측 판정 | 최종 | 가른 근거 |
|---|---|---|---|
| bobaedream | ✅ 채택 | 등록(off) | robots 전면 허용 · 정직 UA 18/18 HTTP 200 · 댓글이 정적 HTML · 고유 id · 개수 마커 |
| tumblbug | ⚠️ 설계 폐기 | 등록(off) | 코멘트·프로젝트 설명이 **정적 HTML 에 없다**(robots 가 막은 `/api/` XHR). 창작자 후기 프리뷰에서 **타깃 프로젝트 것만** 받아 수용 — SP-031 |
| naver_blog_post | ⚠️ 약관 금지 | 등록(off) | 파싱은 됐다. **이용약관이 우리 행위를 명시 금지.** 리스크 인지 후 수용 — SP-030. 댓글은 여전히 미수집 |

**3행 모두 `enabled=false` 다.** 사람이 켜야 시작한다.

### 1. 텀블벅 — 원래 설계 폐기, 창작자 프리뷰에서 타깃 프로젝트 것만 받아 수용

설계는 "프로젝트 설명 1건 + 후원자 커뮤니티 코멘트 N건"이었다. 둘 다 없었다.

먼저 URL 패턴부터 설계와 달랐다. `/project/<slug>` 가 아니라 **`/<slug>`** 다
(sitemap.xml 실측). 탭은 `/<slug>/story`, `/<slug>/community/backer`,
`/<slug>/community/creator`, `/<slug>/community/review`.

- **코멘트: 정적 HTML 에 0건.** hydration JSON(`window.MOBX_STATE`)의 최상위
  키는 `currentUser` · `projectStore` · `projectWarrantyStore` ·
  `pledgeOrderStore` · `projectEditorStore` · `editorRewardStore` 뿐이고
  **코멘트 스토어가 아예 없다.** 페이지 소스에 댓글 텍스트도, 개수 마커도 없다.
- **프로젝트 설명도 안 온다.** `projectStore.project.story === null` 이다.
  `/story` 탭에서도 null 이고 `introduction` · `purpose` · `rewardsDescription`
  전부 null 이다. 정적으로 오는 긴 문자열은 `refundExchangePolicy`(환불 규정)뿐이다.
- robots.txt 는 `/api/` · `/auth/` · `/sessions/` · `/oauth/` · `/discover?` ·
  `/search?` 를 막는다. 코멘트가 오는 XHR 이 그 `/api/` 다.

설계서의 탈락 조건("코멘트가 `/api/` XHR 로만 오면 프로젝트 설명만, 그것도
없으면 소스 제외")에 정확히 걸렸다. **원래 설계는 폐기했다.**

**대신 정적으로 오는 VOC 가 하나 있다 — 이걸 받기로 했다.**
`MOBX_STATE.projectStore.creators[i][1].review.contents[]` 에 후기가 최대 4건
실려 온다. 필드는 `projectWarrantyReviewId`(고유 id) · `body`(전문) ·
`createdAt`(절대 ISO) · `projectPermalink` 이고 개수 마커
`review.totalReviewCount` 도 있다. 실측 예(`/eastereggs`):

```
totalReviewCount=66  contents=4
[245885] 2026-02-26 "캐릭터 그림이 너무 귀여워요 일러스트가 너무 이뻐서 끝내기
         아쉬웠습니다 그런데 탐정 캐릭터에 대해서는 정보가 좀 부족해서 …"
[245602] 2026-02-26 "적극 추천받아 시즌1도 함께 후원했습니다. … 아쉬운 점이
         몇 가지 있는데 배송 포장이 너무 부실합니다. …"
```

품질은 좋다. 그런데 **이건 이 프로젝트의 후기가 아니라 창작자의 지난 프로젝트
후기**다(화면 라벨이 그대로 "이 창작자의 지난 프로젝트 후기"이고, 위 예의
`projectPermalink` 도 보고 있는 프로젝트와 다르다).

**결정(2026-09-17): 창작자 프리뷰에서 받되, 적재는 타깃 프로젝트 단위로 한다.**
그에 맞춰 어댑터를 이렇게 짰다.

| 항목 | 값 | 이유 |
|---|---|---|
| productRef | `url:/<projectSlug>` | **창작자 단위 URL 이 없다**(아래) |
| 수집 범위 | `projectPermalink === productRef slug` 인 후기만 | 남의 프로젝트 후기를 받으면 타깃 간 중복 적재가 된다(아래 ⛔) |
| externalId | `tbr:<projectWarrantyReviewId>` | 스코프가 이미 프로젝트 단위라 경로를 또 넣을 필요가 없다 |
| 버린 건수 | `filtered` (파싱 실패 아님) | 필드는 멀쩡히 읽혔고 이 타깃과 무관할 뿐이다. 건강도 분모에 안 들어간다 |
| writtenAt | `createdAt` 앞 10자 | 절대 ISO 라 추정할 게 없다 |
| 개수 판정 | 마커>0 인데 0건일 때만 실패 | 프리뷰가 4건 상한이라 66 vs 4 는 **정상**이다 |

**창작자 단위 URL 은 없다 — 확인했다.** `/neogury` · `/user/neogury` ·
`/creator/neogury` 를 전부 받아 봤고 셋 다 **HTTP 200 인데 후기 payload 가 없는
36KB SPA 껍데기**였다. 그래서 productRef 는 프로젝트 경로다.

⛔ **여기서 한 번 틀렸다(2026-09-17 QA 가 잡음).** 첫 판은 "externalId 가
프로젝트와 무관한 전역 고유값이라 지문이 중복을 걸러 준다"고 적었다. **안 걸러진다.**
`computeFingerprint` 의 identity_key 는 `sha256(sourceKey|productRef|externalId)`
라(`lib/review/fingerprint.ts`) **productRef 가 키에 들어간다.** 재현:

```
computeFingerprint('tumblbug', 'url:/eastereggs', 후기) 
computeFingerprint('tumblbug', 'url:/clear',      같은 후기)
→ externalId 는 같지만 identity_key 교집합 0/4 = 같은 4건이 8행으로 적재된다
```

지문은 8개 소스가 같이 쓰는 파일이라 고치지 않았다. 대신 **어댑터가 그 계약을
지키도록** 바꿨다 — 이 타깃 프로젝트의 후기만 받는다. 그러면 후기 하나는 자기
프로젝트 타깃 한 곳에서만 나오므로 타깃을 여러 개 잡아도 중복이 없다. 덤으로
적재 오류도 사라졌다: 전에는 `/clear` 후기가 `/eastereggs` 타깃의 project_id 로
들어갔다.

실제 응답으로 파싱한 결과(같은 창작자의 다른 두 프로젝트 페이지):

```
/eastereggs  프리뷰 4건 = ids tbr:245885,245602,244722,241940 (permalink eastereggs×2, clear×2)
/cairn       프리뷰 4건 = 같은 4건 (cairn 자기 후기는 0건)
→ 스코프 적용 후: /eastereggs 적재 2건·filtered 2 · /clear 적재 2건·filtered 2
                  /cairn 적재 0건·filtered 4 (0건이지만 고장이 아니다)
```

⚠️ **알아 둘 한계 세 가지.**
- **창작자당 최대 4건.** 마커는 66 인데 `contents` 는 4건만 온다. 전량을 받으려면
  후기 목록 XHR 이 필요한데 그건 robots 가 막은 `/api/` 다. 막힌 길이다.
- **타깃 1개가 받는 건수는 4건보다 적다.** 프리뷰의 4건은 창작자 전체에서 최신
  4건이라 그중 이 프로젝트 것만 남는다. 4건을 다 받고 싶으면 **후기가 달린
  프로젝트들을 각각 타깃으로 등록**해라(어느 페이지에서나 같은 4건이 보이므로
  어느 타깃으로 들어가든 자기 몫을 받는다). 창작자가 겹쳐도 중복 적재는 없다.
- **진행 중인 프로젝트는 0건이 정상이다.** 아직 자기 후기가 없다(실측 `/cairn`).
  `filtered` 수가 요청이 헛돈 정도를 말해 준다 — 0건이 계속되면 타깃을 바꿔라.

이용약관의 "자동화된 수단으로 서비스 조작·이용" 금지 조항은 남헌이 인지한 채로
진행을 결정했다(SP-031). `enabled=false` 로 등록한다.

### 2. 네이버 블로그 — 약관 리스크를 인지하고 수용 (본문 전용)

파싱에 필요한 것은 전부 확인됐다. 막은 것은 그다음이다.

**(a) 기술 실측 — 전부 통과**

- `PostView.naver?blogId=&logNo=` → HTTP 200, 244~276KB. 마커 4개 글에서 안정:
  - 본문 `<div class="se-main-container">` (1개)
  - 발행일 `<span class="se_publishDate pcol2">2026. 8. 4. 11:00</span>`
  - 제목 `og:title`
- **예쁜 URL 이 진짜 빈 껍데기다.** `blog.naver.com/naverofficial/224367462657`
  → **HTTP 200 / 2,817 bytes** 의 iframe 프레임셋. 같은 글의 PostView 는
  276,193 bytes. 상태 코드로 판정했으면 "200이니까 됐다"고 적었을 사례다(§7.1).
  설계의 `/PostView.naver` 한정 가드는 옳았다.
- 없는 글(`logNo=999999999999`) → HTTP 404 / 110KB 껍데기, `se-main-container` 0개.

**(b) 댓글 — 정적이 아니다. 탈락 확정**

페이지에 `cbox` 문자열이 99번 나오지만 **전부 CSS·설정이고 댓글 텍스트는
0건**이다(`u_cbox_contents` 0개, 4개 글 전부). 설정값이 출처를 그대로 말한다:

```
var naverCommentApiURL      = 'https://apis.naver.com/commentBox/cbox9';
var naverCommentApiProxyURL = 'https://apis.naver.com/commentBox/blogid';
```

별도 호스트(`apis.naver.com`)의 XHR 이다. 어댑터 상수 HOST 원칙에 어긋나고
그 호스트 robots 를 따로 재야 한다. 설계대로 **본문 전용**으로 축소하는 것이
맞았다.

**(c) 그런데 약관이 금지한다 — 이 소스의 진짜 쟁점**

네이버 서비스 이용약관(2025-07-10 시행, `policy.naver.com/rules/service.html`)
원문:

> 네이버의 사전 허락 없이 자동화된 수단(예: 매크로 프로그램, 로봇(봇),
> 스파이더, 스크래퍼 등)을 이용하여 … **네이버 서비스에 게재된 회원의
> 아이디(ID), 게시물 등을 수집하거나** … 이용자(사람)의 실제 이용을 전제로
> 하는 네이버 서비스의 제공 취지에 부합하지 않는 방식으로 네이버 서비스를
> 이용하거나 … 해서는 안 됩니다.

우리가 하려던 일(스크래퍼로 게시물 수집)을 문장이 그대로 지목한다.
robots.txt 본문에도 같은 의사가 적혀 있다:

```
# BOT ACCESS FOR THE PURPOSES OF AI TRAINING AND RETRIEVAL-AUGMENTED
# GENERATION (RAG) IS STRICTLY PROHIBITED.
User-agent: GPTBot           Disallow: /
User-agent: ClaudeBot        Disallow: /
User-agent: Claude-SearchBot Disallow: /
User-agent: PerplexityBot    Disallow: /
...
User-agent: *
Disallow: /PostList.naver
Disallow: /PostPrint.naver
...
Disallow: comment.naver
```

우리 UA 토큰은 그 목록에 없어 `*` 그룹이 적용되고 `/PostView.naver` 는
금지 목록에 없다 — **기계 판정만 보면 allowed** 다. SP-025(다모앙)와 같은
모양이다. 다른 점은 이것이다: 다모앙은 robots 의 **의사 표시**였고 우리 용도가
거기 걸리는지는 해석의 여지가 있었다. 네이버는 **약관 본문이 우리 행위를
명시적으로 금지**한다. **다모앙보다 상위 리스크다.**

부수적으로 `rss.blog.naver.com` 도 확인했다 — `User-agent: * / Disallow: /`
전면 금지다. 우회로로 쓸 수 없다.

**(d) 결정(2026-09-17) — 리스크를 인지한 채로 진행**

위 (c)를 사람에게 올렸고 **진행**으로 결정됐다(SP-030). 다모앙(SP-025) ·
Reddit(SP-005)과 같은 리스크 수용 방식이다. 수용한 조건은 이렇다.

- **`enabled=false` 로 등록한다.** 사람이 켜야 시작한다. 킬스위치를 미리 걸어
  둔 상태로 시작하는 것이지, 문제가 생기면 그때 끄는 게 아니다.
  되돌리는 한 줄은 `20260918000001_..._rollback.sql` 에 있다.
- **본문 1건만 받는다.** 댓글 수집 경로를 아예 만들지 않았다((b) 참조).
  러너 셀프테스트가 `apis.naver.com` 을 한 번도 안 때린다는 것을 단정한다.
- **`/PostView.naver` 한정 가드**가 robots 금지 경로를 구조적으로 막는다.
- **"댓글 영역 소실" 판정을 넣지 않았다.** 없는 기능의 실패를 세면 신호가
  흐려진다. 건강도는 본문 컨테이너 소실 하나에만 건다.

어댑터 헤더(`lib/review/adapters/naver-blog.ts`)에 같은 경고를 적어 뒀다.
이 소스를 확장하려는 사람이 SP-030 을 먼저 보게 하려는 것이다.

### 3. 보배드림 — 채택

설계 단계에서 "게시판 목록이 403/301 로 오락가락한다"는 이유로 조건부였다.
**재현되지 않았다.**

**(a) 접근 안정성 — 정직한 UA 로 18/18 HTTP 200**

`www` / apex, `/view` / `/view.php` / `/list`, 3라운드 반복:

```
r1~r3  200  /view?code=freeb&No=2000000        166,9xx bytes
r1~r3  200  /view.php?code=freeb&No=2000000    166,9xx bytes
r1~r3  200  /list?code=freeb                   111,575 bytes
r1~r3  200  /view?code=national&No=2000000     130,0xx bytes
r1~r3  200  /view?code=strange&No=100000           121 bytes  ← 없는 게시판
r1~r3  200  https://bobaedream.co.kr/view?...  166,9xx bytes
```

403 도 301 도 한 번도 안 나왔다. **UA 위장은 하지 않았다** — 위장해야만 되는
상황이면 제외할 생각이었는데, 그럴 필요가 없었다.

⚠️ `code=strange`(없는 게시판)가 **HTTP 200 에 121 bytes** 를 돌려준다.
상태 코드로 성공을 판정하면 이걸 정상 수집으로 적게 된다(§7.1). 어댑터가
`bodyCont` 부재로 실패 처리하고, 셀프테스트가 그 경우를 고정한다.

**(b) robots.txt — 전면 허용**

```
User-agent: *
Allow: /

User-agent: grapeshot
Disallow:

User-agent: Amazonbot
Disallow: /
```

금지 경로가 0개다. damoang·82cook 과 달리 쿼리 대상 Disallow 가 없어
SP-026(러너가 쿼리를 떼고 판정하는 구멍)을 밟지 않는다.

**(c) 셀렉터 — 전부 정적 HTML**

| 대상 | 마커 |
|---|---|
| 글 제목 | `<strong itemprop="name" ...>제목<em class="detailTxtDeco01">[23]</em>` |
| 글 본문 | `<div class="bodyCont" itemprop="articleBody">` … `<!-- 본문 끝 -->` |
| 글 작성일 | `<span class="countGroup">조회 … 2020.04.22&nbsp;(수) 10:53</span>` |
| 댓글 개수 | `<span class="comm2">(23)</span>` |
| 댓글 앵커 | `<dd class="" id="small_cmt_1018669" …>본문</dd>` |
| 댓글 작성일 | `<span class="date">20.04.22 12:14</span>` |

댓글 작성일이 2자리 연도라 82cook 과 같은 피벗(90)을 쓴다. **표기가 YY.MM.DD
인 것은 추정이 아니라 실측이다** — 같은 글의 첨부 이미지 경로가
`/bbs/freeb/2020/04/22/` 다.

**(d) ⚠️ 알아 둘 한계 — 댓글 100건이 넘으면 일부만 온다**

라이브 프로브에서 잡혔다. 안전장치가 걸린 게 아니라 **수집량이 조용히 줄어드는**
쪽이라 더 위험한 종류다(§7.2).

```
No=1366719  마커 155 → 앵커 55   ← 나머지 100건은 comment_list.php 로 따로 온다
No=1366724  마커  21 → 앵커 21
No=1366740  마커  12 → 앵커 12
No=1366714  마커  12 → 앵커 12
No=1366717  마커   5 → 앵커  5
No=1366746  마커   1 → 앵커  1
No=2000000  마커  23 → 앵커 23
```

그래서 **개수 마커 판정을 damoang·82cook 과 다르게 뒀다.** 저쪽은
`declared - anchors` 를 실패로 세는데, 여기서 그러면 댓글 많은 글 하나가
실패 100건을 찍어 소스가 `broken` 으로 꺼진다. 구조가 깨진 게 아니라 사이트가
나눠 주는 것이다. 그래서 **마커가 >0 인데 앵커가 0건일 때만** 실패로 센다.

100 을 넘는 글에서 몇 건을 주는지는 데이터가 한 건뿐이라 공식으로 만들지
않았다(155→55). 전량이 필요하면 `/board_renew/bulletin/comment_list.php` 를
붙여야 하는데, 그건 1글=1요청을 깨는 일이고 SP-026 수정이 선행되어야 한다.

**(e) 이용약관 — 확인 불가**

사이트에서 약관 페이지를 찾지 못했다. 푸터에 약관 링크가 없고
`/member/agreement` · `/policy` · `/etc/agreement` 가 전부 404 다.
**robots 가 허용한다는 것과 약관이 허용한다는 것은 다른 사실이고, 확인 못 한
것을 허용으로 접지 않는다**(§7.1). 그래서 `enabled=false` 로 등록한다.

### 라이브 프로브 (2026-09-17, DB 쓰기 없음)

실제 응답을 실제 어댑터의 `parse()` 에 통과시킨 결과다. 픽스처가 아니다.

```
https://www.bobaedream.co.kr/view?code=freeb&No=2000000
  HTTP 200 · 166,990 bytes
  reviews=24  parseFailures=0  nextCursor=null
  본문: "후방)이거 3D그래픽 이라는데 검증 좀..\n\n아니죠.?"  writtenAt=2020-04-22
  댓글[0]: …#small_cmt_1018376  "와우!!!\n\n나도 저렇게 다시 태어나고 싶드앙"  writtenAt=2020-04-22

https://www.bobaedream.co.kr/view?code=battle&No=1366719
  HTTP 200 · 231,082 bytes
  reviews=56  parseFailures=0  nextCursor=null
  본문: "'소카'의 횡포\n\n안녕하세요. 카셰어링 쏘카(Socar)를 이용하다가 대기업 CS의
         기만적인 대응과 황당한 일처리를 겪어 공익 목적으로 글을 올립니다. …"  writtenAt=2026-09-12
  댓글[0]: …#small_cmt_160044  "그래서 서비스 가능 지역하고 불가 지역으로 나눠서
         되어 있는데 저희집은 가능지역이여서 이용 해온건데 이리되었…"  writtenAt=2026-09-13

https://www.bobaedream.co.kr/view?code=hotcar&No=3000000   ← 없는 글
  HTTP 200 · 121 bytes
  reviews=0  parseFailures=2  nextCursor=null   ← 200 을 성공으로 접지 않는다
```

한글이 깨지지 않고 실제 글 내용과 일치한다. `externalId` 를 전건 확보했고
(composite 폴백 0건) 중복도 없다. `nextCursor=null` 이라 타깃이 곧바로 닫힌다.

나머지 두 소스도 같은 방식으로 **실제 응답을 실제 어댑터에 통과**시켰다.

```
tumblbug  https://tumblbug.com/eastereggs      ← ⚠️ 스코프 필터 **이전** 판의 출력이다
  reviews=4  parseFailures=0  nextCursor=null   (지금은 reviews=2 filtered=2 — 위 ⛔ 참조)
  [tbr:245885] 2026-02-26 permalink=eastereggs
    "캐릭터 그림이 너무 귀여워요 일러스트가 너무 이뻐서 끝내기 아쉬웠습니다
     그런데 탐정 캐릭터에 대해서는 정보가 좀 부족해서 아쉬웠어여ㅜㅜ 그래도 재후원할게요!!"
  [tbr:245602] 2026-02-26 permalink=eastereggs
    "적극 추천받아 시즌1도 함께 후원했습니다. … 아쉬운 점이 몇 가지 있는데
     배송 포장이 너무 부실합니다. … 시즌1과 시즌2의 패키징 방식이 다르네요."

tumblbug  https://tumblbug.com/cairn        ← 같은 창작자의 다른 프로젝트
  reviews=4  parseFailures=0  → externalId 4개가 위와 **완전히 동일**
  ⛔ 이때 "그래서 지문이 중복 처리한다"고 적었는데 **틀렸다**(identity_key 에
     product_ref 가 들어간다). 그래서 스코프 필터를 넣었고, 지금 이 페이지는
     reviews=0 filtered=4 다 — cairn 자기 후기가 4건 안에 하나도 없다.

tumblbug  https://tumblbug.com/0clock       ← 신규 창작자(후기 0건)
  reviews=0  parseFailures=0                ← 0건은 실패가 아니다

tumblbug  https://tumblbug.com/neogury      ← 창작자 페이지(SPA 껍데기)
  reviews=0  parseFailures=1                ← 200 을 성공으로 접지 않는다

naver_blog_post  PostView.naver?blogId=naverofficial&logNo=224367462657
  HTTP 200 · 276,193 bytes
  reviews=1  parseFailures=0  nextCursor=null
  externalId=naverofficial:224367462657  writtenAt=2026-08-04  본문 7,105자
  "[네이버 메이트 인터뷰] 레시피 블로그 'MJ의후다닥레시피'를 만나다
   … 'MJ의후다닥레시피'라는 이름은 사실 신혼 시절 남편이 지어준 이름에서
   출발했습니다. 제가 요리하는 손이 유독 빠르다며 붙여진 애칭이었죠. …"
```

네이버 본문이 **7,105자 전부** 읽혔다는 것이 중요하다. 스마트에디터 본문은
`se-component` > `se-section` 으로 깊게 중첩돼 있어서 비탐욕 정규식으로 자르면
첫 문단에서 끊긴다 — 그러면 "글자는 있으니" 실패로도 안 잡히고 조용히 상한다.
그래서 두 어댑터 다 div 짝을 세어 자른다.

### 구현물

- 어댑터 3종
  - `lib/review/adapters/bobaedream.ts`
  - `lib/review/adapters/tumblbug.ts` (창작자 프리뷰에서 **타깃 프로젝트 것만**)
  - `lib/review/adapters/naver-blog.ts` (`key=naver_blog_post`, 본문 전용)
  - 셋 다 공용 ref 검증 `url-ref.ts` 를 재사용한다(SSRF 경계가 한 곳이어야 한다)
- 픽스처 — 전부 실측 응답에서 깎았다
  - `fixtures/review/bobaedream/` 4종 (정상 / 댓글0건 / 댓글영역소실 / 본문소실)
  - `fixtures/review/tumblbug/` 4종 (정상 / 후기0건 / review소실 / MOBX소실)
  - `fixtures/review/naver-blog/` 3종 (정상 / 본문소실 / **예쁜URL 껍데기 원본 그대로**)
- 셀프테스트 — `review-bobaedream-selftest.mjs`(89) ·
  `review-tumblbug-selftest.mjs`(92) · `review-naver-blog-selftest.mjs`(83)
  - 텀블벅의 "타깃간중복" 블록은 **진짜** `computeFingerprint` 와 `store.ts` 의
    판정 분기를 옮긴 인메모리 store 로 돈다. 같은 창작자를 두 프로젝트로
    타깃팅해도 4건이 4행으로 들어가는지를 고정한다(고치기 전엔 8행이었다)
- robots 단위테스트 — `scripts/review-robots-selftest.mjs` 에 3개 호스트 원문 추가(119건)
- 러너 경계면 — `scripts/review-runner-selftest.mjs` 에 **새 블록으로** 추가(217건).
  기존 damoang·82cook 블록은 손대지 않았다. 타깃 2개(같은 창작자)를 실제 러너로
  돌리는 중복 재현도 여기에 있다 — 부품 테스트를 통합의 근거로 쓰지 않는다(§7.1)
- 마이그레이션 `20260918000001_review_sources_voc_round3.sql` + `_rollback.sql`
  — **파일만. 미적용** (enabled=false **3행**, DDL 없음)

`lib/review/{types,url-ref,runner,robots,store,fingerprint}.ts` 는 한 줄도
건드리지 않았다. 텀블벅 중복 버그도 **어댑터 쪽에서** 고쳤다 — 지문은 8개 소스가
같이 쓰는 파일이라 거기서 productRef 를 빼면 나머지 7개의 중복 판정이 흔들린다.
특히 `runner.ts:153`(SP-026)은 이번 범위 밖이다 — 세 소스 다 1문서=1요청이라
그 구멍을 밟지 않는다. 다만 **텀블벅 robots 의 `/discover?` `/search?` 는 쿼리
대상 규칙이라 러너가 못 막는다.** 그래서 어댑터의 `parseProductRef` 가 직접
거부한다(82cook 의 `ROBOTS_DENY` 와 같은 처방).
---

## 커뮤니티 소스 실측 round-2 — theqoo · todayhumor (2026-09-16)

측정: Node v24.16.0, UA `solutionarchive-review-collector/0.1 (+…)`,
`redirect: 'follow'`, 타임아웃 20초 — `scripts/review-collect.mjs` 의 fetchText 와
같은 조건. DB 쓰기 없음.

### 결론 먼저

둘 다 들어온다. 단 **둘 다 댓글을 못 가져온다 — 정적 HTML 에 없다.**
그래서 설계 단계의 "게시글·댓글"이 **"게시글 전용"으로 축소**됐다.
1글 = 리뷰 1건이다(damoang·82cook 의 N+1 과 다르다).

| | theqoo | todayhumor |
|---|---|---|
| HOST | `https://theqoo.net` | `https://www.todayhumor.co.kr` |
| robots.txt | **404** (Rhymix HTML 본문) | **404** (Apache 기본 페이지) |
| 리다이렉트 | www → 루트 301 | **무www → `http://www` (https 강등)** |
| 인코딩 | UTF-8 | UTF-8 (EUC-KR 우려 기각) |
| 글 페이지 | 200 · 31.5KB · 40ms | 200 · 125.9KB · 446ms |
| 댓글 | AJAX (`loadReply`) | AJAX (`memoContainerDiv` 빈 div) |
| 이용약관 | 읽음 (6,315자, 관련 조항 0건) | **찾지 못함 (확인 불가)** |

### robots.txt — 설계가 걱정한 순환 리다이렉트는 없었다

설계 단계의 가장 큰 위험은 todayhumor 의 www ↔ 무www **순환 리다이렉트**였다.
순환이면 Node fetch 가 20홉 뒤 throw → `status: null` → 러너가 그 오리진을
`'unreadable'` 로 캐시 → **전 요청 스킵**이고, 로그에는 robotsSkips 만 남아
"정상 종료"처럼 보인다(CLAUDE.md §7.2). 실측 결과 순환은 없다:

```
https://theqoo.net/robots.txt          → 404  (final: 자기 자신)
https://www.theqoo.net/robots.txt      → 404  (final: https://theqoo.net/robots.txt)
https://todayhumor.co.kr/robots.txt    → 404  (final: http://www.todayhumor.co.kr/… ← https 강등)
https://www.todayhumor.co.kr/robots.txt→ 404  (final: 자기 자신)
http://www.todayhumor.co.kr/robots.txt → 404  (final: 자기 자신)
```

**대신 다른 게 나왔다.** todayhumor 의 무www 오리진은 https 를 **http 로
내려보낸다.** 러너는 `redirect: 'follow'` 라 그 강등을 조용히 따라가고, 그때부터
우리 요청은 평문이다. 그래서 HOST 를 `https://www.todayhumor.co.kr` 로 고정했다 —
그 오리진은 https 에서 리다이렉트 0회로 종단한다.

### 소프트 404 — 설계가 걱정한 "200 + HTML" 은 기각됐다

theqoo 의 `/robots.txt` 는 HTML 을 주지만 **상태 코드가 404 다.** 러너는 4xx 를
"규칙 없음 = 허용"으로 처리하며 본문을 파싱하지 않으므로(`runner.ts:143`),
`parseRobots` 가 HTML 을 먹는 일은 지금은 없다.

그래도 위험은 남는다. **상태가 200 으로 바뀌면 같은 HTML 이 `parseRobots` 로
들어가고, 그때도 답은 똑같이 `allowed: true / '규칙 없음'` 이다.** "규칙이 없다"와
"HTML 을 robots 로 읽었다"가 한 값이 된다(§7.1). 그 성질을 실측 본문 그대로
`scripts/review-robots-selftest.mjs` 에 못박아 뒀다 — 진짜 robots 가 올라오면
그 줄이 깨진다.

### 댓글이 AJAX 다 — 이번 건에서 제일 중요한 발견

**theqoo** — 글 페이지의 댓글 영역이 이것뿐이다:

```html
<div id="4347529638_comment" class="fdb_lst clear fdb_nav_btm cmt_wrt_btm">
  <script>jQuery(document).ready(function() { loadReply(4347529638, 0, false, false); });</script>
  <div id="cmtPosition" aria-live="polite">
    <div class="comment_header_bar">
      <i class="far fa-comment-dots"></i> 댓글 <b>7</b>개
    </div>
```

개수 마커(`댓글 <b>7</b>개`)만 정적이고 항목은 0개다. 앵커 id 도 없다.
`?listStyle=viewer`(인쇄용) 변형도 똑같았다.

**todayhumor** — 같은 모양이다:

```html
<div>댓글 : 5개</div>
...
<!--댓글 자리-->
<div id='memoContainerDiv'></div>
```

댓글 5개짜리 글인데 컨테이너가 빈 div 다. `loadMoreReply()` 가 채운다.

그래서 **댓글 미수집은 파싱 실패로 세지 않는다.** 못 읽은 게 아니라 응답에 없다.
실패로 세면 매일 밤 가짜 경보가 뜬다. 대신 §7.1 의 "0건 vs 못 읽음" 구분은
본문에 걸었다 — 본문 컨테이너가 사라지면 그건 실패다.

되살리려면 XHR 엔드포인트를 따로 실측해야 하고, 그건 1글=1요청 계약을 깨는
일이라 사람이 판단한다. 두 셀프테스트에 트립와이어를 박아 뒀다: 사이트가 댓글을
정적으로 내려주기 시작하면 그 줄이 깨진다.

### 확정한 셀렉터 (실측 4개 글 / 3개 글)

**theqoo** (`/square/4347529638`, `/square/4347536910`, 공지 2건)

| 무엇 | 마크업 | 비고 |
|---|---|---|
| 본문 | `<article itemprop="articleBody">` … `</article>` | 페이지당 정확히 1개 |
| 제목 | `<title>더쿠 - …</title>` | og:* 가 **없다**. `<span class="title">` 은 공지글에서 안쪽에 또 span 을 품는다 |
| 작성일 | `<div class="side fr"><span>2026.09.16 23:23</span></div>` | 4자리 연도, 페이지당 1개 |

- **공지글도 `/square/<id>` 에 산다.** `/notice/` 같은 별도 경로가 없어서
  설계서의 "공지 배제" 규칙은 경로로는 성립하지 않는다. 죽은 코드를 넣지 않았다.
- 글 아래에 게시판 목록이 통째로 붙어 온다. 본문 슬라이스가 거기까지 삼키면
  옆 글 제목이 리뷰로 섞인다 — 픽스처에 목록 일부를 남겨 그걸 감시한다.
- `/index.php?act=dispMemberAgreement` 는 우리 UA 에 **403** 이다(로그인 필요 act).
  글 페이지는 200. quotaMarkers 를 안 걸었으므로 403 은 전부 차단으로 읽힌다.

**todayhumor** (`bestofbest_483830`, `bestofbest_483825`, `humordata_2060038`)

| 무엇 | 마크업 | 비고 |
|---|---|---|
| 본문 | `<div class="viewContent">` … `</div><!--viewContent-->` | 닫는 자리를 주석으로 표시해 준다 — div 를 셀 필요가 없다 |
| 제목 | `<meta property="og:title" content="…">` | `<title>` 은 `오늘의유머 - ` 접두가 붙는다 |
| 작성일 | `원글작성시간 : 2026/09/10 22:20:53` | 4자리 연도 — 82cook 의 2자리 피벗 불필요 |
| 작성일(대체) | `등록시간 : 2026/09/16 23:15:47` | 일반 보드에는 원글작성시간 칸이 빈 `<div></div>` |

⚠️ **베스트 보드는 시각이 둘이다.** `등록시간` 은 베오베로 올라온 날이고
`원글작성시간` 이 글이 쓰인 날이다. 등록시간을 쓰면 적재된 글이 전부
"오늘 쓴 글"이 된다. 원글작성시간을 우선하고, 없을 때만 등록시간으로 내려간다.

⚠️ `writerInfoContents`(닉네임·IP·조회수)가 본문 **바로 위**에 있다. 슬라이스
시작점이 밀리면 작성자 정보가 리뷰 텍스트로 들어간다. 셀프테스트가 그걸 본다.

### 이용약관 — 두 소스의 "확인 불가"는 사유가 다르다

**theqoo**: `https://theqoo.net/service` 200, 평문 6,315자. `크롤`·`로봇`·
`자동화`·`마이닝`·`스크래`·`인공지능`·`AI`·`재가공` 0건. `복제` 3건은 전부
"회사가 회원 게시물을 서비스 내에서 이용한다"는 저작권 조항이고 제3자 수집
얘기가 아니다.

**todayhumor**: **이용약관 페이지를 찾지 못했다.** 푸터에 링크 자체가 없고
(`개인정보취급방침`·`청소년보호정책`만 있다), `/member/agreement.php` ·
`/member/join_agreement.php` 는 404. `/member/privacy.php`(200, 평문 3,123자)에도
관련 조항 0건. **이건 허용이 아니라 확인 불가다**(§7.1). 켜는 판단은 사람이 한다.

### 라이브 프로브 (AC-4, DB 쓰기 없음)

실제 어댑터 + 실제 robots 판정 + 갓 받은 응답:

```
theqoo → https://theqoo.net/square/4347529638
  robots: status=404 → allowed=true (robots.txt 에 규칙 없음)
  page:   200 · 40ms · 31,502 bytes
  parse:  reviews=1 failures=0 cursor=null
  본문: "늙크크들은 이거 보면 이게 찐 마리오지 할듯 ㅋㅋㅋㅋㅋㅋ\n\nhttps://x.com/…\n\n트위터에서 말하는건 이 줄기 타는걸 까먹었다고 ㅋㅋㅋㅋㅋ"
  writtenAt=2026-09-16

todayhumor → https://www.todayhumor.co.kr/board/view.php?table=bestofbest&no=483825
  robots: status=404 → allowed=true (robots.txt 에 규칙 없음)
  page:   200 · 446ms · 125,898 bytes
  parse:  reviews=1 failures=0 cursor=null
  본문: "조국 원장 페북글입니다\n\n역시 원장님 뿐입니다. 계속 혁신당이 쇄빙선 역할로\n 뉴일베의 검찰개악을 계속 저지해야합니다."
  writtenAt=2026-09-10   ← 등록시간(09-16)이 아니라 원글작성시간
```

한글이 깨지지 않고 실제 글 내용과 일치한다. 양쪽 다 `parseFailures=0`,
`nextCursor=null` 이라 타깃이 곧바로 닫힌다(1글=1요청).

### 알아 둘 것 — 이번 구현이 안고 가는 한계

- **댓글이 하나도 안 들어온다.** 위 사유. 커뮤니티 VOC 로서 값이 절반이다.
  댓글이 필요하면 XHR 엔드포인트 실측이 선행돼야 하고, 그건 별건이다.
- **todayhumor 본문 슬라이스가 닫는 주석 하나에 의존한다.**
  `</div><!--viewContent-->` 가 사라지면 슬라이스가 문서 끝까지 가고, 그러면
  본문 뒤 영역이 텍스트로 섞이는데 **어댑터가 그 상태를 감지하지 못한다**
  (텍스트가 나오니 실패로도 안 잡힌다). 깨지면 damoang 의 `sliceDiv`(div 세기)로
  올려라.
- **todayhumor 는 사진만 올린 글이 흔하다.** 그런 글은 제목만 남는다. 실패로
  세지 않는다 — 컨테이너가 멀쩡하니 파서가 깨진 게 아니다.
- **theqoo 본문은 `</article>` 로 자른다.** 실측 페이지에는 article 이 1개뿐이라
  지금은 안전하지만, 중첩되면 앞에서 끊긴다(셀프테스트에 그 상황을 넣어 뒀다).
- **todayhumor 의 글 주소는 쿼리형이다.** 지금은 robots 가 없어 무해하지만,
  생기면서 쿼리 규칙이 들어가면 러너가 그 규칙을 **못 본다**(SP-026 — `runner.ts`
  가 `u.pathname` 만 넘긴다). 그 전에 러너를 고쳐야 한다.
- **두 소스 다 `enabled=false` 로 등록한다.** 켜는 것은 사람이 한다.

---

## 커뮤니티 소스 실측 round-3 — brunch · clien · fmkorea (2026-09-17)

측정 방법: 정직한 UA(`solutionarchive-review-probe/0.1`, 위장 없음), 호스트당
3~5초 간격, 재시도·프록시 없음. 상태 코드만 보지 않고 기대 마커를 함께 확인했다
(CLAUDE.md §7.1). 받은 HTML 은 리포에 넣지 않고, 파싱 대상 영역만 깎아
`fixtures/review/{brunch,clien,fmkorea}/` 에 픽스처로 남겼다.

**이 절은 설계 초안을 세 군데 정정한다.** 초안의 전제가 실측과 달랐고, 그대로
구현했으면 (a) 클리앙 방어 근거가 틀린 자리에 걸리고 (b) 에펨이 매일 밤 가짜
실패를 찍고 (c) 브런치 본문 절단을 "없다"고 문서에 적을 뻔했다.

### 요약

| | key | HOST | 수집 단위 | robots | min_interval / cap |
|---|---|---|---|---|---|
| 브런치 | `brunch` | `https://brunch.co.kr` | 본문 1건 | 200 · `Crawl-delay: 5` | 5000 / 50 |
| 클리앙 | `clien` | `https://www.clien.net` | 본문 1 + 댓글 N | ~~우리 UA 에겐 404~~ **2026-09-24 재실측: 200(규칙 정상 수신, SP-027 재정정)** | 3000 / 100 |
| 에펨코리아 | `fmkorea` | `https://www.fmkorea.com` | 본문 1 + 댓글 N(마지막 페이지) | 200 | 3000 / 100 |

### 🔴 정정 1 — 클리앙 robots 는 호스트 분열이 아니라 UA 게이팅이다

초안: "`www` 는 404, apex(`clien.net`)는 200 에 규칙이 있다."

실측(4조합 전부 확인):

| URL | 봇 UA | 브라우저 UA |
|---|---|---|
| `https://www.clien.net/robots.txt` | **404** (315B) | **200** (1,691B, 규칙 있음) |
| `https://clien.net/robots.txt` | **404** | **404** |

apex 에는 규칙이 아예 없다. 규칙은 `www` 에 있고 클리앙이 봇 UA 에게만 숨긴다.
→ **apex 를 HOST 로 바꿔도 해결되지 않는다.** 우리 크롤러는 어떤 호스트로도
클리앙 규칙을 읽을 수 없다. UA 위장은 프로브 규칙 위반이라 하지 않는다.

결론은 초안과 같지만 근거가 바뀐다: 규칙을 **어댑터가 코드로 내재화**하는 것이
유일한 방어다(SP-027). 초안의 3중 가드에 `sold`·`hongbo` 제외를 추가했다 —
그 둘은 `Allow:/service/board/` **안쪽**에서 다시 막히는 경로라 접두 검사만으로는
샌다.

브라우저 UA 로 받은 `User-agent: *` 그룹 원문:

```
Allow:/service/board/
Disallow:/service/group/
Disallow:/service/board/sold/
Disallow:/service/board/hongbo/
Disallow:/service/mypage/   /service/message/   /service/popup/
Disallow:/service/search/   /service/search*    /service/cs/
Disallow:/service/recommend
Disallow: /*?*
```

⚠️ 곁다리 발견: `Disallow: /*?*` 는 **게시판 글에는 안 걸린다.** 최장 일치상
`Allow:/service/board/`(20자)가 `Disallow: /*?*`(4자)를 이긴다. 표준대로 판정하면
`?po=2` 가 붙은 글도 허용이다. 어댑터는 사이트 의도를 따라 기계 판정보다 **더
엄격하게** 쿼리형 ref 를 거부한다. 이 차이는 감추지 않고
`scripts/review-robots-selftest.mjs` 에 단정문으로 적어 뒀다.

### 🔴 정정 2 — 에펨 마커−앵커 차액은 파싱 실패가 아니라 댓글 페이지네이션이다

초안: "댓글이 일부만 정적이면(마커>앵커) 차액을 parseFailures 로 세라."

실측 3건:

| 글 | 마커 | 고유 앵커 | `window.document_cpage` |
|---|---|---|---|
| `/best/10342734564` | 177 | 79 | **2** (2/2) |
| `/best/10341287419` | 77 | **77** | **없음** (단일 페이지) |
| `/best/10342191474` | 53 | 5 | **2** (2/2) |

댓글 목록 뒤에 `<div class="bd_pg clear">` 페이저가 있고, 글 페이지는 **마지막
댓글 페이지를 기본으로 렌더**한다. 차액 98건·48건은 "못 읽은 것"이 아니라 "다른
페이지에 있는 것"이다. 초안대로 세면 멀쩡한 파서가 글 하나당 98건씩 실패를 찍어
건강도 지표가 무의미해진다 — §7.1 을 반대 방향으로 어기는 셈이다.

가르는 신호가 HTML 에 이미 있다:

- `document_cpage` **없음** = 단일 페이지 → 마커 ≠ 고유앵커면 그 차액이 parseFailures
- `document_cpage` **있음** = 페이지 N/M → 차액은 세지 않고, 아래 "한계"로 기록
- 마커도 앵커도 0 = 댓글 영역 소실 → parseFailures++ (양쪽 공통)

변이 테스트로 두 분기가 각각 다른 검사를 깨뜨리는 것을 확인했다(`paginated` 를
상수 `false`/`true` 로 바꾸면 서로 다른 단정문이 실패한다).

### 🔴 정정 3 — 브런치 `articleBody` 는 5,000자에서 잘린다

초안: "실측상 4,529자 전문이 안 잘려 온다."

실측 2건:

- `/@brunch/431` — `articleBody` 2,886자, 온전히 끝남
- `/@brunch/430` — `articleBody` **정확히 5,001자**, 말미가 `…다른 공모전…`.
  같은 문구가 같은 문서의 하이드레이션 블롭에 12회 더 나오고 그 뒤로 본문이 계속됨

→ **5,000자 + `…` 절단이 확정**이다. "4,000자까지 절단 없음"은 참이지만 "절단
없음"은 거짓이다. damoang 이 JSON-LD 200자 상한을 감수한 선례대로 이 천장도
감수하고 `ponytail:` 주석으로 명시했다. 전문은 하이드레이션 블롭을 파싱해야
하는데 훨씬 잘 깨진다. 셀프테스트가 `articleBody.length === 5001` 과 말미 `…` 를
단정하므로, 브런치가 상한을 바꾸면 검사가 깨져 사람이 안다.

### 확정 셀렉터

**브런치** — JSON-LD 2블록(`Organization` + `BlogPosting`). 순서가 바뀔 수 있어
전부 훑는다.

- 본문 `BlogPosting.articleBody` · 제목 `.headline`
- 작성일 `.datePublished` = `"2026-09-07T01:00:24+09:00"` — **KST 오프셋 ISO**다.
  epoch ms 가 아니라 앞 10자가 곧 KST 날짜다(`Intl` 불필요). 초안의 UTC 밀림
  우려는 해당 없음.
- 글 경로가 `/@핸들/번호` 라 공용 `parseUrlRef()` 의 `@` 차단에 항상 걸린다.
  공용 함수를 완화하면 damoang·82cook·theqoo 의 userinfo 차단까지 풀리므로,
  브런치만 `^/@[A-Za-z0-9_-]+/\d{1,10}$` 화이트리스트로 자체 검증한다.
- robots `*` 그룹에 **`Crawl-delay: 5`** 가 있다. `robots.ts` 는 Crawl-delay 를
  파싱하지 않으므로 이 지연을 지키는 유일한 장치가 DB 의 `min_interval_ms=5000` 이다.

**클리앙**

- 제목 `class="post_subject" … <span>제목</span>`
- 본문 `<div class="post_article" >` — 안에 `<html><body>` 를 통째로 품는다.
  비탐욕 정규식으로 자르면 앞에서 끊기므로 `sliceDiv`(div 짝 세기)를 쓴다.
- 글 작성일 `<span class="view_count date">… 2026-09-16 23:34:27</span>` (절대시각)
- 댓글 수 마커 `댓글 • [<strong>17</strong>]` — 0건인 글에도 `[0]` 으로 남는다
- 댓글 앵커 `<div class="comment_row …" data-role="comment-row" data-comment-sn="152397724">`
  → **고유 id 있음**. composite 폴백 불필요.
- 댓글 본문 `<div class="comment_view" data-comment-view="…">`
- 댓글 작성일 `<span class="timestamp">2026-09-16 23:37:50` — **4자리 연도 있음**.
  다모앙과 달리 댓글 writtenAt 을 채운다(화면 표기 `26-09-16` 말고 이쪽을 읽는다).
- 페이저 없음. 실측 3건 전부 마커 == 고유앵커(0/0, 7/7, 17/17).

**에펨코리아** (JSON-LD 0개)

- 제목 `<h1 class="np_18px"><span class="np_18px_span">…</span>`
- 글 작성일 `<span class="date m_no">2026.09.16 23:17</span>` (절대시각)
- 본문 `<div class="document_<문서srl>_<멤버srl> xe_content">`
- 댓글 수 마커 `title="댓글 보기/숨기기">댓글 <b>177</b> 개`
- 댓글 앵커 `<li id="comment_10342883096" class="fdb_itm …">`.
  ⚠️ **BEST 댓글이 중복 등장**하고 그때만 id 끝에 `_` 가 붙는다
  (`comment_10342859374_`). 실측: 마커 77 · 앵커 81 · 고유 77. id 숫자로 접지
  않으면 같은 댓글이 두 번 적재된다.
- 댓글 본문 `<div class="comment_<댓글srl>_<멤버srl> xe_content">`
- 댓글 작성일 `<span class="date">9 분 전</span>` — **전부 상대시각**(79/79).
  역산하면 재수집마다 값이 달라지므로 writtenAt 은 null.
- robots `*` 그룹: `Disallow: /` → `Allow: /$ /best /best2 /humor`.
  최장일치로 `/best/…` 는 허용(`Allow: /best` 5자 > `Disallow: /` 1자).
  `/8123456` 같은 XE 기본 주소는 금지 대상이라 ref 단계에서 거부한다.

### 알려진 한계 (감추지 않는다)

- **브런치 본문은 5,000자가 천장이다.** 그 이상은 잘린 채 저장된다.
- **브런치 댓글은 하나도 안 들어온다.** `/api/` 가 robots 금지다. 커뮤니티 VOC
  로서 값이 절반이고, 이건 고칠 수 있는 버그가 아니라 규칙이다.
- **에펨 댓글은 마지막 페이지만 온다.** 177건짜리 글에서 79건만 수집된다.
  페이지네이션으로 메우려면 `?cpage=N` 을 만들어야 하는데, 러너가 쿼리를 robots
  판정에 안 넘긴다(SP-026). 러너 수정이 선행돼야 한다.
- **클리앙 규칙을 우리가 못 읽는다.** 방어가 `clien.ts` 의 `parseProductRef`
  한 곳에 몰려 있다. 그 함수를 넓히는 변경은 robots 재실측을 동반해야 한다.
- **세 소스 다 `enabled=false` 로 등록한다.** 켜는 것은 사람이 한다.

---

## 댓글 AJAX 재실측 round-4 — theqoo · todayhumor (2026-09-17)

round-2 는 두 소스를 "댓글이 AJAX 라 본문 전용"으로 닫았다. 그 AJAX 를 직접
실측했다. **결론이 둘로 갈렸다: todayhumor 는 붙였고, theqoo 는 못 붙인다.**
못 붙이는 이유가 사이트 쪽 제약이 아니라 **우리 요청 계약의 한계**라 따로 적는다.

| | 댓글 API | 인증 | 우리 계약으로 가능한가 | 결과 |
|---|---|---|---|---|
| todayhumor | `GET /board/ajax_memo_list.php?…` | 불필요(콜드 200) | ✅ | 1글=2요청으로 구현 |
| theqoo | `POST /index.php` (JSON body) | 세션 쿠키 + Referer | ❌ | 보류 — 본문 전용 유지 |

### theqoo — 되는 건 확인했는데, 어댑터가 그 요청을 만들 수 없다

실측(2026-09-17):

```
POST https://theqoo.net/index.php
Content-Type: application/json
Cookie: PHPSESSID=… ; rx_login_status=none      ← 글 페이지 GET 으로 먼저 받는다
Referer: https://theqoo.net/square/<id>
{"act":"dispTheqooContentCommentListTheqoo","document_srl":"<id>","cpage":"1"}
→ 200 {"comment_list":[{"srl":…,"ct":"<html>","rd":"20260916232553",…}], "now_comment_page":1}
```

- 로그인은 필요 없다. 비회원 세션으로 실데이터가 온다.
- 쿠키·Referer 없이 POST 하면 `{"errorDetail":"ERR_CSRF_CHECK_FAILED","error":-1}`.
- 쿠키를 피하는 우회로는 없었다. 같은 act 를 GET 으로 부르면 301 → 글 페이지
  HTML 이고, form-encoded POST 도 글 페이지 HTML 이다(둘 다 실측).
- 사이트 정책: 작성 1시간 이내 댓글은 비회원에게 플레이스홀더로 온다. 이건
  파싱 실패가 아니라 정책이다 — 구현하게 되면 스킵하되 실패로 세지 마라.

**막힌 지점은 세 군데이고 전부 공용 코드다:**

1. `ReviewSourceAdapter.nextRequest()` 반환형이 `{ url }` 뿐이다 — method·body·
   headers 를 실을 자리가 없다.
2. `RunnerPorts.fetchText(url)` 은 GET 전용이고 헤더가 고정이다
   (`scripts/review-collect.mjs`).
3. `FetchOutcome` 에 **응답 헤더가 없다.** `Set-Cookie` 가 `parse()` 에 닿지
   않으므로 "1차 응답의 쿠키를 커서에 실어 2차로 넘긴다"는 우회도 성립하지 않는다.

즉 커서 메커니즘만으로는 풀 수 없다. 요청 계약을 넓히는(POST·헤더·응답 헤더)
변경이 선행돼야 하고, 그건 소스 하나를 위해 러너 전체의 표면을 넓히는 일이라
사람이 판단한다. 그때까지 theqoo 는 **본문 전용**이고 댓글 0건은 고장이 아니다.

### todayhumor — 붙였다. 함정은 인증이 아니라 **가짜 별칭**이었다

```
GET https://www.todayhumor.co.kr/board/ajax_memo_list.php
    ?parent_table=sisa&parent_id=1271155&last_memo_no=0&get_all_memo=Y
→ 200 {"is_more_memo":"false","memos":[{"no":"…","is_system":false,"is_del":false,
       "date":"2026-09-11 10:58:43","name":"…","memo":"<html>","ip":"…"}]}
```

- 쿠키·헤더가 전혀 필요 없다. 콜드 상태로 200 이다.
- 🔴 **베스트/베오베 글의 URL 값은 가짜다.** `table=bestofbest&no=483825` 인 글의
  실제 댓글은 `parent_table="sisa"` · `parent_id="1271155"` 에 달려 있다.
  별칭을 그대로 넣으면 **에러 없이** `{"is_more_memo":"true","memos":[]}` 가 온다
  (실측). 200 이고 JSON 이고 에러 필드도 없다 — 로그로는 "댓글 없는 글"과
  구분되지 않는다(§7.1 그 자체).
- 원본 값은 글 페이지의 인라인 스크립트에 있다: `var parent_table = "sisa";`.
  그래서 본문 파싱이 이 값을 함께 읽어 커서(`memo:<table>:<id>:<댓글수>`)에 싣고,
  2차 요청이 그 커서로만 만들어진다. 커서 형식은 정규식으로 검증한다 — 값이
  URL 쿼리가 되므로 DB 를 거쳐 온 커서도 신뢰 경계 밖이다.
- **탐지기**: 본문의 개수 마커(`<div>댓글 : 5개</div>`)와 실제 수집 건수를 대조해
  차액을 `parseFailures` 로 센다. 별칭을 잘못 넣으면 선언된 전부가 실패로 잡힌다.
  마커가 아예 없으면 그것도 실패다(0건으로 접지 않는다).
- `is_system:true` 는 게시판 이동 기록(`"memo":"MOVE_BESTOFBEST/483825"`)이지
  사용자 댓글이 아니다. 개수 마커에도 안 들어간다(실측: 총 7 = 사용자 5 + 시스템 2).
  `is_del:true` 와 함께 버린다.
- `ip` 는 사이트가 마스킹해서 주지만(`119.65.***.168`) `authorMasked` 에 쓰지
  않는다. 기존 원칙대로 작성자 정보는 담지 않는다.

### 알아 둘 것

- **todayhumor 는 이제 1글=2요청이다.** 같은 `daily_request_cap` 이 사 주는 글
  수가 절반이다. 켤 때 상한을 다시 보라(지금은 `enabled=false`).
- 중간 상태(`review_targets.cursor = memo:…`)는 2차 요청 대기를 뜻한다. 잡이
  죽어도 다음 실행이 거기서 이어받는다 — 고장이 아니다.
- 댓글 페이지네이션(`last_memo_no`)은 스트레스 테스트하지 않았다. `get_all_memo=Y`
  가 한 번에 전부 준 표본(7건)까지만 확인했다. 아주 긴 글에서 잘리면 개수 마커
  대조가 그 차액을 실패로 찍는다 — 조용히 누락되지는 않는다.
- 삭제 댓글이 개수 마커에 포함되는지는 **확인하지 못했다**(표본에 삭제 건이
  없었다). 포함된다면 삭제 댓글이 있는 글마다 오경보가 난다. 그때는
  `todayhumor.ts` 의 `seen` 집계에 `is_del` 을 다시 넣어라.

## todayhumor — 폐기(dead) 확정 (2026-09-25, 남헌)

- 이력: 2026-09-24 11:36 UTC 첫 차단(403/429 1건, 러너 자동 비활성) → 2026-09-25 마이그 000017 로 재활성화 → 직후 수동 수집(run 36136401877)에서 **첫 요청부터 403** → 러너 자동 재차단(12:42 UTC) → 마이그 000019 로 폐기 표기.
- **폐기 사유: IP 레벨 차단. 우회 정책상 불가(IP/UA 스푸핑 금지 원칙 위반).** `scripts/review-source-probe.mjs` 규칙 2·3(UA 위장·IP 로테이션·프록시 없음)이 그 원칙이다.
- 표기 패턴: 네이버 계열과 같다 — `review_sources.enabled=false` + `disabled_reason` 첫머리 "폐기(dead)". 별도 상태 컬럼은 없다. `health='broken'` 은 마지막 실측값 그대로.
- 되살리려면 000017 을 다시 적용하면 되지만, 같은 IP 대역(GitHub Actions)에서는 같은 결과가 난다. 되살릴 이유가 생기면 로컬(가정 IP)에서 1회 프로브부터.
