# CodeParrot — 조사 노트 (실패 사례 할당분, 2026-11-12)

## 결론 (3줄)
- 실패·철수 사례. outcome_status=shutdown, 무브 2건 모두 outcome_direction=negative. 교훈을 positive 로 돌리지 않았다.
- 사실확인 등급: 무브0 = C(자기보고 1차 + 2차 보도가 전부 같은 창업자 글 하나), 무브1 = D(수치 없음, 제3자 분석). 사내 참고용이고 발행 불가 후보다.
- validate: error 0건, 통과(exit 0 확인).

## 선정 이유
대상 "미정" → WebSearch 로 선택. 1인·소규모 팀 SaaS 중 적립 목록에 없는 것. 공동창업자 2명, YC W23, 개발자 도구. 큐가 요구한 "실패·피벗·철수"에 맞는다. 단, 팀이 2명이고 YC·50만 달러 조달이 있어 **1인 창업가와 조건이 다르다** — preconditions 에 명시했다.
(후보에서 뺀 것: Nicolaas Spivey 의 영상 후기 SaaS — 수치 거의 없고 이미 적립된 testimonial/nice-to-have 계열과 겹침. Voiczy — polder.substack 403 으로 원문을 못 열었다.)

## 찾은 것
- 첫 제품: 프로덕션 트래픽·DB 상태로 API 테스트 자동 생성. Launch HN 2023-03-17, 127점(HN API 로 직접 확인). YC 런치 페이지에 가격·성과 수치 없음. HN 글에 "가격 TBD".
- Launch HN 댓글의 이의 제기: 개인정보·PCI 데이터 처리, 오탐(false positive), 샘플링 편향, 상태 있는 API. 창업자가 이것 때문에 방향을 바꿨다는 근거는 **없다** — 연결하지 않았다.
- 이후: Figma→코드 VS Code 확장(React/Flutter/HTML), 마지막은 LLM 기반 Figma→코드. Failory 는 성능 대시보드·API 자동화 기능·오픈소스 출시 계획도 시도했다고 적는다(2차).
- 창업자(Vedant Agarwala) 종료 글 인용(2차 보도 3건이 같은 글을 인용): "didn't raise on Demo Day… stuck in pivot hell", "$500k burned", MRR 1,500달러, 엔지니어 2명 고용 후 해고.
- Failory(2025-07-24) 분석: "never cracked the channel", Vercel v0·Figma Make 가 같은 기능을 내장. 이건 **외부 진단**이다.

## 못 찾은 것 (확인 불가)
- **1인칭 종료 글 원문 확인 불가.** LinkedIn 원문을 열지 못했다(검색에 안 걸림). 사고의 흐름은 Launch HN(창업자가 직접 쓴 출시 글: 직전 직장에서 수동 테스트가 확장이 안 되는 문제를 겪었다는 동기)과 2차 보도의 인용 문장으로만 채웠다. 방향을 바꾼 **이유**(API 테스트 → Figma)는 확인 불가 — claim 에 적지 않았다.
- 바꿀 때마다 쓴 기준·중단 기준이 있었는지 확인 불가(claim·transfer_note 에 그렇게 적음).
- 조달액: 50만 달러(Entrepreneur·StartupTalky·Failory·CEOVine) vs Extruct 는 YC·Team Ignite 에서 12만 5천 달러로 적음. 다수 쪽을 썼지만 불일치를 여기 남긴다.
- 종료일: CEOVine 은 2025-07-19 발표, 다른 곳은 2025-07. period_end 는 2025-07-31(월 단위 근사).
- 가격·요금제 확인 불가 → price_band 비움(validate 경고).
- 2차 보도 3건(Entrepreneur, StartupTalky, Startuppedia)의 게시일 확인 불가 → published_at 비움. 셋은 **원 관측 1개**(창업자 LinkedIn 글)로 세어 observation_key 를 같게 했다.
- 엔지니어 인원 충돌: 창업자 인용은 "고용했다가 둘 다 해고", CEOVine 은 "종료 시점에 엔지니어 2명". 창업자 인용을 따랐고 별도 무브로 세우지 않았다.
- CEOVine 은 "Udaan·Freshworks·Capgemini·Infosys 개발자 사용"이라고 적는다(3차). 사용이 유료였는지 확인 불가라 무브·근거에 쓰지 않았다.
- ycombinator.fyi 는 자체가 풍자 프로젝트라고 밝혀 근거로 쓰지 않았다(그 페이지의 날짜 등).

## 독자·어휘
- reader_problem=MAKE_BUT_NO_MONEY (기본 독자 어휘). NO_CHANNEL 도 후보였지만 그 진단은 외부 분석이라 1순위로 올리지 않았다. 어휘에 딱 맞는 코드("피벗을 반복하며 기준 없이 돈이 닳는다")는 없다 — 억지로 끼워 맞춘 부분이 있음.
- bottleneck=DISTRIBUTION 은 Failory 의 외부 진단에서 온 **추론**이다. 창업자는 병목을 지목하지 않았다.

## 이식성 메모 (참고)
- 이식성 필드는 쓰지 않았다(사람이 승인 때 고름).
- 2명 팀·YC·50만 달러 맥락이라 1인 창업가가 그대로 옮길 수 없다. transfer_note 는 CodeParrot 의 행동이 아니라 그 **부재**를 메우는 독자 쪽 행동(기준 숫자 적기, 이미 쓰는 화면 목록)으로 적었다. 이 점을 승인 때 고려해 주길 바란다.

## VOC
VOC 해당 없음. 색인에서 SaaS 창업가 페인 프로젝트(NO_CHANNEL, MAKE_BUT_NO_MONEY, NO_FIRST_CUSTOMER 등)를 확인했고 "pivot" 을 포함한 항목을 검색했지만, 무브의 주장을 구체적으로 받치는 목소리가 없었다(일반적 창업 고충 글이거나 다른 사례). voc_inputs 는 비웠다.

## 개선점 검토 (_principles §0)
- 개선 1: 처음에 무브 3개(가격 미정 출시, 엔지니어 해고 포함)를 만들려 했으나 결과와의 연결이 근거 없어 뺐다. 억지로 교훈을 만든 것이기 때문.
- 개선 2: 무브0 claim 에서 "이유"를 단정하던 문장을 "확인되지 않는다"로 고쳤다.
- 남은 약점: 근거의 원 관측이 사실상 1개(창업자 글)이고 그 원문을 직접 못 열었다. 오케스트레이터가 원문 확보 시 등급이 오를 수 있다.
