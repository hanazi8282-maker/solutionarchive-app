# 리뷰 수집 계층 설계 (2026-08-29)

> 실측 근거는 `docs/review-source-findings.md`. **소스는 다나와 하나다.**
> 이 문서는 코드 작성 전 합의용이다. 아직 구현하지 않았다.

## 0. 이 작업의 원래 목적

새 기능이 아니다. 인수인계 §8 에서 **"리뷰 원문 수집 병목"** 으로 멈춘
로직 자체검증 트랙(Day2)을 푸는 일이다.

경쟁사 분석 프로젝트 12개가 `status='collecting'`, `analysis_inputs` 0건인 채로
서 있다(탈모샴푸 4 / 유산균 4 / 무선이어폰 4). 사람이 리뷰를 손으로 붙여넣어야
다음이 돌아가는 구조라 거기서 멈췄다. **수집기가 `analysis_inputs` 를 채우는
순간 Day2 가 풀리고 Day3~7(검수 diff 로 로직 자체검증)이 이어진다.**

그래서 이 설계의 성공 기준은 "리뷰를 많이 모았다"가 아니다.
**`scripts/review-diff-report.mjs` 가 의미 있는 교정률을 뱉는 것**이다.

## 1. 소스 판정 — 최종

| 소스 | 판정 | 근거 |
|---|---|---|
| **다나와** | ✅ **채택** | robots 허용 · 리뷰 원문·별점·판매처명·날짜 확인 |
| 화해 | ⛔ 불가 | robots 가 `/product-information` `/goods-view` `/hwahae-rank` `/product-search` 를 전부 금지 |
| 글로우픽 | ❌ 불가(정적) | robots 는 허용하나 CSR 이라 정적 fetch 로 리뷰 본문이 안 온다 |
| 그 외 9곳 | ⛔❌ | robots 금지 또는 봇 차단 (`review-source-findings.md`) |

화해는 **판정이 뒤집혔다.** 처음엔 🟡 였는데, robots.txt 에 `User-agent: *`
그룹이 두 번 나오고 첫 그룹이 `Allow: /` 라 파서가 두 번째 그룹의 Disallow
목록을 통째로 무시했다. RFC 9309 §2.2.1 대로 같은 UA 그룹을 병합하도록
고치자 리뷰 경로가 전부 금지로 바뀌었다. `lib/review/robots.ts` + 셀프테스트 31건.

글로우픽은 `ClaudeBot` / `GPTBot` / `Bytespider` / `meta-externalagent` 를
명시적으로 `Disallow: /` 한다. `*` 는 허용이라 규칙상 우리가 가도 되지만,
**AI 크롤러를 원하지 않는다는 의사는 분명하다.** CSR 이라 어차피 headless
브라우저가 필요한데, 그 의사를 보고도 브라우저를 띄우는 건 하지 않는 게 맞다고
본다. 판단은 사람이 한다.

## 2. 가장 중요한 구조 결정 — 원문 테이블을 새로 만들지 않는다

리뷰 원문의 정착지는 **이미 있다**: `analysis_inputs (source_type='review', raw_text)`.
`POST /api/analyze/extract` 가 그걸 소비해 `analysis_aspects` 를 만든다.

새 `reviews` 테이블을 만들면 원문이 두 곳에 살고, 어느 쪽이 정본인지가 흐려지고,
Supabase 무료 500MB 를 두 배로 먹는다. **수집기는 기존 테이블에 흘려보낸다.**

그 대신 원문이 폐기된 뒤에도 남아야 하는 것 하나만 새로 만든다 — **지문**이다.
원문을 지우면 "이미 본 리뷰"를 알 방법이 사라져 다음 수집이 같은 걸 또 넣는다.

```
수집 → 파싱 → 지문 대조(중복 제거) → analysis_inputs.raw_text 적재
                    ↓
             review_fingerprints (해시만. 원문 없음)
```

## 3. 어댑터 인터페이스 — 수집기와 파서를 가른다

단일 소스 리스크에 대한 구조적 대비다. 다나와가 HTML 을 바꾸면 **파서 파일
하나와 그 픽스처만** 갈아끼운다. 네트워크·robots·레이트리밋·체크포인트는
건드리지 않는다.

```ts
// lib/review/types.ts
interface ReviewSourceAdapter {
  key: string                      // 'danawa'
  displayName: string
  minIntervalMs: number            // 다나와 4000
  dailyRequestCap: number

  // ── 수집기: 네트워크만 한다. 파싱하지 않는다 ──
  //    robots 판정·간격·커서 전진은 공용 러너가 맡고,
  //    어댑터는 "다음에 어느 URL 인가"만 답한다.
  nextRequest(target: TargetState): { url: string } | null

  // ── 파서: 순수 함수. 네트워크 없음. 입력은 문자열뿐 ──
  //    그래서 저장한 픽스처로 테스트할 수 있다.
  parse(body: string, ctx: ParseContext): ParseResult
}

interface ParseResult {
  reviews: ParsedReview[]
  nextCursor: string | null        // null = 이 타깃 끝
  parseFailures: number            // 항목은 보이는데 못 읽은 수
}

interface ParsedReview {
  externalId: string | null        // 있으면 지문의 1순위
  text: string
  rating: number | null            // 다나와는 100점 척도 → 5점으로 정규화
  seller: string | null            // ★ 다나와의 핵심 — 11번가·롯데하이마트 등
  writtenAt: string | null         // ISO date
}
```

`seller` 를 1급 필드로 둔다. 다나와가 여러 몰의 리뷰를 집약해서 오고, 그게
쿠팡·11번가를 직접 못 가는 것을 메우는 유일한 통로다. **몰별 비교 축이
여기서 나온다.**

파서가 순수 함수라는 게 이 설계에서 가장 실용적인 부분이다. 다나와 응답을
`fixtures/danawa-review-*.html` 로 한 번 저장해 두면, 구조가 바뀌었을 때
네트워크 없이 새 파서를 짜고 옛 픽스처로 회귀를 확인할 수 있다.

## 4. 테이블 (마이그레이션 SQL 은 승인 후 작성)

### `review_sources` — 레지스트리 + 즉시 중단 스위치

| 컬럼 | 의미 |
|---|---|
| `key` | `'danawa'` (PK) |
| `enabled` | **false 로 바꾸면 다음 실행부터 이 소스를 건드리지 않는다** |
| `disabled_reason` | 왜 껐는지. 없으면 왜 꺼져 있는지 아무도 모른다 |
| `health` | `ok` / `degraded` / `broken` — §5 가 갱신 |
| `min_interval_ms`, `daily_request_cap` | 코드 배포 없이 조일 수 있게 DB 에 둔다 |

문제가 생기면 **대시보드에서 한 줄 UPDATE 로 그 소스만 멈춘다.** 코드 배포도
워크플로 수정도 필요 없다. 이게 "즉시 중단 가능"의 실질이다.

### `review_targets` — 수집 대상 + 체크포인트

`(project_id, source_key, product_ref)` 가 자연키. 12개 프로젝트 각각에
다나와 상품을 몇 개씩 매단다.

| 컬럼 | 의미 |
|---|---|
| `cursor` | 다음에 이어갈 위치(페이지 번호 등). **페이지 하나 처리할 때마다 즉시 갱신** |
| `last_review_at` | 증분 기준. 이보다 오래된 리뷰가 나오면 이 타깃은 끝 |
| `status` | `active` / `exhausted` / `failed` |
| `consecutive_empty` | 연속 신규 0건 횟수. §5 의 입력 |

체크포인트를 run 이 아니라 **타깃**에 두는 게 핵심이다. Actions 잡이 중간에
죽어도 다음 실행이 각 타깃의 `cursor` 에서 그냥 이어간다 — 재개를 위한 별도
복구 로직이 없다.

### `review_collection_runs` — 실행 이력

`started_at` / `finished_at` / `source_key` / `status(running|ok|failed|interrupted)` /
`requests` / `pages_fetched` / `reviews_parsed` / `parse_failures` /
`new_reviews` / `duplicates` / `robots_skips` / `error`.

실행 시작 시 `running` 으로 남은 이전 run 을 `interrupted` 로 정리한다.
잡이 SIGKILL 로 죽으면 `finished_at` 을 못 쓰는데, 그걸 성공으로 착각하면
안 된다.

### `review_fingerprints` — 중복 제거 (원문 폐기 후에도 남는다)

`(source_key, fingerprint)` UNIQUE. `fingerprint` 는 `externalId` 가 있으면
그것, 없으면 정규화 텍스트의 sha256 앞 32자. `analysis_input_id` 를 nullable
FK 로 달아 어느 입력으로 들어갔는지 추적하되, 원문이 폐기되면 null 이 된다.

지문만 남기므로 행당 100바이트 미만이다. 원문을 지워도 중복 판정은 영구히 산다.

### 기존 테이블 변경 2건

- `analysis_inputs` 에 `source_key` / `collected_at` 추가(nullable) — 사람이
  붙여넣은 것과 수집기가 넣은 것을 구분한다. 기존 행 영향 0.
- `content_items.status` CHECK 에 `'proposed'` 추가 — §7 참조.
  **현재 제약은 `available|used|retired` 뿐이라 그대로는 INSERT 가 죽는다.**

## 5. 조용한 실패를 막는 장치 — 이 설계에서 가장 중요한 부분

단일 소스라 "안 되는데 되는 척"이 가장 비싼 고장이다. 2주 뒤에 발견하면
그 2주치 분석이 전부 빈 표 위에서 돌아간 것이 된다.

판정은 **순수 함수**로 `lib/review/health.ts` 에 둔다(`patterns.ts` 와 같은 방식).
셀프테스트로 경계를 고정한다.

| 조건 | 판정 | 뜻 |
|---|---|---|
| 파싱 성공률 < 0.8 (시도 10건 이상) | `broken` | **구조가 바뀌었다.** 파서 교체 필요 |
| 연속 3회 신규 0건 | `degraded` | 증분이 끝났거나 차단됐다 |
| HTTP 403/429 1회라도 | `broken` + 자동 `enabled=false` | 차단 신호. 더 때리지 않는다 |
| 그 외 | `ok` | |

**403/429 를 받으면 그 소스를 그 자리에서 끈다.** 재시도하지 않는다.
차단당한 뒤 계속 두드리는 게 영구 차단으로 가는 가장 흔한 길이다.

### 보고 — 최상단으로 올린다

`scripts/insight-loop.mjs` 의 요약 맨 위에 소스 경보 줄을 넣는다.
`ok` 가 아닌 소스가 하나라도 있으면 집계보다 **먼저** 나온다.

```
## 인사이트 루프

🚨 소스 경보: danawa = broken (파싱 성공률 0.31, 시도 42건) — 파서 교체 필요
- 결과: 전 단계 정상 · 12.4초 · provider=claude-cli
```

경보가 없으면 이 줄 자체가 안 나온다. 늘 있는 줄은 곧 안 읽는 줄이 된다.

## 6. Day2 해소 경로 — 이번 작업의 본론

```
review_targets (12개 프로젝트 × 다나와 상품)
   │  ① 야간 수집 (KST 03:00, Actions, contents: read)
   ▼
수집기 fetch ─→ 파서 parse ─→ 지문 대조 ─→ 정규화
   │                                        │
   │                                        ▼
   └─ review_collection_runs (이력·건강도)   analysis_inputs
                                            (source_type='review', raw_text,
                                             source_key='danawa')
                                              │
                                              │  ② 사람이 판단해 실행
                                              ▼
                              POST /api/analyze/extract
                                (llm_* 8종에 원본 보존)
                                              │
                                              ▼
                                      analysis_aspects
                                              │
                                              │  ③ 검수 화면
                                              ▼
                              PUT /api/analyze/review
                              (human_confirmed, reviewed_at,
                               llm_* 는 건드리지 않는다)
                                              │
                                              ▼
                          scripts/review-diff-report.mjs
                          → 필드별 교정률 · I/S 오차 · attribution 오분류
                                              │
                                              ▼
                                    ★ Day3~7: 로직 자체검증
```

### ② 를 자동화하지 않는 이유 — 반드시 지킬 것

`POST /api/analyze/extract` 는 **기존 aspects 를 delete→insert 한다.**
수집이 `analysis_inputs` 에 행을 넣을 때마다 extract 를 자동 실행하면,
사람이 검수해 둔 `human_confirmed` / `reviewed_at` / 교정값이 매일 밤 날아간다.
그러면 이 트랙의 목적인 교정 diff 자체가 사라진다.

**수집기는 `analysis_inputs` 만 채우고 멈춘다.** `analysis_projects.status` 도
건드리지 않는다(`collecting` 유지). "리뷰가 충분히 모였다"는 판단과 extract
실행은 사람이 한다. 자동화의 이득보다 잃는 게 크다.

수집기는 대신 프로젝트별 누적 리뷰 수를 나이틀리 보고에 적는다 — 사람이
"이제 돌릴 때"를 판단할 근거만 준다.

## 7. 수집 발견 → Threads 소재 연결

"조사하면서 나온 인사이트를 콘텐츠로"의 실체다.

연결 지점은 이미 계산되어 있다. `analysis_aspects.opportunity_score` 는
`importance + max(importance - satisfaction, 0)` 인 **generated 컬럼**이고,
`quadrant='DIFFERENTIATOR'` 는 "중요한데 아무도 못 채운 속성"을 뜻한다.
그게 곧 소재다.

```
analysis_aspects (quadrant='DIFFERENTIATOR', opportunity_score 상위,
                  human_confirmed=true)
        │
        ▼
content_items (status='proposed')
  code        DA-<카테고리>-<연번>
  tier        opportunity_score 구간으로 매핑
  title       속성명 기반
  twist_line  "중요도 N 인데 만족도 M" — 반전의 근거
  source_case "다나와 · <브랜드> · 리뷰 N건 · 판매처 X/Y"  ← 구체성이 여기서 나온다
        │
        │  사람이 고른다 → status='available'
        ▼
/threads-draft (status=eq.available 만 읽는다)
        │
        ▼
발행 → 매처 → 수집기 → post_performance → 인사이트 루프
```

### `proposed` 를 거치는 이유

`/threads-draft` 는 `content_items` 를 `status=eq.available` 로 읽는다.
자동 생성분이 바로 `available` 로 들어가면 검수되지 않은 소재가 초안에
그대로 쓰인다. 그리고 §10 의 자동 커밋 예외는 **인사이트 루프 한정**이지
소재은행까지 넓어진 적이 없다.

`proposed` 는 새 상태다 — 현재 CHECK 제약은 `available|used|retired` 뿐이라
마이그레이션이 필요하다. `/threads-draft` 는 한 줄도 안 고쳐도 된다
(이미 `available` 만 읽으므로 `proposed` 는 자동으로 안 잡힌다).

### `human_confirmed=true` 인 속성만 승격 후보로 삼는다

검수를 안 거친 LLM 추출값으로 소재를 만들면, 추출 오류가 그대로 발행 글이
된다. 그리고 검수 diff 로 로직을 고치는 트랙과도 어긋난다 — 검증되지 않은
값을 소비하면서 그 값을 검증하는 셈이 된다.

## 8. 스케줄과 권한

`.github/workflows/nightly-review-collect.yml`

- `0 18 * * *` (UTC) = **KST 03:00**. 인사이트 루프(04:00)보다 한 시간 앞
- `permissions: contents: read` — **수집기는 리포에 쓰지 않는다**
- `concurrency: review-collect`
- `workflow_dispatch` 에 `dry_run`(기본 true) / `source` / `limit` 입력

인사이트 루프와 **별도 잡**이다. 인사이트 루프는 main 커밋 권한이 있고
수집기는 없다. 권한이 다른 일을 한 잡에 합치면 낮은 쪽이 높은 쪽으로 끌려간다.

초기 규모: 하루 리뷰 수십 건 = 페이지 3~5개 = **요청 10건 미만**.
간격 4초면 1분 안에 끝난다. `daily_request_cap` 은 넉넉히 200 으로 두되
실제 사용량을 `review_collection_runs.requests` 로 지켜본다.

## 9. 원문 보존 기간

`analysis_inputs.raw_text` 는 extract 가 소비하고 나면 원본 가치가 급락한다
(파생값이 `analysis_aspects` 에 들어갔고, `llm_*` 에 LLM 원본도 남는다).

- 보존 **30일**. `collected_at + 30d` 지난 수집분의 `raw_text` 를 `null` 로
  비운다. 행은 남긴다 — 몇 건을 언제 어디서 받았는지는 계속 필요하다.
- 사람이 붙여넣은 행(`source_key IS NULL`)은 **건드리지 않는다.** 다시 구할 수
  없는 데이터다.
- 지문은 `review_fingerprints` 에 남아 중복 판정이 계속 산다.

## 10. 하지 않는 것

- robots Disallow 경로 요청 — 요청 자체를 보내지 않는다
- User-Agent 위장 · VPN · IP 로테이션 · 프록시 — 실측상 효과도 없다(§1)
- 403/429 재시도 — 받는 즉시 소스를 끈다
- extract 자동 실행 — 검수 결과를 날린다(§6)
- `content_items` 자동 `available` 승격 — 사람이 고른다(§7)
- 새 원문 테이블 — 기존 `analysis_inputs` 로 흘려보낸다(§2)

## 11. 구현 순서 (승인 후)

1. 마이그레이션 SQL 4종 작성 → **사용자가 대시보드에서 실행**
2. `lib/review/types.ts` + `lib/review/health.ts` + 셀프테스트
3. `lib/review/adapters/danawa.ts` — 파서를 픽스처로 먼저 테스트
4. `lib/review/runner.ts` — robots·간격·커서·건강도 (소스 무관)
5. `scripts/review-collect.mjs` + 워크플로
6. `scripts/insight-loop.mjs` 에 소스 경보 최상단 출력 추가
7. 12개 프로젝트에 다나와 타깃 매핑(사람이 상품 선택)
8. dry-run 며칠 → 실제 적재 → extract → 검수 → diff 리포트
