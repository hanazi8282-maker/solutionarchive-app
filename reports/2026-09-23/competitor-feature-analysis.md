# 경쟁사 5곳 세밀 기능 분석 (트랙 4 — 보고만, 구현 금지, 2026-09-23)

> 남헌 위임: Preuve AI · IdeaBrowser · BigIdeasDB · Trend Seeker · PainMap 을 크롬으로 직접 열어 작동 중인 기능을 최대한 세밀하게. 기능마다 ① 무슨 기능 ② 구현 추정(추정이면 표시) ③ 우리 스택(Next.js/Supabase) 가능 여부 ④ 예상 소요(대략). **이 문서는 남헌이 Cowork 와 검토한 뒤 결정한다. 어떤 것도 구현하지 않았다.**
> 확인 방법: 공개 페이지·공유 리포트·가격표·방법론 문서를 DOM 텍스트와 스크린샷으로 실측. **로그인 뒤 앱 화면은 5곳 모두 확인 불가**(가입·결제 없이 못 봄) — 가격표·마케팅 페이지가 열거한 기능은 "가격표 기재"로 표시했다. 소요는 1인 Claude Code 세션 기준 대략치.

## TL;DR (3줄)

1. **5곳의 공통 뼈대는 넷이다**: 다중 소스 수집(Reddit·리뷰·구인·팟캐스트·트렌드) → 점수/등급(대부분 0~100 숫자) → 근거를 출처 링크로 노출 → 페이월(1회성 리포트 $29~$79 또는 평생권 $99~$499). 우리는 앞 셋을 이미 다른 형태로 갖고 있고(VOC 16k·등급 4단계·근거 행), **없는 것은 "내 아이디어 넣기 → 즉석 리포트"라는 입구와 결제**다.
2. **가장 싸게 가져올 수 있는 것(각 ≤8h)**: 페인 카드 태그(impact/frequency), 케이스별 저장·공유 링크, 아이디어 오브 더 데이(이메일 게이트), 피드백 위젯, 관련 케이스 3, 신호 라이브 피드(우리 HN 수집을 그대로 노출), 방법론 공개 페이지(우리 등급 산식). **가장 비싼 것(≥40h)**: 자기 아이디어 검증 리포트(Preuve 15섹션), 10에이전트 병렬 리서치, 크롬 확장(Clipper), MCP 서버.
3. **우리 차별점은 그대로 살아 있다**: 5곳 중 4곳이 LLM 생성 문장을 근거처럼 낸다. 등급을 숫자 점수로 뭉개지 않고 "누가 말했나(공시/자기보고/추정)"를 카드에 붙이는 곳은 Preuve 의 출처 링크뿐이고, **"이 회사는 이렇게 망했다"를 같은 화면에 붙이는 곳은 없다.** Trend Seeker 는 v3에서 "생성된 문장은 근거가 아니다"를 명시하고 buildability 점수를 **제거**했다 — 우리 SP-004·§7.1 원칙과 같은 방향.

---

## A. Trend Seeker (trend-seeker.app) — 27개

**목록·탐색**
- **아이디어 그리드 카드** — 시그널 수 배지("22 Signals +4"), NEW 배지, 제목, 한 줄, 원문 인용 1건, 카테고리 2개, 등록 경과("4w"). 구현 추정: 서버 렌더 목록 + 시그널 카운트 집계 컬럼. 가능: ✅ (우리 케이스 카드에 근거 수·무브 수로 치환). 6h.
- **카테고리 칩 필터**(New·Top/Trending·SaaS·AI·Developer Tools…) — URL 파라미터 필터. ✅ 이미 유사(`reader_problem` 칩). 2h.
- **Pro 잠금 카드**(카드 일부가 "Pro" 배지로 흐림) — 요금제 컬럼으로 서버에서 본문 마스킹. ✅ 결제 붙기 전엔 무의미. 4h(게이트만).
- **헤더 중앙 검색**("Search ideas and posts") — 아이디어+게시글 통합 검색, 추정 pg_trgm 또는 벡터. ✅ 우리 `/cases/search` 확장. 6h.
- **주간 브리프 섹션**(홈 하단 "Week of Sep 21 · 3개 대표 시그널 · 뉴스레터 링크") — 주간 집계 잡 + 정적 렌더. ✅ 우리 reports/ 주간 DIGEST 를 화면화. 6h.
- **상단 통계 알약**("+2.1k ideas this week · +81.8k signals in the last 7 days") — 주간 카운트 쿼리. ✅ 2h.
- **Product Hunt 배지·소셜 프루프 캐러셀** — 정적. ✅ 1h(우리는 아직 낼 것 없음).

**상세 페이지**
- **Opportunity score 79/100 + 하위 5항목 points earned/available**(Signal quality 39/40 · Evidence depth 15/15 · Source breadth 10/10 · Search trends 8/15 · Competition 8/20) — 공개된 산식 `0.40Q + 0.15D + 0.10B + 0.15T + 0.20C`, 60일 recency decay, 독립 소스 dedup. 구현: 배치 스코어러 + DB 컬럼. 가능: ✅ 기술적으로. **권고: 숫자 점수는 안 만든다**(SP-004 등급 차별화). 대신 "왜 이 등급인가" 분해만(트랙 2). 8h.
- **"Why this score" 3줄 요약**(Deep supporting evidence / Broad sourcing / Weak competition) — 산식 결과를 문장 템플릿으로. ✅ 3h.
- **"See calculation" 링크 → 방법론 문서** — 정적 페이지. ✅ 우리 `evidence-rules.md` 를 공개 페이지로. 3h.
- **Problem / Potential Solution / Why Now 3블록** — LLM 생성 텍스트(추정). ✅ 우리는 사람 검토 케이스라 생성 안 함. 해당 없음.
- **Market validation: 키워드별 Google Trends 스파크라인**(Recent median·Baseline·Momentum %) — Google Trends 비공식 API 또는 유료 데이터(추정). ⚠️ 약관 리스크·데이터 없음. 보류.
- **Competition 목록**(경쟁사 카드) — 추정 LLM+검색. ⚠️ 우리 데이터 없음. 보류.
- **Signals 탭: All/Job ad/Podcast/Trends 카운트 + 최신순 + 20건 페이지** — 소스별 필터된 근거 피드. ✅ 우리 HN 댓글·근거 행을 케이스에 붙여 그대로. 6h.
- **"Unlock 48 more signals" 페이월 + 소스별 잠긴 건수** — 요금제 게이트. ✅ 결제 후. 4h.
- **Like / Save / Share 3버튼** — 사용자별 저장 테이블. ✅ 로그인 사용자 한정. 4h.
- **Similar ideas** — 벡터 유사도(추정 pgvector). ✅ Supabase pgvector 있음. 우리는 `pairMoves`·병목 일치로 대체 가능. 6h.
- **"Added Aug 20, 2026" 등록일·카테고리 태그 3개** — 정적. ✅ 1h.

**신호 인프라**
- **Signal explorer: LIVE STREAM / HISTORY 탭 + 섹터·시그널 유형 필터 + "3 minutes ago" 실시간 피드** — 수집 파이프라인의 최신 행을 SSE/폴링으로. ✅ 우리 `analysis_inputs` 최신 HN 댓글을 그대로 피드로(§7.1: 수집 시각 표시). 8h.
- **신호 유형 = Job ads(구인 공고) · Podcast 전사 · Google Trends · 앱 리뷰** — 구인 사이트 수집 + 팟캐스트 STT(추정 Whisper). ⚠️ 구인 공고는 약관 확인 필요, 팟캐스트 STT 는 비용. 각 20h+. 보류.
- **"Pro signal evidence" 잠금** — 페이월. 위와 동일.
- **Demand Map(/map)** — 섹터×소스 매트릭스(추정). ✅ 집계 화면. 8h.

**검증기·기타**
- **Idea Validator(무료·가입 없음): 제목+설명 입력 → 643,813 시그널과 의미 매칭 → 점수·근거·경쟁사** — pgvector 임베딩 + 스코어러. ✅ **우리 `/analyze` 붙여넣기 경로가 이미 이 형태의 절반**(리뷰→속성). 아이디어 텍스트→케이스·VOC 매칭으로 확장 12h.
- **뉴스레터**(주간 브리프) — 이메일 발송 SaaS(추정 Resend/ConvertKit). ✅ 외부 서비스 필요. 6h.
- **API 문서(/docs/api)** — 공개 REST. ✅ 우리 라우트 문서화. 4h.
- **뉴스/블로그(방법론 공개 글 "Opportunity Score v3")** — CMS. ✅ 칼럼 읽기 화면 재사용. 2h.
- **카테고리별 pSEO 페이지(/ideas/category/…)** — 정적 생성. ✅ `reader_problem` 7 + 병목 7 로 14페이지. 4h.
- **Sign In(코랄 버튼)·Pro 요금제** — 결제. ⏸ 9/30 제외 항목.

## B. Preuve AI (preuve.ai) — 24개

**입구·리포트 생성**
- **홈 히어로 텍스트박스 "Describe your startup idea" → 60초 무료 스캔 → 판정** — 큐 + 10 에이전트 병렬(자체 설명) + 60+ 소스. 구현 추정: 작업 큐·에이전트 오케스트레이션·외부 API 다수. ⚠️ 우리 스택으로 축소판은 가능(케이스·VOC·failed_angles 매칭 1회 호출) 16h, 원본 규모(10에이전트·60소스)는 40h+ 및 API 비용.
- **"No human reads your idea" 프라이버시 배지** — 정책 문구. ✅ 0.5h.
- **한국어 로컬라이즈 + 원화 가격(₩39,000)** — i18n + 통화. ✅ 우리는 한국어 기본. 해당 없음.
- **Founder Report $29 1회 / Investor-Ready $499 / Radar Pro $19/월 / 평생 $499 / 화이트라벨** — 결제·요금제. ⏸ 9/30 제외.

**공유 리포트(/share/<id>) — 15섹션 좌측 네비**
- **좌측 섹션 네비**(Overview 83 · Evidence · Market Data · Community Signals · Competitors · Moat NEW · Business Model · Go-to-Market · Playbook · Validation · Financial · Action Plan · Tools · Synthesis · Pitch Audio · Investor-Ready) + 상단 탭(Analysis / Executive Summary / Investment Memo) — 클라이언트 라우팅 + 섹션별 JSON. ✅ 구조는 가능하나 내용이 전부 LLM 생성. 우리 상세는 11블록으로 충분(트랙 2). 해당 없음.
- **점수 링 83/100 + STRONG + "Verified" + TOP TIER 배지** — 산식 + 임계. ⚠️ 숫자 점수 권고 안 함(위). 배지 자체는 2h.
- **"The Bottom Line" 2문장 + "Watch out for" 3불릿 + Growth Potential/Tech Complexity/Revenue Timeline 3타일(Medium/High/Weeks)** — LLM 요약 템플릿. ✅ 우리는 사람 검토 필드(claim·preconditions·transfer_note)로 대응. 트랙 2에 포함.
- **"Next move: Launch on HN — Week 1 · Action 1 of 12" 액션 플랜 카드** — 12단계 생성 계획. ⚠️ 생성 콘텐츠. 우리 `transfer_note` 1개가 정직한 대응. 해당 없음.
- **Immediate Blockers: Porter's 5 Forces 34/Critical · Risk Factors 40/Needs Work · VC Scorecard 76/Strong** — 프레임워크별 점수. ⚠️ 근거 없는 숫자. 안 함.
- **Evidence 탭: "77 sources backing this analysis" · 그룹(Market Research 3 / Funding Data 11 / Competitors 10 / Industry News 10) · 도메인 표기 · "+5 more" 접기 · "Research" 태그** — 근거 행을 유형별 그룹 렌더. ✅ **우리 `case_evidence` 로 그대로 가능**(공시/자기보고/추정 그룹). 트랙 2 블록 5. 4h.
- **Community Signals: Pain points / Demand signals / Objections & Risks 3열 + Verdict 문단 + "Show more"** — LLM 분류. ✅ 우리 T2 relevant 댓글을 페인/수요/반론으로 분류하는 프롬프트 1개면 됨. 8h.
- **Competitors: 이름·도메인·펀딩 + 최대 15개** — Crunchbase 등 유료 API(추정). ⚠️ 데이터 소스 없음. 보류.
- **Moat(NEW) 섹션** — 생성. 해당 없음.
- **Pitch Audio(음성 피치)** — TTS. ⚠️ 우리 목적 밖. 안 함.
- **"Last updated 20/09/2026 · Updates automatically as you generate more data"** — 리포트 재생성 시각. ✅ 우리 `reviewed_at`·regrade 시각 표시. 1h.
- **"Test my idea now" 공유 페이지 CTA** — 전환 배너. ✅ 트랙 2 블록 10. 포함.
- **언어 토글(EN/KO)** — i18n. ⏸ 후순위.

**신뢰 장치**
- **/sources 방법론 페이지: "10 source categories · 280+ publications · 7,300+ sources cited across 410 paid reports" + 3단계 파이프라인 설명(10 agents parallel → cross-validated across models → …) + "View as Markdown"** — 정적 + 집계 숫자. ✅ **우리도 만들 가치 큼**: 소스 20곳·robots/약관 판정·등급 산식을 공개 페이지로. 4h.
- **"Every claim linked to its source"** — 근거 행 링크. ✅ 이미 구조 있음. 트랙 2.
- **리뷰 월(Trustpilot·Product Hunt·TAAFT 인용)** — 정적. ✅ 낼 것 생기면 1h.
- **14-day guarantee·Status: Operational** — 정책·상태 페이지. ✅ 1h.
- **무료 도구 5종(아이디어 생성기·이름 생성기·BMC·페르소나·가치제안)** — 단일 프롬프트 폼 5개(pSEO 유입용). ✅ 각 2h. 우리 목적엔 "실패 사례 검색기" 같은 무료 도구 1개가 더 맞음.
- **MCP 서버(/mcp)** — 리포트 데이터를 에이전트에 노출. ⚠️ 12h+. 후순위.

## C. BigIdeasDB (bigideasdb.com) — 26개

**데이터 소스·카드 형태(/examples 실측)**
- **11개 소스 카운트 타일**(Reddit pain points 2,000+ · SaaS ideas 1,100+ · Success stories 1,700+ · Capterra 39,000+ · G2 7,900+ · App Store 136,000+ · Revenue intelligence 6,000+ · Acquisitions 520+ · Validated demand 65,000+ · Upwork 1,200+ · Product Hunt 4,700+) — 소스별 테이블 count. ✅ 우리 소스 20곳 count 타일. 2h.
- **Reddit 페인 카드: 제목 · 설명 · "Medium impact" · "Low frequency" · 서브레딧** — LLM 태깅 2축. ✅ 우리 T2 판정에 impact/frequency 라벨 2개 추가(프롬프트). 4h.
- **SaaS 아이디어 카드: 이름 · "$1.2B mkt" · 카테고리 · 설명 · "Medium build" · "Moderate competition"** — 생성+태깅. ⚠️ 시장 규모는 근거 없는 숫자. 안 함.
- **Success story 카드: 이름 · "$83K/mo" · 설명 · 태그 · 서브레딧** — Reddit 수익 공개 글 수집. ✅ 우리 failed_angles 의 반대편(성공 원장)으로 가능, 단 자기보고 등급 C. 8h.
- **Capterra opportunity 카드: 제목 · 점수 8.7 · "~30% of companies report…" · "Vertical solution" · "Large market"** — 리뷰 집계 + LLM 점수. ⚠️ G2/Capterra 는 우리 약관 판정 탈락(SP-007). 안 함.
- **G2 insight: 서브카테고리 · "Mixed" 감성 · "66 companies analyzed"** — 동일. 안 함.
- **App Store gap: 앱명 · 평점 2.5 · 스토어 · 불만 요약** — 앱 리뷰. ⚠️ 우리 App Store 는 robots 로 꺼짐. 안 함.
- **Revenue intelligence: 스타트업 MRR · 증감 %** — 공개 MRR 수집(추정 Indie Hackers/Stripe 공개). ⚠️ IH 약관 탈락. 안 함.
- **Acquisitions: acquire.com 리스팅 · Asking · TTM rev/profit · 배수** — 스크래핑(추정). ⚠️ 약관 미확인. 보류.
- **Validated demand: "39% want it" 스와이프 검증** — 사용자 스와이프 투표 집계. ✅ **피드백 위젯의 확장형**(트랙 2 블록 8). 6h.
- **Upwork signals: "15× requested"** — 구인 공고 집계. ⚠️ 약관 미확인. 보류.
- **Product Hunt: 순위·투표수** — PH API 는 상업 이용 금지(SP-008). 안 함.

**탐색·SEO**
- **/problems pSEO: "Best Marketing Automation Software for Freelancers" 류 카테고리 분석 카드(15 data points)** — 템플릿 정적 생성 수백 페이지(실측 링크는 404 였음 → 일부 깨짐). ✅ 우리 병목×문제유형 조합 pSEO 14~49페이지. 6h.
- **"Site Teardown: complaints in your category"** — URL 넣으면 해당 카테고리 불만 요약(추정). ⚠️ 소스 의존. 보류.
- **Leaderboards** — 확인 불가(로그인).
- **Idea Evaluator** — **로그인 벽(실측 /idea-evaluator → /signin)**. 확인 불가.
- **무료 도구 15종**(MRR·Churn·LTV·CAC 계산기, 도메인 생성기, 키워드 생성기…) — 정적 계산기. ✅ 각 1~2h. 유입용.
- **Custom Data Requests(1M+ 데이터 CSV/XLSX/JSON 추출 판매)** — 데이터 상품. ⚠️ 우리 데이터 규모·약관상 안 함.

**빌더 도구·유통**
- **Reddit Researcher MCP · BigIdeasDB MCP · Claude Skills Packs** — MCP 서버 + 스킬 파일. ⚠️ 12h+. 후순위.
- **Micro SaaS Boilerplate · BuildGuide · BuildHub** — 템플릿 리포. 우리 목적 밖.
- **Clipper 크롬 확장** — 확장 프로그램. ⚠️ 20h+. 안 함.
- **Reddit Pipeline Builder** — 수집 파이프라인 UI. 우리는 발굴 엔진이 이 역할. 해당 없음.
- **NightShift(야간 자동 실행 상품)** — 우리 nightly 워크플로와 같은 개념. 해당 없음.

**전환·가격**
- **평생권 $99 / $199 / $349(할인 전 $599) + 월 $29 + "20 queries/day" 한도** — 결제 + 쿼리 카운터. ⏸ 9/30 제외. 카운터만 4h.
- **하단 고정 바 "Ship It Challenge · 코드 SHIPIT20 · 20% OFF · 7d 23h 카운트다운"** — 캠페인 배너. ✅ 2h(결제 후).
- **Wall of Love(별 5개 후기 + 아바타·소속)** — 정적. ✅ 1h.
- **"Book a Call" / Demo** — Cal.com 류. ✅ 0.5h.

## D. IdeaBrowser (ideabrowser.com) — 24개

**입구**
- **Idea of the Day: Google 로그인 또는 이메일 → 오늘의 아이디어 24시간 무료 + 매일 이메일** — 이메일 게이트 + 일 1건 노출 + 만료(Expires at midnight UTC). ✅ **가장 싼 리드 수집 장치**: 우리 "오늘의 케이스"(승인 케이스 1건 매일 공개, 나머지 로그인). 6h + 이메일 발송 서비스.
- **Agent Connector("Codex를 코파운더로")·Agent Skills·Business Coach(/hub/coach)** — MCP/스킬 + 코칭 챗. ⚠️ 12h+. 후순위.

**데이터베이스(/database)**
- **탭: All · New · For You(BETA) · Interested · Saved · Building · Not Interested** — 사용자별 상태 테이블(interested/saved/building/not_interested) + 개인화 추천. ✅ 상태 4종 테이블 1개. 6h(개인화 제외).
- **"AI Suggest" 버튼 + "All Filters" 패널 + "1,915 ideas" 카운트 + 정렬(Newest First)** — 필터 UI + LLM 추천. ✅ 필터 4h, AI 추천 6h.
- **카드 우측 액션 열(Interested / Not Interested)** — 위 상태 테이블. 포함.
- **"Idea of the Day" 배지·날짜** — 정적. 1h.

**상세 페이지(실측 헤딩 45개)**
- **상단 액션 바: Idea Actions 드롭다운 · 북마크 · 공유 · "Roast"(비판 모드) · "Build with Google AI Studio"(프롬프트 내보내기)** — 저장/공유 + 외부 도구 딥링크. ✅ 저장·공유 4h, "Roast"는 LLM 반론 생성 6h(우리는 failed_angles 가 반론 역할 — 데이터 기반이라 더 낫다).
- **배지 행: "Perfect Timing" · "Unfair Advantage" · "+11 More"** — 생성 라벨. ⚠️ 근거 없음. 안 함.
- **키워드 스파크라인("Game app advertising · 1.3K volume · +1082% growth · 2023~2026")** — 키워드 볼륨 API(추정 Semrush/DataForSEO 유료). ⚠️ 비용. 보류.
- **점수 타일 3개: Opportunity 9 Exceptional · Problem 10 Severe Pain · Feasibility 9 Very Easy** — LLM 채점. ⚠️ 안 함(SP-004).
- **Business Fit / Offer(Value Ladder: Lead magnet·Frontend·Core·Backend·Continuity) / Why Now / Proof & Signals / Market Gap / Execution Plan** — 생성 섹션 6개. 우리는 사람 검토 5필드. 해당 없음.
- **Framework Fit: Value Equation(5 Needs attention) · Market Matrix 2×2 · A.C.P 6/10 · Value Ladder** — 프레임워크 채점. ⚠️ 안 함.
- **Categorization: Type(SaaS)·Market(B2B)·Target·Main Competitor·Trend Analysis** — 패싯. ✅ 우리 6축 패싯과 동일. 이미 있음.
- **Community Signals: Reddit 5 subreddits · Facebook 4 groups · YouTube 14 channels·15 themes · Other 5 segments** — 소스별 카운트 + "View detailed breakdown". ✅ 우리 HN·커뮤니티 소스 카운트. 4h.
- **Top Keywords: Fastest Growing / Highest Volume + "LOW competition" 태그** — 키워드 API. ⚠️ 보류.
- **"What'd you think of this idea?" 피드백 위젯** — 👍/👎 저장. ✅ **트랙 2 블록 8**. 3h.
- **"Get Instant Answers — AI Chat with this idea" + 인기 질문 6개** — 문서 컨텍스트 챗. ✅ 케이스 1건 컨텍스트 챗 8h(Gemini 비용). 후순위.
- **Download Data(JSON 내보내기) · Founder Fit · Claim Idea** — 내보내기 2h / 프로필 매칭(우리 `seller_profiles`↔`preconditions` 대조, 트랙 2 후속 8h) / 소유권 표시 2h.
- **면책 문구("Revenue estimates, scores… illustrative")** — 정적. ✅ 우리는 등급으로 대체. 1h.

**콘텐츠·SEO**
- **Trends pSEO(/trends/<검색어>)·Market Insights(/market-insights/<페르소나>)** — 키워드·페르소나별 정적 페이지 수천. ⚠️ 키워드 데이터 없음. 페르소나 페이지는 우리 `reader_problem` 7 + 병목 7 로 가능 4h.
- **가격: Starter $499/yr · Pro $1,499/yr · Empire(코칭·커뮤니티) · 기프트카드 · "Is it worth it?" 자기 설득 섹션** — 결제. ⏸.

## E. PainMap (painmap.io) — 12개 (공개 앱 화면 없음 — 마케팅 페이지 실측)

- **입력 1칸("Drop your idea in") → 5플랫폼(Reddit·X·G2·Capterra·Trustpilot) 병렬 리서치 → 브리프** — 병렬 스크래핑/LLM. ⚠️ X·G2·Capterra·Trustpilot 은 우리 약관 판정 탈락. 축소판(HN·OKKY·velog·다나와)은 가능 16h.
- **"All 10 pain points revealed" 고정 개수 출력** — LLM 추출 상위 10. ✅ 우리 extract 속성 5~7개와 같은 형태. 이미 있음.
- **경쟁사 1·2점 리뷰 마이닝 → 로드맵** — 리뷰 소스 의존. ⚠️ 안 함.
- **WTP(지불의향) 가격 신호 추출** — LLM 이 대화에서 가격 언급 추출. ✅ **우리 `wtp_signals` 테이블·설문이 이미 있고, T2 댓글에서 가격 언급 추출 프롬프트 1개 추가** 6h.
- **랜딩 페이지 카피 자동 생성("in your customers' own words")** — LLM. ✅ 우리 칼럼/스레드 초안 루프 재사용 4h. 후순위.
- **완성 브리프(핵심 기능·가격·카피)** — 위 셋의 합본. 해당 없음.
- **크레딧 1회성 결제 $29(3회)/$79/$199(10크레딧 · 만료 없음)** — 크레딧 원장. ⏸ 9/30 제외. 원장만 4h.
- **"Community source breakdown"(소스별 기여 비율)** — 집계. ✅ 2h.
- **4단계 How it works·FAQ·피드백 페이지** — 정적. 1h.
- **디자인: DM Sans 본문 + Nunito 900 72px 히어로 + 보라/파랑 그라데이션 블롭 + 브리프 목업 카드** — 트랙 1 참고(가져오지 않음, 우리 톤과 다름).
- **로그인 뒤 앱** — 확인 불가.
- **블로그(/blog)** — 확인 안 함.

## F. 종합 — 우리가 가져오면 이득이 큰 순서 (전부 미구현·미착수)

**≤8h · 데이터 이미 있음 · 남헌 결정만 있으면 가능**
1. 케이스 저장·공유 링크(Trend Seeker Like/Save/Share) 4h
2. 피드백 위젯 👍/👎(IdeaBrowser) → T3 사람 신호 3h
3. 관련 케이스 3 + CTA 배너(Atria, 이미 확정) — 트랙 2
4. 근거 그룹 렌더(Preuve Evidence 탭) — 트랙 2 블록 5, 4h
5. 신호 라이브 피드(Trend Seeker Signal explorer) — HN 최신 댓글 노출 8h
6. 방법론 공개 페이지(Preuve /sources + Trend Seeker score v3 글) — 소스 20곳 판정·등급 산식 4h
7. 페인 카드 impact/frequency 태그(BigIdeasDB) — T2 프롬프트 라벨 2개 4h
8. 커뮤니티 페인/수요/반론 3열(Preuve Community Signals) — T2 댓글 분류 8h
9. 상단 통계 알약(+N this week) 2h · 소스 카운트 타일 2h
10. 오늘의 케이스 + 이메일 게이트(IdeaBrowser Idea of the Day) 6h + 발송 서비스

**10~16h · 새 입구**
11. "내 아이디어 넣기 → 케이스·VOC·실패사례 매칭 리포트"(Trend Seeker Validator 축소판) 12~16h — **9/30 이후 가장 큰 제품 도약 후보.** 우리 검색+어드바이저+T2 를 한 폼으로 묶는 것.
12. 사용자 상태(Interested/Saved/Building) 6h · pSEO 14~49페이지 6h · WTP 언급 추출 6h

**보류(약관·데이터·비용)**: G2/Capterra/App Store/Product Hunt/Indie Hackers 기반 전부, Google Trends·키워드 볼륨, 구인 공고·팟캐스트 STT, Crunchbase 경쟁사, 크롬 확장, MCP, 숫자 점수(0~100)·프레임워크 채점(우리 원칙과 충돌).

## G. 확인 불가
- 5곳 모두 로그인 뒤 화면(대시보드·저장함·필터 패널·Pro 콘텐츠·Idea Evaluator·Leaderboards).
- 각 사이트의 실제 데이터 갱신 주기·백엔드(추정으로만 표시).
- 모바일 레이아웃(데스크톱만).
