# 자율 변경 감사 로그 — 2026-09-19 (CEO-STAFF 세션)

남헌 부재 중 사람 승인 없이 main 에 머지한 것 전부. 한 항목 = PR 하나. 5분 안에 전체를 감사할 수 있게
"무엇·왜·diff 요약·검증·되돌리는 법"만 적는다. 이 목록에 없는 머지는 이 세션이 한 것이 아니다.

**자율 머지 허용 범위(세션 지시문 STEP 1)**: 순수 UI/CSS/레이아웃 · 카피 · 빈/로딩/에러 상태 · 죽은 코드 제거 · 주석/문서 · 테스트 추가 · 동작 불변 리팩터링 · 명백한 버그 수정(테스트+빌드 통과 시). DB·마이그레이션·발행 로직·게이트 기준·robots·인증·env·의존성 메이저는 **PR 만 올리고 머지하지 않았다**(세션 보고서 "사람판단필요" 절).

**공통 절차(전 항목 동일)**: 브랜치는 `origin/main` 에서 새 작업트리로 만들고 `merge-base == origin/main` 을 확인 → 로컬 `eslint` + 관련 셀프테스트 + `next build` → PR → CI `Build Check` 통과 확인 → `gh pr merge --merge`. 되돌리려면 머지 커밋을 `git revert -m 1 <merge-sha>` 한다.

---

## 1. PR #157 — 맨 `/analyze/<id>` 라우트 404 → `/review` 리다이렉트

- **머지 커밋**: `12c9788` (브랜치 `fix/analyze-project-index-route`, 커밋 `da92605`)
- **무엇**: `app/analyze/[id]/page.tsx` 신설(9줄) — `redirect('/analyze/<id>/review')`. `app/discovery/page.tsx` 는 주석 3줄만 현재 상태로 갱신(링크 목적지 `/review` 는 09-18 PR #147 그대로).
- **왜**: 09-18 진단 — `app/analyze/[id]/` 에 `page.tsx` 가 없어 맨 URL 이 404. 링크는 고쳤지만 주소창·공유로 오는 맨 경로가 남는다.
- **diff 요약**: +9 / 주석 −4 +3. 로직 변경 0.
- **검증**: `eslint` 통과 · 로컬 `next build` 통과 · CI `build` 38s pass · Vercel preview 배포 성공. 익명 `curl` 로는 라우트 존재를 확인할 수 없어(모든 경로 307 `/login`) 빌드 산출물의 라우트 등록으로 확인했다.
- **범위 판정**: 순수 라우트/UI. 자율 머지 ✅.

## 2. PR #158 — `/analyze` 목록에 수요축·선례축 나란히 표시 + 수요축 정렬

- **머지 커밋**: `307c643` (브랜치 `feat/analyze-list-two-axes`, 커밋 `57428d3`)
- **무엇**: `app/analyze/page.tsx` — 조회 select 에 `analysis_aspects(opportunity_score)`·`pmf_assessments(demand_axis,precedent_axis,quadrant,match_status,created_at)` 임베드 추가(쿼리 횟수 1회 그대로). 행마다 `AxisStrip`(수요축·선례축·사분면 배지). 정렬 칩 2개(최근 생성 순 / 수요축 높은 순, `?sort=demand`). 필터 링크는 `qs()` 로 status·sort 를 같이 보존. `lib/cases/match.ts` — `PMF_QUADRANT_LABELS` 상수 추가(라벨만, 함수 변경 0).
- **왜**: 09-18 진단 "목록이 opportunity_score 를 전혀 안 읽는다". 두 축을 한 숫자로 합치지 않는다는 원칙(`scripts/pmf-assess.mjs` 헤더) 유지 — 산식은 `demandAxis()` 재사용, 재계산 없음.
- **3상태**: 수요축 값/속성 없음/확인 불가(척도 초과 시 `demandAxis` reason 을 title 로 노출) · 선례축 값/미진단/확인 불가(`not_run`). 정렬에서 확인 불가는 0 으로 접지 않고 뒤로.
- **diff 요약**: page.tsx +75 −8 · match.ts +8. 서버 컴포넌트 그대로, 클라이언트 JS 증가 0.
- **검증**: 실제 DB 로 새 select 실행(24행, 속성 있는 행 9, PMF 진단 있는 행 1 — 오케스트레이터 직접) · `eslint` · `case-match-selftest` 51/51 · `advisor-selftest` 105건 · 로컬 `next build` · CI `build` 49s pass · Vercel preview 배포 성공. **화면 실물 확인은 못 했다** — Chrome 확장 미연결이라 로그인 뒤 화면을 열 수 없었다(익명 요청은 전부 307 `/login`).
- **범위 판정**: 순수 UI + 상수. 자율 머지 ✅.

## 3. PR #159 — 검수 화면에 PMF 2축 진단 카드 + 프로젝트 단위 어드바이저

- **머지 커밋**: origin/main 의 "Merge pull request #159" (브랜치 `feat/review-pmf-panel`)
- **무엇**: `app/analyze/[id]/review/pmf-panel.tsx` 신설(PMF 카드: 수요축·선례축·사분면·"지금 값으로 보면"·CLI 안내·프로젝트 단위 어드바이저 버튼) · `app/analyze/[id]/advisor-cards.tsx` 신설(앵글 화면에서 옮긴 어드바이저 렌더링+fetch 한 벌, `AdvisorLoader`/`AdvisorResult`) · `angles/page.tsx` −195 +5(`AdvisorLoader` 호출로 대체, 동작 불변) · `review/page.tsx` +17(상태 2개·카드 배치, 속성 1개 이상일 때만) · `app/api/analyze/review/route.ts` +14(`pmf`·`pmf_lookup_failed`, 읽기 전용 select 1회).
- **왜**: 09-18 진단 "어드바이저 2단 깊이, PMF 추천 UI 0개". 핵심 가치 화면을 목록 → 상세 1클릭에 둔다. 산식 재계산 없음, 두 축 합산 없음.
- **3상태**: 수요축 값/속성 없음/확인 불가 · 선례축 값/미진단/확인 불가(조회 실패는 `pmf_lookup_failed` 로 갈라 "진단 없음"으로 접지 않음).
- **검증**: 실제 DB 로 진단 있는 프로젝트(3145f350 → PROVEN_DEMAND 0.7/1.0)·없는 프로젝트(빈 배열) 확인 · `eslint` · `tsc --noEmit` · `advisor-selftest` 105건 · `analyze-extract-gate-selftest` 22/22 · 로컬 `next build` · CI `build` 56s pass · Vercel preview 성공. 화면 실물은 못 봤다(Chrome 확장 미연결).
- **범위 판정**: UI + 읽기 전용 API 필드 + 동작 불변 리팩터링(코드 대조: 옮긴 JSX·fetch 로직은 문자 그대로, 상태 변수 4개 동일). 자율 머지 ✅.

## 4. PR #160 — extract 상태 조회 실패를 "속성 0개"로 접지 않음 + 죽은 export 5개 제거

- **머지 커밋**: origin/main 의 "Merge pull request #160" (브랜치 `fix/extract-status-3state-and-dead-exports`)
- **무엇**: `app/api/analyze/extract/route.ts` GET — `analysis_aspects` count 조회의 `error`/`count==null` 이면 500 + "속성 수를 확인하지 못했습니다 — 0개라는 뜻이 아닙니다". 전에는 `count ?? 0`. 폴링 화면(`review/page.tsx`)은 `!ok` 면 `error` 를 그대로 표시하므로 화면 변경 0. 죽은 export 제거: `lib/analysis/llm.ts` `callLlm`·`callLlmJson`(얇은 래퍼), `lib/analysis/types.ts` `AnalysisProject`·`AnalysisInput`, `lib/onboarding/quiz.ts` `OptionSource` — 리포 전체 참조 = 정의 1건뿐(grep -w 로 확인).
- **남긴 것**: `lib/predictions/score.ts` `scoreEntry`(감사 3-2) — 설계 §4-3 의 유일한 구현이라 삭제는 사람 판단.
- **왜**: 09-19 코드 감사 2-4(§7.1 위반) · 3-1 · 3-3.
- **검증**: 제거 식별자 잔여 참조 0(내 주석 1건 제외) · `eslint` · `tsc --noEmit` · 셀프테스트 5종(extract-gate 22 · onboarding-quiz 33 · llm-budget · judge-prompt · angle-lock) · 로컬 `next build` · CI `build` 58s pass.
- **범위 판정**: 명백한 버그 수정 + 죽은 코드 제거. 자율 머지 ✅.

## 5. PR #161 — 미배선 셀프테스트 32개를 Build Check 에 배선 (CG-1/CG-2 · 발굴 게이트 테스트 포함)

- **머지 커밋**: origin/main 의 "Merge pull request #161" (브랜치 `chore/ci-wire-selftests`, 커밋 2개)
- **무엇**: `.github/workflows/build-check.yml` 에 `- run: node scripts/<name>-selftest.mjs` 32줄 + 주석. 코드 변경 0. 들어간 것: `case-pipeline`(CG-1/CG-2 유일 테스트) · `discovery`(발굴 게이트, 전에는 nightly 에서만) · `case-match` · `case-review-rules` · `score-predictions` · `agents-status` · `analyze-angle-adaptation` · `analyze-angle-validate` · `analyze-danawa-url` · `onboarding-quiz` · `voice-check` · `insight-cli/kakao/patterns` · `kakao-proxy` · `threads-collect/replies` · `review-health/purge` · 리뷰 소스 파서 13종.
- **왜**: 09-19 코드 감사 2-1·2-2 — 54개 중 34개가 어떤 워크플로에도 없어 깨져도 초록불.
- **제외 2개(사람 판단)**: `failed-angles-sync`(정본 "5~10행" 단정 vs 현재 원장 행수) · `strategy-principles-sync`(SP-001..031 연속 단정 vs SP-032 존재). 테스트 기대값이 docs/ 원장을 못 따라온 것 — 기대값을 고칠지 원장 상한을 지킬지는 규칙 판단이라 넣지 않았다.
- **검증**: 33개를 env·네트워크 없는 작업트리에서 실측(31 통과 + discovery 177건 통과, 각 1초 미만) · `js-yaml` 파싱(steps 53) · CI `build` 1m04s pass(32개 전부 Linux 러너에서 통과).
- **범위 판정**: 테스트 추가. 자율 머지 ✅.

## 6. PR #162 — API 조회 실패 3곳을 "없음"으로 접지 않는다 (§7.1)

- **머지 커밋**: origin/main 의 "Merge pull request #162" (브랜치 `fix/api-lookup-3state`)
- **무엇**: `app/api/analyze/angle/route.ts` GET(속성 조인 error → 500) · `app/api/analyze/advisor/route.ts`(앵글 속성 조회 error → 500) · `app/api/analyze/review/route.ts` PUT(저장 뒤 상태 재조회 error → `status: '확인 불가(저장은 됨)'`, 저장은 되돌리지 않음). 정상 경로 코드 동일, error 분기 3개만 추가.
- **왜**: 09-19 코드 감사 2-5 · 2-6 · 2-7 — 확인 불가가 "속성 없음(배지 소실)" / "질의어 축소" / "status null" 로 화면에 갔다.
- **검증**: `eslint` · `tsc --noEmit` · 로컬 `next build` · CI `build` 53s pass(배선된 셀프테스트 47개 포함).
- **범위 판정**: 명백한 버그 수정. 자율 머지 ✅.

---

**합계**: 자율 머지 6건(PR #157 · #158 · #159 · #160 · #161 · #162). 전부 `git revert -m 1 <merge-sha>` 로 되돌릴 수 있고 서로 독립이다(#159 는 #158 의 `PMF_QUADRANT_LABELS` 를 쓰므로 #158 을 되돌리면 #159 도 함께).
DB 쓰기 0건 · 마이그레이션 0건 · 발행 로직 0건 · robots 0건 · env 0건 · 의존성 0건.

