# CEO-STAFF 세션 — 2026-09-19 (UI 프로덕션화 + 코드 자율 검수)

작업 위치 `C:\Users\DCU\Desktop\Cowork\SolutionArchive` · 자기완결 세션(Cowork 맥락 없음) · 남헌 부재 중 자율 진행.
체크포인트를 30~60분 단위로 이 파일에 덧붙인다. 최신 상태는 맨 아래 "현재 상태" 절.

---

## 체크포인트 1 — STEP 0 완료 (시작 시각 기준 약 40분)

**리포·브랜치 확인**
- `origin` = `hanazi8282-maker/solutionarchive-app` 확인. 로컬 main 이 origin/main 보다 4커밋 뒤라 `git pull --ff-only` 로 맞췄다 → main `c895661`(09-18 CMO 루프 재렌더).
- 작업트리 39개가 `.claude/worktrees/` 아래 살아 있다(전부 이전 세션 서브에이전트 것). 이 세션은 **새 브랜치를 만들기 직전마다 `git checkout main && git fetch origin && git reset --hard origin/main`** 을 돌리고, 만든 직후 `merge-base == origin/main` 을 확인한다(STEP 1 규칙).
- 미추적 파일 중 주의: `supabase/migrations/20260915172120_posts_reviewed_columns.sql` (어느 브랜치에도 안 들어간 마이그레이션 파일) — 손대지 않는다.

**CI 베이스라인**
- `Build Check`(push·PR 워크플로) main 최근 실행 전부 success (09-18 01:56Z 가 마지막).
- 09-18 23:37Z `Cron Watchdog` 은 failure — 크론 감시가 "이상 1건"을 찾은 정상 동작(Notion 행 `2026-09-19-CTO-2`). 빌드 회귀가 아니다.

**09-18 UI 개편 방향 문서 — 리포에 없다**
- Notion 행 `2026-09-18-기타`(세션 cowork-1a)에 "UI 개편 방향 4건 결정받고 구현 순서 Phase 0~4 작성. 화면 12개·API 23개 실측"이라고 적혀 있으나, `reports/2026-09-18/`·`docs/`·전 브랜치·메모리 어디에도 그 문서가 없다(`Phase 0`·`UI 개편` 전수 검색 0건). 그 세션 대화에만 남은 것으로 보인다.
- 그래서 그 행의 요지("`/analyze` 목록이 opportunity_score 를 안 읽는다 → 수요축·선례축 나란히", "어드바이저 2단 깊이", "PMF 추천 UI 0개", "Tailwind 교체는 IA 안정화 후")와 이 세션 지시문의 3건을 기준으로 진행한다. 남헌이 돌아오면 그 문서를 리포에 넣어 달라고 요청할 것.

**남헌 판단 대기 항목 — 인지만 하고 손대지 않는다(STEP 6)**
- PR #152 우발 병합(커밋 `8d90cd1`, robots fail-closed) 되돌릴지 여부
- PR #151 / #153 / #155 / #156 머지 여부·순서 (전부 `[⛔ 머지 금지]` 표시, CI 통과)
- VOC physical 수집 상한(무제한 / 999 / 500) 정책
- 그 밖에 열린 PR: #106(VOC 소스 확장, 09-15), #99(칼럼 초안, DRAFT)

**STEP 4 사전 확인 결과(조사만, 실행 없음)** — 상세는 아래 §STEP 4 절.

## STEP 4 — 운영 로직 효율 점검 (조사·보고만, 실행 0건)

### 4-1. CG-1 이 3일 연속 막는 원인 — 작가가 사실확인 등급을 못 본다

**근본 원인(코드로 확인)**: `scripts/cmo-daily.mjs` 의 작가 프롬프트(`writerPrompt`, 1813행)는
`m.grade === 'C'` 일 때만 "★ 등급 C 다. 본문에 출처 귀속 문구가 없으면 CG-1 이 막는다"를 넣는다.
그런데 `m.grade` 는 `selectAngles()`(1146행)가 `evidence_grade` 로 채운 값이고, 2026-09-16 재설계
이후 `evidence_grade` 는 **독자 인사이트 축**이다. CG-1(`lib/cases/publish-gate.ts:attributionGate`)이 보는
것은 **`fact_check_grade`** 다. `pickAngles()` 의 `MOVE_COLS`(1224행)는 `fact_check_grade` 를 조회조차 하지 않는다.
- 결과: 인사이트 A · 사실확인 C 인 무브(09-18 백필로 A 가 7→24 로 늘어난 뒤 흔해진 조합)는 작가에게
  "등급 A" 로 전달되고, 귀속 문구 지시가 빠진 채 초안이 나와 스테이징에서 CG-1 에 막힌다.
  09-18 DIGEST "병목 진단"의 `CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다` 가 그 자리다.
- `drafts/cases/*.json` 38개 파일 중 `fact_check_grade` 를 담은 파일 0개 — 작가가 근거 파일을 읽어도 알 수 없다.

**제안(게이트 기준은 그대로, 입력만 채운다)** — 둘 다 발행 로직이라 이 세션은 손대지 않았다.
1. 최소 수정(권고): `pickAngles()` 의 `MOVE_COLS` 에 `fact_check_grade` 추가 → `selectAngles()` map 에
   `fact_check_grade: m.fact_check_grade ?? null` → `writerPrompt()` 의 조건을 `m.fact_check_grade === 'C'` 로 바꾸고
   문구에 허용 표현(`publish-gate.ts` `SELF_MARKERS` 의 "자사 발표/집계", "회사가 밝힌", "제3자 검증을 받지 않은")을
   예시로 박는다. 컬럼 미존재(42703) 시 기존 폴백 경로 그대로. 예상 diff 10줄 안쪽, `cmo-daily-selftest.mjs` 에
   "사실확인 C 인데 인사이트 A 인 무브에 귀속 지시가 들어간다" 단정 1건 추가.
2. 보강(선택): `case-draft-stage.mjs` 가 CG-1 에 막힐 때 `attributionHint()` 가 이미 힌트를 찍는다 — 여기에
   **자동 삽입은 하지 않는 게 맞다.** 게이트 주석이 명시하듯 검사는 "문구가 본문에 있는가"만 보고 "그 수치에
   붙어 있는가"는 못 보므로, 기계가 아무 데나 한 줄 넣으면 게이트를 형식적으로 통과시키는 것이 된다(기준 완화와 같다).
   문구는 작가 단계에서 수치 옆에 붙어야 한다 → 1번이 정답이다.

### 4-2. SP-024 · matched_terms UI · HN 오탐 백로그 — 대부분 이미 끝나 있다
- **SP-024 반영 + `matched_terms` UI 노출**: 커밋 `f43e709`(2026-09-16, main 에 있음)가 `lib/cases/advisor.ts` 에
  `low_confidence`/`matched_terms` 를 넣고 `app/analyze/[id]/angles/page.tsx` 의 `MatchWhy`·`LowConfidenceBadge` 로
  화면에 노출했다. `advisor-selftest.mjs`(CI 배선됨, 105건 통과) 가 "SP-024" 단정으로 고정한다. **완료.**
- **HN 오탐 정리**: `reports/hn-failed-idea-candidates.md` 후보 5건 중 판정 1건(기각·오탐, 09-16), **미검토 4건**
  (HN 49682506 · 49675442 · 49649960 · 49749833). 이건 코드가 아니라 사람이 읽고 `- 판정:` 줄을 쓰는 일이라
  자율 범위 밖. 각 10분이면 끝난다 — 남헌 또는 CMO 세션 몫.
- 09-11 "위임 프롬프트"는 리포에 없다(`SP-024` 검색이 `docs/strategy-principles.md` 한 곳). 남은 일이 사람 판정 4건뿐이라
  위임 프롬프트가 더 필요하지 않다.

### 4-3. HN Firebase C 크론 — 꺼져 있다(확인만)
`.github/workflows/hn-firebase-c-probe.yml` 의 `on:` 은 `workflow_dispatch:` 뿐이다(38~39행). `schedule` 블록 없음.
헤더 주석대로 2026-09-17 은퇴(남헌 결정). "기각"이 아니라 "검증 못함"이라는 구분도 주석에 남아 있다. 변경 없음.

### 4-4. OKKY·벨로그 소스 상태 · 약관 리스크 (현재 상태만)
`review_sources` 20행 실측(읽기 전용): 가동 6(82cook·bobaedream·damoang·danawa·hackernews·youtube) ·
**okky `enabled=false`** · **velog `enabled=false`**(둘 다 09-18 마이그레이션으로 꺼진 채 등록) · 나머지 12곳 비활성.
약관 리스크 항목(clien SP-027 · fmkorea SP-028 · reddit · naver_* · appstore robots 위반)은 `disabled_reason` 에
그대로 적혀 있고 이 세션은 어느 행도 바꾸지 않았다.

## 체크포인트 2 — STEP 2 UI 프로덕션화 진행 (시작 후 약 2시간)

**머지 완료(자율 범위, 감사로그 `autonomous-changes-log.md` 참조)**
- PR #157 `12c9788` — 맨 `/analyze/<id>` 404 → `/review` 리다이렉트(9줄)
- PR #158 `307c643` — `/analyze` 목록에 수요축·선례축·사분면 배지 + 수요축 정렬. 목록이 `opportunity_score` 를 처음으로 읽는다

**진행 중 — PR 예정 `feat/review-pmf-panel`**
- 검수 화면(`/analyze/[id]/review`)에 **PMF 진단 카드** 신설: 수요축(지금 화면 속성의 기회점수로 `demandAxis`) · 선례축(`pmf_assessments` 최신 1건) · 저장된 사분면 배지 · "지금 값으로 보면" 문장(`quadrantOf`). 진단이 없으면 CLI 실행법을 그 자리에 적는다. 조회 실패는 "미진단"과 갈라 표시(`pmf_lookup_failed`).
- 같은 카드 안에 **프로젝트 단위 어드바이저 버튼**(API 는 이미 `project_id=` 를 받았지만 화면이 없었다). 목록 → 상세·검수 1클릭에서 선례·실패 사례·원칙이 열린다(전에는 목록 → 앵글 → 앵글별 "유사 사례 보기" 2단).
- 앵글 화면의 어드바이저 렌더링 195줄을 `app/analyze/[id]/advisor-cards.tsx` 로 옮겨 두 화면이 한 벌을 쓴다(동작 불변 리팩터링 — 앵글 쪽은 `AdvisorLoader` 한 줄 호출로 대체).
- `/api/analyze/review` GET 에 `pmf`·`pmf_lookup_failed` 두 필드 추가(읽기 전용 select 1회). 실제 DB 로 진단 있는 프로젝트(3145f350)·없는 프로젝트 둘 다 조회 확인.

**한계**
- Chrome 확장이 이 세션에 연결돼 있지 않아 **로그인 뒤 화면 실물은 못 봤다.** 익명 요청은 전부 307 `/login`. 검증은 `eslint`·`tsc`·셀프테스트·`next build`·CI·Vercel preview 배포 성공까지다. 남헌이 돌아오면 `/analyze` 와 `/analyze/3145f350-…/review` 를 375px 폭으로 한 번 열어 보는 것을 권한다.
- 09-18 "UI 개편 방향 4건·Phase 0~4" 문서는 리포에 없어(체크포인트 1) 세션 지시문의 3건 + Notion 행 요지로 진행했다.

## STEP 3 — 코드 전체 검수 결과 (정본: `code-audit.md`)

읽기 전용 서브에이전트가 감사하고(치명 2 · 중요 14 · 사소 13, 직전 09-15 감사 잔여 표본 6건 중 5건 여전히 열림),
`[자동수정 가능]` 중 이 세션이 직접 고쳐 머지한 것과 사람 판단으로 남긴 것을 가른다.

**자동 수정해 머지(감사로그 4~6번)**
- 2-4 extract 상태 조회 실패 → "속성 0개" 접힘 — PR #160
- 3-1·3-3 죽은 export 5개 — PR #160
- 2-1·2-2 미배선 셀프테스트 32개 CI 배선(CG-1/CG-2·발굴 게이트 테스트 포함) — PR #161. **CI 가 처음으로 발행 게이트 테스트를 돌린다.**
- 2-5·2-6·2-7 API 조회 실패 3곳 §7.1 — PR #162(CI 대기)

**`npm audit`**: critical 1 · high 3 — 전부 `next` 16.2.7 계열(next 자체 critical, postcss·sharp 는 next 경유)과 `js-yaml`. `fixAvailable` 은 `next 16.3.5`(semver major 아님)·`js-yaml` 패치. **의존성 변경은 자율 범위 밖**이라 손대지 않았다 — 남헌이 `npm audit fix` 후 빌드·CI 한 번 보면 끝난다(런타임 프레임워크 패치라 배포 뒤 화면 확인 권고).

**사람 판단으로 남긴 것(중요도순)**
1. **치명 1-1** 발굴 엔진(`scripts/discovery-run.mjs:76-95`)이 `search.danawa.com` 을 robots 판정 없이 GET — 리뷰 수집 트랙의 fail-closed 규칙을 우회. robots 안전장치 로직이라 자율 금지 목록.
2. **치명 1-2** Vercel 크론 3개(collect-metrics·collect-replies·match-posts)가 건 단위 실패를 200 으로 반환(직전 감사 2-7/3-7 그대로). 발행 파이프라인이라 자율 금지.
3. **2-3** `thread_posts`·`sales_fact`·`conversions` 테이블이 마이그레이션 99개 어디에도 없는데 `app/api/threads/publish`·`sync-conversions` 가 읽는다 → 항상 500. publish 는 §10 "자동 발행 API 사용 안 함"과도 충돌 — 라우트 삭제 여부 판단.
4. **2-14** CG-2 수치 정규식(`publish-gate.ts:186`)이 "1,200만 명"·"3천억"·"$4M"·"40%p" 를 통과시킨다 — 게이트 기준 강화라 자율 금지(느슨하게가 아니라 조이는 쪽이지만 발행 로직).
5. **2-8·2-9·2-11** 무인 루프 스크립트의 exit 0 은폐·마감 UPDATE 미확인·매니페스트 catch→[] — 직전 감사 잔여. CMO 루프 코드라 손대지 않음.
6. **2-10** review-collect fatal 소스가 `/agents` 에 `ok` 로 보임 — health 판정 기준 판단.
7. **2-12·2-13** 발굴 게이트 미고정 분기 6개·러너 미고정 분기 — 테스트 추가는 자율 범위지만 "채택을 잘못 내는 경계"라 게이트 의미 해석이 필요해 이번엔 안 했다(다음 세션 후보 1순위).
8. **3-2** `scoreEntry`(설계 §4-3 유일 구현, 미사용) 삭제 여부. **3-4** 어디서도 안 부르는 스크립트 14개(선택: 5개 비테스트 스크립트 삭제 여부).
9. 셀프테스트 2개(`failed-angles-sync`·`strategy-principles-sync`)가 docs/ 원장 행수·SP 번호 단정에서 실패 — 기대값 수정 vs 원장 상한 준수.
10. **3-5** Supabase 클라이언트 정본 우회 3곳(게이트웨이 재시도 안 탐) · **3-6** KST 변환 4벌 — 동작 불변 리팩터링이지만 스크립트 실행 경로라 이번엔 보류.

## 남헌 판단 대기 — 전체 목록 (세션 종료 시점)

**STEP 6 — 이 세션이 손대지 않은 것(인지만)**
- PR #152 우발 병합(`8d90cd1`) 되돌릴지 · PR #151/#153/#155/#156 머지 여부·순서 · VOC physical 상한(무제한/999/500)

**이 세션이 새로 올린 것**
- **CG-1 3일 연속 차단의 근본 원인**(STEP 4-1): `cmo-daily.mjs` 작가 프롬프트가 `evidence_grade`(인사이트) 만 보고 CG-1 은 `fact_check_grade` 를 본다 → 사실확인 C 무브에 귀속 지시가 빠진다. 제안 diff 10줄 안쪽(`MOVE_COLS`+`selectAngles` map+`writerPrompt` 조건). 발행 로직이라 **파일도 만들지 않았다** — 승인하면 CMO/CTO 세션이 PR 로.
- HN 실패신호 후보 **미검토 4건**(`reports/hn-failed-idea-candidates.md`) — 사람이 `- 판정:` 줄을 쓰는 일.
- `npm audit` 4건(next 16.3.5 패치 + js-yaml) 적용 여부.
- 위 STEP 3 "사람 판단" 10항목.
- 09-18 "UI 개편 방향 4건·Phase 0~4" 문서를 리포에 넣어 달라는 요청(못 찾았다).
- 레퍼런스 노트(`ui-reference-notes.md`)의 차용 패턴 상/중 우선순위 항목 착수 여부 — 이번 세션은 "점수 옆에 왜"(수요축 reason 노출, PMF 카드 note)와 "입력 1개 → 결과" 원칙만 반영했다.

## 현재 상태 (세션 종료)

- main `9557044` (이 세션 시작 시 `c895661`). 자율 머지 6건: **#157 #158 #159 #160 #161 #162** — 감사로그 `autonomous-changes-log.md` 에 항목별 diff 요약·검증·되돌리는 법. DB 쓰기 0 · 마이그레이션 0 · 발행 로직 0 · robots 0 · env 0 · 의존성 0.
- 열린 PR(이 세션이 만든 것 0건): #151 #153 #155 #156(남헌 판단 대기, 09-18) · #106 · #99.
- 작업트리 정리 완료(`SA-wt-0919-*` 0개). 이전 세션들의 `.claude/worktrees/` 39개는 그대로 두었다(내 것이 아니다).
- Build Check 가 이제 셀프테스트 47개를 돌린다(전 15개). 마지막 main CI: PR #162 머지 기준 pass.
- 산출물: `reports/2026-09-19/{ceo-staff-session,autonomous-changes-log,code-audit,ui-reference-notes}.md`. 타사 화면 캡처 5장은 공개 리포라 커밋하지 않고 로컬 스크래치패드에만 두었다.
- 한계 재확인: 화면 실물(로그인 뒤) 미확인 — Chrome 확장 미연결. 남헌이 `/analyze`, `/analyze/3145f350-360d-489e-a2f2-35a155f6db92/review`(PMF 진단 있는 프로젝트), 앵글 화면의 "유사 사례 보기"를 375px 로 한 번 열어 보면 이 세션 UI 3건이 전부 검증된다.

**다음 세션 착수 순서 제안**: ① CG-1 근본 원인 수정(STEP 4-1, 10줄) ② 감사 치명 1-1(발굴 엔진 robots) ③ 감사 2-12·2-13 게이트 테스트 보강 ④ `npm audit fix` ⑤ 레퍼런스 노트 우선순위 "상" 항목.
