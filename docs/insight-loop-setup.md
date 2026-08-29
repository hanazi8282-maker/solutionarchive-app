# 인사이트 피드백 루프 — 설정 절차

피드백 루프 설계안(`feedback-loop-design.md`) §0.5 를 실제로 돌리기 위해
사람이 직접 해야 하는 일들. 2026-08-29 세션 기준.

순서가 중요하다. 마이그레이션(§2)을 건너뛰고 루프부터 돌리면 빈 테이블을 읽고
단계마다 실패한다.

---

## 실행 환경 판정 (2026-08-29 갱신, 먼저 읽을 것)

**야간 배치는 GitHub Actions 에서 돈다.** 처음엔 Vercel 서버리스에 올렸고
바이너리 실행까지는 성립했지만, 300초 천장·크론 3중 발화·SSO 로 인한 수동
트리거 불가가 실측으로 드러나 옮겼다. 근거 전문은
`docs/insight-loop-handover.md` §6.

측정값 — GitHub Actions 러너 (실행 33242830873):

- 러너 — ubuntu-latest / linux / x64 / Node v24.19.0
- 설치 — `npm i -g @anthropic-ai/claude-code@2.1.251` **2,598ms**
- 바이너리 — **204.4MB**, `CLAUDE_CLI_PATH` 로 확보 **0ms**
- version — `claude --version` → `2.1.251 (Claude Code)`, exit 0, **14ms**
- egress IP — `172.174.166.201` (Azure 대역)
- headless — **미검증** (`CLAUDE_CODE_OAUTH_TOKEN` 미설정으로 보류)

측정값 — Vercel preview (과거 스파이크, region iad1, 참고용):

- spawn 정상 / 214MB 확보 **2.37초** / `--version` exit 0 **14ms**

즉 **두 환경 모두 CLI 자체는 돈다.** Vercel 을 떠난 이유는 CLI 가 아니라
런타임 제약이다. 남은 미검증은 `claude -p` 의 실제 추론 하나뿐이고,
토큰만 넣으면 프로브 한 번으로 판정된다(§5).

### 왜 npm 의존성으로 넣지 않는가

Claude Code 2.x 는 npm 패키지가 아니라 플랫폼별 네이티브 바이너리다.
`@anthropic-ai/claude-code` 는 178KB 런처 껍데기이고, 실행 파일은
`@anthropic-ai/claude-code-linux-x64`(압축 해제 204MB)에 있다.
`package.json` 의 dependencies 에 넣으면 Vercel 빌드가 매번 이걸 받고
서버리스 번들 상한(250MB)에 붙는다 — 상시 라우트에는 필요도 없는 무게다.

Actions 잡에서만 전역 설치하고 `CLAUDE_CLI_PATH` 로 넘긴다.
`lib/insight/claude-cli.ts` 의 /tmp 다운로드 경로는 그대로 남겨뒀다 —
Actions 가 아닌 곳(예: 로컬 디버그)에서 돌릴 때의 대비책이다.

---
## 1. Notion 인박스 DB — 완료됨

설계안 §1. 2026-08-29 기준 생성 완료, 저장 시작된 상태.

---

## 2. `saved_examples` 마이그레이션 적용 — 사용자가 직접

⛔ Claude 가 실행하지 않는다(CLAUDE.md §10).

Supabase 대시보드 → SQL Editor 에서 아래 파일 내용을 그대로 붙여 실행:

```
supabase/migrations/20260829000001_saved_examples.sql
```

되돌리려면 `20260829000001_saved_examples_rollback.sql`.

### 적용 전에 알아야 할 것

이 마이그레이션은 설계안 원안과 3곳이 다르다. 사유는 SQL 파일 헤더 주석에
전부 적혀 있다. 요약:

- `proposed_hypothesis_code` 를 텍스트 참조가 아니라 진짜 FK 로 걸었다.
- 자동 추출 가설은 `status='proposed'` 가 아니라 `status='testing'` 으로
  들어간다. 원안대로 하면 (a) CHECK 제약 위반으로 INSERT 가 죽고,
  (b) 설령 제약을 풀어도 `threads-draft.md` 가 `status=eq.testing` 으로만
  가설을 읽어서 자동 가설이 실험에 영영 안 잡힌다.
- `hypotheses` 에 `source` / `source_example_id` 를 추가한다(원안 §4 의
  INSERT 가 쓰는 `source` 컬럼이 실제로는 없다).

그리고 **원안에 없던 트리거를 하나 추가한다**:
`trg_guard_hypothesis_promotion`. 설계안 §5 는 기존
`guard_learning_promotion()` 을 재사용하면 된다고 보지만, 그 트리거는
`learnings` 에만 걸려 있고 `hypotheses` 에는 없다. §6 이 `hypotheses.status`
만 바꾸는 방식으로 자동 승격하면 표본 5개 가드를 통째로 우회한다.
이 파이프라인은 사람 승인 없이 main 에 push 하는 유일한 경로라 DB 레벨
가드가 필요하다.

---

## 3. `CLAUDE_CODE_OAUTH_TOKEN` 발급 및 등록 — 사용자가 직접

### 3-1. 토큰 발급

로컬 터미널에서:

```
claude setup-token
```

(`claude --help` 상 설명: "Set up a long-lived authentication token
(requires Claude subscription)". Claude Pro 구독 계정으로 로그인된
상태여야 한다.)

브라우저 인가 흐름이 뜨고, 끝나면 장기 토큰 문자열이 출력된다.

⚠️ 이 토큰은 **API 키와 동급의 자격증명**이다. 이 값을 가진 사람은 당신의
   Claude 구독으로 추론을 돌릴 수 있다. 커밋·채팅·스크린샷에 절대 남기지
   말 것. `.env.local` 에 적더라도 그 파일이 `.gitignore` 에 있는지
   먼저 확인할 것.

### 3-2. GitHub 리포 시크릿 등록

Vercel 이 아니라 **GitHub** 다. 야간 루프가 Actions 에서 돌기 때문이다.

리포 → Settings → Secrets and variables → **Actions** → New repository secret

| 이름 | 값 |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | 위에서 발급받은 토큰 |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` 과 같은 값 |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` 과 같은 값 |

선택: `ANTHROPIC_API_KEY`(헤드리스가 막혔을 때의 대체 경로),
`NOTION_API_KEY` / `NOTION_INSIGHT_DB_ID`(Notion 경로를 쓸 때만).

`GITHUB_TOKEN` 은 **넣지 않는다.** Actions 가 잡마다 발급하는 기본 토큰을
쓰고 워크플로가 `permissions: contents: write` 로 범위를 좁힌다. PAT 을
만들면 권한이 이 리포 밖으로 넓어지기만 한다.

⚠️ 시크릿 이름을 `GITHUB_` 로 시작하게 만들 수 없다(GitHub 예약 접두사).
   그래서 위 표에도 없다.

Vercel 쪽에 `CLAUDE_CODE_OAUTH_TOKEN` 을 넣을 필요는 없어졌다. 이미 넣었다면
지우는 게 낫다 — 안 쓰이는 자격증명이 한 군데 더 있는 셈이다.

### 3-3. 등록 확인

§5 의 프로브를 한 번 돌린다.

---

## 4. ⚠️ `CRON_SECRET` — 보안 확인 필요

스파이크 도중 발견한 별건이다. **Preview 환경에 `CRON_SECRET` 이 설정되어
있지 않았다.** 근거:

```
curl -X POST -H "Authorization: Bearer undefined" <preview-url>/api/...
→ HTTP 200 (통과해버린다)
```

크론 라우트들이 전부 아래 형태로 인증하고 있었다:

```ts
if (auth !== `Bearer ${process.env.CRON_SECRET}`) return 401
```

환경변수가 없으면 비교 대상이 문자열 `"Bearer undefined"` 가 되어, 그 값을
보낸 사람은 누구나 통과한다. 영향 범위:

- `/api/threads/publish` — **Threads 에 실제로 글을 발행한다**
- `/api/threads/refresh-token` — 토큰을 회전시킨다
- `/api/threads/match-posts`, `/api/threads/collect-metrics` — DB 에 쓴다

**코드 쪽은 수정됐다.** `lib/cron-auth.ts` 로 가드를 통일했고, 변수가 없으면
비교하지 않고 무조건 500 으로 거부한다. preview 에서 차단을 실측 확인했다.

**남은 일**: Vercel 대시보드에서 Production/Preview 양쪽에 `CRON_SECRET` 을
실제로 설정한다. 설정 전까지 크론 라우트는 전부 500 이다(의도된 동작이다 —
열려 있는 것보다 낫다).

프로덕션에 값이 있는지는 사람이 대시보드에서 본다. 확인 자체가 부작용이라
(통과하면 그 순간 라우트가 실행된다) Claude 가 확인하지 않았다. 다만
프로덕션은 Vercel SSO 뒤에 있어 외부 요청이 302 로 튕기는 것은 확인했다.

---

## 5. 프로브 실행 — 헤드리스 최종 판정

읽기 전용이고(`permissions: contents: read`) 아무것도 쓰지 않는다.

```bash
gh workflow run insight-headless-probe.yml
RUN=$(gh run list --workflow=insight-headless-probe.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status || true
gh run view "$RUN" --log | sed -n '/헤드리스 실행 판정/,$p'
```

결과는 Actions 잡 요약 패널에도 그대로 남는다. 판정 4단계:

- `viable` — 실제 추론까지 통과. **Pro 구독 헤드리스 경로 확정, API 과금 없음**
- `inconclusive` — 토큰이 없거나 응답이 예상 밖. 어느 단계인지 목록에 있다
- `blocked` — 막혔다. 리포 변수 `INSIGHT_LLM_PROVIDER=anthropic` +
  `ANTHROPIC_API_KEY` 시크릿으로 넘긴다. 나머지 전 단계 코드는 그대로 쓴다

프롬프트는 정답이 하나뿐인 걸 묻는다(6×7). 모델이 무슨 말이든 뱉으면
"돌았다"고 착각하기 쉬워서다.

---

## 6. 야간 루프 실행

### 수동 (권장 — 처음 며칠)

```bash
gh workflow run nightly-insight-loop.yml -f dry_run=true
```

`dry_run` 기본값이 true 다. 판정만 하고 DB 쓰기·가이드 커밋을 하지 않는다.
슬래시 명령 `/insight-review` 가 이걸 감싸고 결과 해석까지 한다.

실제 반영은 `-f dry_run=false`. 이 루프는 사람 승인 없이 main 에 커밋하는
유일한 경로다 — 며칠 dry-run 으로 판정을 눈으로 본 뒤에 열 것.

### 자동

`0 19 * * *` (UTC) = KST 04:00. 워크플로가 머지되는 순간부터 돈다.
바로 열고 싶지 않으면 GitHub Actions 화면에서 워크플로를 Disable 해두고,
검증이 끝난 뒤 Enable 한다.

⚠️ Actions 스케줄은 정시를 보장하지 않는다(수십 분 지연, 고부하 시 건너뜀).
   04:00 을 고른 덕에 07:00 까지 3시간 여유가 있고, 하루 건너뛰어도 다음 밤이
   같은 일을 한다 — 전 단계가 멱등이다.

---

## 7. 아직 안 한 것

- 마이그레이션 2개 적용 (§2) — 사용자가 대시보드에서 직접
- 시크릿 등록 (§3-2), `CRON_SECRET` 설정 (§4)
- 헤드리스 판정 (§5)
- `insight-guide.md` / `threads-draft-insight-patch.md` /
  `corpus-seed-template.md` 대조 — 세 문서 모두 두 세션 연속 미확보
