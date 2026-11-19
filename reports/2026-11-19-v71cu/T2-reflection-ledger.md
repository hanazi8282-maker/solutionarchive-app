# T2 개선안 반영 대장 (2026-11-19, v71cu P4)

계획: `reports/2026-11-19-v71cu/T2-improvement-plan.md` §4 (메인 작업트리에 있고 아직 커밋 안 됨). 킬스위치 수치(`KILL`: p0 0.07 · 창 50 · 문턱 8)는 손대지 않았다.

| 항목 | 출처 | 상태 | 바뀐 곳 | 확인 |
|---|---|---|---|---|
| P1 hackernews 소스 제외 | 11-18 v71cr 보고(HN 12/50 오류) | **반영(PR 대기)** | `lib/analysis/auto-approval.ts` `RR_V2_EXCLUDED_SOURCES = {github_issues, hackernews}`. 60자 문턱은 그대로 | `auto-approval-selftest` 에 HN 음성 1건 추가. 가드에서 HN 을 빼 보면 셀프테스트가 실패하는 것도 확인함 |
| P2 '정보 있음' 경계 문장 3개 | `docs/t2-audit-2026-11-12.md` ①~③ | **반영(PR 대기)** | `lib/analysis/relevance-criteria.ts` `PRODUCT_INFORMATIVE_CRITERIA_V2`(info-v2-2026-11-19). v1 상수는 바이트 그대로(해시 고정) | 1차·2차 모두 `INFO_CRITERIA` 변수로 고른다(기본 v2, `v1` 이면 옛 프롬프트와 글자까지 같음). 1차 판정 행 `prompt_version` 끝에 `+info-v2-2026-11-19` 가 붙는다 |
| P2 누설 방지 | 계획 §4 P2 | 해당 없음 | F 예시 3줄은 원문이 아니라 요약이라 `INFORMATIVE_EXAMPLE_INPUT_IDS` 에 더할 id 가 없다 | — |
| P3 하네스를 운영 프롬프트와 맞춤 | 계획 §3 사실 | **반영(PR 대기)** | `scripts/t2-approval-eval.mjs` `--criteria`(기본 v22) · `--info`(기본 v2) · 운영과 같은 few-shot 로더(`lib/analysis/relevance-examples.ts`, 실린 id 는 채점에서 뺌) · 같은 기준의 2차 지시문 · 캐시 키에 기준·info·few-shot 표시 · A∧내용 가드 채점 · 소스 분포 | `t2-approval-eval-selftest` 배선·제외 검사 추가. 실제 LLM 재측정은 아직 안 함 |
| 재감사 표본 생성 | 계획 §5 세트 A·B·C | **스크립트만** | `scripts/t2-resample.mjs`(DB 읽기 전용, 실행 안 함) | `--selftest` 통과(소스당 8 · 합계 30 · 같은 시드는 같은 표본) |
| 재측정·킬스위치 재계산 | 계획 §5·§6 | 미착수 | 오케스트레이터가 DB 에서 표본 생성 → 하네스 실행 → 남헌 채점(B·C) | — |
| `AUTO_APPROVAL_SINCE` 이동 | 계획 §6 | 미착수 | 이 PR 머지 시각으로 옮기는 것은 역할 세션 판단 | — |

## 남은 한계

- 하네스의 A∧가드 채점은 영역·소비재 제외(`loadScope`)를 대지 않는다. 운영 승인보다 범위가 넓게 잡힌다.
- few-shot 은 실행할 때 다시 읽는다. 캐시된 옛 판정이 그때 쓴 예시와 다를 수 있다.
- 2차 판정 행에는 버전 칸이 없다. info-v2 여부는 같은 행 1차 `prompt_version` 접미사로만 갈린다.
