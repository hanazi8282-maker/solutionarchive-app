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

### 남헌 2026-09-10 결정 — Algolia HN Search API evidence_grade=B로 확정

Algolia HN Search API(`hn.algolia.com/api`) 자체는 이용약관 문서가 없다(§ 위
Firebase 항목과는 별개 호스트). 확인한 건 "명시적 상업이용 금지 문구가 없다"는
것뿐이지 "명시적으로 허용됐다"가 아니다. 그래서 이 판단은 `evidence_grade=B`
(3자·정황 근거, 1차 출처의 명시적 확인 아님)로 취급하고, `review_sources`에
`enabled=false`로 등록해 사람이 켜야 실제 수집이 시작되게 했다(마이그레이션
`20260910000001_hackernews_source.sql`). Tier4(G2/Capterra — 이용약관 원문에
스크래핑 금지가 명시된 경우)와는 확인의 강도가 다르다는 걸 여기 남긴다.

---

## 3차 소스 실측 — VOC 수집 확장 (2026-09-16)

측정: 로컬(한국 가정용 IP). UA 는 `solutionarchive-review-probe/0.1` 로 정직하게
밝혔고, 우회·재시도·IP 로테이션 없음. 재현 명령은 각 절에 적었다.

### 🔴 먼저 — 이 절에서 **확인하지 못한 것**

**네이버·YouTube·Reddit 세 API 의 응답 본문(필드·스니펫·정렬)을 실측하지 못했다.**
세 소스 전부 자격증명이 있어야 본문이 오는데, 이 리포에도 `.env.local` 에도 키가
없다(2026-09-16 확인: `NAVER_CLIENT_ID` · `YOUTUBE_API_KEY` · `REDDIT_CLIENT_ID`
전부 미등록). 키 발급은 사람이 계정으로 해야 한다.

확인한 것은 **핸드셰이크까지**다 — 엔드포인트가 살아 있고, 인증을 요구하며, 그
거절이 어떤 형태로 오는가. 그 이상을 적으면 §7.1 위반이다.

```
$ curl -sS "https://openapi.naver.com/v1/search/blog.json?query=무선이어폰&display=3&sort=date"
HTTP 401
{"errorMessage":"Not Exist Client ID : Authentication failed. (인증에 실패했습니다.)","errorCode":"024"}

$ curl -sS "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=dQw4w9WgXcQ&order=time&maxResults=3"
HTTP 403
{"error":{"code":403,"message":"Method doesn't allow unregistered callers (callers
 without established identity). Please use API Key or other form of API consumer
 identity to call this API.","errors":[{"reason":"forbidden"}],"status":"PERMISSION_DENIED"}}

$ curl -sS -X POST -d grant_type=client_credentials "https://www.reddit.com/api/v1/access_token"
HTTP 401
{"message": "Unauthorized", "error": 401}
```

세 응답 다 **"엔드포인트는 살아 있고 인증만 없다"**는 뜻이다. 차단이 아니다
(차단이면 본문이 차단 페이지거나 캡차다 — 아래 커뮤니티 절의 ConsumerAffairs 와
비교하라).

**키가 생기면 실측은 한 줄이다.** 그 줄을 위해 프로브에 모드를 하나 붙여 뒀다:

```
node --env-file=.env.local scripts/review-source-probe.mjs --mode=apis3
```

출력이 필드 목록 · `description` 글자 수 · 작성일 필드 유무 · `after` 커서 ·
"댓글 배열이 있는가"를 그대로 찍는다. 그 출력을 이 절 아래에 붙이면 실측이 끝난다.

그래서 **세 소스 전부 `review_sources.enabled=false` 로 등록한다.** 어댑터·픽스처·
셀프테스트는 다 있지만 응답 구조는 공식 문서 기준이고 실물로 대조하지 않았다.
켜는 것은 대조 다음이다.

### ⚠️ 네이버 `description` 은 스니펫이다 — 글자 수는 **미측정**

네이버 검색 API 의 `description` 은 질의어 주변을 잘라 준 요약이고 본문 전체가
아니다. 그런데 **그 길이를 이번에 숫자로 재지 못했다**(위 사유). 짐작한 숫자를
적으면 그게 나중에 "실측값"으로 인용된다.

대신 코드가 이 사실을 데이터에 박는다 — 적재 본문 접두가
`[네이버 블로그 검색 스니펫 · <link>]` 다. "짧은 글"과 "잘린 글"은 다른 사건이고,
분석 단계가 그걸 모르면 "고객이 짧게만 말한다"는 엉뚱한 결론이 나온다.

측정되면 여기에 `description 글자 수: N (원문 대비 M%)` 로 적는다.

### ⚠️ `naver_cafe` 작성일 필드 — 공식 문서상 **없음**, 실측 확인 불가

네이버 검색 API 문서 기준 `cafearticle` 응답 필드는 `title` / `link` /
`description` / `cafename` / `cafeurl` 이다. **작성일이 없다.** (블로그는
`postdate` 가 있다. 지식iN 은 `title`/`link`/`description` 뿐이다.)
단 이것도 문서 기준이지 실측이 아니다 — 위 사유.

작성일이 없으면 무슨 일이 일어나는가(§7.2 — 안전장치가 걸린 걸 정상으로 읽지 마라):

- 러너의 증분 종료(연속 STALE 5건)는 `writtenAt` 비교로 돈다. 전부 `null` 이면
  STALE 판정이 한 번도 참이 되지 않는다.
- 그래서 **매 실행이 1페이지부터 다시 훑는다.** 증분이 성립하지 않는다.
- 다만 지문(`externalId = link`)이 중복을 잡으므로 **재적재는 없다.**
- 그리고 `MAX_PAGES_PER_TARGET`(20) 에서 멈춘다. 폭주하지 않는다.
- 즉 낭비는 **실행당 요청 20건**이고 데이터는 오염되지 않는다.

이 사실을 모른 채 "매일 도는데 신규 0건"만 보면 조용한 실패로 오진한다.
`naver_cafe` 의 `disabled_reason` 에 같은 내용을 적어 뒀다.

### ⚠️ Reddit `/search` 응답에 **댓글이 없다** — 원 요청과 범위가 다르다

원 요청은 "불만 **댓글** 밀도"였다. 그런데 `/search` 가 주는 것은 `Listing` 안의
`t3`(링크/셀프포스트) 객체들이고, 각 항목은 `title` + `selftext` 다. 댓글은
포스트마다 `/comments/<id>` 를 따로 불러야 하고, 그러면 **포스트 1건당 요청 1건**
이라 일일 상한이 순식간에 마른다(HN 에서 Firebase 상세조회를 안 붙인 것과 같은 이유).

→ **이번 범위는 포스트 본문까지다.** 댓글은 다음 라운드의 별도 설계다.
어댑터 상단 주석에도 같은 문장을 박아 뒀다.

실물 대조는 위 `--mode=apis3` 출력의 "댓글 배열이 있는가" 줄이 한다(자격증명
확보 후). 그 전까지는 **공식 문서 기준 판정**이다.

### 🟡 티스토리 robots.txt 재실측 — 판정: **혼합(호스트를 갈라야 한다)**

앞선 세션의 "404" 기록이 무엇이었는지 다시 쟀다. 상태 코드와 본문을 같이 봤다.

```
$ curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" https://www.tistory.com/robots.txt
404 text/html; charset=utf-8 23430

$ curl -sS https://www.tistory.com/robots.txt | grep -o 'not-found'
not-found      ← Next.js not-found 청크. 즉 SPA 라우팅 폴백 본문이다
```

판정: **진짜 404 다**(상태 코드가 404 이고, 200 에 오류 페이지를 실어 보내는
형태가 아니다). 다만 본문은 robots.txt 가 아니라 Next.js not-found 페이지다.
`https://tistory.com/robots.txt` 는 301 로 www 로 보낸다.

**그런데 이게 중요한 판정이 아니다.** 티스토리 글은 `www.tistory.com` 이 아니라
**블로그별 서브도메인**에 있고, 거기엔 robots.txt 가 실제로 있다:

```
$ curl -sS https://sunday-life.tistory.com/robots.txt      # HTTP 200, 185 bytes
User-agent: *
Disallow: /guestbook
Disallow: /m/guestbook
Disallow: /manage
Disallow: /owner
Disallow: /admin
Disallow: /search        ← ⚠️ 검색 경로 금지
Disallow: /m/search

User-agent: bingbot
Crawl-delay: 20
```

→ **글 본문 경로는 허용, 검색 경로(`/search`)는 금지.** 수집기는 "키워드로 찾아
들어가는" 구조라 진입 경로가 막힌 셈이다. 게다가 대상 호스트가 블로그마다 달라서
robots 를 블로그 수만큼 조회해야 한다(러너의 호스트별 캐시가 무의미해진다).

결론: **이번 범위에서 티스토리는 채택하지 않는다.** "확인 불가"가 아니라
"확인했고, 진입 경로가 막혔다"이다.

### 🟡 Threads `keyword_search` 스코프 — 판정: **확인 불가** (그리고 붙이지 않는다)

기존 발행용 토큰으로 **읽기 1회**만 했다.

```
$ curl -sS -D - "https://graph.threads.net/v1.0/keyword_search?q=earbuds&search_type=TOP&access_token=<발행용 토큰>"
HTTP/1.1 500 Internal Server Error
threads-api-version: v1.0
debug-link: https://www.meta.com/debug/?mid=58ad1c5e253bf9c53846867a52f402df
Content-Length: 0
```

OAuth 스코프 오류(`OAuthException`)가 **아니다.** 본문이 아예 비어 있는 500 이라
"스코프가 없다"도 "있다"도 말할 수 없다. **확인 불가**로 적는다.

그리고 이 결과와 **무관하게 워크플로에 붙이지 않았다.** 무인 루프 환경에 발행
가능한 토큰이 없는 것은 정책이 아니라 **구조**다(CLAUDE.md §10.1).
`keyword_search` 를 쓰려면 그 구조를 바꿔야 하고, 그건 이 PR 범위 밖이다.
워크플로 env 에 `THREADS_ACCESS_TOKEN` 이 없다는 것을 YAML 파서로 확인해 뒀다.

### 커뮤니티/포럼 8곳 실측 — robots 만으로 채택하지 않았다

robots 가 허용이어도 **리뷰/댓글 본문이 정적 HTML 에 있는지**까지 봐야 채택이다.
다나와가 채택된 이유가 그것이고, 글로우픽이 탈락한 이유도 그것이다.

| 소스 | robots | 실제 응답 | 본문 정적 | 판정 |
|---|---|---|---|---|
| 퀘이사존 `quasarzone.com` | `Allow: /` 지만 **`/comments/*`·`/*/comments*`·`/getComment/*` 금지** | 200 | 글 본문 `class="view-content"` 정적 확인 | 🟡 **본문만 가능.** VOC 의 알맹이인 댓글이 robots 로 막혔다 |
| 뽐뿌 `ppomppu.co.kr` | `Allow: /zboard/` | **403 (nginx)** | — | ❌ 탈락. 정직한 UA 를 서버가 거부한다. 위장하지 않는다 |
| 루리웹 `bbs.ruliweb.com` | `/search`·`/member` 외에 **`/*view=`·`/*cate=`·`/*orderby=` 등 와일드카드 다수 금지** | 200 | 본문·댓글(`comment_element` 11건) 정적 확인 | 🟡 read 경로는 열려 있으나 목록/정렬 진입이 쿼리형이라 막힌다. 아래 ⚠️ 참조 |
| ConsumerAffairs | 계정·광고 경로만 금지 | **403 + PerimeterX 캡차**("Press & Hold to confirm you are a human") | — | ❌ 탈락. 우회하지 않는다 |
| PissedConsumer | 관리 경로만 금지 | 404 ×3 (진입 URL 을 못 찾음) | — | 🟡 **확인 불가.** 브랜드 페이지 URL 규칙을 사람이 확인해야 다시 잰다 |
| 다모앙 `damoang.net` | `Allow: /` (admin/api 만 금지) | 200 | **댓글 12건**(`comment-body`) 정적 확인 | ✅ 유망 — 다음 라운드 구현 후보 1순위 |
| 파우더룸 `powderroom.co.kr` | `Allow: /` (작성 폼만 금지) | 200 (Next.js SSR, 가시 텍스트 3,305자) | 리뷰 **목록** 텍스트는 SSR 로 옴. 개별 리뷰 상세 링크 패턴을 못 찾음 | 🟡 추가 실측 필요 |
| 82cook `82cook.com` | 임시 경로만 금지 | 200 | 본문 `id="articleBody"` + 댓글(`class="rp"` 88건) 정적 확인 | ✅ 유망 — 다음 라운드 구현 후보 |

**이번 라운드에서 이 8곳의 어댑터는 만들지 않았다.** 실측까지만 하고 멈춘 것이
의도다 — 부실하게 8개를 만드는 것보다 낫다.

#### ⚠️ 여기서 같이 드러난 위험 — robots.ts 의 와일드카드 미구현(SP-018)

퀘이사존과 루리웹의 금지 규칙은 **전부 와일드카드**다(`/*/comments*`, `/*view=`).
그런데 이 리포의 `lib/review/robots.ts` 는 `*` 와 `$` 를 구현하지 않고 경로를
접두사로만 비교한다. 즉 **저 금지 규칙들을 우리 러너는 하나도 못 읽는다.** 지금
어댑터를 붙이면 "robots 허용"으로 판정하고 금지 경로를 긁는다.

이 두 소스는 그래서 **와일드카드 구현이 선행되지 않으면 만들면 안 된다.**
SP-018 이 "오탐 가능"이라고만 적어 둔 것의 구체적인 피해 지점이 여기다.

### 약관 원문 — 저장·재가공 조항 (직접 확인, 2026-09-16)

**네이버 오픈API 이용약관** (`developers.naver.com/products/terms/`, 금지행위 조항):

> ③ API서비스를 이용하여 취득한 정보(네이버 회원의 계정 관련 정보, 네이버 서비스의
> 컨텐츠 내용 등 일체의 데이터를 포함한다)를 다음의 예시와 같이 **본 약관에서 허용한
> 범위를 넘어서서 무단으로 복제, 저장(캐시 행위 포함), 가공, 배포 등 이용**하거나
> 제3자에게 제공하는 행위
>
> 기타 각 API의 제공 취지나 목적에 맞지 않게 API 제공 정보를 저장하거나 이용하는 행위

→ 우리 파이프라인은 `description` 을 `analysis_inputs` 에 저장하고 LLM 으로
가공한다. "허용한 범위"가 어디까지인지는 약관 본문만으로 단정할 수 없다.
**사람 판단 필요.**

**YouTube API Services Developer Policies**
(`developers.google.com/youtube/terms/developer-policies`, §III.E.4.d):

> API Clients may temporarily store limited amounts of Non-Authorized Data for as long
> as is necessary for the purposes of the API Client but **not longer than 30 calendar
> days**. … after 30 calendar days, the API Client must either delete or refresh the
> stored data.

같은 문서의 파생 데이터 조항:

> Your API Clients must not (i) replace API Data with similar, independently calculated
> data, or (ii) **access or use API Data to create new or derived data or metrics.**

→ 30일 제한은 우리 보존 기간(`lib/review/purge.ts` `RETENTION_DAYS = 30`)과 같다.
**단 폐기 배치가 실제로 `--apply` 로 돌고 있어야 충족된다**(기본값은 dry-run,
`REVIEW_PURGE_APPLY` 로 켠다). 파생 데이터 조항은 우리 추출 단계와 정면으로
겹친다. **사람 판단 필요.**

**Reddit Data API Terms** (`redditinc.com/policies/data-api-terms`):

> you will not … **use or retain any User Content, Materials, or data accessed through
> the Data APIs beyond your approved use case, and you must immediately delete any data
> not required for it**

> sell, lease, or sublicense the Data APIs … or **derive revenues from the use or
> provision of the Data APIs**, whether for direct commercial or monetary gain unless
> there is express written approval from Reddit

> Except as expressly permitted by this section, no other rights or licenses are granted
> or implied, including any right to use User Content for other purposes, such as for
> **training a machine learning or AI model**, without the express permission of
> rightsholders in the applicable User Content.

> Upon any termination … you will **immediately stop using the Data APIs, delete any
> cached or stored User Content** … This includes any data or models that were derived
> from User Content and Materials that were accessed from the Data APIs.

→ 상업적 이용은 별도 계약이 필요하다고 원문에 있다. SP-005(GummySearch 셧다운)가
바로 이 조항의 결과다. 남헌이 리스크를 인지한 상태에서 진행을 결정했다(SP-024).
