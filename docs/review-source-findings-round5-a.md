# VOC 소스 실측 round-5 A군 — 국내 커뮤니티·플랫폼 11곳 (2026-09-18)

CEO-STAFF 지시로 A군 후보만 **조사**했다. **어댑터·마이그레이션은 쓰지 않았다.**
`review_sources` 에 행을 추가하지 않았고 DB 를 읽지도 쓰지도 않았다.

결과는 이 파일에만 남긴다 — 같은 시각 B군 조사가 돌고 있어
`docs/review-source-findings.md` 는 건드리지 않았다. 채택이 결정된 항목은
나중에 사람이 본 문서로 옮긴다.

## 측정 조건 (기존 방법론과 동일)

| 항목 | 값 |
|---|---|
| egress | 한국 가정용 IP (로컬) |
| User-Agent | `solutionarchive-review-probe/0.1 (+https://github.com/…)` — **위장하지 않음** |
| robots 판정 | 이 리포의 RFC 9309 파서 `lib/review/robots.ts` (`parseRobots` → `robotsVerdict`). **눈으로 읽고 판단하지 않았다** |
| 판정에 넘긴 경로 | `u.pathname + u.search` — 러너보다 **엄격하게** 봤다(SP-026 참조) |
| 규칙 | robots Disallow 경로는 **요청하지 않음** · 재시도 없음 · 요청 간 4초 · 프록시/IP 로테이션 없음 · 쿠키·CSRF·로그인 우회 시도 없음 |
| 판정 기준 | 상태코드가 아니라 **기대 내용의 표지**(실제 글 본문·댓글 텍스트). 발췌를 아래에 붙였다 |
| robots 5xx/네트워크 오류 | "허용"이 아니라 **판단 불가** → 가지 않음 (실제로 해당 사례 0건) |

## 결론 먼저

**A군 11곳 중 "구현 가능(바로 진행)" 은 0곳이다.**

| # | 후보 | 분류 | 한 줄 사유 |
|---|---|---|---|
| 1 | 아하 `a-ha.io` | ⛔ 법적으로 불가 | robots 는 허용. **약관 제20조 ⑦이 크롤링·미러링을 엄격히 금지**, 예외는 비영리(교육·학술·연구/시사보도/포털 검색엔진)뿐 |
| 2 | 블라인드 `teamblind.com` | ⛔ 법적으로 불가 | robots 가 **ClaudeBot·anthropic-ai·GPTBot 을 이름으로 `Disallow: /`** + 약관이 "크롤링·스크래핑·데이터 마이닝·데이터 추출" 명시 금지 |
| 3 | 잡플래닛 `jobplanet.co.kr` | ⛔ 구조적으로 불가 | robots 는 허용인데 **실제 요청이 Cloudflare 403**. 약관 경로 `/welcome/terms` 조차 robots Disallow |
| 4 | 캐치 `catch.co.kr` | ⛔ 구조적으로 불가 | robots 허용·HTTP 200 인데 리뷰 본문 자리가 **로그인 CTA**. 목록의 한 줄 티저는 날짜·고유 id 가 없다 |
| 5 | SLR클럽 `slrclub.com` | ⛔ 규칙상 금지 | `User-agent: *` / **`Disallow: /`**. 요청 안 함 |
| 6 | 당근마켓 동네생활 `daangn.com` | ⚠️ 구현 가능하나 선행 이슈 | 도달·파싱·마커·날짜 **전부 합격**. 막는 건 robots 의 **AI 크롤러 50종 이름 차단**(사람 판단)과 약관 확인 불가 |
| 7 | 다음 카페 `cafe.daum.net` | ⛔ 구조적으로 불가 | 허용된 `bbs_read` 가 200 인데 내용은 **"6등급 이상 읽기" 회원 등급 벽** |
| 8 | 왓챠피디아 `pedia.watcha.com` | ⛔ 구조적으로 불가 | 코멘트 프리뷰 8건은 오는데 **작성일이 없다** → 증분 종료 불성립(`naver_cafe` 탈락 사유와 동일). 더보기는 로그인 리다이렉트 |
| 9a | 여기어때 `goodchoice.kr` | ⛔ 구조적으로 불가 | **호스트가 `www.yeogi.com` 으로 바뀌었다**(아래 정정). robots 는 AI 크롤러까지 명시 허용인데 **숙소 상세가 Cloudflare 403** |
| 9b | 야놀자 `yanolja.com` | ⚠️ 구현 가능하나 선행 이슈 | robots 가 **`/reviews/` 를 명시 금지**. 허용된 숙소 상세에 리뷰 프리뷰 10건이 실려 옴 → 의사 충돌 사람 판단 + 약관 확인 불가 + 데이터 품질 경고 |
| 9c | 마이리얼트립 `myrealtrip.com` | ⛔ 규칙상 금지 | `User-agent: *` / **`Disallow: /`**. 요청 안 함. (특이점: AI 크롤러 22종은 **이름으로 허용**하고 그 밖을 전부 막는 화이트리스트다) |

⛔ 와 ⚠️ 를 구분해 적는다. **"규칙상 금지"와 "서버가 막는다"와 "내용이 벽이다"는
다른 사건이고**, 섞으면 나중에 누가 "여기 되는데?" 하고 다시 긁는다.

### 이번 조사에서 반복 확인한 패턴 3개

1. **robots 가 열려 있는 것이 허가가 아니다.** 아하가 정확히 그 사례다 — robots
   `Allow: /` 인데 약관이 크롤링을 "엄격히 금지"한다. 디시인사이드(약관 제16조)와
   같은 형태이고, robots 만 봤으면 만들어서는 안 되는 소스를 만들었을 것이다.
2. **HTTP 200 이 도달이 아니다.** 캐치(65KB·200·로그인 CTA) · 다음 카페
   (40KB·200·권한 안내) · 잡플래닛/여기어때(200 아닌 403 이지만 HTML 본문 4.5KB)가
   전부 상태코드로 판정하면 뒤집히는 자리였다.
3. **AI 크롤러를 이름으로 다루는 것이 이제 표준이다 — 다만 방향이 둘로 갈린다.**
   - **이름으로 차단**: 당근(51종) · 왓챠(AI 11종 포함 36종) · 블라인드(7종) ·
     아하(Bytespider 1종)
   - **이름으로 허용**: 여기어때(GPTBot·ClaudeBot·CCBot·PerplexityBot 등에
     `Allow: /`) · 마이리얼트립(`# LLM/AI 크롤러 - 상품 정보 수집 허용` 주석과 함께
     22종에 `Allow: /`)
   - **무관심**: 캐치 · 다음 카페 · 야놀자 (명시 UA 0~소수, AI 언급 없음) ·
     잡플래닛(명시 차단은 MJ12bot·PetalBot 둘뿐)

   ⚠️ **"AI 크롤러를 허용한다"가 "우리를 허용한다"는 아니다.** 마이리얼트립이
   정확히 그 함정이다 — 이름 붙은 22종에는 문을 열고 `*` 에는 `Disallow: /` 를
   준다. 우리 UA 는 목록에 없으니 `*` 를 받는다. 이름을 빌려 쓰는 것은 UA 위장이라
   하지 않는다.

---

## robots 실측 일람 (파서 출력 그대로)

`groups` = 파싱된 그룹 수, `*그룹` = `User-agent: *` 그룹 수(화해 버그 재발 감지용),
`명시UA` = `*` 아닌 UA 수, `전면금지` = 그중 `Disallow: /` 를 받는 수,
`명시허용` = 그중 `Allow: /`(또는 빈 Disallow)를 받는 수. 전부 파서 출력으로 셌다.

| 호스트 | HTTP | bytes | groups | *그룹 | 명시UA | 전면금지 | 명시허용 | 대표 경로 판정 |
|---|---|---|---|---|---|---|---|---|
| `www.a-ha.io` | 200 | 289 | 2 | 1 | 1 | **1** (Bytespider) | 0 | `/questions/<id>` → **true** (`Allow: /`) |
| `a-ha.io`(apex) | 200 | 289 | 2 | 1 | 1 | 1 | 0 | www 와 동일 — 호스트 분열 없음 |
| `www.teamblind.com` | 200 | 922 | 10 | 1 | 9 | **7** (AI 7종) | 0 | `/kr/post/<slug>` → true (일치 규칙 없음) |
| `www.jobplanet.co.kr` | 200 | 1,291 | 7 | 1 | 6 | 2 (MJ12bot·PetalBot) | 4 | `/companies/1/reviews` → true (일치 규칙 없음) |
| `www.catch.co.kr` | 200 | 627 | 1 | 1 | 0 | 0 | 0 | `/Comp/…` → true (`Allow: /`) |
| `www.slrclub.com` | 200 | 292 | 8 | 1 | 7 | 0 | 7(검색엔진) | `/bbs/vx2.php` → **false** (`Disallow: /`) |
| `www.daangn.com` | 200 | 1,848 | 3 | 1 | **51** | **51** | 0 | `/kr/community/<slug>/` → true |
| `cafe.daum.net` | 200 | 127 | 1 | 1 | 0 | 0 | 0 | `/_c21_/bbs_read` → **true** (`Allow: /_c21_/bbs_read`) · `/_c21_/favor_bbs_read` → **false** (`Disallow: /_c21_/`) |
| `pedia.watcha.com` | 200 | 1,225 | 3 | 1 | 41 | **36** (AI 11종 포함) | 0 | `/ko/contents/<id>` → true (일치 규칙 없음) |
| `www.goodchoice.kr` | 200 | 270 | 2 | **0** | 2 | 0 | 2 | `*` 그룹이 없다 → "해당하는 User-agent 그룹 없음". **다만 이 호스트는 리다이렉트된다**(아래) |
| `www.yeogi.com` | 200 | 5,671 | 13 | 1 | 12 | 0 | **12**(GPTBot·ClaudeBot 포함) | `/domestic-accommodations/<id>` → true (`Allow: /`) |
| `nol.yanolja.com` | 200 | 269 | 1 | 1 | 0 | 0 | 0 | `/stay/1000` → true · `/reviews/1000` → **false** (`Disallow: /reviews/`) |
| `www.myrealtrip.com` | 200 | 1,570 | 4 | 1 | 29 | **0** | **22**(GPTBot·ClaudeBot 포함) | `/offers/123` → **false** (`Disallow: /` — 우리는 `*` 를 받는다) |
| `kr.teamblind.com` | (404) | — | 0 | 0 | — | — | — | 약관 호스트. 규칙 없음 → 약관 열람 가능 |
| `accounts.yanolja.com` | 200 | — | — | — | — | — | — | **`Disallow: /`** → 야놀자 약관을 읽을 수 없다 |

**`*` 그룹이 두 번 이상 나온 호스트는 없었다.** 화해형 버그(첫 그룹만 읽어 판정이
뒤집히는 사례)의 재발 조건에 걸린 후보가 이번엔 없다.

---

## 1. 아하 `a-ha.io` — ⛔ 법적으로 불가

### robots (200 · 289B)

```
User-agent: Bytespider
Disallow: /

User-agent: *
Allow: /
Disallow: /news
Disallow: /news/

Sitemap: https://www.a-ha.io/sitemap.xml
Sitemap: https://www.a-ha.io/sitemapindex.xml
```

`/questions/<id>` → `allowed=true (Allow: /)`. apex(`a-ha.io`)도 같은 파일이다
(클리앙식 호스트 분열 없음).

### 도달 실측 — 기술적으로는 최상급이다

`https://www.a-ha.io/questions/4a0d5ff8140fe77facbc1397494ebad0`
→ HTTP 200 · 214,468B · utf-8. `application/ld+json` 2블록, 그중 `QAPage`.

```
answerCount=3  파싱=3   ← 개수 마커와 일치
질문 152자: "KT USB 형태의 무선 랜카드가 정확히 무엇인가요?우리가 아는 와이파이 같은 …"
[45ccc941…] 2026-09-15T19:34:59.918Z len=212 "인터넷을 설치 후 내 PC로 연결하려면 랜선으로 …
                                              다이소 제품은 속도의 한계가 있어서.집에서 상시로 쓰기는 좋지 않습니다."
[47f7f946…] 2026-09-17T04:39:20.790Z len=123 "USB 형태의 무선 랜카드는 PC가 무선 와이파이 등을 …"
[463720d1…] 2026-09-15T23:51:24.240Z len=167 "그냥 KT라는 이름만 붙은 USB 형태의 무선랜카드일뿐입니다. …"
```

- `answerCount`(개수 마커) · `acceptedAnswer` + `suggestedAnswer[]`
- 각 답변에 **절대 ISO 작성일** · 앵커 고유 id(`url` 의 `#` 뒤) · **전문**(잘림 없음)
- sitemap 이 `sitemapindex1~N.xml` 로 질문 URL 을 5,000개씩 열거 → 타깃 발굴도 쉽다
- 1질문 = 1 GET. 러너 계약(`{ url }` · GET · 헤더 없음)으로 충분

**즉 도달·파싱·마커·날짜·증분 종료가 전부 성립한다.** 그래서 탈락 사유는 기술이 아니다.

### 🔴 이용약관이 막는다 — 전문 21,284자 확인

`https://www.a-ha.io/policies/terms` (200 · 80,986B · 평문 21,284자).
관련 조항 **있음**. 원문 그대로:

> **제 20 조 (권리의 귀속)** ⑦ 회사는 데이터베이스 제작자로서 저작권법에 의거하여
> 회사의 데이터베이스에 대한 권리를 보유합니다. **회사의 데이터베이스에 대하여
> 소프트웨어 또는 기계적 방법을 통하여 이루어지는 크롤링, 미러링 기타 대규모 이용은
> 엄격히 금지됩니다.** 단, **영리를 목적으로 하지 않는 경우**로서 다음 각 호 중
> 하나에 해당하는 경우는 예외로 합니다. 교육, 학술 또는 연구를 위하여 이용하는 경우 /
> 시사보도를 위하여 이용하는 경우 / 포털 사이트의 검색엔진 로봇에 의한 크롤링의 경우

같은 약관 제20조 ⑤ 도 겹친다:

> ⑤ 회원은 서비스를 이용함으로써 얻은 정보를 회사의 사전 승낙 없이 복제, 송신, 출판,
> 전송, 배포, 방송 기타 방법에 의하여 **영리 목적으로 이용**하거나 제3자에게 이용하게
> 해서는 안됩니다.

우리 파이프라인은 수집 텍스트를 경쟁사 분석·콘텐츠 생성에 쓴다 — **영리 목적이고,
세 가지 예외 어디에도 들어가지 않는다.** 교육·학술·연구도, 시사보도도, 포털 검색엔진
로봇도 아니다.

**판정: 법적으로 불가.** robots 가 열려 있다는 사실은 이 결론을 바꾸지 않는다
(디시인사이드 제16조 사례와 같은 형태다). 되살리려면 아하와 별도 이용 허락이
선행되어야 하고, 그건 기술 판단이 아니다.

---

## 2. 블라인드 `teamblind.com` — ⛔ 법적으로 불가 (차단 근거가 둘)

### robots (200 · 922B) — 우리 이름은 없지만 동류가 전부 막혀 있다

```
User-agent: *
Disallow: /user/history
Disallow: /kr/user/history
Disallow: /search/
Disallow: /kr/search/
Disallow: /blog/ghost/
…

# Blocked user agents
User-agent: GPTBot
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: anthropic-ai
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: Applebot-Extended
Disallow: /
User-agent: Bytespider
Disallow: /
```

`/kr/post/<slug>` · `/kr/company/<회사>/reviews` → `allowed=true (일치하는 규칙 없음)`.
**기계적 판정은 허용이다.** 다모앙(SP-025)과 같은 구도다.

### 도달 실측 — 본문·댓글·기업리뷰 전부 정적으로 온다

글 (`/kr/post/Isfj분들-…-4uor23fi`, 200 · 478,786B):

```
application/ld+json → DiscussionForumPosting
headline "Isfj분들 그냥 편하고 친한사이? 정도에서"
text     "좋아하게 되는 경우는 힘들죠??? 외모가 엄청 본인 스타일은 아니라고 할때 그냥 적당한 정도"
datePublished 2026-09-17T14:00:00.000Z   author l******** / 새회사
commentCount=6   comment[]=4   ← 마커와 배열이 어긋난다(§주의)
  [2026-09-17T14:00Z] "아니??아닌데"
  [2026-09-17T15:00Z] "나도 첫 스타트가 결정됨."
  [2026-09-17T15:00Z] "첫만남에 친구면 평생친구"
  [2026-09-17T15:00Z] "나 ISTJ인데 좀 그럼... 첫만남에서 결정남. 비즈니스파트너 운동메이트 밥터디 내여자"
```

기업리뷰 (`/kr/company/삼성전자/review/0sqmHecsi`, 200 · 812,930B) — `window.__NUXT__` 에
리뷰 원장이 들어 있다:

```
{id:1265822, url_alias:"QU7N3pf-A", summary:"회사의 끝판왕",
 pros:"높은 연봉과 좋은 복지가 장점입니다. 부서 세분화도 잘되어있습니다.",
 cons:"직무가 삼성 내에서만 필요하며 커리어적으로 좋지 않은 경우도 있습니다.",
 overall/career/balance/compensation/culture/management 6축 평점,
 created_at:"2024-03-11T09:40:11.000Z", nickname:"ㅣ********", jobgroup:…}
```

VOC 품질로는 A군 최상급이다(장·단점 분리 + 6축 평점 + ISO 일자 + 고유 alias).
JSON-LD 의 `commentCount`(6) vs `comment[]`(4) 차액은 별도 확인이 필요했겠지만,
아래 사유로 거기까지 가지 않았다.

### 🔴 이용약관이 명시 금지 — 전문 19,030자 확인

`https://kr.teamblind.com/setting/term` (200 · 22,511B · 평문 19,030자).
robots: 이 호스트는 `robots.txt` 가 404 라 규칙 없음(RFC 9309 §2.3.1.3) → 열람 가능.
관련 조항 **있음**. 금지행위 목록 원문:

> • **Teamblind로부터 명시적 허가를 받은 경우를 제외하고, 서비스 또는 서비스 내
> 콘텐츠의 전부 또는 일부를 자동/수동 수단을 통해 크롤링, 스크래핑, 데이터 마이닝,
> 데이터 추출, 복제, 복사, 판매 또는 재판매하는 행위**
> • 서비스의 서버 및/또는 네트워크 시스템에 지장을 주는 행위, **봇(Bot)** 치팅 툴
> 기타 기술적 수단을 이용하여 서비스를 조작하는 행위

**판정: 법적으로 불가.** 차단 근거가 둘이다 —
(a) robots 가 `ClaudeBot` · `anthropic-ai` · `GPTBot` 을 이름으로 거부하고
(b) 약관이 크롤링·스크래핑·데이터 추출을 "명시적 허가" 없이는 금지한다.
아하와 달리 비영리 예외조차 없다. 우리 UA 가 목록에 없다는 사실을 허용으로 읽는 것은
CLAUDE.md §7.1 이 금지하는 판정이다.

---

## 3. 잡플래닛 `jobplanet.co.kr` — ⛔ 구조적으로 불가 (Cloudflare)

### robots (200 · 1,291B) — 리뷰 경로는 막지 않는다

`*` 그룹의 Disallow 는 `/apply` `/info` `/profile…` `/users` `/wizard/` `/search`
`/welcome/…` `/companies/*/salaries_of_job_rank/` `/common` 등. 리뷰 경로
`/companies/<id>/reviews` 는 걸리지 않는다 → `allowed=true (일치하는 규칙 없음)`.

⚠️ `Disallow: /companies/*/salaries_of_job_rank/` 가 와일드카드 규칙이다. **지금
파서는 이걸 정확히 판정한다**(SP-018 은 수정 완료 — 아래 §정정 참조).

### 도달 실측 — 규칙은 허용인데 서버가 막는다

| URL | HTTP | bytes | 내용 |
|---|---|---|---|
| `/sitemap.xml` | **403** | 4,551 | `<title>Attention Required! \| Cloudflare</title>` |
| `/` (→ `/welcome/index`) | **403** | 4,551 | 같은 Cloudflare 차단 페이지. `Cloudflare` 4회 등장 |

정직한 UA 로 두 번 요청했고 둘 다 같은 페이지다. **G2·Capterra 와 같은 형태다** —
robots 가 허용해도 서버가 막으면 막힌 것이다. 우회하지 않는다.

### 이용약관 — **확인 불가** (robots 가 약관 열람을 금지한다)

`/welcome/terms` 는 `*` 그룹의 `Disallow: /welcome/terms` 에 정확히 걸린다.
파서 판정 `allowed=false` → **요청하지 않았다.**

> 이건 기록해 둘 만하다. **사이트가 봇에게 자기 이용약관을 읽지 못하게 해 뒀다.**
> 그래서 "약관에 금지 조항이 없다"고 말할 근거가 없고, §7.1 대로 **확인 불가**다.
> 무엇을 확인하면 되나: 사람이 브라우저로 `/welcome/terms` 를 열어 크롤링·자동화·
> AI 학습 조항을 보면 된다. 다만 위 403 때문에 그걸 확인해도 도달이 안 된다.

**판정: 구조적으로 불가.**

---

## 4. 캐치 `catch.co.kr` — ⛔ 구조적으로 불가 (200 + 로그인 벽)

### robots (200 · 627B)

`*` 단일 그룹. Disallow 목록에 `/App` `/Apply` `/Company` `/Customer` `/Member`
`/Search` `/api/v1.0/common` … 이 있고 마지막에 `Allow: /` 가 온다.
`Allow: /Member/Privacy` 만 `/Member` 예외다.

- `/Comp/CompReview` → `allowed=true (Allow: /)`
- `/Comp/ReviewInfo/<id>?Target=Review` → `allowed=true (Allow: /)`
- ⚠️ `Disallow: /Company` 는 **`/Comp/` 를 막지 않는다**(접두사 불일치). 대소문자
  구분도 살아 있다. 헷갈리기 쉬운 자리라 적어 둔다.
- 🔴 `/Member/AccessTerms`(약관) → `allowed=false (Disallow: /Member)` → **요청 안 함**

### 도달 실측 — 목록엔 티저가 오고, 상세엔 본문이 안 온다

목록 `/Comp/CompReview` (200 · 49,870B): 리뷰 **한 줄 티저**가 정적으로 온다.

```
현재 등록된 기업리뷰 124,438개!
현대해상화재보험 | 대기업 | 은행·금융 | 경영/사무
  "안정적인 고연봉 직장, 육아 휴직도 크게 눈치 보지 않고 쓸 수 있음"
아이에스시 | 대기업 | 도소매·유통 | 생산/제조
  "기숙사 제공을 해서 타지역사람들은 사용할 수 있다. 회식강요나 그런건 없었다 본인 일만 하면 야근은 안해도 됨"
CJ프레시웨이 | 대기업 | 도소매·유통 | 서비스
  "복지가 정말 좋아요 실생활에 유용한 복지들이 많아요 성…"   ← 끝이 잘린다
```

상세 `/Comp/ReviewInfo/212833?Target=Review` (200 · 65,542B · `__NUXT__` 1개):

```
아이에스시 · 9명 참여 · 종합 2.9
급여&복지 3.1 / 조직문화 3.1 / 워라밸 2.9 / 커리어 2.8 / 경영진 2.7
🤑 성과급이 있어요 78% · 👔 복장이 자유로워요 71% · 🥽 휴가를 자유롭게 쓸 수 있어요 100%
직원 리뷰 | 전체 1개 | 최신순 | 현직자만 | 직무 생산/제조 | 고용형태 정규직
  → 리뷰 본문이 있어야 할 자리: "로그인·회원가입"
평균 연봉: ??만원   ????.??
"지금 바로 로그인하고, 기업 리뷰를 확인하세요!  로그인·회원가입"
```

`__NUXT__` 안에도 `advantage` / `disadvantage` / `reviewCont` / `regDate` /
`reviewSeq` / `totalCnt` 필드가 **0건**이다. 집계 점수와 배지 비율만 있고
리뷰 텍스트는 페이로드에 실려 오지 않는다.

**HTTP 200 에 65KB 인데 리뷰 본문이 없다.** Amazon 319KB 사건과 같은 자리다.

목록의 티저만 받는 대안도 성립하지 않는다:
- 티저에 **작성일이 없다** → 증분 종료 불성립(`naver_cafe` 탈락 사유)
- 리뷰 고유 id 가 없다(링크는 회사 단위 `ReviewInfo/<compId>`) → 지문이 `seq` 폴백만 남는다
- 티저가 잘려 온다("…성") → VOC 분석 값이 사실상 없다

### 이용약관 — **확인 불가**

`/Member/AccessTerms` 가 robots `Disallow: /Member` 에 걸려 요청하지 않았다.
무엇을 확인하면 되나: 사람이 브라우저로 그 페이지를 열면 된다. 다만 위 로그인 벽
때문에 약관이 깨끗해도 도달이 안 된다.

**판정: 구조적으로 불가.**

---

## 5. SLR클럽 `slrclub.com` — ⛔ 규칙상 금지

### robots (200 · 292B) — 원문 전체

```
User-agent: Googlebot
Disallow:
User-agent: Googlebot*
Disallow:
User-agent: Mediapartners-Google*
Disallow:
User-agent: ZumBot
Disallow:
User-agent: Yeti
Disallow:
User-agent: daumoa
Disallow:
User-agent: KaBot
Disallow:
User-agent: *
Disallow: /
Allow: /$
Allow: /ads.txt
```

파서 판정:

```
/bbs/vx2.php     => allowed=false  reason='Disallow: /'
/bbs/zboard.php  => allowed=false  reason='Disallow: /'
```

검색엔진 7종에만 전면 개방하고 **그 밖의 모든 UA 에게 전면 금지**다.
`Allow: /$` 는 루트 한 장, `/ads.txt` 는 광고 검증용. 게시판 경로는 전부 막힌다.

**글 페이지·목록·약관 어느 것도 요청하지 않았다.** 이용약관은 그래서 **확인 불가**이고,
그것과 무관하게 robots 단계에서 이미 금지다(Trustpilot 과 같은 형태).

**판정: 규칙상 금지.** 무엇을 확인해도 바뀌지 않는다 — 사이트가 UA 화이트리스트
방식을 쓰므로, 되살리려면 SLR클럽이 우리 UA 를 허용 목록에 넣어 주는 것 말고는 없다.

---

## 6. 당근마켓 동네생활 `daangn.com` — ⚠️ 구현 가능하나 선행 이슈

**A군에서 기술적으로 가장 깨끗하다.** 막는 건 기술이 아니라 의사와 약관이다.

### robots (200 · 1,848B)

`*` 그룹:

```
Disallow: /ad/         Disallow: /admin       Disallow: /wv/
Disallow: /kr/buy-sell/s/    /kr/realty/s/    /kr/cars/s/
Disallow: /kr/jobs/s/        /kr/community/s/ /kr/group/s/    /kr/local-profile/s/
Allow: /wv/faqs   Allow: /wv/faqs/   Allow: /wv/feedbacks/new
```

- `/kr/community/<slug>/` → `allowed=true (일치하는 규칙 없음)`
- `/kr/search/community/` (목록. `/kr/community/` 가 여기로 리다이렉트된다) → true
- `/kr/community/s/…`(키워드 검색)는 **금지** — 목록 진입을 검색 URL 로 짜면 안 된다

### 🔴 그런데 AI 크롤러·수집기를 **51종** 이름으로 전면 금지한다

파서로 센 수다 — `*` 아닌 명시 UA 51개가 **전부** `Disallow: /` 를 받는다(발췌):

```
OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot,
Claude-Web, anthropic-ai, PerplexityBot, Perplexity-User, xAI-Grok, Grok-DeepSearch,
CCBot, Google-Extended, GoogleOther, Bytespider, meta-externalagent,
meta-externalfetcher, Applebot-Extended, cohere-ai, cohere-training-data-crawler,
DuckAssistBot, Diffbot, ImagesiftBot, img2dataset, Scrapy, Timpibot, YouBot,
omgili, omgilibot, AI2Bot, AI2Bot-Dolma, PanguBot, Webzio-Extended, …
```

**`Scrapy` 와 `img2dataset` 이 들어 있다는 게 중요하다.** 특정 AI 회사가 아니라
**"범용 수집 도구" 자체를 거부**하는 목록이다. 다모앙(8종 + 자칭 수집기 2종)보다
훨씬 명시적이다. 우리 UA(`solutionarchive-review-probe/0.1`)는 목록에 없어서
기계적 판정은 `allowed=true` 지만, **없다를 허용으로 읽는 것은 §7.1 위반**이고
이건 사업·법무 판단이다(SP-025 와 같은 성격).

### 이용약관 — **확인 불가** (세 경로 모두 CSR 껍데기)

| URL | HTTP | 원문 | 평문 | 관련 조항 |
|---|---|---|---|---|
| `https://www.daangn.com/policy/terms/` | 200 | 235,883B | **9자** | 판정 불가 |
| `https://cs.kr.karrotmarket.com/wv/faqs/slug/operation_policy` | 200 | 189,815B | **4자** | 판정 불가 |
| `https://www.yeogi.com/policy/terms`(비교용) | 200 | 23,945B | 81자 | 판정 불가 |

당근 약관 페이지는 200 에 236KB 인데 **태그를 벗기면 본문이 9자다.** 글로우픽과
같은 CSR 구조라 정적 fetch 로 약관 전문을 읽을 수 없다. headless 브라우저는
띄우지 않았다(글로우픽 때 세운 원칙 — AI 크롤러를 명시 거부하는 사이트에
브라우저를 띄우지 않는다).

**따라서 "관련 조항 0건"이 아니라 "확인 불가"다.** 무엇을 확인하면 되나: 사람이
브라우저로 `www.daangn.com/policy/terms/` 를 열어 크롤링·자동수집·AI 학습·재가공
조항을 확인하면 된다.

### 도달 실측 — 마커·날짜·고유 id 가 전부 있다

목록 `/kr/search/community/` (200 · 502,541B): `/kr/community/<slug>/` 링크 36개 +
각 카드에 `댓글 수` 마커. 임베드 GraphQL 상태에 `CommunityRecommendedArticle`
(`id`·`title`·`content`·`subject`·`regionName`·`commentsCount`·`permalink`·`createdAt`)이
들어 있어 **타깃 발굴에 그대로 쓸 수 있다.**

글 (`/kr/community/오천에-예초기-수리-하는데가-있을까요-n4po96rx8xfi/`, 200 · 256,233B):

```
application/ld+json → DiscussionForumPosting
headline "오천에 예초기 수리 하는데가 있을까요??"
text     "오천에 예초기 수리 하는데가 있을까요"
datePublished 2026-09-17T02:45:39.970+00:00    author 몰개월
CommentAction userInteractionCount = 8         ← 개수 마커
comment[] 는 **중첩**이다. 평탄화 결과 8건 — 마커와 정확히 일치:
  [2026-09-17] "오천공구요"
    [2026-09-17] "오천공구 수리안해요\n담담자 다른데로 갔어요"
  [2026-09-17] "기아큐 옆에 농협에서 하는 농기구 센터 있는걸러 아는데 거기 가보세요"
    [2026-09-17] "그기는 예초기정비는 안합니다 임대사업소 입니다"
  [2026-09-17] "답변 감사합니다"
    [2026-09-17] "오천공구에서 정비하시는분 대송에서 하세요 개인 연락처 필요하심 연락주세요"
    [2026-09-17] "부탁드립니다"
    [2026-09-17] "***-****-****"          ← 전화번호는 사이트가 마스킹해서 준다
```

⚠️ **중첩을 평탄화하지 않으면 마커 8 vs 파싱 3 이 되어 매일 밤 가짜 실패 5건을
찍는다.** 대댓글이 `comment[].comment[]` 에 들어간다. 구현할 때 이걸 놓치면
에펨 사건(round-3 정정 2)의 재판이 된다.

댓글 고유 id 도 있다 — JSON-LD 에는 없지만 임베드 GraphQL 에 있다:

```
{"content":"오천공구요","createdAt":"2026-09-17T03:19:42.255+00:00",
 "__typename":"CommunityArticleComment","subComments":[{"id":"86805102",
 "articleId":"735746410","parentCommentId":"86804156", …}]}
```

### 러너 계약 · SP 점검

- **GET 1요청으로 본문+댓글이 다 온다.** POST·쿠키·커스텀 헤더 불필요 → theqoo 가
  막힌 자리(`nextRequest()` 가 `{ url }` 뿐, `fetchText` 가 GET 고정,
  `FetchOutcome` 에 응답 헤더 없음)를 **밟지 않는다.**
- **SP-026(러너가 쿼리스트링을 빼고 판정)에 걸리지 않는다.** 글 URL 이 경로형
  (`/kr/community/<slug>/`)이고 쿼리가 없다. 단 `Disallow: /kr/community/s/` 는
  경로형 금지라 러너도 정상 판정한다.
- **SP-018 은 해소됨** — 당근 robots 에 와일드카드 규칙은 없지만, 있어도 파서가 본다.
- 증분 종료 성립: 본문·댓글 전부 절대 ISO 일자.
- 1글=1요청이라 `daily_request_cap` 산정이 단순하다.

### 남은 판단 (사람)

1. robots 가 AI 크롤러·범용 수집기 50종을 이름으로 거부하는 상태에서 우리가 갈 것인가
   — 다모앙/SP-025 와 같은 리스크 수용 판단.
2. 약관 전문(브라우저로 열어야 한다) 확인.

**분류: 구현 가능하나 선행 이슈** — 선행 항목은 위 2건이고, 둘 다 **기술 작업이 아니다.**
억지로 우회하지 않았다.

---

## 7. 다음 카페 `cafe.daum.net` (여성시대) — ⛔ 구조적으로 불가

### robots (200 · 127B) — 원문 전체

```
User-agent: *
Allow: /_c21_/home
Allow: /_c21_/bbs_search_read
Allow: /_c21_/bbs_list
Allow: /_c21_/bbs_read

Disallow: /_c21_/
```

파서 판정(최장 일치):

```
/_c21_/bbs_read         => true   'Allow: /_c21_/bbs_read'      (15자)
/_c21_/favor_bbs_read   => false  'Disallow: /_c21_/'           (7자) ← 화면의 인기글 링크가 이것
/subdued20club          => true   '일치하는 규칙 없음'
```

🔴 **화면에 보이는 글 링크 대부분이 `favor_bbs_read` 이고 그건 금지다.** 카페 홈에서
뽑은 링크 10개가 전부 `favor_bbs_read?…&favorMode=view` 였다. 허용된 `bbs_read`
링크는 5개뿐이었다. 목록을 그냥 긁어 따라가면 **금지 경로를 밟는다.**

### 도달 실측 — 200 인데 내용이 회원 등급 벽이다

| URL | HTTP | bytes | 내용 |
|---|---|---|---|
| `/subdued20club` | 200 | **1,612** | 프레임셋 껍데기. `<iframe src="/_c21_/home?grpid=1IHuH">` 하나 |
| `/_c21_/home?grpid=1IHuH` | 200 | 47,324 | 카페 내비 + 인기글 **제목만**. 본문 없음 |
| `/_c21_/bbs_read?grpid=1IHuH&fldid=Lp0T&contentval=CIZcc…` | 200 | 40,721 | ⛔ 권한 안내 |
| `/_c21_/bbs_read?grpid=1IHuH&fldid=WTmI&contentval=00002…` | 200 | 40,737 | ⛔ 권한 안내 (다른 게시판) |

두 게시판 모두 같은 응답이다. 원문 발췌:

```
<h3 class="sub_title line_title_sub"><span class="list_title_sub">자유게시판 게시판 권한 안내</span></h3>
<div class="sub_content_box">
  회원님은 아직 로그인을 하지 않으셨어요. 먼저 로그인을 하시고 이용해주세요.<br />
  Daum 또는 카카오 계정이 없다면, 카카오 계정을 생성한 후 카페에 가입해보세요.<br /><br />
  참고로 이 게시판은 <strong class="txt_point">6등급 이상 읽기</strong>가 가능합니다.
```

**HTTP 200 · 40KB 인데 글 본문이 0자다.** 여성시대는 회원 729,280명 규모의 "공개"
카페지만 **게시판 읽기가 6등급 이상으로 제한**돼 있다. 로그인·가입·등급 상승은
우회 시도이므로 하지 않는다.

### 구조적 문제가 더 있다 (약관을 확인해도 바뀌지 않는다)

- **글 URL 이 전부 쿼리형**(`?grpid=&fldid=&contentval=`) → **SP-026** 에 정면으로
  걸린다. `runner.ts:153` 이 `u.pathname` 만 넘기므로 `/_c21_/bbs_read` 만 보고
  판정한다. 지금 robots 에 쿼리 규칙이 없어 결과는 같지만, 카카오가 쿼리 규칙을
  하나 추가하면 **러너가 그 규칙을 영영 못 본다.**
- 카페마다 게시판 권한이 다르므로 "이 카페는 되나"를 타깃마다 실측해야 한다.
  0건과 권한 벽을 구분할 개수 마커가 권한 벽 페이지에는 없다.
- 이용약관: `/_c21_/agreement` 가 `Disallow: /_c21_/` 에 걸려 **요청하지 않았다**
  → **확인 불가.**

**판정: 구조적으로 불가.** 무엇을 확인하면 되나 — 권한 제한이 없는 공개 게시판을
가진 다른 다음 카페를 찾으면 도달 자체는 가능할 수 있다. 다만 (a) 카페별 실측이
매번 필요하고 (b) SP-026 수정이 선행돼야 하고 (c) 약관을 못 읽는다. 이 셋을 다
풀 값이 있는지는 별 판단이다.

---

## 8. 왓챠피디아 `pedia.watcha.com` — ⛔ 구조적으로 불가 (작성일이 없다)

### robots (200 · 1,225B)

`*` 그룹: `Disallow: /_/` `/keywordjp` `/api` `/abacus`.
`/ko/contents/<id>` · `/ko/contents/<id>/comments` → `allowed=true (일치하는 규칙 없음)`.

명시 UA 41개 중 **36개가 `Disallow: /`** 다. 그중 AI 크롤러 11종:
`anthropic-ai` · `ClaudeBot` · `GPTBot` · `CCBot` · `Google-Extended` ·
`Applebot-Extended` · `Bytespider` · `meta-externalagent` · `FacebookBot` ·
`ImagesiftBot` · `Amazonbot`. 나머지는 SEO·아카이브 봇(AhrefsBot·SemrushBot·
MJ12bot·heritrix·archive.org_bot·Baiduspider·Yandex 등)이다 —
**"봇 일반을 좁게 허용하고 넓게 막는" 형태**다.

### 도달 실측 — 코멘트 프리뷰 8건은 온다

`https://pedia.watcha.com/ko/contents/m6dRLWy` (타짜, 200 · 241,274B).
`application/ld+json` 은 `Movie`(제목·줄거리·장르)까지만이고, 코멘트는 일반 HTML 에 있다.
코멘트 섹션(43,777B) 평문화:

```
코멘트 | 10000+ | 더보기
Sun-yun Kwon | 5.0 | "이제 소리 끄고도 볼 수 있음" | 좋아요 2869 | 댓글 29
이동진 평론가 | 4.5 | "2시간 19분이 1시간 19분처럼 지나간다." | 좋아요 1142 | 댓글 4
이승준 | 5.0 | "극강의 스타일리쉬.\n한국영화 중 이렇게까지 캐릭터 하나하나를 완벽하게 살려낸
              작품이 있을까싶다.\n조승우의 혼잣말, 김혜수의 콧소리, 유해진의 웃음소리…" | 좋아요 1022 | 댓글 6
… (총 8건)
더 많은 코멘트를 보려면 로그인해 주세요!  [로그인 하기]
```

고유 id 도 있다 — `href="/ko/comments/xplMddw4OM4oL"` 형태로 8건 전부.

### 🔴 탈락 사유 셋

1. **작성일이 없다.** 코멘트 섹션에 `<time>` 태그 0개, `20xx-xx` / `20xx.xx` 꼴
   날짜 문자열 0개. `naver_cafe` 가 **응답에 작성일이 없어서** 증분 종료 불성립으로
   차단된 것과 **정확히 같은 사유**다. 순서로 날짜를 추정하면 어긋난 날짜를 조용히
   붙이게 된다(다모앙 댓글에서 이미 안 하기로 한 것).
2. **페이지네이션이 로그인 벽이다.** `/ko/contents/m6dRLWy/comments` 는
   `→ /ko/sign_in?referer_url=%2Fko%2Fcontents%2Fm6dRLWy%2Fcomments` 로 리다이렉트된다
   (HTTP 200 이지만 최종 URL 이 로그인 페이지다). 프리뷰 8건이 상한이다.
3. **개수 마커가 정확값이 아니다.** `10000+` 라서 "선언 N vs 수집 M" 대조를 못 한다.
   컨테이너 소실과 0건을 구분할 수단이 사라진다(§7.1).

### 이용약관 — **확인 불가**

푸터의 "왓챠피디아 서비스 이용 약관"이 `<li data-select="footer-agreement">` 로
**href 가 없는 JS 요소**다. `pedia.watcha.com/ko/terms`(404) ·
`watcha.com/ko/terms`(404, `/ko/browse/all` 로 리다이렉트) 둘 다 실패.
→ **확인 불가이지 허용이 아니다.** 무엇을 확인하면 되나: 사람이 브라우저에서
푸터 링크를 클릭해 실제 약관 URL 을 확보하면 된다.

### 덧붙여 — 카테고리 적합성

왓챠피디아는 영화·드라마·책 평이다. 이 회사가 다루는 제품(탈모샴푸·유산균·
무선이어폰 등) VOC 와 접점이 없다. 위 셋이 풀려도 우선순위가 낮다.

**판정: 구조적으로 불가.** 작성일 없음 하나로 이미 러너 계약을 못 맞춘다.

---

## 9. 여행 3곳 — 여기어때 / 야놀자 / 마이리얼트립

한 절로 묶어 쓰되 **판정은 각각 다르다.**

### 🔴 정정 — 여기어때의 호스트가 바뀌었다 (goodchoice.kr → yeogi.com)

이게 이번 조사에서 제일 중요한 발견이다. **`www.goodchoice.kr` 은 이제
`www.yeogi.com` 으로 리다이렉트된다**(리브랜딩). 실측:

```
GET https://www.goodchoice.kr/  →  200,  final URL = https://www.yeogi.com/
```

`goodchoice.kr/robots.txt` 는 200 으로 따로 존재하는데, 그 내용이 이렇다:

```
User-agent: Googlebot
Disallow:/reservation
…
Allow:/
User-agent: Yeti
Disallow:/reservation
Allow: /
```

**`User-agent: *` 그룹이 없다.** 그래서 우리 파서는
`해당하는 User-agent 그룹 없음 → allowed=true` 를 돌려준다. RFC 9309 대로는 맞지만,
**이 파일은 실제로 콘텐츠를 서빙하지 않는 호스트의 것이다.** 규율하는 robots 는
`www.yeogi.com/robots.txt`(200 · 5,671B · 13 그룹)다.

> **같은 실수를 하지 않으려면**: 리다이렉트되는 도메인의 robots 로 판정하지 마라.
> 최종 호스트의 robots 를 읽어야 한다. 이 리포의 프로브는 robots 를
> `new URL(url).origin` 으로 가져오므로, 어댑터 HOST 를 `goodchoice.kr` 로 적으면
> **엉뚱한 파일로 판정한다.**

#### 9a. 여기어때 `www.yeogi.com` — ⛔ 구조적으로 불가

robots 가 특이하다. **AI 크롤러를 이름으로 지목해서 `Allow: /` 한다** — 2026년
흐름의 반대다. 그룹 13개: `GPTBot` · `PerplexityBot` · `Bingbot` ·
`Google-Extended` · `Applebot` · `ClaudeBot` · `CCBot` · `Amazonbot` ·
`Bytespider` · `meta-externalagent` · `Google-HotelAdsVerifier`(2개) · `*`.
각 그룹이 동일한 형태다:

```
User-agent: ClaudeBot
Allow: /
Disallow: /share/
Disallow: /_next/data/
Disallow: /*?keyword=
Disallow: /*&keyword=
Disallow: /api/gateway/web-product-api/…
```

`*` 그룹도 같다. 파서 판정: `/domestic-accommodations/1000` → `true (Allow: /)`.

**그런데 실제 요청이 Cloudflare 403 이다.**

```
GET https://www.yeogi.com/domestic-accommodations/1000
→ 403 · 5,844B · <title>Attention Required! | Cloudflare</title>
```

robots·sitemap 은 200 으로 잘 주는데(sitemap 에 숙소 URL 22,519개) 상세 페이지에서
막는다. 잡플래닛과 같은 형태다. 우회하지 않는다.

이용약관 `/policy/terms` 는 200(23,945B)이지만 **평문 81자** — CSR 껍데기라
**확인 불가**.

⚠️ `Disallow: /*?keyword=` 는 쿼리 대상 규칙이다. 나중에 여기어때를 다시 볼 때
검색 URL 을 쓰려면 **SP-026 수정이 선행되어야 한다**(러너가 쿼리를 못 본다).

**판정: 구조적으로 불가.** robots 는 우리를 환영하는데 WAF 가 막는다.
무엇을 확인하면 되나 — 여기어때에 봇 허용 문의를 하거나 공식 API 가 있는지 확인.
그건 사람의 일이다.

#### 9b. 야놀자 `nol.yanolja.com` — ⚠️ 구현 가능하나 선행 이슈

`www.yanolja.com` 도 리다이렉트된다 → `nol.yanolja.com`. robots(200 · 269B) 원문:

```
User-Agent: *
Allow: /
Disallow: /search/
Disallow: /discovery/
Disallow: /visitorlogin/
Disallow: /visitorlogin?
Disallow: /member/
Disallow: /mypage/
Disallow: /order/
Disallow: /recent-product/
Disallow: /reviews/
```

파서 판정:

```
/stay/1000      => true   'Allow: /'
/reviews/1000   => false  'Disallow: /reviews/'     ← 리뷰 경로는 명시 금지
```

**AI 크롤러 이름 차단은 없다.**

##### 도달 실측 — 금지된 `/reviews/` 대신 허용된 숙소 상세에 리뷰가 실려 온다

```
GET https://nol.yanolja.com/stay/domestic/24906
→ 200 · 393,820B · utf-8 · Next.js RSC 페이로드(self.__next_f ×24)
```

페이로드 안(3중 이스케이프된 JSON 문자열):

```
"aggregateRating":{"ratingValue":4.8077,"reviewCount":5121}
"review":{"hasScore":true,"score":4.8,"reviewCount":5121,"replyCount":3373,
 "reviewSummaries":[
  {"id":22457180,"isBest":true,"createdAt":"2026.04.01","score":5,"nickName":"양갱입***",
   "roomTypeName":"Deluxe",
   "content":["이번에 이용한 숙소는 전반적으로 만족스러웠습니다. 위치가 좋아서 이동하기 편했고, …",
              "객실에 들어갔을 때 가장 먼저 느낀 점은 청결함이었는데, …",
              "아쉬운 점을 굳이 꼽자면 방음이 약간 아쉬운 부분이 있었지만, 크게 불편할 정도는 아니었습니다."]},
  {"id":21773078,"createdAt":"2025.11.11","score":5,"nickName":"ks*",
   "content":["전체적으로 청결도가 높았고, 특히 욕실이 넓고 깨끗해서 좋았습니다. 10월이라 에어컨을
              사용하진 않았지만 에어컨 관리상태도 좋아 보였습니다."]},
  {"id":20429630,"createdAt":"2025.01.09","score":5,"nickName":"쿠키lov*",
   "content":["체크인 할 때 저녁에 응대 해주셨던 사장님도 오전에 체크아웃 할 때 응대 해주셨던 사장님도
              아이 귀여워해주시고 또 두분 다 친절하세용ㅎㅎ 숙소도 깨끗하고 …"]},
  … 고유 id 10건
 ]}
```

- 고유 id(`id`) · 작성일(`createdAt` `YYYY.MM.DD`) · 별점(`score`) · 본문 전문
  (`content[]` 문단 배열) · 객실 타입까지 온다
- 개수 마커 `reviewCount: 5121`, 프리뷰는 **10건 상한** → 5121 vs 10 은 **정상**이다
  (텀블벅 `totalReviewCount` 66 vs 프리뷰 4 와 같은 처리 필요)
- sitemap `/stay/sitemap-places1..N.xml.gz` 에 숙소 URL 50,000개씩 → 타깃 발굴 가능
- GET 1요청. POST·쿠키 불필요 → 러너 계약 안에 들어온다

##### 🔴 선행 이슈 4건

1. **의사 충돌 — 사람이 판단해야 한다.** 사이트가 `Disallow: /reviews/` 로
   "리뷰는 긁지 마라"를 명시했는데, 리뷰 프리뷰가 허용된 `/stay/` 경로에 실려 온다.
   **기계적 판정은 허용**이지만 의사는 분명히 반대 방향이다. 이건 다모앙/SP-025 와
   같은 성격의 판단이고 구현자가 정할 일이 아니다.
2. **이용약관 확인 불가.** 약관은 `https://accounts.yanolja.com/policy?type=service`
   에 있는데 그 호스트 robots 가 **`Disallow: /`** 다 → 파서가 막아 요청하지 않았다.
   `nol.yanolja.com/terms` 는 404. → **확인 불가이지 허용이 아니다.**
   무엇을 확인하면 되나: 사람이 브라우저로 그 URL 을 열면 된다.
3. **증분 종료가 "프리뷰 변동 감지"로만 성립한다.** 페이지네이션 경로가
   `/reviews/`(금지)라 더 못 간다. 프리뷰 10건은 `isBest` 정렬이 섞여 있어
   시간 역순이 아니다(2026.04 → 2025.11 → 2025.01 → 2026.02 순으로 왔다).
   **HN 에서 `search` 대신 `search_by_date` 를 쓴 이유와 같은 함정**이다 —
   연속 STALE 종료를 그대로 쓰면 첫 페이지에서 조기 종료한다. 어댑터가
   10건 전부를 읽고 닫는 구조여야 한다.
4. **RSC 3중 이스케이프 파싱이 취약하다.** `self.__next_f.push` 안의 문자열을
   `\\\\`→`\\`, `\\"`→`"` 로 3회 풀어야 JSON 이 된다. Next.js 버전이 올라가면
   깨진다. 개수 마커(`reviewCount`) 대조가 그때 시끄럽게 실패해야 한다.

##### ⚠️ 데이터 품질 경고 — 이 리뷰들을 그대로 믿으면 안 된다

프리뷰 10건 중 **id 가 다른 2건이 완전히 동일한 본문**이었다:

```
id 22225478  createdAt 2026.02.09  nickName 부들부********
id 22225485  createdAt 2026.02.09  nickName 부들부********
content 완전 일치: "이번에 이용한 이 모텔은 전반적으로 만족도가 꽤 높았습니다. 외관은 평범했지만
          객실에 들어가자마자 깔끔하게 정리된 상태가 인상적이었고, 침구에서도 불쾌한 냄새 없이 …"
```

그리고 여러 건이 **같은 템플릿으로 읽힌다** — "이번에 이용한 숙소는 전반적으로
만족스러웠습니다 / 위치가 좋아서 / 청결함이었는데 / 아쉬운 점을 굳이 꼽자면
방음이" 식의 구성이 반복된다. 사람이 쓴 짧은 리뷰(`ks*`, `쿠키lov*`)와 문체가
확연히 다르다.

**이걸 VOC 로 적재하면 "숙소는 대체로 만족스럽고 방음이 아쉽다"는 가짜 신호가
쌓인다.** 지문(`identity_key = sha256(sourceKey|productRef|externalId)`)은 id 가
달라서 **중복을 걸러 주지 않는다** — 텀블벅에서 겪은 것과 같은 자리다.
켜기로 결정되면 본문 해시 기준 중복 제거와 템플릿 탐지가 어댑터에 들어가야 한다.

**판정: 구현 가능하나 선행 이슈** — (1) `/reviews/` 금지 의사와의 충돌 판단,
(2) 약관 열람(사람), (3) 프리뷰 정렬이 시간 역순이 아니라는 전제의 종료 로직,
(4) 동일 본문·템플릿 리뷰 중복 제거. **(1)·(2)는 기술 작업이 아니다.**

#### 9c. 마이리얼트립 `www.myrealtrip.com` — ⛔ 규칙상 금지

robots 는 `https://www.myrealtrip.com/main/robots-root.txt` 로 서빙된다
(200 · 1,570B · 4 그룹). 첫 그룹이 이것이다:

```
User-agent: *
Disallow: /
```

파서 판정:

```
/offers/123          => false  'Disallow: /'
/offers/123/reviews  => false  'Disallow: /'
```

**어떤 페이지도 요청하지 않았다.** 이용약관은 그래서 **확인 불가**이고, robots
단계에서 이미 끝났다(네이버 스마트스토어·11번가·무신사·Trustpilot 과 같은 형태).

**판정: 규칙상 금지.**

#### ⚠️ 여기에 오해하기 쉬운 자리가 있다 — 이름 붙은 AI 크롤러는 **허용**이다

robots 뒷부분 원문:

```
# LLM/AI 크롤러 - 상품 정보 수집 허용
User-agent: GPTBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: CCBot
User-agent: Bytespider
User-agent: DuckAssistBot
User-agent: Applebot-Extended
User-agent: meta-externalagent
User-agent: meta-externalfetcher
User-agent: OAI-SearchBot
User-agent: YouBot
User-agent: Amazonbot
User-agent: cohere-ai
User-agent: Diffbot
User-agent: Omgilibot
User-agent: ImagesiftBot
Allow: /
```

파서로 세면 **전면금지 명시 UA 0개, 명시허용 22개**다(검색엔진 7종 + Ads-Naver +
AI 22종 중 일부 중복 제외). 즉 마이리얼트립은 AI 크롤러를 차단하는 사이트가
**아니라**, 이름을 아는 봇에게만 문을 열고 **모르는 봇을 전부 막는 화이트리스트**
사이트다. SLR클럽과 구조가 같다.

**우리 UA(`solutionarchive-review-collector`)는 목록에 없으므로 `*` 를 받는다 →
`Disallow: /`.** 되살리려면 마이리얼트립이 우리 UA 를 목록에 넣어 주는 것 말고는
없다. ClaudeBot 등의 이름을 빌려 쓰는 것은 UA 위장이라 하지 않는다.

이건 **초안·백로그에 "AI 크롤러 차단이 표준"이라고 적어 둔 전제가 이 후보에는
틀렸다**는 뜻이기도 하다. 결론(금지)은 같지만 근거가 다르다.

---

## 조사 중 발견한 기존 판정·전제의 오류 3건

### 정정 1 — SP-018 은 이미 해소됐다. 지시서의 전제가 낡았다

CEO-STAFF 지시서는 "SP-018: robots 파서가 와일드카드 `*` / `$` 를 미구현"을
살아 있는 제약으로 적었다. **구현돼 있다.** `lib/review/robots.ts` 의
`pathMatches()` 가 투포인터 글롭 매처로 `*` 를, 패턴 끝 `$` 를 앵커로 처리한다
(정규식 백트래킹 ReDoS 를 피하려고 정규식을 버린 구현이다).
`docs/review-source-findings.md` 337~361행에도 2026-09-16 정정 블록이 이미 붙어 있다
(`fix/robots-wildcard` 로 수정, 그 결과 appstore 위반이 드러나 `enabled=false` — SP-019/021).

이번 조사에서 실제로 와일드카드 규칙 3종을 통과시켜 확인했다:

```
jobplanet  Disallow: /companies/*/salaries_of_job_rank/   → 정상 매칭
slrclub    Allow: /$                                       → 루트만 매칭
yeogi      Disallow: /*?keyword=                           → 정상 매칭
```

**따라서 "와일드카드로 금지를 적은 사이트라 규칙을 온전히 못 본다"는 이유로
후보를 보류할 근거는 없다.** 퀘이사존·루리웹 판정도 이 전제 위에 있었다면
다시 봐야 한다(이번 A군 범위 밖이라 조사하지 않았다).

### 정정 2 — SP-026 은 그대로 살아 있다 (미수정 확인)

```
lib/review/runner.ts:153
    return robotsVerdict(cached, u.pathname, PRODUCT_TOKEN)
    //                          ^^^^^^^^^^ u.search 가 없다
```

A군 후보 중 **글 URL 이 쿼리형인 것 2곳**이 여기 걸린다:

- **다음 카페** — `/_c21_/bbs_read?grpid=…&fldid=…&contentval=…`
- **캐치** — `/Comp/ReviewInfo/<id>?Target=Review`

둘 다 다른 사유로 이미 불가 판정이라 **지금 SP-026 이 차단 사유는 아니다.**
반대로 "구현 가능하나 선행 이슈"로 남긴 **당근·야놀자는 글 URL 이 경로형이라
SP-026 을 밟지 않는다.** 즉 이번 A군에서는 SP-026 이 어느 후보의 선행 조건도 아니다.

단, 여기어때(`Disallow: /*?keyword=`)와 야놀자(`Disallow: /visitorlogin?`)는
쿼리 대상 규칙을 갖고 있다. **검색 URL 로 타깃을 발굴하는 설계를 붙이는 순간
SP-026 수정이 선행되어야 한다.**

### 정정 3 — `goodchoice.kr` 은 더 이상 콘텐츠 호스트가 아니다

위 §9 에 적은 대로 `www.yeogi.com` 으로 리다이렉트된다. 지시서·백로그에
"여기어때 `goodchoice.kr`" 로 적혀 있는데, 그 호스트의 robots(`*` 그룹 없음)로
판정하면 **규율하지 않는 파일을 읽고 허용 결론을 낸다.** 백로그 항목의 도메인을
`yeogi.com` 으로 고쳐야 한다.

### 정정 4 — "2026년엔 AI 크롤러를 이름으로 막는 게 표준" 이 절반만 맞다

지시서의 전제다. 절반은 실측으로 확인됐다(당근 51종 · 왓챠 36종 · 블라인드 7종).
**나머지 절반은 반대 방향이었다** — 여행 플랫폼 둘이 AI 크롤러를 **이름으로 허용**한다:

- 여기어때: `User-agent: ClaudeBot` / `Allow: /` (GPTBot·CCBot·PerplexityBot 동일)
- 마이리얼트립: `# LLM/AI 크롤러 - 상품 정보 수집 허용` 주석 + 22종에 `Allow: /`

그래서 robots 를 "AI 차단 여부"로 요약하면 두 번 틀린다:

1. **허용처럼 보이는데 막힌 경우** — 마이리얼트립은 AI 크롤러를 허용하지만
   `*` 는 `Disallow: /` 다. 우리는 `*` 다.
2. **차단처럼 보이는데 판정은 허용인 경우** — 당근·왓챠·블라인드는 AI 크롤러를
   막지만 우리 UA 는 목록에 없어 기계적 판정이 `true` 다. 이건 §7.1 이 말하는
   "확인 불가를 양성으로 접는" 자리이고, 사람 판단으로 올려야 한다.

**요약하지 말고 매번 파서를 돌려라.** 그게 이번 조사에서 얻은 유일한 절차적 결론이다.

## 러너 계약 점검 요약

`ReviewSourceAdapter.nextRequest()` 반환형이 `{ url: string }` 뿐이고
`RunnerPorts.fetchText(url)` 은 GET 고정, `FetchOutcome` 에 응답 헤더가 없다
(theqoo 댓글이 여기서 막혔다). A군 후보 중 **POST·쿠키·커스텀 헤더를 요구하는
경로에 의존하는 후보는 없었다.** 남은 두 후보(당근·야놀자)는 둘 다 GET 1요청으로
본문·댓글/리뷰가 다 온다.

## 하지 않은 것

- UA 위장 — 하지 않았다. 403 이 답이다(잡플래닛·여기어때)
- robots Disallow 경로 요청 — 요청 자체를 보내지 않았다
  (SLR클럽 전 경로 · 마이리얼트립 전 경로 · 캐치 `/Member/AccessTerms` ·
   잡플래닛 `/welcome/terms` · 야놀자 약관 호스트 · 다음 카페 `favor_bbs_read`)
- 로그인·쿠키·CSRF 우회 — 시도하지 않았다(캐치·왓챠·다음 카페)
- headless 브라우저 — 띄우지 않았다(당근·여기어때 약관이 CSR 이지만 그대로 뒀다)
- 재시도·프록시·IP 로테이션 — 없음
- 어댑터·마이그레이션 구현 — **없음.** `review_sources` 에 행을 추가하지 않았고
  DB 를 읽지도 쓰지도 않았다
