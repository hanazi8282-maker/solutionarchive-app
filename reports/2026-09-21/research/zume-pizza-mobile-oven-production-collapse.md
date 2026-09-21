# 조사 노트 — Zume (zume-pizza-mobile-oven-production-collapse)

큐 사유: `failure_quota` / 목표 병목: `SUPPLY` / outcome_direction: `negative` (실패·피벗·철수 할당분, 성공 사례로 대체하지 않음)

## 왜 Zume

대상이 "미정"이라 WebSearch로 직접 정했다. SUPPLY(§ "물건이 없음" — 제품을 안정적으로 만들어 낼
공정 자체가 안 되는 상태) 병목에 해당하는 실패 사례를 찾다가 Zume(2015년 창업, 로봇이 만들고
이동 중인 밴 오븐에서 굽는 피자 배달 → 2020년 퇴비화 포장재로 전량 피벗 → 2023년 6월 완전 폐업)
을 골랐다. 이미 적립된 슬러그 목록에는 없다 — 단, `config/pain-terms.json`
`legacy_case_keys`(구 `failed_angles` 원장, 다른 테이블)에 `zume-robot-fresh-delivery`가 있다.
같은 브랜드지만 다른 파이프라인·다른 슬러그라 충돌이 아니다 (grep으로 `drafts/cases`·`reports`
전체 확인, 신규 draft 슬러그와 겹치지 않음).

## 독자 축 (선정 1순위)

- **reader_problem = MAKE_BUT_NO_MONEY.** 정확히 들어맞는 코드가 없었다 — Zume은 "만드는 법을
  몰라서" 실패한 게 아니라 "핵심 공정이 안정적으로 되는지 확인하기 전에 사업을 일반화해서
  키웠다"는 쪽에 가깝다. `config/reader-problems.json` 7개 중 가장 가까운 게 이거였고,
  파일 자체가 "다른 어휘가 애매하면 여기로 둔다"고 명시한 1급 시민이라 이걸 썼다.
  `docs/case-study-pipeline-design.md` §9-3의 참고표는 SUPPLY→SOLO_CEILING을 제안하지만,
  그건 "혼자 감당 못 하는 주문량" 얘기라 대형 VC 스타트업인 Zume에는 안 맞는다고 판단해 쓰지 않았다.
- 브랜드가 대형(누적 투자 $4억+)이라 독자가 옮길 부분을 명시했다: 두 무브 모두 "당신의 결정"으로
  치환 — (1) 시제품 하나의 성공을 일반화해서 확장 서사를 만들기 전에 반복 재현을 먼저 세어보라,
  (2) 성분·원료를 바꿀 때 이야기보다 규정 통과 여부를 먼저 확인하라.

## 사고의 흐름 (§3.5, 1인칭 출처 1건 이상)

TechCrunch가 2018년 11월 소프트뱅크 라운드를 보도하며 CEO 알렉스 가든의 1인칭 발언을 직접
인용했다: "Pizza was our prototype... There's no reason why this technology wouldn't work
for any restaurant or any food category." 이게 관측→추론→결정의 사슬이다 — **관측**(피자
사업에서 로봇·이동식 오븐 하드웨어를 돌려봤다) → **추론**(그러니 이 기술은 어떤 식당·카테고리에도
통할 것이다) → **결정**(그 일반화된 서사로 대규모 투자를 유치하고 회사 범위를 넓혔다). 이 발언이
나온 시점에도 실제로는 치즈가 이동 중 흘러내리고 로봇·오븐이 자주 고장 나는 문제(Business
Insider/The Information 경유 보도, physicsworld.com·Fast Company가 재인용)가 안 풀린 상태였다 —
즉 관측 자체가 아직 "일반화할 수 있을 만큼 안정적"이지 않았는데 추론이 앞서 나간 사례다.

## 무브 2개

1. **OPERATIONS / negative** — 핵심 생산 공정(이동식 오븐·로봇)이 안정적이라는 게 입증되지
   않은 채 "피자는 프로토타입"이라는 일반화 서사로 투자를 키웠다. 지표: 누적 투자 유치액
   $70M(2018년 11월 소프트뱅크 라운드 직전, TechCrunch 자체 취재) → $423M(2023년 6월 폐업
   시점까지 8라운드 누적, NRN 보도·추정 집계). `transfer_note`: 내일 자기 공정을 5번 반복
   테스트해서 실패율을 세어보라는 구체적 행동.
2. **PACKAGING / negative** — 2020년 포장재 사업으로 전량 전환했는데, 그 포장재에 그리스 차단용
   PFAS 성분을 써 왔다고 회사가 스스로 인정(2021년 8월, Zume·Solenis 공동 발표)했고, 마침
   샌프란시스코가 2020년부터 퇴비화 식품용기의 PFAS 성분 사용을 금지한 시점이었다. 지표:
   카마리요 포장 공장 인력 140명(2022년 11월 이전) → 31명(2023년 3월 말, CEO Annette Groenink
   확인) → 공장 폐쇄. `transfer_note`: 원료·성분을 바꾸기 전에 파는 지역 규정부터 확인하라는
   구체적 행동.

## 등급과 그 근거

두 무브 모두 독자 인사이트 등급(`gradeMove`)은 **A** — `transfer_note`·`preconditions`가
구체적이고, 사실확인 등급(D)도 아니다. 다만 사실확인 등급(`factCheckGrade`, 발행 게이트 CG-1/CG-2
전용)은 둘 다 **C**:
- 무브1: 근거 4건 중 `observation_key` 독립 1개뿐(TechCrunch의 $70M 취재). CNBC $375M 기사와
  NRN $423M 기사는 각각 `is_estimate=true`(둘 다 "reportedly"/집계 추정이라 실측이 아님)로
  교차 확인 카운트에서 빠진다 — **억지로 독립 2건을 만들지 않았다.**
- 무브2: 자기보고 1차(Yahoo Finance 경유 CEO 직접 확인 인원수) 1건뿐, 이를 독립적으로 재확인하는
  다른 원 관측이 없다. 캘리포니아 EDD WARN 공시를 찾아봤으나 Zume 명의 필터링 결과 2022-11-29
  접수·San Diego 소재·14명 규모 건만 나왔다 — 카마리요 공장(140→31명)과 지역·인원 모두 달라
  **같은 사건이라고 확정할 수 없어서 근거로 쓰지 않았다.** (§7.1 — 확인 불가를 양성으로 접지 않음)

부정 사례 규칙(§ "실패 사례를 축소하지 않는다")대로 `outcome_direction='negative'`를 그대로 뒀다.
사실확인 C 라서 `validate`가 두 무브 모두 "발행 불가, 사내 참고용" 경고를 냈고, 이건 의도된
동작이다(§CG-1: 등급 C 무브는 발행 대기에 못 간다).

## 못 찾은 것 / 확인 불가

- **"샌프란시스코가 Zume 포장재를 구체적으로 금지했다"는 1차 보도를 못 찾았다.** Wikipedia가
  이렇게 서술하지만(참고문헌 15), 그 원 출처 기사를 직접 찾지 못해 **초안 근거로 쓰지 않았다** —
  대신 (1) Zume이 PFAS 성분을 써 왔다는 자기 인정과 (2) 샌프란시스코 조례가 2020년부터
  퇴비화 용기의 PFAS 성분을 금지한다는 사실을, 서로 독립된 사실로만 병기했다. 둘을 인과로
  엮은 문장은 쓰지 않았다.
- **packaginglaw.com 기사의 `published_at`을 못 찾았다.** SF 조례 승인일(2018-08-10)·시행일
  (2020-01-01)은 확인했지만 그 기사 자체의 게시일은 확인 못 했다 — `validate`가 warn으로
  잡아 준다.
- **카마리요 공장 140명 감원 관련 California WARN 공시를 Zume 명의로 찾았으나 지역·인원이
  불일치**(San Diego, 14명)해 같은 사건인지 확인 불가. 근거로 쓰지 않았다.
- Danny in the Valley 팟캐스트(Alex Garden 출연분)에서 창업자 1인칭 서술을 더 찾아보려 했으나,
  fetch로는 에피소드 타임스탬프·주제 요약만 나오고 실제 발화 텍스트를 못 얻었다 — 이번 초안에는
  안 썼다. TechCrunch 인용문으로 §3.5 요건은 충족했다.
- `business_model`/`buyer_type`은 피자 시대(D2C, B2C) 기준으로 정했다 — 포장재 피벗 이후는
  사실상 B2B(2C)에 가깝다는 점은 이 필드에 반영하지 않고 여기 노트에만 남긴다(필드 1개당 값
  1개라 시대별 분기를 못 담는다).

## validate 결과

`node scripts/case-research.mjs validate --slug zume-pizza-mobile-oven-production-collapse`
직접 실행 — **error 0건, exit 0** ("✅ 전부 통과" 출력, 스크립트 306행 `process.exit(1)`을
안 타고 308행 성공 로그까지 도달했음을 소스로 확인). warn 3건(위 "못 찾은 것" 섹션과 동일 —
published_at 미기재 1건, 부정 사례 사실확인 C 2건)은 의도된 경고이지 결함이 아니다.
