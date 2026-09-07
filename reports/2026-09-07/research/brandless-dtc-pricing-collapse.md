# 조사 노트 — Brandless (brandless-dtc-pricing-collapse)

큐 사유: `failure_quota` — 실패·피벗·철수 사례 할당분. 대상 미정이라 WebSearch로 직접 선정.
기존 적립 slug와 겹치지 않는지 확인함(제외 목록에 없음).

## 선정 이유

전 제품 $3 균일가로 "브랜드세 제거"를 내세우며 SoftBank Vision Fund가 2억4천만 달러를
투자한 DTC 스타트업. 2020년 2월 폐업. 병목이 UNIT_ECONOMICS로 명확하고, "가격을 올려서
구조를 고치려 했다"는 되돌릴 수 있는 무브(PRICING)가 있어 다른 사업에 옮기기 좋다.
outcome_direction=negative — 실패를 실패로 적었고, 교훈으로 억지로 포장하지 않았다.

## 병목

**UNIT_ECONOMICS.** $3 객단가가 온라인 광고 기반 고객획득비용을 구조적으로 감당하지
못했다. 리테일 컨설턴트 Neil Stern(McMillanDoolittle/Forbes)의 표현: "소비자 관점에서
문제는 없었다 — 낮은 가격대와 높은 고객획득비용이 만든, 알 수 없는 적자 구조였다."

## 찾은 것

- 출범: 2017-07-11, $3 균일가 포지셔닝 (TechCrunch 2017 런칭 기사로 확인)
- SoftBank Vision Fund 투자 발표: 2018-07, $2억4천만 (밸류에이션 5억+)
- 실제 집행액: 마일스톤 미달로 약 $1억만 집행, 마지막 트랜치는 오지 않음 (Axios 취재,
  CFO.com이 인용 — 원 출처는 발표 자체와 다른 관측이라 observation_key 분리)
- CEO 교체 2회: Tina Sharkey(공동창업자) 2019-03 사임 → CFO Evan Price 임시 →
  John Rittenhouse(전 Walmart.com COO) 2019-05 취임 → 2019년 말 조용히 퇴진 → Price 복귀
- Rittenhouse 체제에서 $3 정체성 포기: $6·$9 상품 추가, 2019-09 CBD 브랜드 Plant People과
  파트너십($49~79대), "$600대 Vitamix 경쟁 제품"까지 언급됨(2차 출처, 미검증)
- Rittenhouse의 직접 발언(Forbes, 2019-07-31): "평균 주문액을 $48에서 $70~80으로
  올려야 한다" — 무브 0의 metric_before/after 출처
- 가격 인상($9선) 시도가 실제로는 매출을 위축시켰다 (PYMNTS, 원문 그대로 확보 못 함)
- 폐업: 2020-02-10 공식 발표, 직원 80명 중 70명 해고·10명 잔류, "치열한 경쟁의 DTC 시장이
  현재 사업모델로는 지속 불가능함을 입증했다" (공식 성명 원문 확보)

## 못 찾은 것 (확인 불가로 남김)

- **Forbes(bizcarson, 2019-07-31) 원문 직접 열람 — 확인 불가.** WebFetch가 403을
  반환했다. AOV $48→$70~80 인용문은 WebSearch 결과 스니펫에서 두 차례 독립 질의로
  동일하게 나왔지만, 원문 전체 대조는 못 했다. 초안 evidence의 supports_claim에
  이 사실을 그대로 남겨 뒀다 — "확인했고 맞다"가 아니라 "검색 스니펫 수준에서만
  확인했다"는 상태다.
- **AOV $70~80 목표가 실제로 달성됐는지 — 확인 불가.** 발언은 목표치이지 결과가
  아니다. 7개월 뒤 폐업했다는 사실 외에 목표 달성 여부를 보여주는 수치는 찾지 못했다.
  그래서 metric_after=70은 "목표", "실측"이 아니라는 점을 evidence에 명시했다.
- **CBD 카테고리 확장(무브 1)의 매출·리텐션 영향 — 확인 불가.** 도입 사실은
  확인했지만 그로 인한 정량적 결과는 공개 자료에서 찾지 못했다. metric_after를
  비워 뒀고(등급 D), 지어내지 않았다.
- **정확한 창업 연도(2014 vs 2017) — 부분 확인.** 법인 설립은 2014년으로 보이는
  자료가 있었으나 직접 대조하지 못했다. 공개 출범(제품 판매 시작)은 2017-07-11로
  TechCrunch 런칭 기사에서 확인했고, period_start는 이 날짜로 잡았다.
- **PYMNTS 기사의 "가격 인상이 매출을 위축시켰다"는 서술의 원 출처 — 확인 불가.**
  자체 취재인지 The Information 등 타 매체를 인용한 것인지 구분하지 못해
  observation_key를 비워 뒀다(다른 관측과 합쳐 세지 않음).

## 등급 결과 (validate 직접 실행, exit 0)

- 무브 2건 · 근거 6건 · 등급 C 1 / D 1 (A·B 없음)
- moves[0] PRICING: **C** — 자기보고 1차(Forbes 인터뷰) 1건뿐, 교차 확인 후보 2건은
  관측키·수치뒷받침 미기재라 세지 않음. `⚠️ 부정 사례인데 등급 C — 등급 A 아니면
  발행 불가, 사내 참고용`
- moves[1] PRODUCT_FEATURE: **D** — 수치 없음. PMF 스코어링 입력에서 제외.
- `node scripts/case-research.mjs validate --slug brandless-dtc-pricing-collapse` → **exit 0**

## 요약

slug: `brandless-dtc-pricing-collapse` / 병목: UNIT_ECONOMICS / 무브 2건(PRICING C,
PRODUCT_FEATURE D) / validate exit 0 / 발행 불가(등급 A 미달, 정상 — 부정 사례
할당분이라 A를 억지로 만들지 않았다) / 못 찾은 것 5개 항목은 위에 명시.
