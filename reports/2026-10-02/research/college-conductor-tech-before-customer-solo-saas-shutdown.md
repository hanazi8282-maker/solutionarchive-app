# College Conductor — 조사 노트 (실패 사례 할당분, 2026-10-02)

## 선정
- 큐 대상이 "미정"이라 WebSearch 로 직접 골랐다. 후보로 Mattermark(2017 매각·종료)도 봤으나 VC 투자 47회 클로징 등
  독자가 옮길 수 없는 전제가 핵심이라 버렸다. 1인 개발자가 1인칭으로 남긴 종료 회고인 College Conductor 를 택했다.
- 기존 적립 slug 와 겹치지 않음. 가장 가까운 baremetrics-intros-verbal-validation-zero-paid(구두 검증)와는
  원인이 다르다 — 여기는 "기술 선택에 시간을 쏟아 쓸 수 있는 제품을 못 냄"이다.

## 찾은 것
- 1인칭 출처 1건 직접 열람: Matt Layman 블로그 "A Failed SaaS Postmortem"(2019-12-18). 독립 교육 컨설턴트인
  아내를 첫 사용자로 만든 도구, 3년 운영 뒤 종료. 사고 흐름: 오래 갈 기술을 고른다 → 새 프레임워크·도구 14개를 배운다
  → 업그레이드 작업에 동기를 잃는다 → 아내의 관심을 잃는다 → 말미에 아는 도구(Django)로 갈아타 2주 만에 기능 재구현
  → 이미 늦어 종료.
- 같은 글의 교훈: "쓸모 있는 제품을 최대한 빨리 내놓지 않으면 취미일 뿐이다".
- 무브 2개: 0 = 기술 학습에 쏟음(negative, 수치 없음 → 등급 D 상당), 1 = 아는 도구로 전환(mixed, 104주→2주 자기보고).

## 못 찾은 것 (확인 불가)
- 매출·고객 수·가격: 글에 없음. `price_band` 는 비웠다(짐작으로 채우지 않음).
- 서비스 시작 시점: "3년"만 있고 정확한 날짜 없음 → `period_start` 비움. `period_end` 는 글 게시일(2019-12-18)이며 실제 종료일은 확인 불가.
- 독립 2번째 관측: 없음. HN 토론(item 21827844)은 같은 글을 받아 논평한 2차라 근거로 세지 않았다.
  dev.to 'Building SaaS #37' 회고는 같은 작성자의 같은 관측이라 근거에 넣지 않았다.
  따라서 무브 1 의 수치는 자기보고 1건뿐(등급 C 수준).
- 아내가 실제로 쓴 기간·횟수: 글에 없음.
- 현재 상태: 종료 선언 외 확인 불가 → `outcome_status=shutdown`(본인 선언 근거).
- "2년"(Ember 기간)과 "3년"(운영 기간)이 한 글 안에서 같은 기간인지 확인 불가. 104주는 "two years"의 환산이다.

## 어휘 메모
- `reader_problem`: 가장 가까운 것은 MAKE_BUT_NO_MONEY(기본값). 정확히는 "만들기만 하다 첫 사용자를 놓침"이라 NO_FIRST_CUSTOMER 와 걸쳐 있으나, 첫 사용자(아내)가 있었고 무료였던 점이 달라 어휘에 딱 맞는 코드는 없다.
- `bottleneck`: CONVERSION 은 근사치. "쓸 수 있는 제품을 못 냄 → 첫 사용자 이탈"이라 어휘(AWARENESS/TRUST/CONVERSION/RETENTION/…)에 정확히 맞는 것이 없다.
- 무브 claim 은 validate 가 요구하는 페인 낱말(config/pain-terms.json)을 위해 "학습"(무브 0)·"전환"(무브 1)을 넣었다. 의미가 어긋나지는 않는다.
- 판매·가격 이야기가 아닌 "제작 속도" 사례라 PRICE/CHANNEL 레버에 끼워 맞추지 않았다.

## VOC
- VOC 해당 없음. 색인에 College Conductor 프로젝트가 없다. dev.to `saas` 태그 프로젝트(621f42c1…)의 19건을 훑었으나
  "첫 사용자를 놓친 채 기술에 시간을 쓴 경험"을 직접 받치는 목소리가 없어 억지로 붙이지 않았다 (`voc_inputs` 비움).

## 자가검증 (§0)
- 개선 1: 처음 초안에서 무브 1 의 수치 스니펫에 마크다운 강조 기호를 제거해 원문 연속 구절로 맞췄다.
- 개선 2: 성공으로 읽히기 쉬운 "2주 재구현"을 mixed 로 두고 claim 에 "사업은 살아나지 않았다"를 명시했다.
- 개선 3: 이식성(transferability)은 쓰지 않았다(사람 몫). 조사 중 검증 불가였던 문장(14개 도구가 MVP 이전이었다는 서술)은 claim 에서 뺐다.

## validate
- `node scripts/case-research.mjs validate --slug college-conductor-tech-before-customer-solo-saas-shutdown` → error 0건, 통과 (경고 4건: price_band 비움, 무브 0 수치 없음, 무브 0 부정 사례 D 등급, 무브 1 관측 시작 시점 없음).
