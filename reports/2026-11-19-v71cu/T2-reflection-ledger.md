# T2 개선안 반영 대장 (2026-11-19, v71cu P4 · PR #682 수정 반영)

계획: `reports/2026-11-19-v71cu/T2-improvement-plan.md` §4 (메인 작업트리에 있고 아직 커밋 안 됨). 킬스위치 수치(`KILL`: p0 0.07 · 창 50 · 문턱 8)는 손대지 않았다.
PR #682 수정 내역(남헌 확정 기준 대조·제거 목록)은 `T2-682-revision.md` 가 정본이다.

| 항목 | 출처 | 상태 | 바뀐 곳 | 확인 |
|---|---|---|---|---|
| P1 hackernews 소스 제외 | 11-18 v71cr 보고(HN 12/50 오류) | **철회** (남헌 기준: 출처째 빼지 않는다) | `auto-approval.ts` 제외 집합은 main 과 같은 `{github_issues}`. `INFO_CRITERIA=v2` 면 출처 제외 없음 | `auto-approval-selftest` 가드: HN 통과·v2 github 통과·60자 유지 |
| P2 '정보 있음' 기준 info-v2 | 11-12 감사 ① + 남헌 확정 기준 a~d | **수정(PR 대기)** | `relevance-criteria.ts` `PRODUCT_INFORMATIVE_CRITERIA_V2`. 감사 ②(소개 문구→false) 제외, Apple Pay F→T, 버그 리포트=무관·기능 요청=정보 있음, 기능·가치 소개·채용글=관련·정보 있음, 개발자 도구=영역 안, promo 태그 | **기본 v1(꺼짐)**. `INFO_CRITERIA=v2` 를 명시해야 켜진다 |
| promo 태그 | 남헌 기준 a | **반영(PR 대기)** | 1차 출력 키 `promo` → `self_promo`, 저장은 reason 끝 `[자사홍보]`(마이그 없음) | 판정 불변을 셀프테스트로 고정 |
| out-founder 제외 | L-20b(v71f) | **v2 에서 해제** | `approval-scope.ts` `scopeOptionsFor` — 자동 승인·2차 대기·감사 표본 셋이 같은 함수 | `approval-scope-selftest`·`relevance-second-judge-selftest` |
| P3 하네스를 운영 프롬프트와 맞춤 | 계획 §3 사실 | **수정(PR 대기)** | `t2-approval-eval.mjs` 기본 `--criteria v24`(운영 변수값)·`--info v1`, A∧가드도 `--info` 를 따름, 전/후 명령을 파일 머리에 | `t2-approval-eval-selftest` |
| 재감사 표본 생성 | 계획 §5 세트 A·B·C | **스크립트만** | `scripts/t2-resample.mjs`(DB 읽기 전용, 실행 안 함). 출력 파일이 있으면 덮지 않는다(같은 표본 유지) | `--selftest` 통과 |
| 재측정·킬스위치 재계산 | 계획 §5·§6 | 미착수 | 오케스트레이터가 표본 생성 → 하네스 전/후 → `INFO_CRITERIA=v2` 설정 판단 | — |
| `AUTO_APPROVAL_SINCE` 이동 | 계획 §6 | 미착수 | 변수를 v2 로 켠 시각으로 옮기는 것은 역할 세션 판단 | — |

## 남은 한계

- 하네스의 A∧가드 채점은 영역·소비재 제외(`loadScope`)를 대지 않는다. 운영 승인보다 범위가 넓게 잡힌다.
- few-shot 은 실행할 때 다시 읽는다. 캐시된 옛 판정이 그때 쓴 예시와 다를 수 있다.
- 2차 판정 행에는 버전 칸이 없다. info-v2 여부는 같은 행 1차 `prompt_version` 접미사로만 갈린다.
