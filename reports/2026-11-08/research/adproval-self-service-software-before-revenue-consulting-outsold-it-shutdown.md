# Adproval 조사 노트 — 2026-11-08 (실패 사례 할당, failure_quota)

## 대상 선정
- 큐 대상이 "미정"이라 WebSearch 로 직접 골랐다. 이미 적립된 slug 와 겹치지 않는 1인·소규모 팀 SaaS 실패 사례가 조건이었다.
- 후보 중 버린 것: Voiczy(polder.substack.com, 본문 403 으로 못 읽음 — 검색 스니펫만 있어 근거로 못 씀),
  Draft(Nate Kontny, 1인칭 사후 분석 못 찾음), Sortfolio(37signals — 결국 정가에 팔려서 실패 사례가 아님),
  Muun(1인 SaaS, 경쟁에 밀림 — 유력 대안이었으나 수치가 월 MRR ~$200 하나이고 Adproval 쪽 무브가 더 옮기기 쉬워 후순위).
- Adproval 을 고른 이유: 창업가 본인 인터뷰(Failory, 2021-06-08)가 열리고, "셀프서비스 월 ~$200 대 관리형 컨설팅 연 $200k+" 라는 대비가 있다.

## 독자 축
- reader_problem = MAKE_BUT_NO_MONEY (만들 줄은 아는데 돈으로 바꾸는 법을 모른다). 어휘에 있었다.
- 무브 0 (OFFER) transfer_note: 도구가 해 주는 일을 소프트웨어 없이 내가 직접 해 주는 조건으로 아는 사람 3명에게 가격을 물어본다.
- 무브 1 (PRICING) transfer_note: 무료로 쓰는 사람 중 가장 많이 쓰는 1명에게 월 얼마면 계속 쓸지 직접 묻는다.
- 두 무브 모두 outcome_direction=negative. 창업가가 실제로 한 일이 아니라 사후 반성에서 끌어낸 "이렇게 했어야" 행동이며, preconditions 에 그 사실을 적었다.

## 사고의 흐름 (1인칭 출처)
- 출처: https://www.failory.com/interview/adproval (창업가 Matthew Anderson, 2021-06-08). WebFetch 로 직접 열었다.
- 관찰: 가족 지인의 라이프스타일 블로그가 수익화에 애먹는 것을 봄 → 추론: 블로거가 직접 광고를 파는 셀프서비스 위젯이 답. 교수의 조언으로 컨설팅이 아닌 확장 가능한 소프트웨어 쪽으로 감.
- 결과: 블로거 10% 수수료만, 광고주 초기 무료. 셀프서비스 수입 월 최대 ~$200. 마지막 해에 관리형 컨설팅으로 연 $200k+. 창업가는 이것을 처음부터 했어야 할 일이라 회고.
- 종료: 약 6년 뒤(대략 2017) 번아웃·우울·불안으로 접음. 투자자 반응은 호의적이었다고 함.

## 근거 구조
- 근거 2건 모두 같은 인터뷰(observation_key 동일, 원 관측 1개). primary + 자기보고. 외부 독립 확인 없음.
- 수치(월 ~$200, 연 $200k+, $300k 조달, 외주 시급, 월급)는 전부 창업가 자기보고이고, 인터뷰 요약 도구(WebFetch)를 거쳐 읽은 것이다. 원문 직접 대조는 못 했다.
- 그래서 등급 D(수치 없음 판정)로 저장되는 것이 정상이다. metric 필드는 단위·기간이 서로 달라 비교 수치로 넣지 않았다.

## 못 찾은 것 (확인 불가)
- 정확한 폐업 시점: 인터뷰는 "약 6년 후"이고 Failory 목록은 2011~2017. period_start/period_end 는 비웠다.
- 컨설팅 고객이 어디서 왔는지(기존 사용자인지 신규인지), 컨설팅 단가 — 인터뷰 요약에 없다.
- 셀프서비스 가입자·광고주 실수. Powderkeg(2013-10-09, secondary)는 "공개 베타 5개월에 300+ 고객"이라고 하나 무엇을 센 것인지 불명이고 Failory 요약과 맞는지 확인하지 못해 근거에 넣지 않았다.
- 현재 서비스 상태: 폐업(shutdown)이 창업가 진술이다. 도메인 현재 상태는 확인하지 않았다.
- Anderson 의 개인 블로그·팟캐스트 등 두 번째 1인칭 출처는 찾지 못했다.

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에서 SaaS 창업가 페인 프로젝트(MAKE_BUT_NO_MONEY, NO_FIRST_CUSTOMER, NO_CHANNEL 등)의 `consult|manual|concierge|self-serve|polish` 등을 검색했으나, 이 무브(손 서비스 먼저, 수수료 구조)를 받치는 목소리가 없었다. 억지로 붙이지 않았다.

## 어휘·검사 메모
- business_model 에 맞는 값이 없어 OTHER(2면 시장 + 수수료 위젯). buyer_type B2B.
- 첫 validate 가 move 0 claim 에 페인 낱말이 없어 error 로 막았다(config/pain-terms.json). "유료 수입"을 넣어 통과시켰다 — 낱말 규칙에 맞춘 문장이지 내용을 바꾼 게 아니다.
- 이식성(transferability)은 쓰지 않았다. 사람이 승인할 때 고른다.
- validate exit 0 (error 0, 경고 4: 수치 없음·부정 사례 D 등급).
