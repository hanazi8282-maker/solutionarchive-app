# VOC 소스 실측 round-5 B군 — 개발자·SaaS·글·영상·해외 13곳 (2026-09-18)

CEO-STAFF 발주(남헌 2026-09-18 지시)의 **조사 단계 B군**이다. **어댑터를 구현하지
않았다.** `review_sources` 에 행을 넣지 않았고, 마이그레이션 파일도 만들지 않았다.
판정만 적는다.

방법론은 `docs/review-source-findings.md` 와 같다 — robots 는 이 리포의 RFC 9309
파서(`lib/review/robots.ts`)로 읽고, 허용일 때만 요청하고, 상태 코드가 아니라
**기대하는 내용의 표지**로 판정했다. UA 위장·프록시·재시도·우회는 하지 않았다.
이용약관은 robots 와 별개로 **전문을 찾아 글자 수와 함께** 확인했다(디시인사이드
선례 — robots 는 열려 있었는데 약관이 막았다).

## 측정 조건

| 항목 | 값 |
|---|---|
| egress | `119.202.84.158` (한국 가정용) — ⚠️ **Actions 러너(Azure)에서 재측정하지 않았다** |
| User-Agent | `solutionarchive-review-probe/0.1` — 위장 없음 |
| 규칙 | robots 선판정 · 같은 호스트 4초 간격 · 재시도 0 · 프록시/IP 로테이션 없음 |
| 총 요청 | 84건 (robots 20 · 사이트맵 12 · 콘텐츠 24 · 약관 14 · API 6 · 기타 8) |
| robots 판정 | `parseRobots` → `robotsVerdict(path, 'solutionarchive-review-probe')` 실측 |

⚠️ **egress 가 다르다.** 1차 실측(2026-08-29)은 "차단은 IP 기반이 아니다"를
Azure·한국 가정용 양쪽으로 확인했지만, 이번 B군은 가정용 IP 하나로만 쟀다.
Cloudflare 를 태우는 곳(미디엄·킥스타터)은 데이터센터 IP 에서 **더 나빠질 수만
있다** — 즉 이번 ⛔ 판정은 뒤집히지 않는다. 반대로 ✅ 판정 3건은 Actions 러너에서
한 번 더 확인해야 한다.

## 판정표

| 후보 | robots (우리 UA) | 약관 | 본문 도달 실측 | 분류 |
|---|---|---|---|---|
| **OKKY** `okky.kr` | 200 · `/articles/*` 허용 | 6,964자 · 수집 금지 조항 **0건** | ✅ 본문 + **댓글 전문** + 작성일 (JSON-LD) | ✅ **구현 가능** |
| **벨로그** `velog.io` | 200 · 규칙 0개 | 4,193자(제1~12조 전문) · 관련 조항 **0건** | ✅ 본문 원문 마크다운 + `released_at` | ✅ **구현 가능 (본문 전용)** |
| **인프런** `inflearn.com` | 200 · `/community/reviews/*` 허용 | ⚠️ **확인 불가** (약관 페이지가 CSR, 평문 52자) | ✅ 수강평 본문·평점·작성일 (JSON-LD `Review`) | ⚠️ 선행 이슈 — 약관 확인 |
| **티스토리** `*.tistory.com` | 200 · 글 경로 허용 (3개 블로그 동일) | ⚠️ **확인 불가** (약관 경로 전부 404, kakao·daum 은 `Disallow: /`) | ✅ 본문 9,364자 + 작성일 / 댓글 0건 | ⚠️ 선행 이슈 3건 |
| **GitHub** Issues·Discussions | 해당 없음(공식 API) | ⛔ **AUP §7 용도 제한** (연구자·아카이비스트 열거) | ✅ 무인증 GET 으로 본문·댓글·`created_at` | ⚠️ 선행 이슈 — 사람의 법적 판단 |
| **디스콰이엇** `disquiet.io` | 200 · `Allow: /` | ⛔ 10,667자 · **"자동화된 수단(매크로·스크래퍼 등)으로 … 수집" 금지** | (본문 2,106자 도달함) | ⛔ 약관 금지 |
| **클래스101** `class101.net` | 200 · `/ko/products/*` 허용 | ⛔ 9,465자 · **"로봇, 스파이더, 스크레이퍼 … 데이터 마이닝" 금지** | ❌ CSR — 162KB 인데 렌더 637자, 후기 본문 0건 | ⛔ 약관 금지 + 정적 불가 |
| **탈잉** `taling.me` | 200 · `/talent/*` `/review/*` 허용 | ⛔ 37,937자 · **"스크래핑 … 상업적으로 이용" 금지** | ⚠️ `/review/<id>` 는 완벽 / 클래스 페이지는 리뷰 0건 | ⛔ 약관 금지 |
| **팟빵** `podbbang.com` | 200 · `Allow: /` | ⛔ **"서비스를 이용하여 얻은 정보를 … 영리 또는 비영리의 목적으로 복제 … 제3자에게 제공"** 금지 | ❌ CSR — `commentCount:112547` 선언, 댓글 본문 0건 | ⛔ 약관 금지 + 정적 불가 |
| **SOOP** `sooplive.co.kr` | 200 · `Disallow: /api/` | 확인 불가 (`policy.sooplive.com` DNS 실패, 약관 링크 없음) | ❌ 홈 렌더 **0자** · VOD 렌더 89자("enable JavaScript") | ⛔ 구조적 불가 |
| **미디엄** `medium.com` | 200 · `/@user/*` 허용하나 **ClaudeBot·GPTBot 등은 `Disallow: /`** | 확인 불가 (사이트 전체가 403) | ❌ **Cloudflare 403** — "You are unable to access medium.com" | ⛔ 사실상 차단 |
| **킥스타터** `kickstarter.com` | ❌ **robots.txt 자체가 403** (Cloudflare "Just a moment…") | 확인 불가 | 요청 안 함 | ⛔ 판단 불가 → 가지 않는다 |
| **틱톡** `tiktok.com` | 200 · `/@user/video/*` 허용하나 **anthropic-ai·ClaudeBot·Claude-User 등 `Disallow: /`** | ⛔ 21,735자 · **"정보를 수집하기 위하여 … 자동화된 스크립트를 이용하는 것"** 금지 | ❌ 384KB 인데 렌더 텍스트 **22자** | ⛔ 약관 금지 + 정적 불가 |

`*` 그룹 중복(화해 병합 버그)은 13곳 전부 0건이다 — 모두 `'*' 그룹 1개`였다.

---

## ✅ OKKY — B군에서 제일 좋은 결과다. 댓글까지 온다

`https://okky.kr/articles/<id>` 한 번의 GET 으로 **본문·작성일·댓글 전문·댓글
작성일·개수 마커**가 전부 온다. 이 리포가 지금까지 붙인 커뮤니티 소스
(damoang·82cook·theqoo·todayhumor·clien·fmkorea·brunch)는 **전부 댓글에서 뭔가를
잃었다.** OKKY 는 잃는 게 없다.

robots.txt(1,733B, 그룹 19개) — `*` 그룹 실측 판정:

```
ALLOW /articles/1483234        (일치하는 규칙 없음)
ALLOW /questions/1234          (일치하는 규칙 없음)
DENY  /api/v1/articles/1       (Disallow: /api/)
DENY  /users/1/articles        (Disallow: /users/*/articles)
```

곁다리로 알아 둘 것: OKKY 는 `MJ12bot`·`Bytespider`·`DataForSeoBot` 등 16개 봇을
`Disallow: /` 로 막는 한편, **`GPTBot`·`ClaudeBot`·`Claude-User`·`PerplexityBot` 은
Googlebot 과 같은 그룹에 넣어 일반 규칙만 적용한다.** AI 크롤러를 배제하지 않는다는
의사 표시로 읽힌다(미디엄·틱톡과 정반대다).

실측 원문 — `/articles/1483234` (200 · 153,635B · 렌더 1,087자), JSON-LD
`DiscussionForumPosting` 파싱 결과:

```
headline: velog 쓰시는 분들 안불편하신지요..
datePublished: 2023-12-30T15:56:12+09:00        ← KST 오프셋 ISO (brunch 와 동일)
text(본문) 길이: 240
commentCount: 3 | comment[] 길이: 3             ← 마커와 실제 건수가 일치
   - 2023-12-30T16:01:54+09:00 | 블로그 공유해주세옵~
   - 2023-12-30T16:56:55+09:00 | 기술 블로그로 velog.io 많이 보거나 사용하실 것입니다.…
   - 2023-12-30T23:39:32+09:00 | 저는 medium 써봤는데 한글이 잘 안되서 어디로 옮겨야하는가 고민중.
```

본문 발췌(렌더 텍스트에서):

> 첫 개발공부 때부터 쭈욱 velog를 써왔습니다. … 그런데 요 근래 좀 느낀게 많이
> 불편하네요. velog 서버가 불안정할때가 많은 거 같아요. 지금도 게시글 수정이
> 안되서 답답합니다..

**`commentCount` 가 곧 개수 마커다.** todayhumor 에서 "가짜 별칭"을 잡아낸 그
탐지기를 여기서는 공짜로 얻는다 — `commentCount` 와 `comment[].length` 를 대조하면
파싱 실패가 조용히 0건으로 접히지 않는다. 실측에서 3 == 3 이었다.

이용약관 `https://okky.kr/legal/terms` — **평문 6,964자**. `크롤`·`로봇`·`스크래`·
`마이닝`·`인공지능`·`재가공` **0건**. 걸릴 만한 건 두 곳뿐이고 둘 다 우리에게
해당하지 않는다:

- 자동화 조항 1건은 **업로드 방향**이다: *"OKKY의 동의 없이 자동화된 수단에 의해
  OKKY에 게시물을 업로드하거나, 업로드된 게시물 또는 광고 등의 컨텐츠에
  수정・변조・삭제 등의 영향을 끼치는 행위는 금지됩니다."* — 읽는 행위가 아니다.
- 저작권 라이선스 조항은 오히려 반대로 적혀 있다: *"… **외부 사이트에서의 검색,
  수집 및 링크 허용**을 위해서만 제한적으로 행사할 것입니다."*

**분류: 구현 가능(바로 진행).** 1글=1요청, 경로형 URL(쿼리 없음 → SP-026 무관),
작성일 있음(증분 종료 성립), 러너 GET 계약으로 충분.

알아 둘 것(구현할 때):

- 글 목록은 `https://okky.kr/sitemap.xml`(328건, 최근 글 위주)에 있다. `/api/` 가
  robots 금지라 **목록 API 를 쓰면 안 된다.**
- 댓글 `author.url` 이 `https://okky.kr/users/162597` 로 온다. 기존 원칙대로
  작성자 정보는 담지 않는다.
- `/todays-best` 는 이번 주 선정이 없어 빈 페이지였다(200 · 렌더 624자). 목록
  페이지는 CSR 이라 **글 URL 을 여기서 긁지 못한다** — 사이트맵을 쓴다.

## ✅ 벨로그 — 본문은 원문 마크다운으로 온다. 댓글은 계약 밖이다

robots.txt 가 **57바이트**고 내용이 이게 전부다:

```
# https://www.robotstxt.org/robotstxt.html
User-agent: *
```

규칙이 0개다 → `robotsVerdict` = `allowed=true (일치하는 규칙 없음)`. 금지도
초대도 아니다. 그래서 판단은 약관이 갈랐다.

이용약관 `https://velog.io/policy/terms` — **평문 4,193자**, 제1조~제12조 + 부칙
(2018.8.25)까지 **전문 확인**. `크롤`·`로봇`·`자동화`·`스크래`·`마이닝`·`수집`·
`복제` **전부 0건**. 준거법은 대한민국법.

실측 원문 — `/@taehyongi/velog-글-작성은-최고네요` (200 · 82,281B · 렌더 1,148자).
본문은 `window.__APOLLO_STATE__` 안에 **원문 마크다운 그대로** 들어 있다:

```
"Post:04227810-…":{"title":"velog 글 작성은 최고네요",
 "released_at":"2018-10-20T23:22:30.801Z","updated_at":"2026-09-08T18:27:21.215Z",
 "tags":{"type":"json","json":["velog"]},
 "body":"저는 블로그를 하는 사람은 아니지만..회사에서 저혼자 마크다운의 편리함을 부르짓다가
 문서 정리 수단으로 도입을 해봤습니다.…",
 "comments_count":2,
 "comments":[{"type":"id","id":"Comment:a3227910-…","typename":"Comment"}]}
```

브런치의 5,000자 절단 같은 천장이 없다(`body` 가 렌더 결과가 아니라 원문이다).
**대신 `released_at` 이 UTC ISO 다** — 브런치의 KST 오프셋과 달라서 KST 날짜로
바꾸려면 변환이 필요하다(`2018-10-20T23:22:30.801Z` = KST 10-21). 이 리포는
Windows `date` 가 TZ 를 무시하는 버그가 있으니 Node `Intl` 로 처리한다.

**댓글은 못 받는다.** `comments_count:2` 는 오는데 `comments` 는 **참조 id 만**이고
본문이 블롭에 없다(렌더 HTML 에도 "1개의 답글" 문구만 있다). 댓글 실물은 velog
GraphQL(`POST /graphql`)에만 있고, 그건 **러너 요청 계약 밖**이다 —
`nextRequest()` 가 `{ url }` 만 반환하고 `fetchText` 는 GET 고정이다(theqoo 가
정확히 이 이유로 본문 전용으로 남았다). `comments_count` 를 개수 마커로 쓰면
매 글이 오경보를 내므로 **쓰지 마라.**

**분류: 구현 가능(바로 진행) — 본문 전용.** 댓글 0건은 고장이 아니라 규칙이다.

## ⚠️ 인프런 — 후기 본문은 온다. 막힌 건 약관을 못 읽는 것뿐이다

**robots 는 강의·후기 경로를 막지 않는다.** 첫 판정에서 내가 틀렸고, 그걸 여기
적는다(아래 §내가 낸 검사 오류).

```
ALLOW /course/웹어플리케이션-강좌        (일치하는 규칙 없음)
ALLOW /community/reviews/158164         (일치하는 규칙 없음)
DENY  /course/lecture-something         (Disallow: /course/lecture)
DENY  /api/course/1                     (Disallow: /api)
```

도달 실측이 **두 경로 다 성립**한다.

**(a) 강의 페이지** `/course/<슬러그>?cid=18968` (200 · 1,675,583B · 렌더 16,807자).
수강평 본문이 SSR 로 HTML 안에 있다. CSS `-webkit-line-clamp:3` 으로 화면에서만
3줄로 잘리고 **텍스트는 전문**이다:

> 저는 외국인이고 항상 웹을 어디서부터 배워야하냐고 고민했었습니다. 이 강의
> 덕분에 벌써 자기 프러젝트를 시작해보렸어요. 설명이 잘 되어 있고 동기도 많이
> 있어서요~ 감사합니다~~

**(b) 후기 개별 permalink** `/community/reviews/<id>` — 이쪽이 더 깨끗하다.
쿼리 없는 경로형이고 JSON-LD `Review` 한 블록이 전부다(200 · 17,297B):

```json
{"@type":"Review","author":…,"datePublished":…,
 "itemReviewed":{"@type":"Course","name":"따라하면서 배우는 웹애플리케이션 만들기",
                 "url":"https://www.inflearn.com/course/…"},
 "reviewBody":"전반적인 웹 개발에 대해 알아볼 수 있어 좋았습니다. 정말 추천합니다.",
 "reviewRating":{"@type":"Rating","ratingValue":5,"bestRating":"5"}}
```

열거 경로도 공식으로 있다 — 사이트맵 인덱스에 **`sitemap-reviewDetail-*.xml`** 이
있다(`https://cdn.inflearn.com/sitemaps/sitemap.xml`, 19종 중 하나). 강의 페이지도
후기 permalink 5개를 직접 링크한다.

**막힌 것은 이용약관이다.** `https://www.inflearn.com/policy/terms-of-service` 는
200 · 191,643B 인데 **렌더 평문이 52자**다(제목과 상단 배너뿐). 본문이 CSR 이고
`__NEXT_DATA__` 에도 없다(i18n 문자열만 있다). `제N조` 0건, `크롤`·`스크래`
0건 — 이건 **"조항이 없다"가 아니라 "문서를 못 읽었다"**다(§7.1).

**분류: 구현 가능하나 선행 이슈 있음.**

- **선행 1 (필수)**: 이용약관 전문 확인. 자동화로는 안 된다 — 사람이 브라우저로
  열어 "크롤링·자동화·스크래핑·데이터 마이닝·상업적 이용" 조항 유무를 확인해야
  한다. 클래스101·탈잉이 **둘 다** 그 조항으로 탈락했으므로 인프런도 있을 확률이
  낮지 않다. 확인 전에는 켜지 않는다.
- **선행 2 (설계 선택)**: 수집 단위. `/community/reviews/<id>` 를 타깃으로 잡으면
  1후기=1요청이라 비싸고, 강의 페이지를 타깃으로 잡으면 1요청에 여러 건을 얻지만
  **1.6MB 를 받는다**(다나와 1.8MB 와 같은 급). 후자를 권한다.
- SP-026 관련: 강의 URL 은 `?cid=` 쿼리형이다. 인프런 robots 의 쿼리 대상 규칙은
  `/community/*?*tag=*,` 하나이고 강의 경로와 무관하므로 **지금은 안 밟는다.**
  다만 `/community/` 쪽으로 수집을 넓히면 SP-026 을 먼저 고쳐야 한다.

## ⚠️ 티스토리 — 브런치 패턴은 성립한다. 선행 이슈가 셋이다

**쟁점에 답한다: 개별 글 URL 로 본문에 정적 도달한다. 브런치와 같은 패턴이
성립한다.** 다만 브런치보다 깨지기 쉽고, 약관을 읽을 수 없다.

robots 는 블로그 호스트마다 따로 있고, **3개 블로그가 바이트 단위로 동일**했다
(185B, 플랫폼 기본값으로 보인다 — `jojoldu` == `bcho` == `mangkyu`):

```
User-agent: *
Disallow: /guestbook   /m/guestbook   /manage   /owner   /admin   /search   /m/search

User-agent: bingbot
Crawl-delay: 20
```

판정: `ALLOW /539`, `ALLOW /m/539`, `DENY /search/x`.
⚠️ **`www.tistory.com/robots.txt` 는 404 에 HTML 23KB** 다(플랫폼 본체는 규칙
없음). 글은 전부 블로그 서브도메인에 있으니 판정은 서브도메인 것으로 한다.

도달 실측 3개 블로그:

| 블로그 | 응답 | 렌더 텍스트 | JSON-LD | 본문 컨테이너 | 댓글 |
|---|---|---|---|---|---|
| `jojoldu.tistory.com/539` | 200 · 125,585B | 9,364자 | `BlogPosting` | ❌ 커스텀 스킨 | giscus(외부) |
| `mangkyu.tistory.com/88` | 200 · 87,689B | 8,176자 | `BlogPosting` | ✅ `tt_article_useless_p_margin contents_style` | ❌ AJAX |
| `bcho.tistory.com/1359` | 200 · 77,649B | — | `BlogPosting` | ✅ 같음 | ❌ React 마운트 |

본문 발췌(`jojoldu/539`):

> 작년 11월 말에 스프링 부트와 AWS로 혼자 구현하는 웹 서비스를 출판 하였습니다.
> Spring Boot가 2.1 -> 2.4로, IntelliJ IDEA가 2019 -> 2020으로 오면서 너무 많은
> 변화가 있다보니, 집필할 때와 비교해 실습에서 지속적으로 문제를 제보 받았습니다.

JSON-LD 는 **3개 블로그에서 키 구성이 동일**했다(플랫폼이 주입한다):

```
headline / datePublished:"2020-12-16T22:43:27+09:00" (KST 오프셋 ISO) /
description(406자·400자·400자) / dateModified / author / publisher
articleBody? false                       ← 브런치와 결정적으로 다르다
```

- **작성일은 플랫폼 균일이다.** 증분 종료가 성립한다.
- **본문은 플랫폼 균일이 아니다.** `articleBody` 가 없어서 브런치처럼 JSON-LD 로
  본문을 받을 수 없고, HTML 컨테이너를 잘라야 한다. 그 컨테이너가
  **스킨마다 다르다**(3곳 중 1곳이 이미 달랐다).
- **JSON-LD `description` 이 400자에서 잘린다**(406/400/400 실측). damoang 이
  JSON-LD 200자 상한을 감수한 선례처럼 **플랫폼 균일 폴백**으로 쓸 수 있지만,
  그건 요약이고 본문이 아니다.
- **댓글은 하나도 안 온다.** HTML 에는 댓글 **입력 폼**만 있고, 기존 댓글은
  `setInitialEntryComments(88, 1789642891)` 로 클라이언트가 불러온다. 다른 블로그는
  `data-tistory-react-app="Comment"` 로 React 가 마운트한다. 어느 쪽도 정적 도달
  불가 → **본문 전용**(브런치·theqoo 와 같은 자리).

**이용약관: 확인 불가.** 이건 허용이 아니다.

```
https://www.tistory.com/policy/terms   → 404 (HTML 23,191B)
https://www.tistory.com/terms          → 404
https://www.tistory.com/policy/service → 404
https://notice.tistory.com/            → 200 인데 '이용약관' 문자열 0건, 약관 링크 없음
https://www.kakao.com/robots.txt       → 200, `Disallow: /`  ← 규칙상 갈 수 없다
https://policy.daum.net/robots.txt     → 200(25B), `Disallow: /`  ← 같음
```

블로그 글 페이지에도 약관 링크가 없다. 티스토리는 카카오 계정 서비스인데
카카오·다음 정책 호스트가 **둘 다 robots 로 전면 금지**라 우리가 규칙을 지키는
한 약관 전문에 도달할 방법이 없다.

**분류: 구현 가능하나 선행 이슈 있음.** 선행 3건:

1. **약관 확인** — 사람이 브라우저로 티스토리(카카오) 서비스 약관을 열어
   크롤링·자동수집 조항을 확인해야 한다. todayhumor 선례(약관 못 찾음 →
   `enabled=false`, 켜는 판단은 사람)와 같은 자리다.
2. **멀티호스트 product_ref 검증** — 기존 어댑터는 `HOST` 가 파일 상수다
   (`brunch.ts:25` `export const HOST = 'https://brunch.co.kr'`). 티스토리는
   **글마다 호스트가 다른 첫 소스**다. `product_ref` 에 호스트를 실어야 하고,
   그러면 DB 를 거쳐 온 값이 **요청 대상 호스트를 결정**한다 — 화이트리스트
   정규식(`^[a-z0-9-]+\.tistory\.com/\d{1,9}$`)이 없으면 임의 호스트로 나가는
   구멍이다. 러너의 robots 캐시는 origin 단위라(`runner.ts` `this.groups.has(origin)`)
   호스트가 늘어도 규칙 판정 자체는 정상 동작한다.
3. **스킨 의존 본문 슬라이스의 실패 감지** — 컨테이너를 못 찾았을 때 조용히
   `description`(400자)으로 내려가면 §7.1 위반이다. 폴백을 쓰면 "요약으로
   내려갔다"를 건수로 남겨야 한다.

## ⚠️ GitHub — 기술은 전부 통과했다. 막는 건 약관 §7 이다

**로봇 배제 표준은 판정 기준이 아니다**(공식 API — 2026-09-02 실측에서 세운 규칙).
`api.github.com/robots.txt` 는 404, `github.com/robots.txt` 는 200 이고 이슈·논의
경로를 막지 않는다. 쟁점은 **레이트리밋·인증·약관**이다.

### 인증 — 러너 계약에 걸리지 않는다 (예상과 달랐다)

발주서는 "GitHub API 는 인증 헤더가 필요하므로 러너 계약에 정면으로 걸릴 가능성이
높다"고 봤다. **실측 결과 무인증 GET 으로 전부 된다.**

```
GET https://api.github.com/repos/vercel/next.js/issues?per_page=2&state=all            → 200 · 9,861B
GET https://api.github.com/repos/vercel/next.js/discussions?per_page=2                 → 200 · 5,408B
GET https://api.github.com/repos/vercel/next.js/discussions/32223/comments?per_page=2  → 200 · 2건
GET https://api.github.com/repos/vercel/next.js/issues/84594/comments?per_page=2       → 200 · 2건
```

Authorization 헤더 없이 `Accept: */*` 만 보냈다. 즉 **POST·커스텀 헤더·쿠키 왕복이
필요 없고, `{ url }` + GET 고정 계약으로 충분하다.** theqoo 를 막은 제약에
해당하지 않는다.

받은 필드(논의 기준): `title` · `body` · `created_at` · `updated_at` · `comments`
(개수 마커!) · `html_url` · `number` · `category` · `answer_chosen_at`.
댓글 쪽은 `body` · `created_at` · `child_comment_count`.

```
title: Add support to transpile modules inside node_modules
created_at: 2017-01-09T03:39:05Z   comments: 138
body: Now some of us ships NPM packages (specially components) written in ES2015 without transpiling them.…
댓글: 2017-01-09T05:38:12Z | - Why is this not doable with `webpack()` extension? - `transpileModules` sounds better…
```

`created_at` 이 있으니 증분 종료가 성립하고(`naver_cafe` 를 죽인 그 문제 없음),
`comments` 개수가 개수 마커가 된다.

### 레이트리밋 — 숫자로 확인했다

`GET https://api.github.com/rate_limit` (무인증) 실측:

```json
{"resources":{"core":{"limit":60,"remaining":59,"reset":1789662797},
              "search":{"limit":10},"graphql":{"limit":0,"remaining":0},
              "code_search":{"limit":60}},
 "rate":{"limit":60,"remaining":59}}
```

- **REST core: 시간당 60회 (IP 기준).** 하루 1,440회 — 이 리포의 소스별
  `daily_request_cap`(50~100)보다 **한 자리 크다.** YouTube `search.list` 가
  하루 100 유닛 하드캡에 걸려 사실상 못 쓰게 된 것과 상황이 다르다.
  **우리 수집량으로 성립한다.**
- **GraphQL: `limit:0`** — 무인증 불가. GitHub Discussions 의 정식 API 는
  GraphQL 이지만, 우리는 **REST `/discussions` 로 충분**하다(위 실측).
- `search`: 10/분. 검색은 쓰지 않는다.
- ⚠️ **60/hr 은 IP 공유 위험이 있다.** 이번 측정은 가정용 IP 다. GitHub Actions
  러너는 IP 를 남과 공유하므로 `remaining` 이 이미 깎여 있을 수 있다. 붙이기 전
  러너에서 `rate_limit` 을 한 번 찍어 확인해야 한다. (인증을 쓰면 5,000/hr 이지만
  그건 Authorization 헤더 → 러너 계약 밖이다.)

### 약관 — 여기가 진짜 관문이다

**GitHub Acceptable Use Policies §7 Information Usage Restrictions** (평문 12,729자,
`docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies`)
원문:

> You may use information from our Service for the following reasons, regardless of
> whether the information was scraped, collected through our API, or obtained
> otherwise: **Researchers** may use public, non-personal information from the
> Service for research purposes, only if any publications resulting from that
> research are **open access**. **Archivists** may use public information from the
> Service for archival purposes.
>
> Scraping refers to extracting information from our Service via an automated
> process, such as a bot or webcrawler. Scraping does not refer to the collection
> of information through our API. … You may not use information from the Service
> (whether scraped, collected through our API, or obtained otherwise) for spamming
> purposes …

읽는 대로 옮기면 이렇다:

- **용도 제한은 API 수집에도 걸린다** — "regardless of whether … collected through
  our API". "API 니까 §7 밖"이라는 해석은 성립하지 않는다.
- 허용 용도가 **열거**돼 있다: 연구(단, 결과물이 오픈액세스) · 아카이빙.
  우리 용도는 **사내 경쟁사/VOC 분석과 상업 콘텐츠 생산**이고, 열거된 둘 중
  어느 것도 아니다. 오픈액세스 발행 조건도 충족하지 않는다.
- ToS §H(API Terms, 전문 48,961자 중)는 별개로 남용·스팸·토큰 공유만 금지하고
  우리 용도를 직접 금지하지는 않는다: *"Abuse or excessively frequent requests …
  may result in … suspension … You may not use the API to download data or Content
  from GitHub for spamming purposes …"*

즉 **기술적으로는 전부 통과하는데 용도 조항에서 걸린다.** 이건 코드가 해결할 수
있는 문제가 아니라 사람이 위험을 인수할지 정하는 문제다(SP-025 · 네이버 블로그
선례와 같은 성격이고, 그 둘보다 조항이 더 명시적이다).

**분류: 구현 가능하나 선행 이슈 있음 — 사람의 법적 판단.** CEO-STAFF 에 올릴
질문은 "GitHub AUP §7 의 열거 용도(연구·오픈액세스 발행 / 아카이빙)를 벗어나는
수집을 인수하는가"다. 인수한다면 기술 쪽은 바로 붙을 수 있고, 인수하지 않으면
후보에서 지운다. **판단 없이 만들지 않는다.**

## ⛔ 디스콰이엇 — robots 는 열려 있고 본문도 오는데, 약관이 막는다

디시인사이드와 같은 형태다. `robots.txt`(88B)는 `Allow: /` + `Disallow: /passwordless`
뿐이고, 본문도 정적으로 온다(`/articles/Jq7slK` 200 · 28,186B · 렌더 2,106자):

> 신가인 · July 14, 2022 11:35am — 필승법 / 더 지니어스라는 프로그램을 본 사람이라면
> 알 것이다. 홍진호가 골똘히 고민을 하다가, '필승법을 찾았다' 라는 말을 한다. …

프로덕트 페이지도 온다(`/products/hideout-…` 200 · 렌더 1,463자, 소개문 포함).
사이트맵도 `articles.xml`(1.9MB) · `products.xml`(907KB)로 공개돼 있다.

**그런데 약관이 금지한다.** `https://disquiet.io/terms` → `https://www.relate.kr/terms`
로 리다이렉트된다(디스콰이엇은 주식회사 픽셀릭코리아의 Relate 와 **통합 약관**을
쓴다). 평문 **10,667자**, 금지행위 조항 원문:

> 회사의 사전 허락 없이 **자동화된 수단(매크로·스크래퍼 등)으로 가입·로그인·게시·
> 수집**하는 등 서비스 제공 취지에 부합하지 않는 행위

"수집"이 명시돼 있다. 같은 조항에 *"회사의 사전 동의 없이 서비스를 이용하여 …
서비스를 영리 목적으로 재판매·재제공하는 행위"* 도 있다.

**분류: 법적으로 불가.** 우회하지 않는다. (사전 허락을 받는 길은 있지만 그건
기술 과제가 아니라 사업 협의다.)

## ⛔ 클래스101 — 약관이 로봇·스크레이퍼·데이터 마이닝을 명시 금지한다

robots 는 상품 페이지를 허용한다(`Allow: /` + `Allow: /products/`, 특정 상품 ID
22개만 Disallow). **약관이 막는다.** `https://class101.net/ko/docs/terms/use`,
평문 **9,465자**, 금지행위 조항 원문:

> 서비스 내 콘텐츠보호기능을 우회 … 하거나, **서비스에 접근하는 데 로봇,
> 스파이더, 스크레이퍼나 기타 자동화 수단을 이용**하거나, … 어떤 방식으로든
> 서비스를 조작하거나, **데이터 마이닝, 데이터 수집 또는 추출 방법을 사용하는
> 행위**

같은 조항에 *"서비스를 통하여 취득한 콘텐츠와 정보를 아카이브, 복제, 공중송신,
배포 … 2차적 저작물을 생성"* 금지도 있다. 넷플릭스 계열 약관 문구다.

**게다가 도달도 안 된다.** `/ko/products/<id>` 는 200 · 162,381B 인데 **렌더 텍스트
637자**이고 첫 문장이 *"자바스크립트가 활성화되어있지 않습니다"* 다. 후기 본문은
0건이고, 있는 건 JSON-LD 의 집계뿐이다:

```json
{"@type":"Course","aggregateRating":{"ratingValue":4.4,"ratingCount":160}}
```

원문 키 검색: `"reviewCount"` 1건 · `"ratingValue"` 1건 · 후기 본문 0건.
글로우픽과 똑같은 모양이다(200 · 129KB · 렌더 대부분 CSS).

**분류: 법적으로 불가** (약관 명시 금지). 정적 불가는 부차적 사유다.

## ⛔ 탈잉 — 기술적으로는 B군 2등이었는데 약관이 상업적 이용을 금지한다

기록해 둔다. 탈잉 `/review/<id>` 는 **이번 조사에서 가장 깨끗한 리뷰 페이지**였다
(200 · 84,072B · 렌더 811자, JSON-LD `Review` 한 블록에 전부):

```json
{"@type":"Review","name":"탈잉 뻔더의 <8주 근본홈트 챌린지> 2주차 미션 수강 후기",
 "reviewBody":"솔직히 말린 어깨랑 거북목이 콤플렉스였는데, 이론 강의에서 원인을 알고 나니까
   그냥 따라하게 되더라고요. 챌린지 미션이 있으니까 하기 싫은 날도 어떻게든 하게 되는 게
   신기했어요. … 8주 완주하고 나서 자세 사진 비교해봤는데 확실히 달라져 있어서 놀랐어요.",
 "datePublished":"2026-08-25","author":{"@type":"Person","name":"강윤형"},
 "itemReviewed":{"@type":"Course","name":"…8주 근본홈트 챌린지»",
   "url":"https://www.taling.me/talent/63632",
   "aggregateRating":{"ratingValue":4.8,"reviewCount":63}}}
```

**단, 그런 페이지가 사이트맵에 24개뿐이다**(`/review/*` 24 · `/talent/*` 2,623).
큐레이션된 후기 랜딩이고 전체 후기가 아니다.

**클래스 페이지의 후기는 도달 불가다.** `/talent/63632` 는 JSON-LD 에
`reviewCount:397` 이라고 적어 놓고 렌더 텍스트는 *"0.0 리뷰 0 건"* 이다
(200 · 114,455B · 렌더 1,243자, `reviewBody` 키 0건). **선언 397 / 도달 0** —
§7.1 의 교과서적 사례다. 상태 코드와 집계만 보면 "된다"고 적었을 것이다.

**약관이 막는다.** 탈잉 약관은 oopy.io(노션 호스팅)에 있다
(`https://talingrules.oopy.io/rule`, robots `Allow: /`). 평문 **37,937자**,
이용제한 사유 조항 원문:

> ⑤ 탈잉 사이트, 모바일 탈잉 정보, 데이터를 정당한 권한 없이 스스로 또는 제3자를
> 통하여 복사, 퍼가기, **스크래핑** 하거나 기타의 방법으로 **상업적으로 이용**한
> 경우

우리 용도는 상업적이다.

**분류: 법적으로 불가.**

## ⛔ 팟빵 — 댓글 11만건이 있다고 적혀 있고, 도달 가능한 건 0건이다

robots 는 열려 있다(`Allow: /` + `/auth`·`/creatorstudio`·`/me` Disallow,
`NaverBot`·`Daum` 에만 `Crawl-delay: 30`).

**도달 실패.** `/channels/16898` (최욱의 매불쇼) 200 · 155,649B · **렌더 텍스트
805자**. Nuxt CSR 이고, `window.__NUXT__` 블롭에서 확인한 것:

```
channel:{id:16898,title:"최욱의 매불쇼",episodeCount:4330,subscribeCount:240505,
         commentCount:112547,commentCountText:"112,547",enableComment:d,
         communityId:…}
notices:[{title:"[9월 둘째 주 '시네마 지옥' 5인 5색의 주말 추천작] by.쫄짜PD",
          content:"…누구의 추천작을 가장 재밌게 보셨나요? 솔직한 평가 커뮤니티에 자유롭게 해주세요!"}]
```

- **댓글 112,547건이 선언돼 있고 본문은 한 건도 없다.** 리스너 한마디는 내부 API
  와 별도 커뮤니티(`talk.podbbang.com`)에 있다.
- 블롭에 실린 텍스트는 `notices[].content` — **제작진이 쓴 공지**다. VOC 가 아니다.
- `/channels/16898/episodes` 는 `/channels/16898` 로 리다이렉트되고 에피소드
  목록조차 렌더되지 않는다.

**약관도 막는다.** `https://www.podbbang.com/policies/agreement` 는 페이지 평문이
609자(CSR)지만 약관 본문이 `__NUXT__` 블롭 안에 HTML 로 실려 있어 거기서 읽었다
(블롭 평문 27,775자 구간, `제N조` 7개 확인 — **전문인지는 탭별 로딩이라 단정하지
않는다**). 확인한 금지행위 조항 원문:

> 2. "서비스"에 게시된 정보를 변경하거나 **"서비스"를 이용하여 얻은 정보를 "회사"의
> 사전 승낙 없이 영리 또는 비영리의 목적으로 복제, 출판, 방송 등에 사용하거나
> 제3자에게 제공하는 행위**

페이지 푸터에도 *"팟빵에 게시된 모든 콘텐츠들은 저작권법에 의거 보호받고 있습니다"*
가 상시 노출된다.

**분류: 법적으로 불가** (+ 정적 도달 0건). 내부 API 를 찾아내면 기술적으로는
가능하겠지만, 약관이 먼저 막으므로 **API 실측을 시도하지 않았다.**

## ⛔ SOOP(아프리카TV) — 웹이 통째로 CSR 이고 댓글 API 는 robots 금지다

robots 는 **호스트가 갈린다.**

```
https://www.sooplive.co.kr/robots.txt → https://www.sooplive.com/robots.txt 로 리다이렉트
  "# robots.txt file for SOOP" / User-agent: * / Allow: /
https://vod.sooplive.co.kr/robots.txt → https://vod.sooplive.com/robots.txt (118B)
  "# robots.txt file for AfreecaTV" / User-agent: * / Disallow: /api/
```

판정: `ALLOW /player/201511797` · **`DENY /api/video/comment` (Disallow: /api/)**.

**도달 실패가 두 겹이다.**

1. `https://www.sooplive.com/` — 200 · 14,643B · **렌더 텍스트 0자.** Next.js
   껍데기고 본문·링크가 하나도 없다. 약관 링크조차 없어서 약관 위치를 못 찾았다
   (`policy.sooplive.com` 은 DNS 실패).
2. VOD 페이지 `https://vod.sooplive.com/player/201511797`(robots 의 사이트맵
   `oapi.afreecatv.com/google/sitemap.xml` 에서 얻은 실제 URL) — 200 · 5,265B ·
   **렌더 텍스트 89자**: *"[Catch][팀진우] 페스티벌 42화 ♥ 여왕 두니 ♥ | SOOP VOD
   You need to enable JavaScript to run this app."* JSON-LD `VideoObject` 에
   제목·업로드일·길이만 있고 **댓글은 0건**이다.

댓글은 내부 API 에 있고 그 경로가 `Disallow: /api/` 다. 즉 **규칙상 갈 수 없는
곳에만 데이터가 있다.**

**분류: 구조적으로 불가.** (헤드리스 브라우저를 띄우면 화면은 볼 수 있지만,
글로우픽 때 세운 방침대로 띄우지 않는다. 띄워도 댓글 요청 자체가 `/api/` 라
robots 위반이다.)

## ⛔ 미디엄 — Cloudflare 가 막는다. 그리고 AI 크롤러를 명시 배제한다

robots.txt(884B)는 글 경로를 막지 않는다(`ALLOW /amhocode/abc-123`,
`ALLOW /@user/post-abc`). **그런데 실제 요청이 403 이다.**

`GET https://medium.com/amhocode/개발-블로그-플랫폼-선택-고민-f3a198b942d1`
→ **403 · 5,019B**, 내용:

> Attention Required! | Cloudflare — Please enable cookies. Sorry, you have been
> blocked. **You are unable to access medium.com** … This website is using a
> security service to protect itself from online attacks.

G2(captcha)·Capterra(Cloudflare) 와 같은 결과다. robots 가 허용해도 서버가 막으면
막힌 것이다. **재시도하지 않았다.**

거기다 robots 두 번째 그룹이 의사를 분명히 밝힌다 — `Amazonbot` ·
`Applebot-Extended` · `Bytespider` · **`ClaudeBot`** · `FacebookBot` · `GoogleOther` ·
**`GPTBot`** · `meta-externalagent` 에 `Disallow: /` (홍보 페이지 7개만 Allow).
파일 끝에 `License: https://medium.com/license.xml` 도 선언한다. 글로우픽 때와 같은
판단을 적용한다: **AI 학습·검색 크롤러를 원하지 않는다는 의사가 명시돼 있다.**

이용약관은 사이트 전체가 403 이라 프로브로 읽지 못했다 — **확인 불가**로 적는다
(허용이 아니다). 판정 근거는 약관이 아니라 **403 이라는 실제 요청 결과**다.

**분류: 사실상 차단 → 불가.**

## ⛔ 킥스타터 — robots.txt 를 읽지 못했다. 그래서 가지 않는다

`GET https://www.kickstarter.com/robots.txt` → **403 · 5,760B**, 내용이
Cloudflare 챌린지다:

```html
<title>Just a moment...</title> … script-src … https://challenges.cloudflare.com …
```

RFC 9309 상 4xx 는 "규칙 없음"으로 다루지만, **403 은 그 자체가 "너를 막고 있다"는
신호**다(쿠팡·G마켓·올리브영·글로우픽 선례). 우리는 킥스타터의 규칙을 **읽지
못했고**, 읽지 못한 규칙을 허용으로 해석하지 않는다.

그래서 **프로젝트 페이지·댓글 페이지에 요청을 보내지 않았다.** 한국어 프로젝트가
얼마나 있는지, 댓글이 정적으로 오는지 **모른다** — "안 된다"가 아니라 "확인하지
않았다"다. 약관(`/terms-of-use`)도 같은 이유로 읽지 않았다.

**분류: 판단 불가 → 가지 않는다(불가).**

## ⛔ 틱톡 — "난이도 높음"이 아니라 약관 금지다

메모리에 "난이도 높음"으로 적혀 있었다. 실측하니 난이도 문제가 아니었다.

**약관이 명시적으로 금지한다.** `https://www.tiktok.com/legal/page/row/terms-of-service/ko`
(200 · 427,433B · 평문 **21,735자**, 최종 업데이트 2020-08-12). 원문:

> 당사의 본 서비스는 **사적이고 비상업적인 목적**을 위하여 제공됩니다.

금지행위 목록:

> **본 서비스로부터 정보를 수집하기 위하여, 또는 서비스와 상호작용하기 위하여
> 자동화된 스크립트를 이용하는 것**

한 줄 더 있다: *"위와 같은 링크는 링크된 웹사이트나 정보를 **수집하여도 된다는
당사의 승인으로 해석되어서는 안 됩니다**."*

**robots 도 AI 크롤러를 전면 배제한다.** 첫 그룹이 `GPTBot` · `OAI-SearchBot` ·
**`anthropic-ai`** · **`ClaudeBot`** · **`Claude-User`** · **`Claude-SearchBot`** ·
`PerplexityBot` · `CCBot` · `Bytespider` 등 25개 UA 에 `Disallow: /` 다.
`*` 그룹은 `/@user/video/*` 를 막지 않지만(실측 `ALLOW`), 사이트 의사는 분명하다.

**도달도 안 된다.** `/tag/화장품리뷰`(robots 가 `Allow: /tag` 로 명시 허용하는
경로) 200 · **384,698B 인데 렌더 텍스트 22자**: `TikTok - Make Your Day`.
JSON-LD 0개. 영상 본문·댓글·해시태그 목록 전부 JS 안에 있다.

**분류: 법적으로 불가** (+ 정적 도달 불가). 우회 시도 없음.

---

## 기존 판정·기록이 틀린 것 2건

### 1. 발주서의 SP-018 설명이 낡았다 (문서 쪽이 이미 정정돼 있다)

발주서는 공통 제약으로 "SP-018: robots 파서가 와일드카드 `*` / `$` 미구현"을
들었다. **이미 고쳐졌다.** `lib/review/robots.ts` 의 `pathMatches()` 가 투포인터
글롭 매처로 `*` 와 끝 앵커 `$` 를 구현하고 있고(ReDoS 회피까지 주석에 적혀 있다),
`docs/review-source-findings.md` 337~361행에는 2026-09-16 정정 블록이 붙어 있다
("~~구현하지 않는다~~ **구현했다**").

이번 조사가 그 구현에 의존했다: OKKY `Disallow: /users/*/articles`, 인프런
`/course/*/edit`, 티스토리 없음, 미디엄 `/*/edit$` 같은 와일드카드 규칙이 실제로
판정에 반영됐다(예: `DENY /users/1/articles (Disallow: /users/*/articles)`).
**와일드카드가 안 됐다면 OKKY 판정이 틀렸을 수 있었다.**

`docs/strategy-principles.md` 의 SP-018 행은 여전히 "오탐 가능 … 수정 확정"으로
적혀 있어 현재 상태(수정 완료)와 읽는 사람이 헷갈릴 수 있다. **정정은 이 브랜치
범위가 아니라 별건으로 남긴다**(A군 조사가 같은 파일을 볼 수 있어 충돌을 피한다).

### 2. SP-026 은 그대로 살아 있다 (재확인)

`lib/review/runner.ts:153` 이 여전히 `robotsVerdict(cached, u.pathname, PRODUCT_TOKEN)`
다 — 쿼리스트링이 판정에 안 들어간다. B군에서 쿼리형 URL 을 쓰는 후보는
**인프런 강의 페이지(`?cid=`) 하나**이고, 인프런 robots 의 쿼리 대상 규칙
(`/community/*?*tag=*,`)은 강의 경로와 겹치지 않아 이번엔 안 밟는다. `/community/`
쪽으로 넓히면 SP-026 이 선행돼야 한다.

## 내가 낸 검사 오류 1건 (§7.1 — 남겨 둔다)

**인프런을 처음에 "robots 금지"로 판정했다. 틀렸다.**

1차 판정에서 플레이스홀더 경로 `/course/lecture-slug` 를 넣었는데, 그게 인프런의
`Disallow: /course/lecture`(동영상 플레이어 경로용 규칙)에 **접두로 우연히
일치**해서 `DENY` 가 나왔다. 실제 강의 슬러그(`/course/웹어플리케이션-강좌`)로
다시 판정하니 `ALLOW` 다.

교훈: **robots 판정은 실제 URL 로 해야 한다.** 가짜 샘플 경로는 규칙과 우연히
겹치거나(이번 경우) 우연히 안 겹칠 수 있다. `/course/lecture-…` 로 시작하는
슬러그를 가진 강의는 **실제로 수집 대상에서 빠진다**는 점도 함께 기록한다 —
구현하면 어댑터가 그 경로를 ref 단계에서 거부해야 한다.

## 하지 않은 것

- 어댑터·마이그레이션 구현 — 없음. `review_sources` INSERT 없음. DB 읽기/쓰기 없음.
- 킥스타터 본문·약관 요청 — robots 를 못 읽었으므로 보내지 않았다.
- 팟빵·클래스101·SOOP 내부 API 역추적 — 약관/robots 가 먼저 막았으므로 시도하지 않았다.
- 미디엄 재요청 — 403 한 번 보고 끝냈다(재시도 없음).
- 헤드리스 브라우저 — CSR 소스(class101·taling 클래스·podbbang·SOOP·tiktok)에 띄우지 않았다.
- UA 위장 — 없음. 클리앙 때처럼 브라우저 UA 로 규칙을 확인하는 것도 하지 않았다.
- Actions 러너(Azure) 재측정 — 하지 않았다. ✅ 3건은 켜기 전에 러너에서 다시 재야 한다.

## 다음에 사람이 결정할 것 (CEO-STAFF 상신용)

1. **GitHub AUP §7 용도 제한을 인수하는가.** 기술은 전부 통과했고 이것만 남았다.
2. **인프런 약관 확인** — 브라우저로 열어 자동수집·상업적 이용 조항 유무 확인.
   (자동화로는 못 읽는다. 클래스101·탈잉이 같은 조항으로 탈락했다.)
3. **티스토리 약관 확인** — 카카오·다음 정책 호스트가 robots 로 전면 금지라
   사람만 읽을 수 있다.
4. **OKKY·벨로그를 바로 발주할지** — 둘은 선행 조건이 없다. 등록은 기존 방침대로
   `enabled=false` 로 하고 켜는 것은 사람이 한다.
