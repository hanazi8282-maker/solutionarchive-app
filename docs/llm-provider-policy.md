# LLM 프로바이더 정책 (남헌 2026-09-30)

## 결정
- 파이프라인 전체를 **claude-cli + Sonnet 5.5(`claude-sonnet-5-5`) 고정**으로 운영한다. 모델은 항상 명시한다 — CLI 기본값에 맡기지 않는다.
- `claude-sonnet-5` 는 **5.0 이라 다른 모델**이다(실호출로 확인, #368). 별칭 `sonnet` 도 고정이 아니다. `scripts/llm-provider-selftest.mjs` 가 재유입을 막는다.
- gemini 자동 폴백은 **만들지 않는다.** 감지 로직(`isQuotaFailure`·`isCliLimitError`)은 있고 전환 로직만 없다 — 이번 범위 제외.

## 코드 반영 (2026-09-30)
- `lib/analysis/llm.ts`: `CLAUDE_CLI_DEFAULT_MODEL = 'claude-sonnet-5-5'`, `callClaudeCli` 가 `--model` 을 항상 넘긴다(env `CLAUDE_CLI_MODEL` 이 있으면 그 값). 이 경로를 타는 것: 관련성 1차 판정·프로필·extract·번역·칼럼 검수 등.
- `scripts/cmo-daily.mjs`: `claude -p` 세 호출(researcher·writer·analyst)에 `--model claude-sonnet-5-5`. 에이전트 파일의 `model:` 은 이 러너에서 적용되지 않는다(러너가 프롬프트로 파일을 읽힐 뿐) — 실제 모델은 이 플래그다.
- `lib/insight/llm.ts`·`scripts/column-feedback.mjs`·`scripts/column-review-claude.mjs`: #368. 워크플로 `CLAUDE_CLI_MODEL`: #369.
- **리포트 앵글 검증(`/cases/report` 로그인후, I4, 2026-10-01)도 claude-cli Sonnet 5.5 고정, 폴백 0.** `lib/cases/idea-angles-run.ts` 가 프로바이더를 `'claude-cli'` 리터럴로 쓴다 — Vercel `LLM_PROVIDER` 가 gemini 여도 이 경로는 CLI 다. 토큰(`CLAUDE_CODE_OAUTH_TOKEN`)이 없으면 실행 행이 `failed('CLAUDE_CODE_OAUTH_TOKEN 미설정')` 으로 끝나고 Gemini 를 부르지 않는다. 한도(429·한도 문구)면 `limited` 로 멈추고 뒤 앵글을 돌리지 않는다. 실제 모델은 행의 `models`(봉투 model)와 `POST /api/cases/report/angles?probe=1` 응답으로 확인한다.

## 남은 예외 — 남헌 확인 필요
- **관련성 2차 판정은 Gemini다**(`nightly-relevance.yml`, `GEMINI_API_KEY`). `CLAUDE.md §10.1` 의 T2 자동 승인(`rr-v2`)은 **1차와 다른 계열의 독립 2차 판정**을 조건으로 건다. 이것까지 claude-cli 로 돌리면 독립성 조건이 깨진다 — "claude-cli만" 이 이 2차 판정을 포함하는지 결정이 필요하다(포함하면 rr-v2 예외 재설계).
- **Vercel 런타임 환경변수**(`LLM_PROVIDER`·`INSIGHT_LLM_PROVIDER`·`CLAUDE_CLI_MODEL` 등)는 코드가 아니라 Vercel 설정이다. 이 세션에서 확인하지 못했다 — 런타임에서 LLM 을 부르는 경로(카카오 인사이트 봇 등)가 어느 프로바이더인지 확인 불가.
- anthropic API 경로 코드(`ANTHROPIC_MODEL = claude-opus-5-5`, insight 의 `claude-sonnet-5-5`)는 남아 있지만 `LLM_PROVIDER=anthropic` 일 때만 쓰인다.

## 전환 트리거 (기록만, 지금은 전환하지 않는다)
- **실고객 트래픽이 시작되면 `anthropic`(종량제)로 수동 전환한다.** 구독 기반 claude-cli 는 실서비스 트래픽용이 아니라는 판단이다.
- 전환 방법: `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` 등록, 모델 상수 확인. 전환 전 `lib/analysis/budget.ts` 달러 예산(기본 5/일)을 트래픽에 맞게 재설정한다.
  ⚠️ 리포트 앵글 검증은 `LLM_PROVIDER` 를 읽지 않는다(위 "코드 반영"). 전환할 때 `lib/cases/idea-angles-run.ts` 의 `PROVIDER` 리터럴도 같이 바꿔야 한다 — env 만 바꾸면 이 경로는 계속 구독 창을 쓴다.

## 재검토 항목 (기록만, 전환 트리거와 같은 성격)

### 리포트 앵글 검증 사용자당 일일 10건 — **잠정치** (남헌 2026-10-01)
- 지금 상한: 사용자당 하루 10건(24시간 창, `idea_angle_runs` 의 queued·running·done·failed 행 수) · 사용자당 동시 1건 · 전역 동시 2건. 상수는 `lib/cases/idea-angles.ts` `IDEA_LIMITS` 한 곳. 캐시 히트(7일 안 같은 질의)는 LLM 0회라 세지 않는다.
- **실고객 트래픽이 실제로 붙는 상용화 시점에 이 숫자를 반드시 재검토한다** — 구독 5시간 창 공유(낮 리포트가 `nightly-extract`·`relevance-translate`·`cmo-daily` 와 같은 OAuth 토큰을 쓴다)와 anthropic 종량제 전환(위 전환 트리거)과 한 묶음으로 본다. 리포트 1건 = CLI 4~10회(아래 "호출 수"), 10건/일 × 사용자 3명 = 최대 300회.
- **그 시점이 오면 남헌에게 반드시 알려야 한다.** 코드가 스스로 알릴 수는 없다 — 이 문서를 읽는 세션(CEO-STAFF·CTO)이 아래 트리거 중 하나라도 보이면 남헌에게 상기시킨다.
- 재검토 트리거(수치는 **제안**, 확정은 남헌):
  1. **허용목록 밖 사용자 추가** — `AUTH_ALLOWED_EMAILS` 에 외부(베타·고객) 이메일이 1건이라도 들어가는 순간. 이건 §10.2 예외 3번(인증 경계)이기도 해서 어차피 사람 판단을 거친다 — 그 자리에서 이 상한도 같이 본다.
  2. **하루 앵글 요청 총합** — `idea_query_log` 24시간 행 수가 **30건 이상인 날이 3일 연속**(제안).
  3. **`limited` 비율** — 최근 7일 `idea_query_log` 중 `outcome='limited'` 가 **10% 이상**(제안). 상한이 실사용을 막고 있다는 뜻이다.
  4. **구독 한도로 끝난 실행** — `idea_angle_runs.status='limited'` ∧ `error LIKE '구독 사용량 한도%'` 가 **1주에 1건이라도**(제안). 같은 날 야간 배치가 `isCliLimitError` 로 멈췄다면 즉시.
- **닫힘(남헌 2026-10-01): 자동 경보 안 만든다, SQL 로만 센다.** 위 트리거 4개는 아래 SQL 로 세는 것으로 끝이다 — 경보·크론·Notion 자동 행을 만들지 않는다. 상용화 시점 재검토는 남헌이 직접 물어볼 사안이라 코드 작업 대상이 아니다(service_role, SQL Editor):
  ```sql
  -- 2·3번: 최근 7일 일별 요청 수 · limited 비율 · 묻는 사람 수
  -- ⚠️ 20261001000048 적용 뒤 idea_query_log 에 리포트 조회(source='report_view', 익명 포함)도 쌓인다 — 앵글 요청만 센다.
  SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul') AS kst_day,
         count(*) AS asks,
         count(*) FILTER (WHERE outcome = 'limited') AS limited,
         round(100.0 * count(*) FILTER (WHERE outcome = 'limited') / nullif(count(*), 0), 1) AS limited_pct,
         count(DISTINCT requested_by) AS people
    FROM public.idea_query_log
   WHERE created_at > now() - interval '7 days' AND source = 'angle_api'
   GROUP BY 1 ORDER BY 1 DESC;
  -- 4번: 구독 한도로 끝난 실행 · 하루 LLM 호출 합
  SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul') AS kst_day,
         count(*) FILTER (WHERE status = 'limited' AND error LIKE '구독 사용량 한도%') AS cli_limit_runs,
         sum(llm_calls) AS llm_calls
    FROM public.idea_angle_runs
   WHERE created_at > now() - interval '7 days'
   GROUP BY 1 ORDER BY 1 DESC;
  ```

### 리포트 앵글 검증의 호출 수 (참고)
- 문서 추정(I4-2)은 앵글 3개 × (writer + judge, 최악 +재작성+재판정) = 6~12회였다. 구현은 **writer 를 1회로 묶어**(앵글 3개를 한 번에, 선례 문구를 앵커로 강하게 주입) **4~10회**다(+JSON 재요청 시 1회씩).
- judge 는 앵글마다 1회를 유지한다 — 3개를 한 프롬프트로 몰아 판정하면 앵글끼리 앵커링되고, writer 가 자기 문구를 판정하면 면죄부를 준다(판정 품질 절충 금지, 남헌 확정 1). 재작성 뒤 재판정도 유지한다(안 하면 순화된 문구에 "근거 없음" 이 그대로 붙는다).
