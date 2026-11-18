# v71cu progress (한도 도달로 중단, 2026-11-19 02:50 KST)

## 끝난 것
- PR #668 머지(mechanism_norm·P4 스크립트).
- 브랜치 `feat/v71cu-s1-s2` (push됨, PR 미생성): S1 마이그 000001(area_registry·target_area_links·롤백표), 000002(review_targets 방문 칸 5개), 000003(수집 v2 새 표 8개 + v_frontier_state) — 3개 모두 DB 적용 완료, 롤백 파일 있음.
- S1 데이터: review_targets.area 채움(약 1,016/1,079), 4분야 링크 289(sales_crm 189·marketing_automation 96·payments 3·booking 1), review_area_verdicts 1,956행(catmap-v1). 상세 S1.md.
- S4 시험 실행: iTunes 429 → 규칙대로 그 실행 중단. `S4-seed.log`·`S4-area4-picks.json` 확인 필요(실제 삽입 여부 미확인, 롤백은 onboard_batch='area4_20261119'로 가능).
- S0: 서브에이전트(acb7a1c2ac3de8263)가 S0.md 작성 중 — 결과 미확인.
- P4 라벨링: 재개 후 150/2033에서 멈춤(프로세스 없음). 같은 명령으로 재개 가능.

## 남은 것
- S0.md 확인 → S2(방문 선택 코드·판정 상한 변수 5개)·S3(페이지 넘김)·S5~S14, 크론, 점검표 21줄, 21:00 Opus 검수, final.md, Notion 로그.
- S1 PR 생성·CI·머지. S4 iTunes 429 뒤 천천히 재실행. 구글 플레이 검색은 robots상 금지라 패키지 id 지정 방식 필요.
- 이전 지시: 일일 로그, ≥3쌍 필터, domain_norm, P4 재개(처음 100편 재검사).
- TrustMRR 키는 .env.local에 있음(값 출력 금지), 배포 환경 등록 필요.
