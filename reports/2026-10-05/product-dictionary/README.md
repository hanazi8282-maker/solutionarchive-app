# 제품 사전 — 영역 ④~⑦ (남헌 지시 v17 B, 2026-10-05)

영역 ①AI 회의록·통화 요약 ②AI 고객상담 에이전트 ③AI 영업 도우미 사전은 이 커밋 시점에 리포 어디에도 없었다
(origin/main·워크트리 전체 검색 0건). 그래서 형식을 여기서 새로 정했다. ①~③ 사전이 다른 형식으로 들어오면
둘 중 하나로 맞춰야 한다.

## 파일

- `area-04-marketing-content.json` — ④ 마케팅 콘텐츠·광고 소재
- `area-05-writing-docs.json` — ⑤ 글쓰기·문서
- `area-06-recruiting-hr.json` — ⑥ 채용·HR
- `area-07-ecommerce-ops.json` — ⑦ 이커머스 운영 도구

영역마다 `scope`(포함·제외 기준)와 `kr_search_queries`(한국 제품을 찾을 때 실제로 돌린 검색어)가 들어 있다.
한국 제품 목록이 빠짐없는지는 이 검색어로 감사한다.

## 소스 등록부와 잇는 방법

- 제품마다 `slug` 가 있고 네 파일 전체에서 중복이 없다. 뤼튼(`wrtn`)은 ⑤에만 있다.
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

- ④ 해외 20 · 한국 14 = 34
- ⑤ 해외 20 · 한국 13 = 33
- ⑥ 해외 20 · 한국 40 = 60
- ⑦ 해외 20 · 한국 28 = 48

## 확인 불가 건수

소스 칸(제품 × 5개 소스, 검색어 칸 제외) 기준이다.

- ④ 28칸 — 전부 한국 제품의 Capterra·TrustRadius
- ⑤ 26칸 — 한국 제품 Capterra·TrustRadius 25칸 + Craft Docs Capterra 1칸(같은 제품인지 확인 못 함)
- ⑥ 80칸 — 전부 한국 제품의 Capterra·TrustRadius
- ⑦ 56칸 — 전부 한국 제품의 Capterra·TrustRadius

한국 제품의 Capterra·TrustRadius 칸이 전부 비어 있는 이유는 하나다. 조사 도중 세션 WebSearch 한도(200회)가
다 떨어졌다. 두 사이트는 직접 열면 403(Cloudflare)을 돌려줘서 다른 확인 경로가 없었다. 검색 한도가 있는
세션에서 이 189칸만 다시 돌리면 채워진다.

제품 필드에서 확인 불가인 것은 9곳이다.

- 공식 URL: astarmize, designstaff(④) · clova-x(서비스 종료), clova-for-writing(⑤) · stead, wiselection, metajob(⑥) · sellerbox(⑦)
- 한국어명 근거: wiselection(⑥)

## 쓰기 전에 알아둘 것

- **TrustRadius 약한 확인.** 제품 단독 페이지가 아니라 비교·경쟁사·가격 페이지만 보고 `확인` 한 칸이 있다.
  `evidence` 에 그 사정이 적혀 있다. 예: Writesonic, Copy.ai, Ocoya, Typeface(④) · ProWritingAid, Sudowrite,
  Gamma, Tome, LanguageTool, Ginger(⑤) · Ashby(⑥) · Triple Whale, Inventory Planner, Judge.me, Helium 10, Smile.io,
  Linnworks, Omnisend, Jungle Scout(⑦). 수집 대상으로 쓰기 전에 제품 리뷰 페이지 URL 을 다시 확인해야 한다.
- **앱은 있지만 리뷰어가 다르다.** AfterShip 앱은 소비자용 배송조회 앱이라 리뷰어가 셀러가 아니다. 잡다 앱은
  구직자용이다. 둘 다 `summary_ko`·`evidence` 에 적었다.
- **DeepL Write** 는 단독 등록이 없어서 DeepL 통합 앱·페이지로 `확인` 했다. 이 파일에서 가장 느슨한 매칭이다.
- **서비스 종료**: Tome(프레젠테이션, 2025-04-30), CLOVA X(2026-04-09). 근거 URL 이 `summary_ko` 에 있다.
- **Capterra·G2 수집 자체는 막혀 있다.** Capterra 는 403(Cloudflare)이고 G2 는 약관이 수집을 금지한다
  (`docs/review-source-findings.md`, `ops/state/source-review-queue.md`). 이 사전의 Capterra 칸은 "페이지가 있다"는
  뜻일 뿐이다. 수집 가능 여부는 소스 등록 때 `docs/review-collection-design.md` §1.2 로 따로 판정해야 한다.
- 상위 20 선정 근거(랭킹 기사)를 직접 확인하지 못한 해외 제품이 있다: ④ Pencil, Foreplay, Motion, Arcads, Omneky.
  `selection_basis` 는 Capterra 등록 같은 약한 근거뿐이고, 일부에만 "랭킹 근거 미확인" 이 적혀 있다.
