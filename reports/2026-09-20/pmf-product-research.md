# PMF 파인더 제품 리서치 — 온보딩·결과화면·추천·근거 패턴 (2026-09-20)

조사 방법: WebSearch + WebFetch 로 **도움말센터·문서·릴리스노트·창업자 블로그·리뷰(G2/Capterra/Trustpilot)·Product Hunt·YouTube 설명**만 팠다.
랜딩·프라이싱 페이지는 [2026-09-19 UI 레퍼런스 노트](../2026-09-19/ui-reference-notes.md)가 이미 훑었으므로 **의도적으로 건너뛰었다**. 중복 서술 없음.

표기 규칙 (§7.1 — 확인 실패를 양성으로 접지 않는다):
- **공식 확인** = 그 회사 소유 도메인의 문서·도움말·릴리스노트에서 직접 읽음
- **리뷰 근거** = 제3자 리뷰·집계 사이트·실사용 후기. 사실일 가능성은 높지만 1차 출처 아님
- **확인 불가** = 못 찾았거나 페이지가 JS 로 렌더돼 본문을 못 읽음. **없다는 뜻이 아니다**

⚠️ 이번 라운드의 공통 한계: 네 경쟁사 모두 **알림/다이제스트의 실제 UI 문자열**은 도움말 페이지가 JS 앱으로 떠서 본문을 못 읽었다. 로그인 뒤 실화면은 이번에도 0곳이다(9-19 노트와 동일).
⚠️ WebFetch 로 web.archive.org 접근이 막혔다. 종료된 제품(Splitbee·MagicBrief)은 아카이브 대신 살아 있는 페이지·2차 자료로만 팠다.

---

## A. 경쟁사 (광고 크리에이티브 인텔리전스 계열)

### A-1. Foreplay (foreplay.co) — ARR 약 $1.2M

**온보딩 (1)**
- 가입 → **Chrome 확장 설치 → 설치가 끝나면 로그인 페이지로 자동 리다이렉트**. 공식 문구: "To get started, you need to visit the Sign Up page to create an account using an email and secure password or your Gmail account, then download the Google Chrome Extension, which will automatically redirect you to login." (공식 확인, https://help.foreplay.co/articles/7011049-chrome-extension)
- **첫 입력이 폼이 아니라 "저장 행동"이다.** 확장이 Facebook Ad Library / TikTok Creative Center / LinkedIn 페이지에 `Save to Foreplay` 버튼을 주입하고, 누르면 광고 소재·URL·CTA·랜딩페이지 풀스크린샷(데스크톱+모바일)이 보드에 들어간다. **보드/폴더를 저장 버튼 안에서 즉석 생성**할 수 있어 대시보드로 돌아가지 않는다. (공식 확인, https://www.foreplay.co/post/how-to-save-and-share-ads-with-your-swipe-file-in-foreplay)
- **TTFV 우회로가 따로 있다**: Discovery(50만+ 큐레이션 광고 라이브러리)는 저장을 하나도 안 해도 즉시 검색·필터(포맷/언어/B2B·B2C/집행기간/날짜)가 된다. 즉 "내 데이터 0건"이어도 첫 가치가 나온다. (공식 확인, https://www.foreplay.co/discovery)
- 신규 계정에 **샘플/데모 스와이프 파일이 깔리는지는 확인 불가**. 저장 0건일 때의 빈 상태 문구도 확인 불가.
- 7일 체험, 카드 불필요 (리뷰 근거, https://aazarshad.com/resources/foreplay-review/)

**결과 화면 (2)**
- Lens(Creative Analytics) 대시보드 자기 설명: "your mission control in Lens... a real-time snapshot of how your ad account is performing — **no digging, no guesswork**" (공식 확인, https://help.foreplay.co/articles/4085871-dashboard)
- 브랜드마다 대시보드 1장, 고정 섹션: **Spend + Goal Metric / Creative Tests 개요(드릴다운) / 세그먼트 대비 벤치마킹 / Recent Reports / Creative Leaderboard(지출·목표지표 상위 광고)**
- 리포트는 두 종류로만 고정: **Top Performing Reports**(임의 차원으로 묶어 성과순), **Comparison Reports**(필터로 묶은 광고 묶음 비교). (공식 확인, https://help.foreplay.co/en/help/collections/4789522-lens-creative-analytics)
- 도움말 목차에 **"Foreplay Scores"** 항목이 존재하나 본문을 못 읽었다 — **점수 척도·라벨 확인 불가**. 제3자 비교글은 타사 점수와 뒤섞어 쓰므로 인용하지 않는다.
- 벤치마크 모수가 자료마다 "30,000+" / "20,000+" 로 갈린다 — **확인 불가**, 숫자를 인용하지 말 것. (https://www.netinfluencer.com/foreplay-launches-lens-analytics-platform-without-ad-spend-based-pricing/)
- 카드/표 어느 쪽인지 등 **시각 레이아웃은 확인 불가**(텍스트 페치로 안 나옴).

**분석 → 행동 (3) — Briefs 가 핵심**
- 스와이프 파일의 광고를 **레퍼런스로 지정해 브리프를 만든다**. 브리프에는 마감일 + 상태(**To Do / In Progress / Needs Review / Completed**) + 설명 필드가 붙는다. (공식 확인, https://www.foreplay.co/post/foreplay-2-0)
- **Brand Profiles**: 로고·컬러·보이스 가이드·미션을 한 번 만들어 두고 "inject reusable mission-critical content with brand profiles with a single click" (공식 확인, 같은 글) — **브리프마다 브랜드 맥락을 다시 안 쓴다.**
- **AI Script Generator**: 스와이프 파일의 영상 1개를 레퍼런스로 고르고 브랜드명·제품·타깃·언어를 넣으면 **`Script Copy / Dialogue`, `Action, Scene Descriptions`, `Text Overlay Ideas`** 세 블록으로 출력. 생성에 "may take up to 60 seconds" 라고 **소요시간을 먼저 말한다**. (공식 확인)
- **Storyboard Generator**: 스크립트 → 원클릭 스토리보드, 각 씬을 레퍼런스 영상 프레임으로 먼저 채운다. **"Magic Rewrite"** 로 "generate endless versions of individual scenes" — **씬 단위 재생성**. (공식 확인)
- 모듈식 브리프 설정(deliverables / style / duration 등을 몇 번의 클릭으로 상세도 조절)
- "5개 레퍼런스 광고를 고르면 훅 패턴·톤 시그널·구조를 추출한다"는 서술이 있으나 **리뷰 근거**뿐 — 숫자 5 는 신뢰하지 말 것.

**근거·신뢰 (4)**
- 주된 "왜 이게 중요한가" 장치는 **동종 광고주 대비 벤치마크** 하나다. 지표별 신뢰구간·표본수 표기는 **확인 불가**.
- Foreplay Scores 의 설명 패턴 **확인 불가**.

**카피·알림·협업 (5)**
- Spyder 태그라인(공식 확인, https://help.foreplay.co/help/articles/2758078-getting-started-with-spyder): **"Spyder does the heavy lifting of competitor ad tracking on autopilot"**, "Track every ad your competitors launch on autopilot", "the only ad spy tool that automatically extracts top-performing hooks"
- Spyder 도움말 6편 목차: Getting Started / Track Competitor / **Competitor Creative Tests** / **Competitor Hooks** / **Competitor Landing Pages** / **Timeline View** — 경쟁사를 "광고 목록"이 아니라 **테스트·훅·랜딩·시간축 4개 축으로 쪼개 본다**는 게 구조적 힌트다. (본문은 확인 불가)
- 알림: "Spyder sends updates about competitor ad activity directly to Slack or via email, with a real-time alert system" — **2차 집계 출처(1800dtc.com)뿐**. Foreplay 자사 문서에서 **실제 알림 문구·주기(일간/주간)는 확인 불가**. 명시적으로 플래그한다(요청 항목이었음).
- 협업: 브리프를 **링크 하나로 사내·사외 공유**("no need to worry about onboarding clients or other creative team members"), **여러 크리에이터에게 같은 브리프를 보내 산출물을 한곳에 모음**, 백엔드에서 **누가 언제 제출했는지** 표시. 공개 공유 링크 + 내부 코멘트, **Notion 임베드** 지원.
- 평판: G2 4.8/5(124건), Capterra 4.8/5 — 둘 다 직접 페치 403, 검색 발췌 기반(리뷰 근거). 장점: 광고가 "영원히 남는다"(FB 링크 만료 대비). 단점: 가격 인상 속도, Meta 편중, 확장 프로그램 오류, 구글/유튜브 광고 미지원.

**가격 게이팅 (6)** — 2.0 에서 티어명이 Solo→**Inspiration**, Team→**Full Workflow** 로 바뀌었고 런칭 시점엔 Spyder 와 브리프 PDF 내보내기가 "Coming Soon"(=상위 게이팅 예고).

### A-2. MagicBrief (magicbrief.com) — 2026-07-31 종료, Canva Grow 로 흡수

> 종료 맥락(공식 확인): "MagicBrief will close on July 31, 2026" 8PM EST, 공지 시점에 과금 취소, 그 전에 데이터 내보내기 안내. **크리에이티브 분석 절반만 Canva Grow 로 넘어가고, 팀들이 실제로 살던 "광고 라이브러리·경쟁사 리서치" 기능은 넘어가지 않는다.** (https://magicbrief.com/post/magicbrief-canva-acquisition , https://magicbrief.com/post/magicbrief-canva-faqs)

**온보딩 (1)** — 카드 없이 무료 체험 가능(리뷰 근거, https://aazarshad.com/resources/magicbrief-review/). **첫 화면·첫 입력 순서는 확인 불가**(magicbrief.com/learn 본문 회수 실패).

**결과 화면 (2) — 이번 조사에서 가장 쓸 만한 발견**
- Insights 대시보드(2025-02-07 릴리스): "a centralised overview of your account performance as a whole, **without always needing to build reports**", 용도를 **"during weekly meetings"** 라고 못 박았다. (공식 확인, https://magicbrief.com/release/dashboard)
- **"Customise your view with 4 key metrics that matter most to your business"** — 대시보드 상단을 **사용자가 고른 지표 4개로 고정**. (공식 확인)
- **"Set internal benchmarks or let MagicBrief monitor automatically"** — 벤치마크를 외부 평균이 아니라 **내 과거 기준선**으로도 잡게 한다. (공식 확인)
- **Wizard Scores**: 계정 단위 점수를 **hook / hold / click / buy 4단계로 쪼갠다**("monitor account-level wizard scores (hook, hold, click, and buy)", 공식 확인). **단일 점수가 아니라 퍼널 단계 분해**라는 게 핵심 — "왜 이 광고가 되는가"를 설명하는 장치가 곧 점수 구조 자체다.
- 개별 광고에는 **1~4 척도 AI ad score**, "over 60 different data points" 기반으로 "the script's quality, the editing's pacing, and the ad's longevity" 반영 (여러 2차 출처가 **동일 문구**로 반복 — 자사 카피 인용으로 보이나 자사 페이지에서 직접 확인 못 함 → **리뷰 근거**).
- **"Smart recommendations"**(릴리스 당시 베타): 최적화 기회를 찾아 "suggest specific iterations to boost performance". (공식 확인)
- "Spot your top-performing ads instantly" (공식 확인)
- 시각 레이아웃(카드 vs 표) **확인 불가**.

**분석 → 행동 (3)** — 브리프가 **블록 에디터**라 레퍼런스 소재·스토리보드를 브리프 본문에 직접 임베드, 반복 캠페인용 템플릿 제공(리뷰 근거). MagicAI 가 "automatically breakdown and transcribe video ads and create storyboards in seconds"(리뷰 근거) — Foreplay 와 같은 모양의 루프.

**근거·신뢰 (4)** — hook/hold/click/buy 분해가 사실상 유일한 설명 장치다. **인용·표본수·신뢰구간 패턴 없음(확인 불가)**.

**카피·알림·협업 (5)** — 실시간 공동 편집(리뷰 근거), 브리프 링크 공유·내보내기. 알림은 "새 프로젝트·업데이트를 알려준다" 수준의 모호한 후기뿐 — **Spyder 급 경쟁사 알림 제품은 존재 증거 없음(확인 불가)**. G2 페이지 403 으로 원문 인용 실패.

**가격 게이팅 (6)** — Pro $29/월(1석) + 추가 석당 $9/월(최대 10석, 상한 ~$110), Business 는 커스텀 + SAML/SSO (리뷰 근거).

### A-3. Atria (tryatria.com)

**⚠️ 이름 정정 — 9-19 노트의 "Raya 가 등급을 매긴다"는 서술은 절반만 맞다.**
- **Radar** = 내 광고 계정의 소재를 채점하는 **분석·등급 엔진**
- **Raya** = 그 데이터 위에 얹힌 **대화형 에이전트/Slack 봇**
둘이 별개 문서 면으로 존재한다(공식 확인, https://www.tryatria.com/blog/creative-reporting-tools , https://intercom.help/atria-e5456f8f6b7b/en/articles/13862309-ask-raya-your-ai-analytics-companion). 리뷰 글들이 뭉뚱그려 쓰는 것을 그대로 옮기면 안 된다.

**온보딩 (1)** — 공식 문서 사이트(docs.tryatria.com, llms.txt 색인으로 확인)가 **퀵스타트를 세 갈래로 나눈다: API / MCP / "your AI coworker – Raya"**. 사람·개발자·AI 에이전트별로 진입로가 다르다. **첫 입력·빈 상태 화면은 확인 불가**(퀵스타트 본문이 내비게이션 카드만 반환).
- 한 리뷰가 "30일 도입 로드맵"(1일차 광고계정 연결+24시간 과거 데이터 적재 → 3일차 6개월 소재 감사 → 7일차 브랜드 거버넌스·팀 초대 → 14일차 신규 컨셉 5개 예측점수 테스트 → 30일차 ROAS 베이스라인 비교)을 적고 있으나 **자사 사이트에서 교차확인 실패 → 리뷰 근거**. 셀프서브 투어라기보다 엔터프라이즈 도입 서사로 읽힌다.

**결과 화면 (2) — Radar 등급 리포트**
- **공식 확인**: Radar 는 **최근 90일** 성과를 보고 모든 소재를 세 바구니로 나눈다 — **Winners / High iteration potential / Iteration candidates**
- 각 바구니에 **처방이 붙는다: scale / iterate / kill** (여러 독립 출처가 동일 삼분법으로 일치 — 신뢰도 높음)
- 소재별 **A~D 문자 등급을 Conversion / Hook / Retention / CTR 4축**으로 매긴다는 서술이 여러 3자 출처에 일치하나 **자사 페이지에서 직접 확인 못 함 → 리뷰 근거**(9-19 노트가 "등급+수정안"이라 적은 근거가 여기다).
- 포지셔닝 문장(공식 확인): **"Traditional reporting tools like Facebook ads reporting tools and Meta's native interface were built for analysts, not creatives."** Meta 는 "무슨 일이 있었나"를, Radar 는 **"다음에 뭘 할까"**를 답한다.
- **"tells you exactly what to fix" 의 실제 화면 문자열은 확인 불가** — 마케팅 요약문으로만 반복된다. 요청 항목이라 명시한다.
- **Ask Raya**(공식 확인, intercom 도움말): 진입 경로가 문서에 경로 그대로 적혀 있다 — **Analytics & Launch → Raya 탭 → "Ask me anything" 입력칸**. 답변에 **실제 광고 소재를 나란히 붙여 보여준다**("with the actual ad creatives shown alongside the answer"). 문서가 제시하는 예시 질문(그대로):
  - *"Which ads have declining ROAS over the last 7–14 days?"*
  - *"Which ads are spending but not converting?"*
  - *"Which format is converting most efficiently?"*
  - *"Which videos have the highest hold rates?"*
  - *"Show me ads with high ROAS but low spend."*
  - *"Build a report I can share with my team on this week's performance."* → 그래프 포함 리포트를 생성
  **빈 입력칸에 예시 질문을 박아 두는 것**이 이 제품의 빈 상태 해법이다.

**분석 → 행동 (3)** — 세 바구니 자체가 추천 엔진이다. Foreplay Lens(지표·벤치마크 제시, 판정 없음)나 MagicBrief(퍼널 분해, 명시적 판정 없음)보다 **판정 밀도가 가장 높다**. Slack 의 Raya 는 "monitors performance, digs into competitors, and generates creatives in the channels where teams already work" + DM·@멘션·**스케줄 리포트(일간/주간 요약을 임의 채널에 게시, Meta·TikTok)**(https://www.tryatria.com/slack, 공식 확인·발췌).

**근거·신뢰 (4)** — "$5B+ 광고비로 학습" vs "$9B+" 로 **같은 런칭 건에 숫자가 갈린다 → 확인 불가, 인용 금지**. 90일 조회창 고지 외에 각주·표본수 패턴 없음.

**카피·알림·MCP (5)**
- MCP 문서 구조(공식 확인, docs.tryatria.com): REST API + 네이티브 MCP 서버 두 갈래, "Available Tools" 를 도메인별로 묶고(광고 라이브러리 검색, 브랜드 라이브러리, Meta/TikTok 계정 관리, 이미지 생성, 영상 전사, 보드 관리), **Use Cases 에 예시 프롬프트를 박아 둔다**: Competitor Research / **Daily New-Ad Digest(크론으로 어제 새로 뜬 광고를 뽑는 레시피)** / Keyword Ads Search / Long-Form Video Research(60초+) / **"Analyze a Board with Claude"**(보드 광고를 LLM 에 넘겨 군집·분석)
  → **다이제스트를 내장 푸시가 아니라 "문서에 적힌 크론 레시피"로 제공**한다는 게 특이점이다.
- **Trustpilot 리뷰 7건 중 5건이 1점** — "billing without consent", "cancellation button reported to be non-functional across multiple browsers", "auto-upgrade to a paid plan when testing a feature". 반면 G2 는 ~4.7/5(22건). **플랫폼 간 평점 격차 자체가 신뢰 리스크 신호**다(양쪽 표본 모두 작음, 리뷰 근거이나 2회 독립 교차확인).
- 단점 인용(리뷰 근거): **"no clean way to let clients view dashboards or outputs without either taking screenshots or giving them full access"** — 읽기 전용 공유의 부재가 실제 불만이다.

**가격 게이팅 (6)** — Core ~$129~159/월, **경쟁사 브랜드 AI 인사이트는 Plus 이상**, 월 AI 크레딧 **이월 안 됨**(SP-002 가 지목한 크레딧 절벽 안티패턴과 같은 모양) (리뷰 근거).

### A-4. Mirra / Mirr (mirra.my)

**⚠️ 동명 제품 3개 — 혼동 주의**: (a) mirra.my 콘텐츠 마케팅 도구(이 절의 대상), (b) Shopify 가상피팅 앱 "Mirra", (c) 데스크톱 AI 비서 getmirra.com. (b)(c) 는 무관하므로 배제.

**온보딩 (1)**
- 자사 도움말(공식 확인, https://www.mirra.my/en/help): "Getting started with Mirra" = **"A quick path from signup to your first AI-generated social content"**(3분 읽기), 핵심 지시가 **"Connect the social account you want to manage first, then create one project before adding more workflows."** — 9-19 노트가 인용한 FAQ("계정 연결은 나중에 해도 된다")와 **도움말의 권장 순서가 서로 다르다**. 랜딩 FAQ 는 진입장벽을 낮추고, 도움말은 연결부터 시키는 이중 구조다.
- 첫 입력(공식 확인, 한국어 에이전시 페이지 https://www.mirra.my/ko/for/agencies): **"공개 홈페이지·블로그·상품 링크를 입력하고 수집한 내용을 확인하세요"**. 흐름은 **입력(고객사 링크 + 목적/타깃) → 생성(카드뉴스·숏폼 초안, 톤 커스터마이즈) → 출력(카피/이미지/스타일 리뷰 후 다운로드)**.
- AI 캐러셀 경로는 **"a topic, URL, or reference design"** 셋 중 아무거나 받는다. 레퍼런스 캐러셀 이미지 1~5장을 올리면 **컬러·타이포·레이아웃·디자인 패턴을 뽑아 재사용 템플릿으로 만든 뒤** 본문을 슬라이드로 구조화한다.
- **샘플/데모 데이터·빈 상태 문구는 확인 불가.**

**결과 화면 (2)** — "Manage content in one place" 라는 Content Manager 가 중심 화면이고, **초안 검토 + 예약 + 채널 정리**로 조직된다(도움말 색인, 본문 404 로 상세 확인 불가). **점수·등급 체계가 아예 없다** — 네 경쟁사 중 유일.

**분석 → 행동 (3)** — 평가형이 아니라 **재생산형**이다. 입력 1개(아이디어/블로그/영상/URL) → 캐러셀·숏폼·블로그·플랫폼별 텍스트로 자동 팬아웃. 생성 후 조절 레버는 **"Change the AI writing tone"** 하나("output feels too lengthy, formal, or misaligned with brand voice"). **"너와 비슷한 사례" 갤러리는 없음(확인 불가/부재 추정)**.
- MCP 도구 카테고리(공식 확인, https://www.mirra.my/en/mcp-intro): 캐러셀 8 / Video Lab 10 / 블로그 4 / 예약발행 6 / **성과분석 3** / DM 자동화 6 = 39개. 예시 프롬프트를 그대로 박아 둔다: *"Create three Instagram carousel posts and five LinkedIn posts for our product launch this week"*, *"Turn this blog into an editable Video Lab draft"*, *"Summarize recent post performance."*

**근거·신뢰 (4) — 이 제품에서 제일 배울 만한 지점**
- 에이전시 페이지의 명시적 한계 고지(공식 확인, 한국어 원문): **"초안 제작과 최종 납품은 달라요"** — 2분이라는 주장은 **초안 생성에만** 해당하고, 사실 검증·브랜드 가이드 검토·고객 수정·고객 승인은 **우리가 하지 않는다**고 스스로 적는다.
- 도움말에 **"Publish safely without looking automated"**("Best practices for maintaining account safety with AI-managed content") 항목이 있다 — 제품이 **봇처럼 보일 위험을 스스로 인정**하는 항목(본문은 확인 불가).
- 인용·신뢰도·"왜 이 콘텐츠가 되는가" 설명 카드는 **없음(확인 불가/부재 추정)**.

**카피·알림·협업 (5)** — "Work together in one workspace"(팀원 초대) 항목 존재, 상세 확인 불가. **경쟁사 알림·다이제스트 기능 없음(확인 불가/부재 추정)**. G2/Capterra 등재 없음, Product Hunt 확인 불가. 한국어 후기는 제휴 계정(@ai_hamzzi.mirra) 홍보물이 대부분이라 근거로 쓰지 않는다.
- 색깔 하나: 스레드에 "Mirra AI 사태"라며 다계정 자동 포스팅·계정 정지를 다룬 글이 있다(https://www.threads.com/@andytechcan/post/DST9_A6jr0L/). **진위 확인 불가** — 기능이 아니라 평판 신호로만 적어 둔다.
- MCP 인증 문구(공식 확인): "Claude connects through login-based authorization", **workspace-scoped access**, **"revocable anytime"**.

**가격 게이팅 (6)** — 비랜딩 출처에서는 **확인 불가**.

### A-5. 경쟁사 4곳 가로 비교 — 판정 밀도 스펙트럼

| | 판정을 내리나 | 점수 구조 | 행동 산출물 | 알림 |
|---|---|---|---|---|
| Atria Radar | **가장 강함** — scale/iterate/kill | 3바구니 + (A~D×4축, 리뷰근거) | Slack 스케줄 리포트 | 문서형 크론 레시피 |
| MagicBrief | 중간 | **hook/hold/click/buy 퍼널 분해** + 1~4점 | 블록 에디터 브리프 | 근거 없음 |
| Foreplay | 약함 — 지표·벤치마크 제시형 | Foreplay Scores(확인 불가) | **Briefs + 스크립트 + 스토리보드** | Spyder(문구 확인 불가) |
| Mirr | **없음** — 평가 안 함 | 없음 | 멀티포맷 팬아웃 | 없음 |

- 광고계 3사는 **"소재 저장 → 자동 스토리보드/스크립트 → 씬 단위 반복"** 이라는 같은 루프로 수렴한다. Mirr 은 같은 모양의 루프를 **경쟁사 광고가 아니라 자사 콘텐츠**에 적용한다.
- **알림/다이제스트의 실제 문구는 네 곳 모두 1차 출처로 확인 못 했다.** 없다는 뜻이 아니라 못 읽은 것이다.

---

## B. 레퍼런스 (인접·비경쟁 제품)

### B-1. Splitbee (splitbee.io) — 2022-10 Vercel 인수 후 종료

⚠️ **web.archive.org 접근이 도구 레벨에서 막혔다**(직접 페치·CDX·프록시 4종 전부 실패). 아래는 아직 살아 있는 하위 페이지 + 검색 색인에 남은 404 글의 제목·요약 + 3자 리뷰 기반이다. **대시보드 레이아웃과 "첫 이벤트 대기" 빈 상태 문구는 끝내 확인 불가.**

- 창업자: Tobias Lins · Timo Lins 형제(빈). 인수 후 Tobias 가 Vercel 관측성 도구(Analytics·Speed Insights·Logs) 테크리드. (https://vercel.com/blog/vercel-acquires-splitbee)
- **온보딩 (1)**: 가입 → 프로젝트 이름 + 웹사이트 URL → 빈 대시보드. 스크립트 한 줄(`cdn.splitbee.io/sb.js`) 또는 `npm i @splitbee/web`. 번들 크기를 **"6kB(gzip ~3kB) vs Google Analytics 47.1kB"** 로 못 박아 설치 저항을 숫자로 없앴다. (https://time2hack.com/splitbee-as-replacement-of-google-analytics/)
- **데모 앱이 아직 살아 있다**: demo.splitbee.io 가 테스트 액션 **딱 3개**만 보여준다 — `Identify` / `Send Conversion Event Frontend` / `Send Custom Event Backend`. 설치 직후 "뭘 눌러야 데이터가 생기나"를 3개로 줄인 샘플 환경. (직접 페치 확인, https://demo.splitbee.io/)
- **대시보드 (2)**: 상단 내비 → **사이드바 내비로 개편**. 창업자 본인의 변경로그 문장: *"Splitbee blew too fast with new features that the top navigation was not enough anymore"* (https://www.indiehackers.com/product/splitbee/splitbee-dashboard-redesign--MGAC-JAPeyFjgXX874I). 지표 섹션: unique users / page views / pages / sources / events / users / top pages / referrers / demographics.
- **퍼널 (3)**: 첫 이벤트로 모수를 정의 → 단계 추가 → **어디서 가장 많이 빠졌는지 시각화**. 리포트에 **funnel step conversion rate** 와 **funnel step abandonment rate** 둘 다. (404된 `splitbee.io/blog/introducing-funnels` 의 검색 색인 요약)
- **A/B (4)**: 서버사이드 A/B, URL 스플릿, 커스텀 실험을 대시보드에서 직접. **유의수준·신뢰도 UI(95% 배지 등)는 확인 불가** — 어떤 출처도 결과 화면을 기술하지 않는다.
- **자동화 (5)**: "Smart Actions"(행동 트리거 → 이메일/웹훅/푸시) 로드맵. 실제 사용자 사례로 **신규 구독자 발생 시 텔레그램 알림**, **추적 이벤트를 Notion DB 로 흘려보내기**(https://community.splitbee.io/c/updates/splitbee-automations-now-support-notion).
- **카피 (6)**: 태그라인 *"Your friendly all-in-one analytics & conversion tool."* / 창업자 PH 코멘트 *"Everything is realtime. All features included - no upgrades needed."* / *"get rid of the noise and focus on the most important data"* / 사용자 후기 *"extremely fast to navigate through the dashboard"*, *"Splitbee is like taking a walk in the park"*.
- **공유**: `app.splitbee.io/public/<도메인>` 형태의 **공개 대시보드 링크**가 실제로 쓰였다(react-hot-toast.com 사례).
- **가격 게이팅**: 무료 티어는 있었으나 트래픽이 늘면 **커스텀 이벤트 데이터가 redact(가려짐)** 된다는 경고가 튜토리얼에 남아 있다. 최종 가격표는 확인 불가.

### B-2. Intend (intend.do) — 구 Complice, 창업자 Malcolm Ocean

이번 조사에서 **자료가 가장 두꺼운 제품**이다(구 이름 Complice 로 근 10년치 블로그가 남아 있다).

- **온보딩 (1) — 구조적 게이트**: **목표를 최소 2개(최대 10개) 세우기 전에는 다른 기능에 못 들어간다.** (https://intend.do/philosophy) 가입 CTA 문구: *"10 minutes from now you could be in purposeful flow!"*, 버튼은 *"Help me achieve my goals."*
- **일일 리추얼 (2)**: 아침에 앱이 묻는다 — *"What are you doing today towards what matters most to you?"* **미래 날짜 태스크를 못 만든다**(오늘치만). 저녁엔 완료 항목 + **예상 못 한 좋은 일**("that serendipitous encounter with Bob")을 함께 회고하고, **미완료에 벌점이 없다**. (https://intentionality.substack.com/p/explain-intend-right-fckn-now)
- **화면 이름**: Today 페이지 = *"home base, your headquarters of intentionality"*(그대로). Now 페이지는 **매번 빈 화면으로 시작해 "What now?" 를 묻는다** — 자동으로 다음 항목을 밀어주지 않는다.
- **NotDone Propagator (3)**: 미완료 항목이 **자동으로 내일로 넘어가지 않는다.** 사람이 최근 3일치에서 **의식적으로 다시 끌어와야** 한다. 오래 막힌 항목엔 괄호가 늘어나는 시각 단서. 근거 문장: 그래야 목록이 *"in line with your actual intentions, rather than having it be bullshit"* 이다.
- **회고 계층 (4)**: 주간(지면) → 월간(달력 뷰, 날짜 클릭 드릴다운) → 분기(*"synthesis of the past 3 months"*) → 연간. 표준 질문이 **자동으로 채워져 있고 목표별로 수정 가능**. 한 리뷰어는 연간이 *"the most challenging part"* 라고 적었다. (https://lifedev.net/2018/02/15/complice-review/)
- **근거·통계 (5)**: Stats 페이지가 총 성과·활동일·연속일·추세 그래프를 보여주되, 강조점이 **"하루 중 몇 시간에 활동이 있었나"** — 긴 몰입보다 잦은 체크인을 지표로 삼는다.
- **협업**: Accountability Partners(파트너 활동 일일 이메일 + 내 Today 화면에 파트너 계획 노출), Stakes(`$10@noon` 형식으로 실제 돈을 걸고 미달 시 자동 청구, 예외 환불 조항 있음), Coworking Rooms(공유 뽀모도로 시계 + 저해상도 화면공유).
- **철학 카피(그대로)**: GTD 의 *"here is all this stuff I could do… what shall I do?"* 대신 *"what do I want to achieve… how can I achieve it?"*. 그리고 **"Some things actually are worth forgetting"** — 전부 캡처하라는 통념을 정면으로 부정한다.
- **비판(3자)**: *"a sort of macho 'I don't care what it looks like as long as it works' aesthetic."* 회고 질문이 도메인 비특이적으로 일반적이라는 지적, 코워킹 기능의 낮은 인구밀도.
- **가격 게이팅**: 확인 불가. 다이제스트 이메일도 존재는 확인되나 **제목·본문 문구는 확인 불가**.

### B-3. IndiePilot (indiepilot.app)

⚠️ **창업자 귀속이 엇갈린다.** 라이브 사이트를 긁는 두 집계처(trustmrr, webclaw)는 **2026년 2월 Mateusz 창업, MRR $23~24, 누적 $224, 유료 2명**이라 적는다. 별개로 Peerlist/Substack 에 거의 같은 피치의 "Harsha" 서술이 있으나 **동일 제품인지 확인 불가**. 둘 다 단정하지 않는다. (https://trustmrr.com/startup/indiepilot , https://webclaw.io/data/startups/company/indiepilot.app)

- **온보딩 (1)**: 제품이 뭘 하는지 말하고 **키워드 + 대상 서브레딧**을 설정한다 — *"You set up your keywords and target subreddits, and IndiePilot watches Reddit for you around the clock."* **폼 필드 구성(URL 붙여넣기 vs 자유서술 vs 키워드 목록)은 확인 불가.**
- **TTFV 를 시간으로 약속한다**: *"Most founders see their first qualified leads within an hour of setup"*, 이후 운영은 *"less than 5 minutes a day"*. — 숫자 약속이 온보딩 카피의 핵심.
- **결과 화면 (2)**: *"When someone posts something relevant, it shows up in your dashboard with a relevance score so you know which posts are worth your time."*
- **왜 매칭됐는지 (4)**: **"AI relevance score" 외의 근거 표시는 확인 불가.** SuperX 와 달리 rationale 필드의 증거를 못 찾았다.
- **행동 (3)**: AI 가 *"a genuine, helpful comment that soft pitches your product"* 를 초안하고 사람이 검토·수정 후 게시. 명시 문장: **"The tool never posts automatically, which is important because Reddit users will quickly call out anything that looks like spam."**
- **알림 (5)**: 플랜 기능명이 **"Instant Email Notifications"**, 동기화 **30분 주기**. 다이제스트 묶음인지 건별인지는 확인 불가.
- **가격 게이팅 (6)**: Starter $8.99(AI 답글 250/월, 사업 1개, 키워드 10) / Pro $18.99(750/월, 사업 5개, 키워드 30). **리드는 양쪽 다 무제한 — 게이팅은 "AI 답글 수"에만 건다.** 카드 불필요. (자사 비교 페이지 한 곳이 "최대 30개 사업"이라 적어 자기모순 — 플래그만 해 둔다)

### B-4. SuperX (superx.so)

- 창업자 Tibo(과거 Tweet Hunter 매각). PH 2026-02 일간 1위·주간 2위·월간 3위.
- **온보딩 (1)**: X OAuth 후 **관심사를 입력받아 계정의 "personality profile" 을 만들고**, 그걸 **Context 설정에서 계속 고칠 수 있게 남겨 둔다**. 즉 온보딩 입력이 일회용이 아니라 **편집 가능한 영속 객체**가 된다. (첫 화면에서 계정 분석을 먼저 돌리는지는 확인 불가)
- **모듈 3축(라이브 확인)**: Discover(Daily Viral Inspiration / Ready To Post / Trend-Based Inspiration) · Create & Schedule(Rewrite with AI / Smart Scheduler / Automations) · Engage & Grow(Engagement Growth Engine / Unified Mentions Hub / Deep Growth Intelligence).
- **"왜 이게 걸렸나"의 최고 사례 (4)** — 이번 조사 6개 제품 통틀어 가장 선명하다. SuperX 자사 공개 GitHub(`superx-so/superx-agent`) README 가 **Signal Leads** 자료구조를 이렇게 적는다: 사용자 프로필 + match score + **"rationale explaining why leads matched an ideal customer profile"** + `deposited` 플래그 + **발견 경로(provenance)**. **점수만이 아니라 (a)서술형 근거 (b)어떻게 찾았는지 출처를 같이 저장한다.** (https://github.com/superx-so/superx-agent)
- 같은 README: Posts Analytics = 좋아요/답글/리포스트/인용/북마크/노출 + **최대 366일 일별 시계열** + 팔로워 시작·끝·순증.
- **algo simulator**: 발행 전에 변형안들을 비교해 성과를 예측한다(튜토리얼 8:15 지점 언급, 영상 미확인 → 리뷰 근거).
- **가격 게이팅 (6)**: Pro $49 / Advanced $49(정가 $99) / Ultra $199. 게이팅 축이 **계정 수 · 월 포스트 수 · AI 크레딧 · Signal Agent 개수 · 자동 DM 수**. 무료 티어 존재 여부는 출처가 엇갈려 **확인 불가**.

### B-5. 간단 (한국) — 확인 불가 (재확인)

9-19 노트의 판정이 **독립적으로 재확인**됐다. 이번엔 다섯 갈래로 팠고 전부 음성:
- "간단 스레드 자동화 SNS 마케팅 도구" → ThreadsAuto·Mirra·Make·SalesBot 등 무관한 도구만
- `gandan.so` **직접 페치 — DNS 자체가 안 뜬다**
- gandan 계열 히트는 전부 간헐적 단식 앱(gandan.yunhookim.com, gandanapp.com, Google Play `kr.co.hoo.gandan`)
- `site:disquiet.io 간단` → 9건 전부 "간단하다"는 형용사 용례이지 제품명이 아님
- 브런치·티스토리·네이버 → 일반 스레드 마케팅 글만

**결론: 그런 이름의 제품이 있다는 증거를 못 찾았다.** 없다고 단정하지는 않는다.

### B-6. youchan — 확인 불가, 단 인접 단서 1건

- `youchan.app` 도메인 없음. GitHub 의 `youchan`(일본 치바)은 오래된 Ruby 프로젝트뿐.
- **다만**: `site:disquiet.io youchan` 으로 실재하는 한국 메이커 **@youchan(정유찬)** 을 찾았다. 2023-11 메이커로그 "첫 결제가 일어났어요" — **결제 시스템을 만들기 전에 구글 폼으로 CPA 를 먼저 재 본** 사례. 그의 제품은 **"Sales Docks"(세일즈덕, salesdocks.app)** — 소상공인용 모바일 영업·재고 관리 SaaS, 2014년부터 단독앱→클라이언트/서버→B2B SaaS 로 피벗. (https://disquiet.io/@youchan)
- **"youchan" 이라는 이름의 제품은 확인 불가.** 위 메이커가 의도한 대상일 수 있으나 **동일하다고 주장하지 않는다.**

---

## C. 갭 분석 — 우리 제품 기준

### C-0. 우리가 지금 가진 것 (실측, 2026-09-20)

| 화면 | 파일 | 지금 하는 일 |
|---|---|---|
| 새 분석 | `app/analyze/new/page.tsx` | **3단계 마법사**: ①분석대상(모드·경쟁사 URL·상품 한 줄·목적·판매자 가설) ②**수집 원문을 손으로 붙여넣기** ③분석 시작 |
| 목록 | `app/analyze/page.tsx` | 상태 필터 칩 + 수요축/선례축/사분면 배지 + 수요축 정렬 |
| 검수 | `app/analyze/[id]/review/page.tsx` | 프로젝트 요약 + **시장 성숙도 1~5** + PMF 패널 + 속성 카드(이름·레이어·중요도·만족도·**기회점수**·귀인·통증시점·확인 체크) |
| PMF 패널 | `.../review/pmf-panel.tsx` | **수요축 · 선례축 두 칸을 따로**, 합치지 않음. 3상태(값/미진단/확인 불가) 문장 분리 |
| 앵글 | `app/analyze/[id]/angles/page.tsx` | 차별화/기본기/미분류 그룹 + 재작성 사유 + 각색 제안(reverse) + **실전 채택 표시**(자유 서술 1칸) |
| 어드바이저 | `app/analyze/[id]/advisor-cards.tsx` | 코퍼스 A(선례)·B(실패 앵글)·C(원칙 SP-001~032) + **MatchWhy**(겹친 낱말·점수·"신뢰도 낮음") |
| 발굴 | `app/discovery/page.tsx` | 후보 카드 + StatTile 4종(검토대기/채택/기각/**확인 불가**) |
| 케이스 | `app/cases/page.tsx` | 무브 단위 승인, 칩 8종, 근거 목록, **"다음 케이스 ↓"** 앵커 |
| 온보딩 퀴즈 | `app/onboarding/quiz/page.tsx` | A/B 소구점 고르기 → 감 점수 → **공유 이미지 PNG 내려받기** |

**실측으로 확인한 결정적 공백 2가지**
1. `/analyze`·`/cases`·`/discovery` 어디에도 **내보내기·공유·복사 기능이 0건**이다(`grep` 결과 0). Atria 리뷰가 지적한 *"no clean way to let clients view dashboards... without taking screenshots"* 와 정확히 같은 상태다.
2. **온보딩 퀴즈가 막다른 길이다.** 결과 화면의 유일한 행동이 "공유 이미지 내려받기"이고, `/analyze/new` 로 가는 링크가 없다.

### C-1. 가장 큰 구조적 격차 — 첫 입력

레퍼런스·경쟁사 **10곳 중 사용자에게 원자료를 손으로 붙여넣게 하는 곳은 0곳이다.**

| 제품 | 첫 입력 |
|---|---|
| Foreplay | 확장 버튼 클릭(저장 행동) — 또는 Discovery 라이브러리를 **입력 없이** 탐색 |
| Mirr | **링크 1개**("공개 홈페이지·블로그·상품 링크를 입력하고") |
| IndiePilot | 키워드 + 서브레딧 |
| SuperX | OAuth + 관심사 → 프로필 객체 |
| Splitbee | 사이트 URL + 스크립트 한 줄 |
| Intend | 목표 2개 |
| **우리** | **리뷰 원문 텍스트 덩어리 붙여넣기** |

우리는 야간 수집 루프가 `review_targets` 를 긁어 오므로 **기술적으로는 붙여넣기 없이도 된다**(`/analyze` 에 "원문 있음·분석 전" 필터가 이미 있다). 그런데 **사람이 시작하는 경로만 붙여넣기로 남아 있다.** 이게 이탈 지점 1순위 후보다.

⚠️ 단, **Foreplay식 "확장으로 내가 보는 페이지를 긁는다"는 우리에게 정책 충돌이다** — SP-019/020/021 에 따라 App Store·Google Play 경로는 robots·ToS 로 막혀 있고, 소스 추가는 사람이 마이그레이션으로만 한다(§10.1). **확장 경로는 차용하지 않는다.**

### C-2. 차용 패턴 — 출처 / 무엇을 / 우리 비틀기 / 어느 화면 / 공수

**[1] 판정 삼분법을 속성마다 붙인다 — 공수 M**
- 출처: Atria Radar **Winners / High iteration potential / Iteration candidates → scale / iterate / kill**
- 무엇을: 점수 옆에 **행동 동사 1개**를 반드시 붙인다.
- 우리 비틀기: **두 축을 합치지 않는다**(SP 원칙 유지). 판정은 속성 카드의 (중요도, 만족도, 레이어)만으로 낸다 — 예: 중요도↑·만족도↓ = **"여기를 민다"**, 중요도↑·만족도↑ = **"기본기, 안 밀어도 됨"**, 중요도↓ = **"버린다"**. 이미 앵글 화면이 차별화/기본기/미분류로 나누고 있으니 **같은 어휘를 검수 화면으로 끌어올리는 것**이지 새 분류가 아니다.
- 화면: `/analyze/[id]/review` 속성 카드 · `/analyze/[id]/angles` 그룹 헤더

**[2] 사분면에 "그래서 뭘 해라"를 붙인다 — 공수 S**
- 출처: 같은 Atria 처방 패턴 + Mirr 의 절제된 톤
- 무엇을: 사분면 라벨만 보여주면 판정이 아니라 분류다.
- 우리 비틀기: 4개 라벨에 고정 문장 1줄씩. `수요·선례 둘 다 있음 → "선례 무브를 그대로 옮겨 붙이는 게 가장 싸다"`, `수요 있음·선례 약함 → "우리가 1번이다. 실패 앵글부터 확인해라"`, `선례 많음·수요 없음 → "남들이 이미 하는데 우리 리뷰엔 근거가 없다. 리뷰를 더 모아라"`, `둘 다 약함 → "보류"`. **보장이 아니라 권고라는 걸 문장에 넣는다**(Mirr "초안과 납품은 다르다" 톤).
- 화면: `.../review/pmf-panel.tsx`, `/analyze` 목록 배지 툴팁

**[3] 합성 점수를 구성요소로 쪼개 보여준다 — 공수 S**
- 출처: MagicBrief **Wizard Score = hook / hold / click / buy** (단일 점수가 아니라 단계 분해)
- 무엇을: 점수를 낳은 부품을 숫자 옆에 상시 노출.
- 우리 비틀기: 우리 기회점수는 이미 `O = I + max(I−S, 0)` 로 분해 가능한데 **화면엔 22px 합계 하나만 뜬다.** 그 아래 `중요도 4 · 만족도 2 · 격차 2` 세 조각과 한 줄 읽기("중요한데 못 채워준다")를 붙인다. 계산은 DB 생성 컬럼이므로 **재계산하지 않고 표시만** 한다.
- 화면: `/analyze/[id]/review` 속성 카드

**[4] 답 옆에 원문을 같이 보여준다 — 공수 M**
- 출처: Atria Ask Raya — *"with the actual ad creatives shown alongside the answer"*
- 무엇을: 판정의 재료를 판정 옆에 둔다.
- 우리 비틀기: **광고 소재가 없으니 리뷰 원문 문장을 쓴다.** 속성 카드에 그 속성을 뽑아낸 **리뷰 원문 1~2문장을 그대로 인용**(출처 URL·수집일 포함). 이게 우리판 "creatives alongside"이고, 동시에 §7.1 이 요구하는 근거 추적이다.
- 화면: `/analyze/[id]/review` 속성 카드 (`analysis_inputs` 이미 FK 로 연결돼 있음)

**[5] 빈 입력칸에 예시 질문을 박는다 — 공수 S**
- 출처: Atria **Analytics & Launch → Raya → "Ask me anything"** + 예시 6개(*"Which ads are spending but not converting?"* 등)
- 무엇을: 사용자가 뭘 물어야 할지 모르는 상태를 예시로 없앤다.
- 우리 비틀기: **채팅을 만들지 않는다.** 이미 있는 어드바이저 API 를 고정 질문 3개 버튼으로 포장한다 — **"이 소구점, 남들은 어떻게 풀었나"(코퍼스 A) / "이 소구점으로 망한 적 있나"(B) / "원칙은 뭐라고 하나"(C)**. 지금은 `유사 사례 보기` 버튼 하나가 셋을 뭉쳐 부르는데, 라벨만 셋으로 갈라도 "무엇을 얻는지"가 눌리기 전에 보인다.
- 화면: `advisor-cards.tsx` (`AdvisorLoader` 의 `label` 만 확장 — 렌더링은 이미 코퍼스별로 갈라져 있다)

**[6] 읽기 전용 공유 링크 / 요약 복사 — 공수 M**
- 출처: Splitbee `app.splitbee.io/public/<도메인>` · Foreplay 브리프 링크 공유 · **Atria 의 결핍 불만**(*"no clean way to let clients view dashboards"*)
- 무엇을: 결과를 밖으로 꺼내는 경로.
- 우리 비틀기: **공개 URL을 만들지 않는다**(§5-1 권한 분리가 없어 위험). 대신 **"요약 마크다운 복사" 버튼 하나** — 성숙도 + 사분면 + 문장 판정 + 상위 소구점 3개(점수·근거 인용) + 앵글 3개 + 매칭 근거. 온보딩 퀴즈가 이미 공유 PNG 를 만들고 있으니 **"밖으로 꺼내는 산출물"이라는 개념 자체는 리포에 이미 있다.**
- 화면: `/analyze/[id]/review` 헤더 액션 (신규 라우트 불필요)

**[7] 초안과 실행은 다르다는 고지 — 공수 S**
- 출처: **Mirr "초안 제작과 최종 납품은 달라요"** (사실 검증·가이드 검토·고객 승인은 우리가 안 한다고 자기 페이지에 씀) + IndiePilot *"The tool never posts automatically"*
- 무엇을: 제품이 **안 하는 일**을 제품 안에 적는다.
- 우리 비틀기: 앵글 화면 상단 고정 1줄 — "여기까지가 초안이다. 실제 상세페이지 문구는 사실 확인·표시광고 검토·자사 톤 조정을 거쳐야 하고, 이 도구는 그걸 하지 않는다." 이건 CLAUDE.md §7.1 문화의 UI 판이고, SP-004(등급 노출이 유일한 방어 가능 차별화)와 같은 방향이다.
- 화면: `/analyze/[id]/angles` 헤더

**[8] 온보딩 퀴즈의 막다른 길을 잇는다 — 공수 S**
- 출처: Intend **"목표 2개를 세우기 전엔 다른 기능에 못 들어간다"** (온보딩이 제품 본체로 강제 연결)
- 무엇을: 온보딩 마지막을 **다음 행동**으로 닫는다.
- 우리 비틀기: 강제 게이트는 과하다. 퀴즈 결과 카드 아래 **풀폭 CTA 1개 "이제 내 상품으로 해보기 → /analyze/new"** + 보조 링크 "먼저 남의 사례 구경하기 → /cases". 현재 유일한 행동이 PNG 내려받기다.
- 화면: `app/onboarding/quiz/page.tsx`

**[9] 내 데이터 0건이어도 볼 게 있다 — 공수 S~M**
- 출처: **Foreplay Discovery** — 저장 0건이어도 50만 광고를 즉시 탐색. 샘플 데이터를 만들지 않고 TTFV 를 확보하는 법.
- 무엇을: 가입 직후의 "빈 계정" 문제를 **남의 데이터로** 푼다.
- 우리 비틀기: **데모 데이터를 위조하지 않는다.** 이미 승인된 `case_studies` 가 실물로 쌓여 있으니, 프로젝트 0건일 때 `/analyze` 빈 상태에서 `/cases`(또는 승인 케이스 읽기 전용 뷰)로 보내는 2차 버튼을 연다. 9-19 노트의 "괜찮다 톤 빈 상태"와 합쳐서 한 번에 처리.
- 화면: `/analyze` `EmptyState`, `/discovery` `EmptyState`

**[10] 온보딩 입력을 영속 프로필로 — 공수 M**
- 출처: **SuperX** 관심사 → personality profile → **Context 에서 계속 수정** · **Foreplay Brand Profiles**("single click" 으로 브리프에 주입)
- 무엇을: 온보딩 입력을 일회용 폼이 아니라 재사용 객체로.
- 우리 비틀기: `/analyze/new` 1단계가 매 프로젝트마다 상품 한 줄·목적·가설을 다시 받는다. **판매자 프로필 1건**(상품 한 줄·카테고리·가격대·구매자 유형)을 저장해 다음 분석의 1단계를 프리필하고, 같은 값을 **케이스 매칭의 패싯 정렬**(`business_model`/`buyer_type`/`price_band` — `lib/cases/match.ts` 가 이미 패싯을 점수에만 쓴다)에 넘긴다. **거르는 데 쓰지 않는다**는 기존 원칙 유지.
- 화면: `/analyze/new` 1단계 + 신규 설정 화면 1장

**[11] 근거 서술 + 발견 경로를 같이 저장 — 공수 S**
- 출처: **SuperX Signal Leads** = score + **rationale** + **provenance(어떻게 찾았는지)**
- 무엇을: 점수 옆에 서술형 이유와 출처 경로를 같이.
- 우리 비틀기: 어드바이저는 이미 이걸 한다(`MatchWhy`: 겹친 낱말·점수·"신뢰도 낮음", SP-024). **아직 안 하는 곳은 선례축이다** — PMF 패널의 선례축은 `match_reason` 문자열 한 덩이뿐이다. `MatchWhy` 와 같은 모양(어떤 병목어가 겹쳤나 / 제외된 무브 수 `excluded.self/not_approved/grade_d`)으로 통일한다. **`matchMoves` 가 이미 `excluded` 를 반환하는데 화면이 안 쓴다.**
- 화면: `.../review/pmf-panel.tsx`

**[12] 벤치마크를 내 과거로 잡는다 — 공수 M**
- 출처: MagicBrief **"Set internal benchmarks or let MagicBrief monitor automatically"**
- 무엇을: 외부 평균이 없을 때 **자기 기준선**으로 비교.
- 우리 비틀기: 우리는 업계 벤치마크가 없다(있다고 주장하면 거짓이다). 대신 이 프로젝트의 수요축이 **우리 DB 의 다른 프로젝트들 대비 어디쯤인지** 퍼센타일. 단, **온보딩 퀴즈가 이미 쓰는 규칙을 그대로 적용한다 — 표본 30 미만이면 퍼센타일을 계산하지 않고 그렇게 말한다.**
- 화면: `.../review/pmf-panel.tsx`

**[13] 파이프라인 자체를 퍼널로 본다 — 공수 M**
- 출처: **Splitbee 퍼널** — 단계별 **전환율 + 이탈률**을 둘 다 리포트
- 무엇을: 어디서 막히는지.
- 우리 비틀기: 우리 상태 어휘(`collecting → extracted → reviewed → angled → done`)가 이미 퍼널이다. `/analyze` 필터 칩은 **현재 건수만** 보여주고 **정체를 안 보여준다.** 상태별 체류시간 중앙값 + "검수 3/7 에서 5일째" 같은 정체 표시 한 줄.
- 화면: `/analyze` 필터 줄 아래 한 줄

**[14] 안 한 것을 자동으로 넘기지 않는다 — 공수 S**
- 출처: **Intend NotDone Propagator** — 미완료는 자동 이월 없음, 사람이 최근 3일에서 **다시 끌어와야** 하고, 오래 막힌 것엔 시각 단서
- 무엇을: 미완료를 조용히 성공으로 만들지 않기.
- 우리 비틀기: 우리는 이미 `human_confirmed` 를 자동으로 안 켠다(같은 철학). 빠진 건 **시각 단서**다 — 검수가 중간에 멈춘 지 오래된 프로젝트에 "오래 멈춤" 배지. `confirmedCount/aspects.length` 는 이미 계산된다.
- 화면: `/analyze` 목록 행

**[15] 소요시간·기대치를 미리 숫자로 — 공수 S**
- 출처: Foreplay *"may take up to 60 seconds"* · IndiePilot *"first qualified leads within an hour of setup"*
- 무엇을: 기다림 앞에 숫자를 둔다.
- 우리 비틀기: 검수 화면이 지금 "몇 분 걸립니다"라고만 쓴다(경과 초는 이미 표시). **원문 건수 기준의 실측 추정**("원문 N건 기준 보통 M분")으로 바꾸되, **재려면 먼저 측정해야 한다** — 측정 전에 숫자를 쓰지 않는다(§7.1).
- 화면: `/analyze/[id]/review` 분석 시작 버튼 옆

**[16] 한 줄 공지 배너 / 야간 결과 알림 — 공수 S**
- 출처: Atria MCP **Daily New-Ad Digest**(크론 레시피형) · 9-19 노트의 Atria 공지 배너
- 우리 비틀기: 외부 푸시를 만들지 않는다(Notion 일일 로그가 이미 사람 쪽 알림이다). 앱 안에 **"어젯밤 발굴 후보 N건 · 검토 대기 M건"** 한 줄 배너, localStorage 로 닫힘 기억. `/discovery` StatTile 이 이미 같은 수치를 센다.
- 화면: `/analyze` 상단

**[17] 홈베이스 한 줄 — 공수 M**
- 출처: **Intend "Today = home base, your headquarters of intentionality"**, Now 페이지는 **매번 빈 화면에서 "What now?"**
- 무엇을: 목록이 아니라 **지금 볼 것 1개**를 지목.
- 우리 비틀기: `/analyze` 최상단에 "오늘 볼 것 1건" — 수요축이 가장 높으면서 검수가 안 끝난 프로젝트 하나. 자동으로 다음으로 밀지 않고 **지목만** 한다(Intend 가 자동 전진을 거부하는 것과 같은 이유).
- 화면: `/analyze` 상단

**[18] 결정 지점에서 바로 다음으로 — 공수 S (이미 절반 있음)**
- 출처: 우리 `/cases` 의 **"다음 케이스 ↓ {브랜드}"** 앵커 — 이건 우리가 이미 잘하는 것이고, 레퍼런스 어디에도 같은 장치가 없다.
- 우리 비틀기: **같은 패턴을 검수 화면 속성 카드에 복제**한다("다음 미확인 속성 ↓"). 속성이 10개를 넘으면 스크롤 비용이 커진다.
- 화면: `/analyze/[id]/review`

### C-3. 차용하지 않는다 — 모순이거나 기술적으로 불가능

| 패턴 | 출처 | 왜 안 되나 |
|---|---|---|
| **단일 종합 점수** (1~4점, 등급 1개) | MagicBrief AI ad score, Atria | **우리 제1원칙 위배.** 수요축·선례축을 합치면 "선례가 없어 낮음"과 "수요가 없어 낮음"이 같은 값이 되는데 다음 행동은 정반대다(`pmf-panel.tsx` 헤더). 9-19 노트도 같은 결론 — **재확인** |
| **광고 소재 저장·스와이프·스토리보드·씬 재생성** | Foreplay, MagicBrief | **광고 크리에이티브 데이터가 없다.** 우리 입력은 리뷰 텍스트다. 불가 |
| **성과 기반 채점**(90일 ROAS, hook/hold 지표) | Atria Radar, MagicBrief Wizard, Foreplay Lens | **매출·클릭 데이터가 없다.** 우리의 유일한 성과 기록은 `validated_angles_corpus` 의 **사람이 쓴 자유 문장**이고 수치가 아니다. 점수화하면 없는 데이터를 있는 척하는 것 |
| **발행 전 성과 예측 시뮬레이터** | SuperX algo simulator | 학습 라벨(성과)이 없다. **기술적으로 불가** |
| **소셜 계정 연결** | Mirr("연결 먼저"), SuperX(X OAuth) | 연결하지 않는 것이 정책이다(§10 자동발행 없음, Threads 토큰 분리). 불가 |
| **브라우저 확장으로 사용자가 보는 페이지 수집** | Foreplay | robots·ToS 판정을 사람이 마이그레이션으로만 하는 구조(§10.1, SP-019/020/021)와 정면 충돌. **차용 금지** |
| **실시간 수집·실시간 대시보드** | Splitbee("Everything is realtime") | §2 가 실시간 외부 수집을 금지한다(매일 새벽 배치). 불가 |
| **크레딧 이월 없음 / 자동 상위플랜 전환** | Atria(크레딧 미이월, Trustpilot 1점 다수) | **SP-002 가 이미 이탈 유발 안티패턴으로 지목**. 명시적 기각 |
| **금전 벌금(Stakes)·책임 파트너·코워킹룸** | Intend | 1인 내부 도구. 무관 |
| **주/월/분기/연 4단 회고 계층** | Intend | 우리 회고는 Notion 일일 상태 로그(§11)가 이미 맡는다. 앱 안에 또 만들면 두 곳이 갈라진다 |
| **사용자가 상단 지표 4개를 고르는 커스터마이즈** | MagicBrief | 보는 사람이 사실상 1명이고 지표 후보가 적다. 설정을 만들 이유가 없다(YAGNI) |
| **공개 URL 대시보드** | Splitbee `public/<도메인>` | §5-1 에 역할 분리가 없다. 공개 링크는 권한 모델이 생긴 뒤에 |

### C-4. 이번 조사가 수정한 이전 서술

- 9-19 노트의 **"Atria 는 Raya 가 등급을 매긴다"** → **틀렸다.** 등급 엔진은 **Radar**, Raya 는 그 위의 대화/Slack 레이어다(§A-3). 9-19 의 "AI 의인화를 차용하지 않는다"는 결론은 그대로 유효하지만, **Radar 의 3바구니+처방은 의인화와 무관한 별개 패턴이고 이건 차용 가치가 있다.**
- 9-19 노트의 **Mirr FAQ "계정 연결 없이 시작 가능"** → 자사 도움말은 정반대로 **"연결 먼저"**를 권한다(§A-4). **랜딩과 도움말이 갈라져 있다.** 우리도 같은 함정에 있다 — 퀴즈는 "그냥 해보세요"인데 `/analyze/new` 2단계는 원문 붙여넣기를 요구한다.
- 원칙 원장은 과제 기술의 "23~31행"이 아니라 **SP-001~SP-032(32행)** 이다(`docs/strategy-principles.md` 실측).

### C-5. 우선순위 (공수 대비)

1. **[8] 퀴즈 CTA 연결**(S) — 막다른 길이 지금 존재한다. 가장 싸고 가장 명백한 누수
2. **[3] 기회점수 분해 표시**(S) + **[2] 사분면 처방 문장**(S) — 코드 한 곳씩, 숫자를 판정으로 바꾼다
3. **[7] "초안과 실행은 다르다" 고지**(S) — 한 줄, 우리 정체성과 정확히 일치
4. **[11] 선례축 MatchWhy 통일**(S) — `excluded` 가 이미 반환되는데 화면이 버리고 있다
5. **[6] 요약 마크다운 복사**(M) — 내보내기 0건 상태를 끝낸다
6. **[4] 원문 인용 표시**(M) — 우리판 "근거를 답 옆에"
7. **[1] 속성별 판정 동사**(M), **[10] 판매자 프로필**(M), **[9] 0건일 때 케이스 둘러보기**(S~M)
8. 나머지(12·13·14·15·16·17·18)는 위가 끝난 뒤

---

## 부록 — 확인 상태 요약

**확인함(1차 출처)**: Foreplay(도움말·블로그·Discovery), MagicBrief(릴리스노트·종료 FAQ), Atria(자사 블로그·intercom 도움말·docs llms.txt), Mirr(도움말 색인·한국어 에이전시 페이지·MCP 페이지), Splitbee(종료 배너·데모앱·IndieHackers 변경로그), Intend(features·philosophy·창업자 Substack), IndiePilot(자사 블로그·집계 사이트), SuperX(랜딩·공개 GitHub README)

**확인 불가(못 읽음 — 없다는 뜻이 아님)**
- 10곳 전부: **로그인 뒤 실제 화면·빈 상태 문구·업그레이드 모달**
- Foreplay: Foreplay Scores 척도, Spyder 알림 실제 문구·주기, 벤치마크 모수(30k/20k 불일치)
- MagicBrief: 온보딩 첫 화면, 1~4점 척도의 1차 출처, 시각 레이아웃
- Atria: "exactly what to fix" 의 실제 UI 문자열, A~D 4축 등급의 1차 출처, 학습 광고비($5B/$9B 불일치), Slack 설정 문구
- Mirr: Content Manager 본문, 빈 상태, 가격 게이팅, "Mirra AI 사태" 진위
- Splitbee: **"첫 이벤트 대기" 빈 상태 문구**, A/B 유의수준 UI, 최종 가격표 — **web.archive.org 가 도구 레벨에서 차단됨**
- Intend: 가격표, 다이제스트 이메일 실제 문구
- IndiePilot: 온보딩 폼 필드, 매칭 근거 표시 유무, 알림 주기, 창업자 귀속(Mateusz/Harsha 충돌)
- SuperX: OAuth 직후 첫 화면, 무료 티어 존재 여부
- **간단**: 그런 이름의 마케팅/스레드 도구를 찾지 못함(5갈래 탐색, `gandan.so` DNS 없음)
- **youchan**: 그런 이름의 제품 없음. 인접 단서는 디스콰이엇 메이커 @youchan(정유찬) → 제품명은 **Sales Docks**(salesdocks.app) — **동일하다고 주장하지 않는다**

**남은 경로**: Splitbee 워크스루 영상 2건(`evnMTzdo-Rc`, `WcckDQ716_o`)과 SuperX 리뷰 영상은 `watch` 스킬(yt-dlp+자막)로만 열린다. 빈 상태 문구·A/B 결과 화면을 꼭 봐야 하면 그게 남은 유일한 길이다. 이번 라운드에서는 돌리지 않았다.
