# 조사 노트 — Magic Spoon (magic-spoon-cereal-supply-reorder-discipline)

큐 사유: `coverage_gap` / 목표 병목: `SUPPLY` / outcome_direction: `positive` (SUPPLY 승인 케이스가
1곳뿐이라 매칭 성립(3곳)에 못 미침 — 성공 사례로 채우라는 큐 메모)

## 왜 Magic Spoon

대상이 "미정"이라 WebSearch로 직접 정했다. 기존 SUPPLY 초안 4건(oatly-capacity-overbuild,
peloton-owned-manufacturing-exit, purple-innovation-capacity-scaleup,
zume-pizza-mobile-oven-production-collapse)을 먼저 확인했다 — 전부 부정/붕괴 서사이거나 이미
적립돼 큐가 요구하는 "성공 사례" 칸을 못 채운다. RXBAR(위탁생산 전환), Anker(자체 공급망),
Allbirds 울 공급계약을 먼저 검토했으나 셋 다 §3.5(1인칭 관측→추론→결정 사슬)를 채울 만큼
구체적인 창업자 발언을 찾지 못했다(RXBAR 팟캐스트는 랜딩페이지 요약뿐, Anker·Allbirds는
공급 결정의 인과를 직접 말한 1차 인터뷰를 못 찾음). Magic Spoon은 Fortune(2020) 인터뷰에서
공동창업자 Gabi Lewis가 초도 재고 완판 경험과 그 이후 재주문 방식 전환을 직접 말한 문장이
있었고, ModernRetail(2023) 인터뷰에서 리테일 확장 결정의 관측→추론→결정 사슬도 나와서 골랐다.
이미 적립된 슬러그 목록·`config/pain-terms.json` legacy 목록 어디에도 "magic spoon" 계열
슬러그가 없음을 grep으로 확인했다.

## 독자 축 (선정 1순위)

- **reader_problem = SOLO_CEILING.** "주문이 늘어도 내 손이 안 늘어난다"— 2019년 출시 직후
  소규모 팀이 "몇 달치는 되겠지"라고 감으로 잡은 재고가 몇 주 만에 완판된 상황과 정확히
  들어맞는다. `config/reader-problems.json` 7개 중 이게 가장 가까웠다.
- 브랜드가 이제는 중형(누적 투자 $1억+)이라 독자가 옮길 부분을 명시했다: transfer_note를
  "판매 속도 계산 → 리드타임 곱해서 재주문 시점 정하기"라는, 팀 규모와 무관하게 오늘 당장
  할 수 있는 계산 행동으로 좁혔다. 매장 수 확장 자체(1,300→22,000)는 그 계산 규율이 있었기
  때문에 가능했다는 결과로만 썼다 — 확장 자체를 독자가 흉내 낼 행동으로 삼지 않았다.

## 사고의 흐름 (§3.5, 1인칭 출처 1건 이상)

ModernRetail(2023-02-08) 인터뷰에서 Gabi Lewis가 직접 말한 사슬: **관측**(경쟁사가 하나둘
생기고, 고객들이 매일 "이거 어디서 사요"라고 문의) → **추론**("카테고리가 성숙해지고 있다"고
판단) → **결정**(D2C 전용에서 벗어나 2022년 6월 타겟 1,300개 매장 입점을 시작으로 전국 리테일
확장). 여기에 Fortune(2020-05-04) 인터뷰의 더 이른 시점 1인칭 진술이 공급 쪽 사슬을 보완한다:
**관측**(초도 재고가 "몇 달치"라는 감과 달리 몇 주 만에 완판) → **추론**(생산량·재주문 주기를
감이 아니라 판매 속도로 계산해야 한다) → **결정**(재주문 시점·현금흐름 관리 방식을 다시 세움).
두 발언 모두 같은 인물(Lewis)의 1인칭 출처이고, 시점이 달라(2020 vs 2023) 공급 안정화가
리테일 확장보다 먼저 있었다는 시간 순서도 확인된다.

## 무브 1개

- **OPERATIONS / positive** — 감으로 재고를 쌓던 방식에서 판매 속도 기반 재주문으로 전환,
  이 공급 안정성을 발판으로 전국 매장 공급을 1,300개(2022-06, 타겟 입점 시점)에서
  22,000개 이상(2025-12, US Chamber of Commerce 기사 시점)으로 확장. `transfer_note`:
  오늘 판매 속도(하루/주당 판매량)를 계산하고, 그 속도와 리드타임을 곱해 재주문 시점을
  오늘 정하라는 구체적 행동.

## 등급과 그 근거

독자 인사이트 등급(`gradeMove`)은 **A** — `transfer_note`(15자 이상, 일반론 패턴 아님)와
`preconditions`가 모두 구체적이고, 사실확인 등급이 D(수치 없음)가 아니다.

사실확인 등급(`factCheckGrade`, 발행 게이트 CG-1/CG-2 전용)은 **C** — "자기보고 1차뿐, 다른
원 관측 없음". 근거 4건 중:
- Fortune(자기보고 1차, `supports_metric=false` — 완판 서사만 받치고 1,300/22,000 수치 자체는
  안 받침)
- ModernRetail(자기보고 1차, `supports_metric=true`, 1,300 수치의 출처)
- RetailDive(비자기보고 2차지만 `supports_metric=false` — 6,800이라는 다른 숫자로 확장이
  단계적이었다는 정황만 교차 확인, 1,300/22,000 자체를 받치지 않음)
- US Chamber of Commerce 기사(회사가 알려준 22,000 수치를 2차 매체가 보도 — `is_self_reported=true`로
  표시했고, 그래서 산식상 "비자기보고 2차"로 카운트되지 않아 교차 확인에 못 들어감)

**억지로 독립 2건을 만들지 않았다** — RetailDive를 "다른 원 관측"으로 우겨 넣으면 A가 되지만,
그건 1,300/22,000이라는 정확한 전/후 수치 자체를 검증하는 게 아니라 "그사이 어딘가 6,800도
있었다"는 별개 사실이라 `supports_metric=false`로 정직하게 뒀다. 그 결과 사실확인은 C에 머문다.

## 못 찾은 것 / 확인 불가

- **위탁생산업체(co-packer) 이름·정체를 못 찾았다.** Magic Spoon이 누구와 생산 계약을 맺었는지
  1차 출처를 못 찾았다 — Wikipedia·언론 어디에도 co-packer 실명이 없다. 그래서 claim에
  "위탁생산업체"라고만 쓰고 특정 업체명은 넣지 않았다.
- **2019년 초도 생산량(몇 개/몇 박스)의 정확한 숫자를 못 찾았다.** Fortune 인터뷰는 "몇 달치"
  "몇 주"라는 정성적 표현만 썼다 — 정확한 개수를 지어내지 않고 인용문 그대로만 옮겼다.
  그래서 이 사슬 자체는 무브의 수치(metric_before/after)로 쓰지 않고 evidence의
  `supports_claim` 서술로만 남겼다.
- **RXBAR·Anker·Allbirds를 먼저 검토했으나 채택하지 않았다** — 위 "왜 Magic Spoon" 참고.
  특히 RXBAR는 반품·재무 수치(연매출 $600K→$2M→$120M, Kellogg 인수 $600M)는 풍부했지만
  co-packer 전환을 창업자가 직접 말한 1인칭 인용문을 SnackNation·INspired
  INsider·Waiter's Pad 세 곳에서 다 못 찾아서(랜딩페이지 요약만 있고 팟캐스트 본문은
  fetch 불가) 제외했다.
- **"co-packer가 처음에 다 거절했다"는 식의, 위탁생산업체가 왜 어려워했는지에 대한 1차 진술은
  못 찾았다.** 제품 개발(단백질 함량·식감) 난이도는 찾았지만 생산 파트너 확보 과정 자체의
  어려움(방문 횟수·거절 횟수 등)을 뒷받침하는 1차 인터뷰는 확인 불가라 claim에 넣지 않았다.
- **outcome_status='active'는 2025-12-22 US Chamber of Commerce 기사 시점 기준**이다. 그 이후
  변동은 확인하지 않았다 — 이 세션 시점(2026-09-21)까지 폐업·매각 등 공개 보도를 별도로
  찾아보지 않았으므로, 더 최근 상태 변화가 있었을 가능성은 열어 둔다.

## validate 결과

`node scripts/case-research.mjs validate --slug magic-spoon-cereal-supply-reorder-discipline`
직접 실행 — **무브 1건 · 근거 4건 · 등급 A1 B0 C0 D0, error 0건** ("✅ 전부 통과" 출력, exit 0).
warn 없음(수치·근거·기간 전부 기재됨).
