# Gemini 구독 → CLI 활용 가능성 조사 + 제3자 교차검증 감사 설계 (2026-09-28)

조사 전용. 코드 변경·커밋·PR 없음. 태그: **[확인]** 출처를 직접 읽음 · **[추정]** 근거는 있으나 실측 안 함 · **[확인 불가]** 이번 조사로 판정 못 함.

## 0. 결론 먼저

- **구독(Google AI Pro)을 CI 무인 호출에 쓰는 것 → 불가(CI 부적합).** 기술적으로 막힌 게 아니라 **공식 경로가 없고 약관이 금지 쪽**이다.
  - Gemini CLI 는 개인 Google 로그인(OAuth)을 지원하고 AI Pro 에 더 높은 한도를 준다 [확인].
  - 그런데 Anthropic 의 `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` 같은 **"CI 용 토큰을 발급해 env 로 넣는" 공식 경로가 없다** [확인: 인증 문서·공식 GitHub Action 어디에도 없음].
  - 헤드리스 모드는 "이미 캐시된 자격증명이 있으면 그걸 쓴다"고만 되어 있다 [확인]. 캐시 파일을 시크릿으로 구워 넣는 방식은 문서에 없는 우회로다. 게다가 약관이 "Gemini CLI 를 받치는 서비스에 제3자 소프트웨어로 직접 접근하면 계정 정지 사유"라고 적고 있다 [확인].
- **전제 정정 — 지금 2차 판정은 Gemini 가 아니다** [확인: 리포 실측].
  - T2 2차 판정은 09-27 클라우드 Claude 세션이 했다(PR #296, `reports/2026-09-28/cowork-four-orders.md` §199~205).
  - T2 1차 판정(`nightly-relevance.yml`)도 09-26 부터 `claude-cli` 다(리포 변수 `RELEVANCE_LLM_PROVIDER` 로만 gemini 복귀).
  - **즉 신규 행은 이미 1차·2차가 둘 다 Claude다.** §5 의 "다른 계열 모델이 최소 하나는 늘 낀다"는 대비책이 아니라 **지금 비어 있는 구멍**이다.
- **권고: 구독 대신 기존 `GEMINI_API_KEY` 프로젝트에 결제만 연결해 쓴다(주 1회 감사).** 감사 1회 비용은 1달러 미만으로 추정된다(§4). 구독을 CI 에 억지로 끼우는 리스크(계정 정지·토큰 만료로 인한 조용한 실패)가 그 비용보다 훨씬 크다.

## 1. Gemini CLI 개인 로그인 사양 (2026-09 기준)

| 항목 | 내용 | 태그 |
|---|---|---|
| 인증 방식 | Sign in with Google(개인 계정) / Gemini API 키 / Vertex AI(ADC·서비스 계정 JSON·API 키) / 헤드리스(env 기반) | [확인] 인증 문서 |
| Google 로그인 절차 | `gemini` 실행 → "Sign in with Google" 선택 → **웹 브라우저로 로그인 창이 열린다**. "credentials will be cached locally for future sessions" | [확인] |
| 캐시 파일 위치 | 공식 문서엔 경로가 없다. 이슈 트래커에 따르면 `~/.gemini/oauth_creds.json` | [확인 불가] 공식 문서 미기재 |
| 일일 한도(개인 계정) | Code Assist 개인(무료) 1,000 / **Google AI Pro 1,500** / Google AI Ultra 2,000 요청/일. "subject to availability … in times of high demand" | [확인] quota-and-pricing.md |
| 모델 | "across the Gemini model family as determined by Gemini CLI" — 모델을 사용자가 고르는 게 아니라 CLI 가 정한다 | [확인] |
| API 키 무료 등급(CLI 경유) | 250 요청/일, **Flash 모델만** | [확인] |
| 2026-05 구독 한도 개편 | Gemini **앱**은 5월 17~20일부터 "5시간마다 갱신 + 주간 상한"의 연산량 기반으로 바뀌었다(Pro = 표준의 4배). CLI 문서는 아직 1,500/일 표를 싣고 있다. 개편이 CLI 에도 적용됐는지는 판정 못 했다 | 앱 쪽 [확인] · CLI 적용 여부 [확인 불가] |
| AI Pro 가 앱에서 쓰는 모델 | Gemini 3 Flash-lite / 3 Flash / 3 Pro | [확인] Gemini Apps Help |
| 헤드리스 호출 | `-p`(또는 비 TTY) → 헤드리스. `--output-format json` → `{response, stats, error}`. 종료코드 0/1/42/53 | [확인] headless 문서 |
| 헤드리스 인증 | "Headless mode will use your existing authentication method, **if an existing authentication credential is cached**." 없으면 API 키나 Vertex 를 env 로 설정해야 한다 | [확인] |
| CI 권장 방식 | 문서가 CI/CD 에 권하는 것은 **서비스 계정 JSON(Vertex)**. 공식 GitHub Action `run-gemini-cli` 의 입력은 `gemini_api_key` / `gcp_workload_identity_provider` / `use_vertex_ai` / `use_gemini_code_assist` / `google_api_key` 다. **개인 OAuth·AI Pro 입력은 없다** | [확인] |
| 약관 | 개인 계정 + AI Pro/Ultra 에는 Google ToS + Google One 추가약관이 걸린다. "Directly accessing the services powering Gemini CLI using third-party software, tools, or services is a violation … may be grounds for suspension or termination of your account." | [확인] tos-privacy 문서 |

### 헤드리스 환경에서 OAuth 가 실제로 어떻게 되나

- `NO_BROWSER=true` 면 사용자 코드(URL 복사) 방식으로 바뀐다. 하지만 이것도 **사람이 브라우저에서 한 번은 로그인해야** 한다. 헤드리스·VPS 에서 로그인이 멈추거나 반복되는 버그가 여러 버전에 걸쳐 보고됐다(#1696, #13853, #27300, #28440, PR #29448 "headless keyring" 루프) [확인: 이슈 존재] · 2026-09 최신 버전의 상태 [확인 불가].
- 이슈 #28440 에는 "손으로 써 넣은 `oauth_creds.json` 은 무시되고 재인증 루프로 돌아간다"는 보고가 있다 [확인: 이슈 본문 요약] · 재현 여부 [확인 불가].

## 2. claude-cli 방식과 구조 비교

| | Claude Code (지금 쓰는 것) | Gemini CLI |
|---|---|---|
| CI 용 장기 토큰 발급 명령 | `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` env 하나로 끝 [확인: 리포 워크플로 7개가 이 방식이고 `claude-auth-status.yml` 로 계정을 진단한다] | **없다** [확인: 인증 문서·공식 Action 모두 미기재] |
| 구독 인증을 env 로 넣는 경로 | 있다(위) | 없다. env 로 받는 건 API 키와 Vertex 자격증명뿐 [확인] |
| 캐시 파일 이식 | 필요 없음 | 문서에 없는 우회. 리프레시 토큰이 러너마다 새로 쓰이고 저장 방식(파일/키링)이 버전마다 바뀌었다 → 조용히 재인증 루프에 빠질 위험 [추정] |
| 약관상 지위 | 공식 기능 | "제3자 소프트웨어로 직접 접근"은 정지 사유 [확인]. 우리 스크립트가 **공식 `gemini` 바이너리를 서브프로세스로 부르는 것** 자체는 직접 접근이 아니라고 볼 여지가 있다. 하지만 개인 구독 자격증명을 CI 러너에 복사해 무인 배치를 도는 것이 허용되는지는 문서에 답이 없다 [확인 불가] |

**판정 — "안 된다"와 "확인 불가"를 나눈다.**
- **안 된다(공식 경로 부재)** [확인]: Claude 와 똑같은 "토큰 발급 → env → CI" 경로는 Gemini CLI 에 없다.
- **확인 불가**: `oauth_creds.json` 을 GitHub Secret 으로 넣어 러너에서 복원하는 방식이 2026-09 버전에서 기술적으로 동작하는지. 이건 실측이 필요하다. 다만 동작하더라도 ① 약관 회색지대 ② 한도·모델이 "CLI 가 정하는 대로"라 재현성이 없음 ③ 토큰 만료가 §7.1 류의 조용한 실패가 됨 — 이 세 이유로 권하지 않는다.
- 구조적 원인: Anthropic 은 구독 OAuth 를 **Claude Code 의 공식 CI 인증 수단**으로 내놓았다. Google 은 구독 OAuth 를 **대화형 개인용**으로만 두고, CI 는 API 키·Vertex(과금 계정)로 보내는 설계다 [확인: 두 회사 문서가 CI 에 권하는 수단이 다름]. 그 설계 의도가 무엇인지는 [추정].

## 3. `gemini-cli` provider 구현 난이도 (추정만, 구현 안 함)

- **코드 자체는 작다** [추정]: `callClaudeCli` 를 복제해 `gemini -p --output-format json [-m <model>]` 에 stdin 을 넘기고 `response` 를 꺼내면 된다. 종료코드 1 을 `ClaudeCliError` 처럼 한도 실패로 매핑한다. `LlmProvider` 유니온, `requiredKeyFor`, `isQuotaFailure` 에 한 줄씩 더하고 셀프테스트 1개를 붙인다. **약 2~3시간.**
- **리스크는 코드가 아니라 인증에 있다** [추정]:
  1. CI 인증이 공식 경로가 아니다(§2). 여기에 드는 시간이 코드 시간을 훨씬 넘고, 끝내 안 될 수도 있다.
  2. Gemini CLI 는 에이전트라 헤드리스에서도 도구 호출을 시도할 수 있다. 판정 전용으로 도구를 막는 설정을 따로 확인해야 한다 [확인 불가].
  3. 모델을 CLI 가 고르므로 판정 모델명이 날마다 바뀔 수 있다. `stats` 에 모델명이 찍히는지 확인이 필요하다 [확인 불가].
  4. 한도 소진 문구가 버전마다 바뀐다(claude-cli 와 같은 문제). 문자열로 판정하지 않는 현행 원칙을 그대로 따라야 한다.
- **로컬 대화형 세션 전용**(남헌 PC 에서 이미 로그인된 `gemini` 로 수동 실행)이라면 인증 리스크는 사라지고 2~3시간이면 된다. 다만 그 용도라면 §4 의 B안(API 키)이 더 단순하다.

## 4. 차선책 비교

| 안 | 내용 | 비용 | 판정 |
|---|---|---|---|
| **A. 유료 API 키(권고)** | 기존 `GEMINI_API_KEY` 의 AI Studio 프로젝트에 결제를 연결한다 → Tier 1. 코드 변경 없이 `GEMINI_MODEL` 만 Pro 급으로 지정한다 | 감사 100건/주 ≈ 입력 20만·출력 2만 토큰. **Gemini 3.1 Pro Preview**($2/$12 per 1M) ≈ **$0.64/주**, Gemini 3.8 Flash($0.75/$3.75) ≈ $0.23/주, Batch API 는 절반 [확인: 단가는 pricing 페이지 · 토큰량은 추정] | 가장 싸고 공식이고 재현 가능하다. 결제 연결 자체는 **사람 판단**(§10.2 예외: 가격·키) |
| B. 무료 등급 유지 + 가중치 하향 | 감사를 무료 Flash 로 돌린다. 신규 행이 둘 다 Claude 이므로, Gemini 는 "승인 조건"이 아니라 **경보 전용**으로만 쓴다 | 0원. 단 `gemini-3.6-flash` 20건/일(llm.ts 주석) · 09-24~27 503 연속 [확인: 리포 기록] → 100건 표본을 하루에 못 채울 수 있다 | 가능. 대신 표본을 여러 날로 나누고 모델 체인 폴백을 허용해야 한다. **무료 등급은 입력을 학습·사람 검토에 쓸 수 있다** [확인: Gemini API 약관 Unpaid Services]. 공개 리뷰 원문이라 치명적이진 않지만 적어 둔다 |
| C. 구독을 사람 수동 감사에 사용 | 남헌(또는 CEO-STAFF 가 준비한 파일)이 주 1회 Gemini 앱/로컬 `gemini` 에 export JSON 을 붙여 넣고 판정 JSON 을 받아 `ops/state/` 에 저장한다 → 기존 import 드라이런으로 비교 | 구독료 외 0원. 사람 시간 주 20~30분 [추정] | CI 제약은 우회된다. 하지만 사람 병목이 이미 최대 문제(승인 정체)라 **주 단위 지속성이 약하다**. A 가 막힐 때의 폴백으로만 둔다 |
| D. CI 에 OAuth 캐시 이식 | §2 우회 | 0원 | **비권고** — 약관 회색·재현성 없음·조용한 실패 |

## 5. 제3자 교차검증 감사 설계 (남헌 확정 방향)

**목적**: 1차·2차가 둘 다 Claude 인 지금(§0), 같은 계열의 **상관된 오류**(같은 착각을 둘이 함께 하는 것)를 잡는 다른 계열 심판을 늘 하나 둔다. 일치율이 높다는 것 자체가 정확도의 증거가 아니게 된 상태를 측정 가능하게 만드는 것이다.

### 5.1 실행 방식

- **CI 자동, 주 1회**(월요일 KST 새벽, 기존 야간 슬롯과 겹치지 않게). `workflow_dispatch` 도 연다.
- 인증은 A안(기존 `GEMINI_API_KEY` 시크릿을 그대로 쓴다 — 새 시크릿 없음). 결제 연결 전에는 B안(무료 Flash)으로 돌린다. 모델명을 매 실행 기록한다.
- **DB 쓰기 0.** 산출물은 `ops/state/` · `reports/` 파일뿐이다 → 무인 루프 커밋 화이트리스트 안(§10.1).
- A 가 막히면(결제 미승인·연속 503) C안(사람 수동)으로 폴백하고, 그 주는 "감사 미실행"으로 **실패 보고**한다(§7.1 — 건너뛴 걸 통과로 적지 않는다).

### 5.2 표본 (주 100건, 층화 무작위)

| 층 | 건수 | 이유 |
|---|---|---|
| 1차·2차 **일치** relevant | 35 | 상관 오류가 숨는 곳. 여기서 Gemini 불일치율이 핵심 지표다 |
| 1차·2차 **불일치** | 25 | 누가 맞는지 제3의 표 |
| 1차 irrelevant | 20 | 과소 포함(놓친 관련 VOC) 탐지 |
| **사람 채점(human_verdict) 있는 행** | 20 | 감사자 자신의 보정 기준. 사람 대비 Gemini 정확도가 낮으면 그 주 감사 결과를 하향해서 읽는다 |

- 100건이면 일치율 추정의 95% 신뢰구간이 약 ±10%p 다(p≈0.5 최악의 경우) [추정: 표준 이항 근사]. 층별 수치는 경향만 본다.
- 사람 채점 행이 20개 미만이면 있는 만큼만 넣고 모자란 수를 보고서에 적는다.
- ⚠️ 기존 `scripts/relevance-export.mjs --limit N` 은 **input_id 순서로 앞 N개**를 자른다(무작위가 아니다) [확인: 38행]. 감사용으로는 층화 무작위 추출(시드 기록)을 추가해야 한다 — 작은 변경이다.

### 5.3 흐름 (기존 부품 재사용)

1. export — `relevance-export.mjs --all` + 층화 무작위 추출. **눈가림 유지**: 기존 판정·라벨을 싣지 않는다(이미 그렇게 설계돼 있음 [확인: second-opinion.ts 4행]).
2. 판정 — `callLlmJsonWithModel('gemini', …)` 로 같은 OpinionRow 스키마를 낸다. 프롬프트는 2차 판정과 **같은 루브릭**을 쓴다(루브릭 차이를 모델 차이로 오인하지 않게).
3. 비교 — `relevance-second-opinion-import.mjs` **드라이런만**(`--apply` 금지. 감사자는 라벨을 채우지 않는다).
4. 산출물 — `ops/state/third-party-audit-<날짜>.json`(원시 판정 + 모델명 + 시드) · `reports/<날짜>/third-party-audit.md`.

### 5.4 보고 지표와 반영처

- 지표: Gemini 대비 1차 일치율 · 2차 일치율 · 사람 대비 정확도(20건) · **"Claude 둘이 일치했는데 Gemini 만 반대"인 행 수(상관 오류 후보)**.
- 반영처:
  - 상관 오류 후보 행 → **사람 채점 카드 큐**(기존 채점 UI)에 우선 투입한다. Gemini 판정으로 DB 를 고치지 않는다 — 판정 권한은 여전히 사람에게 있다.
  - 주간 추세 → Notion 일일 상태 로그 한 줄.
  - 경보(`사람판단필요=true`): 일치 relevant 층의 Gemini 불일치가 **2주 연속 25% 이상**이거나, 사람 대비 Claude 정확도가 Gemini 보다 낮을 때 [추정: 임계값은 첫 4주 실측 뒤 재조정].
- 확장(선택, 월 1회): 같은 틀로 `case_evidence` 등급 표본 20건을 감사한다. 그 뒤로는 T2 만 매주.

### 5.5 이 설계의 남은 사람 결정

1. AI Studio 프로젝트에 **결제 연결** 여부(A안). 예상 월 $1~3 [추정].
2. 경보 임계값(첫 4주는 경보 없이 수치만 쌓을지).
3. 무료 등급(B안)으로 먼저 시작할 때 공개 리뷰 원문이 Google 학습에 쓰일 수 있는 점을 수용할지.

## 6. 부수 발견

- `lib/analysis/llm.ts` 의 기본 Gemini 체인은 `gemini-3.6-flash` 가 맨 앞이다. pricing 페이지의 최신 Flash 는 **Gemini 3.8 Flash**(무료 등급 있음)다 [확인]. 체인에 없다 — 감사용 모델을 고를 때 참고.

## 출처

- Gemini CLI 인증: https://geminicli.com/docs/get-started/authentication/
- Gemini CLI 한도·요금: https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/quota-and-pricing.md
- Gemini CLI 약관·개인정보: https://geminicli.com/docs/resources/tos-privacy/
- Gemini CLI 헤드리스: https://geminicli.com/docs/cli/headless/
- 공식 GitHub Action: https://github.com/google-github-actions/run-gemini-cli
- 헤드리스 OAuth 이슈: https://github.com/google-gemini/gemini-cli/issues/1696 · /issues/13853 · /issues/27300 · /issues/28440 · /pull/29448
- Gemini 앱 한도(AI Pro, 연산량 기반): https://support.google.com/gemini/answer/16275805
- 2026-05 한도 개편 보도: https://www.pcworld.com/article/3142744/google-just-made-big-changes-to-gemini-usage-limits.html
- Gemini API 요금: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API 등급·한도: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini API 약관(무료/유료 데이터 사용): https://ai.google.dev/gemini-api/terms
- 리포 실측: `lib/analysis/llm.ts`, `lib/analysis/second-opinion.ts`, `scripts/relevance-export.mjs`, `.github/workflows/nightly-relevance.yml`, `reports/2026-09-28/cowork-four-orders.md`, `reports/2026-09-28/relevance-second-opinion.md`
