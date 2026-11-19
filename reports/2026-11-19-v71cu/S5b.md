# S5b robots 금지 근처 4곳 켜기 (v71cu-2 §1-5)

남헌 결정 owner_2026-11-19 · quote_policy none · 일 40회 · 간격 8000ms · 라벨 유지. 사이트당 수동 GET 2~3회(우리 UA `solutionarchive-review-collector`), 간격 8초. 마이그레이션은 파일만 만들었고 **적용하지 않았다**(DB 쓰기 0).

| 사이트 | 판정 | 근거(2026-11-19 실측) | 끄는 법 |
|---|---|---|---|
| 디시인사이드 (gall.dcinside.com) | 가능 — 켬 | robots 200: `*` 허용, 갤러리별 Disallow(47·cat·dog·stock_new…), AI 봇은 이름으로 차단(우리 UA 는 `*`). 목록·글 HTML 200, 로그인·캡차 없음. 타깃은 programming 갤러리 1곳(robots 금지 목록에 없음). 댓글은 POST 라 미수집(본문만). | `20261119000015_disable_robots4_20261119.sql` 적용 (또는 `UPDATE review_sources SET enabled=false WHERE key='dcinside'`) |
| 루리웹 (bbs.ruliweb.com) | 가능 — 켬 | robots 200: 정렬·분류·검색 쿼리(`*cate=` 등)와 /search·/member 금지 → 쿼리 없는 `/community/board/300143` 과 `/read/<n>` 만 호출. 목록·글 HTML 200. robots_status 'disallowed'(쿼리 규칙). 댓글은 스크립트 렌더링이라 미수집. 타깃은 유머 게시판 1곳. | 같은 파일(`key='ruliweb'`) |
| Squarespace 포럼 (forum.squarespace.com) | **기술적으로 불가능: Cloudflare 관리형 챌린지** | robots.txt 는 200 이었으나 `/categories.json` 이 403 + 'Just a moment…' 챌린지 HTML. 우회하지 않고 이 사이트는 거기서 멈춤. 어댑터·소스 행 없음. | 해당 없음(켜지 않음) |
| 크롬 웹 스토어 리뷰 | **기술적으로 불가능: 리뷰 데이터가 HTML 에 없음** | `/detail/<name>/<id>/reviews` 는 301 → 200 이지만 `AF_initDataCallback ds:0` 이 `errorHasStatus:true`, 리뷰는 클라이언트 스크립트가 내부 RPC(POST)로 불러옴. robots 도 `/detail/*/reviews` 금지. GET 전용 러너로 못 읽음. | 해당 없음(켜지 않음) |

## 개인정보
작성자·닉네임·IP·회원번호는 읽지도 저장하지도 않는다(authorMasked=null). 본문의 이메일은 `[email]`, `@멘션`은 `@user` 로 치환. 픽스처는 실제 글이 아니라 구조만 따라 만든 가짜 문장(robots.txt 만 실측 원문).

## 변경 파일
- 어댑터: `lib/review/adapters/dcinside.ts`, `ruliweb.ts` (clien 의 sliceDiv·stripHtml 재사용)
- 등록 5곳: `scripts/review-collect.mjs` ADAPTERS · `lib/review/target-ref.ts`(REF_BUILDERS·BOARD_HOSTS) · `latest-health.ts`(HALT_ON_BLOCK) · `target-supply.ts`(BOARD_SOURCES) · `.github/workflows/nightly-review-collect.yml` 선택지
- 테스트: `scripts/review-robots4-selftest.mjs`(60건, build-check.yml 에 추가) · 픽스처 `fixtures/review/{dcinside,ruliweb}/`
- 마이그: `20261119000014_enable_robots4_20261119.sql`(+`_rollback`), `20261119000015_disable_robots4_20261119.sql`. source_candidates 4행 라벨도 갱신(롤백 시 복원).
- 검증: review-robots4-selftest 60/0, review-runner-selftest 601 통과(ADAPTERS·워크플로 선택지 대조 포함), review-discourse-selftest 85/0.

## 남은 일 / 주의
- 마이그 14 적용은 대화형 세션 몫(§10.2 — 새 법적 리스크는 남헌이 이미 결정). 적용 후 첫 수집은 `--source=dcinside` 수동 1회로 확인 권장.
- 갤러리·게시판은 각 1곳만 실측했다. 늘릴 때는 어댑터 표에 한 줄 + robots 금지 목록 대조.
- 디시는 지워진 글 응답(200+alert)을 추정으로 처리했다(missing 처리) — 실제 응답으로 확인 필요.
