# DISCOVERY_TARGET_MAX 환경변수화 — 롤백 기록 (v71aj §2, 2026-10-17)

- 변경: PR #551 — window-discovery 등재 상한을 리포 변수 `DISCOVERY_TARGET_MAX` 로 읽는다. 변수 없음 → 코드 기본 12, 잘못된 값 → 5.
- 운영 순서(헌법 §10.1 "창문 자동 등재" 줄 대조): 헌법 개정 PR #567(CLAUDE.md, 남헌)이 main 에 머지되기 전에는 변수를 `5` 로 둔다(= 옛 동작). #567 머지 후 `200`.
- 롤백 1(즉시, 코드 변경 없음): `gh variable set DISCOVERY_TARGET_MAX --body 5`
- 롤백 2(코드): `git revert <#551 squash 커밋>` 한 번.
- 영향 범위: window-discovery 야간 실행의 하루 신규 등재 수만. 앱스토어 30%·구글플레이 80 가드, WINDOW_MAX_REQUESTS 요청 예산, 차단 시 중단은 그대로다.
- 확인: 첫 야간 실행 로그의 `채택 N / 등재 M` 과 `reports/window-adopted.json` 변화.
