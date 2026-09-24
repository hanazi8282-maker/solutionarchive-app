# 조사 노트 — Fathom Analytics (fathom-analytics-viral-traffic-infra-scaling)

- 조사일: 2026-09-23 / 조사원: sa-cmo-researcher
- 큐 사유: coverage_gap (SUPPLY 승인 케이스 1곳뿐 — 매칭 성립에 3곳 필요) / 목표 병목: SUPPLY
- 시장: SaaS · 1인/소규모 팀 소프트웨어 → **충족**. 창업자 2인(Jack Ellis·Paul Jarvis) +
  계약직 몇 명 수준으로, 대형 고객(IBM·GitHub 등)까지 처리하는 트래픽 규모를 감당함.
- 대상: "미정"이었음. WebSearch 로 직접 정함(아래 §1).
- 결과: `outcome_status=active`, 무브 2건 모두 `outcome_direction=positive`. **성공 사례.**

## 1. 왜 이 대상인가

큐가 "SUPPLY 승인 케이스 1곳뿐"이라고 명시했고, 대상 시장은 SaaS로 한정했다. SaaS 맥락에서
`SUPPLY`(공급 능력)는 물류·재고가 아니라 **트래픽·데이터량이 팀 규모보다 빨리 늘 때 인프라가
버티는가**로 해석했다(`reader_problem` 어휘의 `SOLO_CEILING` — "주문이 늘어도 내 손이 안
늘어난다" — 과 대응). 다음 기준으로 후보를 좁혔다: (1) SaaS·소프트웨어, (2) 1인 또는
소규모 팀, (3) 창업자 1인칭 출처로 "트래픽 폭증에 인프라가 못 버틴" 구체적 사건이 있는 곳,
(4) 이미 적립된 슬러그(`plausible-analytics-usage-based-pricing-margin` 등)와 겹치지 않을 것.

후보 비교:

- **Plausible Analytics**: 이미 이 리포에 `plausible-analytics-usage-based-pricing-margin`
  으로 적립돼 있고(병목 UNIT_ECONOMICS), 같은 브랜드를 다른 병목으로 다시 쓰는 것은 이번
  조사 지침 범위 밖이라 제외.
- **Transistor.fm**: SUPPLY 성격의 인프라 위기 서사를 자사 블로그에서 찾지 못함(주로
  마진·가격 얘기). 제외.
- **Fathom Analytics**(Jack Ellis·Paul Jarvis): 2020-08-19 "10m 페이지뷰 위기"와
  2021-03-30 "SingleStore 이전" 두 글 모두 창업자 1인칭으로 관측→추론→결정이 뚜렷하게
  적혀 있고, 구체 수치(쿼리 응답시간 2초→58ms)까지 있음. **채택.**

대상을 중간에 바꾸지 않았다. Fathom Analytics 하나만 조사했다.

## 2. 찾은 것

### 사고의 흐름 (당사자 1인칭 — 요구사항 충족, 2건)

1차 출처 2건을 직접 열었다: 창업자 Jack Ellis의 자사 블로그 `usefathom.com/blog`
(viral 2020-08-19 / worlds-fastest-analytics 2021-03-30).

**무브 0 (2020-08-19 위기 대응)**

- **관측**: 고객 사이트 하나가 몇 시간 만에 1천만+ 페이지뷰를 기록, 큐 백로그가
  150만~200만 건까지 쌓이고 DB CPU가 97~99%.
- **1차 대응**: 백그라운드 워커를 늘렸다가 DB 부하만 커짐 → 되돌림.
- **외부 자문**: 개발자 지인(Chris Fidao)에게 실시간으로 조언 요청 → 원인이
  IOPS 상한(100GB 스토리지 = 300 IOPS)이라고 진단.
- **결정 1(즉시)**: "돈으로 먼저 해결한다" — 스토리지를 1000GB로 올려 IOPS 10배 확보,
  DB를 16vCPU/64GB로 증설.
- **결정 2(근본 수정)**: site_id 컬럼이 VARCHAR로 저장돼 매번 느리게 비교되던 것을
  정수형+인덱스로 변경 → 쿼리 하나가 2초→58ms.
- GDPR 해시 보관 규정상 자정(UTC) 전에 백로그를 처리해야 하는 마감을 지킴.

**무브 1 (2021-03-30 인프라 재설계)**

- **관측**: 2020-08 위기가 구조적(고정 용량 MySQL의 IOPS 상한)이라 반복될 것으로 판단.
- **자기 규모 인식**: "We are Jack & Paul, with a few folks helping us" — 자체
  인프라팀을 꾸릴 여력이 없다는 것을 명시.
- **비교 판단**: 컴캐스트(초당 30만 이벤트)·아카마이(초당 1천만 업서트)를 처리하는
  SingleStore에게는 자사 규모가 "식은 죽 먹기".
- **결정**: 직접 샤딩·스케일링 인프라를 구축(build)하는 대신, 이미 하이퍼스케일
  검증을 받은 관리형 서비스를 사는(buy) 쪽을 택함. 비용 월 2,000달러 미만.

### 수치

| 사건 | 지표 | 이전 | 이후 | 출처 |
|---|---|---|---|---|
| 2020-08-19 | 쿼리 응답시간(site_id 조회) | 2,000ms | 58ms | usefathom.com/blog/viral |
| 2020-08-19 | 큐 백로그 | 150만~200만 건 | (자정 전 처리 완료) | 동일 |
| 2021-03-30 | 대시보드 쿼리 | 7분 타임아웃 | "초 단위"(구체 숫자 미기재) | usefathom.com/blog/worlds-fastest-analytics |

무브 0의 metric(2000ms→58ms)만 초안에 채택했다. 무브 1의 "7분→초 단위"는 원문에 정확한
"이후" 숫자가 없어(추정으로 채우지 않기 위해) metric 필드를 비우고 등급 D(서술만)로
남겼다 — 없는 수치를 지어내지 않는다는 규칙(§evidence-rules 4) 때문이다.

### 자기보고 외 확인 (§7.1 — 확인 불가를 양성으로 접지 않기)

- `usefathom.com/pricing`을 2026-09-23 직접 조회 → 로그인·7일 무료체험·요금표($15~$470/월)가
  있는 **실제 운영 중인 서비스**. `outcome_status=active`의 비자기보고 확인.
- Starter Story(3차, `starterstory.com`) 요약에서 "매출 5천만 달러/월" 수치가 나왔으나
  명백한 스크레이핑 오류로 판단해 채택하지 않았다. "성장률 70%" 도 창업자 발언을
  받아쓴 것인지 원문을 못 찾아 초안에 넣지 않았다.

## 3. 못 찾은 것 — 확인 불가

- **비자기보고 수치 출처 0건.** 비상장 부트스트랩 기업이라 공시가 없다. Starter Story ·
  usefathom.com/about은 전부 창업자 발언을 받아쓴 것이라 `is_self_reported` 축을
  낮추지 않았다. 그래서 무브 0은 **사실확인 등급 C**(자기보고 1차뿐, 다른 원 관측 없음)다.
- **무브 1의 정확한 "이후" 응답시간(초 단위 숫자)**: 원문이 "seconds"라고만 쓰고
  구체 초 단위를 밝히지 않음 — 확인 불가로 남기고 metric을 비웠다.
- **2020-08 위기 이후 실제 매출·고객 이탈 영향**: 위기 당일 처리에 대한 서술은
  있으나, 이 사건이 매출이나 고객 유지에 미친 영향은 원문에 없음 — 확인 불가.
- **현재(2026) 팀 규모·정확한 매출**: usefathom.com/about에서 "소규모 원격 팀"이라고만
  나오고 정확한 인원수·매출액은 확인 불가. 무리해서 초안에 넣지 않았다.
- **`transferability`**: 이 필드는 조사원이 정하지 않는 것이 규칙이라 애초에 채우지 않음.

## 4. 어휘 관련 메모

- `reader_problem = SOLO_CEILING` — "혼자/소규모 팀이 감당할 수 있는 한계에 걸렸다"가
  두 무브 모두에 정확히 들어맞는다(트래픽은 늘었는데 팀 손이 안 늘어나는 상황).
- `bottleneck = SUPPLY` — 큐가 지정한 목표 병목. SaaS 맥락에서는 물류가 아니라
  "요청량 대비 인프라·팀의 처리 능력"으로 해석했다.
- `lever` 두 무브 모두 `OPERATIONS` — 고정 어휘 안에 있다. 다른 레버(PRODUCT_FEATURE 등)로
  볼 여지도 있었으나, 둘 다 제품 기능이 아니라 내부 운영·인프라 의사결정이라 OPERATIONS로 뒀다.
- `buyer_type = B2B`로 뒀으나, 실제 고객에는 1인 블로거·프리랜서도 섞여 있어 애매함이
  있다(Plausible 조사 노트와 같은 종류의 애매함).
- `price_band = LOW` — 진입 플랜이 $15/월로 구글 애널리틱스360 등 엔터프라이즈 대비 낮게
  잡혀 있음.

## 5. 출처

- 위기 대응 글(1차·자기보고, 사고 흐름 + 수치): https://usefathom.com/blog/viral (2020-08-19)
- SingleStore 이전 글(1차·자기보고, buy-vs-build 결정 서사): https://usefathom.com/blog/worlds-fastest-analytics (2021-03-30)
- usefathom.com/pricing 직접 조회 2026-09-23(비자기보고, 운영 상태·현재 가격 확인): https://usefathom.com/pricing
- 참고했으나 수치 채택하지 않음(3차·스크레이핑 오류 의심): https://www.starterstory.com/stories/fathom-analytics-4887dc81-8d94-4296-a88b-5613b8c2aa80
- 참고(팀 규모·미션 확인용, 3차): https://usefathom.com/about
