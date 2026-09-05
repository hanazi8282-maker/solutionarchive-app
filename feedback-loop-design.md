# 피드백 루프 설계안 — 저장 글 → 패턴 분석 → 가설 검증 → 가이드 자동 반영

> §5 파이프라인의 ⑥ 피드백→① (현재 미착수, learnings 테이블 항상 0행)을
> 채우는 설계. 2026-08-29 세션 승인 조건: 가이드 파일 완전 자동 머지 허용
> (§10 예외, 이 케이스 한정 — 다음 세션 시작 시 §10에 명문화 필요).

---

## 0. 전제 조건 (구현 전 필요)

- ~~`ANTHROPIC_API_KEY` 설정~~ → **아래 0.5 참고, API 키 대신 Claude Pro
  구독 헤드리스 실행으로 대체 (2026-08-29 세션에서 무료 실행 방식으로
  변경 확정)**
- Notion 쪽 캡처용 데이터베이스 1개 신설 (아래 §1)
- 크론 스케줄: 매일 KST 04:00 고정 실행 (실시간 "사용량 0%" 감지는
  불가능 — 고정 시각으로 대체, 사유는 위 리얼리티 체크 참고)

## 0.5 무료 실행 방식 — API 키 대신 Claude Pro 구독 활용

**배경**: `ANTHROPIC_API_KEY`는 종량과금(API 크레딧 소모)이라 비용이
든다. 대신 이미 구독 중인 **Claude Pro의 헤드리스(`-p`) 실행**을 쓰면
추가 비용 없이 같은 걸 할 수 있다. 새 VPS나 본인 노트북 상시 구동도
필요 없다 — 이미 쓰고 있는 **Vercel Pro 인프라(기존 크론과 동일 환경,
함수 기본 300초 실행 가능)** 안에서 그대로 처리한다.

**구현 방식**:
1. `claude setup-token`(또는 동등 명령)으로 장기 OAuth 토큰 발급 →
   `CLAUDE_CODE_OAUTH_TOKEN`으로 Vercel 환경변수에 등록
   (`ANTHROPIC_API_KEY` 자리를 이걸로 대체, 이 토큰은 API 키와 동급의
   민감 정보이므로 취급 동일하게)
2. §3(패턴 추출)·§4(가설 문장 생성) 등 **LLM 추론이 필요한 부분만**
   `claude -p "<프롬프트>" --output-format json --max-turns 3` 형태로
   Vercel 함수 안에서 child_process로 호출해 대체. 이 사용량은 API
   과금이 아니라 Claude Pro 구독 사용량(2026-06-15 이후 별도 Agent SDK
   크레딧 풀)으로 처리됨 — 무제한은 아니므로 `--max-turns` 상한 필수
3. **git commit/push(§6)는 git CLI 대신 GitHub REST API(Contents API)로
   처리** — Vercel 서버리스 런타임에 git 바이너리가 없을 수 있어 더
   안정적인 방식으로 변경. Notion 동기화·Supabase 읽기/쓰기(§2)는 기존
   설계 그대로 순수 Node 코드 유지 — 이 부분들은 애초에 LLM 호출이
   아니므로 API 비용과 무관했음

**미검증 리스크** (다음 세션 첫 스텝으로 스파이크 테스트 권장):
Claude Code CLI(`@anthropic-ai/claude-code` npm 패키지)가 Vercel 서버리스
Node 런타임 안에서 정상 spawn·실행되는지는 실제로 안 돌려봄 —
안 되면 이 STEP만 GitHub Actions 무료 티어(별도 워크플로우, 같은
OAuth 토큰을 GitHub Secrets로 등록)로 분리하는 걸 대안으로 남겨둔다.

**사용량 주의**: 헤드리스 실행도 결국 같은 Claude Pro 계정의 사용량
풀을 쓰므로, 매일 밤 무거운 분석을 돌리면 낮 시간 인터랙티브 사용
한도에 영향을 줄 수 있다 — 며칠 돌려보고 체감되면 분석 범위(1회당
처리 건수)를 줄이는 걸 고려할 것.

---

## 1. 캡처 계층 — Notion

기존 `hermes-loop` 스킬이 이미 "Notion Hermes Inbox 브릿지"로 파일
접근 없는 환경에서 캡처하는 패턴을 쓰고 있음 — 같은 패턴 재사용.

**Notion DB: `Threads 인사이트 인박스`**
| 필드 | 타입 | 설명 |
|---|---|---|
| URL | URL | 원문 링크 |
| 원문 텍스트 | Text | 본인이 직접 붙여넣기 (Threads는 공개 스크레이핑이
  불안정하므로 원문은 사람이 확보하는 게 안전 — 캡처 마찰 최소화를
  위해 필수는 아니고, 없으면 다음 단계에서 URL로 재확인 시도) |
| 왜 좋았는지 (선택) | Text | 본인 직관 1줄, 있으면 분석 정확도↑ |
| 저장일시 | Created time | 자동 |
| 동기화 상태 | Select | `pending` / `synced` (기본값 pending) |

캡처 동작: Threads 보다가 좋은 글 발견 → Notion 앱/웹에서 새 행 추가,
URL(+가능하면 원문 붙여넣기)만. 마찰 최소화가 핵심 — 분석은 전부
나이틀리 배치가 함.

---

## 2. 동기화 계층 — Notion → Supabase

**새 테이블: `saved_examples`**
```sql
create table saved_examples (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text unique not null,  -- 멱등성 키
  source_url text,
  raw_text text,
  user_note text,
  saved_at timestamptz not null,
  synced_at timestamptz default now(),
  analysis_status text default 'pending',  -- pending | analyzed | failed
  insight_type text,           -- actionable | reframe | transferable_frame | null(분석실패)
  extracted_insight text,      -- LLM이 뽑은 핵심 인사이트 1문장
  extracted_pattern text,      -- 구조/훅 패턴 요약
  why_it_works text,           -- LLM 분석 근거
  proposed_hypothesis_code text -- hypotheses 테이블과 연결(FK 아님, 텍스트 참조)
);
```

크론 STEP 1 (동기화): Notion DB에서 `동기화 상태 = pending`인 행 조회
→ `saved_examples`에 upsert(notion_page_id 기준) → Notion 쪽
`동기화 상태`를 `synced`로 업데이트.

---

## 3. 분석 계층 — 패턴 추출 (LLM)

크론 STEP 2: `saved_examples`에서 `analysis_status = 'pending'`인 행
전부에 대해 Anthropic API 호출.

**프롬프트 골격**:
```
아래는 사용자가 "인사이트가 있다"고 판단해 저장한 Threads 글이다.
insight-guide.md의 3개 기준(actionable/reframe/transferable_frame)
중 이 글이 해당하는 것을 판정하고, 다음을 추출하라:

1. insight_type: <하나>
2. extracted_insight: 이 글의 핵심 인사이트를 한 문장으로
3. extracted_pattern: 이 글이 그 인사이트를 전달하기 위해 쓴 구조적
   장치 (훅 방식, 전개 순서, 마무리 형태 등 — voice-guide/seo-guide와
   같은 어휘로 기술)
4. why_it_works: 왜 이 장치가 효과적이었는지 1~2문장
5. is_generalizable: 이 패턴이 다른 소재에도 재사용 가능한 규칙인가
   (true/false) — 이 글 하나에만 해당하는 우연이면 false

is_generalizable=false면 hypothesis 제안하지 말 것.
```

결과를 `saved_examples`에 저장. `analysis_status='analyzed'`로 갱신.

---

## 4. 가설화 계층 — hypotheses 테이블에 편입

크론 STEP 3: `is_generalizable=true`인 신규 분석 결과 중, 기존
`hypotheses`(H1~H7)와 내용이 겹치지 않는 것만 골라 신규 코드(H8,
H9...) 발급.

```sql
insert into hypotheses (code, statement, variable, status, source)
values (
  'H8',
  '<extracted_pattern 기반으로 생성한 가설 문장>',
  'auto_pattern_<n>',   -- threads-report.mjs 차원 key 규칙과 일치시킴
  'proposed',
  'auto_extracted_from_saved_examples'
);
```

같은 패턴이 saved_examples에서 2건 이상 반복 관찰되면 우선순위를
올려 다음 배치 생성(threads-draft.md)에서 실험군 태깅 확률을 높인다
(구체적 가중치는 구현 시 결정 — 처음엔 균등 배분으로 시작 권장).

---

## 5. 실험 → 검증 계층 (기존 인프라 재사용, 신규 구현 없음)

- threads-draft.md가 `status='proposed'` 가설을 실험군으로 태깅해
  생성 (기존 A/B 설계 로직 그대로)
- 발행 → 기존 match-posts / collect-metrics 크론이 그대로 수집
- 판정 지표: **기존 H1~H7과 동일** — 답글률·확산배수·프로필클릭,
  표본 5개 기준 (`guard_learning_promotion()` 트리거 그대로 재사용,
  신규 코드 불필요)

---

## 6. 승격/기각 계층 — 가이드 파일 자동 반영

크론 STEP 4 (매일, 표본 5개 충족한 proposed 가설이 있으면):

**승격 조건**: 대조군(같은 소재의 비실험 버전 또는 카테고리 평균) 대비
지표 개선 확인 시
```
1. status: proposed → confirmed
2. insight-guide.md에 "자동 추출된 검증된 패턴" 섹션 추가/갱신:
   - 패턴 설명 (extracted_pattern)
   - 근거 (표본 수, 개선폭, 관련 소재 링크)
3. git commit (메시지에 가설 코드·표본 수·개선폭 명시) → main 직접 push
   (§10 예외 — 이 파이프라인 한정 자동 머지 승인됨, 2026-08-29)
4. 어느 커밋이 자동인지 구분 가능하도록 commit prefix 고정:
   "[auto-insight] H8 confirmed (n=7, reply_rate +42%)"
```

**기각 조건**: 표본 5개 이상인데 개선 없음/악화
```
1. status: proposed → rejected
2. insight-guide.md는 건드리지 않음 (애초에 반영 안 됐으므로)
3. §11류 "기각된 방향" 로그에 자동 추가 (별도 파일
   content/corpus/rejected-hypotheses.md 신설 권장) — 같은 패턴 재실험
   방지가 목적, 재발방지 규칙과 동일 정신
```

**투명성 안전장치** (완전 자동 머지를 허용하되 최소한의 가시성 확보):
- 매일 크론 실행 후 결과 요약(신규 분석 N건 / 신규 가설 M건 / 승격 P건
  / 기각 Q건)을 Notion 인박스 DB 상단 또는 별도 로그 페이지에 자동
  기록 — 사람이 승인은 안 해도 "오늘 뭐가 바뀌었는지"는 항상 확인
  가능하게

---

## 7. 다음 세션 구현 순서 제안

1. Notion DB 생성 (§1)
2. `saved_examples` 마이그레이션 SQL 작성·실행 (§2) — 본인이 대시보드에서
   직접 실행 (§10 원칙 그대로 유지)
3. `ANTHROPIC_API_KEY` 설정
4. 크론 라우트 신설 (`/api/cron/nightly-insight-loop`, KST 04:00 =
   UTC 19:00 스케줄) — STEP 1~4를 하나의 함수로 순차 실행
5. §10에 이 파이프라인 전용 예외 조항 추가 (문서화)
6. 최소 3~4건 Notion에 저장해두고 첫 드라이런
