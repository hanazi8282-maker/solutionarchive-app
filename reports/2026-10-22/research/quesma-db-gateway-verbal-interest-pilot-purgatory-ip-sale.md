# Quesma (데이터베이스 게이트웨이) — 조사 노트 2026-10-22

큐 사유: failure_quota (실패·피벗·철수). outcome_direction: 무브 2개 negative, 1개 mixed(IP 매각으로 정리). 억지로 positive 로 돌리지 않았다.

## 대상 선정
- "미정" → WebSearch 로 직접 선정. 처음 후보 Voiczy(1인 SaaS, 유료 11명 전원 이탈)는 **원문(polder.substack.com) 이 403 으로 안 열려** 포기. 검색 요약만으로는 수치·경위를 확인할 수 없고, 요약끼리도 어긋났다(확인 불가). 우회하지 않았다.
- 대안으로 Quesma 선택. 피하라는 slug 목록에 없음. baremetrics-intros-verbal-validation-zero-paid 와 "말로만 관심" 주제가 겹치므로, 이 케이스의 중심 무브는 **비용 절감 포지셔닝 vs 새 매출**, **PMF 전 컨퍼런스**, **기능이냐 제품이냐/파트너 매각**으로 잡았다. 행동 검증 교훈(lesson #3)은 무브 2의 한 문장과 근거로만 둔다.

## 독자 축
- reader_problem: NO_FIRST_CUSTOMER (유료 첫 고객이 파트너 한 곳뿐). 어휘에 딱 맞는 "기업 구매에서 우선순위가 밀린다"는 없음 — 억지 매핑 아님, NO_FIRST_CUSTOMER 가 가장 가깝다고 판단.
- bottleneck: CONVERSION.
- transfer_note: 무브마다 하루 안에 끝나는 질문/요청 1개 (통화 질문 하나, 관심 표한 3명에게 5분짜리 행동 요청, 유료 고객에게 "어떤 거래를 얻었나" 질문).

## 1인칭 출처 (사고의 흐름)
- 창업자 Jacek Migdal 의 사후 분석 블로그 (quesma.com/blog/database-gateway-postmortem, 2025-11-04) — 열어 읽음(WebFetch 3회, 내용 일관).
- 관찰→추론: "말로 관심 있는 사람에서 실제 돌려 본 사람으로 가면 큰 하락" + "잃은 거래에서 보통 12위 우선순위" → "우리는 상위 5위 안에 든 적이 없다, 긴박함이 없었다" → 보드에 피벗 제안 → IP 자산 매각으로 runway 확보.

## 확인한 것
- 80+ 고객 발굴 통화 / 정기 사용 약 20곳(대부분 무료) / 12위 우선순위 / MVP 5개월 계획→9개월 / 교훈 3·4·5·6 문구 / "Hydrolix 에 IP 자산 매각".
- 2025-09-25 Hydrolix 보도자료(StorageNewsletter 전재): IP 매입, Quesma 가 지원 중단 의사를 통보. 보도자료는 상대사 발표라 자기보고로 표기, secondary.

## 못 찾은 것 (확인 불가)
- 매출·ARR·가격: 블로그에 없음. 최대 거래는 글에서 six-figure ARR(10만 달러 이상)라고만 하고 정확한 금액은 미공개. 수치 없는 무브라 등급 D(수치 없음) 로 저장됨 — 정상.
- 첫 유료 고객 Hydrolix 의 정확한 유료 금액/계약 형태: 확인 불가.
- 초기 도구 요약에서 나온 "Hydrolix 2024 8배 성장·$80M Series C" 는 블로그 원문에서 한 번만 확인했고 별도 독립 출처로 교차 확인 안 함 → 초안에 넣지 않음.
- 요약 단계에서 "IP 매각 2025-01" 이라는 값이 나왔으나 블로그(2025-11-04)·보도자료(2025-09-25)와 모순 → 버리고 2025-09 만 사용. (공동창업자 이탈 시점 2025-01 도 단일 출처라 초안에 넣지 않음.)
- 현재 Quesma 회사 상태(피벗 후 사업): 제3자 프로필이 "AI 에이전트"라 하나 1차 확인 못 함. outcome_status='pivoted' 는 블로그의 "I told the board that we should pivot" 에 근거, 피벗 후 현황은 unknown.
- period_start: 블로그만으로 창업 시점 확인 못 함 → 비워 둠.
- 펀딩: 블로그 $2.5M, tech.eu 보도는 $2.3M pre-seed(2023-12) — 어느 쪽도 evidence 로 넣지 않음.

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에서 Quesma/DB 게이트웨이/B2B 개발자 인프라 프로젝트를 찾지 못함(SaaS 창업가 페인 VOC 프로젝트들은 일반 주제라 이 무브를 실제로 받치는 목소리인지 확인하지 않았고 억지로 붙이지 않음). `voc_inputs` 는 전 무브 빈 배열.

## 이식성 주의 (자체 평가, 판정 아님)
- 사례는 시드 투자 6명 팀·기업 영업이라 1인 창업가와 규모가 다르다. 그래서 transfer_note 는 투자·팀 없이 가능한 질문/요청으로 줄였고 preconditions 에 "기업 구매 결정자가 따로 있다"는 차이를 적었다. 이식성(HIGH/MEDIUM/LOW) 은 쓰지 않았다.

## 검사
- `node scripts/case-research.mjs validate --slug quesma-db-gateway-verbal-interest-pilot-purgatory-ip-sale` exit 0 (error 0, 경고: 수치 없음 D 등급 3건 — 의도됨).
