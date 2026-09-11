# 세션 핸드오버 — AI 에이전트 대시보드 + 오피스 (2026-09-10 ~ 09-11)

> 이 파일은 이번 세션에서 한 일을 다른 Claude 세션이 이어받을 수 있도록 정리한 것이다.
> 작성 시점: 2026-09-11 (session_01557CGFteDg4yrKHHA7jK3B). Git 커밋되지 않은 로컬 파일 —
> 공유가 끝나면 지우거나, 필요하면 사용자가 직접 커밋/삭제 결정.

---

## 0. 세션의 시작 — 사용자 요청 원문 의도

1. `SolutionArchive/ai-office/`에 사용자가 외부 오픈소스 "픽셀 오피스" 앱(AI 직원이 사무실을 돌아다니는 Next.js 게임형 시각화, 제작자: 갓생맘)을 레퍼런스로 가져다 놓음.
2. 이걸 참고해서, SolutionArchive가 실제로 운영 중인 자율 루프(architect/implementer/qa-verifier/debugger/reporter 서브에이전트 + 무인 크론 4종)의 진행 상황을 한눈에 보는 **실사용 대시보드**를 만들어달라는 요청.
3. 이후 대화 도중 "UI를 Dothegy OS(사용자가 예전에 만든 다른 프로젝트)처럼 최대한 좋게 꾸며달라"는 추가 요청 → 리포 안에 이미 `Dothegy Works Design System/`(Dothegy OS에서 뽑아낸 디자인 토큰+컴포넌트 패키지)이 있어서 그걸 재사용.
4. 이후 "`/dashboard` 페이지도 비직관적이니 같이 개선해달라" + "ai-office 파일을 참고용이 아니라 실제로 그대로 구현해서 배포도 해달라(에이전트가 실제로 움직이는 모습도 보고 싶다)"는 추가 요청 → 두 갈래로 확장.

CLAUDE.md의 표준 자율 루프(architect → 🔴 리스크면 승인요청, 아니면 진행 → feat/* 브랜치 → implementer → qa-verifier → PR → reporter, **머지는 사람만**)를 전 과정에서 따름.

---

## 1. `/agents` — AI 에이전트 진행상황 대시보드 (1차 구현)

**PR #31**, 브랜치 `feat/agent-ops-dashboard`, 커밋 `66f9a62`. **머지 완료, 배포 완료.**

### 무엇을 만들었나
- 신규 서버 컴포넌트 페이지 `app/agents/page.tsx` (`force-dynamic`, 읽기 전용).
- 신규 `lib/agents/status.ts` — 순수 로직(Supabase·React 의존 없음): 루프 레지스트리 4건, 3상태 분류(`OK`/`EMPTY`/`UNAVAILABLE`), stale 판정(5분), 스텝바 렌더(`●◐○✕▲`), 200자 절단 헬퍼.
- 신규 `scripts/agents-status-selftest.mjs` — 순수 함수 셀프테스트 + **`.github/workflows/*.yml`을 실제로 읽어서 레지스트리 cron 값과 대조하는 drift 검사**.
- 수정 `app/dashboard/page.tsx` — `/agents` 링크 1줄 추가.

### 다루는 데이터 (전부 실제 Supabase 테이블, 읽기 전용)
- 4개 무인 크론 루프: `agent_runs`(CMO 데일리, `daily-cmo-loop.yml`, UTC 20:17) · `insight_loop_runs`(나이틀리 인사이트, `nightly-insight-loop.yml`, UTC 18:41) · `review_collection_runs`(나이틀리 리뷰수집, `nightly-review-collect.yml`, UTC 17:37) · `notion_sync_log`(나이틀리 노션피드백, `nightly-notion-feedback.yml`, UTC 12:07).
- 사람 대기함: `posts`(status pending_review) · `case_studies`(review_status draft) · `research_queue`(미해소).

### 핵심 설계 원칙 (CLAUDE.md §7.1/7.2 그대로 적용)
- "테이블 없음(확인 불가)" / "0건(조회 정상)" / "정상 데이터"를 **항상 다른 문구**로 렌더 — 섞이면 이 페이지의 존재 이유가 없어짐.
- PostgREST 실측(2026-09-11, 정본 프로젝트 `qmgrfqjfxqhxuufrnkwf`)에서 확인한 함정: 없는 테이블에 `select('*',{count:'exact',head:true})`를 치면 `error=null, count=null`이 온다 — 에러 없음으로 존재 판정하면 안 됨. `classify()`가 `count===null`도 UNAVAILABLE로 처리.
- ⚠️ **작업 시 Supabase MCP가 이 프로젝트가 아니라 Dothegy OS(`hrplbrstntyanzwxcsft`)를 보고 있었다** — `.claude/agents/implementer.md`에 이미 경고돼 있는 함정. 이후 전부 `.env.local`(정본 `qmgrfqjfxqhxuufrnkwf`) 기반 직접 쿼리로 우회.

### AC 검증 (12개 전부 PASS)
존재하지 않는 테이블 주입 → "확인불가" 렌더 확인 / env 제거 → 500 아닌 배너 렌더 / 0건과 확인불가 문구 구분 / 노션 카드 "자동 스케줄 비활성" 표기 / 쓰기 연산 0건(grep) / tsc·build 통과 / 새 의존성 0개 / 에러 원문 200자 절단.

### qa-verifier 서브에이전트가 막힌 이유
Vercel MCP가 OAuth 미인증, Playwright MCP가 세션 중 연결 끊김. **내(메인 세션)가 대신** 로컬 Vercel CLI(이미 인증됨) + `.env.local`의 `VERCEL_PROTECTION_BYPASS` 시크릿으로 실제 preview에 직접 접속해 HTML·로그를 실측 검증하는 방식으로 대체함. 이 방식(아래 "재사용 가능한 검증 레시피" 참고)을 이후 모든 PR 검증에 계속 사용.

---

## 2. `/agents` UI 리디자인 — Dothegy Works 디자인 시스템 적용

**PR #38**, 브랜치 `feat/agents-dothegy-ui`, 커밋 `5f736b6`(본체) + `6630fab`(드리프트 수정). **머지 완료, 배포 완료.**

### 배경
사용자가 "Dothegy OS처럼 예쁘게" 요청. 조사 결과 리포 루트에 `Dothegy Works Design System/`(Dothegy OS 실제 제품에서 추출한 디자인 시스템, `SKILL.md`로 스킬화돼 있음)이 이미 존재 — **전부 Tailwind 클래스가 아니라 순수 인라인 스타일 + CSS 커스텀 프로퍼티**라서 **Tailwind/shadcn 설치 없이 그대로 재사용 가능**했음(SolutionArchive는 CLAUDE.md에 Tailwind+shadcn을 쓴다고 적혀 있지만 실제로는 설치 안 돼 있었음 — package.json에 6개 의존성뿐).

### 적용 범위 (사용자와 합의)
`/agents` 페이지만. 사이드바·다른 라우트는 안 건드림. 픽셀 게임 비주얼(캐릭터·애니메이션)은 안 가져옴 — 구조적 아이디어(부서별 카드, 상태 요약, 승인대기 vs 안전장치-blocked 구분)만 차용.

### 만든 것
- `app/agents/_ds/tokens/{fonts,colors,typography,spacing,base}.css` — 토큰 로컬 복사.
- `app/agents/_ds/components/{Card,Badge,ProgressBar,EmptyState}.tsx` — 컴포넌트 로컬 복사, 타입만 보강.
- `app/agents/_ds/styles.css` — 진입점. `/agents` 라우트에서만 import(Next App Router가 라우트 세그먼트 단위로 CSS 번들링 — 다른 라우트엔 안 실림).
- `app/agents/page.tsx` 프레젠테이션 전면 교체. **로직(`lib/agents/status.ts`)은 안 건드림.**
- 상태 tone 매핑: `ok=emerald` `running=blue` `failed=red` `blocked=amber`(빨강 아님 — 안전장치 작동이지 사고 아님) `확인불가=slate`.
- body cascade에 안 기대고 `<main>`에 직접 테마(`app/layout.tsx`는 안 건드림 — 루트 레이아웃 인라인 스타일이 CSS보다 우선하기 때문).

### 이 단계에서 실제로 터진 사고들 (중요 — 다음 세션이 알아야 함)

**① 공유 작업 디렉토리 동시세션 오염.** `C:\Users\DCU\Desktop\Cowork\SolutionArchive`는 여러 Claude 세션이 동시에 쓴다 — `methodology/content/_setup/HANDOVER-LOG.md` 1199~1268행에 이미 기록된 알려진 문제. 이번에도 실제로 겪음: 로컬 `feat/agents-dothegy-ui` 브랜치 포인터가 다른 세션의 활동으로 `bdebb53`(그냥 main 최신)으로 리셋돼 있었다 — implementer가 커밋한 `5f736b6`이 로컬/원격 양쪽에서 안 보이는 상태. 다행히 **커밋 오브젝트 자체는 안전하게 남아있었고**(`git cat-file -t 5f736b6...` → `commit`), main의 정상적인 fast-forward 후속 커밋이었다. **`git worktree add`로 격리한 뒤 `git reset --hard 5f736b6...` → `git push`로 복구**. 교훈: 이 리포에서 브랜치 전환이 필요한 작업은 절대 공유 디렉토리에서 직접 하지 말고 `git worktree add ../<임시경로> <브랜치>`로 격리할 것. (이번 세션 이후로는 실제로 매번 worktree를 썼다.)

**② scheduleActive 드리프트 실제 발견.** `nightly-notion-feedback.yml`의 cron이 2026-09-11 PR #29로 이미 활성화됐는데 `lib/agents/status.ts` 레지스트리는 여전히 `scheduleActive:false`로 남아있었다 — 정확히 셀프테스트의 drift 검사가 잡으라고 설계된 케이스. 레지스트리를 `true`로 고치고, 같은 사실을 하드코딩으로 중복 단언하던 `scripts/agents-status-selftest.mjs`의 줄(`ok('노션 루프는 비활성으로 등록', ...)`)을 삭제(일반 drift 검사가 이미 4개 루프 전부를 다룸).

**③ 프로덕션 자동배포 웹훅이 죽어있는 걸 발견 — 미해결.** PR #38 머지 후 6분이 지나도 프로덕션 배포가 안 걸림. 조사 결과:
- Vercel 프로젝트 `solutionarch`의 Git 연결이 API상 `"link": {"type":"github", ..., "sourceless": true}` 상태.
- **비대칭 동작**: 다른 브랜치로 push → preview 배포는 정상 자동 트리거됨(실측 여러 번 확인). main에 push/merge → 프로덕션 배포는 전혀 안 트리거됨(GitHub Deployments API에 해당 sha 기록 자체가 없음, check-run도 `build`만 있고 `Vercel`은 없음).
- `.github/workflows/`에 `vercel deploy`를 호출하는 Action도 없음 — 순수 Git 연동에만 의존하는 구조인데 그게 고장.
- **권장 조치(미실행)**: Vercel 대시보드 → `solutionarch` 프로젝트 → Settings → Git 에서 GitHub 연결 Disconnect 후 Reconnect. 대시보드 OAuth 승인이 필요해서 CLI/API로 대신할 수 없음 — 사람 몫.
- **그때까지 워크어라운드**: 머지 후 매번 `cd SolutionArchive && git pull && vercel --prod --yes`로 수동 배포. **주의: `git fetch`만으로는 로컬 브랜치가 안 움직인다 — 실제로 이 실수를 한 번 했다(스테일 코드를 프로덕션에 배포했다가 몇 분 뒤 발견하고 `git merge --ff-only origin/main` 후 재배포로 수습).** 다음 세션은 배포 전 반드시 `git log -1 --oneline`과 `git log -1 --oneline origin/main`을 비교해서 로컬이 최신인지 확인할 것.

### 검증 방식 (재사용 가능한 레시피)
qa-verifier 서브에이전트가 Vercel/Playwright MCP 둘 다 막혀서, 메인 세션이 직접:
```bash
# 1. 브랜치 preview URL 찾기
vercel inspect <아무 deployment URL> 2>&1 | grep -A3 Aliases
# → solutionarch-git-<브랜치명>-hanazi-s-projects.vercel.app 형태의 alias가 나온다

# 2. Vercel Deployment Protection 우회(계정 자동화용 시크릿, .env.local에 있음)
BYPASS=$(grep VERCEL_PROTECTION_BYPASS .env.local | cut -d= -f2 | tr -d '"' | tr -d '\r')
curl -s -L -c cookies.txt -b cookies.txt -H "x-vercel-protection-bypass: $BYPASS" \
  -H "x-vercel-set-bypass-cookie: true" "https://<preview-url>/<경로>" -o out.html

# 3. 서버 컴포넌트라 curl로 받은 HTML 자체에 실데이터가 그대로 들어있다 (SSR) — grep으로 AC 검증 가능
# 4. 런타임 로그
vercel logs <deployment-url>
```

---

## 3. `/dashboard` UI 리디자인

**PR #39**, 브랜치 `feat/dashboard-dothegy-ui`, 커밋 `6f04818`. **머지 대기 중 — 사용자 확인 필요.**

### 배경
사용자 피드백: "/dashboard UI가 굉장히 비직관적, UI적 개선 필요"(링크 깨짐이나 기능 미구현이 아니라 순수 UI 톤 문제였음 — 처음엔 "구현 안 됨"으로 오해해서 뭘 가리키는지 명확화 질문을 한 번 했음).

### 한 일
- `/agents`용으로 만든 `app/agents/_ds/`를 **`app/_ds/`(공유 위치)로 이동**해서 두 페이지가 재사용. `app/agents/page.tsx`는 import 경로 5줄만 변경(`./_ds/` → `../_ds/`), 그 외 완전 동일.
- 신규 `app/_ds/components/{Field,Button}.tsx` — Input/Select/Textarea/Button 프레젠테이션 컴포넌트(Dothegy `components/forms/*` 참고, 타입 보강).
- 신규 `app/dashboard/form-ui.tsx` — 폼 3개 공유 그리드 스타일 + 결과 배너.
- `app/dashboard/page.tsx` + `{post-form,metric-form,draft-link-form}.tsx` — **데이터 로직(Supabase 쿼리·제출 핸들러·필드 name/검증)은 전혀 안 바뀜**, 프레젠테이션만 교체. (origin/main과 grep/diff로 로직 무변경 검증함.)
- 이 작업도 격리된 worktree(`../SolutionArchive-dashboard-ui-wt`)에서 진행 — 공유 디렉토리 오염 없음.

### 검증
tsc/build 통과, 의존성 변경 없음, 실제 preview에서 `/dashboard`(폼 5개·input 44개 정상 렌더)와 `/agents`(이동 후에도 정상, surface-card 18회·스케줄활성 8회) 둘 다 실측 확인.

### 사용자 확인 필요한 디자인 판단 4가지 (PR #39 본문에 적어둠, 아직 답 없음)
1. 섹션 부제 문구를 새로 씀(원래 없던 설명) — 톤 확인 필요.
2. 초안 개수 `(3)` → `3건` 배지로 표기 변경.
3. 제출 버튼 3개 전부 primary(파랑) 통일 — "연결" 버튼만 낮은 톤이 나을 수도.
4. 성과 입력 폼 2열 그리드라 세로가 김 — 3열로 바꿀 수 있음(한 줄 변경).

### 빈 상태 미검증
"연결 대기 중인 초안이 없습니다" / "발행된 글이 없습니다" 두 EmptyState는 라이브 데이터가 비어있지 않아서(초안 3건·성과 있음) 런타임으로 못 봤음. 타입체크·빌드만 통과한 상태 — 데이터가 비는 시점에 재확인 필요.

---

## 4. ai-office (픽셀 오피스) 커스터마이징 + Cloudflare 배포

**별도 인프라 — SolutionArchive(Vercel)와 완전히 다름.** ai-office는 Next.js가 아니라 `vinext`(Vite 기반 Next 호환 레이어) + Cloudflare Workers + Wrangler 스택. **SolutionArchive git 저장소에는 커밋하지 않았다** — `ai-office/`는 여전히 untracked. 별도 배포이자 별도 관리 대상.

### 라이브 URL
**https://godseng-ai-company-hq.hanazi8282.workers.dev/**

### 한 일
1. `ai-office/company.config.ts`를 SolutionArchive 실제 워크플로 12개로 전면 재작성:
   - 왼쪽 6부서 = 기능개발 서브에이전트 루프(architect/implementer/qa-verifier/debugger/reporter + 실측담당 등 보조역)
   - 오른쪽 6부서 = 실제 무인 크론·파이프라인(CMO데일리/인사이트/리뷰수집/노션연동/케이스스터디/콘텐츠발행/경쟁분석 — 12칸 채우려 7개를 6칸에 배분)
   - 부서 **id는 원본 12개를 그대로 유지**(`research`,`brand`,`strategy1`,`qa`,`strategy2`,`reels`,`carousel`,`partner`,`finance`,`review`,`ops`,`secretary`) — name/icon/short/task/report/staff만 교체. 엔진 참조 안 깨짐.
   - CEO_PROFILE을 "남헌"(실제 대표)으로.
   - staff 혼잣말은 이번 세션에서 실제로 관찰한 원칙(CLAUDE.md §7.1/§7.2, "머지는 사람만" 등)에서 그대로 가져옴 — 지어낸 기능 없음.
2. `npm install`(node_modules 없었음, ~750MB) → `npm run build`(vinext build, 정상).
3. **Cloudflare 배포 과정에서 겪은 계정 설정 장애물들 (전부 해결됨):**
   - `npx wrangler whoami` → 미인증. **`wrangler login`은 사용자가 직접 실행**(정책상 내가 대신 로그인 못 함) — `! npx wrangler login`으로 이 세션 안에서 실행해 OAuth 성공.
   - 1차 `vinext deploy` 실패: Cloudflare 계정 이메일 미인증(`Error 10034`) → 사용자가 이메일 인증 완료.
   - 2차 실패: `workers.dev` 서브도메인 미등록. 안내한 딥링크(`.../workers/onboarding`)가 404 — Cloudflare 대시보드 UI가 바뀐 듯. **결국 Cloudflare API(`GET /accounts/{id}/workers/subdomain`)로 직접 확인하니 서브도메인이 이미 `hanazi8282`로 등록돼 있었음**(사용자가 그 사이 어딘가에서 완료한 것으로 보임) → 재배포 성공.
   - Wrangler 인증 토큰 위치(Windows): `C:/Users/DCU/AppData/Roaming/xdg.config/.wrangler/config/default.toml` (`oauth_token` 필드). Cloudflare 계정 ID: `5b1562eab2d064d5989dc559df5bc861`.
4. 배포 명령: `cd ai-office && npx vinext deploy` (내부적으로 `dist/server/wrangler.json`을 자동 생성해서 그걸로 wrangler를 실행 — 프로젝트에 `wrangler.toml`이 따로 없어도 됨).

### 중요한 한계 (사용자에게도 이미 설명함)
**이건 원본 게임 그대로라 실시간 데이터 연동이 없다.** 캐릭터가 실제 Supabase/GitHub Actions 상태를 보고 움직이는 게 아니라 정적으로 구성해둔 시뮬레이션. 실제 라이브 상태 확인은 `/agents`(Vercel)가 담당. 두 화면을 어떻게 합칠지/ai-office에 실데이터를 연결할지는 **아직 결정 안 됨 — 사용자가 셋 다 보고 판단하기로 함**.

---

## 5. 현재 상태 스냅샷 (이 문서 작성 시점)

| 대상 | 상태 | 링크 |
|---|---|---|
| `/agents` (Vercel, SolutionArchive) | 머지·배포 완료, 라이브 | https://solutionarch.vercel.app/agents |
| `/dashboard` (Vercel, SolutionArchive) | PR #39, 리뷰 대기 — 디자인 판단 4가지 답 대기 | https://github.com/hanazi8282-maker/solutionarchive-app/pull/39 |
| ai-office (Cloudflare Workers, 별도) | 배포 완료, 라이브 (실데이터 연동 없음) | https://godseng-ai-company-hq.hanazi8282.workers.dev/ |
| SolutionArchive main | `/agents` 관련 전부 반영됨(PR #31, #38 머지 완료) | https://github.com/hanazi8282-maker/solutionarchive-app |

## 6. 미해결 항목 (다음 세션이 이어받을 것)

1. **🔴 Vercel 프로덕션 자동배포 웹훅 복구** — `sourceless:true` 문제, 사용자가 Vercel 대시보드에서 Git Disconnect→Reconnect 해야 함. 그때까지 merge 후 수동 `vercel --prod` 필요(위 §2 워크어라운드 참고, `git pull` 빼먹지 말 것).
2. **PR #39 (`/dashboard` 리디자인) 머지 여부 + 디자인 판단 4가지** — 사용자 답 대기.
3. **`/agents` ↔ ai-office 통합 방향** — 사용자가 셋 다 보고 "뭘 없애고 뭘 합칠지" 알려주기로 함. 가능한 방향: (a) ai-office를 그대로 별도 "재미용" 화면으로 유지, (b) ai-office 시각을 참고해 `/agents`에 캐릭터/애니메이션 요소를 일부 이식, (c) ai-office를 실데이터에 연결(architect가 다시 설계 필요 — 스택이 완전히 다른 별도 배포라 연동 방식부터 결정해야 함).
4. **로컬 정리** — 아래 두 폴더가 worktree 삭제 시 Windows 파일 잠금으로 완전 삭제가 안 됨(git worktree 등록은 이미 해제됨, 디스크상 껍데기만 남을 수 있음). 필요시 수동 삭제:
   - `C:\Users\DCU\Desktop\Cowork\SolutionArchive-agents-ui-wt`
   - `C:\Users\DCU\Desktop\Cowork\SolutionArchive-dashboard-ui-wt`
5. **ai-office는 SolutionArchive git 저장소 밖의 별도 배포다** — 코드 변경사항(company.config.ts)이 어디에도 커밋되어 있지 않음. 재배포하려면 로컬 파일이 그대로 남아있어야 한다(현재는 남아있음, `ai-office/company.config.ts`). 다음 세션이 이 폴더를 지우거나 되돌리면 커스터마이징이 날아간다 — 별도 git 저장소로 만드는 걸 고려할 것.

## 7. 이번 세션에서 확인한 재사용 가능한 사실들

- **정본 Supabase 프로젝트**: `qmgrfqjfxqhxuufrnkwf`(.env.local). Supabase MCP는 별 프로젝트(Dothegy OS, `hrplbrstntyanzwxcsft`)에 연결돼 있으니 이 리포 작업엔 쓰지 말 것 — `.env.local` 기반 직접 쿼리 사용.
- **정본 Vercel 프로젝트**: `solutionarch`(`prj_nuU75sPVxZ5GhZERhVqDm5ssCYu5`, org `team_f653ODng50Lo12StJaofuZuP`). 다른 Vercel 프로젝트 2개는 Pause 상태.
- **공유 작업 디렉토리 위험**: 브랜치 전환 작업은 반드시 `git worktree add`로 격리. (HANDOVER-LOG.md 1199~1268행 및 이번 세션 §2-①)
- **디자인 시스템**: `Dothegy Works Design System/`(리포 루트) — Tailwind 미설치 상태에서도 순수 인라인스타일+CSS변수라 그대로 재사용 가능. `SKILL.md`로 스킬화돼 있음.
- **Vercel Deployment Protection 우회**: `.env.local`의 `VERCEL_PROTECTION_BYPASS` 값을 `x-vercel-protection-bypass` 헤더로 넘기면 curl로 preview 실데이터 확인 가능(위 §2 레시피).
- **Cloudflare 계정**: account id `5b1562eab2d064d5989dc559df5bc861`, workers.dev 서브도메인 `hanazi8282` 등록 완료.
