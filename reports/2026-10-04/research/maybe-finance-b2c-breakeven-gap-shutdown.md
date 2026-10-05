# 조사 노트 — Maybe Finance (실패·철수 사례, 큐 사유 failure_quota)

- 날짜: 2026-10-04 · slug: `maybe-finance-b2c-breakeven-gap-shutdown`
- 대상 선정: 큐가 "미정"이라 직접 골랐다. SaaS·소규모 팀·창업자 1인칭 출처가 풍부한 실패 사례. 기존 slug 목록과 겹치지 않음.
- 결과: outcome_status=shutdown, 전 무브 outcome_direction=negative. 교훈을 positive 로 돌리지 않았다.

## reader_problem
- `MAKE_BUT_NO_MONEY`. 맞는 어휘가 있어 끼워 맞춘 건 아니다(기본 독자).

## 찾은 것 (1인칭)
- 창업자 Josh Pigford 팟캐스트(The Bootstrapped Founder, 2024-02-07): 많이 뽑고 출시했더니 돈이 떨어졌다, 약 $1.4M·정규직 8명+외주. (사고의 흐름 1건 충족)
- 창업자 X 게시물 2024-02-06(1차 종료 사유: 런웨이, Advisor 기능), 2025-07-22(손익분기 6,000명 vs 유료 약 200명, 현금 약 $40만), 2026-03-31(청산). 본문은 fxtwitter 미러로 읽었다. x.com 직접 접근은 HTTP 402.

## 못 찾은 것 (확인 불가)
- 출시 당시 대기자 10,000+·유료 50명·월 $15 수치: Failory 요약(2024-01-18)에만 있고 창업자 원문을 직접 못 열었다. 근거로 쓰지 않았다(초안에 없음).
- 18개월 개발 기간: Failory 요약뿐. 초안에 쓰지 않았다.
- GitHub v0.6.0 릴리스(2025-07-24)는 엔지니어링 교훈 위주라 사업 수치가 없다.
- Republic 페이지는 HTTP 403 — 투자 규모는 팟캐스트 구어("1.4 ish million")만 썼다. 정확치 아님, "약 $140만"으로 표기.
- 2026-03-31 글에서 창업자가 "나중에 더 쓰겠다"고 했다 — 5년간 방향 전환이 왜 안 통했는지의 본인 분석은 아직 없음. 초안 summary 에도 그렇게 적었다.
- 공식 유료 가입자 수 시계열(출시 이후 월별)은 확인 불가. 2025-07-22 시점 약 200명이 유일한 수치.

## 무브 설계
- 0 OPERATIONS: 수입 전에 사람부터 늘린 구조(수치 없음, 등급 D).
- 1 PRODUCT_FEATURE: 안 쓰이는 규제 기능(수치 없음, 등급 D).
- 2 PRICING(병목 UNIT_ECONOMICS): 유료 약 200 vs 손익분기 약 6,000. 자기보고 1차뿐이라 사실확인 C. 근거 2개 키(2025-07, 2026-03)는 서로 다른 시점 게시물이다.
- 사실 구분: 6,000명은 창업자 추정("about", "likely more"). is_estimate 는 외부 추정 표시라 false 로 두고 claim 에 "약"을 붙였다.

## 독자 이식성 메모
- 대상은 정규직 8명·$1.4M 팀이라 1인 창업가와 규모가 다르다. 그래서 transfer_note 는 팀 규모와 무관한 행동(번 돈 vs 비용 두 줄, 기능 사용자 수 세기, 손익분기 고객 수 계산)으로만 잡았다. 이식성 등급은 쓰지 않았다(사람이 채점).
- 투자 유치 규모·VC 경로·"B2C 개인금융은 수천만 달러가 필요하다"는 결론은 독자가 옮길 수 없어 무브에서 뺐다.

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에 Maybe Finance·개인 자산관리 프로젝트가 없다. (비슷한 이름의 SaaS 프로젝트들은 이 사업과 무관해 붙이지 않았다.) 모든 무브 `voc_inputs` = [].

## validate
- `node scripts/case-research.mjs validate --slug maybe-finance-b2c-breakeven-gap-shutdown` → error 0건(통과). 경고 5건: 무브0·1 수치 없음(등급 D), 부정 사례라 사실확인 A 아니면 발행 불가(사내 참고용).
- 첫 실행에서 claim 에 pain-terms 낱말(config/pain-terms.json)이 없어 error 2건 → "구독" 낱말을 사실에 맞게 넣어 해결.

## 자가검증 (원칙 §0)
- 개선 1: 처음 초안의 Failory 수치(대기자·유료 50명·18개월)를 빼고 창업자 원문 확인된 것만 남겼다.
- 개선 2: 4번째 무브(5년간 방향 전환 시도)는 원인을 창업자가 안 밝혀 교훈을 지어내게 되므로 무브로 만들지 않고 summary 에만 사실로 적었다.
- 개선 3: transfer_note 를 한 문장 한 조건·쉬운 말로 다시 썼다.
