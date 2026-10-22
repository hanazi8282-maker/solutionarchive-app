# Warby Parker 홈 트라이온 보강 조사 노트 (2026-09-15)

- 기준: `content/guides/인사이트-추출-기준.md` §2, `케이스-작성-가이드.md` §10·§11
- 출발점: `drafts/cases/warby-parker-home-try-on.json` (무브 2개, 근거 5건, snippet 1/5)
- 검수 판정에서 지적된 착수 전 필수 과제 둘이었다. (1) S-1·8-K 원문 문장 확보 (2) 인과 단정 2곳 해체. 여기에 채울 것 넷(③단계, ④사고의 흐름, ⑤적용, ②조건)이 붙었다
- 방법: SEC EDGAR 에서 S-1 과 8-K 2건을 `curl -sL -A "Mozilla/5.0 (research) admin@example.com"` 으로 직접 내려받아 HTML 을 텍스트로 바꾼 뒤 문자열 검색으로 대조했다. 상태 코드만 보지 않고 기대하는 표지("Home Try-On", "2,456", "4.1%")가 실제 본문에 있는지 확인했다. 실적발표 콜 발언은 공시에 없어 전사록 2종씩을 교차 확인했다
- DB 접근·발행·커밋 없음

---

## 1. 열어 본 출처 (발행일 확인)

원문을 실제로 열어 본문 텍스트까지 확인한 것만 적는다.

| # | 출처 | 상태 | 확인한 표지 |
|---|---|---|---|
| 1 | Warby Parker S-1 (2021-08-24 제출) https://www.sec.gov/Archives/edgar/data/1504776/000162828021017546/warbyparkerincs-1.htm | 열림 200, 3.08MB, 텍스트 925,845자 | "Home Try-On" 18곳, Glossary 정의, 창업자 편지 문단, CAC 정의, Retail Store Expansion 절, Key Business Metrics 표 |
| 2 | 위 제출 폴더 인덱스 https://www.sec.gov/Archives/edgar/data/1504776/000162828021017546/ | 열림 | 제출일 2021-08-24 |
| 3 | 2025년 2분기 8-K EX-99.1 https://www.sec.gov/Archives/edgar/data/1504776/000150477625000024/warbyparkerincearningsrele.htm | 열림 200, 텍스트 31,161자 | "sunset our Home-Try On program" 4곳, 표 값 2,456, 활성고객 9.0%·2.60백만, 매장 298, 현금 286,384 |
| 4 | 위 폴더 인덱스 | 열림 | 제출일 2025-08-07 |
| 5 | 2026년 2분기 8-K EX-99.1 https://www.sec.gov/Archives/edgar/data/1504776/000150477626000015/warbyparkerincearningsrele.htm | 열림 200, 텍스트 29,656자 | 활성고객 4.1%·2.71백만, ARPC 336(+6.6%), 매출 235.5백만(+9.8%), 매장 352, "sunset of the Home Try-On program" 110bp |
| 6 | 위 폴더 인덱스 | 열림 | 제출일 2026-08-06 |
| 7 | Retail Dive "Warby Parker to end home try-on program..." https://www.retaildive.com/news/warby-parker-ends-home-try-on-program-focuses-stores-digital-q2/757070/ | curl 403, 본문 추출 도구로 열림 | "the vast majority of recent home try-on users live within 30 minutes of a Warby Parker store", 블루멘털 "For many years, and especially during the pandemic..." |
| 8 | 2025년 2분기 콜 전사록 A https://www.marketbeat.com/earnings/reports/2025-8-7-warby-parker-inc-stock | 열림 | 블루멘털 3문장, 길보아 질의응답 |
| 9 | 2025년 2분기 콜 전사록 B https://uk.investing.com/news/transcripts/earnings-call-transcript-warby-parker-q2-2025-misses-eps-forecasts-revenue-grows-93CH-4208071 | 열림 | 같은 3문장, 표기만 다름("Home Tryon", "thirty minutes") |
| 10 | 2026년 2분기 콜 전사록 A https://www.investing.com/news/transcripts/earnings-call-transcript-warby-parker-q2-2026-profit-miss-sparks-10-premarket-drop-93CH-4842536 | 열림 | 미첼 2.8/1.7/0.5%포인트, 길보아 "expected and transitory headwind" |
| 11 | 2026년 2분기 콜 전사록 B (Motley Fool 전재) https://www.theglobeandmail.com/investing/markets/markets-news/Motley%20Fool/3827923/warby-parker-wrby-q2-2026-earnings-call-transcript/ | 열림 | 같은 수치 2.8/1.7/0.5, 같은 인용 |

열지 못한 것과 시도 결과

- **Earnest Analytics** https://www.earnestanalytics.com/insights/eyeing-warby-parkers-s-1 — 케이스 JSON 에 `published_at` 과 `snippet` 이 둘 다 null 이다. 이 초안에서 쓰지 않기로 먼저 정했기 때문에 열지 않았다. "게시일 없음"이 아니라 확인 실패다
- **Retail Dive** — 직접 `curl` 은 HTTP 403 이었다(파일은 286KB 받았으나 본문이 아닌 차단 페이지라 텍스트 41자). 본문 추출 도구로는 읽혔고, 읽은 내용만 근거 메모에 적었다
- **roic.ai 2025 2분기 전사록** — HTTP 403. fool.com 원본 전사록 URL — HTTP 404. 그래서 전사록은 marketbeat / investing.com / Globe and Mail 로 교차 확인했다
- **실적발표 콜 오디오·회사 게시 전사록** — 확인하지 못했다. 콜 발언은 전부 3자 전사록을 읽은 것이고, 두 전사록의 어휘 표기가 서로 달라 단어 단위로는 원 발화와 다를 수 있다. 칼럼 근거 메모에 이 한계를 적었다

---

## 2. 착수 전 필수 과제 (1) 원문 문장 확보 — 5건 중 4건 확보, 1건 부정 확인

검수가 요구한 "S-1·8-K 원문 문장 4건"을 항목별로 적는다.

### 확보 1. 홈 트라이온의 구조 (S-1, 확보)

> "Home Try-On refers to a program that allows customers to pick five pairs of frames on our website (or get tailored suggestions after taking a quick and simple quiz) and try them at home for five days for free."

같은 문서 Business 절에 회사의 자기 설명도 있다.

> "The Home Try-On program is very unique to our business. It is a viral brand awareness program that pays for itself as we maintain an exceptionally high conversion rate from Home Try-On purchases."

케이스 JSON 의 claim("S-1 은 이 프로그램을 '전환율이 높아 스스로 비용을 회수하는 바이럴 인지 프로그램'으로 설명한다")은 원문과 일치한다. 다만 **전환율의 실제 수치는 문서에 없다.** "exceptionally high" 라는 형용사뿐이다.

추가로 확보한 것이 이 조사의 최대 수확이다. CAC 정의에 홈 트라이온 비용이 들어간다.

> "Acquisition costs is defined as total media spend plus Home Try-On costs in a given period. Home Try-On costs include customer shipping, consumable, and product fulfillment costs related to the program."

### 확보 2. 도입 시점의 가설 (S-1 창업자 편지, 확보)

> "When we launched the business in February of 2010, less than 2.5% of glasses were sold online; yet we believed that if we offered high-quality, uniquely designed glasses for a reasonable price point, with mechanisms to try them on like our Home Try-On program, and outstanding customer service, people would be willing to buy eyewear online for the first time. We reached our first-year sales targets in three weeks, sold out of our top 15 styles in four weeks, and built a waitlist of thousands of customers for our first-of-its-kind Home Try-On."

S-1 안에 같은 문단이 2회(Letter, Business) 나온다. 이게 ④사고의 흐름을 **당사자 1인칭**으로 받치는 첫 문장이다.

### 확보 3. 종료 결정과 재고평가손 (2025년 8-K, 확보)

> "The decrease in gross margin was driven by $2.5 million of one-time inventory write-downs primarily related to the decision to sunset our Home-Try On program at the end of this year, as well as sales growth of contact lenses, increased store occupancy and doctor headcount, and tariff related costs..."

비GAAP 조정표 각주와 표 값에서 정확한 금액도 확인했다.

> 각주: "Represents one-time inventory write-downs primarily related to the decision to sunset our Home-Try On program at the end of this year." / 표 값 `2,456` (천 달러)

케이스 JSON 의 snippet("one-time inventory write-downs of $2,456 thousand primarily related to the decision to sunset our Home Try-On program")은 **표 값과 각주를 합쳐 만든 문장**이고, 그 형태로 본문에 이어져 있지는 않다. 칼럼은 본문 문장(250만 달러)과 표 값(245.6만 달러)을 나눠 적었다. 또 8-K 표기는 `Home-Try On`(하이픈 위치가 다르다)이고 2026년 8-K 는 `Home Try-On` 이다.

### 확보 4. 종료 이후 수치 (2026년 8-K, 확보)

> "Drove Active Customer growth of 4.1% to 2.71 million on a trailing 12-month basis, and Average Revenue per Customer of $336, up 6.6% year over year."

대조군인 1년 전 수치도 2025년 8-K 본문에서 확인했다.

> "Active Customers increased 9.0% to 2.60 million on a trailing 12-month basis, and Average Revenue per Customer increased 4.6% year over year to $316."

2026년 8-K 에는 홈 트라이온이 한 번 더 나오는데, 활성고객이 아니라 **매출총이익률** 맥락이다.

> "...as well as a 110 basis points benefit from the one-time inventory write-downs in Q2 2025 related to the sunset of the Home Try-On program."

### 확보 실패 5. 재구매 고객 비중 38%에서 42% (S-1, 확인 실패 · 본문에서 제거)

케이스 JSON 의 무브 0 지표가 이것인데, **S-1 본문 텍스트에 없다.**

- 확인되는 것: "The strength of our multichannel business model is reflected in the fact that in 2020, 58% of our Active Customers were first-time customers despite the challenges presented by the COVID-19 pandemic." (따라서 2020년 재구매 42%)
- 확인되는 것: "The proportion of returning customers has steadily increased each year as customers return to purchase."
- **확인 안 되는 것: 2019년 38%.** 문서 전체에서 `38%` 는 두 곳뿐이고 둘 다 이커머스 채널 비중 맥락이다(2018년 이커머스 38% → 2019년 35%, 그리고 의류·액세서리 이커머스 침투율 38%). 재구매 맥락의 38% 는 없다
- 그림 차트에 있을 가능성은 배제하지 못한다. HTML 텍스트 기준으로는 확인 실패다

**처리: 본문에서 통째로 뺐다.** 이유는 둘이다. 첫째, 38% 를 확인하지 못했다. 둘째, 확인되는 42% 조차 홈 트라이온의 효과로 읽을 근거가 원문에 없고 2020년은 팬데믹으로 이커머스 비중이 60%까지 올라간 해다. 근거 메모 "쓰지 않은 것"에 이유를 적었다.

---

## 3. 착수 전 필수 과제 (2) 인과 단정 2곳 해체 — 둘 다 해체

### 해체 1. "재구매 38에서 42% 를 홈 트라이온 효과로 읽게 배치한 것"

- 원 케이스: 무브 0(OFFER = 홈 트라이온)의 `metric_before/after` 자리에 이 수치가 들어가 있어, 장치의 성과처럼 읽힌다
- 원문 상태: 위 §2-5 대로 38% 는 확인 실패, 42% 는 확인되지만 귀속이 없다
- **처리: 지표 자체를 쓰지 않았다.** 대신 홈 트라이온의 효과에 대해 원문에 실제로 있는 회사 진술("스스로 비용을 회수하는 바이럴 브랜드 인지 프로그램", "대단히 높은 전환율")만 인용하고, 수치가 없다는 점을 근거 메모에 적었다
- 대체로 넣은 것: CAC 26달러(2018), 27달러(2019), 40달러(2020). 이건 S-1 본문에 수치와 원인이 함께 적힌 값이고, 홈 트라이온 비용이 그 안에 들어간다는 정의도 같은 문서에 있다

### 해체 2. "종료 발표 이후 1년간 활성고객 증가율이 절반 아래로 떨어졌다"

- 원 케이스: 8-K 두 건의 9.0% 와 4.1% 를 나란히 놓고 종료의 대가로 읽게 했다
- 원문 상태: **8-K 본문에는 두 시점 수치만 있고 인과가 없다.** 검수 판정이 맞다
- 그런데 조사 과정에서 **회사 자신이 인과를 수치로 갈라 놓은 발언**을 찾았다. 2026년 2분기 콜에서 CFO 에이드리언 미첼이 이렇게 말했다

  > "In Q2, the headwind from Home Try-On was about 2.8 percentage points of growth. We expect in the third quarter it's probably going to be more about 1.7 percentage points of growth, and in the fourth quarter, about a half a point."

  같은 콜에서 길보아는 "the expected and transitory headwind from the sunsetting of our Home Try-On program" 이라고 표현했다

- **처리: "절반 아래로 떨어졌다"는 구도를 버리고, 회사가 떼어 말한 2.8%포인트만 썼다.** 칼럼 본문은 이렇게 적는다. 4.9%포인트가 빠졌고 그중 약 2.8%포인트를 회사가 종료 탓으로 떼어 말했으며, **나머지 약 2.1%포인트의 원인을 회사가 갈라 밝힌 것은 확인하지 못했다.** 회사의 "예상되고 일시적인"이라는 수식도 함께 옮겼다
- 추가로 8-K 에서 **종료 시점에 지표가 나빠지고 있지 않았다는 반대 증거**를 찾아 넣었다. CFO 스티브 밀러가 같은 발표에서 이 분기를 "eighth consecutive quarter of accelerating active customer growth" 로 적었다. 종료가 부진의 결과라는 반대 방향 오독도 막힌다

---

## 4. 중요 11항목

### 1. 막힌 지점

- 찾음. 창업자 편지가 1인칭으로 적었다. 2010년 2월 창업 당시 안경의 2.5% 미만만 온라인에서 팔렸다. 막힌 곳은 수요가 아니라 **확인 시점**이다. 안경은 얼굴에 올려 보지 않으면 살지 말지를 정할 수 없는데 그 확인을 결제 뒤에만 할 수 있었다
- 주의: "확인 시점이 결제 뒤뿐이었다"는 문장은 원문에 그대로 있지 않다. 원문에 있는 것은 "less than 2.5% of glasses were sold online" 과 "mechanisms to try them on" 이고, 칼럼은 창업자 편지를 인용한 뒤 "이 문장에서 막힌 지점이 보인다"로 해석임을 표시했다
- 출처: 1

### 2. 결정과 그 이유

- 찾음. 둘이다
  - **도입(2010)**: 착용해 볼 수 있는 장치를 붙이면 사람들이 처음으로 온라인에서 안경을 살 것이라는 가설. 창업자 편지에 명시
  - **폐기(2025)**: 블루멘털 "최근 홈 트라이온 고객의 대다수가 매장에서 30분 거리 안에 산다", "규모를 키우면서 홈 트라이온이 이커머스 사업의 동인으로서 덜 중요해졌고, 고객이 온라인과 매장에서 직접 사는 데서 강한 성장을 봤기 때문에 종료하기로 했다". 길보아 "매장이 생기기 전에 사람들이 안경을 써 볼 수 있게 하려고 설계한 것"
- 버린 선택지: 축소 운영(프레임 수 감소, 유료화 등)을 검토했는지는 **확인 불가**
- 출처: 1, 3, 7, 8, 9

### 3. 해결 과정 단계

- 찾음. 이번 조사의 보강분이다. 매장 수가 연표를 대신한다

| 시점 | 근거 | 상태 |
|---|---|---|
| 2010-02 | S-1 창업자 편지 | 창업. 매장 0곳. 홈 트라이온과 함께 시작 |
| 2010 | S-1 Risk Factors | "숍인숍" 형태를 뉴욕·내슈빌·샌프란시스코 등에서 시작 |
| 2013 | S-1 Risk Factors | 첫 상설 매장(뉴욕) |
| 2014-06 / 2014-09 | S-1 Business | 댈러스·애틀랜타 첫 매장. 개점 1년 뒤 그 시장 이커머스가 각각 10%·3% 감소 |
| 2016-12-31 | S-1 | 매장 44곳 |
| 2018 / 2019 / 2020 | S-1 Key Business Metrics | 88 / 119 / 126곳 |
| 2021-06-30 | S-1 | 145곳. 활성고객 2.08백만 |
| 2025-06-30 | 2025 8-K | **298곳.** 300호점 개점 언급. 활성고객 2.60백만(+9.0%). 이 발표에서 연말 종료 발표 |
| 2025 연말 | 2025·2026 8-K | 홈 트라이온 종료 |
| 2026-06-30 | 2026 8-K | 352곳. 활성고객 2.71백만(+4.1%) |

- 확인 불가: 종료를 언제 내부에서 결정했는지, 단계적 축소가 있었는지, 종료 공지를 고객에게 언제 어떻게 했는지
- 출처: 1, 3, 5

### 4. 사고의 흐름

- 찾음. **당사자 1인칭 서술에서 관찰·추론·결정이 한 단락에 다 나온다**(가이드의 최소 1건 요건 충족)
  - (관찰) 최근 홈 트라이온 고객의 대다수가 매장에서 30분 거리 안에 산다
  - (추론) 규모가 커지면서 이 장치가 이커머스 사업의 동인으로서 덜 중요해졌다. 고객이 온라인과 매장에서 직접 사는 데서 강한 성장이 나온다
  - (추론, 길보아) 매장이 생기기 전에 사람들이 써 볼 수 있게 하려고 설계한 것이다
  - (결정) 연말 종료. 그리고 "홈 트라이온 비용이 총 마케팅 지출에 포함되어 있으므로 자원을 브랜드 인지와 고객 획득으로 재배분할 수 있다"
- 도입 쪽 사고의 흐름도 1인칭으로 있다(창업자 편지, §2-2)
- 우리 분석으로 표시한 연결: "유효기간이 2025년에 갑자기 끝난 게 아니라 매장이 시장마다 들어가며 줄어들고 있었다"는 해석. S-1 의 시장 재조정 문장과 매장 수 추이를 이은 것이고, **회사가 2021년 공시와 2025년 종료를 하나의 계획으로 이었다는 근거는 없다.** 칼럼에 그 문장을 넣었다
- 출처: 1, 8, 9, 10, 11

### 5. 환경

- 찾음: 2010년 미국 안경 온라인 판매 비중 2.5% 미만. 2019년 5%, 2020년 8%(S-1 이 eMarketer 등을 인용). 2020년 팬데믹으로 워비파커 이커머스 비중이 60%까지 올랐고 2021년 상반기 50%로 재조정. 2021년 6월 말 팀 3,000명 가까이, 매장 145곳 중 91곳이 대면 검안 제공
- 2025년 6월 말 현금 2억 8,638만 4천 달러. 2026년 2분기 순이익 460만 달러
- 확인 불가: 홈 트라이온 연간 비용 총액, 반송률, 프로그램 이용자 수
- 출처: 1, 3, 5

### 6. 고객 문제와 욕망

- 사실: 안경은 처방 의료기기이면서 얼굴에 계속 걸치는 물건이다. S-1 은 안경 구매의 66%, 콘택트렌즈 구매의 71%가 검안을 받은 바로 그 장소에서 일어난다고 적었고, 안경 교체 주기를 2년에서 2년 반으로 적었다. NPS 는 평균 80 이상, 2021년 2분기 83이며 업계 평균은 30 미만이라고 회사가 밝혔다
- 욕망(우리 해석, 원문에 그렇게 적혀 있지 않다): 얼굴에 올리는 물건을 남 앞에서 실패 없이 고르고 싶은 마음. 칼럼은 욕망 해석 절을 따로 두지 않았다. 이 케이스의 축이 욕망이 아니라 장치의 수명이라 지면을 조건과 적용에 썼다
- 확인 불가: 홈 트라이온 이용자 대상 설문이나 리뷰 집계

### 7. 수익 구조

- 찾음: D2C. 안경 95달러부터 시작하는 단일 가격. 2026년 2분기 고객당 평균매출 336달러(+6.6%), 2025년 2분기 316달러(+4.6%). 2021년 기준 고객당 평균매출 218달러(2020년). 홈 트라이온은 무료이고 비용은 마케팅 지출에 포함
- 2021년 매장 경제: 목표 4벽 마진 35%, 평방피트당 매출 2,900달러, 투자 회수 20개월 미만
- 확인 불가: 홈 트라이온 경유 주문의 전환율 수치

### 8. 성장 채널과 전술

- 찾음: 이커머스와 매장 2채널. S-1 은 매장을 "efficient customer acquisition vehicles" 로 적는다. 홈 트라이온은 "viral brand awareness program". **둘 다 회사 언어로는 고객 획득 수단이고, 비용도 같은 자리(마케팅 지출·CAC)에 들어간다.** 종료 뒤 그 비용을 브랜드 인지와 고객 획득으로 재배분한다고 밝혔다
- 2026년에는 구글·삼성과 함께 하는 인텔리전트 아이웨어가 새 축으로 등장한다. 칼럼 주제와 어긋나 쓰지 않았다
- 출처: 1, 3, 5, 8

### 9. 위기 대응

- 찾음: 종료 1년 뒤 활성고객 증가율이 9.0%에서 4.1%로 내렸고, 회사는 그중 약 2.8%포인트를 종료 탓으로 떼어 말하며 3분기 약 1.7, 4분기 약 0.5로 줄어든다고 밝혔다. 길보아는 "활성고객 증가는 더 강하기를 기대했다"고 인정하면서 신규 고객 유치를 하반기 핵심 과제로 들었다
- 확인 불가: 나머지 약 2.1%포인트의 원인에 대한 회사의 분해

### 10. 독자가 할 일

- 칼럼 반영(우리 분석, 사실에서 도출): (1) 신뢰 장치 비용을 고객획득비용 안에 넣는다 (2) 켜는 날 끄는 조건을 한 줄로 적어 둔다 (3) 장치를 거쳐 오는 고객과 거치지 않고 오는 고객을 갈라 세어 둔다
- 각 항목은 워비파커가 실제로 한 것(CAC 정의, 30분 조건, 2.8%포인트 분해)에 하나씩 붙어 있다

### 11. 통하는 조건

- 칼럼 반영(우리 분석): 통하는 조건 넷은 (a) 병목이 신뢰일 것 (b) 나중에 그 신뢰를 대신할 장치가 생길 수 있을 것 (c) 장치 비용을 적어 둘 자리가 있을 것 (d) 끄는 값을 감당할 여력이 있을 것. 안 통하는 조건은 병목이 수요나 인지도인 경우, 대체 장치 없이 끄는 경우, 경유 고객을 세어 두지 않은 경우
- 규모 차이는 가이드 §9 대로 조건 절에 적었다(현금 2억 8,640만 달러, 매장 352곳, 뉴욕증권거래소 상장사)

## 있으면 좋음 4

- **주인공 배경**: 블루멘털과 길보아는 경영대학원 동창이다. 블루멘털은 창업 전 비영리 VisionSpring 디렉터였고 길보아는 베인앤컴퍼니에 있었다. 둘 다 2010년부터 공동 CEO다
- **시작 계기**: 확인 불가. 널리 알려진 "안경을 잃어버리고 다시 못 샀다"는 일화는 S-1 본문에서 찾지 못했다. 쓰지 않았다
- **앞선 실패 이력**: 확인 불가
- **통념과 다른 지점**: 지표가 여덟 분기 연속 가속되던 중에 상징 프로그램을 스스로 껐다. 칼럼 훅 H2 의 재료로 썼다

---

## 5. 수치 충돌·주의 목록

- **★ 가장 중요: 재구매 38%.** S-1 본문 텍스트에 없다(§2-5). 케이스 JSON 의 무브 0 지표를 칼럼에서 제거했다. 케이스 자체를 고칠지는 사람 판단이 필요하다
- **재고평가손 250만 달러 대 245.6만 달러.** 같은 8-K 안에 둘 다 있다. 본문 서술은 반올림한 $2.5 million, 비GAAP 조정표는 2,456(천 달러). 칼럼은 둘을 갈라 적었다
- **프로그램 이름 표기.** 2025년 8-K 는 `Home-Try On`, 2026년 8-K 와 S-1 은 `Home Try-On` 이다. 전사록은 `home try-on`, `Home Tryon` 이 섞인다. 한글 표기는 "홈 트라이온"으로 통일했다
- **활성고객 9.0% 대 4.1%.** 정의는 같다("최근 12개월 안에 한 번 이상 구매한 고유 고객"). 시점만 1년 차이다. 다만 두 값의 차이를 종료 하나로 설명할 수 없다는 점을 §3-2 대로 본문에 적었다
- **콜 전사록의 어휘.** 두 전사록이 같은 취지·같은 수치를 싣지만 단어 표기가 다르다(예: "thirty minutes" 대 "30 minutes"). 인용은 뜻을 유지해 옮겼고 근거 메모에 전사록임을 밝혔다
- **Yahoo 요약의 발표일 오기.** 2026년 2분기 콜 요약 기사가 "reported August 10, 2026" 으로 적는데, 8-K 원문과 EDGAR 인덱스는 2026-08-06 이다. 칼럼은 공시를 따랐다
- **이커머스 매출 -0.3%.** 여러 2차 매체가 2026년 2분기 수치로 쓰는데 8-K 본문에 채널별 분해가 없다. 대신 길보아가 콜에서 말한 "flat year-over-year" 만 썼다
- **매장 298곳 대 300호점.** 2025년 2분기 8-K 는 분기 말 매장 298곳이라고 적으면서 같은 문서에서 블루멘털이 "300호점 개점을 축하했다"고 말한다. 순증 기준과 누적 개점 기준의 차이로 보이나 확인하지 못했다. 칼럼은 298곳만 썼다
- **"15년".** 2010년 2월 시작에서 2025년 말 종료까지다. 2026년 콜에서 길보아는 "For the past 16 years" 라고 말하는데 이건 2026년 시점의 회사 연차다. 칼럼은 장치의 수명인 15년만 썼다

---

## 6. 가이드 §10 자체 점검

작가 본인의 점검이며 검증 근거로 쓰지 않는다(가이드 §11). 근거 URL 을 열어 문장 단위로 대조하는 독립 검증이 별도로 필요하다.

0. **예** — 첫 줄에 `독자: 창업자` 와 판단 이유가 있고, 옮길 행동 셋이 전부 창업자가 자기 제품의 신뢰 장치에 대해 하는 행동이다
1. **예** — "무료 체험이나 무료 반품을 붙일 때 비용을 CAC 안에 넣고, 끄는 조건을 한 줄 적어 두고, 경유 고객을 갈라 세어라"가 답이다
2. **예** — ①사실(S-1·8-K 수치, 매장 연표) ②이유와 조건(도입 가설과 폐기 근거, 통하는 조건 4개·안 통하는 조건 3개) ③해결 과정(2010년 숍인숍부터 2026년 352곳까지) ④사고의 흐름(블루멘털·길보아 1인칭 관찰·추론·결정) ⑤적용(옮길 행동 3개) 전부 있다
3. **예** — 마무리 3블록의 굵은 문장이 전부 워비파커의 사실에 붙어 있다("워비파커는 ~에 적어 두었다", "워비파커가 밝힌 폐기 근거는 매장에서 30분이었다"). "장치에는 유효기간이 있다" 같은 일반문을 결론 자리에 두지 않았다
4. **예** — 통하는 조건 4개와 안 통하는 조건 3개가 문단으로 있고, 규모 차이 문단이 따로 있다
5. **예**(자체 판단) — 모든 수치를 S-1·8-K 본문 텍스트에서 직접 확인했다. 확인 실패한 38% 는 뺐다. 발언은 영어 원문을 옮겼고 전사록 출처를 밝혔다. 다만 파일럿 3편 전부 이 항목을 "예"로 적고 검증에서 걸렸으므로 독립 검증 전까지 이 답을 신뢰하지 않는다
6. **예** — 분석 문장에 "이 사례에서 읽히는", "읽힌다", "이 문장에서 막힌 지점이 보인다"를 붙였다
7. **예** — S-1·8-K 는 "상장 신고서에", "공시는"으로, 콜 발언은 화자 이름과 따옴표로, Retail Dive 는 "보도"로 갈랐다. S-1 첫해 실적 수치에는 "자기보고이지만 허위기재에 법적 책임이 따르는 상장 신고서에 적은 것"이라고 붙였다
8. **예** — 본문 아래 `## 근거 메모` 에 모았고 "쓰지 않은 것과 그 이유" 절을 따로 뒀다
9. **예** — 인과를 잇는 문장을 전수 확인했다. **원문에 인과가 있는 것**: 매출총이익률 하락 요인(8-K "driven by"), 매장 개점과 이커머스 둔화(S-1 "as the market rebalances"), CAC 상승 요인(S-1 "was driven by", "was a result of"), 종료 결정의 이유(블루멘털 "because"에 해당하는 구문), 활성고객 역풍 2.8%포인트(미첼). **우리 해석으로 표시한 것**: 유효기간이 매장과 함께 줄어들었다는 연결, 체력과 "일시적" 표현의 관계. **명시적으로 부정한 것**: 2021년 공시와 2025년 종료를 하나의 계획으로 잇는 근거가 없다는 문장, 나머지 2.1%포인트의 원인을 확인하지 못했다는 문장
10. **예** — 한 사람의 말을 "사람들은"으로 넓힌 곳이 없다. "최근 이용자 대다수가 30분 거리"는 회사 진술 그대로 인용했고 우리가 넓힌 것이 아니다
11. **예** — 시점 표현을 전수 확인했다. 매장 수는 전부 기준일을 붙였다(2016-12-31, 2021-06-30, 2025-06-30, 2026-06-30). CAC 는 연도를 붙였다. "종료"는 2025년 말이고 발표는 2025-08-07 임을 갈라 적었다. 2.8%포인트는 2026년 2분기 값이고 3·4분기는 회사 전망임을 밝혔다
12. **예** — 익명 취재원 기반 주장이 없다. Earnest Analytics 추정치는 쓰지 않았다. 유일한 2차 보도(Retail Dive)는 콜 전사록과 겹치는 내용만 썼다

### 점검 밖의 자기 신고

- **분량 실측**: 제목부터 "배운 점"까지, `독자:` 메타 2줄과 근거 메모 제외, 마크업(`#`, `>`, `**`) 제거 기준으로 **공백 포함 5,710자 / 공백 제외 4,262자**. 가이드 §12-3 의 상향안 3,000~8,000자 안이다
- **형식 실측**: 소제목 7개(그중 질문형 1개 "그런데 왜 잘 되고 있는 장치를 껐나"), 인용 블록 6개, 문단 평균 102자, 200자 초과 문단 3개인데 전부 §12-1 이 규정한 E2 "굵은 주장문 + 풀이" 블록이다. 화살표·em-dash 0개
- **케이스 JSON 과 어긋나는 점**: 무브 0 의 지표(재구매 38→42%)를 칼럼이 쓰지 않는다. 케이스 자체를 고칠지는 사람이 정할 일이라 이 조사에서는 손대지 않았다
- **콜 발언의 지위**: 이 칼럼의 ④사고의 흐름은 실적발표 콜 전사록에 크게 기댄다. 회사가 게시한 전사록이나 오디오를 확인하지 못했고, 3자 전사록 2종의 일치로만 받쳤다. 독립 검증에서 이 점을 우선 봐 주면 좋겠다
