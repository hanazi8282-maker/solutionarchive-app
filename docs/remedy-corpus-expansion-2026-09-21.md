# 처방 코퍼스 소비재 확장 — 편향 정량화 + 후보 목록 (2026-09-21, 조사만)

남헌 09-21 지시 "소비재 코퍼스 확장 착수 — 이번 라운드는 후보 목록·출처까지, 원장 편입은 다음 라운드".
같은 날 카테고리 필터(PR #190)를 넣고 재측정한 결과가 이 문서의 출발점이다: **필터 효과 ≈ 0(무관 82.9%→82.5%)**.
즉 편향의 축은 "SaaS vs 물리"가 아니라 아래 §1의 세 가지다.

## 1. 현재 코퍼스 편향 — 실측 (2026-09-21 DB)

### 1-1. 선례 무브 (case_studies · case_moves)
| 종류 | 케이스 42 | 승인 케이스 | 승인·등급 A~C 무브 28 |
|---|---|---|---|
| physical (D2C·마켓플레이스·도매·구독·기타) | 32 | 11 | **23 (82%)** |
| software (SaaS) | 7 | 3 | 5 (18%) |
| service | 3 | 0 | 0 |

물리 비중은 이미 높다. 문제는 **도메인**이다 — 승인 물리 케이스 11곳: Tuft&Needle·Purple(매트리스), Blue Apron(밀키트), Everlane(의류), Peloton(운동기구), GoPro(카메라), Oatly(귀리음료), e.l.f.(색조), Pets.com·Fab.com(이커머스), Homejoy(청소 서비스, MARKETPLACE_SELLER로 기재). **뷰티 1(e.l.f.) · 건기식 0 · 생활용품 0.** 질의(§1-4)와 겹치는 카테고리가 사실상 없다.

### 1-2. 실패 사례 (failed_angles 22)
| 분류 | 건수 | 예 |
|---|---|---|
| 물리 소비재 | 16 | 뷰티 5(글로시에 Play·Skarp·클라리소닉·뷰티카운터·버치박스) · 식품/음료 4(트로피카나·할로탑·비욘드미트·코카콜라 라이프) · 하드웨어/가전 5 · 생활용품 2 |
| 서비스·소프트웨어 | 6 | 구글+·Quibi·Munchery·Zume·NastyGal·Birchbox(구독 서비스) |

이 코퍼스는 이미 소비재 중심이다. **건기식 0건**이 유일한 큰 구멍. 낱말 매칭이 여기서 얇은 이유는 편향이 아니라 `claimed_angle`이 사례마다 고유 낱말(레이저·스테비아·3D)로 쓰여 질의 낱말(가격·향·세정력)과 안 겹치기 때문.

### 1-3. 원칙 (strategy_principles 32)
| 성격 | 건수 |
|---|---|
| 파이프라인 운영 원칙 — 채널·법무·robots·인프라·경쟁사 도구 | **27** |
| 셀러에게 줄 수 있는 제품·가격 원칙 | 5 (SP-001~003 SaaS 프라이싱, SP-004 근거등급 차별화, SP-013 BYO 포지셔닝) |
| 소비재·건기식 관련 | **0** |

태그 상위: channel 15 · legal 14 · infra 5 · robots-txt 5 · risk-accepted 5. 이 코퍼스는 **우리 팀의 운영 원장**이지 셀러 처방 원장이 아니다. "가격"·"광고" 같은 낱말로 셀러 화면에 끌려 나오는 것이 A/B에서 원칙 관련도 0.00이 나온 이유다. → §3 권고 ①.

### 1-4. 질의 유형 — 실제 페인 속성 35건(mock 제외, 10 프로젝트; 탈모샴푸 계열이 다수 + 유산균)
| 유형 | 건수 | 예 |
|---|---|---|
| 효능(탈모·두피·장 개선) | 9 | 탈모 증상 완화 효과, 배변활동 및 장 트러블 개선 |
| 가격·가성비·할인 | 6 | 가격 및 할인 혜택, 가격 및 병원비 대비 가치 |
| 세정력·피지·체취 | 5 | 지성 두피 세정력 및 체취 제어 |
| 사용감·거품·감촉 | 4 | 사용 후 머릿결 감촉(뻑뻑함), 목넘김이 편한 캡슐 크기 |
| 향 | 3 | 향(약 냄새) |
| 자극·안전성·성분 | 3 | 두피 자극 및 저자극 성분 |
| 용기·펌프 | 3 | 펌프 용기 토출 편의성 |
| 제형·보관·용량 | 2 | 실온 보관의 편리성, 500억 고함량 보장 |

반복되는 것은 **효능 입증 / 가격 정당화 / 사용감·향 같은 감각 품질 / 용기 같은 실물 UX** — 전부 실물 소비재 특유의 질의다. 지금 코퍼스에서 이 넷을 다루는 승인 무브는 e.l.f. 가격 대조 1건뿐.

## 2. 추가 후보 — 출처까지 (편입 전 사실확인 필수, 등급은 편입 라운드에서)

### 2-1. 선례(성공 무브) 후보 — case_studies
| # | 브랜드 | 카테고리 | 후보 무브(레버 · 병목) | 1차 출처 |
|---|---|---|---|---|
| S1 | AG1 (Athletic Greens) | 건기식·그린스 파우더 | 단일 SKU + 구독 + 팟캐스트 호스트리드 광고로 2024 매출 $600M (CHANNEL/OFFER · AWARENESS·RETENTION) | https://www.fastcompany.com/91538779/ag1s-green-with-envy-over-the-gummy-ification-of-wellness · https://www.latterly.org/ag1-marketing-strategy/ |
| S2 | Hims & Hers | 탈모 치료 D2C(텔레헬스) | 피나스테리드+미녹시딜 구독 $30~50/월, 2024 말 활성 구독 223만(+45%) — **탈모 질의와 직접 겹침** (OFFER/PRICING · CONVERSION) | https://krokerequityresearch.substack.com/p/91-hims-and-hers-a-reality-check · Hims 10-K 2024(확인 필요) |
| S3 | Native | 데오드란트 D2C | 초기 광고 0, 리뷰 1.5만·이메일 리스트·모녀 구전으로 2.5년 만에 P&G $100M 매각 (CONTENT/TRUST · AWARENESS) | https://techcrunch.com/2017/11/15/procter-gamble-just-bought-this-venture-backed-deodorant-startup-for-100-million-cash/ · https://www.practicalecommerce.com/native-deodorant-founder-on-scaling-to-100-million-in-2-years |
| S4 | Ritual | 건기식·멀티비타민 | 성분 원산지 추적(traceable) 투명성 소구 (CONTENT · TRUST) | https://blog.prontous.com/trending-supplement-dtc-brands/ (2차, 1차 출처 필요) |
| S5 | Seed (DS-01) | **유산균** | 임상·균주 근거 소구 + $50/월 구독 (CONTENT/PRICING · TRUST) — 유산균 프로젝트와 직접 겹침 | https://www.fastcompany.com/91538779/… (동일 기사 언급, 1차 출처 필요) |
| S6 | 종근당건강 락토핏 | **국내 유산균** | 대중가·대용량·편의점/온라인 편재로 국내 1위 (PRICING/CHANNEL · CONVERSION) | https://www.foodtoday.or.kr/news/article.html?no=200302 · 전자신문 https://www.etnews.com/20250421000142 |
| S7 | Dr. Squatch | 남성 비누 D2C | 유머 유튜브 광고로 카테고리 재정의 (CONTENT · AWARENESS) | 출처 미확보 — 조사 필요 |
| S8 | Liquid Death | 생수 | 브랜딩만으로 프리미엄 가격 정당화 (POSITIONING · PRICING) | 출처 미확보 — 조사 필요 |

### 2-2. 실패 사례 후보 — failed_angles
| # | 사례 | 카테고리 | 실패한 소구점(claimed_angle 초안) | 1차 출처 |
|---|---|---|---|---|
| F1 | Care/of | **건기식**·개인화 비타민 구독 | "퀴즈로 맞춘 개인화 비타민 구독" — 2024-06 자금 소진으로 143명 전원 해고·폐업 | https://www.retaildive.com/news/careof-is-shutting-down/719106 |
| F2 | Flower Beauty | 색조(연예인 브랜드) | 셀럽 이름값으로 매스 유통 — 2025-09 폐업 | https://www.thestreet.com/retail/12-year-old-beauty-brand-closing-nearly-all-stores-glossier (언급, 개별 출처 필요) |
| F3 | Pat McGrath Labs | 프리미엄 색조 | 아티스트 프리미엄 — 2025-12 자산 경매·2026 Ch.11 | 동상 |
| F4 | Cover FX · Mally Beauty | 색조 | AS Beauty 2026-01 정리 | 동상 |
| F5 | Glossier 오프라인 | 뷰티 | 12년차에 매장 대부분 폐점 | https://www.thestreet.com/retail/12-year-old-beauty-brand-closing-nearly-all-stores-glossier |
| F6 | Function of Beauty | **맞춤 샴푸** — 탈모샴푸 질의와 직접 겹침 | "퀴즈 기반 개인화 샴푸" — 2026 생산시설 폐쇄·68명 해고 | https://www.crainsgrandrapids.com/news/manufacturing/hair-products-manufacturer-to-permanently-close-grand-rapids-area-production-plant-lay-off-68-workers/ |
| F7 | Prose | 맞춤 헤어케어 | 2023 감원(규모 미확인) — 실패 판정 보류, 관찰 | https://jingdaily.com/posts/inside-beauty-s-global-layoff-wave |
| F8 | 국내 유산균 시장 정체 | **유산균** | 장 건강 단일 소구의 한계 — 내수 2022 8,520억 → 2024 7,777억(추정), 프리미엄/저가 양극화 | https://www.koreabiopharm.com/news/34b2a525-6826-436d-b2b0-bb53af2457c7 · https://www.etnews.com/20250421000142 — 사례가 아니라 시장 신호. failed_angles 형식엔 안 맞고 원칙(SP) 후보 |
| F9 | 건기식 허위·과장 광고 적발 7,577건(식품 전체의 30%) | 건기식 | "효능 단정 광고" 자체가 제재 리스크 — 원칙 후보 | https://www.marqvision.com/kr/blog-kr/explore-health-supplement-market-trend-2025-risk-unsales-online-marketplaces (2차, 식약처 원자료 필요) |

**바로 편입 가능(1차 출처 확보)**: F1 Care/of, F6 Function of Beauty, S3 Native, S6 락토핏. 나머지는 1차 출처 확보가 먼저.

## 2-3. 4라운드 처리 결과 (2026-09-21 남헌 승인)
| 후보 | 처리 | 비고 |
|---|---|---|
| F1 Care/of | **failed_angles 편입** (`careof-personalized-vitamin-subscription`, 추정) | PR #193 |
| F6 Function of Beauty | **failed_angles 편입** (`function-of-beauty-custom-shampoo-plant`, 추정) | 브랜드는 판매 중 — "후퇴 사례"로 서술. Crain's 단일 출처 |
| S3 Native | **case draft** `native-deodorant-reformulation-reorder` | 재구매율 21→50%(1인칭 인터뷰) A · 전 고객 이메일 D |
| S6 락토핏 | **case draft** `lactofit-mass-price-probiotics` | ⚠️ "국내 1위"는 2020년까지. 2021년 hy 에 1위 내줌(메디컬투데이) → outcome mixed. 1인칭 출처 없음 |
| S2 Hims | **case draft** `hims-hair-loss-rx-subscription` | 8-K 기반 A. 탈모 부문 단독 수치 없음 — 전사 기준 명시 |
| S5 Seed | 보류 | 1차 출처 미확보(Fast Company 언급뿐) |
| S1 AG1 · S4 Ritual · S7 Dr. Squatch · S8 Liquid Death · F2~F5 뷰티 4건 · F7 Prose · F8·F9 원칙 후보 | **다음 라운드 후보(idea-backlog)** | 1차 출처 확보가 선행 |

승인 대기 draft 케이스 3건은 남헌이 `/cases` 에서 검수한다. 세션은 approved 로 바꾸지 않는다.

## 2-4. 건기식(supplement) 도메인 공백 — 다음 라운드로
이번 편입 뒤에도 **건기식 사례는 실패 1(Care/of) · 선례 1(락토핏, draft)** 뿐이다. 유산균 프로젝트 질의(효능 입증·고함량 보장·실온 보관·캡슐 크기·가격)에 직접 닿는 무브는 락토핏 PRICING 하나다. **건기식 전용 사례 추가 조사 필요** — 다음 라운드 후보 축:
- 성공: Seed(임상·균주 소구, 1차 출처 필요) · AG1(단일 SKU 구독) · 고려은단(비타민C, 국내) · hy 야쿠르트(기능성 인증으로 1위 탈환 — 락토핏 케이스의 반대편)
- 실패: 국내 유산균 과장광고 제재 사례(식약처 원자료) · 프리미엄 유산균 D2C 중 철수 사례(조사 필요)
- 원칙 후보: F8 "장 건강 단일 소구의 한계·양극화"(전자신문) · F9 "효능 단정 광고 = 제재 리스크"(식약처 통계)

## 3. 권고 (다음 라운드)
1. **원칙 코퍼스를 셀러 화면에서 분리** — `strategy_principles`는 운영 원장이다. 처방 카드 Corpus C 는 `tags`에 `seller` 류 태그가 있는 행만 내거나, 아예 빼고 소비재 원칙(F8·F9 같은 시장 신호)을 따로 적립. 이것만으로 A/B의 무관 카드 약 3분의 1(원칙 매칭분)이 사라진다.
2. **건기식·헤어케어 케이스 4건 우선 편입** — S2 Hims(탈모), S5 Seed·S6 락토핏(유산균), F1 Care/of(건기식 구독), F6 Function of Beauty(맞춤 샴푸). 현재 질의 35건 중 효능·가격 유형(15건)이 곧바로 짝을 얻는다.
3. `failed_angles.claimed_angle`에 **질의 낱말이 들어가게** 쓴다 — "가격"·"향"·"효능"·"용기" 같은 페인 유형 낱말을 소구점 문장에 넣지 않으면 낱말 매칭이 영원히 못 잡는다(케이스 연구 프롬프트 지침에 추가).
4. 카테고리 필터(PR #190)는 유지하되, 코퍼스가 소비재로 채워진 뒤 **카테고리 태그(뷰티/건기식/식품/생활)** 2차 필터를 얹는다 — 지금은 축이 될 값이 케이스에 없다(`business_model`뿐).
