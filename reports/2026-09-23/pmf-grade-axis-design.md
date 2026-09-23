# 등급 축 전환 설계 — "근거 신뢰도" → "PMF 신호 강도 × 타인에게의 가치"

작성: CEO-STAFF 세션, 2026-09-23 (KST). 남헌 통합 위임 섹션 A. **구현 없음, 보고만.**
결정 주체: 남헌 + Cowork (SP-024 재개 여부까지 함께).

## 0. 한 줄 결론

- 지금 등급(`evidence_grade`)은 승인 무브 41개 중 **A 39 · C 2** — 변별력이 0에 가깝다. 근거가 붙었으면 전부 A가 되는 산식이라 그렇다.
- Cowork 초안(개선폭 2배+이식성 높음=A …)을 **그대로** 41개에 적용하면 **A 3 · D 20+** 가 된다. 이유는 셋: 이전값(before) 없는 무브 14개, 실패(negative) 무브 14개, 이식성 사람 판정이 3개뿐이라 나머지 38개는 "이식성 높음"을 말할 수 없다.
- 그래서 초안을 **신호 강도(S 0~3) × 이식성(T 0~3)** 2축으로 풀어 쓴 산식을 제안한다. 이걸로 재채점하면 **A 20 · B 11 · C 8 · D 2** — 갈린다.
- 근거 신뢰도(`fact_check_grade`·`evidence_grade`)는 없애지 않고 "근거 보기" 보조 배지로 내린다. 발행 게이트 CG-1/CG-2 는 그대로 사실확인 등급을 본다.

## 1. 남헌이 이전에 만들게 한 "실제로 도움이 되는 정보인지" 프레임워크 — 찾은 것

| 물음 | 찾은 자리 | 내용 |
|---|---|---|
| 로그의 "등급 A2" 표기 | `scripts/case-review.mjs` regrade 요약 (`fmt`) | `인사이트 이전 A2 · B0 · C0 · D0` = **등급별 무브 개수**. A2 는 "A 등급 2개"다. 등급 이름이 아니다. |
| 인사이트 등급 산식 | `lib/cases/draft.ts::gradeMove()` (2026-09-16 재설계) | D=transfer_note 없음 / C=짧거나 일반론 또는 근거 0 / B=전제(preconditions) 없음 / A=행동+전제+근거. **"얼마나 효과가 있었나"는 안 본다.** |
| 사실확인 등급 | `factCheckGrade()` → `fact_check_grade` | 공시 A / 비자기보고 1차 A / 교차 관측 2개 A / 자기보고+다른 관측 B / 자기보고뿐 C / 수치 없음 D. 발행 게이트 CG-1 전용 바닥. |
| 이식성 | `case_moves.transferability` HIGH/MEDIUM/LOW, **사람만** (`docs/case-study-pipeline-design.md §9`) | 앵글 정렬 1순위 키. 승인 무브 41개 중 값이 있는 것 **3개**(ConvertKit HIGH·Fab HIGH·Homejoy MEDIUM). 카드 채점 UI(`/cases/grade`)에 입력칸은 있다. |
| 독자 문제 | `case_studies.reader_problem` 7코드 | "이 이야기를 옮겨 쓸 독자가 지금 막혀 있는 지점". zenefits 만 NULL. |

즉 "도움이 되는가"는 이미 **행동(transfer_note)·전제(preconditions)·이식성(transferability)** 세 필드로 잡혀 있다. 빠진 것은 **"그래서 얼마나 됐나"(신호 강도)** 하나다. 새 축은 그걸 더하고 나머지는 재사용한다.

## 2. 현재 41개의 분포 — 왜 전환이 필요한가

| 항목 | 값 |
|---|---|
| 승인 무브 | 41 (SaaS 11 · 소비재 30, 오늘 승인한 소비재 5 포함) |
| evidence_grade | A 39 · C 2 (lactofit CHANNEL·native CONTENT = 수치 없음) |
| fact_check_grade | A 17 · C 22 · D 2 |
| transferability 판정 | 3 / 41 |
| metric_before 없음 | 14 (단일 시점 수치만) |
| outcome_direction | positive 25 · negative 14 · mixed 2 |
| 지표가 **결과**가 아니라 **투입**(지출 비중·설비·SKU·지원 앱 수) | 9 |

마지막 줄이 초안이 못 본 함정이다. "지원 앱 2→6,000개" 는 3,000배 개선이 아니라 **행동의 크기**다. 개선폭 산식에 그대로 넣으면 투입을 많이 한 무브가 A 가 된다.

## 3. 제안 산식 — pmfGrade(move)

### 3-1. S 신호 강도 (0~3) — "그래서 얼마나 됐나"

| S | 기준 | 예 |
|---|---|---|
| 3 | 결과 지표가 **확정**됐고 규모가 크다: 상대 변화 ≥2배(감소는 ≤½), 비율 지표 ≥10pp, 또는 실패 케이스(negative)로 회사가 pivoted/shutdown 이고 수치가 있다 | ConvertKit 이탈 5.5→1.5% · Native 재구매 21→50% · Blue Apron 매출 −48% |
| 2 | 20~99% 변화 / 5~10pp / **단일 시점 수치인데 카테고리 벤치마크 대비 명백**(NPS 76, 반품률 5%, 비디자이너 66%) / 투입 지표지만 케이스 결과에 근거로 연결됨 | Hims 구독자 +45% · Zapier 앱 수 · Figma NDR 132% |
| 1 | <20% 변화, 또는 단일 시점 수치인데 벤치마크 없음, 또는 사업 결과가 아닌 지표(임상 수치) | Zapier 파트너 12 · Ritual 비타민D +43% |
| 0 | 수치 없음(fact_check D) 또는 방향 불분명 | lactofit CHANNEL · native CONTENT |

규칙 셋: ① 실패 케이스는 "개선폭" 대신 **반증 강도**(얼마나 크게 틀렸나 + 결과 확정)로 센다. ② 투입 지표는 최대 S2. ③ 비율 지표는 배수가 아니라 pp 로 본다(14.8→24.8% 는 1.68배가 아니라 +10pp).

### 3-2. T 이식성 (0~3) — "타인이 내일 할 수 있나"

| T | 기준 |
|---|---|
| 3 | `transferability=HIGH`, 또는 미판정이면 전제가 **데이터·시간뿐**(자기 숫자만 있으면 됨) |
| 2 | `MEDIUM`, 또는 전제에 **관계·채널·현금 여유**가 든다(생산 관계, 정기결제 채널, 한 달 버틸 현금) |
| 1 | `LOW`, 또는 전제가 **자본·규제·규모**다(자체 공장, 임상, 규제 업종, 연 300만 달러 매출) |
| 0 | preconditions 미기재 (§7.1: 미기재 ≠ 전제 없음 → 등급은 `잠정`) |

사람 판정이 없으면 T 는 전제 문장에서 위 규칙으로 뽑되 **`provisional=true`** 로 표시한다. 미판정을 LOW 로 접지 않는 §9-2 원칙 그대로다.

### 3-3. 합성

| 등급 | 조건 | 뜻 |
|---|---|---|
| **A** | S3 & T≥2, 또는 S2 & T3 | 크게 됐고, 내일 옮길 수 있다 |
| **B** | S2 & T2, S3 & T1, S1 & T3 | 하나가 아쉽다 |
| **C** | S1 & T≤2, S2 & T1 | 작거나 옮기기 어렵다 |
| **D** | S0 | 결과 불분명 — Cowork 초안의 D 와 같다. 매칭·PMF 스코어링 입력에서 제외(저장은 유지) |

Cowork 초안과의 대응: 초안 A(2배+높음)=S3·T3, B(20~50%+중간)=S2·T2, C(작음 또는 이식성 매우 제한)=S1 또는 T1, D=S0. 초안을 버린 게 아니라 **before 없음·실패·미판정** 세 구멍에 값을 준 것이다.

## 4. 재채점 결과 — 41개 (S/T 는 위 규칙으로 세션이 수동 채점, DB 미기록)

`T*` = transferability 사람 판정 없음(잠정). `SaaS` = SaaS 1인 창업가 독자에게 그대로 옮겨지나 (Y/부분/N).

| # | 케이스 · 레버 | 방향 | 지표 | S | T | **새 등급** | 현재 | SaaS |
|---|---|---|---|---|---|---|---|---|
| 1 | blue-apron CHANNEL | neg | 마케팅비/매출 14.8→24.8% | 3 | 3* | **A** | A | Y |
| 2 | blue-apron CHANNEL | neg | 매출 881→455M | 3 | 2* | **A** | A | Y |
| 3 | blue-apron OPERATIONS | neg | 자체 시설 2→0 | 3 | 2* | **A** | A | 부분 |
| 4 | convertkit OFFER | pos | 이탈률 5.5→1.5% | 3 | 3 | **A** | A | Y |
| 5 | dr-squatch CONTENT | pos | 매출 5→100M | 3 | 1* | **B** | A | 부분 |
| 6 | elf CONTENT | pos | 마케팅 비중 16→25% (투입) | 2 | 2* | **B** | A | Y |
| 7 | elf POSITIONING | pos | 매출 318→1,024M | 3 | 3* | **A** | A | Y |
| 8 | everlane PRICING | pos | 소매가/원가 2.24배 (단일·벤치마크 5~8배) | 2 | 3* | **A** | A | Y |
| 9 | everlane CONTENT | pos | 사용자 0→200k/4개월 | 3 | 2* | **A** | A | Y |
| 10 | everlane OFFER | pos | 가격 125→100 (투입, 결과 없음) | 1 | 2* | **C** | A | 부분 |
| 11 | fab PRODUCT_FEATURE | neg | SKU 1k→11k (투입, shutdown) | 2 | 3 | **A** | A | Y |
| 12 | fab OPERATIONS | neg | 마케팅비 35% (단일) | 2 | 2* | **B** | A | Y |
| 13 | figma PACKAGING | pos | NDR 134→132% (변화 없음, 수준 강함) | 2 | 2* | **B** | A | Y |
| 14 | figma PRODUCT_FEATURE | pos | 비디자이너 66% (단일) | 2 | 3* | **A** | A | Y |
| 15 | gopro CONTENT | pos | S&M 비중 27.5→16% | 3 | 2* | **A** | A | 부분 |
| 16 | hims OFFER | pos | 구독자 +45% | 2 | 2* | **B** | A | Y |
| 17 | homejoy OPERATIONS | neg | 재예약률 20% (단일, shutdown) | 2 | 2 | **B** | A | Y |
| 18 | lactofit PRICING | mixed | 매출 +24% | 2 | 1* | **C** | A | 부분 |
| 19 | lactofit CHANNEL | pos | 수치 없음 | 0 | 2* | **D** | C | N |
| 20 | native PRODUCT_FEATURE | pos | 재구매율 21→50% | 3 | 2* | **A** | A | Y |
| 21 | native CONTENT | pos | 수치 없음 | 0 | 3* | **D** | C | Y |
| 22 | notion PACKAGING | pos | 템플릿 600→5,000 (투입) | 2 | 3* | **A** | A | Y |
| 23 | notion COMMUNITY | pos | 지원자 400 (단일·투입) | 1 | 2* | **C** | A | Y |
| 24 | oatly OPERATIONS | neg | 매출총이익률 29.9→9.5% | 3 | 3* | **A** | A | 부분 |
| 25 | oatly OPERATIONS | neg | 공장 4→7 (투입) | 2 | 2* | **B** | A | 부분 |
| 26 | peloton PARTNERSHIP | neg | 86.6M 투자 매각 | 3 | 2* | **A** | A | 부분 |
| 27 | peloton OPERATIONS | neg | 재고 충당금 38.7→224.9M | 3 | 2* | **A** | A | N |
| 28 | pets.com CONTENT | neg | 마케팅/매출 1,909→235% | 3 | 3* | **A** | A | Y |
| 29 | pets.com PRICING | neg | 매출총이익 −1.2→−6.9M | 3 | 3* | **A** | A | Y |
| 30 | purple OPERATIONS | pos | 매출총이익률 39.4→44.1% | 2 | 1* | **C** | A | N |
| 31 | purple OPERATIONS | pos | 설비 15.5→19.8M (투입) | 1 | 2* | **C** | A | N |
| 32 | ritual PRODUCT_FEATURE | pos | 비타민D +43% (임상) | 1 | 1* | **C** | A | N |
| 33 | slack PRICING | pos | NDR 171→143% (하락, 수준 강함) | 2 | 2* | **B** | A | Y |
| 34 | slack PACKAGING | mixed | 매출 105→401M | 3 | 2* | **A** | A | Y |
| 35 | tuft CHANNEL | pos | 5성 후기 154 (단일·투입) | 1 | 2* | **C** | A | 부분 |
| 36 | tuft OFFER | pos | 반품률 5% (단일·벤치마크) | 2 | 2* | **B** | A | 부분 |
| 37 | tuft OPERATIONS | pos | NPS 76 (단일·벤치마크) | 2 | 3* | **A** | A | Y |
| 38 | zapier CHANNEL | pos | 지원 앱 2→6,000 (투입) | 2 | 3* | **A** | A | Y |
| 39 | zapier PARTNERSHIP | pos | 파트너 12 (단일·투입) | 1 | 3* | **B** | A | Y |
| 40 | zenefits OPERATIONS | neg | 벌금 0→7M | 3 | 1* | **B** | A | N |
| 41 | zenefits OPERATIONS | neg | 무자격 판매 83% | 2 | 1* | **C** | A | N |

**집계**: 새 등급 A 20 · B 11 · C 8 · D 2 (현재 A 39 · C 2). 잠정(T*) 38개 — 사람이 transferability 를 채우면 확정된다.
SaaS 11개만 보면 A 6 · B 4 · C 1 — SaaS 코퍼스도 갈린다.

⚠️ 위 S/T 는 규칙을 손으로 적용한 값이다. 코드로 옮기면 경계(±1)에서 4~6개는 달라질 수 있다. 확정은 구현 후 `regrade --dry` 투영으로 본다.

## 5. SP-024(등급 가중 vs 종류 보너스) 재개 조건에 미치는 영향

09-23 오전 보류 판정의 재개 조건: (a) B/C 등급 무브 1건 이상 + (b) SaaS 무브 20건 이상.
- (a) 새 축이면 **충족**(B 11·C 8). 등급이 상수가 아니게 되어 `GRADE_RANK×10` 이 실제로 순위를 움직인다.
- (b) SaaS 11개 — **미충족**. 그러나 (a) 가 충족되면 SaaS 안에서도 A 6 / B 4 / C 1 로 갈리므로 `KIND_MATCH_BONUS=100` 안쪽 순서는 의미가 생긴다.
- 권고: 축 전환과 함께 SP-024 를 **"보류 → 조건부 재개"** 로 바꾸되, 손댈 것은 `GRADE_RANK` 의 입력을 `evidence_grade`→`pmf_grade` 로 바꾸는 한 줄뿐이다. 보너스 크기(100)는 건드리지 않는다. 결정은 남헌·Cowork.

## 6. 액션플랜 — "내일 할 행동" + 다단계

- **내일 할 행동** = `transfer_note` 그대로다. 41개 중 33개가 이미 "내일, …" 또는 "오늘 …" 로 시작한다. 새로 만들 것 없음.
- **다단계** = 그 케이스에 실제 기록된 무브를 `observed_period_start` 순으로 나열한 것. 단계마다 transfer_note(행동)·preconditions(전제)·case_evidence(근거)·S/T 를 붙인다. **LLM 이 다음 단계를 지어내지 않는다** — 무브가 1개인 케이스는 1단계로 끝난다(7개 케이스).
- 구멍: `observed_period_start` 가 NULL 인 무브 9개 → 순서를 `created_at` 으로 대신하고 화면에 "시점 미확인" 표시. 시간순이 곧 인과가 아니므로 화살표 대신 번호만 쓴다.
- 이건 트랙 2 상세 페이지(11블록 중 "무브 타임라인" 블록)의 데이터 계약이 된다. 추가 테이블 없음.

## 7. 구현하면 무엇이 바뀌나 (구현은 승인 후)

| 항목 | 내용 | 소요 |
|---|---|---|
| 스키마 | `case_moves` 에 `pmf_signal int`, `pmf_transfer int`, `pmf_grade char(1)`, `pmf_grade_reason text`, `pmf_provisional bool`, `metric_kind text ('outcome'/'input')` 추가. 전부 nullable, 비파괴. `evidence_grade`/`fact_check_grade` 유지 | 1h |
| 산식 | `lib/cases/draft.ts::pmfGrade()` — S 는 metric_before/after/unit/direction/outcome_status 에서, T 는 transferability 우선·전제 키워드 폴백. `metric_kind` 는 사람 입력(기본 outcome, 채점 카드에서 토글) | 2h |
| 재채점 | `case-review.mjs regrade` 에 pmf 축 추가, `--dry` 투영 먼저 | 1h |
| 채점 UI | `/cases/grade` 카드에 S/T 표시 + `metric_kind`·`transferability` 입력(이미 있음) | 2h |
| 표시 | 등급 배지 = `pmf_grade`, "근거 보기" 접힘 안에 fact_check·evidence 배지. `GradeLegend` 갱신 | 1.5h |
| 매칭 | `GRADE_RANK` 입력을 pmf_grade 로 (SP-024 결정에 따라) | 0.5h |
| 문서 | `docs/case-study-pipeline-design.md §10` 신설, CG 게이트는 사실확인 축 유지 명시 | 1h |
| 합계 | | **~9h** (트랙 2 착수 전에 끝내는 것을 권고) |

## 8. 갈림 확인 · 질문 · 선택지

1. **S 의 "벤치마크 대비 명백" 판정을 누가 하나.** 코드는 벤치마크를 모른다(NPS 76 이 높은지). 선택지: (a) 사람이 채점 카드에서 S 를 직접 고른다(기본값은 코드 제안) — 권고 / (b) 코드가 단일 시점 수치는 전부 S1 로 둔다(보수적, tuft·figma 가 C 로 떨어짐).
2. **T 의 잠정 폴백을 허용하나.** 38개가 미판정이다. (a) 전제 키워드로 잠정 T 를 주고 `provisional` 배지 — 권고 / (b) 미판정은 T0 → 등급 D 로 두고 사람이 채울 때까지 숨김(§7.1 엄격, 그러나 41개 중 38개가 사라진다).
3. **실패 케이스의 A.** 새 축에서 A 20개 중 11개가 negative 다. "PMF 신호"에 실패 신호를 같은 A 로 둘지, 배지에 방향(↑/↓)을 병기할지. 권고: 같은 등급 + 방향 아이콘. 별도 축을 만들면 등급이 셋이 된다.
4. **소비재 무브의 SaaS 적용 표시.** 위 표의 SaaS 열은 세션 판단이다. DB 에 넣을지(`saas_applicability`), 아니면 기본 숨김(kind=saas)으로 충분한지. 권고: 넣지 않는다. 숨김 필터가 이미 그 역할을 한다.
5. **SP-024 재개.** §5 참조. 남헌·Cowork 결정.
6. **금지선 확인.** 이 전환은 `evidence_grade` 손 수정이 아니라 새 컬럼 계산이다(§10.1 위반 아님). 그러나 등급 표시 축이 바뀌면 `/cases/search` 정렬·어드바이저 카드 순서가 바뀌므로 **사업 방향 결정(§10.2 예외 5)** 에 걸린다고 본다. 그래서 구현하지 않고 보고한다.

## 9. 트랙 2 와의 접점 — 기다리지 않고 진행 가능한 것

상세 페이지의 등급 배지는 `displayGrade(move)` 한 함수로 뽑게 만든다. 지금은 `evidence_grade` 를 돌려주고, 새 축이 승인되면 `pmf_grade ?? evidence_grade` 로 바꾼다. 그래서 트랙 2·3 구현은 이 결정을 기다리지 않는다 — 배지 값만 뒤에 바뀐다.
