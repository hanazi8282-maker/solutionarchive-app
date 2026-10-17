# v71ak 판단3 — 판정 용량 8,000 롤백 (2026-10-17)

변수(리포 Variables) 되돌리기:
- RELEVANCE_SECOND_DEADLINE_MIN: 150 → 50 (직전값, 10-16 설정)
- RELEVANCE_SECOND_MAX: 8000 → 4000 (직전값, 10-14 설정)
- LLM_DAILY_BUDGET_USD: 10 → 삭제(워크플로 기본 '5')
- DISCOVERY_TARGET_MAX: 200 → 5 (복원 2026-10-17T08:52:29Z, 직전값 5)

워크플로(.github/workflows/nightly-relevance.yml): job timeout-minutes 270 → 150, 2차 스텝 165 → 55. 셀프테스트 170행도 같이.
순서: 이 PR 머지 뒤에 변수를 올린다(역순이면 55분 timeout 이 마감 150분보다 먼저 잘라 낸다).
