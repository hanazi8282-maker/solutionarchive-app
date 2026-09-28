# 승인 자동화 4레인 설계 — 자동폐기·자동편입·사람검토·표본감사

작성 2026-09-27 · 설계 문서(구현 없음) · 대상 리포 SolutionArchive
표기: [코드 확인] 리포 파일에서 읽음 · [측정값 인용] 오케스트레이터가 오늘 DB 에서 잰 값 · [추정] 근거는 있으나 실측 아님 · **DB 필요 — 확인 불가** 는 이 세션이 DB 를 안 봐서 못 정한 것

---

## 1. TL;DR

- 지금 "하루 10장"은 `/cases/grade`(케이스·무브 승인)이고, 오늘 잰 T2 데이터는 다른 줄인 `review_relevance_verdicts`(리뷰 관련성 판정)다. 4레인은 **관련성 판정 줄에만** 걸 수 있고, 케이스 승인 줄은 CLAUDE.md §10.1 권한 경계라 자동화 대상이 아니다(§2).
- 관련성 판정 줄은 이미 1차 LLM 혼자서 자동편입(공개 `/signals`)과 자동폐기(extract 제외)를 하고 있다 — 사람 검토 레인도, 표본감사도 없다. 4레인은 자동화를 **더하는 게 아니라 2심 일치 조건으로 조이고 C·D 를 새로 만드는 일**이다(§3).
- 지금 데이터로 켤 수 있는 것은 **섀도 모드뿐**이다. 2심 일치율 49.8% 의 절반가량(65/139)은 두 판정자의 **기준이 달라서** 난 불일치라 먼저 기준을 하나로 맞추고 재측정해야 하고, 사람 정답은 10건뿐이며 그마저 T2 표본과 겹치는 게 0 이라 정확도를 잴 근거가 없다. B 레인 오류 상한 10%(95%) 를 말하려면 일치 표본 사람 채점 30건 무오류가 최소다(§4).

---

## 2. 무엇을 승인하고 있나 — 줄(큐) 목록과 적용 범위

### 2-1. "하루 10장"의 정체

- [코드 확인] `lib/cases/grade-queue.ts:9-10` — `GRADE_PAGE_SIZE = 10`, 주석 "하루 검수 30분 = 카드 10장 (남헌 2026-09-23 Q2-A)". 카드 1장 = `case_studies` 1건, 안에 `case_moves` N건.
- [코드 확인] `app/cases/grade/page.tsx:26-27,91-96` — 헤더 "카드 채점 (하루 10장)", 진행 표시 "오늘 N/10장"은 `reviewed_at` 이 오늘(KST)인 케이스 수.
- [코드 확인] `app/cases/actions.ts:193-299` `gradeCase` — 사람이 누르는 서버 액션 하나로 `case_moves.review_status='approved'` + `case_studies.review_status='approved'` 를 쓴다. `reviewed_by` 는 로그인 이메일(같은 파일 15-16행).
- [코드 확인] `reports/2026-09-23/data-velocity-plan.md:24,64` — "하루 30분 = 케이스 카드 10장" 과 "T3 사람 카드 채점, 하루 10장 … (b) T2 판정 표본 10장 관련/무관 채점" 두 자리가 같은 '10장' 이라는 말로 적혀 있다. **같은 숫자, 다른 줄이다.**

### 2-2. 리포에 있는 검토 줄 전부

- **케이스·무브 승인** — `case_studies`/`case_moves.review_status` draft→approved/rejected. 쓰는 자리: `app/cases/actions.ts`(decideMove/decideCase/gradeCase), `scripts/case-review.mjs`. 규칙: `lib/cases/review.ts`. [코드 확인]
- **리뷰 관련성 판정(T2/T3)** — `review_relevance_verdicts.verdict`(LLM) / `human_verdict`(사람). 쓰는 자리: `scripts/relevance-judge-auto.mjs`(야간 UPSERT, human_verdict 는 payload 에 없음 — 10-12행), `scripts/relevance-grading-sample.mjs` → 마크다운 채점표 → `scripts/relevance-grading-import.mjs`(human_verdict 만 씀). 2차 판정: `scripts/relevance-export.mjs` → 클라우드 세션 → `scripts/relevance-second-opinion-import.mjs`(라벨만 채움, verdict 는 안 건드림 — 8행). [코드 확인]
- **처방 카드 판정** — `remedy_verdicts.verdict` 0/1/2 + `human_verdict`(마이그 `20260928000001_remedy_verdicts.sql:42,46`). 표본: `scripts/remedy-grading-sample.mjs`. [코드 확인]
- **발굴 후보** — `discovery_candidates.verdict`(accepted/rejected/unverified, 프로브 실측이 정함) × `human_review`(pending/kept/killed). `app/discovery/actions.ts:10-12` "verdict 는 절대 건드리지 않는다 … 사람이 뒤집는 것은 human_review 뿐". [코드 확인] — **이미 "기계 판정 + 사람 거부권" 구조다.** D 레인의 본보기로 그대로 쓴다.
- **속성 사람확인** — `/analyze/[id]/review` 의 `human_confirmed`(data-velocity-plan.md:64 (a)). 이번 범위 밖.

### 2-3. 4레인이 덮는 것과 덮지 않는 것

- **덮는다(1단계)**: `review_relevance_verdicts` 한 줄. 이유 셋 — (1) 오늘 잰 데이터가 이 줄 것이다, (2) 2심 신호(1차 LLM × 2차 LLM)가 이 줄에만 있다, (3) 결정이 되돌릴 수 있다(30일 purge 전까지 — 아래 A 레인 주의).
- **덮지 않는다 — 발행**: `posts`·Threads·칼럼. CLAUDE.md §10 "무인 자동 발행 금지", `_principles.md §3`. 무인 루프 환경에 `THREADS_ACCESS_TOKEN` 이 없다(구조). 이 문서의 어떤 레인도 발행과 연결되지 않는다.
- **덮지 않는다 — 등급**: `evidence_grade`·`fact_check_grade`. `lib/cases/review.ts:4-5` "등급은 검수 결정과 별개 축 … 바꾸지 않는다", `app/cases/actions.ts:13`. 관련성 판정 행에는 등급 컬럼 자체가 없다 — 제약 (b) 는 1단계에서 구조적으로 만족된다. 배지는 그래도 단다(§7).
- **덮지 않는다 — 케이스·무브 승인**: CLAUDE.md §10.1 금지 목록 첫 줄 "`review_status` 를 approved/rejected 로 바꾸는 것 — 사람만", `_principles.md §3`. 이건 권고가 아니라 권한 경계다(§10.1 머리글). 게다가 2심 신호가 없다 — 케이스에는 1차 LLM 판정도 없고 `fact_check_grade`·`outcome_direction`·`transfer_note`·`case_feedback` 투표만 있다. 오늘 데이터로 임계값을 만들 수 없다. 남헌이 §10.1 을 고치기로 하면 별도 설계(§8 결정 1).
- **덮지 않는다(지금은) — 처방 카드·발굴 후보**: 처방은 같은 human_verdict 패턴이라 2단계 후보. 발굴은 이미 D 레인 꼴이라 손댈 것이 없다.

---

## 3. 레인 정의 — 2심 일치 신호

### 3-1. 왜 LLM 한 명의 판정을 신뢰도로 못 쓰나

- [측정값 인용] `review_relevance_verdicts` 에는 **confidence/score 컬럼이 없다.** 있는 것은 verdict 3값·reason 한 줄·라벨 4개뿐.
- [코드 확인] `lib/analysis/relevance-judge.ts:11-13` — mock·파싱 실패·라벨 누락·호출 실패는 전부 `unknown`. 즉 `unknown` 은 "모델이 애매하다고 했다"와 "호출이 깨졌다"를 합친 값이라 신뢰도 척도가 아니다.
- [코드 확인] `scripts/relevance-grading-sample.mjs:7-9` 가 이미 적어 둔 이유 — "측정자와 필터가 같은 모델이 된다. 그 숫자로 정밀도를 주장할 수 없다." 한 모델이 스스로 낸 확신값도 같은 모델의 산출물이다.
- 그래서 신뢰도는 **독립된 두 판정의 일치**로만 만든다. 일치가 곧 정답은 아니지만(둘이 같이 틀릴 수 있다), 불일치는 확실히 "사람이 봐야 할 것"이다. 일치 → 정답 확률은 §4 의 사람 채점으로만 잰다.

### 3-2. 신호 — 스키마에 실제로 있는 것만

- `v1` = `verdict`(야간 1차, `scripts/relevance-judge-auto.mjs`, model 컬럼에 모델명). [코드 확인]
- `v2` = 2차 판정. **지금은 컬럼이 없다.** 클라우드 세션 결과가 `ops/state/relevance-second-opinion-2026-09-27.json` 파일에만 있고 import 는 라벨 4개만 채운다(`second-opinion.ts:7`). §7 에서 컬럼을 더한다.
- `human_verdict` = 정답. 있으면 v1 을 이긴다(`relevance-judge.ts:323-324`, `feed.ts:232`). 레인은 human_verdict 가 NULL 인 행에만 존재한다.
- 라벨 정합성 = v2 가 relevant 라면서 라벨 4개 전부 NULL 인 행은 약한 신호(`labels_unavailable_reason='opinion_no_pain_signal'`, 마이그 `20260930000016`). [코드 확인]
- `analysis_inputs.purged_at` = 되돌릴 수 있는 시한. 원문은 30일 뒤 purge 되고 되돌릴 방법이 없다(`relevance-judge.ts:13`). [코드 확인]
- `analysis_projects.business_model` = 층(SaaS/소비재). 남헌 09-27 지시로 2차 판정은 SaaS 5개만 했다(JSON `scope_note`). [측정값 인용]

### 3-3. 레인 규칙

- **B 자동편입** = `v1=relevant ∧ v2=relevant`, human_verdict NULL. 효과: extract 입력 유지 + `/signals` 공개 — **둘 다 지금 v1 하나로 이미 일어나는 일이다**(`extract-run.ts:276`, `feed.ts:232`). 새로 생기는 것은 `lane='B'` 기록과 배지, 그리고 D 감사 대상이 되는 것뿐. human_verdict 는 절대 쓰지 않는다 — 레인은 별도 컬럼이다.
- **A 자동폐기** = `v1=irrelevant ∧ v2=irrelevant`, human_verdict NULL. 효과: extract 에서 제외 — **역시 지금 v1 하나로 이미 일어난다**(`dropIrrelevant`). 4레인 뒤에는 `v1=irrelevant` 단독은 A 가 아니라 C 다. 즉 A 를 켜는 것은 폐기를 **줄이는** 변경이다. 단 purge 시계가 도니까 C 에 오래 머문 행은 사람이 못 본 채 사라진다 — §8 위험 1.
- **C 사람검토** = 나머지 전부: v1≠v2, 어느 쪽이든 unknown, v2 없음(2차 미실행·쿼터). 기본 동작은 **레인 도입 전과 같다(v1 대로)** — 사람이 결정할 때까지 행동을 바꾸지 않는다. 줄 세우기: SaaS 먼저 → purge 임박 먼저 → 오래된 것 먼저(`grade-queue.ts:58` 발상 재사용).
- **D 표본감사** = A·B 행 중 무작위 표본을 사람이 채점(`relevance-grading-sample.mjs` 에 층 옵션 추가). 결과는 기존 `human_verdict` 로 들어가고(`relevance-grading-import.mjs`), human ≠ lane 이면 오류 1건. 항목의 레인이 아니라 **감사 표시**(`audit_sampled_at`)다.

### 3-4. 오늘 데이터를 레인에 얹으면

- [측정값 인용] SaaS 5개 282행(전부 `v1=relevant`, export 가 공개 범위만 담았기 때문 — `relevance-export.mjs:32`): B(RR) 138 · C(RI) 139 · C(unknown) 5. **A(II) 는 0 건 — 데이터가 없다.** v1=irrelevant 행 316건은 2차를 안 받았다.
- [측정값 인용] 프로젝트별 B/C: ConvertKit 33/61 · Lemon Squeezy 70/14 · Baremetrics 20/45 · Cal.com 4/20 · Plausible 11/4. 이 세션이 export 파일과 join 해 재계산했고 오케스트레이터 수치와 일치한다.
- **C 가 51%(144/282)다.** 이대로 C 를 켜면 SaaS 공개 행의 절반이 사람 줄에 선다 — 하루 10장 사람이 감당할 양이 아니다. 켜기 전에 아래 기준 불일치를 없애야 한다.

### 3-5. 49.8% 의 절반은 판정자 잡음이 아니라 기준 차이다 — 이 문서가 찾은 것

- [코드 확인] 1차 프롬프트 `relevance-judge.ts:97` — "relevant = 이 목적이 말하는 사용자·문제·제품 맥락을 다룬다. **불만이든 칭찬이든 상관없다.**"
- [측정값 인용] 2차 판정 irrelevant 139건 중 **65건(46.8%)** 의 reason 이 "긍정적 코멘트라 불만이 아니다", "불만·요구가 없다", "추천 언급, 불만 없음" 류다(이 세션이 JSON reason 을 정규식으로 셌다: 긍정/칭찬/불만이 아니/불만·요구 없음/추천/만족). 예: "ConvertKit을 계속 쓰는 이유를 든 긍정적 코멘트로, CK에 대한 불만이 아니다".
- 즉 2차 판정자는 "불만·요구가 있어야 relevant" 기준으로 판정했고 1차는 "맥락이면 relevant" 기준이다. 두 기준이 다르면 일치율은 판정 품질과 무관하게 낮다. 같은 긴장이 09-25 에 이미 `opinion_no_pain_signal` 이라는 이름으로 컬럼에 박혔다(마이그 `20260930000016`).
- 따라서 "1차가 과편입한다"는 추정은 **기준을 어느 쪽으로 정하느냐에 달린 문장**이지 측정 결과가 아니다. §8 결정 2.

---

## 4. 임계값 — 지금 정할 수 있는 것과 없는 것

### 4-1. 정할 수 없는 것(그리고 왜)

- **B 오류율**: 사람 정답과 겹치는 B 행이 0 이다(사람 채점 10건 ∩ T2 282건 = 0). B 오류 상한을 말할 표본이 없다. [측정값 인용]
- **A 오류율**: A(II) 층 자체가 0 건. `relevance-export.mjs --all` 로 v1=irrelevant 316행을 내보내 2차를 받아야 층이 생긴다. [코드 확인 + 측정값 인용]
- **C 비율의 기준선**: 51% 는 기준 불일치가 섞인 값. 2차 프롬프트를 1차 기준(또는 그 반대)으로 맞춘 뒤 재측정한 값이 기준선이다.
- **사람 채점 처리량(관련성 행)**: 잰 적이 없다. 있는 선례는 관련성 10건(1회), 처방 카드 21장 채점표(09-22)뿐. 카드 10장/일은 케이스 카드 값이라 다른 단위다.
- 기존 사람 채점 10건이 어느 층·어느 프로젝트인지: **DB 필요 — 확인 불가.** 확인 쿼리: `select project_id, verdict, human_verdict, human_graded_at from review_relevance_verdicts where human_verdict is not null;`

### 4-2. 최소 보정 표본 — 수식은 이것 하나

- 표본 n 건을 사람이 채점해 **오류 0** 이면, 실제 오류율 p 의 95% 단측 상한은 `1 − 0.05^(1/n)`(≈ 3/n, "3의 법칙"). n=30 → 9.5% · n=60 → 4.9% · n=100 → 3.0% · n=150 → 2.0%.
- 오류 1건 허용이면 상한 ≈ 4.74/n (n=48 → 9.9% · n=95 → 5.0%). 2건 허용 ≈ 6.3/n (n=63 → 10% · n=126 → 5%).
- 왜 이 방향인가: 일치 표본에서 오류가 안 나오는 것을 확인하는 것이지, 평균 정확도를 추정하는 게 아니다. 자동 결정을 켜는 근거는 "오류가 X% 를 넘지 않는다"는 상한이다.

### 4-3. 어느 레인에 어느 상한을 — 비용 비대칭이 정한다

- [코드 확인] `relevance-judge.ts:312-313` — "잘못 남기면 프롬프트가 조금 탁해질 뿐이지만, 잘못 빼면 그 원문은 영영 안 읽힌다." 리포가 이미 비대칭을 못박았다.
- **B(편입) 상한 10%** [추정, 위 비대칭에서] — 오편입 비용 = extract 프롬프트 잡음 + 공개 피드에 무관 발췌 1건. 되돌릴 수 있다(human_verdict 로 뒤집으면 즉시 빠진다). 최소 표본: **RR 층 30건 무오류**(또는 48건 ≤1오류).
- **A(폐기) 상한 3%** [추정, 되돌릴 수 없음에서] — 오폐기 비용 = 30일 뒤 원문 영구 소실. 최소 표본: **II 층 100건 무오류**. II 층이 아직 없으므로 A 는 2단계 이후다.
- **C 는 임계값이 없다.** 사람 줄이므로 필요한 건 처리량 대비 유입량이다. 켜는 조건: 재측정한 일일 C 유입 ≤ 사람이 정한 일일 처리량(§8 결정 4).

### 4-4. 층화 — 프로젝트별 최소

- RR 층 30건을 프로젝트 비례(ConvertKit 33 · LS 70 · Baremetrics 20 · Cal.com 4 · Plausible 11 → 약 7·15·4·1·2)로 뽑되 **프로젝트당 최소 3건**을 강제한다. Cal.com 은 RR 이 4건뿐이라 3건이면 전수에 가깝다 — 그 프로젝트의 상한은 따로 말할 수 없고 전체 상한에 묻힌다고 적는다.
- RI(불일치) 층도 30건 채점한다. 목적이 다르다 — 상한 계산이 아니라 **누가 맞는지**(1차 과편입인지 2차 과폐기인지)와 §3-5 기준 결정의 근거. 이 30건은 §8 결정 2 의 입력이다.
- 소비재 4개 프로젝트(537행)는 2차 판정이 없으니 층이 없다. 남헌 09-27 지시대로 SaaS 만 간다.
- 합계 **60건**이 1차 보정 세트. 처리 시간은 실측이 없다 — 첫 30건을 재서 다음 배치 크기를 정한다.

### 4-5. 단계별 도입

- **0단계 섀도(2주 목표, 실제로는 보정 60건 채점이 끝날 때까지)**: 2차 판정을 야간에 자동으로 받고(§9 작업 1), 레인을 계산해 컬럼에 쓰되 **아무 행동도 바꾸지 않는다.** extract·/signals 는 v1 그대로. 일일 리포트에 프로젝트별 A/B/C 건수와 v1×v2 교차표를 남긴다.
- **1단계 B+D**: B 배지 표시 + D 감사 시작. B 는 이미 일어나는 행동이라 위험이 늘지 않고, 감사가 시작되니 위험이 줄어든다. 조건: RR 30건 무오류(또는 48건 ≤1).
- **2단계 C**: 불일치 행을 사람 줄로. 조건: 기준 통일 후 재측정한 C 유입 ≤ 처리량, 그리고 C 행의 공개 여부 결정(§8 결정 3).
- **3단계 A**: v1=irrelevant 단독 폐기를 멈추고 II 만 폐기. 조건: II 100건 무오류. 이 단계 전까지 폐기는 오늘과 같이 v1 단독이다 — 이건 "덜 안전한 현상 유지"이고 문서에 그렇게 적는다.

---

## 5. D 표본감사 — 비율과 정확도 추적

- 표본 대상: 최근 7일에 lane 이 찍힌 A·B 행 중 `human_verdict IS NULL ∧ audit_sampled_at IS NULL`. 층: 레인 × 프로젝트. 뽑기: `pickGradingSample` 의 seed 재현 방식 그대로(`relevance-judge.ts:369`).
- 비율은 데이터가 정해 주지 않는다. 정하는 것은 두 숫자다 — 일일 B 유입량과 사람 처리량. 유입량 근거: 판정 행이 780(09-24, `relevance-grading-sample.mjs:56` 주석) → 860(09-25, `relevance-labels-backfill.mjs:5`) → 1,200(09-27) 이니 **최근 하루 100~170행** [코드 주석 인용 + 측정값 인용], 그중 B 가 RR 비율(49%)이면 **하루 50~85행** [추정]. 처리량은 미실측.
- 그래서 비율 대신 **창(window)** 으로 정한다: 회로차단기가 판정하려면 **최근 감사 50건**이 필요하고(§6), 이 창을 2주 안에 채우려면 **주 25건 = 평일 5건**. 이것이 출발 비율이고, B 유입이 50/일이면 약 10%, 85/일이면 약 6% 다. 처리량을 잰 뒤 조정한다.
- 정확도 = 창 안에서 `human_verdict ≠ lane 의 의미` 인 건수 / 창 크기. B 오류 = human irrelevant, A 오류 = human relevant. unknown 채점(빈칸)은 창에 안 들어간다(`relevance-grading-import.mjs:10`, 판정 불가는 무관이 아니다).
- 되먹임: 감사 결과는 이미 있는 경로로 1차 판정 few-shot 에 들어간다(`relevance-judge-auto.mjs:165-198`). 2차 판정에는 넣지 않는다 — 두 판정자가 같은 예시를 보면 독립성이 준다(§8 위험 3).
- 표본감사 창을 못 채우면(사람이 채점을 안 하면) 정확도는 "확인 불가"다. 0 오류로 접지 않는다(§7.1). 창 미달 상태가 14일 넘으면 그 자체를 §6 의 정지 사유로 본다.

---

## 6. 회로차단기

- **지표 1 — 감사 오류율**: 레인별, 최근 감사 n=50 창. 판정은 창이 찼을 때만. 트립 조건: 오류 건수 ≥ `ceil(n·p0 + 2·sqrt(n·p0·(1−p0)))`. p0 는 §4 보정에서 얻은 상한(B 10% 이면 50건 창에서 5 + 4.2 → **≥10건**, A 3% 이면 1.5 + 2.4 → **≥4건**). 2σ 를 쓴 이유: p0 가 참일 때 오탐 확률 약 2~5%. p0 가 확정되기 전에는 이 줄의 숫자를 코드에 박지 않는다(`_principles.md §4`).
- **지표 2 — 불일치율 급변**: 야간 실행 1회의 C 비율이 섀도 기간 기준선 + 15%p 를 넘으면 트립 [추정 — 기준선이 아직 없어 폭은 섀도 뒤 정한다]. 모델 교체·프롬프트 변경·소스 변경을 잡는 그물이다.
- **지표 3 — 2차 판정 결손**: 2차가 쿼터·오류로 멈추면(`quotaExhausted`, `relevance-judge.ts:85`) 트립이 아니라 **확인 불가**다. 그날 신규 행은 전부 C(=v1 대로)이고 리포트에 "2차 미실행 k건"을 적는다(§7.2 — 안전장치가 걸린 것을 정상으로 읽지 않는다).
- **멈추는 것**: 레인 계산과 A/B 부여. 멈춘 뒤의 동작 = **레인 도입 전과 동일(v1 단독)**. 즉 차단기는 항상 "오늘 알려진 동작"으로 되돌아간다. 이미 찍힌 B 배지는 남긴다(사실이었으니까) — 대신 배지 옆에 "감사 정지 중" 을 붙인다.
- **어디에 기록**: (1) `agent_runs` — 실행 트래커 `createTracker` 로 step status `blocked` + blocker 문구(`scripts/agent-status.mjs:79-92`, blocker 없는 blocked 는 로컬에서 막힌다). (2) Notion 일일 상태 로그 CTO 행 **`사람판단필요=true`** — `scripts/cron-watchdog.mjs:16` 와 같은 방식(`recordStatusLog`, 이상 없으면 행을 쓰지 않는다). (3) 상태 파일 `ops/state/approval-lanes.json` `{ enabled, tripped_at, reason, window }` — 무인 루프가 커밋할 수 있는 4개 프리픽스 안이다(`_principles.md §6`). 야간 스크립트는 이 파일을 읽고 `enabled=false` 면 레인을 계산하지 않는다.
- **누가 되돌리나**: 남헌, 또는 CEO-STAFF/CTO 역할 세션(§10.2 자체 판단 범위 — 되돌릴 수 있고 데이터를 손상하지 않는다). 조건: 트립 원인 한 줄 + 재보정 표본 결과를 Notion 에 적은 뒤 파일의 `enabled=true`. 무인 루프·서브에이전트는 되돌리지 않는다(§10.1 표).
- **감시 자체의 감시**: `cron-watchdog.mjs` 가 워크플로 미발화를 이미 센다. 레인 스크립트를 `nightly-relevance.yml`(cron `3 19 * * *`) 의 뒷 스텝으로 붙이면 별도 감시가 필요 없다.

---

## 7. 데이터 모델 변경 — 최소

- `review_relevance_verdicts` 에 컬럼 추가(전부 nullable, 비파괴 ADD COLUMN IF NOT EXISTS, 롤백 파일 동반 — 마이그 `20260930000014` 와 같은 꼴):
  - `second_verdict text CHECK (… IN ('relevant','irrelevant','unknown'))`, `second_model text`, `second_judged_at timestamptz`, `second_reason text`
  - `lane text CHECK (lane IS NULL OR lane IN ('A','B','C'))`, `lane_at timestamptz`, `lane_rule text`(프롬프트·임계값 버전 태그 — 재보정하면 옛 레인을 구분해야 한다)
  - `audit_sampled_at timestamptz`(D 표시 — 결과는 기존 `human_verdict`)
- `decided_by` 컬럼은 만들지 않는다 — 레인은 언제나 기계가 찍고 사람 결정은 `human_verdict`다. 두 컬럼이 이미 그 구분이다(§7.1 3상태: lane NULL = 미계산 / lane 값 = 기계 / human_verdict = 사람).
- `labels_unavailable_reason` 은 그대로 둔다. 2차 판정 컬럼이 생기면 09-25 소급 34행의 사연이 컬럼 값으로 설명된다.
- 새 테이블 없음. 상태는 `ops/state/approval-lanes.json`(§6). 감사 창 계산은 `human_graded_at`·`audit_sampled_at` 으로 SQL 한 번이라 원장 테이블이 필요 없다.
- 케이스 줄(`case_moves`)에는 아무것도 더하지 않는다 — 1단계 범위 밖.

### 배지 "AI 자동편입·등급 미정"

- 자리 1 `app/signals/card/page.tsx:94` — 지금 "판정 모델이 적은 한 줄이다(사람 검수 전)" 캡션 옆. `lane='B' ∧ human_verdict IS NULL` 이면 `<Badge tone="violet">AI 자동편입·등급 미정</Badge>`, `human_verdict='relevant'` 면 `<Badge tone="success">사람 확인</Badge>`. `violet` 톤은 `app/_ds/components/Badge.tsx:10` 에 있고 다른 상태가 안 쓴다. [코드 확인]
- 자리 2 `app/signals/page.tsx` 목록 카드 — 같은 규칙, `size="sm"`.
- 데이터: `lib/signals/feed.ts:182` `SELECT` 에 `lane, human_verdict` 두 필드를 더하면 끝. 공개 조건(`feed.ts:232`)은 1단계에서 바꾸지 않는다.
- "등급 미정"의 뜻: 이 화면에는 등급 축이 없다. 문구는 케이스 화면과 어휘를 맞추려는 것이고, 케이스에 자동 편입이 생긴다면(§8 결정 1) 그때 같은 배지를 `/cases`·`/cases/grade` 카드에 단다 — `evidence_grade` 는 NULL 로 두고 regrade 대상에서 제외한다.

---

## 8. 위험과 남헌 결정

### 위험

- **1. C 대기 중 purge** — 3단계 뒤 v1=irrelevant 단독은 C 인데 원문은 30일 뒤 사라진다. 대책: C 정렬 1순위 = purge 임박, 그리고 **purge 7일 전에도 미결이면 v1 대로 처리하고 `lane_rule='expired-to-v1'` 로 남긴다**(결정을 안 한 게 아니라 못 한 것으로 기록).
- **2. 두 판정자가 같이 틀린다** — 일치는 정답이 아니다. D 감사가 유일한 그물이고, 감사 창이 안 차면 정확도는 "확인 불가"다(§5 마지막).
- **3. 독립성 훼손** — 2차 판정에 1차 결과나 같은 few-shot 을 보여 주면 일치율이 부풀어 A/B 가 늘고 C 가 준다. export 가 "기존 판정을 넣지 않는다"(`second-opinion.ts:4`)를 자동화에서도 유지. 프로바이더 스위치(`lib/analysis/llm.ts` `resolveProvider`)로 다른 모델을 쓰는 게 가장 싸다 — 단 Anthropic 키를 무인 환경에 넣는 건 §10.2 예외 3(시크릿 확장)이라 사람 판단.
- **4. 기준 미통일 상태로 켬** — §3-5. 51% C 는 사람 줄을 마비시키고, 그러면 사람이 대충 넘기거나(정답 오염) 안 보거나(purge) 둘 중 하나가 된다.
- **5. 공개 화면 변동** — C 행을 공개에서 빼면 SaaS 공개 피드가 절반으로 준다(결정 3). 숨기는 쪽이 안전하지만 체험판 인상이 달라진다.
- **6. 감사 표본을 채점자가 미리 안다** — 배지가 `/signals` 에 보이면 채점자는 그 행이 B 인 줄 안다. 채점표 마크다운에는 레인을 싣지 않는다(`relevance-grading-sample.mjs` 규칙 유지: 체크박스 전부 비움).

### 남헌 결정 — 각각 A/B 와 권고

- **결정 1. 케이스·무브 승인 줄을 이번 범위에 넣나** — A: 넣지 않는다(§10.1 유지, 관련성 줄만). B: 넣는다 — §10.1 을 개정하고 케이스용 2심 신호를 따로 설계(지금은 신호도 데이터도 없다). **권고 A.** 하루 10장 부담을 줄이고 싶다면 자동 승인이 아니라 "명백한 카드를 위로 올리는 정렬" 이 먼저고, 그것도 별도 신호 설계가 필요하다.
- **결정 2. relevant 의 기준** — A: 1차 기준(맥락이면 relevant, 칭찬 포함 — 프롬프트 97행 그대로). B: 2차가 쓴 기준(불만·요구·거부 이유가 있어야 relevant). **권고 A 로 통일하고 라벨 `community_signal` 로 pain/demand/objection 을 거른다** — 이미 그 축이 있고 공개 화면이 라벨로 거른다(`feed.ts` 필터). B 로 가면 "불만 없음"이 무관이 되어 긍정 리뷰 재료가 영영 안 읽힌다. 어느 쪽이든 결정 뒤 2차 프롬프트를 맞추고 재측정한다.
- **결정 3. C 행의 공개 여부(2단계)** — A: 공개 유지(오늘과 같음, v1 relevant 면 보임). B: 사람이 볼 때까지 비공개. **권고 A 로 섀도 시작, 재측정 뒤 C 비율이 20% 아래면 B 로 전환** [20% 는 추정 — 사람 줄이 감당 가능한 선을 재측정으로 정한다].
- **결정 4. 관련성 행 사람 채점 하루 몫** — A: 카드 10장과 별도로 관련성 행 10건/일. B: 카드 10장 안에서 나눠 쓴다(카드 7 + 행 30 같은 식 — 행 1건이 카드보다 훨씬 짧다 [추정]). **권고 A 로 2주만** — 보정 60건을 채우고 처리 시간을 잰 뒤 B 로 합친다.
- **결정 5. 2차 판정자** — A: 같은 Gemini, 다른 프롬프트·온도(키 추가 없음, 독립성 약함). B: 다른 프로바이더(Anthropic) — 독립성 강함, 무인 환경 시크릿 추가는 §10.2 예외 3. **권고 B** — 독립성이 이 설계의 전부다. 시크릿은 남헌이 직접 넣는다.
- **결정 6. A(폐기) 레인을 아예 안 켠다는 선택** — A: 3단계까지 간다(II 100건 보정 후). B: A 레인은 영구 섀도 — 폐기는 사람만. **권고 A** 이되 순서는 맨 마지막. 이유: 오늘 이미 v1 단독 폐기가 돌고 있어서 A 를 켜는 게 오히려 안전해지는 방향이다.

---

## 9. 구현 분해 — 이후 Opus 세션용 (지금 하지 않는다)

- **작업 1. 2차 판정 야간 스크립트** `scripts/relevance-second-judge.mjs` — `judgeRelevanceBatch` 재사용, 다른 프로바이더/프롬프트 버전, 1차 결과·few-shot 미주입, `second_*` 컬럼 UPSERT(verdict·human_verdict 는 payload 에 없음), `withLlmBudget`·`quotaExhausted` 처리는 `relevance-judge-auto.mjs` 와 같은 부품. 약 4h [추정].
- **작업 2. 마이그레이션** `2026MMDD_relevance_lanes.sql` + 롤백 — §7 컬럼 8개, CHECK, 확인 쿼리 양성·음성. 약 1h. 적용은 §10.2 절차(비파괴·nullable 이라 세션 자체 판단 범위).
- **작업 3. 레인 계산 순수 모듈** `lib/analysis/approval-lanes.ts` + `scripts/approval-lanes-selftest.mjs` — 입력 (v1, v2, human_verdict, purged_at, state) → lane. DB·시계 없음(`request-cap.ts` 와 같은 이유). 약 2h.
- **작업 4. 레인 적용 스크립트** `scripts/approval-lanes.mjs` — `nightly-relevance.yml` 뒷 스텝. `ops/state/approval-lanes.json` 읽기 → 계산 → `lane`·`lane_at`·`lane_rule` UPDATE → 리포트 `reports/<날짜>/approval-lanes.md`(프로젝트별 A/B/C, v1×v2 교차표, 2차 결손 건수) → `agent_runs` step. 섀도 모드 = 이 스크립트까지만. 약 3h.
- **작업 5. 보정·감사 표본** — `relevance-grading-sample.mjs` 에 `--stratum RR|RI|II` · `--lane A|B` · `--min-per-project 3` 옵션, `audit_sampled_at` 기록. import 는 그대로. 약 2h.
- **작업 6. 회로차단기** — 작업 4 안에 지표 1·2·3 계산, 트립 시 상태 파일 갱신 + `recordStatusLog(사람판단필요=true)` + `tracker.step(blocked, blocker)`. 워크플로 셀프테스트(`cron-watchdog-selftest.mjs` 패턴). 약 3h.
- **작업 7. 배지** — `feed.ts` SELECT 2필드 + `/signals`·`/signals/card` Badge 2곳 + `signals-selftest.mjs` 형태 고정. 약 1h.
- **작업 8. 워크플로** — `nightly-relevance.yml` 스텝 추가(시크릿 확장 없음이면 자율 범위, 결정 5-B 면 시크릿 1개는 남헌). 약 1h.
- 합계 약 17h [추정]. 순서: 2 → 3 → 1 → 4(섀도) → 5 → (보정 60건 채점, 사람) → 7 → 6 → 8.
- 하지 않는 것: 새 테이블, 새 API 라우트(§10.1 — 승인 경로를 HTTP 로 열지 않는다), 케이스 줄 변경, 발행 경로 접촉.

---

## 부록 — 이 문서가 오케스트레이터 측정값과 다르게 본 것

- "10장/일" 은 케이스 카드다(`grade-queue.ts:9`). T2 측정 데이터는 관련성 판정 줄이라 서로 다른 큐다.
- 49.8% 일치는 두 판정자의 **기준 차이**가 최소 46.8%(65/139)의 불일치를 설명한다(§3-5). "판정자가 크게 갈린다"는 해석은 그만큼 과장이다.
- 1차 LLM 판정은 이미 사람 관문 없이 공개 `/signals` 편입과 extract 제외를 결정하고 있다(`feed.ts:232`, `extract-run.ts:276`). "고신뢰만 자동으로 흐르게"가 아니라 지금은 **전부 자동으로 흐르고 있다.**
- 2차 JSON 행에는 `project_id` 가 없다. 프로젝트별 수치는 export 파일과 join 해야 나오고, 이 세션이 다시 계산해 오케스트레이터 수치와 일치함을 확인했다(t2 282행 전부 export 에 존재).
- 2차 판정 relevant 138건 중 라벨 4개가 전부 채워진 것은 109건, irrelevant 139건 중 138건이 `wtp_mentioned=false`(라벨 없음이 아니라 "없음" 으로 답함) — "12 rows fillable" 과 모순은 아니지만 2차 판정자가 irrelevant 에도 wtp 를 false 로 채우는 습관이 있어 `fillable` 규칙(relevant 만)이 그걸 걸러 준 것이다.

---

## 부록 — 오케스트레이터 DB 확인 (2026-09-27, 설계 작성 후)

- [측정값] 사람 채점 10건 전부 **소비재 5개 프로젝트**(안마의자 1·정수기 3·전동칫솔 4·탈모샴푸 2), 전부 09-23 채점, **10/10 이 1차 판정과 일치**. SaaS 프로젝트 사람 정답은 **0건**.
- 함의: 1차 판정의 SaaS 정확도는 전혀 측정된 적이 없다. §4 의 보정 표본(일치층 30건·불일치층)은 **SaaS 5개 프로젝트에서 뽑아야** 의미가 있다. 소비재 10/10 일치를 SaaS 신뢰 근거로 쓰지 않는다.
