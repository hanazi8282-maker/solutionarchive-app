# 인사이트 피드백 루프 — 설정 절차

피드백 루프 설계안(`feedback-loop-design.md`) §0.5 를 실제로 돌리기 위해
사람이 직접 해야 하는 일들. 2026-08-29 세션 기준.

순서가 중요하다. 3 → 1 → 2 로 하면 크론이 빈 테이블을 읽고 조용히 no-op 한다.

---

## 스파이크 검증 결과 (2026-08-29, 먼저 읽을 것)

설계안 §0.5 의 미검증 리스크 — "Claude Code CLI 가 Vercel 서버리스에서
정상 실행되는가" — 를 실제 preview 배포에서 측정했다.

측정값 (`/api/test/claude-headless`, region iad1, preview):

- `node` — v24.18.0 / linux / x64 / 2279MB / 2 vCPU
- `spawn` — child_process 정상 (exit 0)
- `binary` — 214MB 다운로드+압축해제 **2.37초**
- `version` — `claude --version` → `2.1.251 (Claude Code)`, exit 0, **14ms**
- `headless` — **미검증** (`CLAUDE_CODE_OAUTH_TOKEN` 미설정으로 스킵)

판정: **바이너리 확보·실행 경로는 Vercel 에서 성립한다.** 설계안이 우려한
"spawn 이 안 될 것"과 "다운로드가 너무 느릴 것"은 둘 다 사실이 아니었다.
GitHub Actions 대안은 아직 필요 없다 — 토큰 등록 후 6단계까지 통과하면
그때 최종 확정한다.

### 왜 의존성으로 넣지 않았는가

Claude Code 2.x 는 npm 패키지가 아니라 플랫폼별 네이티브 바이너리다.
`@anthropic-ai/claude-code` 는 178KB 런처 껍데기이고, 실행 파일은
`@anthropic-ai/claude-code-linux-x64`(압축 해제 214MB)에 있다.
Vercel 서버리스 번들 상한이 250MB 라 의존성으로 넣으면 Next.js 런타임과
합쳐 상한을 넘길 위험이 크다. 그래서 실행 시점에 /tmp(512MB)로 받는다.

콜드스타트마다 재다운로드되지만 실측 2.37초라 나이틀리 배치에는 무시할
만한 비용이다.

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

### 3-2. Vercel 환경변수 등록

Vercel 대시보드 → 프로젝트 `solutionarchive-app` → Settings →
Environment Variables →

- Key: `CLAUDE_CODE_OAUTH_TOKEN`
- Value: 위에서 발급받은 토큰
- Environments: **Production 과 Preview 둘 다 체크**

⚠️ Preview 를 빼면 스파이크·수동 검증이 전부 실패한다. 실제로 이번 세션에서
   6단계가 스킵된 이유가 정확히 이것이다.

등록 후에는 **재배포가 필요하다** — Vercel 환경변수는 빌드/런타임 시점에
주입되므로 기존 배포에는 소급 적용되지 않는다.

### 3-3. 등록 확인

재배포 후 스파이크 라우트를 다시 호출하면 6단계까지 판정이 나온다.
호출 방법은 아래 §5 참조.

---

## 4. ⚠️ `CRON_SECRET` 미설정 — 보안 확인 필요

스파이크 도중 발견한 별건이다. **Preview 환경에 `CRON_SECRET` 이 설정되어
있지 않다.** 확인 방법과 근거:

```
curl -X POST -H "Authorization: Bearer undefined" <preview-url>/api/test/claude-headless
→ HTTP 200 (통과해버린다)
```

크론 라우트들은 전부 아래 형태로 인증한다:

```ts
if (auth !== `Bearer ${process.env.CRON_SECRET}`) return 401
```

환경변수가 없으면 비교 대상이 문자열 `"Bearer undefined"` 가 되어, 그 값을
보낸 사람은 누구나 통과한다. 영향 범위:

- `/api/threads/publish` — **Threads 에 실제로 글을 발행한다**
- `/api/threads/refresh-token` — 토큰을 회전시킨다
- `/api/threads/match-posts`, `/api/threads/collect-metrics` — DB 에 쓴다

Preview 는 Deployment Protection 이 걸려 있어 외부에서 바로 도달하지는
않지만, **Production 에도 같은 변수가 비어 있는지 반드시 확인해야 한다.**
Production 은 보호가 없고 `publish` 는 되돌릴 수 없다.

(Production 쪽은 확인 자체가 부작용을 일으키므로 — 통과하면 그 순간
라우트가 실제로 실행된다 — Claude 가 확인하지 않았다. 대시보드에서
직접 볼 것.)

권장: `CRON_SECRET` 을 Production/Preview 양쪽에 설정하고, 라우트의 가드를
"환경변수가 없으면 무조건 거부"로 바꾼다(별도 작업).

---

## 5. 스파이크 라우트 호출 방법

Preview 는 Deployment Protection 때문에 먼저 공유 링크로 쿠키를 받아야 한다.
(Vercel 대시보드 → 배포 → Share 에서 링크 생성)

```bash
BASE="https://<preview-url>"
curl -s -c /tmp/vc.jar -L "$BASE/?_vercel_share=<token>" -o /dev/null

curl -s -b /tmp/vc.jar -X POST "$BASE/api/test/claude-headless" \
  -H "Authorization: Bearer $CRON_SECRET" | python -m json.tool
```

응답은 단계별 판정(`stages[]`)과 종합 `verdict` 를 준다:

- `vercel-viable` — 6단계까지 통과. §2~6 로직 조립 진행 가능
- `inconclusive` — 5단계까지 통과, 토큰만 없음
- `vercel-blocked` — 어느 단계에서 왜 막혔는지가 `stages` 에 있다.
  이 경우 설계안의 대안(GitHub Actions 무료 티어로 이 스텝만 분리)으로 전환

⚠️ 이 라우트는 임시다. 최종 판정이 끝나면
   `app/api/test/claude-headless/` 를 삭제하고 결론만 이 문서에 남긴다.

---

## 6. 아직 안 한 것

- 설계안 §2~6 로직(`/api/cron/nightly-insight-loop`) — 6단계 판정 대기 중
- 수동 트리거 경로(`/insight-review` 또는 curl 엔드포인트) — 위와 함께
- 크론 등록(`vercel.json`) — 며칠 수동 호출로 검증한 뒤에
- `insight-guide.md` / `threads-draft.md` 패치 — 패치안 문서 미확보
