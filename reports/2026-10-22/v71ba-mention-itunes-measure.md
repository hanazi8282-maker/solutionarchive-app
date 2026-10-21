# v71ba P0-1·P0-2 측정 (2026-10-22, CTO 서브에이전트)

라벨: [직접 실행 확인] = Actions 측정 실행 run 39655261574(브랜치 tmp/v71ba-measure, workflow_dispatch, DB 는 기존 mention-input-fetch SELECT 만) 로그·아티팩트.
원문 조각 없음(이름·건수만).

## 언급 루프 — 단계별 [직접 실행 확인]
- 입력 글 8,587 → 추출 이름 1,997 → 새 이름 635 → 후보 14 → 영역 적합 1(ADP, ④) → 등록 0.
- 해소(이 PR 의 네 경로 전부 켬): ①링크 0/14 · ②사전 4(전체 이름 기준, 후보와 겹침 0) · ③홈페이지 1(근거 글에 주소 있는 후보 2, 요청 4) · ④Search 14건 호출(차단 0) → anchored 0/14.
- Search 판정 14: no_match 12 · ambiguous 2(Pocket·Render — 판매자 둘). 주된 이유는 웹 서비스·일반어(S3·OpenAI·data·table·production)라 같은 이름 앱이 없거나 평가 50 미만(Raindrop 18).
- 결론: 기록 단계를 고치면 언급 행은 생긴다(10-21 대장 14행 → 마이그 20261022000030). 등록 후보(anchored)가 0 인 건 입력 풀이 HN 웹 서비스 위주라서다(10-19 메모와 같은 결론).

## 링크만으로 해소 / 30 [직접 실행 확인]
- 표본: 후보 점수 상위 30(3글 기준으로 30 이 안 차서 2글 기준).
- **링크만으로 앱 ID 확보 0/30**, lookup 이름 대조 anchored 0/30.
- +사전 0 · +홈페이지 1(Raindrop, 주소 있는 후보 2) · 못 찾음 29.
- 근거 글 속 스토어 링크는 전체 이름 39개에 붙어 있지만(플레이 36), 그건 앱 후기 쪽 이름이고 후보(HN 쪽)와 겹치지 않는다.

## 새 출시 입력 18행 [직접 실행 확인 + 추정]
- DB 대조: discovery_candidates 중 verdict_reason 이 '새 출시 입력' 으로 시작하는 행 0. 18행의 표지는 문구가 아니라 mention_count NULL 이다(언급 대장 행은 언제나 채운다).
- 10-19 새 출시 대장 SQL(18행, 앱스토어 1·Shopify 17)로 시험 판정(18행이 그 SQL 에서 왔다는 건 [추정]): anchored 14 · ambiguous 4(Gorgias·CWILL·Abandoned Cart·FormCRM — 핸들이 이름과 다름). 리뷰 속 언급 0/18.
- 실제 DB 행으로 만든 소급 마이그는 이 PR 에 없다. 서브에이전트가 DB 를 직접 읽는 건 막혀 있다. 오케스트레이터가 `node scripts/new-release-backfill.mjs --input=<mention-input.json> --lookup --run` 으로 만든다.

## 부수 발견
- 새 출시(PH) 홈페이지 경로가 매일 첫 403 하나로 전체 중단돼 스토어 앵커가 0 이었다(10-21·10-22 같음). 이 PR 은 호스트 단위로 건너뛰고, 서로 다른 3곳이 연속으로 막을 때만 경로를 멈춘다.
- 옛 new-release-candidates.mjs 는 홈페이지를 먼저 받고 robots 를 나중에 봤다(§7.1). homepageAnchors 하나로 합쳤다.
- review_sources.itunes_search: 마이그 20261018000010 은 enabled=false 정책 기록 행인데 지시서 실측은 enabled=true 다. 어댑터·타깃이 없는 행이라 실행 0회는 정상이다. 재고 게이지는 이 행을 '긴급'으로 표시하는데 이건 오탐이다. 행은 건드리지 않았다.
