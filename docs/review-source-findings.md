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
러너도 같게 판정한다 — `lib/review/runner.ts` 의 `RobotsCache` 가
`status === null || >= 500` 만 `unreadable` 로 두고 4xx 는 빈 규칙으로 처리한다.
셀프테스트가 이 404 경로를 재현해 둔다(여기가 막히면 수집이 통째로 0건이다).

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

사이트의 의도는 "`.json` 은 허용, 나머지는 금지"로 읽힌다. 그런데 **이 리포의
`lib/review/robots.ts` 는 와일드카드(`*`)와 끝 앵커(`$`)를 구현하지 않는다.**
경로 규칙을 문자열 접두사로만 비교한다. 그래서 실제 판정은 이렇게 나온다:

```
robotsVerdict(groups, '/v0/item/49628981.json', 'solutionarchive-review-collector')
  → { allowed: false, reason: 'Disallow: /' }
```

`/*.json$` 은 `/v0/...` 의 접두사가 아니라 매칭되지 않고, `Disallow: /` 만
남아서 **금지**가 된다. 우리 자신의 안전장치가 이 호스트를 막고 있다.

그래서 2단계를 구현하지 않았다. 뚫고 지나가지 않는다.

#### 여기서 같이 발견한 것 — 기존 소스에도 영향이 있다

이건 HN 만의 문제가 아니다. `robots.ts` 가 `*` 와 `$` 를 안 읽는다는 것은
**와일드카드로 쓴 `Disallow` 규칙을 우리가 지금 하나도 안 지키고 있다**는
뜻이기도 하다. 예를 들어 `Disallow: /*?sort=` 나 `Disallow: /*.pdf$` 같은
규칙은 어떤 경로와도 매칭되지 않아 조용히 무시된다. RFC 9309 §2.2.2 는 둘 다
필수로 정한다.

이번 방향(과하게 막힘)보다 **반대 방향(막아야 할 걸 안 막음)이 위험하다.**
다만 `robots.ts` 는 리뷰 수집 트랙 전체의 안전장치라 이번 브랜치에서 손대지
않았다. 별도 판단이 필요하다.

> #### ⚠️ 2026-09-16 정정 — 위 337~361행은 더 이상 사실이 아니다
>
> ~~`lib/review/robots.ts` 는 와일드카드(`*`)와 끝 앵커(`$`)를 구현하지 않는다.~~
> **구현했다.** SP-018 이 `fix/robots-wildcard` 로 수정했고, 그 결과 appstore 가
> Apple robots.txt 위반 상태였음이 드러나 `enabled=false` 가 됐다(SP-019/021).
> 위 문단은 수정 **이전** 시점의 기록이다. 근거를 찾아 이 파일을 읽는 사람이
> "우리는 와일드카드를 안 지킨다"로 오독하지 않도록 남긴다.
>
> 2026-09-16 실측(다모앙 실제 robots.txt 를 `parseRobots`→`robotsVerdict` 에 통과):
> ```
> /free/7341567         => allowed=true   reason='Allow: /'
> /free/7341567?page=2  => allowed=false  reason='Disallow: /*?page='
> /admin/x              => allowed=false  reason='Disallow: /admin/'
> ```
> `*` 매칭이 정상 동작한다.
>
> **다만 진짜 구멍은 따로 있다(아래 §커뮤니티 소스 실측 참조):** 호출부가
> 쿼리스트링을 넘기지 않아, 위 2행 같은 쿼리 대상 규칙은 실제 수집 경로에서
> 영영 매칭되지 않는다. 와일드카드 구현 여부와 무관한 별개 결함이다.

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
