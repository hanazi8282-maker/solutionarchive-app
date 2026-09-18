# 조사 노트 — Shyp (shyp-flat-fee-unit-economics-collapse)

큐 사유: failure_quota (UNIT_ECONOMICS 병목, 실패/피벗/철수 사례 할당분).
대상 미정 → WebSearch 로 직접 선정. 이미 적립된 slug 목록과 겹치지 않음을 확인.

## 대상 선정 이유

온디맨드 픽업·배송 스타트업 Shyp (2013–2018, 샌프란시스코). 선정 이유:
- 전국 동일가(flat fee, 픽업 $5 / 맞춤포장 $15)로 팔았는데 실제 픽업당 원가는
  품목·거리·도시마다 달랐다는, UNIT_ECONOMICS 병목에 정확히 들어맞는 1차 실패 원인이 있다.
- 창업자 Kevin Gibbon 이 폐업 발표 글(LinkedIn, 2018-03-27)에서 **1인칭으로** 실수를
  구체적으로 인정한다 — "사고의 흐름" 요건을 채울 수 있는 드문 케이스.
- `outcome_status=shutdown` 이 명확하고 논쟁의 여지가 없다(2018-03-27 완전 폐업,
  복수 매체 동시 보도).

## 찾은 것

- **가격 구조**: 픽업 $5 flat fee, 맞춤포장 $15 flat fee — 품목·거리 무관 동일가.
  (Yahoo Finance/Sramana Mitra 해설 기사가 명시. FreftWaves 기사가 "품목과 무관하게
  동일 가격으로 책정"했다는 사실을 별도로 확인.)
- **지리적 확장·철수**: 한때 뉴욕·마이애미·LA·시카고·필라델피아까지 확장. 2017년 7월,
  그 시점까지 남아 있던 4개 시장(SF + NY·LA·시카고) 중 SF 를 뺀 3곳을 전부 접고
  비즈니스 고객에 집중. 2018-03-27 SF 마저 완전 폐업.
- **소상공인 피벗**: 이베이 연동으로 온라인셀러 등 소상공인에 집중, 건당 매출 150%
  증가, 소상공인이 매출의 50% 이상 차지. 출처는 Gibbon 본인 글이고, 이후 매체들은
  이 수치를 그대로 재인용한 것으로 보인다(독립 측정 아님 — `observation_key` 로 접었다).
- **1인칭 사고의 흐름** (요건 충족): Gibbon 의 폐업 발표 글에서 "growth at all costs is
  a dangerous trap that many startups fall into, mine included" 라고 성장 지상주의를
  자인하고, 적자인 소비자 사업부를 별도 팀까지 유지하며 소상공인 쪽과 같이 끌고 간 것을
  "my mistake" 라고 명시한다. 대형 기업은 여러 제품 카테고리를 동시에 탐색할 자금 여유가
  있지만 스타트업은 그럴 여유가 없다는 것을 뒤늦게 깨달았다고 적었다.
- **펀딩**: 총 약 $50M(2015 Series B, Kleiner Perkins John Doerr 주도), 밸류에이션
  $250M(2015 peak). Wikipedia 는 총 누적 $62.1M 이라고 적지만 이번 조사에서는
  1차 소스로 재확인하지 못해 초안에 넣지 않았다.

## 못 찾은 것 (확인 불가로 남긴 것)

- **픽업 1건당 실제 원가** — flat fee 와 비교할 구체적 $ 수치(예: "픽업당 원가 $X")는
  어느 기사에서도 찾지 못했다. "동일가인데 원가가 다르다"는 정성적 사실만 확인했고,
  정량 비교는 초안에 넣지 않았다(근거 없는 숫자 금지, CLAUDE.md §7.1).
- **2017년 7월 레이오프 인원·비율** — "인력 감축"이라는 서술만 있고 %나 인원수를
  주는 출처를 못 찾았다. Gizmodo("Shyp Hits the Fan")·sramanamitra.com 원문은
  403 으로 직접 열람 불가 — WebSearch 요약으로만 간접 확인했고, 인원 수치는 거기에도
  없었다. 초안에 넣지 않았다.
- **회사 설립 정확한 날짜** — "2013년 설립"은 여러 2차 소스에 있지만 월/일까지
  확인한 1차 소스를 못 찾았다. `period_start` 를 비워 뒀다(§7.1 — 확인 불가를
  양성으로 접지 않는다).
- **누적 펀딩 총액의 확정치** — Wikipedia 는 $62.1M, TechCrunch 계열 보도는 "약 $50M
  Series B" 만 명시. 총액 불일치를 좁힐 1차 자료(SEC 공시 등, 비상장사라 없음)를
  못 찾아 초안에는 넣지 않았다.
- **eBay 파트너십의 정확한 시작 시점** — Gibbon 글은 "about two years before shutting
  down"(≈2016)이라고만 적어, `moves[1].observed_period_start` 를 비워 뒀다.

## 등급·검증 결과

- 무브 2개, 근거 5건. `case-research.mjs validate` 기준 독자 인사이트 등급은
  둘 다 A(구체적 transfer_note + preconditions + 근거 있음).
- 사실확인(factCheckGrade) 은 둘 다 C — moves[0](도시 철수)은 근거 3건이 전부
  같은 폐업 발표 주간 보도(같은 observation_key)라 교차 확인이 안 되고, moves[1]
  (이베이 피벗 수치)은 창업자 자기보고 1건뿐이라 다른 원 관측이 없다.
  `outcome_direction=negative` 인 moves[0] 이 사실확인 C 라서 validate 가 경고를
  냈다 — 억지로 등급을 올리려고 근거를 부풀리지 않았다. 발행 게이트(CG-1) 기준
  현재 상태로는 발행 대기로 못 간다, 사내 참고용.

## 실패 사례 축소 여부 점검

`outcome_direction` 을 moves[0]=negative, moves[1]=mixed 로 정직하게 적었다.
moves[1]의 "건당 매출 150%"라는 긍정적 숫자가 있지만, 그 문장 안에 "이미 자본을
소진한 뒤였다", "결국 폐업했다"는 실패 맥락을 함께 넣어 억지 교훈으로 돌리지
않았다. summary 도 "완전히 폐업했다"로 끝맺는다.

## validate 실행 결과

```
node scripts/case-research.mjs validate --slug shyp-flat-fee-unit-economics-collapse
→ error 0건, exit 0
```
