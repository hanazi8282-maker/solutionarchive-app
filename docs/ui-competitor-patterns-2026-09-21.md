# 경쟁·인접 서비스 UI 패턴 분석 (2026-09-21)

목적: SolutionArchive 화면(소구점 분석·PMF 결과·remedy·앵글·검수 화면)의 디자인 시스템을 베이커리 운영 대시보드 토큰에서 벗어나 "리뷰→인사이트→행동" 가치를 파는 서비스들의 패턴으로 교체하기 위한 근거 자료.

조사 방법: 각 서비스의 공개 제품 페이지·헬프센터·서드파티 사용 가이드를 텍스트로 읽었다. 스크린샷은 볼 수 없었으므로 **문서에 적힌 UI 라벨·위젯 설명·alt 텍스트만** 근거로 삼았다. 읽지 못한 것은 "미확인"으로 표기했다. 헬프센터가 막혀 서드파티 가이드에 의존한 곳은 출처에 "(서드파티)"를 붙였다.

근거 강도 요약
- 강: Appbot(헬프센터 위젯 목록 32종·Topics·Sentiment·Ask Appbot 문서), Chattermill(용어집·테마·리포트 템플릿·Impact Analysis 문서), Enterpret(Features·Agent·Dashboard 문서)
- 중: SellerSprite(공식 help 2건), Kimola(공식 support 튜토리얼), Helium 10 Review Insights(서드파티 가이드; 2025-12 크롬 확장에서 제거됨), 아이템스카우트(랜딩+서드파티)
- 약(참고만): VOC.AI(랜딩은 UI 설명 없음, 서드파티 리뷰 1건), Wonderflow(제품 페이지 문구만), Jungle Scout(헬프센터 403, 서드파티), 판다랭크(랜딩만)

---

## 1. 서비스별 관찰 기록

### 1-1. Appbot (appbot.co) — 앱 리뷰 분석. 근거 강

- 첫 화면/히어로 지표: 홈페이지 대표 이미지 alt가 "Ask Appbot dashboard answering an app review question with star rating, top topics and sentiment score". 즉 **질문 답변 + 별점 + 상위 토픽 + 감성 점수**가 한 화면. (https://appbot.co/)
- 감성 표현: 4분류(Positive/Negative/Neutral/Mixed). 색 규약이 문서에 명시 — "Positive… green, Neutral… orange, Negative… red, Mixed… blue". Sentiment Timeline은 일/주 단위 막대, Overall Sentiment는 다이얼(게이지) 차트에 점수, Sentiment Breakdown은 가로 막대. (https://support.appbot.co/help-docs/positive-sentiment-negative-sentiment/)
- 게이지 의미 부여: Sentiment Score 위젯은 "The open part of the circle shows you how much scope there is for improvement" — 빈 부분을 '개선 여지'로 읽게 한다. (https://support.appbot.co/help-docs/widget-glossary-for-appbot-dashboards/)
- 토픽(=우리의 aspect) 표현: Topics 페이지는 "ranked from most to least popular" 목록. 각 행에 ①감성 분해 ②리뷰 수 ③전체 대비 % ④트렌드라인. 토픽 클릭 → 해당 리뷰 목록, 탭 "summary / trend pattern / average stars timeline", **우측 필터 패널**(Sentiment 필터 포함). 리뷰 본문에서 토픽 일치 구절을 **노란 하이라이트**. 우측 패널의 다른 토픽에 hover하면 관련도 표시. (https://support.appbot.co/help-docs/how-to-use-topics/)
- 대시보드 위젯 32종(글로서리): Reviews Count(단일 숫자), Reviews Latest(최근 리뷰 텍스트 스니펫), Top Topics(상위 5개 토픽의 감성+리뷰 수), Sentiment Suggestions("areas and ideas to improve"), Top Critical Words / Top New Words / Upwards·Downwards Trending Words(단어 순위 리스트, 감성 분해+빈도), Emotion Scatter(점 하나=리뷰 하나, hover 시 원문), Free Text(마크다운 메모 위젯). 워드클라우드는 없고 **전부 순위 리스트**. (https://support.appbot.co/help-docs/widget-glossary-for-appbot-dashboards/)
- 증거 인용: Ask Appbot 답변은 "how many reviews an answer is based on, the date range they span, and which specific reviewers said what"를 밝히고, 예시 답변 "Based on 41 reviews(2026-01 → 2026-06), 'confusing setup' appears in 12 – up from 3 the prior half." 후속 제안 "Want the 12 excerpts, or a summary grouped by step?" (https://appbot.co/features/ask-appbot/)
- 다음 행동: "Sentiment Suggestions" 위젯 = 개선 아이디어 리스트. Ask Appbot은 역할별 예시 질문 5종(Product/Engineering/Support/Growth/Everyone). (같은 출처)
- 로딩 상태: "Ask Appbot will analyse your data. This can take from 2 – 30 seconds". 대화 초기화 "clear button". 진입은 "the Ask Appbot button at the top of the page". (https://support.appbot.co/help-docs/ask-appbot/)
- 내비게이션: 분석 페이지가 Sentiment / Phrases / Words / Topics / Emotions / Versions / Countries / Languages / Ratings / Reviews / Dashboards / Compare / Benchmarks로 분리. (https://support.appbot.co/section/analyzing-reviews/) 사이드바 vs 상단바는 미확인.
- 내보내기: Topics 요약 우상단 Export(CSV/xlsx). (Topics 문서)
- 온보딩·빈 상태·모바일: 미확인(getting-started 문서 404).

### 1-2. Chattermill (chattermill.com) — CX 피드백 분석. 근거 강

- 첫 화면: 홈페이지 스크린샷 설명 "64% positive sentiment, 4.3 average score" 카드, "Table with 95 themes showing feedback count and percentage change; top themes listed with bar graph and line chart", "Chart showing top reasons for negativity with confusing filters, unavailable tickets, and payment errors". 즉 **요약 숫자 카드 → 테마 테이블(건수·변화율) → 부정 원인 차트** 순. (https://www.chattermill.com/)
- 테마(=aspect) 표현: 테마는 Category 아래에 묶임(예: "Checkout experience" > "Receipt/email confirmation"). 테마마다 자동 감성이 붙고 "green, grey, and red icons"로 표시. Feedback 화면 우측에 "Themes >" 패널, 물음표 아이콘으로 정의 확인. 커스텀 테마는 Settings > Themes > "+ New theme" (제목·설명·쿼리 입력 → "Save theme"). (https://docs.chattermill.com/en/articles/5939546-manage-and-add-themes)
- 내비게이션: **좌측 사이드바** ("navigate to the left sidebar, and click Feedback"). Reports 탭 아래 "Your reports / Shared with you / Starred". (같은 문서, https://chattermill.com/blog/new-reports-and-dashboards)
- 리포트 템플릿이 **질문형 제목**: "How do customers feel about your business?", "What has the biggest impact on customer sentiment?", "What drives the most negative/positive sentiment?", "How do customers feel across different channels?". 대시보드 템플릿 "Data Overview", "What's driving positivity/negativity?". 템플릿 hover → "Use this template". (https://chattermill.com/blog/new-reports-and-dashboards)
- 우선순위 차트: Impact Analysis — 테마가 NPS / Net Sentiment / Average Score에 미치는 영향을 양(+)·음(−)으로 분해. Net sentiment = 긍정 언급 % − 부정 언급 %, −100~100. 차트 형태(막대/산점)는 문서에 미기재(미확인). (https://docs.chattermill.com/en/articles/6518910-understanding-impact-analysis)
- 증거 인용: 홈페이지 스크린샷 alt "Customer feedback showing a UK first-time shopper's disappointment with an evening dress priced at $99" — 분석 옆에 실제 코멘트 카드가 붙는 구조. Lyra Agent는 "analyst-quality answers, backed by quantified evidence, built-in charts and reports, and direct access to customer quotes". (https://www.chattermill.com/)
- 다음 행동: "five themes negatively impacting NPS: product quality, shipping speed…" 식의 **영향 순위 리스트**, "List of top 10 customer issues". 별도 '권고 카드'는 미확인.
- 필터: 검색·저장 세그먼트("How to save and manage Segments"), 태그. (https://docs.chattermill.com/en/collections/6035658-learn-about-chattermill)
- 온보딩·빈 상태·모바일: 미확인.

### 1-3. Enterpret (enterpret.com) — 피드백 인텔리전스. 근거 강

- 첫 화면(랜딩): "List views" 전후 비교 스크린샷 2장 — 정리된 피드백 리스트 뷰가 대표 이미지. (https://www.enterpret.com/)
- 분류 체계: 3단계 키워드 계층(L1/L2/L3), 자동 카테고리 "Help, Improvement, Complaint, Praise". 기능 이름은 Quantify(피드백을 숫자로), Feed, Dashboards, Anomaly Detection, Trends, Saved Items. (https://helpcenter.enterpret.com/en/articles/12665465-enterpret-features-explained)
- Quantify 화면: "Show me" 드롭다운에서 Reasons 등 기준 선택 → 차트. Count = 필터·기간 내 피드백 레코드 수. (https://helpcenter.enterpret.com/en/articles/8791835-quantify-query 검색 요약; 상세 레이아웃 미확인)
- 대시보드: **좌측 내비 바**에 "Dashboards". 좌상단 대시보드 이름+연필 아이콘, "Add" 버튼(Quantify 차트 추가), 점 세 개 메뉴("Archive Dashboard"), 차트 옆 "+" 아이콘, 하단 "+ Add Content". 사이드바에 "Pinned Dashboards / Your Dashboards / Teammates' Dashboards". (https://helpcenter.enterpret.com/en/articles/8756551-dashboard-basics)
- 에이전트(Wisdom/Agent) 화면: 좌측 사이드바 "Agent"(Sessions) / "Automations". 커맨드 박스에 + 아이콘(Skills·Connectors), 모델 선택기(첫 메시지 후 잠김). 답변은 **작업 흔적**(thinking·steps·tool calls·sub-agents)을 보여주고, 모든 통계와 인용에 클릭 가능한 citation, 인용은 "speaker attribution, never paraphrased". 외부 액션 전 확인 "Can I send this Slack message?". (https://helpcenter.enterpret.com/en/articles/15608623-getting-started-with-enterpret-agent)
- 증거 원칙(검색 요약): "Every aggregate number in an answer — a count, a percentage, a top-N list — is a link", "If no validated quote exists for your request, your assistant will tell you so rather than making one up". (https://helpcenter.enterpret.com/en/articles/12665509-wisdom-user-guide — 직접 fetch는 404, 검색 스니펫만)
- 다음 행동: Agents(Quality Monitor / Escalation / Newsfeed)가 알림·다이제스트로 밀어줌. Jira·Linear 티켓 생성. (Features 문서)
- 온보딩·빈 상태·모바일: 미확인.

### 1-4. SellerSprite Review Analysis (sellersprite.com) — 아마존 리뷰 분석. 근거 중

- 첫 화면: 요약 헤더 — 총 평점 수(8,424)와 텍스트 리뷰 수(1,351)를 구분해 표시, 변형(variation) 수와 "리뷰 적어 숨긴 변형" 수. (https://www.sellersprite.com/en/help/review-analysis)
- 지표 블록 순서: ①별점 분포(평균 4.5, 별별 수·%) ②**텍스트 리뷰 별점 분포 vs 전체 평점 분포 비교**(1성 리뷰가 텍스트 5.7% vs 전체 3% — 차이를 강조) ③Feature Ratings 테이블(예: "lightweight 5.0, comfort 4.0, support 4.6", 낮은 항목=개선 우선) ④리뷰 유형 도넛(VP/이미지/영상) ⑤변형별 막대 + 기간·변형(Size/Color) 드롭다운, 월별 추이("review peak every July") ⑥리뷰 리스트 필터(별점·기간·고빈도 단어 태그 클릭). (같은 출처)
- AI 분석 6차원: 상위 300개 리뷰에서 "consumer profiles / product strengths / product weaknesses / usage scenarios / consumer expectations / purchase motivations". 표시 형식(퍼센트·막대·인용)은 문서에 미기재(미확인). "Bulk View" 버튼, "Export as PDF", 로그인 없이 볼 수 있는 "Share" 아이콘. (https://www.sellersprite.com/en/help/review-analysis-for-beginners)
- 웹 버전 추가 섹션: Variant Ratings(기본 평점 내림차순), Rating Ratio and Ratings by Stars, Review Types(VP/picture/video), 기간 전환. (https://www.sellersprite.com/en/blog/efficiently-analyze-amazon-reviews)
- 내비게이션·온보딩·빈 상태·모바일: 미확인.

### 1-5. Kimola Cognitive (kimola.com) — 리뷰→리서치 리포트. 근거 중

- 온보딩/생성 흐름(가장 자세히 문서화됨): 홈 "Create your report" 영역에 상품 URL 붙여넣기 → "Start". "Add Multiple"로 여러 링크(비교 분석). URL 자동 검증 결과(통과/수정 필요) 표시 → 수집 리뷰 수 **슬라이더** → 분석 차원 선택("customer personas, pain points, usage motivations, unmet needs" 등, 고른 것은 좌측 "My List"에 쌓임) → 설정 확인 화면(Report Title 자동 생성·필수, Source/Dataset, Report Output 언어, **Required Query = 수집/감성/차원별 쿼리 소모량 분해**) → "Create Report" → Reports 목록. (https://kimola.com/support/how-to-scrape-and-analyze-amazon-product-reviews)
- 상품 속성(변형)은 "appear as filter options at the top of the report". (같은 출처)
- 인사이트 구성: Executive Summary / Customer Personas / Usage Motivations / Pain Points / Customer Journey. 리포트는 "sentiment distribution, topic or theme analysis, time-based trends, summary insights"를 담고 "Compare columns and filters within a report". 배치·차트 형태 미확인. (https://kimola.com/, https://kimola.com/support/cognitive/what-is-a-report)
- 내비게이션: 좌측 메뉴에 Reports(View/Download/Delete). 개체 구조 Projects > Feeds / Reports / Models / Airsets. (https://kimola.com/support/cognitive)
- 내보내기: Excel, PowerPoint, PDF, Email. 빈 상태·모바일: 미확인.

### 1-6. Helium 10 Review Insights (kb.helium10.com) — 아마존 리뷰 분석. 근거 중(서드파티)

- 주의: 2025-12 크롬 확장에서 제거되었고 2026-04 기준 미복귀(검색 요약, clearsell.app). 패턴 참고용.
- 탭 구조: Overview(첫 화면: 평점·상위 문구·도움된 리뷰 스니펫) / Ratings(별점별 리뷰 보기) / Top Phrases / Top Helpful Reviews / Chart of Reviews(시간별 리뷰 유입, 계절성) / All Reviews(기간·별점·단어 필터, 다운로드) / All Questions / Review Analysis(인기 단어·문구 + 평균 별점, 펼치면 해당 리뷰 묶음) / Product Variations. 우상단 파란 다운로드 버튼. (https://revenuegeeks.com/helium10-review-insights/ 서드파티)
- 공식 KB 문서는 403으로 못 읽음(https://kb.helium10.com/hc/en-us/articles/48006601967643). 감성 색·빈 상태·모바일: 미확인.

### 1-7. 아이템스카우트 (itemscout.io) — 국내 키워드·상품 분석. 근거 중

- 첫 화면: 히어로 "매출상승의 핵심, 키워드에 대한 모든 것" + 트렌드 Best 10 + 키워드 지표 패널(상품수 / 한 달 검색수 / 검색 비율 PC·모바일 / 6개월 매출 / **경쟁 종합 지표 "아주좋음"** 등급 라벨). (https://itemscout.io/)
- 내비게이션: **상단 메뉴** — 아이템발굴 / 키워드분석 / 랭킹추적(일간·실시간 탭) / 유틸리티 / 멤버십 / 가이드. 모바일 웹은 홈·아이템발굴·키워드분석·랭킹추적·커뮤니티 탭, 검색창 플레이스홀더 "관심있는 상품, 카테고리, 키워드를 입력". (https://itemscout.io/, https://m.itemscout.io/keyword?id=517123)
- 키워드 분석 페이지: 상단 "상품 종합 지표"(총 상품수, 한 달 검색수, 경쟁강도=상품수÷검색수) → 필터(쇼핑성 키워드, 브랜드 제거, 검색량 범위, 상품수 임계) → 결과 테이블(대표 카테고리 포함) → "엑셀 다운로드". 월별 검색 트렌드, 성별/연령별 비율, 상위 1~20위 상품 리스트. (https://www.windly.cc/blog/keyword-research-with-itemscout 서드파티, https://www.chosunseller.kr/itemscout-review/ 서드파티)
- 리뷰 분석: 스마트스토어 리뷰 추출·분석 기능이 있다는 언급만(검색 요약). 화면 미확인.
- 가이드 문서 사이트(school.itemscout.io)는 상단바(경로·검색·공유·다크/라이트 토글) + 리스트 뷰. (https://school.itemscout.io/6d82116c-befc-4c00-b552-01069b33d44d)

### 1-8. 참고만 (근거 약)

- VOC.AI: 랜딩·기능 페이지 어디에도 대시보드 설명 없음. 서드파티 리뷰에 메뉴 구조만 — Review Analysis 아래 "Customer Insights / Competitive Analysis / Top Rated Reviews / AI Topic Analysis", Market Insight, Social Listening. (https://entreresource.com/voc-ai/ 서드파티; https://www.voc.ai/product/voice-of-customer-analysis 는 "Cluster feedback by pain point, expectation, and feature mention" 문구만)
- Wonderflow: "Wonderboard" 커스텀 보드 위젯이 "charts, KPIs, AI-generated summaries, and verbatims"; "Feedback Reader"가 차트를 원 피드백 레코드에 연결; VoC Alerts; 경쟁 SKU를 같은 대시보드에. 화면 배치 미확인. (https://www.wonderflow.ai/product, https://www.wonderflow.ai/solutions/product)
- Jungle Scout Review Analysis: Toolbox > Review Analysis > ASIN 입력. 출력은 긍정/부정 코멘트 요약, "Suggestions for improvements based on customer reviews", 경쟁 비교. 빨강(부정)·초록(긍정)·노랑(중립) 복합 막대. 상위 50개 리뷰 기반. (https://revenuegeeks.com/jungle-scout-ai-assist/ 서드파티; 공식 헬프센터는 403)
- 판다랭크: 랜딩만. 상단 내비 크리에이터/셀러 섹션 분리, 실시간 급상승 키워드 10개(순위 화살표·NEW 배지), "무료로 시작하기". 상품 분석 화면 미확인. (https://pandarank.net/)

---

## 2. 공통 패턴 (4곳 이상)

P1. **요약 숫자 카드가 맨 위** — Chattermill("64% positive, 4.3 average"), Appbot(Reviews Count·Sentiment Score 게이지), SellerSprite(총 평점 수/텍스트 리뷰 수/평균), 아이템스카우트(상품 종합 지표), Kimola(sentiment distribution).
근거: 리뷰 분석은 "얼마나 많은 리뷰를 바탕으로 한 결론인가"가 신뢰의 출발점이라 표본 크기와 감성 총점을 먼저 보여준다.

P2. **aspect/테마는 워드클라우드가 아니라 순위 리스트(또는 테이블)** — Appbot(Topics: 감성분해·건수·%·트렌드라인), Chattermill(95 themes 테이블: 건수·변화율), SellerSprite(Feature Ratings 테이블), Helium 10(Top Phrases + 평균 별점), Enterpret(Reasons를 Count로).
근거: 각 행이 "건수 + 감성 + 변화"를 같이 가져야 우선순위를 정할 수 있다. 워드클라우드는 어느 서비스도 안 쓴다.

P3. **행(테마) 클릭 → 그 테마의 원문 리뷰 목록 + 일치 구절 하이라이트** — Appbot(노란 하이라이트, 우측 필터 패널), Chattermill(Feedback 화면에 Themes 패널), Enterpret(모든 숫자가 레코드로 가는 링크), Wonderflow(Feedback Reader), Helium 10(Review Analysis 펼치면 리뷰 묶음).
근거: 숫자의 신뢰는 원문으로 내려갈 수 있을 때 생긴다.

P4. **인용은 "몇 건 중 몇 건, 어느 기간"을 붙인다** — Appbot("Based on 41 reviews(2026-01 → 2026-06), … 12"), Enterpret("Every aggregate number… is a link", "never paraphrased"), Chattermill(Lyra: "quantified evidence… direct access to customer quotes"), SellerSprite(별점별 수·%).
근거: 인용 한 줄만 보여주면 체리피킹으로 읽힌다. 분모를 붙이면 근거 등급이 된다.

P5. **감성 색 규약 = 초록(긍정)/빨강(부정)/회색 또는 주황(중립)** — Appbot(green/orange/red/blue), Chattermill(green/grey/red 아이콘), Jungle Scout(red/green/yellow 막대), SellerSprite(문서상 미명시, 미확인).
근거: 별도 학습 없이 읽히는 유일한 색 코드. 브랜드 색과 분리해야 한다.

P6. **"다음 행동"은 별도 섹션·위젯으로 분리** — Appbot(Sentiment Suggestions 위젯), Jungle Scout(Suggestions for improvements 섹션), Kimola(Pain Points·Executive Summary 차원), Chattermill(Impact Analysis로 "어디에 집중할지"), Enterpret(Agents가 알림/티켓으로).
근거: 분석과 권고를 한 표에 섞으면 권고의 근거가 어디인지 사라진다.

P7. **입력은 URL/ASIN 한 줄 → 수집 범위 지정 → 결과** 3단 흐름 — Kimola(URL 붙여넣기 → 슬라이더 → 차원 선택 → 확인 화면), Jungle Scout(ASIN 입력), SellerSprite(상품 추가 후 Bulk View), Helium 10(상품 페이지에서 확장 실행).
근거: 셀러 도구는 "상품 링크 하나"가 유일한 진입 단위다.

P8. **기간·별점·변형(variation) 필터가 결과 상단 고정** — SellerSprite(기간·Size/Color 드롭다운), Kimola(상품 속성이 리포트 상단 필터), Helium 10(All Reviews 기간·별점·단어), Appbot(우측 필터 패널: 별점·언어·토픽), 아이템스카우트(상단 필터 행).

P9. **리포트 제목이 질문형** — Chattermill 템플릿 5종 전부("What drives the most negative sentiment?"), Appbot Ask 예시 질문 5종, Enterpret 예시("What are the top feature requests…"), Wonderflow("answering their most relevant business questions" 문구).
근거: 화면 제목이 질문이면 차트가 그 답이 되고, 사용자가 무엇을 봐야 할지 안다.

P10. **내보내기/공유는 우상단 단일 버튼** — Appbot(Export CSV/xlsx), Helium 10(파란 다운로드 버튼 우상단), SellerSprite(Export as PDF·Share), Kimola(Excel/PPT/PDF), 아이템스카우트(엑셀 다운로드).

P11. **좌측 사이드바 내비** — Chattermill, Enterpret, Kimola(좌측 메뉴 Reports). 상단바: 아이템스카우트, 판다랭크(마케팅 랜딩 포함). Appbot·SellerSprite·Helium 10은 미확인. → 3:2로 갈렸다(§5에서 판단).

---

## 3. 서비스별 두드러진 장점 (훔칠 아이디어)

- **Appbot — 게이지의 빈 부분을 "개선 여지"로 읽게 하는 카피** ("The open part of the circle shows you how much scope there is for improvement"). 우리 PMF 2축 결과에서 "수요 있음/선례 없음" 사분면의 빈 축을 같은 방식으로 설명할 수 있다. (widget-glossary)
- **Appbot — 단어 순위를 시간 방향으로 쪼갬** (Top New Words / Upwards·Downwards Trending / Critical Words). 하나의 단어 목록 대신 "새로 등장", "늘어나는", "줄어드는"을 분리. (widget-glossary)
- **Appbot — 답변에 분모·기간·전기 대비 증감 3종 세트** ("Based on 41 reviews(2026-01 → 2026-06), 'confusing setup' appears in 12 – up from 3"). (ask-appbot)
- **Appbot — 원문에서 aspect 일치 구절 노란 하이라이트 + 우측 패널의 다른 토픽 hover.** (how-to-use-topics)
- **Chattermill — 리포트/템플릿 제목을 질문으로**, 그리고 Impact Analysis로 "어떤 테마가 점수를 끌어내리는가"를 +/−로 분해. Net sentiment(−100~100) 단일 지표. (new-reports-and-dashboards, understanding-impact-analysis)
- **Chattermill — 테마에 물음표 아이콘으로 정의 노출**, 테마를 Category 아래 2단 계층으로. (manage-and-add-themes)
- **Enterpret — "검증된 인용이 없으면 없다고 말한다"** 원칙과, 모든 집계 숫자가 레코드로 가는 링크. 에이전트 답변에 작업 흔적(steps·tool calls) 표시. (wisdom-user-guide 검색 요약, getting-started-with-enterpret-agent)
- **Enterpret — 자동 카테고리 4종(Help / Improvement / Complaint / Praise)** — 감성보다 한 단계 행동적인 분류. (features-explained)
- **SellerSprite — 텍스트 리뷰 별점 분포 vs 전체 평점 분포를 나란히 놓고 차이를 강조** (1성 리뷰 5.7% vs 3%). 우리로 치면 "리뷰 표본이 전체 구매자보다 얼마나 치우쳤는가"를 보여주는 정직성 장치. (help/review-analysis)
- **SellerSprite — 로그인 없이 열리는 Share 링크 + PDF 내보내기.** 셀러가 파트너/디자이너에게 넘길 때 필요. (review-analysis-for-beginners)
- **Kimola — 생성 확인 화면에 "Required Query"(비용 분해)와 자동 제목**, 분석 차원 선택이 좌측 "My List"에 쌓이는 장바구니 UI, URL 검증 결과를 통과/수정 두 묶음으로 표시. (how-to-scrape-and-analyze-amazon-product-reviews)
- **아이템스카우트 — 지표에 등급 라벨("아주좋음")을 숫자 옆에 붙임.** 초보 셀러가 숫자를 해석하지 않게 한다. (itemscout.io)
- **Wonderflow — 위젯 종류에 "verbatims"와 "AI-generated summaries"를 차트·KPI와 동급으로 둠.** 인용이 보조가 아니라 위젯. (wonderflow.ai/product)

---

## 4. 우리 화면별 적용 제안

표기: [P#] = §2 패턴, [서비스] = §3 개별 아이디어, [자체 판단] = 경쟁 선례 없음.

### /analyze (프로젝트 목록)
1. 각 행에 "리뷰 N건 · 소구점 M개 · 마지막 분석 날짜 · PMF 사분면 배지" 4열 고정. 목록에서 표본 크기가 먼저 보여야 한다. [P1]
2. 상단에 "새 분석" 버튼과 함께 **URL 붙여넣기 입력창을 목록 위에 바로** 둔다(Kimola 홈 "Create your report" 영역). 마법사로 가기 전에 링크부터 받는다. [P7][Kimola]
3. 빈 상태 카피: "아직 분석한 상품이 없습니다. 경쟁 상품 링크를 붙여넣으면 리뷰를 모아 소구점을 뽑습니다." + 입력창. [자체 판단 — 빈 상태는 어느 서비스도 문서화 안 함]

### /analyze/new (마법사)
1. Kimola 흐름 그대로 3단: ①링크(복수 가능, 검증 결과를 통과/수정 두 묶음으로) ②수집 범위 슬라이더 ③확인 화면(자동 제목·소스·예상 소요/비용). [P7][Kimola]
2. 확인 화면에 "이 분석이 답하는 질문" 3줄을 질문형으로 미리 보여준다("어떤 불만이 가장 많이 반복되나?", "선례가 있는 소구점은?"). [P9]
3. 프로필 프리필 값은 확인 화면에서 인라인 수정 가능하게(현재 /settings/profile로 보내는 구조 유지하되 링크 표시). [자체 판단]

### /analyze/[id]/review (소구점 검토)
1. aspect를 **순위 테이블**로: 열 = 소구점 / 언급 수 / 전체 대비 % / 중요도 / 만족도 / 감성 분해 미니바 / (있으면) 추이. 워드클라우드·카드 그리드 금지. [P2][Appbot Topics]
2. 행 클릭 → 우측 패널에 원문 리뷰 목록, 일치 구절 하이라이트, 패널 상단에 감성·별점 필터. [P3][P8][Appbot]
3. 각 소구점 옆 물음표 → 정의·판정 기준 툴팁. [Chattermill]
4. 검토 화면 헤더에 "리뷰 N건 기준, 텍스트 리뷰 비율 x%" — 표본 치우침을 SellerSprite처럼 노출. [P1][SellerSprite]

### /analyze/[id]/result (PMF 결과)
1. 최상단 히어로 카드: 사분면 이름 + 두 축 점수 + "리뷰 N건 · 소구점 M개 기준". 사분면 설명 카피는 Appbot 게이지 방식("비어 있는 축이 다음에 채울 여지")으로. [P1][Appbot]
2. 섹션 제목을 질문형으로 바꾼다: "수요는 있는가?" / "선례는 있는가?" / "무엇을 먼저 고칠까?" (현재 Card 제목형). [P9][Chattermill]
3. 모든 숫자에 링크: "언급 32건" 클릭 → review 화면 해당 소구점 필터로. [P3][Enterpret]
4. 근거 인용 블록은 "n/N건, 기간" 캡션 필수, 검증된 인용이 없으면 "인용 없음"을 명시(빈 인용 카드 금지). [P4][Enterpret]

### remedy 카드 (result 안 remedy-section)
1. 카드 유형 3종(선례 무브 / 실패 앵글 / 원칙)을 Enterpret식 행동 카테고리처럼 색·아이콘으로 구분하되 감성 색(초록/빨강)과 겹치지 않게. [P5][Enterpret]
2. 각 카드에 "이 권고의 근거" 접기 영역 — 어떤 소구점·어떤 케이스에서 왔는지 링크. Chattermill Impact Analysis처럼 "왜 이게 우선인지"를 +/− 기여로. [P6][Chattermill]
3. 카드 정렬 기준 표시("영향 큰 순 / 근거 등급 순") 토글. [자체 판단]

### /analyze/[id]/angles (앵글 초안)
1. 좌: 앵글 편집기, 우: 근거 패널(선택한 소구점의 원문 인용 + 실패 앵글 경고). Appbot의 리뷰 목록+우측 패널 구조를 반전 적용. [P3][Appbot]
2. 앵글별 "사용한 고객 표현" 칩 — VOC.AI 문구 "Use actual buyer wording to shape messaging"의 구현. 인용에서 드래그해 칩으로. [VOC.AI 문구 기반, 화면은 미확인]
3. 공유 링크(로그인 없이 열람) + PDF. [P10][SellerSprite]

### /cases (케이스 검수)
1. 승인 대기 큐를 테이블로: 케이스 / 무브 수 / 근거 등급 / 대기 일수 / 승인 버튼 2개(무브·케이스)를 같은 행에. [P2]
2. 행 확장 → 원 관측(리뷰·기사) 인용을 분모와 함께. [P4]
3. 상단 필터: 등급·상태·기간 고정. [P8]

### /columns (칼럼·스레드 검수)
1. 리스트 상단에 "Your / Shared / Starred" 식 탭 대신 "대기 / 승인 / 반려" 상태 탭. [Chattermill Reports 탭 구조 차용]
2. 초안 옆에 근거 인용 패널 고정(앵글 화면과 같은 컴포넌트). [P3]

### /discovery (발굴 후보 검증)
1. 후보를 Appbot의 Top New / Upwards Trending Words처럼 **"새로 등장 / 늘어나는 / 줄어드는"** 세 열로 나눠 보여준다. [Appbot]
2. 각 후보 행에 실측 hits 수와 채택 기준 임계값을 나란히("hits 14 / 기준 10"). [P4]
3. 사람이 뒤집은 결정은 회색 아이콘으로 남긴다(삭제 아님). [자체 판단]

### /dashboard (발행 기록·수리소)
1. 요약 카드 4개(발행 수 / 연결 어긋남 수 / 성과 수집 중 / 마지막 크론). [P1]
2. 어긋난 연결 목록은 Enterpret 카테고리처럼 원인 유형 태그로. [Enterpret]
3. 화면 이름을 실제 역할("발행 연결 수리")로 바꾼다 — 현재 AppNav 주석이 인정한 불일치. [자체 판단]

### /agents
1. Enterpret Agent 화면처럼 실행별 "작업 흔적"(단계·도구 호출·결과 링크)을 접기로. [Enterpret]
2. 자동화 목록과 대화형 세션을 좌측에서 분리("Agent / Automations"). [Enterpret]

### /settings/profile
1. Kimola 확인 화면처럼 "이 값이 새 분석 1단계를 프리필한다"를 필드 옆에 설명. [Kimola]
2. 저장 후 "새 분석 시작" 바로가기. [자체 판단]

---

## 5. 공통 셸 제안

- **내비게이션**: 좌측 사이드바(Chattermill·Enterpret·Kimola). 현재 AppNav 주석은 "목적지가 셋뿐이라 상단바"라고 썼지만 지금은 7개이고 상단바가 overflowX: auto로 넘친다. 사이드바는 두 그룹으로: ①분석(소구점 분석·발굴 후보) ②검수·운영(케이스·칼럼·발행 수리·에이전트) + 하단 프로필. 모바일은 아이템스카우트 모바일 웹처럼 핵심 4~5개 탭 하단 고정, 나머지는 드로어. [P11, 아이템스카우트 m.]
- **페이지 헤더 패턴**: 좌상단 제목(질문형 부제 한 줄) + 우상단 액션 1~2개(내보내기/공유, 새 분석). Enterpret 대시보드의 "이름+연필, Add, ⋯ 메뉴" 구조. 결과 화면은 헤더 바로 아래 고정 필터 행(기간·별점·변형). [P8][P10][Enterpret]
- **밀도**: 테이블 우선, 카드 그리드는 요약 카드 행(맨 위 1줄)에만. 소구점·케이스·후보는 전부 행 단위 테이블 + 우측 상세 패널. [P2][P3]
- **색·상태 의미**: 감성 = 초록/빨강/회색(중립)/파랑(혼합)으로 고정하고 브랜드 강조색은 감성과 겹치지 않는 색(예: 보라·남색)으로. 상태(대기/승인/반려)는 감성 색과 별개의 배지 세트. 등급(근거 A~D)은 아이템스카우트처럼 숫자 옆 텍스트 라벨. [P5][아이템스카우트]
- **증거 캡션 규약**: 모든 인용·숫자에 "n/N건 · 기간 · 출처" 캡션. 인용 없으면 "검증된 인용 없음" 텍스트 표시, 빈 카드 금지. [P4][Enterpret]
- **빈 상태**: 경쟁사 문서화 없음 → [자체 판단] 세 종류만: ①데이터 없음(입력창 포함) ②수집·분석 중(Appbot처럼 예상 소요 "2–30초" 같은 범위 표기) ③오류(다시 시도 + 원인 한 줄). 기존 EmptyState 컴포넌트 하나에 variant로.
- **로딩**: 분석 실행 카드에 단계별 진행(수집→추출→채점) — Enterpret Agent의 steps 표시를 단순화. ProgressBar 재사용. [Enterpret]

---

## 6. 미확인 목록 (다음 조사 때)

- Appbot·SellerSprite·Helium 10의 실제 사이드바/상단바 여부
- Chattermill Impact Analysis 차트 형태(막대인지 산점인지)
- SellerSprite AI 6차원의 표시 형식(퍼센트·막대·인용)
- Kimola 리포트 본문 배치(Executive Summary 위치, Pain Points 카드 형태)
- VOC.AI 분석 플랫폼 내부 화면 전부(로그인 뒤)
- 어느 서비스도 빈 상태·모바일 동작을 문서화하지 않음

## 읽은 URL 전체

- https://appbot.co/ · https://appbot.co/features/ask-appbot/ · https://support.appbot.co/help-docs/widget-glossary-for-appbot-dashboards/ · https://support.appbot.co/help-docs/how-to-use-topics/ · https://support.appbot.co/help-docs/positive-sentiment-negative-sentiment/ · https://support.appbot.co/help-docs/ask-appbot/ · https://support.appbot.co/section/analyzing-reviews/
- https://www.chattermill.com/ · https://docs.chattermill.com/en/articles/5939546-manage-and-add-themes · https://docs.chattermill.com/en/articles/6518910-understanding-impact-analysis · https://chattermill.com/blog/new-reports-and-dashboards · https://docs.chattermill.com/en/collections/6035658-learn-about-chattermill
- https://www.enterpret.com/ · https://helpcenter.enterpret.com/en/articles/12665465-enterpret-features-explained · https://helpcenter.enterpret.com/en/articles/12665411-introduction-to-enterpret · https://helpcenter.enterpret.com/en/articles/15608623-getting-started-with-enterpret-agent · https://helpcenter.enterpret.com/en/articles/8756551-dashboard-basics · https://helpcenter.enterpret.com/en/ (Wisdom 문서 본문은 404, 검색 스니펫만)
- https://www.sellersprite.com/en/help/review-analysis · https://www.sellersprite.com/en/help/review-analysis-for-beginners · https://www.sellersprite.com/en/blog/efficiently-analyze-amazon-reviews
- https://kimola.com/cognitive · https://kimola.com/support/how-to-scrape-and-analyze-amazon-product-reviews · https://kimola.com/support/cognitive · https://kimola.com/support/cognitive/what-is-a-report
- https://revenuegeeks.com/helium10-review-insights/ (서드파티; 공식 KB 403)
- https://itemscout.io/ · https://m.itemscout.io/keyword?id=517123 · https://school.itemscout.io/6d82116c-befc-4c00-b552-01069b33d44d · https://www.windly.cc/blog/keyword-research-with-itemscout (서드파티) · https://www.chosunseller.kr/itemscout-review/ (서드파티)
- https://www.voc.ai/ · https://www.voc.ai/product/voice-of-customer-analysis · https://www.voc.ai/features/customer-analytics · https://entreresource.com/voc-ai/ (서드파티)
- https://www.wonderflow.ai/ · https://www.wonderflow.ai/product · https://www.wonderflow.ai/solutions/product
- https://revenuegeeks.com/jungle-scout-ai-assist/ (서드파티; 공식 헬프센터 403)
- https://pandarank.net/
