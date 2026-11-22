# Rise Calendar — 조사 노트 (2026-11-21, 실패 사례 할당분)

- slug: `rise-calendar-flexible-events-auto-reschedule-users-disabled-vc-death-zone-wind-down`
- 큐: failure_quota · 대상 "미정" → WebSearch 로 직접 선정
- validate: exit 0 (error 0, 경고 7 — 아래)

## 선정 경위
- 후보로 본 것: Voiczy(Substack, 유료 11명 전원 이탈) — 원문 URL 이 WebFetch 404 라 **확인 불가**, 버림.
  Pinkary(Nuno Maduro) — 수익 문제가 아니라 후속 제품(devnull) 통합이라 독자 문제와 안 맞아 제외.
  Codeanywhere — 팀 규모·수치·시도 모두 공개 안 됨, 1인칭 사고 흐름 없음. Cydoc·Content Goblin·Juttu 등은 이미 적립됨.
- Rise 를 고른 이유: 창업자 1인칭 폐업 글(2025-01-27)에 관찰→결정 흐름이 있고 미적립.

## 독자 축
- reader_problem: MAKE_BUT_NO_MONEY (어휘에 정확히 맞는 코드 없음 — "써 보는 사람은 느는데 돈 내는 팀이 안 느는" 상태는 이 코드가 가장 가깝다. 어휘에 `ADOPTION_NOT_PAYMENT` 류가 없다는 점을 기록)
- bottleneck: CONVERSION
- 주의: Rise 는 VC 투자 6인 팀이라 1인 창업가 맥락과 다르다. 그래서 무브 3건 모두 "VC·팀 규모와 무관하게 내일 할 수 있는 점검"으로만 transfer_note 를 썼고, VC 80곳 거절(death zone)은 옮길 수 없는 사실이라 무브로 만들지 않았다.

## 1인칭 사고 흐름 (3.5)
- 출처: Rick Pastoor, "Sunsetting Rise", risecalendar.com 2025-01-27 (직접 열어 확인, 문장은 verbatim 재요청으로 대조).
- 관찰: Flexible Events 를 사용자가 시간이 지나며 꺼 버림 → 추론: 일정 변경이 '개선'이 아니라 '혼란'으로 읽힘 → 결정: 2023 Q4 기능 종료.
- 관찰: 이벤트 제목 `[]` → 체크박스 변환을 사용자가 쓰는 것을 봄 → 결정: 2024 프로젝트·태스크 방향, 만들기 전에 바꿔 쓸 팀을 먼저 모음.
- 관찰: 약 900팀이 써 봤으나 유료 전환은 소수 → 계산: 활성 사용자 수천 명이 전부 내도 엔지니어 4명 비용 미달.

## 무브 3건 (등급은 코드 산정, 손으로 정하지 않음)
- 무브 0 PRODUCT_FEATURE / negative — 자동 일정 변경 기능을 사용자가 끔. transfer_note: 자동으로 바꾸는 기능을 켠 사용자 중 아직 켜 둔 수를 세거나 5명에게 물어라.
- 무브 1 PRODUCT_FEATURE / mixed — 사용자 변칙 사용 관찰, 사전 약속 후 개발, 유지율 2배지만 결제는 소수. transfer_note: 변칙 사용 3개 뽑고 5명에게 "바꿔서 돈도 내겠나" 물어라.
- 무브 2 PRICING / negative — 전원 유료여도 비용 미달이라는 계산. transfer_note: 활성 사용자 전부가 낸다면 월 합계 ÷ 고정비 한 줄 계산.
- 세 무브 모두 수치 근거가 없어 사실확인 D(코드 판정 C/D). 수치를 지어 넣지 않았다. 유지율 "두 배"는 기준 숫자가 없어 metric 으로 쓰지 않았다.

## 못 찾은 것 (확인 불가)
- Rise 의 가격표·요금 — 글에 없음 → price_band 비움(validate 경고, 검색 매칭 축이라 사람이 보완 필요).
- Flexible Events 를 끈 사용자 수·비율, 유료 팀 정확한 수, 월 매출·번레이트 — 확인 불가.
- "월 약 30% 유료 팀 성장"은 분모가 매우 작음(소수 유료 팀)이라 해석하지 않았고 무브 서술에만 괄호로 단서를 달았다.
- Friendly Flex 가 효과 없었다는 부분과 2023 Q4 종료 시점: 첫 번째 WebFetch 요약에서 확인, 문장 단위 verbatim 대조는 못 했다 → evidence 스니펫으로 쓰지 않았고 claim 에 서술로만 있다.
- 폐업 이행 여부(2025-03-31 서비스 종료): Rise 글 + 검색 결과(App Store 공지 언급)로 확인, App Store 페이지 직접 열람은 안 함. outcome_status=shutdown.
- TechCrunch 원문 URL 은 직접 열지 못했고 Yahoo 재게재본(2022-01-28)을 열어 확인했다. 그래서 증거는 Yahoo URL. 투자액은 TechCrunch/Yahoo $3M vs 자사 글 €2.5M(통화 차이로 추정, 확인 안 함) — summary 에 둘 다 적음.
- 독립 2차 출처는 없다. 9건 근거 중 8건이 같은 원 관측(자사 글, observation_key 하나)이다 — 등급이 높게 나올 수 없는 구조.

## VOC
- VOC 해당 없음. 색인(`ops/state/voc-inputs/index.md`) 1~368행 확인 — 캘린더·팀 일정 도구인 Rise 와 같은 제품 프로젝트가 없다. Calendly·Cal.com 등은 일정 예약 도구라 무브의 주장(자동 일정 변경 기능의 이탈, 프로젝트 방향 전환)을 받치지 않아 붙이지 않았다. 색인 369행 이후(약 240행)는 읽지 않았다 — 해당 범위에 Rise 가 있는지는 **확인 불가**. `voc_inputs` 전부 빈 배열.

## 진행 판단 절차(원칙 §0) 요약
- 검토: 관찰 가능한 이식 행동이 1인 창업가 상황에 맞는지, VC 전제가 transfer_note 에 새어 들어갔는지.
- 개선: 무브 3(VC 거절) 삭제, 30% 성장 단서 추가, 확인 안 된 문장(창업자 아쉬움 서술) 삭제, 환각 위험 있는 TechCrunch URL 을 실제 열람한 Yahoo URL 로 교체.
