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

글로우픽은 **제외 확정**(2026-08-29 사용자 결정). `ClaudeBot` / `GPTBot` /
`Bytespider` / `meta-externalagent` 를 명시적으로 `Disallow: /` 한다.
`*` 는 허용이라 규칙의 문자는 통과하지만, **자동 수집을 원하지 않는다는
의사표시로 읽는 게 맞다.** CSR 이라 headless 브라우저까지 띄워야 하는데,
그 의사를 보고도 브라우저를 띄우는 건 우회에 가깝다.

### 파서 버그가 판정을 뒤집었던 건 — 전체 재검증 완료

고친 파서로 12개 소스를 다시 판정했고 **바뀐 건 화해 하나뿐**이었다.
버그는 `User-agent: *` 그룹이 두 번 이상 나오는 robots.txt 에서만 발현하는데,
12곳 중 그 형태가 화해뿐이었다. 상세는 `review-source-findings.md`.

재발 방지로 프로브 출력에 `⚠️ * 그룹 N개(병합 대상)` 경고를 넣었다.

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
  externalId: string | null        // 다나와 리뷰 seq. 지문의 1순위 (§4.5)
  text: string
  rating: number | null            // 다나와는 100점 척도 → 5점으로 정규화
  seller: string | null            // ★ 다나와의 핵심 — 11번가·롯데하이마트 등
  authorMasked: string | null      // 'vl****'. seq 폴백 시 지문 재료
  writtenAt: string | null         // ISO date
}
```

### 다나와에서 이 필드들이 실제로 어디서 나오는지 (실측 확인)

`prodCode=102126566&page=1` 응답에서 전부 확인했다. 파서를 짜기 전에
구조를 확정해 둔다.

| 필드 | 출처 |
|---|---|
| `externalId` | `id="danawa-prodBlog-companyReview-button-side-<seq>"` |
| `rating` | `<span class="star_mask" style="width:100%">100점</span>` |
| `seller` | `<span class="mall">` 안의 `img[alt]` 또는 숨김 `<span>` |
| `writtenAt` | `<span class="date">2025.09.06.</span>` |
| `authorMasked` | `<span class="name">vl****</span>` |
| `text` | `<div class="rvw_atc">` 이하 |

리뷰 항목 경계는 `<li class="danawa-prodBlog-companyReview-clazz-more">` 다.
**항목 수와 seq 수가 어긋나면 그게 곧 `parseFailures`** 다 — 실측에서는
3:3 으로 일치했다.

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

### `review_collection_runs` — 실행 이력

`started_at` / `finished_at` / `source_key` / `status(running|ok|failed|interrupted)` /
`requests` / `pages_fetched` / `reviews_parsed` / `parse_failures` /
`new_reviews` / `duplicates` / `robots_skips` / `error`.

실행 시작 시 `running` 으로 남은 이전 run 을 `interrupted` 로 정리한다.
잡이 SIGKILL 로 죽으면 `finished_at` 을 못 쓰는데, 그걸 성공으로 착각하면
안 된다.

### `review_fingerprints` — 중복 제거 (원문 폐기 후에도 남는다)

→ 상세는 **§4.5**. 이 설계에서 원문 삭제와 증분 수집이 정면으로 부딪히는
유일한 지점이라 절을 따로 뒀다.

---

## 4.5 중복 제거 키 — 원문을 지운 뒤에도 "이미 본 리뷰"를 아는 방법

### 원칙

원문을 지우면 판별 근거가 사라진다. 해결은 하나뿐이다 —
**지문을 원문에서 파생시키되, 지문이 원문에 의존하지 않게 만든다.**
한 번 계산해 저장하면 원문이 없어도 비교가 된다.

그래서 **원문 30일 / 지문 무기한**이다.

### 키는 두 개다. 역할이 다르다

| 키 | 역할 | 구성 |
|---|---|---|
| `identity_key` | **"같은 리뷰인가"** 판별 | 아래 참조. 본문을 넣지 않는다 |
| `content_hash` | **"내용이 바뀌었는가"** 감지 | `sha256(normalize(text))` |

UNIQUE 는 `identity_key` 에만 건다. `content_hash` 는 제약이 아니라 관측값이다.

### 왜 하나로는 안 되는가

어느 쪽으로 만들어도 한쪽 오류가 생긴다.

- **본문만 해싱** → 짧고 흔한 리뷰가 충돌한다. 실측 응답에도
  "가벼운데 성능도 만족합니다!" 같은 문장이 있었다. 서로 다른 사람의 리뷰를
  중복으로 판정해 **진짜 신규를 버린다.**
- **본문까지 넣어 해싱** → 리뷰가 수정되면 다른 지문이 되어 **중복 적재**된다.

**둘 중 중복 적재가 훨씬 비싸다.** 이 파이프라인의 산출물이 속성별
`importance` 인데, 같은 리뷰가 두 번 들어가면 그 불만이 두 번 세어져
중요도가 부풀려진다. 조용히 왜곡되고 나중에 추적이 안 된다. 반대로 리뷰
하나를 덜 모으는 건 하루 수십 건 규모에서 감당된다.

그래서 **정체성과 내용을 분리**한다.

### `identity_key` 구성 — 다나와가 리뷰 ID 를 노출한다 (실측 확인)

미확인 항목이었는데 확인했다. 다나와 리뷰 AJAX 응답에 **리뷰별 고유 seq 가
있다.**

```html
<button class="edit_opt_btn" id="danawa-prodBlog-companyReview-button-side-252495223">
<a href="#" class="btn_editopt" id="danawa-prodBlog-companyReview-button-block-252495223">
```

`prodCode=102126566&page=1` 실측: 리뷰 항목 3개 / 고유 seq 3개
(`252495223`, `00443587321`, `00443587322`) — 1:1 로 대응한다.

seq 형식이 섞여 있는 것(9자리 vs 11자리 0 패딩)으로 보아 판매처별로 다른
ID 공간에서 온 값이 그대로 실려 오는 듯하다. 그래서 seq 단독으로 쓰지 않고
**상품으로 범위를 좁힌다.**

```
identity_key = sha256("danawa" | product_ref | review_seq)
```

`product_ref` 는 다나와 pcode 다. 같은 상품 페이지 안에서 seq 는 유일함을
실측으로 확인했고, 상품이 다르면 애초에 다른 타깃이다.

**seq 를 못 찾은 경우의 폴백**(다나와가 구조를 바꿔 seq 가 사라지면):

```
identity_key = sha256("danawa" | product_ref | seller | author_masked | written_at)
```

수정에 견디도록 **본문을 넣지 않는다.** 다만 이 폴백에는 남는 손실이 있다 —
같은 사람이 같은 날 같은 판매처에서 같은 상품에 리뷰를 두 개 쓰면 두 번째를
중복으로 버린다. `author_masked` 가 `vl****` 로 마스킹돼 있고 `written_at` 에
시각이 없어(`2025.09.06.` 형식) 충돌 확률이 실제보다 높다. seq 가 살아 있는
한 이 손실은 발생하지 않는다.

폴백으로 떨어지는 순간을 놓치면 안 되므로, seq 미발견은 `parseFailures` 로
집계해 §5 의 건강도에 반영한다. 절반 이상이 폴백이면 `broken` 이다.

### 짧고 흔한 본문이 뭉개지지 않는 이유

`identity_key` 에 본문이 없다. "빠른배송 잘 받았습니다"가 100개 있어도
각각 다른 seq 를 갖기 때문에 전부 다른 리뷰로 들어간다.

`content_hash` 는 뭉칠 수 있지만 **제약이 아니라서 아무것도 막지 않는다.**
같은 `identity_key` 가 다시 왔을 때 내용이 바뀌었는지 비교하는 데만 쓴다.

`normalize` 는 공백 압축과 트림 정도만 한다. 소문자화·구두점 제거까지
가면 "좋아요"와 "좋아요!"가 같은 해시가 되는데, 그건 수정 감지의 민감도를
떨어뜨린다.

### 리뷰가 수정되면 — 감지하고 기록만 한다

같은 `identity_key` 가 다시 오고 `content_hash` 만 달라진 경우다.

| 하는 일 | 하지 않는 일 |
|---|---|
| `revision_count += 1` | ❌ `analysis_inputs.raw_text` 갱신 |
| `content_hash` 를 새 값으로 교체 | ❌ 재분석 큐에 올리기 |
| `last_seen_at` 갱신 | ❌ `analysis_aspects` 재계산 |
| 야간 보고에 "수정 감지 N건" 한 줄 | ❌ 새 `analysis_inputs` 행 추가 |

**`extract` 를 자동 실행하지 않기로 한 것과 같은 이유다.** 리뷰가 수정됐다고
매일 밤 값이 갱신되면, 그 입력에서 나온 `analysis_aspects` 가 사람이 검수해
둔 교정값과 어긋나기 시작한다. 그리고 재적재하면 같은 사람 의견이 두 번
세어져 `importance` 가 부풀려진다 — 애초에 키를 둘로 나눈 이유였던 바로 그
오염이다.

`content_hash` 는 **제약이 아니라 관측값**이라는 게 여기서 드러난다. 아무것도
막지 않고, 아무것도 트리거하지 않는다. "이 소스는 리뷰가 얼마나 고쳐지는가"를
재는 계기판이다.

수정이 잦다면 그건 **사람이 봐야 할 신호**이지 자동으로 처리할 일이 아니다.
`revision_count` 가 눈에 띄게 쌓이면 해당 프로젝트를 다시 `extract` 할지
사람이 판단한다. 그 판단 근거만 야간 보고가 제공한다.

한 가지 부수 사실: 원문은 30일 뒤 비워지므로, 그 이후에 감지된 수정은
어차피 갱신할 대상이 없다. 위 규칙은 30일 이내에도 같게 적용된다 —
보관 기간에 따라 동작이 달라지면 그 자체가 추적 불가능한 변수가 된다.

### 순서가 바뀌면

**지문 기반이라 무영향이다.** 순서에 의존하는 판정이 없다.

다만 **커서는 순서에 의존한다**(§4.6). 커서는 효율을 위한 것이고,
정확성의 최종 방어선은 지문이다. 커서가 틀려 이미 본 페이지를 다시 읽어도
지문이 전부 걸러낸다.

### 테이블

```sql
review_fingerprints
  id                uuid PK
  source_key        text NOT NULL          -- 'danawa'
  identity_key      text NOT NULL          -- sha256 hex
  content_hash      text NOT NULL          -- sha256 hex
  product_ref       text                   -- 다나와 pcode
  written_at        date
  first_seen_at     timestamptz NOT NULL DEFAULT now()
  last_seen_at      timestamptz NOT NULL DEFAULT now()
  revision_count    integer NOT NULL DEFAULT 0
  key_kind          text NOT NULL           -- 'seq' | 'composite' (폴백 추적용)
  analysis_input_id uuid REFERENCES analysis_inputs(id) ON DELETE SET NULL

  UNIQUE (source_key, identity_key)
```

인덱스는 셋이다.

- `UNIQUE (source_key, identity_key)` — 중복 판정 본체.
  조회 후 삽입이 아니라 **삽입 시도가 곧 중복 검사**다. 동시 실행에도 안전하다
- `(source_key, product_ref, written_at DESC)` — 증분 종료 판정이
  타깃별 최신 리뷰 날짜를 본다
- `(analysis_input_id)` — 원문 폐기 배치가 역방향으로 찾는다

**`ON DELETE SET NULL` 이 핵심이다.** `analysis_inputs` 는
`analysis_projects` 에 `ON DELETE CASCADE` 로 매달려 있다. 프로젝트를 지우면
입력이 함께 사라지는데, 그때 지문까지 CASCADE 로 딸려 죽으면 프로젝트를
다시 만들었을 때 **이미 본 리뷰를 전부 다시 긁는다.**

### 보관 기간과 용량

지문은 **무기한**이다. 지우면 증분 수집이 무너진다.

행당 약 120바이트. 하루 50건 × 365일 = 18,250행 ≈ **연 2.2MB**.
원문을 지우는 이유였던 500MB 압박과 상충하지 않는다.

---

## 4.6 체크포인트와 커서

### 체크포인트를 run 이 아니라 타깃에 둔다

**페이지 하나를 처리할 때마다 `cursor` 를 즉시 갱신한다.** 그래서 Actions
잡이 SIGKILL 로 죽어도 다음 실행이 각 타깃의 커서에서 그냥 이어간다 —
**재개를 위한 별도 복구 로직이 없다.**

run 단위에 체크포인트를 두면 "어디까지 했는지"를 run 로그에서 복원해야 하고,
그 복원 코드가 곧 버그가 된다. 죽는 방식이 여러 가지라(타임아웃·OOM·러너
회수) 복원 경로를 전부 테스트할 수도 없다.

### 다나와 커서의 실제 형태

`cursor` 는 페이지 번호다. 종료 신호는 **응답에 리뷰 항목이 0개**인 것이다 —
실측에서 `page=2` 가 항목 0개를 돌려주며 자연스럽게 끝났다(그 상품 리뷰 3건,
1페이지에 전부).

```
nextRequest(target) →
  https://prod.danawa.com/info/dpg/ajax/companyProductReview.ajax.php
    ?prodCode=<product_ref>&page=<cursor+1>
```

### 증분 종료 조건 — 순서 변동에 견디게

정렬이 흔들리면 페이지 경계가 밀려 일부를 건너뛴다. 그래서 종료 조건을
"페이지 끝"이 아니라 이렇게 둔다.

> `written_at` 이 `last_review_at` 보다 오래된 리뷰를 **연속 5개** 만나면
> 그 타깃을 그 실행에서 종료한다.

한두 개가 순서에서 튀어도 조기 종료하지 않는다. 그리고 놓친 게 있어도
다음 실행이 다시 훑고, 이미 본 건 지문이 걸러낸다.

### 실행 간 상태 정리

실행 시작 시 `running` 으로 남아 있는 이전 run 을 `interrupted` 로 정리한다.
잡이 죽으면 `finished_at` 을 못 쓰는데, 그걸 성공으로 착각하면 안 된다.

---

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

  ⚠️ **`analysis_inputs.raw_text` 는 현재 `NOT NULL` 이다.** 이 설계가
  성립하려면 제약을 풀어야 한다. 마이그레이션에 포함한다. 빈 문자열로
  대체하는 방법도 있지만, 그러면 "원문이 없다"와 "원문이 빈 문자열이다"를
  구분할 수 없고 `length(raw_text)=0` 같은 조건이 두 경우를 뭉갠다.
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

1. ✅ **마이그레이션 SQL 작성 완료** → 사용자가 대시보드에서 실행 (대기 중)

   ```
   supabase/migrations/20260829000003_review_collection.sql        (+rollback)
   supabase/migrations/20260829000004_content_items_proposed.sql   (+rollback)
   ```

   003 먼저, 004 나중에. 004 는 Threads 소재 연결용이라 **미뤄도 된다** —
   003 만으로 §6 의 Day2 경로가 성립한다.

   ⚠️ 003 에 **파괴적 변경이 하나** 있다. `analysis_inputs.raw_text` 의
   `NOT NULL` 을 푼다. 원문 30일 폐기 설계가 그것 없이는 성립하지 않는다(§9).
   롤백 파일 A 단계가 "되돌릴 수 없는 지점"을 먼저 확인시킨다 — 폐기가 한 번이라도
   돌았으면 `NOT NULL` 복원은 실패하고, 그 원문은 이미 없다.

2. `lib/review/types.ts` + `lib/review/health.ts` + 셀프테스트
3. `lib/review/adapters/danawa.ts` — 파서를 픽스처로 먼저 테스트
4. `lib/review/runner.ts` — robots·간격·커서·건강도 (소스 무관)
5. `scripts/review-collect.mjs` + 워크플로
6. `scripts/insight-loop.mjs` 에 소스 경보 최상단 출력 추가
7. 12개 프로젝트에 다나와 타깃 매핑(사람이 상품 선택)
8. dry-run 며칠 → 실제 적재 → extract → 검수 → diff 리포트
