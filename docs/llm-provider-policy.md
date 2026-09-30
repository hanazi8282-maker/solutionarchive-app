# LLM 프로바이더 정책 (남헌 2026-09-30)

## 결정
- 파이프라인 전체를 **claude-cli + Sonnet 5.5(`claude-sonnet-5-5`) 고정**으로 운영한다. 모델은 항상 명시한다 — CLI 기본값에 맡기지 않는다.
- `claude-sonnet-5` 는 **5.0 이라 다른 모델**이다(실호출로 확인, #368). 별칭 `sonnet` 도 고정이 아니다. `scripts/llm-provider-selftest.mjs` 가 재유입을 막는다.
- gemini 자동 폴백은 **만들지 않는다.** 감지 로직(`isQuotaFailure`·`isCliLimitError`)은 있고 전환 로직만 없다 — 이번 범위 제외.

## 코드 반영 (2026-09-30)
- `lib/analysis/llm.ts`: `CLAUDE_CLI_DEFAULT_MODEL = 'claude-sonnet-5-5'`, `callClaudeCli` 가 `--model` 을 항상 넘긴다(env `CLAUDE_CLI_MODEL` 이 있으면 그 값). 이 경로를 타는 것: 관련성 1차 판정·프로필·extract·번역·칼럼 검수 등.
- `scripts/cmo-daily.mjs`: `claude -p` 세 호출(researcher·writer·analyst)에 `--model claude-sonnet-5-5`. 에이전트 파일의 `model:` 은 이 러너에서 적용되지 않는다(러너가 프롬프트로 파일을 읽힐 뿐) — 실제 모델은 이 플래그다.
- `lib/insight/llm.ts`·`scripts/column-feedback.mjs`·`scripts/column-review-claude.mjs`: #368. 워크플로 `CLAUDE_CLI_MODEL`: #369.

## 남은 예외 — 남헌 확인 필요
- **관련성 2차 판정은 Gemini다**(`nightly-relevance.yml`, `GEMINI_API_KEY`). `CLAUDE.md §10.1` 의 T2 자동 승인(`rr-v2`)은 **1차와 다른 계열의 독립 2차 판정**을 조건으로 건다. 이것까지 claude-cli 로 돌리면 독립성 조건이 깨진다 — "claude-cli만" 이 이 2차 판정을 포함하는지 결정이 필요하다(포함하면 rr-v2 예외 재설계).
- **Vercel 런타임 환경변수**(`LLM_PROVIDER`·`INSIGHT_LLM_PROVIDER`·`CLAUDE_CLI_MODEL` 등)는 코드가 아니라 Vercel 설정이다. 이 세션에서 확인하지 못했다 — 런타임에서 LLM 을 부르는 경로(카카오 인사이트 봇 등)가 어느 프로바이더인지 확인 불가.
- anthropic API 경로 코드(`ANTHROPIC_MODEL = claude-opus-5-5`, insight 의 `claude-sonnet-5-5`)는 남아 있지만 `LLM_PROVIDER=anthropic` 일 때만 쓰인다.

## 전환 트리거 (기록만, 지금은 전환하지 않는다)
- **실고객 트래픽이 시작되면 `anthropic`(종량제)로 수동 전환한다.** 구독 기반 claude-cli 는 실서비스 트래픽용이 아니라는 판단이다.
- 전환 방법: `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` 등록, 모델 상수 확인. 전환 전 `lib/analysis/budget.ts` 달러 예산(기본 5/일)을 트래픽에 맞게 재설정한다.
