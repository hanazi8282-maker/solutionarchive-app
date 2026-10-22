(node:2461) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[에이전트 상태판 2026-10-22]
| # | 에이전트 | 상태 | 마지막 실행 | 오늘 산출 | 어제 대비 | 막힌 이유 | 완료 날짜 |
|---|---|---|---|---|---|---|---|
| 1 | 새 회사 자동 등록(언급 루프) | 미작동 [직접 실행 확인] | 없음 | 0 · 누적 리뷰 속 언급 0 / 새 출시 입력 18 | +0 (어제 0) | 원인: 리뷰 속 언급 후보 0행 — 대장 SQL 을 DB 에 넣는 단계 없음(scripts/mention-ledger-migrate.mjs → 마이그) | - |
| 2 | 해외·영어 리뷰 | 작동 [직접 실행 확인] | 2026-10-22T05:59Z | 29 | -216 (어제 245) | - | - |
| 3 | 다국어 리뷰 | 작동 [직접 실행 확인] | 2026-10-21T15:00Z | 2 | -6 (어제 8) | - | - |
| 4 | 새 커뮤니티 발굴 루프 | 고장 의심(24h↑ 갱신 없음) [직접 실행 확인] | 2026-10-17T08:50Z | 0 | +0 (어제 0) | 마지막 실행 120h 전 | - |
| 5 | 하위 게시판 목록 발굴 | 미구현 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | 서브보드 목록 발굴기 없음 | 구현 PR 후 날짜 확정 |
| 6 | 검색 기반 신규 제품 발견 | 작동 [직접 실행 확인] | 2026-10-21T20:37Z | 10 | -1 (어제 11) | - | - |
| 7 | 국가·키워드·정렬 자동 발굴(창문) | 작동 [직접 실행 확인] | 2026-10-22T00:54Z | 36 | -7 (어제 43) | - | - |
| 8 | 후보 생성기 등록 모드 | 부분 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | 드라이런만(등록 모드 전환 전) | 30건 90% 확인 후 |
| 9 | 임시→정식 자동 승격·폐기 | 미구현 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | 승격·폐기 스크립트 없음 | 구현 PR 후 날짜 확정 |
| 10 | 타깃 재고 보충(재방문 시계·게이지) | 작동 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | nightly-review-collect pre-step(target-revive --auto)이 슬롯마다 실행 — 실행 시각은 reports/ 롤백 파일명이 정본 | 게이지 블록은 이 PR |
| 11 | 공식 API 소스(GitHub·SE·YouTube) | 작동 [직접 실행 확인] | 2026-10-22T06:39Z | 67 | -62 (어제 129) | - | - |
| 12 | 영업(②) 우선 발굴 | 범위 밖 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | 이번 개정 제외 | 기존 일정 |
| 13 | 수확률 기반 예산 재배분 | 범위 밖 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | 이번 개정 제외 | 기존 일정 |
| 14 | 이상 반응 알림 | 범위 밖 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | 이번 개정 제외 | 기존 일정 |
| 15 | 병목 자동감시·한도 대장 | 작동 [직접 실행 확인] | 2026-10-22T05:37Z | 2 | -1 (어제 3) | - | - |
| 16 | 안정화 A~I | 부분 [코드만 확인] | 확인 불가 | 확인 불가 | 확인 불가 | A·B·D 설계(#577)까지, C·E~I 구현 증거 미확인 | 이번 주(날짜 미확정) |

- 오늘 = KST 자정부터 지금까지, 어제 = KST 전일 하루 전체(시간대 길이가 달라 오늘이 작아 보일 수 있다). 11번 산출 = 신규 리뷰 합, 그 외 = 행 수.
