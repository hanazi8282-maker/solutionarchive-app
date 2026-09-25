# 클라우드 세션 작업 목록 (크레딧 $250, 11/4 PT 까지)

> 사용: 리포 루트에서 `git pull` 뒤 `claude --cloud "docs/cloud-session-tasks.md 의 작업 <번호> 를 수행하라. 끝나면 PR 을 만들고 CI 를 확인하라."`
> 규칙(세션이 지킬 것): CLAUDE.md §10 그대로 — DB 쓰기·발행 없음, `methodology/` 수정 없음, 산출물은 PR. 셀프테스트는 `.github/workflows/build-check.yml` 의 목록을 로컬로 돌려 본 뒤 PR.
> 끝난 항목은 체크하고 PR 번호를 적는다.

## A. 코딩 (PR 로 끝남)
- [ ] **A-1** `/columns` 수정본 블록에 원문↔수정본 **줄 단위 diff 뷰** 추가(지금은 수정본 전문만 보인다). 순수 함수 diff + 셀프테스트. 파일: `app/columns/page.tsx`, `lib/columns/diff.ts`(신규), `scripts/columns-diff-selftest.mjs`.
- [ ] **A-2** `/signals` 소스칩 옆에 **신호·영향 필터 칩**(pain/demand/objection · high/mid/low) UI. 데이터는 `lib/signals/feed.ts` 가 이미 받는다(`signal`·`impact` 질의). 파일: `app/signals/page.tsx`.
- [ ] **A-3** 즉시발행 버튼 사후 보강: 발행 성공 시 카드에 permalink 링크 표시 + `published_via='instant'` 게시물을 `/dashboard` "발행 연결" 목록에서 구분 배지. 파일: `app/dashboard/post-review-form.tsx`, `app/dashboard/page.tsx`.
- [ ] **A-4** `scripts/relevance-eval-report.mjs` 에 **모델별 혼동행렬**(relevant/irrelevant/unknown × 사람) 표 추가 + 셀프테스트(순수 함수 `summarize` 분리).
- [ ] **A-5** `column-review.yml` 의 결과 요약에 **편당 실측 비용(total_cost_usd)** 합계 표시(로그에 이미 찍힘 → 스크립트가 파싱해 합산).

## B. T2 2차 판정 (export → 세션 → import)
- [ ] **B-0**(CEO-STAFF, Actions) `scripts/relevance-export.mjs`: 공개 대상 행(input_id·raw_text 앞 600자·verdict·human_verdict·라벨)을 `ops/state/relevance-export-<날짜>.json` 으로 커밋.
- [ ] **B-1**(세션) 그 파일을 읽어 행마다 relevant/irrelevant/unknown + 라벨 4개를 **독립 판정**해 `ops/state/relevance-second-opinion-<날짜>.json` 으로 저장, PR. 기존 판정은 보지 말 것(파일에서 verdict 열을 가리고 판정).
- [ ] **B-2**(CEO-STAFF, Actions) `scripts/relevance-second-opinion-import.mjs`: 불일치만 `reports/<날짜>/relevance-second-opinion.md` 로. DB 는 라벨 NULL 인 행에 한해 채움(있는 값은 덮지 않음).

## C. 근거 재검증 제안서 (웹 조사, 보고만)
- [ ] **C-1** `case_moves` 중 `fact_check_grade IN ('C','D')` 14건의 근거 URL 을 다시 열어 수치·귀속을 대조하고 `reports/<날짜>/fact-check-proposals.md` 에 "등급 유지/상향 제안 + 근거 URL" 로 정리. 등급 변경은 하지 않는다(사람 몫). 입력은 CEO-STAFF 가 `ops/state/moves-cd-export.json` 으로 미리 커밋.

## D. 경쟁사 기능 조사 갱신 (보고만, 구현 금지)
- [ ] **D-1** `docs/ui-competitor-patterns-2026-09-21.md` 의 서비스 8곳 중 4곳을 다시 열어 09-21 이후 바뀐 화면·기능을 `reports/<날짜>/competitor-diff.md` 로. 스크린샷 대신 문장 실측.

## E. VOC 후보 후속
- [ ] **E-1** `reports/2026-09-25/voc-probe-disquiet.md` 의 게시글 21건을 T2 기준(구매자 페인 여부)으로 하나씩 판정해 정밀도 표를 같은 보고서에 추가. 편입 여부는 남헌.

## F. 칼럼 스레드
- [ ] **F-1** `drafts/columns/2026-09-25-*.threads.md` 7편을 voice-guide 로 검수해 `drafts/columns/_review/<slug>.threads.revised.md` 로. 원문은 그대로.

## V. 검증 (본작업 전 1회)
- [ ] **V-0** 되돌리기 쉬운 검증. CLAUDE.md §10 그대로(DB 쓰기·발행 없음, methodology/ 수정 없음). (1) 이 파일 맨 아래에 `## 검증 세션 기록` 절을 추가하고 오늘 날짜(UTC)·OS·node 버전·git 원격 URL 을 적어라. (2) 자격증명 주입 실측: 헤더 없이 `curl -s -o /dev/null -w '%{http_code}' 'https://qmgrfqjfxqhxuufrnkwf.supabase.co/rest/v1/review_sources?select=key&limit=1'` 을 실행해 HTTP 코드를 같은 절에 적어라(401 = 주입 없음, 200 = 주입됨). env 에 이름이 `SUPABASE`·`NEXT_PUBLIC` 으로 시작하는 변수가 있으면 **값은 절대 적지 말고 이름만**(없으면 '없음'). (3) 브랜치 `verify/cloud-session-probe` 로 이 파일 하나만 커밋·push 하고 `gh pr create` 로 제목 `verify(cloud): 클라우드 세션 검증 기록` PR 을 만들어라. 다른 파일은 건드리지 마라.
  - 남헌 실행: `claude --cloud "docs/cloud-session-tasks.md 의 작업 V-0 을 수행하라."` — **대화형 터미널에서만** 된다(CEO-STAFF 세션의 셸은 TTY 가 아니라 거부됨, 2026-09-26 실측).
  - 통과 기준: PR 이 열리고 CI(build·Vercel)가 붙어 자동머지 규칙을 탄다 = (a)(c) 확인. HTTP 코드가 (b)의 답.

## B-0·B-2 도구 (2026-09-26, PR 참조)
- export: `node --env-file=.env.local scripts/relevance-export.mjs` → `ops/state/relevance-export-<날짜>.json`(판정·라벨 미포함, 눈가림)
- import(드라이런): `node --env-file=.env.local scripts/relevance-second-opinion-import.mjs ops/state/relevance-second-opinion-<날짜>.json` → `reports/<날짜>/relevance-second-opinion.md`
- import(라벨 채움): 같은 명령 + `--apply` — 라벨 4개 전부 NULL·불가 표시 없음·세션 relevant·라벨 있음 인 행만. verdict·사람 채점·기존 라벨은 절대 안 덮음. 서비스키가 있는 환경(로컬/Actions)에서만.
