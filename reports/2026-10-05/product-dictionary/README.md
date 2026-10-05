# 제품 사전 — 영역 ①~⑦ (남헌 지시 v17 B · v19 D, 2026-10-05)

④~⑦(v17 B)을 먼저 만들 때 ①~③ 사전은 리포에 없어서 형식을 그때 새로 정했다. ①~③(v19 D)은 그 형식을
그대로 따른다. 키 순서와 상태값까지 같다.

## 파일

- `area-01-meeting-notes.json` — ① AI 회의록·통화 요약
- `area-02-cs-agent.json` — ② AI 고객상담 에이전트
- `area-03-sales-assistant.json` — ③ AI 영업 도우미
- `area-04-marketing-content.json` — ④ 마케팅 콘텐츠·광고 소재
- `area-05-writing-docs.json` — ⑤ 글쓰기·문서
- `area-06-recruiting-hr.json` — ⑥ 채용·HR
- `area-07-ecommerce-ops.json` — ⑦ 이커머스 운영 도구

영역마다 `scope`(포함·제외 기준)와 `kr_search_queries`(한국 제품을 찾을 때 실제로 돌린 검색어)가 들어 있다.
한국 제품 목록이 빠짐없는지는 이 검색어로 감사한다.

## 소스 등록부와 잇는 방법

- 제품마다 `slug` 가 있고 일곱 파일 전체에서 중복이 없다(254개). 뤼튼(`wrtn`)은 ⑤에만 있다.
- `sources.<소스>.key` = `<slug>:<소스>`. 이 문자열이 제품×소스 조합 키다(예: `klaviyo:shopify_apps`).
- 소스 6개: `googleplay` · `appstore` · `capterra` · `trustradius` · `shopify_apps` · `daum_search`.
  리포 어댑터 키와 같은 것은 `appstore` 하나뿐이다. 나머지 다섯은 어댑터가 없어 새로 붙인 이름이다.
- `googleplay.id` 는 패키지명, `appstore.id` 는 숫자 ID다. 개발사명이 제품 회사와 맞는 것만 넣었다.

## 상태값 (3상태 원칙, `_principles.md` §1)

- `확인` — 그 소스에 이 제품 페이지가 있음을 URL 로 확인했다.
- `미발견` — 검색해 봤는데 못 찾았다. 약한 음성이다. 근거로 쓴 검색어가 `evidence` 에 있다.
- `확인 불가` — 조회 자체를 못 했다. 사유가 `evidence` 에 있다.
- `검색어` — `daum_search` 전용이다. 사실 주장이 아니고 리뷰 수집에 쓸 검색어 후보다.

## 제품 수

- ① 해외 20 · 한국 11 = 31
- ② 해외 20 · 한국 6 = 26
- ③ 해외 20 · 한국 2 = 22
- ④ 해외 20 · 한국 14 = 34
- ⑤ 해외 20 · 한국 13 = 33
- ⑥ 해외 20 · 한국 40 = 60
- ⑦ 해외 20 · 한국 28 = 48

## 확인 불가 건수

소스 칸(제품 × 5개 소스, 검색어 칸 제외) 기준이다.

- ① 63칸 — Capterra·TrustRadius 62칸(해외·한국 전부) + Meeting OS App Store 1칸(판매자가 개인이라 같은 주체인지 확인 못 함)
- ② 55칸 — Capterra·TrustRadius 52칸 + Yellow.ai App Store(판매자 개인) + 채널톡 Play·App Store(앱 이름이 '채널웍스'라 채널톡 앱인지 확인 못 함)
- ③ 45칸 — Capterra·TrustRadius 44칸 + Outreach App Store 1칸(판매자 COMPONENTLAB INC)
- ④ 28칸 — 전부 한국 제품의 Capterra·TrustRadius
- ⑤ 26칸 — 한국 제품 Capterra·TrustRadius 25칸 + Craft Docs Capterra 1칸(같은 제품인지 확인 못 함)
- ⑥ 80칸 — 전부 한국 제품의 Capterra·TrustRadius
- ⑦ 56칸 — 전부 한국 제품의 Capterra·TrustRadius

④~⑦은 조사 도중 세션 WebSearch 한도(200회)가 떨어져서 한국 제품의 Capterra·TrustRadius 칸만 비었다.
①~③은 사정이 더 나쁘다. **시작할 때 이미 한도가 0이어서 WebSearch 를 한 번도 못 돌렸다.** 그래서 해외
제품까지 포함한 ①~③의 Capterra·TrustRadius 158칸이 전부 확인 불가다. 두 사이트는 직접 열면 403(Cloudflare)이고
(curl·WebFetch 둘 다), DuckDuckGo HTML 검색은 봇 확인(CAPTCHA) 페이지를 돌려줬다. 우회는 하지 않았다.
검색 한도가 있는 세션에서 ①~⑦의 Capterra·TrustRadius 347칸(①~③ 158 + ④~⑦ 189)을 다시 돌리면 채워진다.

①~③에서 WebSearch 없이 쓴 경로는 이렇다.

- Google Play 상세·검색 페이지, iTunes Search·Lookup API, Shopify 앱 자동완성 API(`apps.shopify.com/search/autocomplete`)
- 공식 사이트 직접 접속(200 응답과 페이지 제목). 403 인 곳은 WebFetch 로 한 번 더 열었다
- 앱 판매자명이 제품명과 다르면 공식 사이트의 앱 링크·약관·임프린트에서 법인명을 대조했다(tl;dv·MeetGeek·Jamie·Notta·Instantly)

제품 필드에서 확인 불가인 것은 다음과 같다.

- 공식 URL: kt-ai-call-assistant(②, Play 개발자 링크가 '상품종료' 페이지) · astarmize, designstaff(④) ·
  clova-x(서비스 종료), clova-for-writing(⑤) · stead, wiselection, metajob(⑥) · sellerbox(⑦)
- 한국어명 근거: wiselection(⑥)
- **①~③ 해외 60개 전부의 상위 20 선정 근거.** 랭킹 기사를 하나도 조회하지 못했다. `selection_basis` 에는
  "랭킹 근거 미확인"과, 앱이 있으면 App Store(us) 평가 수만 적었다. 후보는 조사자가 아는 업계 대표 제품이고
  공식 사이트 200 응답으로 존재만 확인했다. 랭킹으로 검증하면 바뀔 수 있다.

## ①~③ 후보 배치 (남헌 v19 D 의 구글 플레이 후보 14개)

- ① 배치: 클로바노트 · 에이닷(통화요약은 '에이닷 전화' 앱) · 다글로 · 티로 · 콜라보(Callabo, 리턴제로 AI 회의록 — Play 검색 '콜라보' 1위) ·
  리멤버(본 앱이 아니라 같은 회사의 'AI 녹음기' 리멤버 노트로 넣었다)
- ② 배치: 채널톡 · 해피톡
- 미배치: 뤼튼(이미 ⑤ `wrtn`, slug 중복 금지) · 라이너(AI 검색·리서치) · 잔디(협업 메신저) · 플렉스(HR, 이미 ⑥ `flex`) ·
  플로우(협업툴) · 두레이(협업·그룹웨어) — 셋 중 어느 영역의 주력 제품도 아니다
- 후보 밖에서 Play 검색·공식 사이트로 찾아 넣은 한국 제품: 비토 · 익시오 · 회의록(Hoirock) · AI 회의록 Meeting OS · 콜록(①) ·
  KT AI 통화비서 · 와이즈넛 · 스켈터랩스 · 단비(②) · 세일즈맵 · 딥세일즈(③)
- 보고 제외: 마음AI(홈페이지가 로봇 Physical AI 로 바뀜) · 올거나이즈(/ko 404, 고객상담 제품 확인 못 함) · Sendbird(한국 기업 여부를
  페이지에서 확인 못 함) · 헬프유(원격지원) — 근거가 생기면 넣는다

## 쓰기 전에 알아둘 것

- **①~③ 한국 목록은 '전부'라고 장담하지 못한다.** WebSearch 없이 Play 검색과 이미 아는 후보만으로 찾았다.
  특히 ③ 한국 2개, ② 구축형 AICC(통신사·대기업 컨택센터 AI)는 웹 검색으로 다시 훑어야 한다.
- **TrustRadius 약한 확인.** 제품 단독 페이지가 아니라 비교·경쟁사·가격 페이지만 보고 `확인` 한 칸이 있다.
  `evidence` 에 그 사정이 적혀 있다. 예: Writesonic, Copy.ai, Ocoya, Typeface(④) · ProWritingAid, Sudowrite,
  Gamma, Tome, LanguageTool, Ginger(⑤) · Ashby(⑥) · Triple Whale, Inventory Planner, Judge.me, Helium 10, Smile.io,
  Linnworks, Omnisend, Jungle Scout(⑦). 수집 대상으로 쓰기 전에 제품 리뷰 페이지 URL 을 다시 확인해야 한다.
- **앱은 있지만 리뷰어가 다르거나 범위가 넓다.** AfterShip 앱은 소비자용 배송조회 앱이라 리뷰어가 셀러가 아니다. 잡다 앱은
  구직자용이다. ②의 Intercom·Zendesk·Yellow.ai·Freshdesk 앱은 상담함·헬프데스크 앱이라 리뷰가 AI 에이전트 자체를 평가하지 않을 수 있다.
  ③ HubSpot Sales Hub 의 앱·Shopify 칸은 HubSpot 범용 CRM 앱이다(느슨한 매칭). 전부 `summary_ko`·`evidence` 에 적었다.
- **DeepL Write** 는 단독 등록이 없어서 DeepL 통합 앱·페이지로 `확인` 했다. ④~⑦에서 가장 느슨한 매칭이다.
- **서비스 종료·리다이렉트**: Tome(프레젠테이션, 2025-04-30), CLOVA X(2026-04-09). ①~③은 2026-10-05 실측으로
  clari.com → salesloft.com, people.ai → backstory.ai, outreach.io → outreach.ai, fellow.app → fellow.ai,
  gladly.com → gladly.ai 로 넘어간다. Supernormal 은 홈페이지 제목이 "AI agent for agencies" 로 바뀌었다.
- **Capterra·G2 수집 자체는 막혀 있다.** Capterra 는 403(Cloudflare)이고 G2 는 약관이 수집을 금지한다
  (`docs/review-source-findings.md`, `ops/state/source-review-queue.md`). 이 사전의 Capterra 칸은 "페이지가 있다"는
  뜻일 뿐이다. 수집 가능 여부는 소스 등록 때 `docs/review-collection-design.md` §1.2 로 따로 판정해야 한다.
- 상위 20 선정 근거(랭킹 기사)를 직접 확인하지 못한 해외 제품이 있다: ④ Pencil, Foreplay, Motion, Arcads, Omneky,
  그리고 ①~③ 해외 60개 전부(위 확인 불가 절).
