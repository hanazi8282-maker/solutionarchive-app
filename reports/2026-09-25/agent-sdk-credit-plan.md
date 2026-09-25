# Claude Agent SDK 크레딧($250, ~2026-11-05) 소진 계획 — 조사·설계 (남헌 승인 대기)

> 2026-09-25 CEO-STAFF(Fable). 조사·설계까지. 코드·마이그레이션은 남헌이 이 보고를 본 뒤 별도 승인한다.
> 유지: 최종 검수·승인은 사람(하루 30분·카드 10장) · §10 무인 자동발행 금지.

## TL;DR (3줄)

1. **이 크레딧은 Console API 키가 아니라 Claude 구독 계정(Max)에 붙는다.** `claude -p`·Agent SDK·Claude Code GitHub Actions 가 그 계정의 OAuth 로 인증할 때만 빠진다. 새 Console API 키를 발급해 `ANTHROPIC_API_KEY` 로 넣으면 크레딧이 아니라 **실돈**이 나간다 — 하지 않는다.
2. 우리 리포는 **이미 세 워크플로가 이 경로**다(daily-cmo-loop·nightly-discovery·nightly-insight-loop 이 `CLAUDE_CODE_OAUTH_TOKEN` 으로 `claude -p` 를 돈다). 즉 초안 생성은 이미 "전환 완료"이고, 크레딧이 매일 얼마나 빠지는지는 claude.ai 사용량 페이지에서 먼저 봐야 한다 — 그 숫자 없이는 4번(소진 추정)이 추측이다.
3. 남은 Gemini 구간(T2 관련성 판정·extract)은 `lib/analysis/llm.ts` 에 `claude-cli` 프로바이더 하나를 붙이면 같은 스위치(`LLM_PROVIDER`)로 넘어간다. 그런데 이 둘의 하루 물량은 **$1 미만**이라 크레딧 소진에는 거의 기여하지 않는다. $250 을 쓰려면 **extract 백로그 12,443건**과 **코퍼스 재판정** 같은 "승인이 필요 없는 큰 일감"에 넣어야 한다.

## 0. 크레딧이 어디에 붙어 있나 (최우선)

공개 문서·해설 기준(2026-09-25 웹 확인, 출처 말미):

- 크레딧은 **구독 사용자 단위**(Pro $20 / Max 5x $100 / Max 20x $200 월 갱신). 계정에서 1회 opt-in 으로 받는다. 팀원과 합치거나 옮길 수 없다.
- 소진 경로: `claude -p`(헤드리스), Agent SDK(Python/TS), Claude Code GitHub Actions, Agent SDK 로 인증하는 서드파티 앱. **"크레딧이 먼저 빠진다"** — 이 경로의 호출은 다른 과금원보다 크레딧을 먼저 쓴다.
- 제외: 터미널·IDE 의 대화형 Claude Code, claude.ai 채팅, Cowork. **Console(Developer Platform) API 키 사용자는 대상이 아니다.**
- 남헌이 적은 "$250 · 2026-11-05 만료"는 월 갱신 $200 과 액수·만료 규칙이 달라 **1회성 지급분**으로 보인다. 어느 쪽이든 붙는 자리는 같다(구독 계정).

**확인 방법(남헌, 5분):** claude.ai → Settings → Usage 에서 크레딧 잔액과 "Agent SDK / programmatic" 항목을 본다. 그 계정이 GitHub Secrets 의 `CLAUDE_CODE_OAUTH_TOKEN` 을 발급한 계정(09-08 CMO 루프 활성화 때 `claude setup-token` 을 돌린 계정)과 **같은지** 본다. 다르면 지금 워크플로는 크레딧이 아니라 다른 계정 한도를 쓰고 있는 것이다.

**확인 불가로 남긴 것:** 잔액·일 소모량은 세션이 볼 수 없다(사용량 페이지는 로그인 필요). Anthropic 공식 문서 페이지 원문은 이번에 못 열었고(2차 해설 2곳 교차), "$250 1회 지급"의 정확한 약관은 남헌 화면에서만 확인된다.

## 1. 키 발급·연결 방식

- **Console 신규 API 키 발급 → `ANTHROPIC_API_KEY` 등록: 이 목적엔 틀린 경로.** 크레딧이 안 붙고 API 요금이 나간다. `nightly-insight-loop.yml` 에 이미 `ANTHROPIC_API_KEY` 가 env 로 잡혀 있는데, 그 워크플로의 기본 프로바이더는 `claude-cli` 라 실제로는 OAuth 경로를 탄다 — 키가 등록돼 있다면 "혹시 SDK 경로로 새는지" 한 번 확인할 가치가 있다(`lib/insight/llm.ts activeProvider()`).
- **맞는 경로:** 이미 있는 `CLAUDE_CODE_OAUTH_TOKEN`(GitHub Secret). 워크플로에 `npm i -g @anthropic-ai/claude-code@2.1.251` + 이 토큰 env 를 넣으면 `claude -p` 가 크레딧을 쓴다. `daily-cmo-loop.yml` 이 정확히 그 형태다.
- **GEMINI 와 병행:** 워크플로별 env `LLM_PROVIDER` 하나로 가른다(`gemini` | `anthropic` | `mock` 이 지금 어휘, 여기에 `claude-cli` 추가). 코드 분기는 `lib/analysis/llm.ts` 한 파일. Gemini 키는 그대로 두고 11/5 이후 env 만 되돌린다.
- **토큰 수명:** OAuth 토큰은 만료·재발급이 있다(`claude setup-token`). 크론이 어느 날 401 로 죽으면 그것이다 — cron-watchdog 이 실패를 잡지만 원인 문구를 "토큰 재발급" 으로 알아보게 해 두는 것이 좋다.

## 2. `LLM_PROVIDER` 스위치가 현실적인가

**예, 이미 있다.** `lib/analysis/llm.ts` 는 `resolveProvider()` 로 `gemini|anthropic|mock` 을 가르고, extract(`lib/analysis/extract-run.ts`)·T2 판정(`lib/analysis/relevance-judge.ts`)·remedy·discovery 가 전부 이 한 벌을 부른다(호출부 27곳 실측). 문제는 `anthropic` 값이 **SDK + API 키** 경로라 크레딧과 무관하다는 것뿐이다.

**추가할 것 1개: `claude-cli` 프로바이더.** 인사이트 루프가 이미 같은 일을 한다 — `lib/insight/llm.ts` 가 `claude -p --output-format json` 을 `lib/insight/claude-cli.ts::runClaude()` 로 띄우고 봉투(`result`)에서 JSON 을 꺼낸다(`extractJsonObject`). `lib/analysis/llm.ts` 에 그 호출을 재사용하는 분기 하나를 붙이면 된다(파일 1개 + selftest 1개 + 워크플로 env 2줄). 다른 방식(Agent SDK 패키지 도입)은 의존성이 하나 늘고 같은 결과라 권하지 않는다.

**대가(알고 들어가야 하는 것):**
- 호출당 CLI 기동 오버헤드(수 초) — 20건 묶음 호출이라 무시할 수준.
- 구조화 출력(`output_config.format`)이 없다 → JSON 은 텍스트에서 파싱. 인사이트 루프가 이미 그렇게 하고 있어 새 위험은 아니다.
- 구독 한도(5시간 창)를 대화형 세션과 **공유**한다. 밤 크론이 한도를 먹으면 아침 남헌 세션이 느려질 수 있다 — 크론 시각이 KST 새벽이라 실무상 겹침은 적다.
- 예산 가드(`lib/analysis/budget.ts`)가 Gemini 단가(`LLM_USD_PER_MTOK_IN=0.5 / OUT=4`)로 추정한다. `claude-cli` 로 돌릴 때는 env 로 Opus 단가($5/$25)를 넣어야 "하루 $5 상한"이 의미를 갖는다(크레딧이라도 폭주 방지는 유지).

## 3. 전환 순서

**기본안(권고): 초안(이미 완료) → T2 관련성 판정 → extract.** 남헌 안과 같되, 첫 단계는 이미 끝나 있다.

- **초안·케이스 조사(CMO 루프)** — 이미 `claude -p`. 전환할 것이 없다. 사람이 매일 검수하는 저위험 구간이라는 판단도 그대로다.
- **T2 관련성 판정(`nightly-relevance.yml`, 지금 Gemini)** — 다음 순서. 이유: 사람 채점 21장 + `relevance-grading-sample.mjs` 로 **판정 품질을 수치로 비교할 도구가 이미 있고**, 결과 컬럼(verdict·라벨 4개)은 UPDATE 로 되돌릴 수 있다. 3일 돌리고 사람 채점과의 일치율을 Gemini 구간과 비교한다.
- **extract(`nightly-extract.yml`)** — 마지막. 소구점(aspects)이 PMF 결과·처방·카드까지 흐르는 고위험 구간. T2 에서 품질이 확인된 뒤 넘긴다. 다운스트림 보호는 지금 있는 것(T1 상한·프로젝트별 신규≥100 자율 기준)을 그대로 쓴다.
- **동시 전환 가능성:** 기술적으로는 가능하다(같은 스위치, 워크플로가 다르다). 그러나 둘을 같은 날 바꾸면 품질 변화의 원인을 못 가른다. 3일 간격이면 충분하다 — 동시 전환의 이득(며칠 앞당김)이 그 손실보다 작다.

## 4. $250 소진에 필요한 트래픽 (추정, 출처 병기)

**지금 나이틀리 물량(DB 실측 2026-09-25):**
- T2 판정: 9/22 780행(백로그) → 9/23 80 → 9/24 40행/일. 20건/호출 → **하루 2~4회 호출**.
- extract 입력(analysis_inputs): 9/21 848건, 그 밖의 날 30~90건, 평균 93자.
- 이 둘을 Opus 5 단가($5/$25 per MTok)로 최대치로 잡아도 **하루 $0.3~1** 이다. 41일(9/25→11/5) 곱해도 $40 안팎. **나이틀리 Gemini 구간을 전부 옮겨도 $250 의 1/6 이다.**

**이미 크레딧을 쓰고 있을 가능성이 큰 쪽:** CMO 루프의 조사 스텝(건당 최대 15분 에이전트 세션 × 2~6건, `--max-turns 40`, WebSearch 포함) + 작가 스텝 2건 + 발굴 엔진 + 인사이트 루프. 에이전트 세션은 건당 수 달러가 흔하다. **하루 $5~15 로 추정**되지만 실측이 없다 — 사용량 페이지 3일치가 이 보고의 가장 큰 빈칸이다. 만약 이미 하루 $6 이상 빠지고 있다면 $250 은 추가 조치 없이도 11/5 전에 소진된다.

**부족할 때의 증량(품질 희석 금지 조건부) — 승인이 필요 없는 일감을 고른다:**
- **extract 백로그 처리** — 원문 12,443건 중 extract 된 것은 40건 수준(9/23 실측). 가장 크고 가장 정당한 싱크다. 프로젝트별 T1 상한을 지키며 밤마다 N 프로젝트씩. 다운스트림(PMF·처방)이 커지지만 그건 "데이터가 늘어난 것"이지 희석이 아니다.
- **코퍼스 2차 판정(second opinion)** — 900행을 Opus 로 다시 판정하되 **기존 verdict 는 덮지 않고 불일치만 기록**한다(`review_relevance_verdicts.reason` 옆에 로그 파일). 판정 안정성 지표가 생기고, 라벨 불가 34행에 대한 두 번째 의견도 얻는다. 화면엔 영향 0.
- CMO 조사 건수 증량(2→4/일)은 **권하지 않는다**: 9/23 남헌 확정대로 4건이면 조사 스텝이 90분을 다 쓰고, 무엇보다 승인 대기함이 이미 26건 정체다(pending_review 26 vs published 4). 생성을 늘리면 병목만 깊어진다.

## 5. 기존 규칙과의 충돌

- **마이그레이션 자율 적용·대량 UPDATE 4조건** — 프로바이더 전환 자체는 스키마 변경이 없다. 4번의 "코퍼스 2차 판정"이 **기존 verdict/라벨을 덮어쓰는 형태**가 되면 대량 UPDATE 규칙(드라이런·롤백·무중단·Notion)에 걸린다 → 그래서 **덮지 않고 로그만** 남기는 설계로 잡았다. 충돌 없음.
- **`daily_request_cap`** — 리뷰 **수집** 요청 상한이다(스크래핑 예의). LLM 호출과 무관. 충돌 없음. 단, extract 백로그를 밀면 T1 상한(`review-request-cap` 과 별개인 extract 측 상한)이 하루 처리량을 제한하므로 "밤마다 N 프로젝트" 로 나눈다.
- **LLM 예산 가드** — `LLM_DAILY_BUDGET_USD`(기본 $5)가 크레딧 경로에서도 그대로 작동한다(단가 env 만 Opus 로). 크레딧 기간엔 $15/일 정도로 올리는 것을 권고 — "공짜라서 무제한"이 아니라 폭주 상한을 유지한 채 여유만 주는 것.
- **서브에이전트 DB 경계·발행 금지** — 영향 없음. `claude -p` 자식 프로세스에는 지금처럼 서비스키를 넘기지 않는다.

## 6. 병행 운영 부담 최소화 · 11/5 이후

- 부담을 만드는 건 "두 벤더"가 아니라 "두 코드 경로"다. 경로는 이미 하나(`lib/analysis/llm.ts`)이고 워크플로별 env 한 줄이 벤더다. 운영 규칙은 하나면 된다: **`LLM_PROVIDER` 를 바꾼 날은 Notion 상태 로그에 적는다**(품질 변화 원인 추적).
- **11/5 이후 권고: 스위치 구조는 유지, env 만 `gemini` 로 되돌린다.** 이유 셋 — ① `claude-cli` 분기는 인사이트 루프가 어차피 쓰는 코드라 지워도 부담이 안 준다, ② 월 갱신 크레딧($200/월, Max 20x 기준)이 계속 나오면 그때 다시 켤 수 있다, ③ Gemini 무료 티어 한도(모델별 20건/일)에 걸리는 날 폴백으로 쓸 수 있다.

## 7. 크레딧으로 돌릴 만한 다른 나이틀리 일감 (후보 8 · 왜 좋은가 · 리스크)

우선순위는 "승인 병목을 안 키우면서 데이터·품질을 올리는 것" 순이다.

1. **extract 백로그 12,443건** — 왜: 가장 큰 미처리 원문, PMF·소구점의 원료. 리스크: 소구점 폭증으로 T2·라벨·화면 물량이 같이 는다 → 프로젝트별·야간 상한으로 속도 조절. **1순위.**
2. **T2 2차 판정(불일치 로그)** — 왜: 판정 안정성 지표 + Gemini↔Claude 비교 자료가 공짜로 생긴다. 리스크: 로그만 남기면 0. 34 "불가" 행에 대한 두 번째 의견 포함.
3. **케이스 근거 재검증(fact-check C/D 무브)** — 왜: 등급 C/D 무브 14건(승인 56건 중)의 출처를 Opus 가 웹으로 재확인해 **제안서만** 낸다. 등급 변경은 사람 몫이라 출력은 `reports/` 제안. 리스크: 웹 검색 결과의 신뢰도 → 제안에 URL 첨부 필수.
4. **경쟁사 기능 조사 갱신(트랙 4)** — 왜: 113개 기능 보고가 9/23 실측 이후 정지. 밤마다 3~5개 서비스씩 재확인해 diff 만 보고. 리스크: 구현 금지 원칙 그대로(보고만). 낮음.
5. **VOC 소스 확장 실험** — 왜: 발굴 엔진이 이미 OAuth 경로. 후보 폭을 넓히고 실측 hits 로 채택. 리스크: **신규 소스 추가는 §10.2 사람 판단 예외(법적 리스크)** → 후보 보고까지만.
6. **칼럼·장문 초안 2차(연재 후속)** — 왜: 이미 `claude -p` 경로, 승인 대기 9편이 있어 병목이 사람. **지금은 권하지 않음** — 4번 원칙(생성 늘리면 병목 심화).
7. **라벨 소급의 "불가" 행 재분류** — 왜: 34행이 진짜 의견성인지 Opus 로 한 번 더 본다. 2번에 포함해 처리. 리스크 0.
8. **사람 채점 21장 기반 LLM 판정 평가 리포트** — 왜: `relevance-grading-sample.mjs` 결과와 두 모델 판정을 붙여 일치율 표를 밤마다 갱신. 3번(전환 순서)의 판단 근거가 된다. 리스크 0.

**권고 묶음(승인 시 착수 순):** 8 → 2 → 1 → 3·4. 6·5는 보류.

## 8. 남헌 승인 요청

1. 크레딧 계정 확인 결과(잔액·일 소모량 3일치·`CLAUDE_CODE_OAUTH_TOKEN` 발급 계정 일치 여부) 공유.
2. `claude-cli` 프로바이더 추가(`lib/analysis/llm.ts`) + `nightly-relevance.yml` 먼저 전환 — 승인 여부.
3. 증량 싱크 선택: extract 백로그(1) · 2차 판정 로그(2) · 평가 리포트(8) 중 무엇부터.
4. 크레딧 기간 `LLM_DAILY_BUDGET_USD` $5 → $15 — 승인 여부.

출처: [Agent SDK 크레딧 해설(Totalum)](https://www.totalum.app/blog/claude-agent-sdk-credits-2026) · [Agent SDK 크레딧 해설(claudefa.st)](https://claudefa.st/blog/guide/development/agent-sdk-credit) · 리포 실측 `lib/analysis/llm.ts` `lib/insight/llm.ts` `lib/insight/claude-cli.ts` `.github/workflows/*.yml` · DB 실측 2026-09-25(review_relevance_verdicts·analysis_inputs).

---

## ⚠️ 2026-09-26 정정 — 이 문서의 전제가 틀렸다

남헌이 계정 화면에서 잔액 $250 이 그대로인 것을 확인해 조사했다(세션 CEO-STAFF, 실측 근거는 Notion 2026-09-26-기타-1).

1. **$250 은 "Agent SDK 크레딧"이 아니라 "Claude Code 클라우드 세션 런칭 크레딧"이다.** Max 구독자 1회 $250, 10/7 까지 클레임, **11/4(PT) 만료** — 남헌이 적은 "11/5 만료(KST)"와 정확히 맞는다. 이 크레딧은 **클라우드 세션에만** 쓰이고 `claude -p`·Agent SDK·GitHub Actions 트래픽은 **아예 빠지지 않는다.** 이 문서 §0 은 "$250·11/5 는 월 갱신 $200 과 다르다"고 적어 놓고도 Agent SDK 크레딧으로 단정했다. 그 판단이 틀렸다.
2. 따라서 §1~§7 의 "크레딧 경로로 전환하면 소진된다"는 계획은 **성립하지 않는다.** 헤드리스 워크플로(CMO 루프·발굴·인사이트·칼럼 전수검수)가 쓴 것은 `CLAUDE_CODE_OAUTH_TOKEN`(2026-09-01 등록) 계정의 **구독 사용량 한도**(그 계정에 월 Agent SDK 크레딧이 있다면 그것)이지 이 $250 이 아니다.
3. **"추정 $2.46" 은 실측이 아니다.** `lib/analysis/budget.ts` 가 글자 수÷2 를 토큰으로 놓고 세션이 env 로 넣은 단가($5/$25)를 곱한 자체 계산값이다. `claude -p` 봉투의 `total_cost_usd` 는 코드가 읽지 않고 버렸다(2026-09-26 부터 로그에 남긴다). "추정"이라 적었지만 "크레딧 소모" 옆에 놓아 실측처럼 읽히게 한 것은 보고 잘못이다.
4. **T2 판정(nightly-relevance) 은 claude-cli 로 전환되지 않았다.** PR #279 의 워크플로 패치가 `LLM_PROVIDER`·`CLAUDE_CODE_OAUTH_TOKEN` 두 줄을 빠뜨렸다(주석에 같은 낱말이 있어 "이미 있음"으로 오판한 스크립트 버그). 09-25 밤 스케줄도 발화하지 않았다. 즉 relevance 는 여전히 Gemini 다. "전환 완료" 보고는 틀렸다.
5. 실과금 경로는 없다: GitHub Secrets 에 `ANTHROPIC_API_KEY` 없음(insight-loop 의 env 는 빈 값으로 들어감), `.env.local`·Vercel 에도 없음.

**클라우드 세션 크레딧을 쓰려면** 클라우드 세션(claude.ai/code 또는 `claude` 의 클라우드 세션)에서 작업을 돌려야 한다 — 그건 이 리포의 Actions 워크플로와 다른 실행 환경이다. 그 설계는 별건.
