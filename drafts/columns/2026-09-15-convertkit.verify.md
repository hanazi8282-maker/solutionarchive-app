# 검증 결과 — 2026-09-15-convertkit.md

**판정: 수정 후 통과.** 지어낸 수치·발언은 0건. 걸린 것은 인과 덧붙이기 2, 범위 넓히기 1, 시점 빼기 3, 귀속 흐리기 1, 표지·의역 처리 2 — 전부 최소 수정으로 고쳤다. 핵심 수치 1.5%/5.5%는 창업자 자기보고 단일 출처(등급 C~D)이며 본문에 그 한계가 이미 문장으로 적혀 있다. 남헌 판단 항목 4건은 사실 오류가 아니라 문체·단정 수위 문제라 손대지 않았다.

검증자는 작가와 다른 에이전트이며, 조사 노트(`.research.md`)와 작가 자체 점검은 참고만 하고 근거로 쓰지 않았다. DB 접근·커밋 없음.

---

## 열어 본 URL

| URL | 결과 | 비고 |
|---|---|---|
| https://nathanbarry.com/sales/ | 열림 (200) | 2017-07-06 게시. 본문 전문 대조 |
| https://nathanbarry.com/5k/ | 열림 (200) | 2015-03-11 게시. 본문 전문 대조 |
| https://podscripts.co/podcasts/marketing-secrets-with-russell-brunson/shut-it-down-or-double-down-nathan-barrys-road-to-45m-with-kit-convertkit | 열림 (200) | 제3자 자동 전사본. 17:18~30:06 구간 대조 |
| https://kit.com/migrations | 열림 (200) | 2026-09-15 확인. 게시일 표기 없음 |
| https://kit.com/ | 열림 (200) | "Thousands of authors use Kit" 확인 |
| https://newsletter.failory.com/p/convertkit-grows-concierge-migrations | 열림 (200) | 본문에 쓰지 않은 출처. 1.5%/5.5% 옮겨 적음, "6개월 만에 1,300→5,000" 인과 있음(원 출처에 없음) 확인 |

WebFetch 대신 `curl -sL -A "Mozilla/5.0"`로 받아 HTML을 텍스트로 변환해 읽었다(6건 모두 200, 403 없음).

---

## 대조 규모

- 본문 문장 151개(근거 메모·인용 이메일 블록 제외, 소제목 제외)를 전부 읽고, 사실·수치·발언·인과·시점·귀속이 들어간 문장을 대조했다
- 걸린 문장 9건: 인과 덧붙이기 2 · 범위 넓히기 1 · 시점 빼기 3 · 귀속 흐리기 1 · 표지/의역 처리 2
- 원문에 없음 0건, 확인 불가 0건

---

## 걸린 문장 전부

### 1. (16행) 인과/원문 어긋남 — 수정함
- 원문: "컨버트킷은 곁가지가 됐고, 들인 노력만큼만 굴렀다."
- 근거 원문(5k): "I still worked on ConvertKit, but the limited effort I put into it didn't result in any growth."
- 문제: 원문은 "성장이 없었다"인데 "노력만큼만 굴렀다"는 노력에 비례해 굴렀다는 뜻이 된다
- 수정문: "컨버트킷은 곁가지가 됐고, 본인 말로는 들인 노력이 적어 성장이 없었다."

### 2. (18행) 시점 빼기 — 수정함
- 원문: "한 달에 7,000달러가 들어왔지만 곧 좌석이 팔리지 않았다."
- 근거 원문(5k): "It was initially very successful ($7,000 in revenue in one month), but then seats stopped selling"
- 문제: "한 달에"는 월 반복으로 읽힌다. 원문은 특정 한 달의 매출
- 수정문: "처음 한 달에 7,000달러가 들어왔지만 곧 좌석이 팔리지 않았다."

### 3. (20행) 인과 덧붙이기 + 범위 넓히기 — 수정함
- 원문: "그가 돌아본 실패 이유는 고객층이다. 리스트를 맨바닥에서 만드는 법을 가르치자 가장 나쁜 고객이 모였다는 것이다."
- 근거 원문(5k): "Unfortunately the focus on education—particularly building a list from scratch—attracted an audience that didn't make the best customers."
- 문제: (a) 아카데미 정체(좌석 미판매)의 "실패 이유"를 고객층이라고 원문이 말하지 않는다. 고객층 문제는 별도 절이다. (b) "가장 나쁜 고객"은 원문 "didn't make the best customers"보다 세다
- 수정문: "그가 돌아본 문제는 고객층이다. 리스트를 맨바닥에서 만드는 법을 가르치자 좋은 고객이 되지 못할 사람들이 모였다는 것이다."

### 4. (28행) 시점 빼기 — 수정함
- 원문: "배리가 팟캐스트에서 옮긴 바로는, 이 무렵 한 친구가 콘퍼런스에서"
- 근거 원문(팟캐스트): "you've worked on ConvertKit for a year and a half and it's not working." — 연·월 없음. 2013-01 시작 기준 1년 반은 2014년 중반이고, 직전 문단의 2014년 10월 바닥과는 몇 달 차이가 있다
- 문제: "이 무렵"이 2014년 10월에 붙는데 팟캐스트는 시점을 말하지 않는다
- 수정문: "배리가 팟캐스트에서 옮긴 바로는, 한 친구가 콘퍼런스에서" (인용문 안의 "1년 반"이 시점을 대신한다)

### 5. (42행) 인과 덧붙이기(배치에 의한) — 수정함
- 원문: "사무실 임대를 끝내고 장비를 집으로 옮겼고, 주택 담보 대출에 매달 더 넣던 돈도 줄였다. 본인 설명으로는 개인 계좌 잔고가 몇 년 만에 가장 낮았다."
- 근거 원문(5k): "Since we had spent so much money buying and remodeling our house, our personal accounts were the lowest they'd been in years. In fact, that $50,000 investment represented the last bit of our large cash reserves from the year before."
- 문제: 잔고 최저의 원인은 집 구입·리모델링인데, 5만 달러 투입 다음에 두면 투입 결과로 읽힌다
- 수정문: "본인 설명으로는 집을 사고 고치느라 개인 계좌 잔고가 몇 년 만에 가장 낮았고, 이 5만 달러는 전년에 쌓아 둔 현금의 마지막 몫이었다."

### 6. (68행) 범위/시점 — 수정함
- 원문: "그리고 통화는 거의 같은 말로 끝났다."
- 근거 원문(sales): "Most early sales conversations ended with the lead saying"
- 문제: "early"가 빠졌고 "거의 같은 말"은 "대부분의 통화"와 다른 뜻이다
- 수정문: "그리고 초기 통화 대부분은 같은 말로 끝났다."

### 7. (76행) 귀속 흐리기 — 수정함
- 원문: "원문에 적힌 순서는 이렇다."
- 근거: 1~3·5단계는 2017년 블로그, 4단계는 2024년 팟캐스트. 어느 원문도 단계를 번호로 적지 않았다
- 문제: 두 출처를 합쳐 재구성한 순서를 "원문에 적힌"이라고 귀속
- 수정문: "두 출처의 서술을 순서대로 놓으면 이렇다."

### 8. (84행) 전사본 따옴표 인용 — 의역으로 바꿈
- 원문: "한쪽 화면에 메일침프를 띄우고 이쪽에 컨버트킷을 띄운 다음, 다른 화면으로 넷플릭스를 보면서 둘 사이를 복사해 붙여 넣었다. 시급 5달러짜리 일이었지만 누군가를 굴러가게 만드는 일이었다." (따옴표)
- 근거 원문(전사본): "I like pulled up someone's WordPress site, you know, and all that on one screen. And then, or like, I guess mostly I'd pull up MailChimp on one screen and then ConvertKit over here. And I'd copy and paste between them while like watching a Netflix TV show on the other, just to like do all this $5 an hour work, but to get someone up and running."
- 문제: 뜻은 같지만 워드프레스 언급과 말더듬을 지우고 두 문장으로 재조립했다. 자동 전사본이라 글자 단위 인용을 보장할 수 없어 간접 인용으로 내렸다
- 수정문: "팟캐스트에서 그는 한쪽 화면에 메일침프를, 다른 쪽에 컨버트킷을 띄우고 넷플릭스를 틀어 놓은 채 둘 사이를 복사해 붙여 넣었다고 했다. 시급 5달러짜리 일이지만 누군가를 굴러가게 만드는 일이었다는 것이다."

### 9. (88행) 시점·수치 표현 — 수정함
- 원문: "2015년 3월 11일 5,020달러를 넘었다."
- 근거 원문(5k): 제목 "Growing ConvertKit to $5,020", 본문 "we passed $5,000 in monthly recurring revenue". 3월 11일은 글 게시일이고, 돌파는 "last weekend" 리트릿 이후 며칠 사이
- 문제: 넘은 것은 5,000달러이고 도달치가 5,020달러다. 3월 11일은 돌파일이 아니라 게시일
- 수정문: "2015년 3월 11일 글에서는 5,000달러를 넘어 5,020달러가 됐다고 밝혔다."

---

## 원문 일치로 확인한 주요 항목 (수정 없음)

- 따옴표 인용 8건 전부 원문과 뜻·범위 일치: "It's not that much work..." / "shut it down" 발언 / "If I'm being polite..." / "passive income isn't quite so passive" / "anyone... you'll probably fail" / 거절 문장 / "silver bullet... cost of switching... with one offer" / 1.5%·5.5% / "doesn't feel like it scales... math often works" / "You're not starting over. You're scaling up."
- 콜드 이메일 전문: 원문과 항목별 일치 (Sarah, MailChimp, Wellness Mama의 Katie·Seth, Pat Flynn, Chris Guillebeau)
- 수치: 1,207 / 1,646(+23%) / 2,100(+27%) / 3,237(+54%) / 4,067(12/15~1/15, +60%) / 4,561(+17%) / 26개월 / 5만 5,000달러 / 2,480달러·2,000달러 근처 / 1만 5,000~2만 5,000달러 / 7,000달러 / 5만 달러 / 79달러·5,000명 / 1만~1만 5,000달러→2,000달러 / 시급 5달러 / 3만~25만 명 — 전부 해당 출처에 있음
- "천 번 넘게 보냈다": "an email I've sent over a thousand times" 일치
- 명단 두 방법(Nerdy Data·BuiltWith, MailChimp·Aweber·Infusionsoft, 업종 필터, Alexa 순위), 니치 예시: 일치
- 2026-09 정책(유료 플랜 전체, 1만 명 미만 2~5영업일, 1만 명 이상 폼·자동화·템플릿·연동): kit.com/migrations 일치. "전담 팀": 페이지의 "Our migration team" 확인
- 걱정 다섯 가지(downtime / complex setup / lose subscribers / no time / deliverability): 일치
- 2015년 "가장 좋은 고객은 옮겨 온 사람": 5k 글 "our best customers didn't start building an email list from scratch, instead they switched their list over from another provider" 일치
- 네 가지 변경: 전사본에서 "either three or four. Let me list them out" 뒤 넷을 열거. 일치
- 인과가 원문에 있는 곳: "그래서 제안 하나로 그걸 없앨 수 있었다"는 원문 "So with one offer I could remove that" 그대로. 은탄환 판단도 원문
- 해석 표지: 102·106·110·118행에 "이 사례에서 읽히는", "이렇게 보면", "이 해석은 우리 것이고"가 붙어 있음. 92·124행에서 MRR 수열과 무료 이관의 인과를 명시적으로 끊음

---

## §10 점검표 (검증자가 다시 채움)

0. **예** — 첫 줄 `독자: 창업자`, 할 일 셋이 전부 창업자의 세일즈 행동
1. **예** — 마무리 두 문장이 다음 열 번의 상담에서 할 구체 행동
2. **예** — 사실(MRR 수열·정책·이탈률), 이유와 조건(은탄환 + 조건 4/4), 해결 과정(5단계), 사고의 흐름(거절이 하나로 몰림→제거), 적용(행동 셋) 전부 있음
3. **예** — 결론 자리에 일반론 없음. 124행에서 "옮길 것은 성장률이 아니다"로 일반화를 스스로 막음
4. **예** — 118행 통하는 조건 넷, 120~122행 안 통하는 조건
5. **예** — 6개 URL 전문 대조. 원문에 없는 숫자·발언 0. 원 JSON의 "30분 스카이프 데모"·"크리에이터 10만 명"이 본문에 없음을 확인
6. **예** — 위 9건 수정 후. 3번(실패 이유)·5번(잔고)·7번(원문에 적힌 순서)이 사실처럼 쓰인 분석/재구성이었고 고쳤다
7. **예** — 자기보고 수치마다 "본인이 밝힌", "본인 설명으로는", "그는 썼다", "팟캐스트에서". 회사 문구는 "회사는 이렇게 쓴다". 기자 서술 없음
8. **예** — 근거 메모가 `---` 아래 별도 절
9. **예** — 수정 후. 인과 문장 중 원문에 인과가 있는 것(은탄환)만 남고, 없던 것 2건(1·3·5번 항목)은 고쳤다
10. **예** — 거절 문장을 "초기 통화 대부분"으로 원문 범위에 맞췄다(6번 수정). "소비자는·사람들은" 없음. 건수는 원문에 없고 근거 메모에 그렇게 적혀 있음
11. **예** — 수정 후. "이 무렵"(4번)·"3월 11일 넘었다"(9번)·"한 달에"(2번)를 고쳤다. 79달러는 2017-07, 유료 플랜 전체는 2026-09로 각각 날짜가 붙어 있음
12. **예** — 익명 취재원 없음. 추정치(2,480달러)는 본인이 추정이라 밝힌 사실까지 적혀 있음. 1.5%/5.5%는 "기간도 표본 수도 적혀 있지 않고… 본인이 밝힌 수치로 읽어야 한다"로 한계 명시

---

## 남헌 판단 필요 (수정하지 않음)

1. **6행 훅** "제품이 좋은데 계약이 안 붙으면 창업자는 보통 제품을 더 손본다." — 사례가 아닌 일반론 문장으로 시작한다. §11은 스레드 훅에 대한 규칙이지만 칼럼 첫 문장에도 같은 취지가 적용되는지 판단 필요. 바로 다음 문장이 사례라 사실 오류는 아니다
2. **122행** "그리고 건수가 늘면 전담 인력 없이는 무너진다." — 안 통하는 조건 절 안이라 분석으로 읽히지만 "무너진다"는 단정문이다. "감당하기 어렵다"로 낮출지 판단
3. **친구 조언의 시점** — 팟캐스트는 "1년 반"만 말하고 연·월이 없다. 섹션 배치상 2014년 10월 바닥 직후로 읽힌다. "이 무렵"은 뺐지만 배치 자체를 바꿀지는 판단 필요
4. **5만 달러 투입 시점** — 5k 글은 "January 1st, 2014"라 적었으나 문맥상 2015년 1월 1일의 오기로 보인다(12월 실적 다음 문단, "2015년을 빠듯한 해로"). 팟캐스트는 "immediately"라고만 한다. 칼럼은 날짜를 쓰지 않았는데, 이 처리를 유지할지 "2015년 1월(원문 표기는 2014년)"로 밝힐지 판단
5. **제목의 "월 1,207달러에서 72만 5,000달러"** — 시작점은 2015년 글(1,207), 끝점은 2017년 글 제목(725,000)에서 따와 두 출처를 합친 것이다. 2017년 글 제목은 "from $1,300"이라 적는다. 합치는 것 자체는 사실 오류가 아니나 제목에 두 출처를 섞는 방식을 허용할지 판단
