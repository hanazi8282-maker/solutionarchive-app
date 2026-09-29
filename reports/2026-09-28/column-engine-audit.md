# 칼럼 작성·검수 엔진 감사 — 실행 로그 기준 (2026-09-28)

남헌 지시(2026-09-28): 09-25 칼럼 전수검수(수정본 11편)와 09-27 로그의 "칼럼 작성·검수 전부 claude-cli" 기록이
지금도 맞는지 **실행 로그로** 다시 확인한다. 조사만 했다. DB 는 읽지도 쓰지도 않았다(서브에이전트 경계).

## 결론

- **검수(수정본 11편): claude-cli 로 확인됨.** GitHub Actions 실행 2건의 로그에서 11편 전부 `provider=claude-cli`,
  `gemini` 문자열 0건. 로컬 세션에서 돌린 흔적 없음.
- **작성(원문 초안): Claude 로 확인됨. 단, claude-cli 경로가 아니다.** 원문은 LLM_PROVIDER 를 타는 스크립트가 아니라
  대화형 Claude Code 세션이 직접 파일로 썼다(커밋 트레일러 `Claude Sonnet 5` · `Claude Fable 5.1`).
  칼럼 원문을 LLM 으로 생성하는 코드 경로는 리포에 없다.
- **Gemini 가 낀 편: 없음.** 재작업 대상 0편.
- **확인 불가 1건:** 실제 DB 의 `content_columns.revised_by` 11행이 전부 `claude-cli` 인지 — 오케스트레이터 확인 필요(아래 §4).

## 1. 코드 경로와 provider 결정 방식

| 경로 | LLM 호출 | provider 결정 |
|---|---|---|
| `scripts/column-review-claude.mjs` (전수검수, `body_revised` 를 쓰는 **유일한** LLM 경로) | `callLlmWithModel` (:75) | `resolveProvider()` (:33) → `LLM_PROVIDER` env. **`--run` 이면 claude-cli 가 아닐 때 exit 2** (:34). 이 가드는 첫 커밋 a1ab0eb(#283)부터 있었다 |
| `lib/analysis/llm.ts` | — | 코드 기본값은 **gemini** (:24 `DEFAULT_PROVIDER`, :26-33). claude-cli 분기(:348-358)는 gemini 로 폴백하지 않는다 — gemini 체인(:370-393)은 provider 가 gemini 일 때만 탄다 |
| `.github/workflows/column-review.yml` | 위 스크립트 | 워크플로 env `LLM_PROVIDER: claude-cli` 고정 (:73). `GEMINI_API_KEY` 는 env 에 **없다** — 구조적으로 Gemini 호출 불가 |
| `scripts/column-feedback.mjs` (반려 사유 → 규칙 제안) | `askLlm` (:294-) | `lib/insight/llm.ts:24-29` `activeProvider()` → `INSIGHT_LLM_PROVIDER`, 기본 **claude-cli**. 허용값 claude-cli/anthropic/mock 뿐, gemini 분기 자체가 없다. 워크플로 없음(로컬 수동) |
| `scripts/column-stage.mjs` · `column-check.mjs` · `column-threads-stage.mjs` | 없음 | LLM 미사용(파일→DB 적재·정적 점검) |
| `app/columns/actions.ts:123-138` | 없음 | 사람이 수정본 채택 시 body↔body_revised 맞바꿈만 |

## 2. 실행 증거

`gh run list --workflow column-review.yml` — 전 기간 실행 2건뿐(09-24~09-28 사이 추가 실행 없음).

**run 36142051226** (2026-09-25 13:36Z, failure) — CLI `2.1.251 (Claude Code)`
- `미발행 draft 9편 → 대상 9편 · provider=claude-cli`
- 8편 `claude -p 실패 (exit null, timeout)` (180초 타임아웃 → #286 에서 900초로 수정)
- `[analysis/llm] column-review:notion provider=claude-cli model=claude-cli` → `✅ notion` 저장 1편
- 이 실행의 커밋 스텝은 실패 시 건너뛰는 구조였다(#286 전) → **notion 의 diff·revised 파일은 리포에 없다**. 증거는 이 로그뿐

**run 36145467857** (2026-09-25 14:08Z, success) — `dry_run=false limit=11`
- `미발행 draft 11편 → 대상 10편 · provider=claude-cli` (notion 은 이미 수정본이 있어 제외)
- 10편 전부 `provider=claude-cli model=claude-cli` + `✅`: chewy · convertkit · hairloss-shampoo-reviews · hoka · homejoy ·
  juicero · pets-com · quibi · testimonial-to · plausible
- `끝 — 수정본 저장 10 · 형식/길이 탈락 0 · 실패 0 · 추정 $1.939`
- 결과 커밋 241e804 (작성자 `column-review-bot`) — `reports/2026-09-25/column-review/*.diff` 10개, `drafts/columns/_review/*.revised.md` 10개

두 로그 전체에 `gemini`/`Gemini` 0건. 합계 notion 1 + 10 = **11편**, "11편 수정본" 기록과 일치.

**대화형 세션 실행 여부:** 없음. 수정본 커밋은 봇 커밋 1건뿐이고, 로컬에서 `--run` 을 돌렸다면 남았을
사람 커밋·로컬 산출물이 없다. 설령 로컬에서 돌렸어도 현재 `.env.local` 의 `LLM_PROVIDER` 는 **`gemini`** 이지만
`column-review-claude.mjs:34` 가드가 `--run` 을 exit 2 로 막는다(드라이런은 LLM 을 부르지 않는다).
→ 로컬 값이 gemini 라는 사실은 이 스크립트의 결과에 영향을 주지 못한다.

**원문 작성:** 09-15~09-17 원문은 #91·#96·#105·#124·294f074 (트레일러 `Claude Sonnet 5`), SaaS 2편(testimonial-to·plausible)은
98c225c/#285 "CMO 세션 작성"(트레일러 `Claude Fable 5.1`). 대화형 Claude Code 세션 산출물이며 Gemini 가 끼어들 경로가 없다.

## 3. 주의(오류는 아님)

- 로그의 `model=claude-cli` 는 **라벨**이다(`lib/analysis/llm.ts:45-46`). CLI 응답 봉투에 모델명이 안 와서 실제 Claude 모델(Sonnet/Opus 등)은
  기록되지 않았다. "Claude 였다"는 확인되지만 "어느 Claude 였는지"는 확인 불가.
- 09-27 "칼럼 작성·검수 전부 claude-cli" 문장은 리포 reports/ 에는 없고 Notion 로그·메모리에만 있다. 검수는 맞고, 작성은
  "claude-cli" 가 아니라 "대화형 Claude 세션"이 정확한 표현이다. Gemini 가 아니라는 결론은 같다.

## 4. 오케스트레이터 확인 필요 (DB)

```sql
select slug, revised_by, revision_status, revised_at from content_columns
where body_revised is not null order by revised_at;
```
기대: 11행, `revised_by='claude-cli'`, `revised_at` 전부 2026-09-25 13:57~14:55Z. 채택된 편은 `revision_status='approved'` 이고
body_revised 자리에 원문이 들어가 있다(actions.ts:138 맞바꿈). 이 범위 밖의 `revised_by`(예: `gemini-*`)나 다른 시각이 보이면
이 결론을 뒤집는다.

## 5. 재작업 명령 (현재 대상 0편 — 참고용)

Gemini 편이 나오면 해당 slug 만 워크플로로 다시 돌린다(`LLM_PROVIDER: claude-cli` 가 yml:73 에 고정):

```
gh workflow run column-review.yml -f dry_run=false -f slug=<slug> -f force=true -f limit=1
```

로컬에서 돌릴 때는 `.env.local` 이 `LLM_PROVIDER=gemini` 이므로 반드시 앞에 덮어쓴다(`--env-file` 은 이미 있는 env 를 덮지 않는다):

```
CLAUDE_CLI_PATH="$(which claude)" LLM_PROVIDER=claude-cli node --env-file=.env.local scripts/column-review-claude.mjs --run --slug <slug> --force
```

주의: `--force` 는 `review_status='draft'` 인 행만 대상이다(:45). 이미 채택·발행된 편은 이 스크립트로 다시 돌지 않는다.
