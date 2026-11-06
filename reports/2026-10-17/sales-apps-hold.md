# v71ad §2 — ② 영업 앱스토어 후보: 보류 목록 (2026-10-17)

## 결론

- **확인된 앱 ID 0개 → 등록 마이그 없음.** 후보 41개 전부 `확인 불가(이름 검색이 robots 금지)`.
- 확인된 ID 기준: 리포 안 기존 타깃·창문 대장·공개 문서에 이미 있는 ID, 또는 앱 페이지 URL(`apps.apple.com/.../id<숫자>`)로 확실히 아는 ID. 이 41개 중 그 기준을 넘는 것은 없다(리포 파일의 앱스토어 ID 52개와 겹침 0).

## 사고 기록 — robots 금지 경로 호출

- 2026-10-17 `itunes.apple.com/search` 41회 + `/lookup?id=` 4회(3초 간격, 차단 신호 0). 코디네이터 중단 지시 전에 이미 끝났고 그 뒤 호출 0.
- `itunes.apple.com/robots.txt` 는 `Disallow: /search*`. 루트 `/lookup?id=` 는 문자상 허용이지만 `Disallow: /*/lookup?` 취지와 가까워 애매(판단 대기).
- 원인: 지시서의 "이미 쓰는 경로"를 `scripts/anchor-verify.mjs`(이름 검색 `/search`)로 읽었다. 그 스크립트 머리 주석은 "robots 대상 아님 — 공식 검색 API" 라고 적지만 `scripts/idea-competitors.mjs` 8행은 같은 경로를 `Disallow: /search*` → 금지로 기록한다. **리포 안 모순 — anchor-verify.mjs 는 고쳐야 한다(이 PR 에서는 손대지 않음).**
- 그 호출로 얻은 값(앱 ID·판매자·평가 수)은 `sales-apps-hold.json` 의 `unconfirmed_hint` 에만 남겼고 등록에 쓰지 않는다. 이 브랜치 첫 커밋(842b953)에 같은 값이 들어간 마이그·JSON 이 있었고 이 커밋에서 지웠다(이력에는 남는다 — 지우려면 force-push, 사람 판단).

## 앵커 검증 설계 (실행 안 함)

- 입력: `reports/2026-10-17/sales-anchor-input.json` — 후보마다 이름·공식 도메인·검증할 ID 칸·국가.
- 경로 후보: (a) `/lookup?id=` — 사람이 허용하면, (b) 사람이 앱 페이지를 직접 보고 ID 를 적기(요청 0).
- 판정은 `lib/review/anchor.ts` `verifyAnchor` 그대로(이름·평가 ≥50·판매자 도메인).
- 허용되면 그 결과로 등록 마이그를 다시 만든다. 형식은 이 브랜치 첫 커밋(842b953)의 마이그(30% 게이트 동적 N, 앱마다 새 ② 프로젝트, 기록 표 롤백, #554 보다 먼저)를 그대로 쓰면 된다.

## 후보 41개 (전부 보류)

Pipedrive · Zoho CRM · Salesforce · Freshsales · Close · Apollo.io · Copper · Streak · monday sales CRM · Zendesk Sell · Insightly · Less Annoying CRM · Capsule CRM · Nutshell · Bigin · 세일즈맵 · lemlist · Reply.io · Attio · folk · Agile CRM · Keap · Nimble · Salesflare · Badger Maps · SPOTIO · Lusha · Seamless.AI · Bitrix24 · SugarCRM · Vtiger · EngageBay · Teamgate · Dynamics 365 Sales · SalesRabbit · OnePageCRM · Cloze · LinkedIn Sales Navigator · Salesmate · Pipeline CRM · noCRM.io

참고(확인값 아님): 금지 경로 검색에서 이름·평가·도메인 조건을 맞춘 것은 19개였다 — 목록은 JSON `unconfirmed_hint.search_anchor_state='anchored'`.
