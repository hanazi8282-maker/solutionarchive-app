# Delite — 조사 노트 (2026-11-02, 실패 사례 할당분 failure_quota)

- slug: `delite-nice-to-have-free-trials-no-prebuild-payers-wholesale-saas-shutdown`
- 초안: `drafts/cases/<slug>.json` · validate exit 0 (error 0, 경고 5: price_band 비어 있음, 두 무브 모두 수치 없음 등급 D)
- 대상 선정: 큐가 "미정"이라 직접 골랐다. 이미 적립된 slug 와 겹치지 않는 1인칭 실패 서술을 찾았다. 뒤에 쓴 후보 탈락 사유 참고.

## 독자 축
- reader_problem: `NO_FIRST_CUSTOMER` (만들어 놨는데 아무도 돈을 안 냈다). 어휘에 맞는 코드가 있었다.
- 무브 1 (OFFER, negative): transfer_note = 내일 관심 보인 5명에게 "월 얼마면 오늘 첫 달 결제까지 하겠나"를 묻고 '써 보겠다'/'결제하겠다'를 나눠 기록.
- 무브 2 (ONBOARDING, negative): transfer_note = 내일 첫 고객 후보 3명에게 지금 쓰는 주문·요청 방식의 실물을 보여 달라 하고, 우리 제품으로 갈아타려면 뭘 바꿔야 하는지 적는다.
- 병목: CONVERSION. 무브 2건, 둘 다 등급 D(수치 없음), 근거 9건.

## 사고의 흐름 (1인칭, 3.5번)
- 출처: Pat Walls 본인의 Failory 인터뷰(2018-03-17), `failory.com/interview/delite`.
- 관찰 → 추론: 가입·온보딩 뒤 사용이 낮았다 → 고객이 "해야 하는 건 알지만 미뤄도 되는 일"로 여겼다 → "nice-to-have" 결론 → 교훈: "만들기 전에 돈 낼 고객 5~10곳, $50 가치면 $100".
- 팟캐스트(2020-05-18)는 제3자 요약 페이지(smashnotes)로만 읽었다. "nobody used Delite", "decided to start smaller" 취지. 원 오디오·전사는 직접 못 열었다 → 1건(인터뷰)이 1인칭 근거의 전부다.

## 확인 방식과 한계 (§7.1)
- 인용 snippet 은 WebFetch 에 "원문 그대로" 요청해 받은 문장이다. 요약 모델을 거친 것이라 글자 단위 일치까지는 보장 못 한다. 사람이 승인할 때 failory 원문과 한 번 대조해야 한다.
- 근거는 사실상 독립 관측 2개다: 인터뷰(`failory-delite-interview-2018-03`)와 팟캐스트 요약(`failory-podcast-pat-walls-2020-05`). 나머지 7줄은 같은 인터뷰다.
- 사전 고객 검증이 있었는지: 인터뷰에 서술이 **없다**(NOT FOUND). "없었다"는 확정이 아니다. 팟캐스트 요약은 "관심을 보인 잠재고객에게 물어봤다"는 취지로 읽히는 문장이 있어 서로 어긋날 수 있다. 초안은 "서술이 없다"까지만 적었다.
- **못 찾은 것(확인 불가)**: 구독 가격, 매출, 결제 고객 수, 무료 체험이었는지 여부, 셧다운 정확한 날짜(2017-04 는 YC 탈락 시기에서 잡은 월 단위 추정), 각 무브의 수치. 그래서 `price_band` 를 비웠다.
- outcome_status=shutdown. 사이트·서비스가 지금 없는지는 직접 확인하지 않았다(인터뷰가 폐업을 서술한다).
- 소재 한계: 2016~17 사건이고 팀이 본업이 있는 파트타임 3인이다. 독자(만들 줄 아는 1인 창업가)가 옮길 수 있는 부분은 "사전 결제 약속 확인"과 "도입 마찰 점검" 두 가지로 좁혔다. YC 탈락은 옮길 수 없어 무브에서 뺐다.

## VOC
- VOC 해당 없음. 색인에 Delite·도매 주문서 프로젝트가 없다. SaaS 창업가 페인 VOC(NO_FIRST_CUSTOMER 등)는 일반 HN 댓글이고, 이 무브의 주장(결제 약속 없는 체험 고객, 도입 마찰)을 직접 받치는 문장을 키워드 검색(nice-to-have, free trial, pre-sell, before building 등)으로 찾지 못했다. 억지로 붙이지 않았다.

## 탈락한 후보 (왜 안 골랐나)
- Voiczy(Polder, 유료 11곳 전원 이탈): 원문이 403 으로 안 열렸다 → 1인칭 근거 확인 불가, 건너뜀. 다음 라운드 후보로 남긴다.
- LeaderBird(트위터 의존): 403, 같은 이유. 이미 meerkat/gummysearch 계열이 적립돼 있다.
- SimpleDirect(George Pu): 같은 저자의 두 글이 제품 설명(대출 중개 vs AI 래퍼 SaaS)과 날짜가 서로 어긋나고 사후 "clarification" 이 붙어 있다 → 신뢰할 수 없어 제외.
- Lutains(2026-10-27), Elliot Bonneville HN(2020): 수치·검증 정보가 얇아 이번엔 제외.
- Juttu·Tali·Cydoc·College Conductor·GrowRecruit 는 이미 적립됨.

## 겹침 주의
- `juttu-nice-to-have-pricing-collapse`(가격이 '있으면 좋은' 문제에 비쌌다), `baremetrics-intros-verbal-validation-zero-paid`(말로만 한 검증)와 교훈이 가깝다. 차이는 Delite 가 "무료/체험성 '써 보겠다' 고객 5~10곳이 있었는데 사용이 안 붙은" 사례이고, 도입 마찰(업무 방식 변경·수동 안내)이 따로 한 축이라는 점이다. 승인 단계에서 중복으로 판단하면 무브 2(ONBOARDING)만 살려도 된다.
