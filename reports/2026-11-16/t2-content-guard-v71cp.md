# T2 필터 개선 (P1-F) — 내용 가드 + 재측정 1회 (2026-11-16, CC)

## 한도(재측정 1회)
- 이번 재측정은 **오프라인**이다: DB 읽기만, 모델 호출 0회, 추가 비용 $0. 판정 모델·기준 문구(t2d)는 바꾸지 않았다.
- 모델을 다시 부르는 하네스(t2-approval-eval.mjs)는 돌리지 않았다 — 바꾼 것이 판정 모델이 아니라 승인 직전의 결정 규칙이라 같은 판정 154건에 규칙만 다시 대 보면 된다.

## 실측 (사람 채점이 끝난 자동 승인 154건, 오류 = 사람이 무관이거나 정보없음으로 본 건)
- 기준선: 154건 중 126건 맞음 → 정밀도 81.8%(오류 28건)
- 오류 28건 중 21건은 "사람이 무관" — 소비재 앱·개발자 GitHub 이슈·주제 곁가지. 정보없음은 7건뿐.
- 한 소스별 오류: appstore 12/70 · hackernews 5/11 · googleplay 5/58 · github_issues 3/9 · shopify_apps 2/4
- 60자 미만 한 줄: 13건 중 6건 오류. 영역 밖(out-*·hold·영역없음): 9건 중 5건 오류.
- 규칙 조합(영역 안 + github_issues 제외 + 60자 이상): 125건 유지, 109건 맞음 → **정밀도 87.2%**.
  - 영역 안만: 84.1% · +github 제외: 85.3% · +60자: 87.2%
- 킬스위치 문턱은 50건 창에서 오류 8건(정확도 84%). 87%는 문턱을 넘지만 여유가 작다.

## 바꾼 것 (승인 범위를 좁히기만 한다)
- `lib/analysis/auto-approval.ts`: `passesRrV2ContentGuard` — github_issues 제외, 60자 미만 제외, 글을 못 읽으면 막음(§7.1).
- `scripts/relevance-auto-approve.mjs`: 영역·소비재 제외(기존) 뒤에 내용 가드. 글 조회 실패 시 승인 0건.
- 영역 밖 제외는 기존 L-20b 가 이미 한다 → 중복 구현 안 함.
- 셀프테스트: 양성·음성 5건. 가드를 일부러 깨면 실패하는 것도 확인.

## 한계 (정직하게)
- 문턱(60자·github 제외)은 같은 154건에서 골랐다. 표본이 작아 과적합 가능 → 아래 새 표본으로 다시 잰다.
- 남은 오류의 큰 몫(소비재 앱 "무관")은 규칙으로 못 잡는다. 판정 기준 문구 개선(v25)은 모델 재측정 비용이 들어 보류.

## 새 20건 (가드 통과 · 자동 승인됨 · 사람 미채점 · 이전에 채점된 적 없음, 무작위 고정 시드)
본문은 공개 리포라 싣지 않는다. 채점 화면에서 input_id 로 연다.
- 1. 189a7aa0-653a-4584-9b3a-27ea0fbddc11 · youtube · 영역 1
- 2. 0c6eefdd-f900-453d-96dc-a7b475e16244 · appstore · 영역 4
- 3. 2bfe5062-7cc7-4e51-98e9-dda1c5fd12f4 · appstore · 영역 2
- 4. bf2b53f2-7854-4653-822e-df375aea0f62 · appstore · 영역 2
- 5. d663c67d-ebc4-469d-99ae-2a977893622a · appstore · 영역 5
- 6. 6c1f773e-d067-42be-bdbf-aaf21b913cde · appstore · 영역 2
- 7. b1d3f551-9e63-4841-a30e-7e33510b31d5 · appstore · 영역 design
- 8. c4856ef6-414b-4690-b75e-2ce6bf09f147 · hackernews · 영역 3
- 9. 108b6207-d6cb-461c-9556-5f36571164e9 · appstore · 영역 5
- 10. a210cbb8-ae85-4b46-9d2e-135118da409c · appstore · 영역 2
- 11. b4c92aa4-0778-49e3-b2a0-c0c277ec6ca4 · appstore · 영역 1
- 12. 381ea5b6-d11b-470b-91c5-083de7b996ad · appstore · 영역 5
- 13. 8c694604-a6c0-407b-9ee2-2da1f1cae491 · appstore · 영역 2
- 14. ce23417c-0e2c-45c6-ab17-eb7a952ecee3 · googleplay · 영역 5
- 15. 28663746-1ac8-4c6b-9a4c-d29f1ba08b53 · shopify_apps · 영역 5
- 16. ce066dd3-4d47-4d08-9fc8-e92115805faf · appstore · 영역 design
- 17. c68912d7-1efc-4d37-b43a-199177db3999 · appstore · 영역 1
- 18. 57a9505d-0ab3-4263-a9e3-fc7b5eb73f9d · appstore · 영역 3
- 19. d16af973-abc5-4991-8691-e1238ebadaac · appstore · 영역 design
- 20. 9b9f7f77-b92c-4561-a40b-1ec65c98bd77 · appstore · 영역 2
