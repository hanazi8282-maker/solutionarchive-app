# UI 레퍼런스 조사 — 프로덕션화용 (2026-09-19)

조사 방법: WebFetch(본문 마크다운 변환) + Playwright 390×844 모바일 뷰포트 스크린샷.
로그인 뒤 화면(실제 대시보드·빈 상태·페이월 모달)은 어느 제품도 못 봤다 — 전부 랜딩·프라이싱·문서 페이지 기준이다.
스크린샷 5장은 **리포에 커밋하지 않았다** — 공개 리포라 타사 화면 캡처를 올리지 않는다(CEO-STAFF 판단). 로컬 세션 스크래치패드 `ui-reference-screens/` 에만 있다. 아래 `screens/…` 파일명은 그 폴더 기준이다.

## 1. 요약

- 9곳 중 실제로 본 곳 6곳(SuperX·IndiePilot·Intend·Mirra·Foreplay·Atria). Splitbee·MagicBrief는 서비스 종료(각각 Vercel·Canva로 흡수), 간단·youchan은 도메인을 못 찾아 확인 불가.
- 점수를 보여주는 도구(IndiePilot 관련도 0~100, Atria 등급+수정안)는 전부 **점수 옆에 "왜"를 한 줄로 붙인다**. 우리 기회점수도 숫자 단독 노출을 없애는 게 1순위.
- 첫 가치까지의 경로는 전부 "입력 1개 → 결과"로 압축돼 있다(IndiePilot 3단계, Mirra "URL 없이도 시작"). 우리 /onboarding/quiz → /analyze 진입도 이 기준으로 클릭 수를 세야 한다.
- 모바일은 네이티브 앱이 아니라 **한 열 세로 쌓기 + 풀폭 CTA 1개 + 햄버거**가 표준이고, IndiePilot은 모바일 뷰포트에서 런타임 에러로 죽었다(반면교사: 우리도 390px 실측 필수).
- 페이월은 참고만: "Most Popular" 배지 + 카드형 플랜 + 신용카드 없는 무료 시작이 공통이나, 내부 도구인 우리에겐 지금 필요 없다.

## 2. 제품별 관찰

### SuperX (superx.so) — 확인함
- 히어로: "Grow and monetize your 𝕏 audience, easier" / CTA "Get Started for Free"가 페이지에 6회 이상 반복. 모바일에서 CTA는 풀폭 1개, 아래 사회적 증거(아바타 6개 + "Loved by 11,294+ creators" + Product Hunt 배지). 스크린샷 `screens/superx-mobile-hero.png`.
- 로그인(app.superx.so/login)은 X OAuth 단일 버튼 + "Join 11,294+ creators…" 헤드라인 + 제품 목업. 로그인 벽이라 대시보드 실물은 확인 불가.
- 랜딩의 섹션 구조가 3축(Discover / Create & Schedule / Engage & Grow)이고 각 축 아래 h3 → h4 3개씩 고정. 정보 밀도가 높은데도 스캔이 되는 이유는 이 고정 리듬이다.
- 프라이싱: Pro $49 / Advanced $49(정가 $99, "Most Popular") / Ultra $199. 비교표 없이 카드 안에 항목 나열. "Cancel anytime. 100% content ownership."
- 빈 상태·온보딩 실물: 확인 불가.

### Splitbee (splitbee.io) — 서비스 종료
- 페이지 전체가 "Thank You for the Journey / Splitbee has been sunset, but our mission continues at Vercel." + CTA "Try Vercel Analytics" 하나. 제품 화면 없음. 확인 불가(종료).

### Intend (intend.do) — 부분 확인
- 히어로: "Be in purposeful flow 10 minutes from now" + Mary Oliver 인용 + CTA "Create an account". 랜딩에 대시보드 스크린샷 없음.
- /features 페이지에 실제 화면 설명이 있다: 목표 최대 10개, 목표당 최우선 1개, 오늘의 의도를 "1) file documents" 처럼 **숫자 접두어로 목표에 연결**하는 텍스트 입력. 전날 안 한 항목을 오늘로 넘기는 "NotDone propagator".
- 모바일: "No native app but you can add the web app to your phone's homescreen" — PWA 홈화면 추가 안내로 끝.
- 프라이싱: $10/월(연) / $12/월, 2주 무료 체험(카드 없음), 30일 환불, "flexible pricing for those with budget constraints". 톤이 설득이 아니라 안심.
- 빈 상태 문구: 확인 불가.

### IndiePilot (indiepilot.app) — 확인함 (모바일에서 크래시)
- 히어로: "Turn Reddit Users Into Paying Customers." / CTA "Get Started for Free". 3단계("Enter your product details" → "Get High-Intent Leads" → "Join the Conversation")를 번호 카드로 고정.
- 리드 카드 실물: `r/startups · tom_hacker · 2h ago` / 우상단 `92/100` / 제목 "I wish there was a tool for this" / 본문 한 줄 / 하단 `121 · 14 comments`. 카드 하나에 **출처·시간·점수·제목·본문·반응** 6요소, 그래도 한 화면에 3장이 들어간다.
- 점수 옆 설명 문구: "Every lead gets an AI relevance score so you instantly know which posts are worth your time."
- 모바일 390px에서 접근성 스냅샷은 정상이었는데 렌더 직후 에러 바운더리로 떨어졌다: "Something went wrong 😬 / a is not iterable" + 버튼 3개(Refresh / Support / Home). 스크린샷 `screens/indiepilot-mobile-full.png`. 에러 화면 자체의 3버튼 구성은 참고할 만하다.
- 프라이싱: Starter $8.99 / Pro $18.99, 카드 없음. 리드는 무제한, AI 답글 수로 게이팅.

### 간단 (한국) — 확인 불가
- 검색 결과가 전부 "간단 — 간헐적 단식 앱"(gandan.yunhookim.com)으로 잡힌다. Threads/마케팅 도구로서의 "간단"은 도메인을 못 찾았다. 추측하지 않는다.

### youchan — 확인 불가
- 검색에 가수 유찬만 나온다. 도구/서비스 도메인을 못 찾았다.

### Mirra AI → 현재 "Mirr" (mirra.my) — 확인함
- 히어로: "Content marketing. Done right, without a dedicated team." / CTA "Start content marketing for free" + 작은 글씨 "Start free without a card". 바로 아래에 **실제 산출물 3장(부동산 카드뉴스, 한국어)**을 가로 스크롤로 보여준다. 스크린샷 `screens/mirra-mobile-hero.png`.
- 빈 상태에 해당하는 카피가 FAQ에 있다: Q "What if I don't even know what to post?" → "That's fine. Share your business, goal, and any useful account or source. … You can also start without a URL or document." / Q "Do I have to connect a social account first?" → "No. Create content first, then connect an account when you want to publish…"
- 성과 문구가 절제돼 있다: "Mirr does not promise revenue; it gives you evidence for your next content decision."
- 프라이싱: Free 50크레딧(워터마크) / Launch $19 / Build $49("Most Popular") / Grow $99 / Expand $199. 6단 비교 매트릭스 있음.

### Foreplay (foreplay.co) — 확인함
- 히어로: "The Complete Winning Ad Workflow" / CTA "Start Free Trial" 풀폭 1개 / 아래 "POWERING +10,000 SOCIAL AD TEAMS & AGENCIES" + 로고 그리드 3열. 스크린샷 `screens/foreplay-mobile-hero.png`.
- Before/After 블록: "Before … Group chats, expired links and fragmented reports." ↔ "After Foreplay — End-to-end feedback loop for winning ad creative." 문제→해결을 두 칸으로.
- 모듈 이름을 제품명처럼 붙인다(Swipe File / Spyder / Discovery / Lens / Briefs). 각각 한 줄 약속("Know what's working and why").
- 모바일 앱은 "캡처 도구"로만 포지셔닝: "Snap a Photo and save it to Swipe File … as easy as two taps". 분석은 데스크톱, 모바일은 저장.
- 프라이싱: Basic $59 / Workflow $175 / Agency $459, 7일 체험이지만 **카드 필수** + 14일 환불. "Most Popular" 배지 없음. 👑 표시로 독점 기능 구분.

### MagicBrief (magicbrief.com) — 서비스 종료
- 상단 경고 배너 "shutting down on July 31, 2026" + "Your billing has been cancelled" + Canva Grow로 이전 안내. 제품 화면 없음. 확인 불가(종료).

### Atria (tryatria.com) — 확인함
- 히어로 위에 신뢰 배지 3줄("$9B+ ad spend trained / 4.9 on G2 / SOC 2 type II certified") → h1 "Your creative engine that drives winning ads" → CTA 2개(핑크 "Start for free", 검정 "Book a demo") → 체크 3개("No credit card required / 1,000 free credits included / Native in Slack"). 스크린샷 `screens/atria-mobile-hero.png`.
- AI를 "Raya"라는 이름의 동료로 의인화하고 4단계 서사로 설명. 핵심 문장: "You know what worked. Raya knows why." / "Raya grades every single ad and tells you exactly what to fix." — **등급 + 구체 수정안**이 세트.
- 상단 공지 배너가 "Included in every plan · Atria MCP is live." + 닫기 버튼. 새 기능 공지를 한 줄 배너로.
- 프라이싱: Core $129 / Plus $479 / Business $959("Most Popular") / Enterprise. 카테고리별 접이식 비교표(Access / Creation / Analytics / …). 무료 티어 없음(크레딧 체험만).

## 3. 차용 패턴 (항목별 한 줄)

- 점수 옆 "왜" 한 줄 → IndiePilot 리드 카드(92/100 + 제목·본문), Atria "grades … and tells you exactly what to fix" → /analyze/[id]/review 기회점수 옆에 근거 소구점 1줄·케이스 매칭 수 1줄을 따로 붙인다(두 축 분리 원칙 유지) → 상
- 카드 6요소 고정 배치(출처·시간·점수·제목·한줄·반응) → IndiePilot 리드 카드 → /discovery 후보 카드와 /analyze 프로젝트 목록을 같은 골격으로 통일, 390px에서 한 화면 3장 기준 → 상
- 번호 3단계 온보딩 카드 → IndiePilot "Enter product details → Get leads → Join" → /onboarding/quiz 첫 화면에 "리뷰 소스 고르기 → 소구점 검수 → 앵글 받기" 3단계를 먼저 보여주고 클릭 수를 3 이하로 잰다 → 상
- 빈 상태를 "괜찮다 + 최소 입력으로 시작" 톤으로 → Mirr FAQ "That's fine. … You can also start without a URL or document." → /analyze 프로젝트 0건, /discovery 후보 0건 화면의 문구·버튼(“리뷰 URL 하나만 넣어도 시작됩니다”) → 상
- 풀폭 CTA 1개 + 나머지는 텍스트 링크 → SuperX·Foreplay·Mirr 모바일 히어로 전부 → /analyze/[id]/angles의 "유사 사례 보기" 어드바이저 버튼을 모바일에서 풀폭 1개로, 보조 액션은 링크로 강등 → 중
- 성과 문구 절제 → Mirr "does not promise revenue; it gives you evidence for your next content decision." → /dashboard 발행 기록 헤더 카피와 기회점수 툴팁에 "추천이지 보장 아님" 톤 적용 → 중
- Before/After 두 칸 → Foreplay "Group chats, expired links…" ↔ "End-to-end feedback loop" → /onboarding/quiz 결과 화면에서 "지금(감으로 소구점 고름)" ↔ "이 앱(리뷰 근거 + 선례)" 두 칸 → 중
- 상단 한 줄 공지 배너(닫기 가능) → Atria "Atria MCP is live." → 새 발굴 후보·새 케이스 도착 알림을 /analyze 상단 한 줄로, localStorage로 닫힘 기억 → 중
- 에러 화면 3버튼(새로고침 / 문의 / 홈) → IndiePilot 에러 바운더리 → app/error.tsx에 같은 3버튼 구성(한국어) → 중
- 고정 리듬(h2 → h3 → 항목 3개)으로 밀도 올리기 → SuperX 3축×3항목 구조 → /cases·/columns 목록을 "축 제목 → 카드 3장" 리듬으로 → 하
- PWA 홈화면 추가 안내 한 줄 → Intend "add the web app to your phone's homescreen" → Threads 유입 모바일 사용자에게 /onboarding 끝에 한 줄 안내(네이티브 앱 안 만듦) → 하
- "Most Popular" 배지 + 카드 없는 무료 시작 → SuperX·Mirr·Atria 공통(Foreplay만 카드 필수) → 내부 도구라 지금은 미적용, 외부 공개 시 참고 → 하

## 4. 차용하지 않기로 한 것

- **단일 AI 점수로 합치기**(Atria "viability score", IndiePilot 관련도 단일 숫자) — 우리는 수요축·선례축을 따로 보여주는 게 원칙. 숫자 하나로 접으면 원칙이 깨진다. "왜" 한 줄은 가져오고 합산은 안 가져온다.
- **AI 의인화(Raya)** — 내부 검수 도구에서 어드바이저를 캐릭터화하면 판단 책임이 흐려진다. 버튼 이름은 기능("유사 사례 보기")으로 유지.
- **CTA 6회 반복·사회적 증거 아바타 줄**(SuperX) — 랜딩 전환용이지 운영 화면용이 아니다. 우리 화면은 로그인 뒤 작업 화면이라 반복 CTA는 소음.
- **신용카드 필수 체험**(Foreplay) — 페이월 자체가 지금 범위 밖이고, 붙이더라도 카드 없는 시작이 다수 사례.
- **네이티브 모바일 앱**(Foreplay Mobile App) — Foreplay조차 모바일을 "저장만" 하는 보조 도구로 둔다. 우리는 반응형 웹 + PWA로 충분하다.
- **문제 화면 없이 랜딩만 보고 대시보드 밀도를 판단하는 것** — 6곳 모두 로그인 뒤 실물을 못 봤다. 대시보드 정보 밀도(관심 축 2)는 이 조사로 결론 낼 수 없고, 무료 계정을 실제로 만들어 봐야 한다.

## 부록 — 확인 상태

- 확인함: SuperX(랜딩·프라이싱·로그인 벽), IndiePilot(랜딩·프라이싱, 모바일 크래시), Intend(랜딩·features·프라이싱), Mirr(랜딩·프라이싱), Foreplay(랜딩·프라이싱·mobile-app), Atria(랜딩·프라이싱)
- 확인 불가: Splitbee(종료), MagicBrief(종료 예고 배너), 간단(도메인 미확인), youchan(도메인 미확인)
- 어느 제품도 로그인 뒤 대시보드·빈 상태·업그레이드 모달 실물은 못 봤다.
