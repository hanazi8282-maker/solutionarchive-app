# 조사 노트 — Testimonial.to (testimonial-to-solo-saas-channel-bootstrap)

- 조사일: 2026-09-23 / 조사원: sa-cmo-researcher (Claude Sonnet 5, 직접 수행)
- 큐 사유: coverage_gap (DISTRIBUTION 승인 케이스 2곳 — 매칭 성립에 3곳 필요) / 목표 병목: DISTRIBUTION
- 시장: SaaS · 1인/소규모 팀 소프트웨어 → **충족**. Damon Chen 1인 창업, 첫 36개월 사실상 솔로 운영.
- 대상: "미정"이었음. WebSearch 로 직접 정함(아래 §1).
- 결과: `outcome_status=active`, 무브 2건 모두 `outcome_direction=positive`. **성공 사례.**

## 1. 왜 이 대상인가

큐가 "DISTRIBUTION 승인 케이스 2곳 — 매칭 성립에 3곳 필요"라고 명시했고, 시장은 SaaS·1인/소규모
팀으로 한정했다. 이미 이 리포에 DISTRIBUTION 병목으로 적립된 SaaS 케이스(`figma-non-designer-distribution`,
`zapier-integration-page-seo-distribution`)는 모두 팀 규모가 큰 회사였다 — 큐 메모의 "매칭 성립에 3곳
필요"를 채우려면 **완전히 다른 브랜드**, 그리고 가능하면 "1인 창업가가 그대로 옮길 수 있는" 채널
확보 사례가 필요하다고 판단했다.

후보 비교:

- **Marc Lou / ShipFast**: 트위터 빌드인퍼블릭으로 유명하지만, 창업자 인터뷰에서 관측→추론→결정의
  사고 흐름을 1차 출처로 뚜렷하게 찾기가 어려웠다(단편적 트윗 인용뿐). 시간 제약상 후순위로 미룸.
- **Testimonial.to (Damon Chen)**: 본인이 인디해커스 론칭 글·블로그·AMA 에 매 단계를 직접 1인칭으로
  적어 둬서 "관측→결정" 흐름과 구체 수치(매출, 팔로워)가 모두 1차 자기보고 출처로 확인됐다.
  이미 적립된 슬러그(`convertkit-concierge-migration-conversion` 등)와도 브랜드가 겹치지 않는다. **채택.**

대상을 중간에 바꾸지 않았다. Testimonial.to 하나만 조사했다.

## 2. 찾은 것

### 독자 축

- `reader_problem = NO_CHANNEL` ("팔 통로가 없다") — 제품은 만들었는데(4개 프로젝트 실패,
  5번째로 완성) 어디에 내놓을지 몰랐던 상태와 정확히 대응한다.
- `transfer_note` 2건: (1) 유료 고객이 없어도 "평생이용권"으로 Product Hunt 에 먼저 올리기,
  (2) 매출 숫자를 트위터에 매주 공개하기. 둘 다 하루 안에 시작할 수 있는 크기로 줄였다.

### 사고의 흐름 (당사자 1인칭 — 요구사항 충족, 2건 이상)

1차 자기보고 출처 3건을 직접 열었다:

1. **인디해커스 론칭 글**(2020-12, `indiehackers.com/product/testimonial/...`) — "2 days ago,
   I launched it on Product Hunt. It's my best launch ever" / "$199... Only 100 seats available" /
   "The launch brought me $1,600 in just one day. Now it crossed $2,000 in revenue." 같은 글 댓글에서
   "실제 구매자는 9명인데 표시는 72명으로 부풀렸다"고 스스로 인정 — **관측**(초기 반응이 좋다) →
   **결정**(정기구독 대신 평생이용권으로 먼저 현금·피드백 확보)의 흐름이 그대로 남아 있다.
2. **자사 블로그 "One year of indie hacking"**(2021-05-02) — "I could never imagine I can grow my
   Twitter follower from 70 last year to 7000." 빌드인퍼블릭을 계속한 **결과**를 스스로 기록.
3. **인디해커스 AMA**(2021-10-05, "Hit $100K ARR after 9 months") — "the first paying customer is
   from Twitter, and he bought the LTD." / "So far it's Twitter, then the SEO, then the affiliate
   program." — 트위터 활동이 실제 채널 순위 1위로 이어졌다는 **관측**을 스스로 공개.

### 수치

| 사건 | 지표 | 이전 | 이후 | 출처 |
|---|---|---|---|---|
| 2020-12 PH 론칭 | 누적 매출(수일) | $0 | $2,000+ | indiehackers.com 론칭 글 (자기보고) |
| ~2020~2021-05 | 트위터 팔로워 | 70명 | 7,000명 | testimonial.to 블로그 (자기보고) |

무브 0(PH 론칭 매출)·무브 1(팔로워 수) 모두 자기보고 1차 출처뿐이라 **사실확인 등급은 C**
(`node scripts/case-research.mjs validate` 출력 그대로: "자기보고 1차뿐 — 다른 원 관측 없음").
다만 독자 인사이트 등급(구체적 행동+전제+근거)은 두 무브 모두 **A** — 이 조사의 목표는
등급 A 가 아니라 "옮길 수 있는 무브"였고, 그 기준은 채웠다.

### 자기보고 외 확인 (§7.1 — 확인 불가를 양성으로 접지 않기)

- `testimonial.to` 를 2026-09-23 직접 조회 → "Start for Free" 가입 버튼, "5만 개 이상 기업 사용"
  문구, Ultimate/Ultimate+ 플랜명(2021년 AMA 에서 언급된 Premium/Ultimate 플랜과 이름이 이어짐)
  확인 — **실제 운영 중인 서비스**. `outcome_status=active`의 근거이나, 이것은 "지금 접속되고
  가입을 받는다"는 확인이지 현재 매출 규모까지 실측한 것은 아니다.
- WebSearch 로 "2026년에도 활동 중"이라는 정황(LinkedIn 신규 기능 게시물, Similarweb 추정
  트래픽)을 찾았으나, 이건 검색 요약이지 개별 URL 을 직접 열어 재확인한 것은 아니다 —
  `the-seo-autopilot.com` 케이스 스터디 페이지를 직접 열어 재확인하려 했으나 **403 Forbidden 으로
  확인 실패**. 이 정황들은 초안 evidence 에 넣지 않았다(확인 불가를 양성으로 접지 않기 위해).
  `outcome_status=active` 판단은 오직 위 홈페이지 직접 조회 1건에 근거한다.

## 3. 못 찾은 것 — 확인 불가

- **비자기보고 수치 출처 0건.** 비상장 부트스트랩 1인 기업이라 공시가 없다. 3차 매체
  (creatoreconomy.so, the-seo-autopilot.com 등)는 모두 창업자 발언·트윗을 받아쓴 것이라 채택하지
  않았다(같은 관측을 옮겨 적은 것은 독립 확인이 아니다).
- **PH 론칭의 정확한 날짜**: "2 days ago"라는 표현과 게시 메타데이터로 2020-12-20 전후로만
  추정했다. 정확한 일자(±수일)는 확인하지 못했다.
- **트위터 팔로워 "70명" 시점의 정확한 날짜**: 블로그 글이 "작년(last year)"이라고만 써서
  구체 날짜가 없다. AMA(2021-10-05)의 "작년 말 기준 <1,000명"이라는 회고와 정확히 일치하지도
  않는다 — 억지로 맞추지 않고 두 수치를 evidence 에 그대로 병기했다.
- **Andrew Gazdecki 가 트윗을 보고 가입했다는 일화**: 첫 WebSearch 요약에 등장했으나, 원문
  (AMA·론칭 글)을 직접 열어 재확인했을 때 해당 이름이 나오지 않았다 — **채택하지 않음**
  (검색 요약 도구의 오류로 판단, §7.1).
- **현재(2026) 정확한 매출·팀 규모**: 홈페이지 직접 조회로는 확인 불가. 무리해서 넣지 않았다.
- `transferability`: 조사원이 정하지 않는 필드라 채우지 않음.

## 4. 어휘 관련 메모

- `reader_problem = NO_CHANNEL` — 두 무브 모두 "팔 데가 없다"는 문제와 정확히 대응.
- `bottleneck = DISTRIBUTION` — 큐 지정 목표 병목 그대로.
- `lever` 두 무브 모두 `CHANNEL` — PH 론칭과 트위터 빌드인퍼블릭 둘 다 "어디서 고객을 만나는가"의
  문제라 CHANNEL 로 통일했다. COMMUNITY 도 고려했으나, 트위터 건은 커뮤니티 참여가 아니라
  1인 창업자가 개인 계정에 공개 게시하는 형태라 CHANNEL 이 더 맞다고 판단.
- `buyer_type = B2B` — 고객은 자기 사업의 후기를 모으는 사업주(마케터·크리에이터 포함)라 B2B 로
  뒀으나, 1인 크리에이터 고객도 섞여 있어 경계가 완전히 깨끗하지는 않다.
- `price_band = LOW` — 초기 LTD $199, 구독 플랜도 SMB 대상 저가 구간.

## 5. 출처

- PH 론칭 글(1차·자기보고, 사고 흐름+수치): https://www.indiehackers.com/product/testimonial/launched-testimonial-to--MP0DZPTph1a3DCyjuah (2020-12-20 전후 추정)
- 자사 블로그 "1년 회고"(1차·자기보고, 트위터 팔로워 수치): https://testimonial.to/blog/one-year-of-indie-hacking-i-have-learned-a-lot (2021-05-02)
- 인디해커스 AMA(1차·자기보고, 채널 순위·첫 고객 서사): https://www.indiehackers.com/post/hit-100k-arr-after-9-months-grinding-as-a-solo-founder-ama-584379b1f6 (2021-10-05)
- 홈페이지 직접 조회 2026-09-23(비자기보고, 운영 상태 확인): https://testimonial.to
- 참고했으나 403으로 재확인 실패, 초안 미채택: https://the-seo-autopilot.com/en/case-studies/damon-chen
