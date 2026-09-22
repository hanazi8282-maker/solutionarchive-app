# SaaS 1인 창업가 피봇 — MVP 9/30 가능성 평가 (CEO-STAFF, 2026-09-23)

> 위임: 2026-09-22 Fable 위임 프롬프트(A 소요시간 평가 · B 설계 위임 · C 엔진 재사용 원칙 · D Notion 기록).
> 조사: architect(엔진 재사용·소요시간) + cmo(코퍼스·VOC·프로필) 병렬 → CEO-STAFF 가 DB 직접 실측으로 더블체크.
> 코드·DB 변경 0. 이 문서만 새로 썼다. 숫자는 전부 출처가 붙어 있고, 못 본 것은 "확인 불가"다.

## TL;DR (3줄)

1. **9/30 까지 9개 기능 전부는 불가능하다.** 코드만 71~93h(architect 추정, 항목별 근거 §3), 결제는 코드가 아니라 가맹 심사 일정에 걸리고, 일반 가입 개방은 `CLAUDE.md §10.2` 사람 판단 예외(인증 경계 확장)라 세션이 못 연다.
2. **진짜 병목은 코드가 아니라 데이터다.** DB 승인 케이스 16건 중 SaaS 3건, 실패 경고 원장 30행 중 SaaS 0건, 실제 수집되는 VOC 소스 2곳(다나와·YouTube) 모두 소비재. SaaS 창업가가 모인 소스 5곳(Reddit·Indie Hackers·Product Hunt·디스콰이엇·G2/Capterra)은 **전부 약관·자격증명으로 이미 탈락 판정**이 문서에 있다.
3. **권고: 9/30 은 "허용목록 베타 데모" 5조각(≈30h)으로 열고, 결제·일반가입은 10/4 이후, 코퍼스 14건(병목 7종 × 2곳) 은 10/7 목표.** 오늘 남헌이 할 일은 코드가 아니라 **결제 가맹 신청 접수**와 **기각 케이스 3건 복구 승인**이다.

---

## 1. 결정 필요 — 남헌만 답할 수 있는 것 (7건)

각 항목: 질문 → 선택지 → 권고 → 이유.

**Q1. 9/30 범위를 무엇으로 잡나.**
- A. **데모선 5조각(≈30h)**: 랜딩 + 문제→케이스 검색 + 등급 노출 강화 + 실패 경고 SaaS 12~20행 + HN·OKKY·벨로그 타깃 등록. 허용목록 안에서만 연다.
- B. 9개 전부 착수: 8일 × 10h = 80h 상한인데 코드만 71~93h → 어느 것도 완성 안 된 채 9/30 을 맞는다.
- C. 9/30 을 10/7 로 미루고 A + 코퍼스 14건 + 비교 인사이트까지.
- **권고 A.** 이유: 10/12 베타테스터 모집이 진짜 마감이고, 그때까지 필요한 건 "한 번 써 볼 수 있는 화면"이지 결제가 아니다. B 는 §7 규칙상 "안전장치가 걸려 끝난 실행"을 양산한다.

**Q2. 일반 가입을 언제 여나.**
- A. **10/12 베타까지 허용목록 유지** — 베타테스터 이메일을 허용목록에 넣는 것으로 충분. 코드 0h.
- B. 10/4 일반 가입 개방 — 소유자 분리(라우트 23개·페이지 15개 전수 점검) 12~20h + §10.2 예외 3 사람 판단.
- **권고 A.** 이유: 지금 앱은 모든 DB 조회가 service_role 이라 로그인한 전원이 남의 프로젝트·VOC 를 본다(`CLAUDE.md §5-1`, `analysis_projects.owner_email` 은 있으나 필터에 안 쓰임). 이 상태로 가입을 열면 첫 베타테스터가 다른 사람 데이터를 본다.

**Q3. 결제사를 무엇으로, 언제 신청하나.** (남헌만 할 수 있다 — 사업자 정보 필요)
- A. **포트원(토스페이먼츠 경유) — 원화·국내 창업가 대상.** 심사 기간은 확인 불가.
- B. Stripe — 해외 결제·달러. 한국 사업자 등록 절차가 별도.
- C. 결제 없이 10/19 첫 매출을 계좌이체·수기 인보이스로 만든다(베타 5~10명 규모면 성립).
- **권고: C 를 기본으로 두고 A 를 오늘 접수.** 이유: 리포에 결제 자산이 0(`stripe|toss|payment|billing` grep 무관 히트뿐)이고 webhook·멱등 처리 16~24h 는 줄일 수 없는 신뢰경계다. 첫 매출 10/19 는 결제 위젯 없이도 가능하다.

**Q4. 기각된 SaaS 케이스 3건(Figma·Notion·Slack) 을 복구하나.**
- DB 실측: 이 3건은 09-16 재검수에서 **"타깃 불일치"가 아니라 "인사이트 등급 C/D — transfer_note 미기재"** 로 기각됐다(review_note 원문). 사실 조사는 이미 돼 있다.
- A. **transfer_note·preconditions 두 문장씩 써서 재상신 → 남헌이 /cases 에서 케이스·무브 각각 재승인.** 건당 20~30분(cmo 추정), 신규 출처 0.
- B. 기각 유지, 새로 조사.
- **권고 A.** 이유: SaaS 승인 무브가 5건 → 11건이 된다. 단 `transferability` 는 사람만 쓰는 필드라 남헌 클릭이 6번 필요하다.

**Q5. Open Startup / Baremetrics Open 대시보드를 "비자기보고 1차"(= 사실확인 A 가능) 로 볼 것인가.**
- 현재 산식(`lib/cases/draft.ts:225-320`)은 창업자 자기보고를 C 로 고정한다. 1인 SaaS 는 공시가 없어 **SaaS 무브는 거의 전부 C** 가 되고, C 무브로는 칼럼·스레드 발행이 CG-1 에 걸린다.
- A. 규칙 개정(Stripe 자동집계 대시보드 = 비자기보고) → 일부 A 복구. 모집단은 작다(참여사 7곳 수준, cmo 조사).
- B. 현행 유지 — 제품 화면은 C 로도 나가므로(advisor 는 D 만 제외) MVP 에는 지장 없고, 콘텐츠 발행만 갈린다.
- **권고 B(MVP 기간) → 10/4 이후 A 재검토.** 이유: 지금 개정하면 재채점이 코퍼스 전체에 번진다.

**Q6. GitHub Issues/Discussions 수집 — AUP §7 용도 제한을 인수하나.**
- 기술 검증은 전부 통과(`docs/review-source-findings-round5-b.md:300-398`). 남은 건 법적 판단뿐. 경쟁 SaaS 불만의 1차 자료.
- A. 인수하고 켠다(§10.2 예외 4 — 새 법적 리스크, 사람 판단). B. 보류.
- **권고 B(MVP 기간).** 이유: HN·OKKY·벨로그 3곳이 코드 0줄로 켜지므로 8일 안에 GitHub 까지 갈 손이 없다.

**Q7. 기존 소비재 코퍼스·소스 처분.** (확인만)
- 삭제하지 않는다 — §10.2 예외 1(되돌리기 어려운 삭제). 화면 필터(`business_model IN ('SAAS','SUBSCRIPTION')`) 로 숨긴다. 되돌릴 수 있다.
- 남헌이 "삭제" 를 원하면 그때 별도 상신.

---

## 2. 개선안 — 지금 구조에서 바꾸면 나아지는 것 (6건)

1. **D 등급 양산 구조.** 무브 103건 중 D 50건의 사유가 **전부 "transfer_note 미기재"** 다(cmo, validate 출력 grep). 조사가 얕아서가 아니라 안 적어서다. → 무인 루프의 초안 작성 프롬프트에 transfer_note·preconditions 를 필수 출력으로 걸면 D 양산이 멈춘다. 비용 1h 이하.
2. **`config/pain-terms.json` 이 편입 게이트를 잡고 있다.** 41낱말이 전부 화장품·건기식(효능·세정력·향기·제형·용기·펌프). 신규 무브·실패 앵글은 이 낱말 1개 이상 포함이 코드로 강제된다(`lib/cases/draft.ts:74-79`). → **SaaS 낱말로 교체하지 않으면 SaaS 케이스는 편입 자체가 막힌다.** 반나절. 다른 모든 코퍼스 작업의 선행 조건.
3. **`productKindOf()` 2갈래 필터** (`lib/cases/advisor.ts:231-233`): SaaS 질의에는 SAAS 6건 외 45건이 통째로 빠진다. 지금은 코퍼스가 작아 "0건"이 급증한다. → MVP 기간엔 필터를 "정렬 가산점"으로 낮추고, 코퍼스 14건 뒤에 다시 하드필터로.
4. **문서 불일치 2건 정정 필요.** (a) `CLAUDE.md §2` 는 Tailwind+shadcn/ui 라고 적지만 `package.json` 에 둘 다 없다(deps 5개). 랜딩은 `app/_ds` 전제로 잡아야 한다. (b) `review_sources.reddit.disabled_reason` 에 "남헌 승인으로 활성화" 라 적혀 있는데 `enabled=false` 다 — 기록 모순.
5. **프로필: 묻는데 안 쓰는 항목이 3개.** `price_band`·`buyer_type`·`purchase_frequency` 는 매칭에 안 쓰인다(roadmap §3-1). 프로젝트 26건 중 패싯 채운 건 1건, `seller_profiles` 0행 — "잘 써도 추천이 안 바뀐다" 경험이 원인. → 안 쓰는 항목은 선택으로 내리고, 필수는 매칭에 실제로 닿는 4개만(§4-C).
6. **위임 프롬프트의 전제 3개가 사실과 다르다.** (a) HackerNews 어댑터는 은퇴하지 않았다 — 은퇴한 건 연구용 Firebase C 프로브 워크플로 하나. 어댑터·소스·크론 전부 살아 있고 **타깃이 0건**일 뿐. (b) "2주간 케이스 1건" 이 아니라 무인 루프가 하루 2건씩 초안을 쌓았고, DB 에 draft 12건이 승인 대기 중이다 — 병목은 조사가 아니라 **승인·사실확인·이식성 판정(사람)**. (c) worktree `content/evidence-backfill-saas`·`reader-axis-saas4` 는 이미 main 에 흡수된 stale 브랜치다.

---

## 3. 기능별 평가 — 재사용 / 새로 만들 것 / 소요 / 판정

(항목당 한 줄. 상세 file:line 근거는 architect 보고 원문 — 이 문서 끝 "부록" 참조.)

- **1 프로필+관심분야 추천** — 재사용: 프로필 화면·API·`seller_profiles`·PMF 엔진·패싯 어휘에 `SAAS` 이미 있음. 없음: "관심분야→기회 목록" 화면 자체. **8~10h · 🟡** — 코드는 싸지만 SaaS VOC 0건이라 추천할 내용이 없다. → 9/30 은 라벨 SaaS화 1h 만.
- **2 문제→케이스 매칭 검색** — 재사용: `matchMoves`·advisor 3코퍼스·LLM 재랭킹 게이트 전부 있음. 없음: 자유 텍스트 입구(독립 검색 화면/API). **7h · 🟡** — 코퍼스가 SaaS 3건이라 "스탠리 텀블러가 나가거나 0건" 양자택일. → 9/30 포함, 단 코퍼스 작업과 짝.
- **3 성공/실패 원인 비교** — 스키마는 담을 수 있음(`outcome_direction`·`preconditions`·`transfer_note`). 없음: 짝 뽑는 함수+화면. **6h · 🟡→🔴** — **DB 실측: 성공·실패 짝 3묶음(AWARENESS/CONTENT, SUPPLY/OPERATIONS, TRUST/OPERATIONS), SaaS 끼리 짝은 0쌍.** → 자른다. 코퍼스 뒤에.
- **4 실패 경고** — 거의 다 있음: `failed_angles` 테이블·동기화 스크립트·어드바이저 배선·빨강 카드 화면. **코드 0~1h · 🟢 / 콘텐츠 🔴** — **DB 실측: 30행 중 SaaS 0건**(Google+·Quibi 는 소비자 서비스). 등급 기계를 우회하는 독립 트랙이라 케이스스터디 없이 채울 수 있다. 건당 15~30분(cmo 추정) → 8일 12~20행 현실적. 선행: pain-terms 교체.
- **5 칼럼 섹션** — 있음: 초안 12편·`content_columns`·스테이징·검수 화면·가독성 검사·OG 이미지 생성 선례(`next/og`, 신규 의존성 0). 없음: 공개 읽기 화면·마크다운 렌더러·케이스↔칼럼 링크 컬럼. **12h · 🟡** — SaaS 칼럼은 ConvertKit·Notion 2편뿐이고 공개 경로 추가는 §10.2 사람 판단. → 자른다(이미지 생성 2h 만 나중에).
- **6 랜딩페이지** — 없음(`app/page.tsx` 5줄 redirect). 재료: `app/_ds` 디자인 시스템. **6~8h · 🟡** — 위험점 하나: `PUBLIC_PREFIXES` 에 `/` 를 넣으면 `under()` 로직상 **전 경로가 열린다**. 정확일치 분기 + `scripts/auth-selftest.mjs` 음성 검사 필수. → 9/30 포함.
- **7 결제** — 없음(0). 전부 신규: 결제사·가맹 심사·위젯·webhook 서명 검증·`subscriptions` 테이블·요금제 게이트. **코드 16~24h + 심사(코드 밖) · 🔴** → 9/30 에서 뺀다. 오늘 할 일은 접수.
- **8 보안** — 있음: Google 로그인 + 허용목록 fail-closed(목록 비면 전원 차단), 3상태 판정, RLS 정책은 `seller_profiles`·`wtp_signals` 5개. 없음: 소유자 분리(모든 조회가 service_role). **12~20h · 🔴** + §10.2 예외 3. → 열지 않는다(Q2).
- **9a 요금제 등급** — 7 과 한 몸. 없음.
- **9b 증거등급 노출** — 이미 강함: `GradeBadge`·A/B/C/D 필터 칩·추정/미검증 배지·SP-004 "유일한 방어 가능 차별화". 구멍: 셀러 화면에 `fact_check_grade` 가 안 나가고 "무엇이 A인가" 범례 0. **3~5h · 🟢** → 9/30 포함. 가장 싸고 가장 차별화.

**합계**: 코드 71~93h(중앙값 ≈81h) · 부대(HN 타깃 1~2h, 새 소스 8~14h/곳) · 사람 콘텐츠(실패 12건 12~24h, SaaS 케이스 12건 12~24h) → **전체 105~141h + 가맹 심사.** 8일 이론 상한 80h.

---

## 4. 설계 위임분(B) — 제안

**4-A. SaaS 케이스 코퍼스 전략 (권고: A-1 + A-2 먼저, A-3 은 10/7)**
- A-1 "제로 리서치 승격": Figma·Notion·Slack 6무브에 transfer_note+preconditions 만 써서 재상신(Q4). SaaS 승인 무브 5 → 11.
- A-2 "실패 원장 우선": `docs/failed-angles.md` 에 SaaS 실패 앵글 12~20행(노코드 툴 난립·AI 래퍼·크레딧 절벽·PLG 없는 엔터프라이즈 전환 등) → `scripts/failed-angles-sync.mjs`. 등급 기계 우회.
- A-3 "문제 유형 7 × 2건": 유형은 새로 만들지 않고 `config/reader-problems.json` 의 기존 7개(MAKE_BUT_NO_MONEY·NO_FIRST_CUSTOMER·PRICE_TOO_LOW·ONE_OFF_ONLY·NO_CHANNEL·SOLO_CEILING·NOBODY_TRUSTS_ME) 를 쓴다 — SaaS 1인 창업가에 그대로 맞는다. 14건 중 기존 SaaS 재활용 후 신규 8건 = 2주(roadmap §3-2 기준) → 10/7.
- 출처 등급 판정(cmo): SEC/DART = A 즉시(1인 SaaS 해당 없음) · 창업자 블로그·Indie Hackers 인터뷰·YC/MicroConf = C(교차 관측 없음) · Open Startup 대시보드 = 규칙 개정 시 A(Q5) · Starter Story·X 스레드 = C, 단독 근거 금지 · postmortem = `failed_angles` 로 가면 등급 불필요.
- 사람 검증 배치: C 이하만 배치 채점, `remedy_verdicts.human_verdict` 가 이미 `verdict` 를 이기는 구조라 새 테이블 불필요.
- **대가**: 병목 7종 중 매칭 성립은 2~3개. SaaS 무브는 거의 C 라 **이 케이스로는 칼럼·스레드 발행 불가(CG-1)** — 8일간 제품과 콘텐츠가 갈린다.

**4-B. VOC 소스 (권고: 새 소스 0, 만들어 둔 셋에 타깃만 — HN · OKKY · 벨로그)**
- HackerNews: 어댑터·크론·소스 ON, robots 404=규칙 없음, 인증 불필요. **타깃 0** → `q:<키워드>` 10~20개(문제 유형별: `q:churn`, `q:pricing saas`, `q:cold email`). 현재 댓글만 수집 — Show HN/Ask HN 본문은 `tags=story` 한 줄(CTO 판단). 발굴 엔진 `kind='saas'` 프로브가 이미 hn.algolia 를 쓴다.
- OKKY: 어댑터 완성·약관 조항 0·본문+댓글 JSON-LD. 한국 1인 개발자 목소리. `url:` 타깃만.
- 벨로그: 어댑터 완성·꺼짐. 본문 전용(댓글은 GraphQL 계약 밖). "왜 접었나" 회고.
- GitHub: 조건부(Q6).
- 탈락 확정(재조사 불필요): Reddit(자격증명 미발급 + 수동 승인 큐 + 상업 유료 계약, SP-005 GummySearch 선례) · Indie Hackers(약관 (h)항 명시 금지 — robots 는 허용이라 함정) · Product Hunt(SP-008 API 상업 금지 + captcha) · 디스콰이엇(약관 금지, relate.kr/terms) · G2/Capterra(SP-007 + robots 가 ClaudeBot 지목 차단 + 403).
- 디스콰이엇 활용: 자동 수집 대신 사람이 읽고 카카오 인사이트 입구(`saved_examples`) 손 입력 — 이미 개통.
- **대가**: 영어(HN)+한국어(OKKY·벨로그) 혼재 → 추출 프롬프트 2언어. 그리고 HN·OKKY 는 "개발자가 모인 곳"이지 "SaaS 구매자가 불만 말하는 곳"이 아니다 — VOC 질이 다나와 시절보다 떨어질 가능성(추정). 막힌 이유가 도달성이 아니라 약관이라 소스를 더 뒤져도 안 풀린다.
- 신규 어댑터 1개 비용(실측): 약관 clear 시 4~6h, 조사부터면 8~14h. 5곳 동기화(어댑터·`review-collect.mjs`·`nightly-review-collect.yml`·`target-ref.ts`·마이그레이션).

**4-C. 프로필 입력 항목 (권고: 필수 4 + 선택 1)**
- 원칙: **물어본 것이 전부 매칭에 쓰이게.** 안 쓰는 항목을 필수로 걸면 "잘 써도 추천이 안 바뀐다" 가 재현된다.
- 필수 ① 지금 막힌 곳 `bottleneck` — 재사용, `matchMoves` 유일한 하드필터. SaaS 라벨로(예: CONVERSION='무료로는 쓰는데 결제를 안 한다').
- 필수 ② 지금 겪는 문제 유형 `reader_problem` — **신규 컬럼(사용자 쪽)**. 어휘는 `config/reader-problems.json` 7개 재사용. 기능(2) 의 연결고리 — 지금은 `case_studies` 에만 있다.
- 필수 ③ 만드는 것 한 줄 `pitch` — 재사용, 처방 질의 낱말의 절반.
- 필수 ④ 관심 분야/시장 `market` — 재사용(자유텍스트 ≤200자), 기능(1) 입력.
- 선택 ⑤ 보유 스킬·시간 여력 — 신규 1필드. 무브의 `preconditions` 와 대조하는 자리가 이미 설계돼 있어 "이 무브는 당신 조건에 안 맞는다" 를 말할 수 있다.
- 선택으로 내림: `price_band`·`buyer_type`·`purchase_frequency`(매칭 미사용). 빼는 것: 도메인 경험(`market` 과 중복)·목표 매출·기간(소비할 코드 없음).
- 라벨 정본은 `lib/analysis/facets.ts` 한 파일 — 어휘(value)는 절대 안 바꾼다(DB CHECK + `draft.ts` 3중 결합, 바꾸면 INSERT 23514).
- 구멍: 기능(1) "제품 없는 사람에게 아이템 추천" 은 항목 설계가 아니라 **신규 라우트** 문제 — 현재 PMF 는 `competitor_url` 필수(`app/analyze/new/page.tsx:429-442`).
- **대가**: `reader_problem` 컬럼 추가는 스키마 변경(CTO) 이고 매칭 코드까지 이어야 효과. 남헌이 말한 "자본·시간 여력·목표 매출" 은 MVP 에서 빠진다 — 그 값을 소비할 코드가 없어서다.

---

## 5. 9/30 데모선 실행 계획 (Q1-A 채택 시) — 담당·시간

- CTO 세션: 랜딩 7h · 케이스 검색 API+화면 7h · 등급 노출(양등급 병기+범례) 4h · 프로필 라벨 SaaS화 1h · `pain-terms.json` SaaS 교체 0.5일 · `productKindOf` 가산점화 1h · HN/OKKY/벨로그 타깃 등록 2h · 버퍼/QA 5h ≈ **31h**.
- CMO 세션: 실패 앵글 SaaS 12~20행(15~30분/행) · Figma·Notion·Slack 6무브 transfer_note+preconditions(20~30분/무브) · HN `q:` 키워드 목록 ≈ **10~14h**.
- 남헌: 결제 가맹 신청 접수(오늘) · 기각 3건 재승인 클릭(케이스 3 + 무브 6) · draft 12건 승인(소비재지만 코퍼스 유지 결정 시) · 허용목록에 베타테스터 이메일 · Q1~Q7 답.
- 순서 제약: pain-terms 교체 → 실패 앵글·케이스 편입 → 검색 화면. 랜딩·등급 노출은 독립.

## 6. 리스크

- 🔴 **`/` 공개 경로 실수 = 앱 전체 익명 노출.** 랜딩 작업의 유일한 진짜 위험. auth-selftest 음성 검사 없이 머지 금지.
- 🔴 **코퍼스 SaaS 3건으로 검색 화면을 열면 "0건" 또는 "텀블러"** — 검색은 실패 앵글 12행 + 승격 11무브가 들어간 뒤에 켠다.
- 🟡 VOC 질 저하(HN·OKKY 는 개발자 커뮤니티). 추출 프롬프트 2언어.
- 🟡 SaaS 무브 사실확인 C → 콘텐츠 발행 게이트에 걸림. 빌드인퍼블릭 소재는 케이스가 아니라 "만드는 과정" 으로.
- 🟡 결제 심사 기간 확인 불가 — 10/4 마감이 코드 밖 일정에 걸린다.

## 7. 확인 불가로 남긴 것

- 결제사 가맹 심사 소요 기간(외부).
- HN `q:` 타깃별 실제 유입량 — 등록 후 하루 돌려야 안다.
- Open Startup 참여사 실제 수(cmo 는 7곳 수준 기사 인용, 원문 미확인).

## 8. 이 세션이 한 것 / 안 한 것

- 한 것: architect·cmo 병렬 조사, DB 직접 실측 6쿼리(케이스·무브 상태별 건수, 기각 사유, 소스 20행, 성공/실패 짝, `failed_angles` 30행), 부서 보고 정정 3건(§2-6), 이 문서.
- 안 한 것: 코드·마이그레이션·DB 쓰기·발행 전부 0. `/feature` 루프는 1단계(기획·영향범위·리스크)까지만 — 구현은 남헌·Cowork 체크리스트 확정 뒤.

---

## 부록 — DB 실측 원본 (solutionarchive `qmgrfqjfxqhxuufrnkwf`, 2026-09-23)

- `case_studies`: approved 16 · draft 12 · rejected 25. approved 중 `business_model='SAAS'` = ConvertKit·Zapier·Zenefits 3건(Zenefits 는 `drafts/cases/` 에 파일이 없어 두 부서 모두 누락 — 실패 SaaS 케이스다). draft 중 SaaS = Superhuman 1.
- `case_moves`: approved 30 · draft 22 · rejected 54. approved SaaS 무브 = ConvertKit 1 · Zapier 2 · Zenefits 2 = 5.
- rejected SaaS(Figma·Notion·Slack) review_note 원문: "2026-09-16 재검수(evidence_grade 재설계) — 무브 전부 인사이트 등급 C/D(대부분 transfer_note 미기재)".
- 성공·실패 짝(같은 bottleneck+lever, approved 끼리): AWARENESS/CONTENT 3쌍(elf·GoPro·Dr.Squatch ↔ Pets.com) · SUPPLY/OPERATIONS(Purple ↔ Peloton·Oatly) · TRUST/OPERATIONS(Tuft&Needle ↔ Zenefits). SaaS 끼리 0.
- `failed_angles`: 30행, `source_tier` 전부 "공개 보도", `is_estimate` true 17. SaaS 0(Google+ 소셜·Quibi 스트리밍·Google Glass 하드웨어).
- `review_sources`: enabled 14 / disabled 6. 켜졌는데 타깃 0 = hackernews·okky·velog(+82cook 등은 타깃 있음). reddit enabled=false, disabled_reason "약관 리스크 인지 후 남헌 승인으로 활성화 — SP-024" (모순). appstore 는 robots 위반으로 꺼짐.
- `seller_profiles` 0행 · `wtp_signals` 0행 · `content_columns` 12행.
- 부서 보고 원문은 이 세션 대화에만 있다(파일 아님). 필요하면 재요청.
