# 소스별 한도표 (남헌 v24 #1, 2026-10-06)

범위: review_sources 26행 + googleplay(등록 예정). 코드·DB 변경 없음, 보고서 한 편.

## 읽는 법과 한계

- "현재 설정"은 마이그레이션 시드값 기준이다. DB 실값은 서브에이전트가 못 본다. 야간 `review-request-cap.mjs` 가 cap 을 2배 이내로 올릴 수 있어 실값은 이보다 클 수 있다.
- cap 은 20260930000024(09-28, 활성 10소스 3배)와 20260930000023(danawa 30) 반영 후 값이다. clien 462, bobaedream 336, 82cook 369 는 시드(100)가 아니라 000024 가드의 새 값이다(그 전에 자동 상향된 154·112·123 의 3배).
- 26행의 정체: 마이그 시드가 있는 22행 + 등록 마이그가 없는 4행(naver_blog, naver_cafe, naver_kin, reddit — 20261005000004 주석: PR #106 브랜치에서 온 행). 이 4행은 cap·간격이 리포에 없어 '확인 불가'다.
- 차단 이력은 DB 에 건수가 안 남는다(reports/2026-09-28/cowork-four-orders.md §2-1: 차단 시 health='broken' 으로 소스가 자동 꺼짐). 아래 이력은 broken 이력·비활성 사유·findings 문서 기준이다. 09-28 이후 신규 소스(devto, yozm, indiehackers, disquiet, googleplay)의 런타임 이력은 리포에 없다.
- 램프 단계는 오케스트레이터 실측을 그대로 쓴다: review_source_ramp 비어 있음 = 전 소스 단계 없음, 기본 1회 타깃 10(워크플로 targets 입력 설명).
- Actions 막힘 근거는 두 가지뿐이다. (a) 2026-08-29 프로브: Actions 러너(Azure 68.154.115.178)와 한국 가정용 IP 결과가 거의 같았다(docs/review-source-findings.md:13-21, 네이버 쇼핑 루트 하나만 갈림). (b) 러너 실제 수집: 09-28 기준 30일 차단 0, todayhumor 만 IP 차단. 그 외는 소스별 러너 기록이 없으면 '기록 없음'으로 적었다.
- 하루 예상 실행 시간 = daily_request_cap × min_interval_ms 의 하한(요청 응답시간·DB 쓰기 제외). 실제는 이보다 길다.

## 소스별 (항목 순서: 방식 / 공식 한도 / 현재 설정 / 차단 이력 / 램프 / Actions / 하루 시간)

### 1. danawa (활성, 축소)
- 방식: 비공식 내부 경로. 다나와 판매처 리뷰 AJAX(`prod.danawa.com/info/dpg/ajax/companyProductReview.ajax.php`).
- 공식 한도: 공개 없음.
- 현재 설정(마이그 시드값 기준): min_interval 4000ms, cap 200 시드 → 30(000023, 09-27 남헌 지시 최소화).
- 차단 이력: 없음. 08-29 프로브에서 200·robots 허용. 09-28 기준 30일 차단 0.
- 램프: 단계 없음(기본 타깃 10). 활성 타깃 0.
- Actions: 막힌 적 없음. 08-29 프로브가 Actions 러너에서 정상(findings.md:13-31).
- 하루 시간: 30 × 4s = 120s ≈ 2.0분.

### 2. appstore (소유자 예외로 재활성 예정)
- 방식: 공개 RSS 피드(`itunes.apple.com/<국가>/rss/customerreviews`). 문서화된 API 아님. robots 는 `Disallow: /*/rss/*` 금지 → 20261005000002 가 소유자 예외로 켠다.
- 공식 한도: 공개 없음(마이그 20260902000001 주석 "애플이 공개한 요청 제한이 없다"). 공식 문서로는 검증하지 못했다.
- 현재 설정: 2000ms, cap 200. 앱당 최대 10페이지(코드 주석 근거).
- 차단 이력: HTTP 차단 없음. 09-10 robots 위반으로 자체 비활성(20260910000002, 차단 신호 아님). 09-28 기준 30일 신규 0.
- 램프: 단계 없음.
- Actions: 09-02 프로브에서 200·리뷰 35건 확인(findings.md:165).
- 하루 시간: 200 × 2s = 400s ≈ 6.7분(활성일 때).

### 3. hackernews (활성)
- 방식: 공식 공개 API(Algolia `hn.algolia.com/api/v1/search_by_date`).
- 공식 한도: 확인 불가. `https://hn.algolia.com/api` 를 WebFetch 했으나 본문이 비어 한도 문구가 안 나왔다. 000024 주석의 "IP 당 시간 10,000 요청"은 리포 기재값이며 이번에 공식 문서로 못 확인했다.
- 현재 설정: 2000ms, cap 200 시드 → 600(000024).
- 차단 이력: 차단 0. 09-22 30분 타임아웃으로 뒤 13소스 미실행(차단 아님, 워크플로 90분으로 확대). 09-28 기준 중단(interrupted) 3.
- 램프: 단계 없음. 활성 타깃 27, 회당 13요청.
- Actions: 막힌 적 없음(30일 차단 0, 3,543건 신규).
- 하루 시간: 600 × 2s = 1200s = 20.0분.

### 4. damoang (활성)
- 방식: 공개 웹(HTML, JSON-LD).
- 공식 한도: 공개 없음(robots Crawl-delay 없음, 000024 주석).
- 현재 설정: 3000ms, cap 100 → 300(000024).
- 차단 이력: 없음(09-28 기준 30일 0). 로그인 필요 act 하나가 403(findings.md:1133, 글 페이지는 200).
- 램프: 단계 없음. 활성 타깃 0.
- Actions: 막힌 적 없음.
- 하루 시간: 300 × 3s = 900s = 15.0분.

### 5. 82cook (활성)
- 방식: 공개 웹(HTML). robots 가 막는 `/ajax/` 는 안 쓴다.
- 공식 한도: 공개 없음.
- 현재 설정: 3000ms, cap 100 시드 → (자동 상향 123) → 369(000024).
- 차단 이력: 없음.
- 램프: 단계 없음. 활성 타깃 0.
- Actions: 막힌 적 없음.
- 하루 시간: 369 × 3s = 1107s ≈ 18.5분.

### 6. theqoo (활성)
- 방식: 공개 웹(본문 HTML). 어댑터 주석에 `index.php` POST(JSON) 경로가 있다.
- 공식 한도: 공개 없음. robots.txt 없음(404).
- 현재 설정: 3000ms, cap 100 → 300.
- 차단 이력: 없음(30일 0).
- 램프: 단계 없음.
- Actions: 막힌 적 없음.
- 하루 시간: 300 × 3s = 900s = 15.0분.

### 7. todayhumor (폐기, dead)
- 방식: 공개 웹 + 내부 AJAX(`/board/ajax_memo_list.php` 댓글 JSON).
- 공식 한도: 공개 없음.
- 현재 설정: 3000ms, cap 100(000019 폐기 표기, 000023 잔여 타깃 failed 처리).
- 차단 이력: 2026-09-24 11:36 UTC 첫 403/429(러너 자동 비활성) → 09-25 000017 재활성 → 수동 수집 run 36136401877 첫 요청부터 403 → 12:42 UTC 재차단 → 000019 폐기(findings.md:1454).
- 램프: 해당 없음(꺼짐).
- Actions: 막힘. IP 레벨 차단 판정, 같은 GitHub Actions 대역에서는 같은 결과(findings.md:1457).
- 하루 시간: 꺼져 있어 0. (참고 100 × 3s = 300s)

### 8. bobaedream (활성)
- 방식: 공개 웹(HTML).
- 공식 한도: 공개 없음. robots 전면 허용.
- 현재 설정: 3000ms, cap 100 시드 → (자동 상향 112) → 336(000024).
- 차단 이력: 없음. 정직 UA 18/18 HTTP 200(마이그 20260918000001_voc_round3 주석).
- 램프: 단계 없음. 활성 타깃 2, 회당 14요청.
- Actions: 막힌 적 없음.
- 하루 시간: 336 × 3s = 1008s ≈ 16.8분.

### 9. tumblbug (활성)
- 방식: 공개 웹(창작자 후기 프리뷰 HTML). robots 금지 `/api/` XHR 는 안 쓴다.
- 공식 한도: 공개 없음. 약관 자동화 금지 조항(tos_status=forbids_automation, SP-031).
- 현재 설정: 3000ms, cap 100(000024 대상 아님).
- 차단 이력: 없음. 7일 요청 1건뿐.
- 램프: 단계 없음. 활성 타깃 0.
- Actions: 기록 없음(차단 0).
- 하루 시간: 100 × 3s = 300s = 5.0분.

### 10. naver_blog_post (비활성)
- 방식: 공개 웹(blog.naver.com PostView HTML), 댓글 XHR 은 미수집.
- 공식 한도: 해당 없음(HTML 수집이라 네이버 검색 API 한도는 쓰이지 않는다, 조사하지 않음).
- 현재 설정: 3000ms, cap 100.
- 차단 이력: 없음. 약관·robots 사유로 off(findings.md:663).
- 램프: 해당 없음.
- Actions: 기록 없음(요청 안 함). 참고로 네이버 쇼핑은 08-29 프로브에서 418.
- 하루 시간: 꺼져 있어 0. (참고 100 × 3s = 300s)

### 11. brunch (활성)
- 방식: 공개 웹(JSON-LD). 댓글 `/api/` 는 robots 금지라 미수집.
- 공식 한도: robots Crawl-delay 5(마이그 20260919000001 주석).
- 현재 설정: 5000ms, cap 50 → 150(000024).
- 차단 이력: 없음.
- 램프: 단계 없음.
- Actions: 막힌 적 없음.
- 하루 시간: 150 × 5s = 750s = 12.5분.

### 12. clien (활성)
- 방식: 공개 웹(HTML). robots 는 우리 UA 에게 404 로 감춤 → 어댑터 코드 방어(SP-027).
- 공식 한도: 공개 없음.
- 현재 설정: 3000ms, cap 100 시드 → (자동 상향 154) → 462(000024).
- 차단 이력: 차단 없음. 파싱 실패 24건(09-28 기준, 차단 아님).
- 램프: 단계 없음. 활성 타깃 2.
- Actions: 막힌 적 없음.
- 하루 시간: 462 × 3s = 1386s ≈ 23.1분.

### 13. fmkorea (활성)
- 방식: 공개 웹(HTML). /best·/best2·/humor 범위만.
- 공식 한도: 공개 없음.
- 현재 설정: 3000ms, cap 100 → 300.
- 차단 이력: 없음.
- 램프: 단계 없음.
- Actions: 막힌 적 없음.
- 하루 시간: 300 × 3s = 900s = 15.0분.

### 14. okky (활성)
- 방식: 공개 웹(sitemap.xml + 글 JSON-LD). `/api/` 는 robots 금지라 안 씀.
- 공식 한도: robots Crawl-delay 1s(000024 주석).
- 현재 설정: 4000ms, cap 100 → 300.
- 차단 이력: 차단 없음. 09-28 기준 실패 1건(DB Bad Gateway, 차단 아님).
- 램프: 단계 없음.
- Actions: 막힌 적 없음.
- 하루 시간: 300 × 4s = 1200s = 20.0분.

### 15. velog (활성)
- 방식: 공개 웹(`__APOLLO_STATE__`). 공개 GraphQL 은 안 쓴다.
- 공식 한도: 공개 없음.
- 현재 설정: 4000ms, cap 100 → 300.
- 차단 이력: 없음.
- 램프: 단계 없음.
- Actions: 막힌 적 없음.
- 하루 시간: 300 × 4s = 1200s = 20.0분.

### 16. youtube (활성, 약관 제약 인지)
- 방식: 공식 API(YouTube Data API v3 `commentThreads.list`).
- 공식 한도: 프로젝트당 기본 하루 10,000 유닛(search.list 는 별도 100회/일). commentThreads.list 는 호출당 1유닛. 근거: https://developers.google.com/youtube/v3/determine_quota_cost (WebFetch 확인).
- 현재 설정: 1000ms, cap 200(유닛 풀의 2%, 어댑터 주석).
- 차단 이력: 없음(30일 0). 10,079건 수집.
- 램프: 단계 없음. 회당 10요청.
- Actions: 막힌 적 없음. API 키 방식이라 IP 차단과 성격이 다르다.
- 하루 시간: 200 × 1s = 200s ≈ 3.3분.

### 17. producthunt (비활성)
- 방식: 공식 API(GraphQL v2, 토큰).
- 공식 한도: GraphQL 15분당 6,250 복잡도 포인트, 그 외 `/v2/*` 15분당 450요청, 초과 시 429. 근거: https://api.producthunt.com/v2/docs/rate_limits/headers . 상업 이용 금지 문구("must not be used for commercial purposes", 허가 문의 hello@producthunt.com): https://api.producthunt.com/v2/docs .
- 현재 설정: 2000ms, cap 100(활성화 전).
- 차단 이력: API 차단 없음(미가동). 웹 경로는 09-02 프로브에서 200 이나 Captcha(findings.md:174) — API 와 별개.
- 램프: 해당 없음.
- Actions: API 는 기록 없음. 웹 경로는 Captcha.
- 하루 시간: 꺼져 있어 0. (참고 100 × 2s = 200s)

### 18. disquiet (활성, 약관 리스크 인수)
- 방식: 공개 웹(게시 HTML).
- 공식 한도: 공개 없음. robots `Allow: /`. 약관은 자동화 수집 금지(소유자 인수 09-28).
- 현재 설정: 5000ms, cap 50.
- 차단 이력: 기록 없음(09-28 신규 등록).
- 램프: 단계 없음. 평소 하루 약 13요청 추정(마이그 주석).
- Actions: 기록 없음.
- 하루 시간: 50 × 5s = 250s ≈ 4.2분.

### 19. devto (활성)
- 방식: 공식 공개 API(Forem `/api/articles`, `/api/comments`, 키 없음).
- 공식 한도: 확인 불가. https://developers.forem.com/api/v1 , https://developers.forem.com/api 를 WebFetch 했으나 한도 문구가 없었다.
- 현재 설정: 6000ms, cap 60.
- 차단 이력: 기록 없음.
- 램프: 단계 없음.
- Actions: 기록 없음(09-30 점검은 실행 환경 미기재).
- 하루 시간: 60 × 6s = 360s = 6.0분.

### 20. inflearn (비활성, 10-01 중단)
- 방식: 공개 웹(JSON-LD QAPage).
- 공식 한도: 공개 없음(약관이 CSR 이라 못 읽음).
- 현재 설정: 6000ms, cap 40. 20261001000051 로 enabled=false.
- 차단 이력: 없음.
- 램프: 해당 없음.
- Actions: 기록 없음.
- 하루 시간: 꺼져 있어 0. (참고 40 × 6s = 240s)

### 21. yozm (활성)
- 방식: 공개 웹(JSON-LD NewsArticle). `/api/` 는 robots 금지라 안 씀.
- 공식 한도: robots Crawl-delay 5(마이그 000042 주석, 6000ms 가 그보다 길다).
- 현재 설정: 6000ms, cap 40.
- 차단 이력: 09-30 오전 robots 302(Cloudflare) 1회, 재실측 200(마이그 주석). 요청 차단 신호는 아님.
- 램프: 단계 없음.
- Actions: 기록 없음.
- 하루 시간: 40 × 6s = 240s = 4.0분.

### 22. indiehackers (활성, 인터뷰 한정)
- 방식: 공개 웹(편집팀 인터뷰 HTML, JSON-LD).
- 공식 한도: 공개 없음. 약관은 무단 복제 금지 문구(tos_status=prohibited, 소유자 인수).
- 현재 설정: 6000ms, cap 40.
- 차단 이력: 없음. 사용자 글 2건은 정적 요청 404(차단 아님, blocked-backlog).
- 램프: 단계 없음.
- Actions: 기록 없음.
- 하루 시간: 40 × 6s = 240s = 4.0분.

### 23. googleplay (등록 예정, 20261005000005 미적용)
- 방식: 비공식 내부 경로(`play.google.com/_/PlayStoreUi/data/batchexecute`, rpcid UsvDTd).
- 공식 한도: 공개 없음. 이용약관은 자동화 접근 금지 + robots 준수 의무(SP-020). https://support.google.com/googleplay/android-developer/answer/9859751 를 WebFetch 했으나 한도 문구가 없었다.
- 현재 설정(시드): 8000ms, cap 40, 타깃 0.
- 차단 이력: 없음(미가동). batchexecute 경로 robots 미실측(robots_status=unverified).
- 램프: 해당 없음.
- Actions: 기록 없음. 09-02 프로브에서 상세 페이지 200(findings.md:165).
- 하루 시간: 40 × 8s = 320s ≈ 5.3분(타깃 0 이라 지금은 0).

### 24~27. naver_blog, naver_cafe, naver_kin, reddit (비활성, 등록 마이그 없음)
- 방식: 확인 불가(리포에 어댑터·시드 없음). reddit 은 공식 API 로 추정되나 자격증명 미발급(09-28 보고서).
- 공식 한도: 확인 불가. Reddit 도움말 URL 은 WebFetch 가 403 이었다.
- 현재 설정: 확인 불가. 등록 마이그가 main 에 없다(20261005000004 주석).
- 차단 이력: 없음. 약관·자격증명 사유로 비활성(cowork-four-orders.md:87).
- 램프: 해당 없음.
- Actions: 요청한 적 없음.
- 하루 시간: 확인 불가.

## 참고: review_sources 밖의 공식 한도

- Kakao 검색 API(키 보유): 블로그 검색 30,000건/일, 카페 검색 30,000건/일. 근거 http://developers.kakao.com/docs/ko/getting-started/quota (WebFetch 확인, 남헌 확인값과 일치).

## 분류

공식 한도가 있는 소스(공식 문서로 확인)
- youtube: 10,000유닛/일, commentThreads 1유닛(현재 cap 200 = 2%).
- producthunt: 15분 6,250 복잡도 포인트(GraphQL). 비활성.

공식 한도가 없거나 확인 못한 소스(잠정 상한 = 현재 cap 사용)
- API 인데 한도 확인 불가: hackernews(Algolia), devto.
- 공개 한도 없음: appstore, googleplay.
- 공개 웹(공식 한도 없음, robots Crawl-delay 만 있는 곳 포함): danawa, damoang, 82cook, theqoo, bobaedream, tumblbug, brunch(Crawl-delay 5), clien, fmkorea, okky(Crawl-delay 1), velog, disquiet, yozm(Crawl-delay 5), indiehackers, inflearn(off), todayhumor(dead), naver_blog_post(off).
- 확인 불가(등록 마이그 없음): naver_blog, naver_cafe, naver_kin, reddit.

## 하루 예상 실행 시간 합계 (2슬롯 × 90분 = 180분)

가동 중이거나 가동 예정인 19소스(danawa, appstore, hackernews, damoang, 82cook, theqoo, bobaedream, tumblbug, brunch, clien, fmkorea, okky, velog, youtube, disquiet, devto, yozm, indiehackers, googleplay)의 cap × 간격 합:

- 120 + 400 + 1200 + 900 + 1107 + 900 + 1008 + 300 + 750 + 1386 + 900 + 1200 + 1200 + 200 + 250 + 360 + 240 + 240 + 320 = 12,981초 = 216.3분.
- 결과: 216.3분 > 180분. cap 을 전부 소진하면 간격 하한만으로도 36분 초과한다(응답시간 제외).
- 단 이 값은 상한 소진 시나리오다. cap 은 UTC 날짜 누적이라 두 슬롯이 한 몫을 나눠 쓰고, 실제 회당 요청은 1~14건이다(09-28 보고서 §2-1). 같은 보고서: 09-28 실측 12건 = 51분(건당 130~489초, 평균 255초). 슬롯 2회로 환산하면 약 102분이라 180분 안이다.
- 팽창 임계: clien(23.1분), hackernews·okky·velog(각 20분)만 83분이다. 하루 합이 180분을 넘기는 지점은 cap 의 약 83%(180/216.3) 소진이다. 램프로 타깃이 늘면 이 임계를 먼저 본다.
- 한계: 실시간 = 간격 하한 + 응답 지연 + DB 쓰기. 09-28 실측은 간격만으로 낸 값보다 컸다(예: HN 회당 13요청 × 2s = 26s 이론인데 소스 1건 실행이 130~489초로 측정).

## 요약

- 한도·약관 근거로 쓴 공식 URL 4건: YouTube 쿼터, Product Hunt rate_limits, Product Hunt docs, Kakao 쿼터.
- 열었지만 한도 문구가 없던 공식 URL 4건: forem 2건, Algolia HN 1건, Google Play 도움말 1건. 열리지 않은 것: Reddit(403), Algolia README(한도 문구 없음).
- '확인 불가': Algolia HN 한도(문서 본문 비어 있음), dev.to 한도(문서에 문구 없음), Reddit 한도(403), Apple RSS(공식 문서 없음), Google Play(공식 한도 문서 없음), naver_blog·naver_cafe·naver_kin·reddit 의 cap·간격(리포에 시드 없음).
