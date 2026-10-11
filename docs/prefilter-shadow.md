# T2 사전필터 — 섀도 운영과 enforce 전환 절차 (v31 항목 5)

원칙: 불만을 놓치는 것보다 쓰레기를 조금 더 통과시킨다. 애매하면 통과.

- 코드: `lib/analysis/prefilter.ts` · 설정: `config/prefilter-rules.json` · 셀프테스트: `scripts/prefilter-selftest.mjs`
- 꽂힌 자리: `scripts/relevance-judge-auto.mjs` `pendingFor` — **T1 선별(selectInputs) 뒤, T2 호출 전.**
  - T1 앞이 아닌 이유: T2 표본과 extract 가 같은 T1 상위 집합을 봐야 판정이 헛돌지 않는다(같은 파일 주석). 앞에 꽂으면 enforce 때 두 집합이 갈라진다.
  - T1 과 겹치는 것: T1 이 이미 본문 빈 글(머리말만 포함)을 빼므로 `empty`·`rating_only` 는 이 자리에서 거의 안 걸린다. 나머지 규칙(기호·이모지·중복·광고·카테고리)은 T1 에 없다 — T1 은 점수(페인 히트·길이 0.5배·최신성)로 순서만 정하고 빼지 않는다.
  - 중복은 T2 대상 묶음이 아니라 그 프로젝트에서 **조회된 입력**에서 센다(가장 이른 수집분이 원본). 효과는 T2 대상에만 미친다. 조회에 range 가 없어 **PostgREST 기본 상한 1,000행까지만** 본다 — 1,000행을 넘는 프로젝트에서는 "프로젝트 전체"가 아니다(T1 선별도 같은 범위). 페이지 넘겨 읽기는 아직 하지 않는다. (측정 스크립트는 페이지를 끝까지 넘겨 읽으므로, 1,000행 넘는 프로젝트에서는 T2 실행보다 중복 후보가 조금 더 잡힐 수 있다.)
  - 연결부(조회·42703 폴백·평점 우선 자르기·필터·기록)는 `lib/analysis/relevance-pending.ts` 에 있고, 셀프테스트가 모의 supabase 로 실행한다. 필터가 예외를 던지면 경고 뒤 그 실행은 필터를 끈다(전부 통과, detail `disabled_by_error: true`).
- 기록: 입력 단위 결과는 그날 T2 실행의 `agent_run_steps`(step `select`) `detail.prefilter.by_project.<project_id>.would_drop = [[input_id, rule], …]` 에 남는다. 스키마 변경 없음(§10.1 실행 상태 허용 범위).
- 모드: 기본 `shadow`(표시만). `config/prefilter-rules.json` `mode` 또는 env `PREFILTER_MODE`. 적용 소스는 `apply_sources` 또는 env `PREFILTER_SOURCES`. 어휘 밖 모드값은 shadow 로 읽는다. 설정을 못 읽으면 필터가 꺼진다(전부 통과).

## 섀도 → enforce 절차

1. **섀도 3일.** 머지 뒤 T2 정규 실행이 3번(3일) 돌 때까지 shadow 로 둔다. shadow 에서는 걸린 입력도 T2 가 그대로 판정한다 — 그래서 측정이 공짜다.
2. **측정.** `node --env-file=.env.local scripts/prefilter-falsedrop-sample.mjs --n=200 --seed=<그날 날짜 숫자, 예 20261011> --out=reports/<날짜>/prefilter-falsedrop.json`
   - 읽기 전용(DB 쓰기·LLM 없음). 현재 설정으로 걸렸을 후보를 다시 계산하고 영역(review_targets.label 접두)×소스 층별로 고르게 n건을 뽑는다.
   - **재현 조건:** seed·설정·데이터가 모두 같을 때만 같은 표본이다. 하루 사이 수집·purge 로 입력이 바뀌면 같은 seed 라도 표본이 달라진다 — 재측정 때는 `--out` 파일의 `ids` 를 기준으로 비교한다.
   - 표본은 층마다 고르게 뽑으므로 표본 비율 외에 **모집단 가중 비율**(`weighted_rate`)과 **층별 비율**을 같이 낸다. 판정 5건 이상인 층 하나라도 5% 를 넘으면 `stratum_alerts` 에 올리고 판단은 `relax` 다(한 층 전체가 오탈락인데 전체 비율에 묻히는 것을 막는다). 판정 5건 미만 층은 `strata_thin`(확인 불가)로 따로 적는다.
   - **오탈락률 = 걸렀는데 관련이었던 비율** = relevant / (relevant + irrelevant). 사람 채점(human_verdict)이 LLM 판정을 이긴다. unknown·미판정은 분모 밖에서 따로 센다.
   - 판정된 표본이 100건 미만이면 `insufficient`(확인 불가)다. 출력의 `rejudge`(프로젝트별 `{purpose, reviews}` — `judgeRelevanceBatch(purpose, reviews)` 그대로)를 T2 로 재판정하거나 사람이 채점해 `[{input_id, verdict}]` 파일로 만든 뒤 `--graded=<file>` 로 다시 잰다.
3. **판단.**
   - `relax`(표본·가중·층 중 하나라도 5% 초과): `config/prefilter-rules.json` 을 완화한다 — 걸린 관련 글의 `rule` 을 보고 그 규칙을 느슨하게(보호 낱말 추가 · `duplicate_min_chars` 올림 · 광고 패턴 삭제 · 카테고리 `require: either` 또는 `sources` 에서 빼기). 같은 seed 로 다시 측정(2번).
   - `enforce_ok`(5% 이하): **사람(또는 역할 세션)이** `mode` 를 `enforce` 로 바꾸는 커밋을 낸다. 측정 파일 경로와 수치를 커밋·Notion 일일 상태 로그에 남긴다. **코드는 스스로 enforce 로 바꾸지 않는다.**
4. enforce 뒤에도 같은 측정을 주 1회 돌려 5% 를 넘으면 shadow 로 되돌린다(env `PREFILTER_MODE=shadow` 한 줄).

## enforce 의 범위(알고 켤 것)

- enforce 는 **T2 판정에서만** 뺀다. 판정 없는 입력은 extract 선별(dropIrrelevant)에서 그대로 남으므로, extract 프롬프트에서까지 빼려면 별도 결정이 필요하다.
- 빠진 입력은 판정 행이 안 생겨 다음 실행에도 후보로 다시 오고 다시 걸린다(비용 0, 규칙 계산만).
- 카테고리 규칙은 `category_rule.projects` 에 프로젝트별 제품명·카테고리어를 적은 프로젝트에만 돈다. 비어 있으면(현재 기본) 이 규칙은 아무것도 걸지 않는다. appstore·googleplay·hackernews 는 설정에 적어도 코드가 무시한다.
  - TODO(낱말을 처음 넣는 날): 카테고리 낱말 비교는 지금 소문자 부분 문자열뿐이다. "오랄 비"·"전동 칫솔" 같은 띄어쓰기 변형을 잡으려면 불만 낱말처럼 공백 정규화를 보강한다.
