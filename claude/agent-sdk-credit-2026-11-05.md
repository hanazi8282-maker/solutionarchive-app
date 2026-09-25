# Agent SDK 크레딧($250, ~2026-11-05) 소진 추적

> 정본 계획: `reports/2026-09-25/agent-sdk-credit-plan.md`. 이 파일은 **무엇이 크레딧 경로(claude -p · OAuth)로 돌고 있고 얼마나 썼는지** 한 곳에 적는 대장이다.
> 잔액·일 소모량은 claude.ai → Settings → Usage 에서만 보인다(세션은 못 본다). 남헌이 3일에 한 번 적어 주면 아래 표를 갱신한다.

## 크레딧 경로에 올라간 작업

| # | 작업 | 경로 | 시작 | 상태 | 추정 비용/일 | 비고 |
|---|---|---|---|---|---|---|
| 1 | CMO 데일리 루프(조사 6·초안 2) | daily-cmo-loop.yml · claude -p | 09-08~ | 가동 | 미측정(에이전트 세션이라 큼) | 사용량 페이지가 유일한 출처 |
| 2 | 발굴 엔진 | nightly-discovery.yml · claude -p | 09-17~ | 가동 | 미측정 | |
| 3 | 인사이트 루프 | nightly-insight-loop.yml · claude-cli | — | 가동 | 미측정 | INSIGHT_LLM_PROVIDER 미설정 = claude-cli |
| 4 | T2 관련성 판정 | nightly-relevance.yml · `LLM_PROVIDER=claude-cli` (PR #279) | 09-25 밤부터 | 전환 | <$1 | 되돌리기: 리포 변수 RELEVANCE_LLM_PROVIDER=gemini |
| 5 | 사람 채점 대비 평가 리포트 | nightly-relevance.yml 마지막 스텝 (LLM 0) | 09-25~ | 가동 | $0 | 증량 싱크 8번 |
| 6 | **칼럼 전수검수(문체·가독성 고쳐쓰기)** | `.github/workflows/column-review.yml` · claude-cli (남헌 결정 4) | 09-25 | **1회 완료** 11/11편 | 실측 추정 $2.46 (첫 실행 $0.52 + 본실행 $1.94, 편당 126~658초) | 대상 = 미발행 초안(9 + 신규 2). 예산 가드 LLM_DAILY_BUDGET_BOOST_USD=15 안 |
| 7 | (후보) extract 백로그 12,443건 | 미착수 | — | 대기 | — | 증량 싱크 1번, 승인 시 |
| 8 | (후보) T2 2차 판정 로그 | 미착수 | — | 대기 | — | 증량 싱크 2번 |

## 소모량 기록 (남헌 입력)

| 날짜 | 잔액 | 전일 대비 | 출처 |
|---|---|---|---|
| 2026-09-25 | 확인 불가 | — | 세션은 사용량 페이지를 못 본다 |

## 규칙
- 이 경로에 새 작업을 올리면 위 표에 한 줄 추가한다(어느 워크플로·어느 env 로 켰는지, 되돌리기 한 줄).
- 11/6 이후 `dailyBudgetFor` 가 $5 로 자동 복귀한다. 그때 4번을 gemini 로 되돌릴지는 3일 비교(09-28) 결과로 남헌이 정한다.
