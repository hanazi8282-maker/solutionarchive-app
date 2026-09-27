# CEO-STAFF 세션 — PR #294 후속 지시 5건 + 거버넌스 1건 (2026-09-27, 2차)

> **[직접 실행 확인]** = 이 세션이 돌려 결과를 읽었다 · **[코드만 확인]** = 파일을 읽어 판단 · **[막힘]** = 분류기 거부, 남헌 몫.
> 산출물: PR #295 (`feat/0927-followups`). PR #294 는 남헌 머지(대기 파일 형식만 한 커밋 더 얹음).

## TL;DR

1. 크론 실패 패치는 **PR #295 에 들어갔고 브랜치에서 재실행까지 성공** — Notion 풀백 ✅, HN 스윕 ✅(유실 후보 49838329 복구). main 룰셋 bypass 자체는 머지 뒤 첫 스케줄 실행이 증명한다.
2. Notion 로그 인증 실패 원인은 **이 세션 종류(Claude Code CLI)에 Notion MCP·토큰이 둘 다 없는 것** — flush 워크플로를 만들어 대기 파일이 main 에 들어오면 Actions 시크릿으로 올린다. 09-27 로그는 #294 머지 시 자동 업로드.
3. T2 export(B-0) 실행 완료 — PR #291 의 `scripts/relevance-export.mjs`(09-26 main 반영분)로 **819행·9 프로젝트**, 판정·라벨 눈가림. 내가 먼저 만든 중복 스크립트는 리베이스에서 버렸다(정정 아래 §5).
4. **[막힘] `gh pr merge` 는 이 세션에서 여전히 분류기 차단.** #294·#295 둘 다 남헌이 누른다. CLAUDE.md 는 §10.2 본문 블록만 들어가고 변경 이력 한 줄·§11 안내는 Self-Modification 차단.

## 0. 거버넌스 — 워크플로 수정 자율 조항

- [직접 실행 확인] CLAUDE.md §10.2 에 "워크플로 파일 수정·머지 — 2026-09-27 남헌 확정" 블록 추가(4조건: 드라이런=셀프테스트+dispatch · revert 가능 · 무중단 · Notion 기록. 시크릿·권한 **넓히는** 변경은 여전히 사람).
- [막힘] 같은 파일의 "변경 이력" 한 줄과 §11-1/3 의 flush 안내 문구는 두 번째 편집에서 분류기(Self-Modification)가 거부. 남헌이 두 줄만 손보면 된다.

## 1. 크론 실패 패치 + watchdog 룰

- [직접 실행 확인] hn-failure-signal·nightly-notion-feedback·hn-firebase-c-probe 에 daily-cmo-loop 와 같은 "Mint bot token" 블록 이식(기존 `BOT_APP_*` 시크릿 재사용, 넓힘 없음). 세 번째 파일은 은퇴 워크플로지만 새 watchdog 룰이 경보를 내지 않도록 같이 고쳤다.
- [직접 실행 확인] 재실행(브랜치 `feat/0927-followups` 에서 `workflow_dispatch`): Notion 풀백 success(편집됨 1, 오늘 로그 커밋) · HN 스윕 1차는 두 실행이 같은 브랜치에 동시에 push 하다 non-fast-forward 로 거부(토큰 문제 아님, 워크플로에 pushWithRetry 없음) → 2차 success, `reports/hn-failed-idea-candidates.md` 에 2건 append(49838329 포함). 두 실행 모두 "Mint bot token" 발급·회수 로그 확인.
- 유실분 복구 범위: HN 후보 ✅ 복구. 09-26 Notion 풀백 **파일**은 재생성되지 않는다(풀백은 당일 날짜 파일을 만들고, 09-26 편집 2건은 그날 이미 DB 에 반영됐음이 로그로 확인됨). 사라진 건 기록 파일뿐이다.
- [코드만 확인] main 에 대한 룰셋 bypass 는 브랜치 push 로는 증명되지 않는다 — 머지 뒤 첫 스케줄(notion-feedback 12:07 UTC · hn 16:11 UTC)이 success 면 끝. Watchdog 이 실패하면 즉시 올린다.
- [직접 실행 확인] watchdog 룰: `pushWithoutBotToken()` — `git push` 하는 워크플로 중 `create-github-app-token` 없는 파일을 경보(주석 제외). 셀프테스트 3건 추가, 실리포 0건. `PASS 71`.

## 2. Gemini→Claude 분석층 4곳 — 보류 (변경 없음)

- 09-29 T2 비교 리포트 도착 시 nightly-extract·remedy-judge·analyze/angle·extract 4곳 전환 여부를 같이 보고한다. 이번 세션은 손대지 않았다.

## 3. 대시보드 수동 외부발행 등록 UI — CTO 위임 (이 세션 작업 없음)

- 위임 내용은 남헌 확정 그대로: `createPost` 사후 기록 폼에 external_id·permalink·published_via('external') 입력 → 000022류 임시 백필 반복 금지. CTO 세션에 `SendMessage` 로 넘길 때 `reports/2026-09-27/ceo-staff-3tasks.md` §3 과 이 항목을 붙인다.

## 4. Notion 일일 상태 로그 — 원인·재발방지·업로드

- **원인 [직접 실행 확인]**: 이 세션은 Claude Code CLI 라 (a) Notion MCP 가 설정에 없고(`~/.claude.json` mcpServers 에 notion 0건, 플러그인 Notion 은 OAuth 미인증) (b) `NOTION_API_TOKEN` 은 Actions 시크릿에만 있다. CLAUDE.md §11-1 "대화형 세션은 Notion MCP 로 쓴다" 는 Cowork 세션 전제고, §11-3 "다음 세션이 올린다" 는 같은 이유로 CLI 세션에서 지켜질 수 없었다.
- **재발방지 [직접 실행 확인]**: `scripts/notion-status-log-flush.mjs`(renderPending 역파서 `parsePending` + 업로드·삭제, 토큰 없으면 아무것도 안 지우고 exit 1) + `.github/workflows/notion-status-log-flush.yml`(`ops/state/status-log-pending/**` main push 트리거 + dispatch, 봇 토큰으로 삭제 커밋 `[skip ci]`). `--dry` 실행: 대기 1건 인식, README 제외. 셀프테스트 왕복·flush 시나리오 추가 통과.
- **밀린 09-27 로그**: `ops/state/status-log-pending/2026-09-27-기타.md` 를 flush 규격으로 다시 써서 **PR #294 브랜치에** 얹었다(두 PR 충돌 방지). 순서가 #295 → #294 면 #294 머지 push 가 flush 를 깨워 자동 업로드. 반대 순서면 남헌이 `notion-status-log-flush.yml` 을 한 번 dispatch. 업로드 여부는 워크플로 로그 `✅ … → 2026-09-27-기타…` 줄로 확인.
- Hermes Inbox 동시 기록(§11-5)은 이 세션에서 불가 — 사람판단필요=true 라 남헌이 Cowork 쪽에서 한 줄.

## 5. T2 2차 판정 export (B-0)

- **정정** — 이 스크립트는 PR #291(09-26, "남헌 결정 2")로 이미 main 에 있었다. 내 로컬 main 이 #290 에서 멈춰 있어 "리포에 없다"고 잘못 읽고 중복 구현을 만들었다가, 리베이스 충돌(add/add)에서 발견해 **내 것을 버리고 main 버전을 썼다**. 중복분(스크립트·셀프테스트·build-check 줄·1차 JSON)은 PR 에 남아 있지 않다.
- [직접 실행 확인] main 버전 `node --env-file=.env.local scripts/relevance-export.mjs`(기본 범위 public = 사람 채점 relevant 또는 사람 채점 없음+LLM relevant, 원문 미폐기) → `ops/state/relevance-export-2026-09-27.json` 437KB · **819행 · 9 프로젝트** · 필드 input_id·project_id·project_pitch·text(600자). 판정·라벨은 파일에 없다(눈가림, B-1 규약). DB 쓰기 0. `--all` 이면 irrelevant 까지 전부.
- 공개 리포 커밋: main 버전은 소스를 가리지 않아 다나와 리뷰 원문 600자도 들어간다. 이는 #291 에서 이미 정해진 설계라 그대로 따랐다 — 아래 Q2 로 한 번만 확인.
- B-1(클라우드 세션 판정)·B-2(import, `scripts/relevance-second-opinion-import.mjs` 도 #291 에 있음)는 이 세션 범위 밖.

## 남헌 결정

- **Q1. PR 머지 순서** — A) #295 먼저 → #294(flush 자동) · B) #294 먼저 → #295 뒤 flush 수동 dispatch. 권고 A.
- **Q2. 공개 리포에 다나와 리뷰 원문 600자가 커밋된 상태를 그대로 둘지** — #291 설계대로 819행에 다나와 원문이 들어 있다. A) 그대로(09-26 결정 유지) · B) HN 등 공개 소스만 남기고 나머지는 Actions 아티팩트로 전달(스크립트에 `--sources` 옵션 30분). 권고 A — 이미 결정된 사안이라 이 세션이 되돌리지 않았다(§10.2 "명시 지시 되돌리기 불허").
- **Q3. `gh pr merge` 분류기 차단** — 09-25 에 넣은 `~/.claude/settings.json` allow 규칙이 이 세션에서는 안 먹는다. A) 이번처럼 남헌이 누른다 · B) 규칙을 다시 확인해 세션 자율 머지 복구. 어느 쪽이든 CLAUDE.md 표의 "자체 판단 머지" 문구와 실제가 다르다.

## 개선안

- flush 워크플로가 생겼으니 §11 을 "CLI 세션은 대기 파일 + PR" 로 고쳐 두 경로를 한 문장으로 통일(남헌 편집 필요, 위 §0).
- 두 봇 워크플로가 같은 브랜치에 동시 push 하면 아직 non-fast-forward 로 죽는다(HN 1차 실측). `git-push-retry.mjs` 를 hn-failure-signal·notion-feedback 에도 붙이면 없어진다 — 30분짜리, 다음 세션.
