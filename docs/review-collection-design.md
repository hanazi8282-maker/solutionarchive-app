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

### 1.1 ⚠️ 다나와 소스의 구조적 편향 — 모든 프로젝트에 적용된다

다나와는 채택했지만 **전 카테고리에 균일한 소스가 아니다.** 7단계 매핑
(§13.14 / §13.16)에서 실측으로 드러났고, **앞으로 플래그십·신제품을 다루는
모든 프로젝트에 해당하는 제약**이라 여기 옮겨 적는다.

**다나와 상품리뷰는 "다나와 최저가를 거쳐 사는 사람"의 구매 패턴을 반영한다.**
리뷰가 많은 제품이 잘 팔리는 제품이 아니라, 다나와를 경유해 팔리는 제품이다.
편향은 두 축으로 나타난다.

**축 1 — 제품 등급.** 플래그십은 공식몰·통신사·브랜드몰에서 팔려 다나와에
리뷰가 남지 않는다. 무선이어폰에서 '프로' 접미사가 붙는 순간 0 에 수렴했다.

```
   0건 에어팟 프로3 / 에어팟 프로2 USB-C      vs   136건 에어팟3(표준형)
   0건 버즈4 프로 / 버즈3 프로 / 버즈 프로    vs   825건 버즈3 FE, 681건 버즈4
```

같은 현상이 유산균에서는 **소비자 세그먼트**로 나타났다. 듀오락은 성인
라인이 2건인데 어린이·유아 라인이 745·603·134·125건이다. CJ 바이오코어도
포(스틱)·소용량은 0건이고 캡슐 대용량이 555건이다.

**축 2 — 출시 후 경과 시간.** 다나와 리뷰는 누적 지표다. 어느 브랜드든
최신 세대가 가장 얇다.

```
보스     20건 QC 울트라 2세대(최신)  vs  130건 QC 이어버드2
젠하이저 13건 MTW4(최신)             vs  305건 MTW3
소니     85건 WF-1000XM5(최신)        vs  584건 WF-1000XM3
```

**실무 규칙 3가지:**

- 프로젝트 대상이 **플래그십이거나 출시 6개월 이내**면 다나와 리뷰가 0 일
  것을 먼저 의심하라. 없으면 "미등재"가 아니라 "등재됐는데 리뷰가 0" 인
  경우가 많다(§13.13 — 리뷰 수로 정렬하면 정답이 목록에서 사라진다)
- 대안을 고를 때 **리뷰 수보다 제품 동일성이 우선**이다. 하위 라인·다른
  포뮬러·이름만 비슷한 다른 제품은 리뷰가 몇 배 많아도 쓰지 않는다.
  같은 브랜드·같은 라인의 용량·제형 차이까지만 허용한다
- 그래도 0 이면 세그먼트·등급을 지키고 **브랜드를 바꾸는** 쪽이 낫다.
  세그먼트가 어긋나면 카테고리 내 비교축 자체가 깨진다

**결과 해석 시 잊지 말 것:** 이 편향 때문에 무선이어폰 4개 프로젝트에서
애플·삼성이 통째로 빠졌다(§13.16). 국내 점유율 1·2위가 없는 경쟁 분석이다.
판단이 아니라 소스의 한계이고, 필요하면 그 카테고리만 소스를 다시 여는 게
맞다.

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

### 셀프테스트가 고정하는 경계 (`scripts/review-health-selftest.mjs`, 40건)

**나눗셈을 쓰지 않는다.** 파싱 성공률 0.8 을 실수로 비교하면 "정확히 80%"가
경계 어느 쪽으로 떨어질지가 입력 숫자에 따라 달라진다. 정수 교차곱으로 본다:

```
parsed * 10 < attempted * 8
```

인사이트 루프에서 같은 종류의 버그를 겪었다 — `0.02 * 0.9` 가 `0.018` 이
아니라서 정확한 −10% 가 기각이 아닌 보류로 떨어졌다. 거기서는 EPS 를 넣었지만,
EPS 는 임계값을 하나 더 도입하는 방식이다. 정수 비교는 그 임계값 자체를 없앤다.

테스트가 이걸 **조합 400개로** 훑는다.

- `parsed = 8k, attempted = 10k` (k = 1…200) — 정확히 80% 인 200개 조합이
  **하나도 broken 으로 새지 않는지**
- `parsed = 8k − 1, attempted = 10k` (k = 1…200) — 문턱보다 딱 하나 모자란
  200개 조합을 **전부 broken 으로 잡는지**

실수 비교였다면 여기서 깨진다. 한두 개 샘플만 보면 우연히 통과한다.

### 3종 판정 외에 다룬 케이스

승인받은 판정은 셋이다(파싱 성공률 / 연속 0건 / 403·429). 그 외에 테스트로
못 박은 것들은 **판정을 바꾸지 않고 오진을 막는** 장치다.

| 케이스 | 처리 | 이유 |
|---|---|---|
| 차단 + 파싱 실패 동시 | 차단으로 보고 | 차단당하면 본문이 차단 페이지라 파싱도 같이 깨진다. "파서가 깨졌다"고 보고하면 사람이 멀쩡한 파서를 고치러 간다 |
| 차단 시 연속 0건 카운터 | **올리지 않는다** | 한 원인이 두 판정을 내면 진단이 흐려진다. 나중에 "연속 0건이라 degraded" 라는 엉뚱한 이유가 남는다 |
| 시도 10건 미만 + 실패 있음 | 판정 보류 + **경고** | "판정 못 했다"와 "정상이다"는 다른 상태다. 조용히 ok 로 넘기지 않는다 |
| 시도 0건 (타깃 없음) | ok, 그렇다고 명시 | 0으로 나누지 않고, "수집할 타깃이 없었다"고 적는다 |
| 파싱 정상 + 신규 0건 | degraded (broken 아님) | 파서 탓으로 보고하면 안 된다. 그 상품에 새 리뷰가 안 달린 것일 수 있다 |
| 지문 폴백 과반 | **경고만.** health 불변 | 폴백도 동작하는 경로다. 여기서 broken 을 띄우면 "쓸 수 있는데 꺼진" 상태가 되고 경보가 무뎌진다 |
| `ok` 일 때 경보 줄 | **null** | 늘 있는 줄은 곧 안 읽는 줄이 된다 |

`broken` 만 소스를 끈다. `degraded` 는 끄지 않는다 — 신규 0건에 소스를 끄면
나중에 새 리뷰가 달려도 영영 못 본다.

---

## 5.5 파서 — 픽스처 기반 검증 (`scripts/review-danawa-selftest.mjs`, 44건)

네트워크 없이 돈다. 다나와가 구조를 바꿔도 저장된 픽스처로 새 파서를 짜고
옛 픽스처로 회귀를 확인한다. 남의 서버를 때려가며 디버깅하지 않는다.

### 픽스처는 구조만 보존한다

`fixtures/review/danawa/` 에 4종을 뒀다: `many`(10건) / `page2`(10건) /
`few`(3건) / `empty`(0건).

**리뷰 본문과 작성자는 합성값으로 치환했다.** 원문을 분석 기간만 보관하고
폐기하기로 해놓고 공개 리포에 영구 커밋하면 말이 맞지 않는다. 파서가 깨지는
건 구조지 본문이 아니라서 회귀 검증 가치는 그대로다.

### 이 테스트가 실제로 잡아낸 구멍

본문 컨테이너(`<div class="atc">`)의 클래스명만 바뀌는 경우가 **가장 교활하다.**
제목(`<p class="tit">`)은 그대로 읽히므로 "제목만 남은 리뷰"가 정상처럼
수집되고, seq·판매처·날짜가 멀쩡하니 `parseFailures` 도 0 이다. 수집량은
그대로인데 본문만 사라진 채로 몇 주가 간다.

처음 파서는 이걸 통과시켰다. 테스트가 잡았고, 그래서 **컨테이너의 부재를
구조 변경 신호로** 쓰도록 고쳤다 — 픽스처 23개 항목 전부에 컨테이너가 있었고
(many 10 / few 3 / page2 10), 내용이 빈 것은 0개였다.

컨테이너는 있는데 내용만 빈 것은 실패가 아니다(별점만 남긴 리뷰). **둘을
가르는 게 컨테이너의 존재다.**

실패로 표시해도 리뷰를 버리지는 않는다. 제목만이라도 남기고 시끄럽게 보고하는
편이, 조용히 버려서 "신규 0건"으로 보이는 것보다 낫다. 실패율이 20% 를 넘으면
`health` 가 `broken` 이 되어 소스가 멈춘다.

### 그 밖에 고정한 것

- **항목 경계가 새지 않는가** — 문서 전체에 정규식을 걸면 앞 항목의 판매처가
  뒤 항목에 붙어도 아무도 모른다. 값이 "있긴 있어서" 실패로도 안 잡힌다.
  항목마다 seq 가 유일한지로 검증한다
- **끝 신호** — 빈 페이지가 HTTP 404 가 아니라 **정상 200** 으로 온다.
  상태 코드로는 끝을 알 수 없고 본문을 봐야 한다
- **페이지네이션** — 1·2페이지 리뷰의 seq 가 겹치지 않는지
- **항목 마크(`clazz-more`)가 바뀐 경우** — 가장 치명적이다. 0건 + 커서 종료
- 100점 척도 → 0~5 변환 경계, HTML 엔티티 복원, `<br>` → 줄바꿈

---

## 5.6 러너 — 남의 서버에 대한 규칙이 걸려 있는 코드

`lib/review/runner.ts`. 외부 세계를 전부 **포트로 주입받는다**(네트워크·DB·
시계·sleep). DB 없이 가짜 포트로 전 경로를 테스트하기 위해서다 —
마이그레이션 적용을 기다리지 않고 검증할 수 있는 게 이 구조 덕이다.
셀프테스트 61건(`scripts/review-runner-selftest.mjs`).

### 규칙을 코드로 못 박은 지점

| 규칙 | 구현 | 테스트가 고정하는 것 |
|---|---|---|
| robots Disallow 는 요청하지 않는다 | 판정 후 `continue` | 금지면 robots.txt 외 요청이 0건 |
| robots.txt 를 못 읽으면 안 간다 | 5xx·네트워크 오류 → `unreadable` | 503 일 때 요청 0건 |
| robots 는 호스트당 한 번만 묻는다 | `RobotsCache` | 여러 페이지를 돌아도 robots.txt 1회 |
| 403/429 는 재시도하지 않는다 | 즉시 `aborted` | 요청 1건에서 멈추고 남은 타깃도 안 건드린다 |
| 요청 간격 | `Pacer` | 연속 요청 사이에 실제로 잔다 |
| 일일 상한 | `dailyRequestCap - requestsToday` | 상한이 2면 요청도 2건 |
| 사람이 끈 소스는 안 건드린다 | `enabled` 검사 | robots.txt 조차 안 받는다 |
| 페이지마다 커서 즉시 저장 | 페이지 루프 안에서 `saveTargetProgress` | 중간 실패 시에도 직전 커서가 남는다 |
| 타깃당 페이지 상한 | `MAX_PAGES_PER_TARGET = 20` | 60페이지짜리도 20에서 멈춘다 |

### 증분 종료가 순서 변동에 견딘다

기준일보다 오래된 리뷰를 **연속 5개** 만나야 종료한다. 테스트가 두 방향을
고정한다 — 연속 5개면 다음 페이지를 안 받고, 중간에 최신 리뷰 하나가 끼면
연속이 끊겨 계속 읽는다.

### 지문을 못 만들면 적재하지 않는다

정체성 재료(seq·판매처·작성자·작성일)가 전부 비면 `computeFingerprint` 가
null 을 돌려주고, 러너가 파싱 실패로 센다.

여기서 "본문 해시를 정체성으로 쓰면 되지 않나"는 함정이다. 그러면 수정된
리뷰가 매번 새 리뷰로 들어가 `importance` 를 부풀린다 — 키를 둘로 나눈
이유를 정면으로 어긴다. 반대로 빈 조합으로 키를 만들면 그 상품의 모든 리뷰가
같은 `identity_key` 를 갖게 되어 하나만 남고 전부 사라진다. 더 나쁘다.
그래서 지문을 포기하고 시끄럽게 실패한다.

### Node 타입 스트리핑 제약 (기록)

`constructor(private readonly x: T) {}` 형태의 파라미터 프로퍼티를 쓸 수 없다.
코드를 생성하는 TS 문법이라 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` 로 죽는다.
`lib/review/*` 와 `lib/insight/*` 는 Next 빌드가 아니라 Node 스크립트가
직접 로드하므로 이 제약을 받는다. 필드를 명시하고 생성자에서 대입할 것.

---

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

2. ✅ `lib/review/types.ts` + `lib/review/health.ts` + 셀프테스트 40건
3. ✅ `lib/review/adapters/danawa.ts` + 픽스처 4종 + 셀프테스트 44건
4. ✅ `lib/review/fingerprint.ts` + `lib/review/runner.ts` + 셀프테스트 61건
5. ✅ `lib/review/store.ts` + `scripts/review-collect.mjs` + 워크플로
   + `scripts/review-migration-verify.mjs` (마이그레이션 적용 확인, 읽기 전용)
6. ✅ `scripts/insight-loop.mjs` 에 소스 경보 최상단 출력 추가
7. 12개 프로젝트에 다나와 타깃 매핑(사람이 상품 선택)
8. dry-run 며칠 → 실제 적재 → extract → 검수 → diff 리포트

---

## 12. 미룬 트랙 — O_k 공식 회귀 테스트 (착수 전)

수집 트랙을 닫은 뒤에 볼 것. 아이디어는 성립하는데 **선행 조건이 하나 있고,
그걸 안 풀면 회귀 테스트가 없는 것보다 나쁘다** — 없으면 조심하는데
있으면 믿어버린다.

### 왜 성립하는가

필요한 재료가 이미 다 있다. `analysis_aspects` 한 행에 `llm_*` 8종(LLM 원본)과
사람 교정값이 **같이** 들어 있고 `reviewed_at` 으로 검수 시점이 박혀 있다.
검수 통과한 케이스는 그 자체가 완성된 픽스처다 — 만들 게 아니라 떠내면 된다.

방식은 다나와 픽스처와 같다(§5.5). `human_confirmed=true` 인 행에서
`importance` / `satisfaction` / `quadrant` 를 뽑아 고정하고, 공식을 고칠 때마다
어느 케이스의 사분면이 뒤집히는지 본다.

### 선행 조건 — 이걸 먼저 풀어야 한다

1. **SQL 과 TS 의 공식이 같은지 확인하는 테스트가 먼저다.**
   `opportunity_score` 는 DB generated 컬럼이다:

   ```sql
   opportunity_score numeric GENERATED ALWAYS AS
     (importance + greatest(importance - satisfaction, 0)) STORED
   ```

   공식이 SQL 안에 있으므로 회귀 테스트는 TS 복제본을 검증하게 된다.
   두 곳이 어긋나면 **테스트는 통과하고 실제 값은 다르다.** 실DB 값과
   TS 계산이 일치하는지 확인하는 테스트가 회귀 테스트보다 먼저 있어야 한다.

2. **`quadrant` 경계값의 정의 위치를 확인할 것.**
   `TABLE_STAKES` / `DIFFERENTIATOR` / `OVER_INVESTED` / `IGNORE` 를 가르는
   기준이 추출 프롬프트에 있는지, 코드에 있는지, 사람 판단인지 아직 확인하지
   않았다. 프롬프트 안에 있으면 그건 LLM 출력이라 "공식"이 아니고,
   회귀 테스트의 대상이 달라진다.

3. **공식을 SQL 에서 빼서 한 곳에만 두는 게 나은지도 같이 검토할 것.**
   generated 컬럼의 장점은 앱이 무엇을 하든 값이 항상 일관된다는 것이고,
   단점은 공식 변경이 마이그레이션이 되고 테스트가 복제본을 보게 된다는 것이다.
   TS 로 옮기면 테스트가 진짜를 보지만, 앱을 우회한 INSERT 가 값을 비울 수 있다.
   둘 중 어느 쪽이 이 프로젝트에 맞는지는 정해진 답이 없다 — 결정하고 기록할 것.

---

## 13. 검증 방식 감사 (2026-08-30)

사용자 지적에서 시작했다. **"확인할 수 없을 때 정상이라고 답하는"** 형태가
이 프로젝트에서 반복됐다. 같은 형태로 거짓일 수 있는 ✅ 를 전부 훑은 기록이다.

### 지금까지 나온 다섯 번

| # | 어디 | 무엇을 확인한다고 했나 | 실제로는 |
|---|---|---|---|
| 1 | 다나와 파서 (3단계) | 리뷰를 읽는다 | 본문 컨테이너가 사라져도 제목만 읽고 정상 보고 |
| 2 | 소스 실측 (3순위) | Amazon 리뷰 접근 가능 | HTTP 200 인데 내용은 로그인 벽 |
| 3 | 마이그레이션 검증기 (5단계) | 테이블이 있다 | `head:true` 가 없는 테이블에도 error=null / 204 |
| 4 | 워크플로 검사 (5단계) | YAML 파싱 ok | 탭 문자만 셌다. 파싱한 적 없음 |
| 5 | 러너 테스트 (4단계) | 러너가 동작한다 | 가짜 어댑터만 씀. 실제 어댑터와 붙여 본 적 없음 |

1·2·3 은 그 자리에서 잡아 고쳤다. 4·5 는 이번 감사에서 나왔다.

### ② — 러너와 어댑터를 붙여 본 적이 없다

러너 셀프테스트 61건이 전부 **가짜 어댑터**를 썼다. 러너의 규칙(robots·간격·
상한·커서·지문)은 검증됐지만, **다나와 어댑터와 러너가 실제로 맞물리는지는
한 번도 확인되지 않았다.**

각 부품은 통과하는데 붙이면 안 되는 상태를, 실행에서 처음 알게 되는 구조였다.
픽스처가 이미 있어 네트워크 없이 메울 수 있었다.

통합 테스트를 넣자 **진짜 버그 두 개**가 나왔다.

### 버그 1 — 커서가 제자리에 머문다 (3단계 산출물)

`lib/review/adapters/danawa.ts` 의 `parse()` 가 `nextCursor` 를 `ctx.cursor`
에서 그대로 계산했다.

```
nextRequest: 요청할 페이지 = cursor + 1
parse:       nextCursor    = cursor        ← 비대칭
```

커서가 안 움직이니 **같은 페이지를 영원히 다시 받는다.** 페이지 전진이
`1, 2, 2, 2, …` 가 된다.

증상이 안 드러난 이유는 안전망 둘이 가렸기 때문이다 — 증분 종료(연속 5건)와
타깃당 페이지 상한(20). 폭주는 막았지만 **2페이지 이후를 영영 못 읽는다.**
안전망이 correctness 버그를 덮은 형태다.

고쳤다. `parse` 가 **방금 가져온 페이지 번호**를 돌려준다.

### 버그 2 — 첫 실행이 한 페이지만 긁고 멈춘다 (4단계 산출물)

`lib/review/runner.ts` 가 증분 기준선(`last_review_at`)을 진행하면서 갱신하고,
동시에 그것을 "이미 본 리뷰인가" 판정에도 썼다.

첫 실행은 기준선이 null 이다. 1페이지를 읽고 그 최신 날짜를 기준으로 삼는
순간, 2페이지의 과거 리뷰가 **전부 "이미 본 것"** 이 되어 연속 5건에 걸려
멈춘다.

**과거를 훑어야 하는 첫 실행이 가장 크게 망가지는 형태다.** 그리고 겉으로는
"이미 본 구간 도달"이라는 정상 종료로 보인다.

고쳤다. 기준선은 실행 시작 시점 값으로 고정하고, 저장용 최신 날짜는 따로 둔다.

### 승인하고 넘어간 단계에 영향이 있는가

| 단계 | 영향 | 다시 볼 필요 |
|---|---|---|
| 1 (마이그레이션 SQL) | 없음. 스키마 무변경 | ❌ |
| 2 (types / health) | 없음. 판정 로직 무변경 | ❌ |
| 3 (다나와 어댑터) | **버그 1이 여기 있었다.** 고침 | ✅ 커서 계산만 |
| 4 (러너) | **버그 2가 여기 있었다.** 고침 | ✅ 기준선 처리만 |
| 5 (store / 스크립트 / 워크플로) | 코드 무변경. 러너 동작이 바뀌어 실행 결과만 달라짐(정상 방향) | ❌ |

**둘 다 고쳤다. 판단이 필요한 사항은 없다.**

### 단위 테스트의 구멍도 메웠다

버그 1 은 통합이 아니라 **파서 단위에서 잡혔어야** 한다. 기존 테스트가
`nextCursor !== null` 만 봤고 값을 안 봤다.

커서 값 검증과 `nextRequest` ↔ `parse` 대칭성 검사를 넣었다(파서 44 → 48건).
옛 계산식으로 되돌려 확인했다 — 페이지 전진이 `1,2,2,2` 로 나와 새 테스트가
실제로 걸러낸다.

### 아직 검증되지 않은 것 (정직하게)

- **마이그레이션 SQL 이 파서를 통과한 적이 없다.** 괄호·따옴표 개수를 센 게
  전부이고 그건 문법 검증이 아니다. 로컬에 Postgres 가 없고, Supabase MCP 는
  다른 프로젝트(Dothegy OS)를 가리켜 쓰면 안 된다. **대시보드 실행이 첫
  파싱이다.** 예약어는 확인했다 — `cursor` / `trigger` 둘 다 Postgres
  non-reserved 라 컬럼명으로 쓸 수 있다.
- **`lib/review/store.ts` 가 실제 DB 에 대고 돈 적이 없다.** 러너 테스트는
  가짜 store 를 쓴다. 실제 Supabase 응답 형태(특히 UNIQUE 위반이 정말
  `23505` 로 오는지)는 첫 실행에서 확인된다.
- **`nightly-review-collect.yml` 은 GitHub 에 등록조차 안 됐다.** 기본
  브랜치에 없고 트리거된 적도 없다. 로컬 YAML 파싱은 통과했지만 Actions
  스키마 검증은 머지 후에 받는다.

---

## §12. 적용 확인 기록 (2026-08-31)

마이그레이션 003/004 를 적용하려고 붙었는데, **이미 적용돼 있었다.** 그래서
SQL 은 한 줄도 실행하지 않았다. 아래는 "실행"이 아니라 "실측"의 기록이다.

### 12.1 실행하지 않은 이유 — 이미 적용돼 있다

DB 는 `qmgrfqjfxqhxuufrnkwf`(solutionarchive). 확인 경로는 Supabase CLI 의
`supabase db query --linked` 다 — Management API 를 타므로 DB 비밀번호가
필요 없다.

> ⚠️ Supabase **MCP 는 여기서 쓰면 안 된다.** `get_project_url` 이
> `hrplbrstntyanzwxcsft`(dothegy-os)를 돌려준다. 이 레포에 붙어 있어도
> MCP 가 보는 DB 는 다른 프로젝트다. 이번에도 그대로 확인됐다.

003/004 가 만들기로 한 것이 전부 있다:

- 테이블 4종 — `review_sources` / `review_targets` /
  `review_collection_runs` / `review_fingerprints`
- 인덱스 6종 — `review_targets_due_idx`, `review_collection_runs_recent_idx`,
  `review_fingerprints_target_recent_idx`, `review_fingerprints_input_idx`,
  `analysis_inputs_purgeable_idx`, `content_items_proposed_idx`
- RLS — `review_*` 4종 모두 `enabled=true` / `forced=true` (정책 없음 =
  service_role 전용)
- 시드 — `danawa` 1행(enabled=true, health=ok, 4000ms, 상한 200)
- 확장 컬럼 — `analysis_inputs.{source_key,collected_at,purged_at}`,
  `content_items.{source_aspect_id,proposed_at}`

핵심 제약 3종도 실측했다(설계 의도대로다):

| 확인 | 결과 |
|---|---|
| `analysis_inputs.raw_text` nullable | `is_nullable = YES` — 30일 폐기의 전제 성립 |
| `review_fingerprints_source_identity_key` | `UNIQUE (source_key, identity_key)` |
| `review_fingerprints_analysis_input_id_fkey` | `confdeltype = 'n'` = **SET NULL** (CASCADE 아님) |

세 번째가 가장 중요했다. `c`(CASCADE)였다면 프로젝트를 지울 때 지문이 딸려
죽고 재수집이 전량 반복된다. `n` 이라 안전하다.

`analysis_inputs_purge_trace_check`, `review_sources_disabled_needs_reason`,
`review_sources_min_interval_check`, `review_targets_project_source_product_key`,
`content_items_status_check`(= proposed/available/used/retired) 도 전부 붙어 있다.

즉 §11 의 "마이그레이션 SQL 이 파서를 통과한 적이 없다"는 **해소됐다.**
파싱은 물론이고 의도한 제약까지 그대로 걸렸다.

### 12.2 검증기 자체의 거짓 실패를 고쳤다 (§7.1 사례 6번)

`scripts/review-migration-verify.mjs` 가 8건 중 2건을 ❌ 로 보고했다.
사유는 `예상 밖 응답 status=206`.

원인은 DB 가 아니라 검증기다. PostgREST 는 `count=exact` 와 `limit(1)` 을
같이 쓰면 **행이 2개 이상인 테이블에 206 Partial Content** 를 준다.
`analysis_inputs` 10행, `content_items` 21행이라 둘만 206 이었다.
`review_sources` 는 1행이라 200 이었고, 그래서 이 버그가 여태 안 보였다.

`status !== 200` → `status !== 200 && status !== 206` 으로 고쳤다. 8/8 통과.

§7.1 은 "확인 실패를 양성으로 읽지 마라"였는데, 이건 그 반대 방향의 같은
병이다 — **정상을 실패로 읽는 검증기.** 거짓 통과만큼 비싸진 않지만,
멀쩡한 DB 를 두고 마이그레이션을 다시 때리게 만들 수 있었다.

### 12.3 🔴 정본 Vercel 프로젝트가 크론을 한 번도 못 돌렸다

여기서 멈췄다. 아래는 확인된 사실이다.

레포 하나에 Vercel 프로젝트가 셋 붙어 있다(전부 `hanazi8282-maker/solutionarchive-app`):

| 프로젝트 | 크론 결과 | CRON_SECRET |
|---|---|---|
| `solutionarchive-app` (정본) | **500 × 6회/3h** | 없음 |
| `solutionarchive` | (동일 증상) | 없음 |
| `solutionarch` | **200** — 실제로 도는 건 여기다 | 있음 |

크론은 스케줄대로 정확히 발화하고 있다(매처 :00, 수집 :30). 실패는 스케줄이
아니라 설정이다. 인증 없이 정본을 찔러 확인했다:

```
GET https://solutionarchive-app.vercel.app/api/threads/match-posts
→ 500 {"error":"Server misconfigured",
       "message":"CRON_SECRET 환경변수가 설정되지 않았다. ..."}
```

`solutionarch` 만 401(= 비밀은 있고 헤더가 없다)을 준다. 실제 200 로그도
거기서만 나온다:

```
07:01 GET /api/threads/match-posts 200
      [match] 초안 3 / 게시물 0 → 연결 0, 보류 3, 실패 0
06:30 GET /api/threads/collect-metrics 200
```

**§7.2 의 교과서적 사례다.** `lib/cron-auth.ts` 의 fail-closed 설계는
의도대로 정확히 동작했다 — 비밀이 없으면 조용히 열리는 대신 시끄럽게 닫혔다.
그런데 그 "시끄러움"이 아무한테도 안 들렸다. 안전장치가 제대로 걸린 것과
파이프라인이 도는 것은 별개다.

영향: 정본 기준으로 매처·수집기가 **한 번도 돌지 않았다.** 실제 매칭은
`solutionarch` 가 대신 하고 있어 데이터는 비어 있지 않지만, "어느 프로젝트가
정본인가"와 "어느 프로젝트가 일하는가"가 어긋나 있다.

### 12.4 하지 않은 것

- **마이그레이션 SQL 실행** — 이미 적용돼 있어 건드리지 않았다.
- **GitHub Actions 리뷰 수집 dry_run 트리거** — 12.3 에서 멈춰서 못 갔다.
- **Vercel 환경변수 수정·프로젝트 정리** — 정본을 고르고 나머지를 지우는
  건 되돌리기 어렵고, 어느 쪽을 남길지가 사람 판단이다.

---

## §13. 정본 Vercel 프로젝트 전환 (2026-08-31)

§12.3 의 후속. **정본을 `solutionarchive-app` → `solutionarch` 로 옮겼다.**
안 도는 쪽을 살리는 것보다 이미 도는 쪽을 승격하는 게 실패 지점이 적다는
판단이다.

### 13.1 승격 전 확인 3건

| 확인 | 결과 |
|---|---|
| 배포 코드가 최신인가 | 프로덕션 sha `2460791` = `origin/main` HEAD (PR #10 반영). READY |
| Meta OAuth 콜백이 어디를 가리키나 | `https://solutionarch.vercel.app/api/threads/callback` 하나뿐 — 코드 기본값과 일치 |
| 프로덕션 환경변수 | `CRON_SECRET` ✅ / Supabase 2종 ✅ / Threads 토큰 ✅ / `THREADS_APP_ID`·`SECRET` ❌ → 사후 등록 |

두 번째는 사람이 Meta 콘솔에서 직접 확인했다(로그인 화면이라 대신 열지 않는다).

**Supabase 연결도 확인했다.** 로그의 `[match] 초안 3` 이 solutionarchive DB
(`qmgrfqjfxqhxuufrnkwf`)의 `posts` draft 3건과 일치한다 — MCP 가 보는
dothegy-os 가 아니라 올바른 프로젝트를 보고 있다.

**환경변수 확인은 대시보드가 아니라 라우트 응답으로 갈랐다.** 인증 헤더 없이
찌르면 `CRON_SECRET` 유무가 500/401 로 갈리고(`lib/cron-auth.ts` 가
fail-closed 라 성립), 콜백에 무효 code 를 주면 `THREADS_APP_ID/SECRET` 유무가
500/502 로 갈린다. 무효 code 는 토큰을 발급할 수 없고 교환 실패 시 DB 에 손대기
전에 리턴하므로 안전하다.

### 13.2 `THREADS_APP_ID/SECRET` 은 세 프로젝트 어디에도 없었다

Meta 콘솔에는 있었고 Vercel 로 옮겨지지 않은 상태였다. 최초 토큰은 배포가 아닌
경로로 받아 `scripts/threads-token-seed.mjs` 로 심은 것으로 보인다.

**돌고 있던 크론은 이 값과 무관하다.** 두 변수는 리포 전체에서
`app/api/threads/callback/route.ts` 한 곳에만 나온다. 매처·수집기는
`CRON_SECRET` + Supabase + DB 의 `api_tokens` 만 쓰고, 토큰 갱신은
`th_refresh_token` 그랜트라 client_secret 이 필요 없다.

영향받는 건 **재인증 경로 하나**다. 갱신이 60일 안에 한 번도 못 돌면 토큰이
만료되고 `th_refresh_token` 은 만료된 토큰을 못 되살린다. 그때 유일한 복구
수단이 콜백 라우트다. 현재 토큰 만료 `2026-10-25`(55일 남음).

그래서 `callback/route.ts` 의 "임시 파일 — 토큰 발급 완료 후 삭제할 것" 주석을
고쳤다. 몇 달간 안 불리는 파일이라 다음 세션이 "안 쓰이니 지워도 된다"고
읽기 쉽다. **상시 유지 대상이다.**

### 13.3 나머지 두 프로젝트 — Pause 함 (삭제 안 함)

`solutionarchive-app` 과 `solutionarchive` 를 Pause 했다. 확인:

```
solutionarchive-app.vercel.app  → 503 DEPLOYMENT_PAUSED
solutionarchive.vercel.app      → 503 DEPLOYMENT_PAUSED
solutionarch.vercel.app         → 401 (살아 있음)
```

**Pause 가 크론까지 멈춘다는 것을 실측으로 확인했다.** Pause 전에는 두 곳이
매 :00/:30 마다 500 을 찍었는데, Pause 후 08:00 틱에서 두 프로젝트 모두
호출 기록이 없다. 3중 발화가 1중이 됐다.

**아직 남은 것:** Settings → Cron Jobs 의 개별 비활성화와 Git 연결 해제는
API·MCP 로 되지 않아 못 했다(Vercel CLI 는 이 환경에서 미로그인). 대시보드에서
사람이 해야 한다. Pause 로 실행은 이미 멈췄으니 급하지는 않다.

### 13.4 승격 후 재확인 — 통과

`solutionarch` 08:01 틱:

```
08:01 GET /api/threads/match-posts 200
      [match] 초안 3 / 게시물 0 → 연결 0, 보류 3, 실패 0
```

### 13.5 🔴 Actions 워크플로는 아직 못 돌린다 — 이유가 둘이다

9단계(`nightly-review-collect.yml` dry_run)를 트리거하지 못했다.

**(1) 워크플로가 GitHub 에 등록돼 있지 않다.** `workflow_dispatch` 는 파일이
기본 브랜치에 있어야 잡힌다. 이 파일은 `feat/review-source-probe` 에만 있고,
API 로 직접 찔러도 404 다.

```
POST /actions/workflows/nightly-review-collect.yml/dispatches → 404 Not Found
```

같은 브랜치의 `review-source-probe.yml` 이 등록돼 있는 건 그쪽에 `on: push` 가
있어 실제로 돌았기 때문이다. 이건 `schedule` + `workflow_dispatch` 뿐이다.
**PR #11 이 main 에 들어가야 풀린다.**

**(2) 더 큰 문제 — 리포에 Actions 시크릿이 하나도 없다.**

```
GET /actions/secrets → total_count: 0
```

그래서 **PR #10 이 옮겨 놓은 야간 인사이트 루프가 이관 이후 두 번 다 실패했다.**

```
2026-08-29 21:35  Nightly Insight Loop  failure  25s
2026-08-30 21:52  Nightly Insight Loop  failure  31s
  → ❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정
```

`nightly-review-collect.yml` 도 같은 두 시크릿을 읽으므로, 머지만 해서는
똑같이 실패한다. **시크릿 등록이 선행 조건이다.**

§7.2 가 또 맞았다 — Vercel 크론을 Actions 로 옮긴 것 자체는 성공했고
워크플로도 "정상적으로" 등록·발화했다. 25초 만에 죽는다는 것만 아무도 안 봤다.

### 13.6 로컬 dry-run 으로 대신 확인한 것

Actions 를 못 돌리는 대신 같은 스크립트를 로컬에서 돌렸다. 워크플로가 하는
일과 동일하다(`--dry` + `--source=danawa` + `--targets=10`).

```
## 리뷰 수집 (dry-run — 적재하지 않음)
- 소스 danawa · 1.3초 · 타깃 0개 · 요청 0건
- 파싱 0건(실패 0) · 신규 0건 · 폴백키 0건 · robots 회피 0건
```

**타깃 0개가 예상된 정상값이다**(7단계 상품 매핑 전). 종료코드 0,
`review_sources.health = ok`, `review_collection_runs` 0행(dry-run 은 쓰지
않는다) 확인.

부수 소득: `lib/review/store.ts` 와 러너가 **실제 DB 에 대고 처음 돌았다**.
§11 의 미검증 항목 중 읽기 경로는 이걸로 해소됐다. 쓰기 경로(UNIQUE 위반이
정말 `23505` 로 오는지)는 여전히 첫 실수집에서 확인된다.

---

## §13.7 야간루프 실패 원인 재판정 (2026-09-01)

§13.5 는 야간 인사이트 루프가 죽는 원인을 **Actions 시크릿 0개**로 적었다.
시크릿을 넣은 뒤 다시 돌려 보니 **그게 유일한 원인이 아니었다.**

### 무엇이 달라졌나

시크릿 2종(`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`)은
2026-08-31 08:11 에 등록됐다. 그런데 같은 날 23:09 스케줄 실행
(run `33449485292`)이 **또 실패했다.**

시크릿은 정상 주입됐다. 잡 환경에 `***` 로 마스킹돼 찍혔고, 무엇보다
**PostgREST 가 실제 응답을 돌려줬다** — 연결 실패가 아니라 스키마 조회
실패다. 즉 인증·네트워크 계층은 이미 통과했다.

```
❌ analyze  — pending 조회 실패: Could not find the table 'public.saved_examples'
❌ measure  — 패턴 조회 실패:   Could not find the table 'public.insight_patterns'
❌ reflect  — 패턴 전체 조회 실패: (동일)
⚠️ 실행 로그 기록 실패:          public.insight_loop_runs 없음
✅ ingest    건너뜀 — Notion 미설정(정상)
✅ patternize 건너뜀 — 신규 분석 없음
```

### 진짜 원인 — 인사이트 마이그레이션 001/002 가 미적용이다

`supabase db query --linked` 로 실측했다(§12.1 과 같은 경로, MCP 아님).
public 스키마 17개 테이블 전량:

```
analysis_angles analysis_aspects analysis_inputs analysis_projects api_tokens
benchmarks channels content_items hypotheses learnings metric_snapshots
post_performance posts review_collection_runs review_fingerprints
review_sources review_targets
```

`saved_examples` / `insight_patterns` / `insight_loop_runs` **셋 다 없다.**

```
supabase/migrations/20260829000001_saved_examples.sql    ← 미적용
supabase/migrations/20260829000002_insight_patterns.sql  ← 미적용
```

§12.1 에서 리뷰 수집 003/004 가 "이미 적용돼 있었다"를 확인했을 때, **같은
자리에 있던 001/002 는 확인하지 않았다.** 003/004 만 조회했고 그게 있으니
같은 배치의 나머지도 있으리라 가정했다. §7.1 의 변형이다 — 확인하지 않은
것을 확인한 것 옆에 두었다는 이유로 양성으로 접었다.

### 2단계 검증의 선행 조건이 셋으로 늘었다

`lib/insight/loop.ts:151` 의 `analyze` 는 `saved_examples` 의 `pending` 행을
순회하면서만 LLM 을 부른다. 따라서 "LLM 분석 단계까지 실제로 돈다"를 보려면:

1. `CLAUDE_CODE_OAUTH_TOKEN` 등록 (여전히 미등록 — `gh secret list` 2종뿐)
2. 마이그레이션 001/002 적용 (사람이 대시보드에서. 인수인계서 §5① )
3. `saved_examples` 에 `analysis_status='pending'` 행 최소 1건

**3번이 새로 드러난 함정이다.** 0건이면 루프는 LLM 을 한 번도 부르지 않고
`analyzed 0` 으로 **성공 종료한다.** 초록불을 "헤드리스 경로 검증됨"으로
읽으면 §7.1 사례가 하나 더 늘어난다. 헤드리스 자체의 판정은 DB 와 무관한
`insight-headless-probe.yml` 로 따로 받는 게 맞다(인수인계서 §5③).

### 부수 확인 — §13.3 의 잔여 작업은 해소됐다

§13.3 이 "API·MCP 로 안 돼 못 했다"고 남긴 Git 연결 해제가 되어 있다.
Vercel API 상 `solutionarchive` / `solutionarchive-app` 둘 다 `link: null`,
`solutionarch` 만 `github:hanazi8282-maker/solutionarchive-app` 로 물려 있다.
HTTP 실측도 그대로다 — 503 / 503 / 401.

---

## §13.8 2-a 헤드리스 프로브 기준선 (2026-09-01)

2단계(야간루프 전체 검증)를 둘로 갈랐다.

- **2-a** — `insight-headless-probe.yml`. DB 와 무관하게 `claude -p` 추론만 판정
- **2-b** — `saved_examples` 에 시드를 넣고 `nightly-insight-loop` dry-run

가른 이유는 §13.7 ③ 이다. 마이그레이션을 적용해도 `saved_examples` 가 비어
있으면 `analyze` 는 LLM 을 한 번도 안 부르고 성공으로 끝난다. 두 검증을
한 실행에 섞으면 그 초록불이 무엇을 뜻하는지 갈라낼 수 없다.

### 기준선 실행 — 토큰 없을 때의 출력을 먼저 박아둔다

토큰 등록 **전에** 한 번 돌렸다(run `33475956778`, `workflow_dispatch`, main).
"토큰이 들어오면 무엇이 달라져야 하는가"를 사후에 정하지 않기 위해서다.

```
러너: linux/x64 · Node v24.19.0 · egress 172.184.214.214
- ❌ `env`      — 토큰 없음 — 리포 시크릿에 CLAUDE_CODE_OAUTH_TOKEN 을 넣어야 한다
- ✅ `binary`   — bundled · 204.4MB · 확보 0ms
- ✅ `version`  — 2.1.251 (Claude Code) · 14ms
- ❌ `headless` — 토큰 없음 — 시도 안 함(판정 보류)
### 판정: **inconclusive**
```

`binary` 가 `bundled · 0ms` 인 것은 §4 의 `CLAUDE_CLI_PATH` 분기가 러너에서
계속 먹고 있다는 뜻이다(214MB 재다운로드 없음).

### ⚠️ 이 워크플로의 conclusion 은 판정이 아니다

`scripts/insight-headless-probe.mjs` 는 **종료 코드가 항상 0** 이다. 판정을
보고하는 게 목적이고 "안 된다"도 유효한 판정이라, 실패로 붉히지 않는 설계다.
그래서 이 실행도 `conclusion: success` 로 끝났다 — **아무것도 검증되지 않은
채로.**

§7.1 의 교과서적 형태이고, 스크립트 자신은 정직하다(단계별 ❌ 와 판정 문자열을
남긴다). 위험한 건 **읽는 쪽**이다. 이 워크플로를 볼 때는 conclusion 이 아니라
잡 요약의 `### 판정:` 줄을 읽는다. 초록불을 근거로 쓰지 마라.

### 통과 기준 — 미리 못박는다

토큰 등록 후 재실행에서 **셋이 동시에** 바뀌어야 통과다.

- `env` → ✅ (`CLAUDE_CODE_OAUTH_TOKEN 주입됨 (N자)`)
- `headless` → ✅ (`추론 정상`, 응답에 `42` 포함)
- 판정 → **`viable`**

프롬프트가 `6 times 7` 인 이유도 같은 규약이다 — 모델이 무슨 말이든 뱉으면
"돌았다"고 읽히지 않도록, 정답이 하나뿐인 것을 묻고 문자열까지 대조한다.
`exit 0` 인데 응답이 예상 밖이면 `viable` 이 아니라 `inconclusive` 다.

### 2-b 시드 설계 — 초안 3건, 그중 2건은 수렴 시험 쌍

`posts` 의 draft 3건을 쓴다(로그의 `[match] 초안 3` 과 같은 행).

| 초안 | 코드 | 가설 | 성격 |
|---|---|---|---|
| `be0bd0da` | T1-3 | H1 | 기저귀 리뷰·아기 — 훅 A |
| `68e9bab7` | T1-3 | H1 | 같은 주제, 훅 B ← **수렴 시험 쌍** |
| `2e067d2f` | T3-5 | H5 | 리서치 자동화 환각 |

앞의 둘은 주제·가설이 같고 훅만 다르다. 여기서 **같은 `pattern_key` 가 나오는지**
가 인수인계서 리스크 6(키가 안 뭉치면 근거가 1에서 안 올라가고 아무것도
반영되지 않는다)의 직접 시험이다. `patternize` 요약이 `new: [key...]` 를 그대로
출력하므로 dry-run 만으로 눈에 보인다.

**dry-run 이 2-b 에 성립하는 근거 2개** (`lib/insight/loop.ts` 실측):

- `extractInsight` 호출이 `dryRun` 가드 **밖**이다(:166). dry-run 이어도 LLM 은
  실제로 불린다. 건너뛰는 건 DB 쓰기뿐이다.
- 시드 행은 `analyzed` 로 안 바뀐다(:173). `pending` 으로 남아 몇 번이든
  재실행할 수 있다. `insight_loop_runs` 기록도 안 남는다(:452).

시드/정리 SQL 은 `notion_page_id` 접두사 `verify-2b-` 로 표시한다. 진짜 저장 글이
아니라 검증 부산물이므로 판정 후 한 줄로 지운다. 실제 저장 글은 7단계 이후
인박스가 돌기 시작하면 자연히 쌓인다.

---

## §13.9 2단계 통과 — 야간 인사이트 루프 전 단계 검증 (2026-09-01)

### 2-a — 헤드리스 판정 `viable`

토큰 등록 후 재실행(run `33477777051`). §13.8 이 미리 못박은 통과 기준 셋이
전부 바뀌었다.

```
- ✅ `env`      — CLAUDE_CODE_OAUTH_TOKEN 주입됨 (108자)
- ✅ `binary`   — bundled · 204.4MB · 확보 0ms
- ✅ `version`  — 2.1.251 (Claude Code) · 13ms
- ✅ `headless` — 추론 정상 · 2786ms · 응답 "42"
### 판정: **viable**
```

**인수인계서 §4 의 "❌ `claude -p` 실제 추론"이 해소됐다.** 이 파이프라인의
유일한 미검증 전제였다. `ANTHROPIC_API_KEY` 과금 경로는 필요 없다.

### 마이그레이션 001/002 — 이름이 아니라 제약까지 확인했다

테이블 3종이 생긴 것만으로 "적용됨"으로 접지 않았다(§7.1). 실측:

- 제약 14종 — `saved_examples` 4 / `insight_patterns` 6 / `insight_loop_runs` 2
- `trg_guard_hypothesis_promotion` 트리거 — 인수인계서 §3④ 의 표본 가드
- `hypotheses.source` 컬럼 — 사람 가설과 자동 가설을 status 가 아닌 출처로 가른다

### 2-b — 초안 3건 시드 → dry-run, 전 단계 정상

run `33478234560` (브랜치 ref, 아래 사유). 요약 전문:

```
- 결과: 전 단계 정상 · 67.8초 · provider=claude-cli · trigger=manual
- 집계: 수집 0 / 분석 3 / 패턴 3 / 승격 0 / 기각 0
- ✅ ingest     건너뜀 — Notion 미설정
- ✅ analyze    (64735ms) 선택 3 / 성공 3 / 실패 0 / 일반화가능 3
- ✅ patternize (2091ms)  신규 3 / 보강 0 / 신규가설 없음
- ✅ measure    건너뜀 — 반영된 패턴 없음
- ✅ reflect    렌더 530B / 활성패턴 0
```

**LLM 이 실제로 불렸다.** analyze 가 64.7초를 썼고 3건 모두 구조 추출에
성공했다. §13.8 이 근거로 든 `extractInsight` 가 `dryRun` 가드 밖이라는
읽기가 실행으로 확인됐다.

**dry-run 이 아무것도 안 쓴다는 것도 실측했다.** 실행 후 `saved_examples`
3행은 여전히 `pending` 이었고 `insight_patterns` 는 0행이었다.

### 🔴 리스크 6 이 첫 실측 증거를 남겼다 — key 가 수렴하지 않는다

시드 3건 중 둘(`be0bd0da` / `68e9bab7`)은 **주제·가설(H1)·콘텐츠코드(T1-3)가
같고 훅만 다른 쌍**이다. 같은 패턴으로 뭉쳐야 한다. 나온 key 는 셋 다 다르다.

```
- `specific-anomaly-to-universal-question`
- `anomaly-confession-question`
- `confession-then-reframe`
```

앞의 둘이 그 쌍으로 보인다(셋째 `confession-then-reframe` 은 "솔직히
말하면"으로 시작하는 `2e067d2f` 와 맞물린다). 확정은 아니다 — 요약은 key 를
분석 순서대로만 찍고 어느 행에서 나왔는지는 안 남긴다.

**영향이 크다.** `patternize` 는 같은 `pattern_key` 로 근거가 **2건** 모여야
가설을 발급한다. key 가 매번 갈라지면 `evidence_count` 가 1에서 안 올라가고,
가설이 안 나오고, `measure` 가 볼 게 없고, `reflect` 가 렌더할 활성 패턴이
없다. 이번 실행의 "신규가설 없음 / 반영된 패턴 없음 / 활성패턴 0" 이 정확히
그 모습이다. **에러 없이 루프만 안 도는 형태** — 인수인계서 §3③ 이 경계한 것과
같은 계열이다.

표본 2건·1회 실행이므로 확정된 결함으로 적지 않는다. 다만 "며칠 돌린 뒤
`insight_patterns` 를 열어 보라"(리스크 6)를 기다릴 것 없이 **지금 첫 신호가
나왔다.** 실수집 전에 볼 것:

- key 를 LLM 자유 생성에 맡길지, 후보 집합에서 고르게 할지
- `normalizePatternKey`(`lib/insight/llm.ts:57`)가 어디까지 정규화하는지
- 어느 행에서 어느 key 가 나왔는지 요약에 남길지

### 부수 수정 — 요약이 판단 근거를 버리고 있었다

첫 dry-run(run `33477897473`, main ref)은 **3건 중 1건 실패**였는데
요약에 `실패 1` 만 찍혔다. 사유가 어디에도 없다 — `analyze` 는 `failures`
배열을 만들지만 `summarizeDetail`(`scripts/insight-loop.mjs:130`)이 개수만
렌더링하고 버렸고, dry-run 은 행을 `failed` 로 못박지 않아 DB 에도 안 남는다.
`patternize` 의 key 문자열도 같이 버려지고 있었다.

**실패를 셀 수만 있고 판단할 수 없는 상태**라 §7.1 위반이다. 고쳤다
(`11bafac`) — `analyze` 는 실패 사유를, `patternize` 는 실제 key 를 요약에
남긴다. 위 §13.9 의 key 목록이 이 수정으로 처음 보인 것이다.

재실행은 3/3 성공이라 그 1건은 일시적 실패였다. **사유는 영영 모른다** —
바로 그게 이 수정을 한 이유다.

⚠️ 이 커밋은 `feat/review-source-probe` 에 올라갔다. **PR #11 의 범위가
리뷰 수집 프로브 + 이 수정으로 늘었다.** 머지 전에 알고 있을 것.

### 브랜치 ref 로 돌린 이유

수정본을 검증하려면 그 코드가 도는 실행이 필요한데, main 머지는 3단계
승인 사항이다. `nightly-insight-loop.yml` 이 브랜치에도 있고 브랜치가
`origin/main`(`2460791`)을 포함하므로 `--ref feat/review-source-probe` 로
머지 없이 돌렸다.

### 시드 정리함 — 스케줄 실행은 dry-run 이 아니다

워크플로의 `--dry` 는 `workflow_dispatch` + `inputs.dry_run` 일 때만 붙는다.
**`schedule` 실행에는 안 붙는다.** 시드를 두면 오늘 밤 04:00 크론이 검증용
행을 실제 데이터로 분석해 `insight_patterns` 에 테스트 패턴을 쓴다.

검증이 끝난 즉시 지웠다(`verify-2b-%` 3행). 확인: `saved_examples` 0행,
`insight_patterns` 0행. 재현이 필요하면 시드 SQL 한 줄로 다시 넣는다.

---

## §13.10 3~5단계 — 머지, 9단계 재시도, 상품 후보 목록 (2026-09-01)

### 3단계 — PR #11 머지 (`6f46110`)

squash 머지. #7~#10 과 같은 방식이다. 머지 후 발화한 것은 `Build Check`
(push/main) 하나뿐이고 `success`. `Review Source Probe` 는 브랜치 필터가
정상 동작해 발화하지 않았고, `Nightly Insight Loop` 도 조용했다.

**`Nightly Review Collect` 가 워크플로 목록에 등록됐다.** §13.5 (1) 의 404
원인이 이걸로 해소됐다.

⚠️ 이 PR 은 원래 범위(리뷰 수집 소스 프로브)에 §13.9 의 요약 렌더러 수정이
얹혀 머지됐다. 이력을 볼 때 알고 있을 것.

### 4단계 — `nightly-review-collect.yml` dry_run 트리거 성공

run `33518435577`, `workflow_dispatch`, conclusion `success`. 404 없다.

```
- 소스 `danawa` · 2.1초 · 타깃 0개 · 요청 0건
- 파싱 0건(실패 0) · 신규 0건 · 폴백키 0건 · robots 회피 0건
```

§13.6 의 로컬 dry-run 과 같은 결과다. `review_collection_runs` 0행 /
`review_targets` 0행 — dry-run 이 쓰지 않는 것도 확인했다.

**이 실행이 검증한 것과 안 한 것을 갈라 적는다(§7.1).**

- 검증됨 — 워크플로 등록, 시크릿 주입, DB 읽기 경로, 종료코드 0,
  타깃 0개가 7단계 전의 예상된 정상값이라는 것
- **검증 안 됨 — 다나와에 요청을 한 번도 보내지 않았다.** 수집기·파서가
  실제 소스에 대해 동작하는지는 그대로 미검증이다. 첫 실수집에서 확인된다

`review_sources.health = ok` 이지만 **`health_checked_at` 이 null 이다.**
측정된 ok 가 아니라 시드 기본값이고, 헬스체크는 아직 한 번도 안 돌았다.
"health 가 ok" 를 소스가 건강하다는 근거로 쓰면 안 된다.

### 5단계 — 다나와 상품 후보 (매핑하지 않음)

`review_targets.product_ref` 는 다나와 `prodCode`(=pcode)다
(`lib/review/adapters/danawa.ts:175`). 그래서 후보 목록은 **pcode + 리뷰 수**
여야 쓸모가 있다.

**robots 를 먼저 읽었다**(§7.1 — 못 읽으면 "허용"이 아니라 "판단 불가").

- `search.danawa.com` — `/dsearch.php` 는 Disallow 목록 밖 = 허용.
  **`Crawl-delay: 10`** 이라 요청 간 10초를 지켰다
- `prod.danawa.com` — Disallow 는 `/api/` `/bridge/` `/community/`
  `/list/ajax/` `/info/ajax/`. 어댑터가 쓰는
  `/info/dpg/ajax/companyProductReview.ajax.php` 는 **이 목록 밖**이라 허용

리뷰 수는 `click_log_prod_review_count` 블록의 `text__number` 를 썼다.
같은 카드에 있는 `의견`(`click_log_prod_content_count`)은 다나와 커뮤니티
의견이라 **다른 값**이다. 수집기가 긁는 `companyProductReview` 와 같은
계열은 앞쪽이다.

#### 탈모샴푸 — 4개 프로젝트 전부 후보 있음

- `3f38dd36` 라보에이치 — **363건** ★4.9 `18753650` 두피강화 샴푸 700ml /
  208건 `16466570` 퍼퓸에디션 400ml / 80건 `121926565` 두피쿨링&노세범 400ml
- `ce069cb2` 려 자양윤모 — **915건** ★4.9 `69828059` 제주산들바람 585ml /
  247건 `14071175` 9EX 중건성 400ml / 171건 `14072210` 9EX 민감성 400ml
- `94b55865` 올뉴 TS — **880건** ★4.6 `7701778` 비디샴푸 500g /
  602건 `5922857` 올뉴 플러스 TS 500g / 361건 `17459990` 뉴TS 쿨 500g
- `e69c8412` 닥터포헤어 — **590건** ★4.7 `78236996` 폴리젠 실크 500ml+70ml /
  429건 `8594474` 폴리젠 500ml / **288건 `119095215` 폴리젠 씨크닝 500ml**
  (프로젝트가 지목한 바로 그 제품)

#### 유산균 — 2개는 후보 있음, 2개는 막힘

- `d404afa9` 락토핏 골드 — **515건** ★4.7 `18768167` 5X 골드 50포 3개입 /
  100건 `61827344` 골드 2g 90포 / 65건 `29207378` 골드 2g 120포
- `39caee12` 비에날씬 BNR17 — 첫 쿼리("비에날씬 프로 BNR17")는 리뷰수 붙은
  후보 0건이었고, "비에날씬" 으로 줄이자 나왔다. **551건** ★4.8 `89523488`
  슬림+ 2g 14포 / 451건 `66034148` 프로틴 40g 14포 / 422건 `10622796`
  플러스 30포
- 🔴 `4fc8e9c7` 듀오락 골드 하루한포 — **본체를 못 찾았다.** "듀오락 골드"는
  `20198603` 골드 캡슐 30캡슐(리뷰 2건)뿐이고, "듀오락 하루한포"는 상품 0건,
  브랜드 검색은 어린이 유산균·초코볼 등 다른 라인만 나온다
- 🔴 `4fcea3ff` — **프로젝트에 상품이 지정돼 있지 않다.** pitch 가 "유산균
  카테고리 경쟁 분석"이고 `competitor_url` 은 올리브영 `A000000179239` 다.
  이게 어느 제품인지는 사람이 정해야 한다. 참고로 카테고리 상위는
  883건 `14182205` 퍼펙토 모유유산균 30포 / 793건 `15130517` 셀렉스 썬화이버

#### 무선이어폰 — 1개만 후보 있음, 2개는 다나와에 본체가 없다

- `659642c8` 소니 WF-1000XM5 — **85건** ★4.9 `27250154` SONY WF-1000XM5.
  검색 1위는 584건짜리 `8594714` WF-1000XM3 인데 **세대가 다르다.**
  리뷰 수만 보고 고르면 엉뚱한 제품이 잡힌다
- `55d574a2` QCY 멜로버즈 프로 — **474건** ★4.6 `71645780` QCY MeloBuds Pro
  HT08. 프로젝트 라벨은 "플러스"인데 다나와 등재명에는 플러스가 없다.
  같은 물건인지 확인이 필요하다
- 🔴 `f966b3e9` 에어팟 프로 3 — **다나와에 본체가 없다.** 쿼리 3종
  ("에어팟 프로 3" / "에어팟 프로 3세대" / "AirPods Pro 3") 전부
  `15463181` 에어팟3(프로 아님)와 케이스·충전기만 나온다
- 🔴 `9f12cebe` 갤럭시 버즈3 프로 — **본체를 못 찾았다.** 쿼리 3종
  전부 1위가 681건짜리 `106702613` 갤럭시 **버즈4**(다른 제품)이고 나머지는
  전부 케이스·이어팁이다

### 🔴 §7.1 사례가 하나 더 나왔다 — 모델명 검색이 타이어를 반환했다

갤럭시 버즈3 프로를 모델명으로 찾으려고 `SM-R630` 을 검색했다. 응답 지표가
전부 정상이다.

```
HTTP 200 · 1,793,655B · queryEchoed=true · 상품 25개 · 리뷰수있음 13개
```

내용은 **금호타이어 솔루스 TA31 205/60R16** 외 타이어 목록이다. `R630` 이
타이어 규격 표기와 맞물린 것으로 보인다.

"200 이고, 쿼리가 제목에 반영됐고, 상품이 25개 파싱됐고, 리뷰 수도 붙어
있다" — 자동 검사가 볼 수 있는 표지가 전부 양성이다. **틀렸다는 것은 상품명을
사람이 읽어야만 안다.** §7.1 의 "상태 코드로 성공을 판정하지 마라"보다 한 겹
더 안쪽 사례다. 표지를 늘려도 안 잡힌다.

7단계 매핑을 이름 검색 자동화로 하면 안 되는 이유가 이것이다. **pcode 는
사람이 상품 페이지를 열어 확인하고 넣어야 한다.**

### 정리 — 12개 중 9개는 후보 확보, 3개는 막힘, 1개는 상품 미지정

매핑은 하지 않았다(7단계는 사람이 상품을 고르는 단계다). 다음에 정할 것:

- 듀오락 골드 하루한포 / 에어팟 프로 3 / 갤럭시 버즈3 프로 — 다나와에 본체가
  없다. 프로젝트를 다른 제품으로 바꿀지, 이 셋은 수집 대상에서 뺄지
- `4fcea3ff` 는 상품 자체가 미지정이다. 올리브영 `A000000179239` 가 무엇인지
  먼저 확인해야 한다
- 소니는 세대(XM5 vs XM3), QCY 는 "플러스" 유무를 사람이 대조할 것

---

## §13.11 리스크 6 근본원인 판정 — 설계 결함이다 (2026-09-02)

§13.9 가 "키가 셋 다 달랐다"는 관측을 남겼다. 이건 그 원인 판정이다.

### 관측 — 세 키 전문

run `33478234560` 의 `patternize` 출력 그대로다.

```
- `specific-anomaly-to-universal-question`
- `anomaly-confession-question`
- `confession-then-reframe`
```

### 쌍은 다른 키다 — 추정이 아니라 확정

`be0bd0da` / `68e9bab7` 쌍이 같은 키인지 물으면 답은 **다르다**이고, 이건
어느 키가 어느 행에서 나왔는지 몰라도 확정된다.

dry-run 에서 `patternize` 는 `insight_patterns` 를 조회하지만 DB 가 비어
있어 `existing` 이 항상 null 이고, 분석된 행마다 `newPatterns.push(a.key)`
를 한 뒤 `continue` 한다. **즉 `new` 배열은 행당 정확히 한 항목이고, 두 행이
같은 키를 냈다면 같은 문자열이 두 번 찍힌다.** 3행에서 서로 다른 3개가
나왔으므로 어떤 두 행도 키를 공유하지 않는다.

어느 키가 어느 행인지는 **측정되지 않았다.** 요약이 행 식별자를 안 남긴다.
내용상 `confession-then-reframe` 이 "솔직히 말하면"으로 시작하는
`2e067d2f`(H5)와 맞물리고 나머지 둘이 H1 쌍으로 보이지만, 이건 추론이다.
확정하려면 요약에 행 id 를 같이 남겨야 한다.

### 판정 — "훅까지 반영하는 설계"가 아니라, 수렴할 수 없는 구조다

프롬프트(`lib/insight/llm.ts:70` `buildPrompt`)가 `pattern_key` 에 요구하는
것은 이게 전부다.

```
"pattern_key": "영문 소문자 하이픈 slug (예: confession-then-data)"
```

**어휘 목록도, 기존 키 목록도, 재사용 지시도 없다.** 예시 하나뿐이다.
그리고 `extractInsight` 가 받는 것은 `rawText` / `sourceUrl` / `userNote`
셋뿐이다(`ExtractionInput`). **이미 만들어진 키를 모델에게 보여주지 않는다.**
글 하나마다 독립적으로 새 slug 를 창작한다.

한편 `normalizePatternKey`(:57)는 소문자화·특수문자 제거·하이픈 정리·60자
절단만 한다. **의미 정규화가 없다.** `anomaly-confession-question` 과
`specific-anomaly-to-universal-question` 을 하나로 합칠 수단이 없다.

받는 쪽은 정반대다. `patternize` 는 **완전 문자열 일치**로 근거를 누적한다.

```
.eq('pattern_key', a.key)      // lib/insight/loop.ts:239
```

**자유 생성 + 완전 일치 = 우연이 아니면 근거가 안 쌓인다.** 두 독립 호출이
바이트 단위로 같은 slug 를 낼 확률에 파이프라인 전체가 걸려 있다.

그래서 "훅 유형까지 반영하는 의도된 동작인가"의 답은 **아니다**에 가깝다.
훅 단위 granularity 가 의도였다 해도 이 구조는 여전히 실패한다 — 같은 훅
유형을 두 번 묘사해도 표현이 갈리면 다른 키가 된다. 실제로 쌍의 두 키는
**구조가 달라서가 아니라 같은 구조를 다른 말로 적어서** 갈렸다(둘 다
anomaly→question 이다).

### 이게 왜 조용한 고장인가

`patternize` 는 근거 **2건**에서 가설을 발급한다. 키가 매번 갈리면
`evidence_count` 가 1에서 안 올라가고 → 가설 없음 → `measure` 볼 것 없음 →
`reflect` 활성 패턴 0. 이번 실행의 "신규가설 없음 / 반영된 패턴 없음 /
활성패턴 0" 이 정확히 그 연쇄다. **에러는 하나도 안 난다.** 인수인계서 §3③
이 경계한 "에러 없이 루프만 끊기는" 형태와 같은 계열이다.

### 증거 강도 — 구분해서 적는다

- **구조적 근거는 표본과 무관하다.** 자유 생성·키 미제공·의미 정규화 부재·
  완전 일치, 이 넷은 코드를 읽으면 나온다. 여기에 기대 수렴률은 없다
- **실측은 1회·3건뿐이다.** 이 실행은 그 구조가 실제로 갈린다는 첫 확인이지,
  갈릴 확률의 측정이 아니다

### 고칠 방향 (결정 전)

- 기존 `insight_patterns.pattern_key` 목록을 프롬프트에 넣고 "맞는 게 있으면
  그걸 쓰고, 없을 때만 새로 만들라"로 바꾼다 — 가장 작은 변경
- 키를 자유 생성 대신 **후보 집합에서 고르게** 한다. 대신 새 패턴을 못 만든다
- 완전 일치 대신 임베딩/유사도로 뭉친다 — 가장 크고, 잘못 뭉칠 위험이 있다
- 어느 쪽이든 **요약에 행 id ↔ 키를 같이 남기는 것이 선행**이다. 지금은
  수렴 여부를 사후에 확인할 방법이 없다

### 검증 시드 정리 — 완료 확인

`verify-2b-` 3행은 §13.9 시점에 이미 지웠다(스케줄 실행에 `--dry` 가 안 붙어
오늘 밤 크론이 검증용 행을 실데이터로 반영하기 때문). 재확인:

```
saved_examples 0 · verify_seeds 0 · insight_patterns 0 · insight_loop_runs 0
```

dry-run 이 아무것도 쓰지 않았다는 것도 이 0 들로 다시 확인된다.

---

## §13.12 리스크 6 수정 — 기존 키를 프롬프트에 제공 (2026-09-02)

§13.11 의 판정("자유 생성 + 완전 일치 = 우연이 아니면 안 쌓인다")에 대한
수정과 검증 기록. 브랜치 `fix/pattern-key-convergence`.

`normalizePatternKey` 에 의미 정규화를 넣는 방향은 **기각했다** — 다나와
`identity_key` 에서 겪은 것과 같은 함정이다. 느슨하면 다른 게 뭉개지고
엄격하면 같은 게 안 뭉친다. 이미 있는 LLM 판단력을 재사용하는 게 단순하다.

### 무엇을 바꿨나

- `ExtractionInput.knownKeys` 신설. 프롬프트에 기존 key 목록을 싣고
  "같으면 문자 그대로 다시 쓰라"고 지시한다. 목록이 비면 블록 자체를
  넣지 않는다 — 빈 목록은 "고를 게 없다"가 아니라 "아무거나"로 읽힌다
- **같은 배치에서 방금 만들어진 key 도 뒤 글이 본다.** DB 것만 넘기면
  첫 배치(DB 가 빈 상태)에서는 서로를 못 보고 그대로 갈린다
- 기존 키 조회 실패를 빈 목록으로 흡수하지 않고 실패로 올린다(§7.1).
  흡수하면 "수렴이 안 되는" 실행이 정상처럼 보인다
- 프롬프트에 싣는 키는 근거 많은 순 60개(`KNOWN_KEY_LIMIT`)로 자른다
- 요약에 **행 ↔ key 대응**과 제공된 기존 key 개수를 남긴다

### 1차 시도 — 과수렴으로 실패했다

run `33526672164`. H1 쌍은 뭉쳤는데 **세 글이 전부 한 key 로 붙었다.**

```
be0bd0da → paradox-confession-question
68e9bab7 → paradox-confession-question
2e067d2f → paradox-confession-question   ← 붙으면 안 되는 글
```

`posts` 의 구조 메타데이터가 정답을 갖고 있어 대조할 수 있었다.

| 행 | hook_type | closing_type | 가설 |
|---|---|---|---|
| be0bd0da | 반전형 | 열린질문 | H1 |
| 68e9bab7 | 선언형 | 열린질문 | H1 |
| 2e067d2f | 고백형 | **미해결예고** | H5 |

3번은 마무리 형태가 다르다. 내가 넣은 규칙("전개 순서와 마무리 형태가
같으면 같은 패턴") 기준으로도 갈렸어야 한다. 결정적으로 부여된 이름이
`...-question` 인데 **그 글은 질문으로 닫지 않는다** — 이름이 사실과
어긋났다.

원인은 규칙을 한 방향으로만 적은 것이다. **재사용 허용만 쓰고 분리 조건을
안 썼다.** 후보가 하나뿐일 때 모델이 끼워 맞춘다.

### 2차 시도 — 통과

규칙을 양방향으로 바꿨다. 전개 순서 + 마무리 형태 **두 축이 모두** 같을
때만 재사용, 하나라도 다르면 반드시 새 key, 목록이 짧다고 끼워 맞추지 말
것, key 이름에 마무리 형태를 드러낼 것.

run `33527045636`, `success`, 113.1초.

```
- ✅ analyze (110514ms) 선택 3 / 성공 3 / 실패 0 / 일반화가능 3
  - 기존 key 0개를 프롬프트에 제공
  - verify-2b-be0bd0da... → `anomaly-then-reframe`
  - verify-2b-68e9bab7... → `anomaly-then-reframe`
  - verify-2b-2e067d2f... → `anomaly-reframe-then-teaser`
```

- **H1 쌍(훅만 다름)이 같은 key 로 뭉쳤다** — 수정의 목표
- **H5(마무리가 미해결예고)는 다른 key 로 갈렸다** — 과수렴 아님
- 이름이 정답과 맞물린다. `-then-teaser` 가 `closing_type = 미해결예고`
  에 대응한다. 우연히 갈린 게 아니라 **의도한 축으로** 갈렸다는 신호다

`patternize` 가 여전히 "신규 3 / 보강 0"인 것은 dry-run 이라 아무것도
쓰지 않아 `existing` 이 항상 null 이기 때문이다. 실제 실행에서는 1번이
insert 되고 2번이 **보강**으로 잡혀 `evidence_count` 가 2에 닿는다.

### 아직 검증 안 된 것 — 정직하게

- **DB 에서 키를 읽어 오는 경로는 안 돌아봤다.** 이번 두 실행 모두
  `기존 key 0개` 였다. 수렴은 전부 배치 내 누적으로 일어났다. 같은 Set·
  같은 프롬프트를 타므로 위험은 낮지만, `insight_patterns` 가 비어 있지
  않을 때의 동작은 아직 실측이 아니다
- **표본 3건·1회다.** LLM 은 결정적이지 않다. 구조는 고쳐졌지만 매 실행
  같은 key 가 나온다는 보장은 아니다. 며칠 뒤 `insight_patterns` 를 열어
  key 가 실제로 뭉치는지 보는 일(리스크 6 원문)은 여전히 필요하다
- `KNOWN_KEY_LIMIT = 60` 절단이 실제로 걸리는 상황은 패턴이 60개 넘게
  쌓인 뒤라 한참 뒤에나 확인된다

### 검증 시드 정리

`verify-2b-` 3행 삭제 확인: `saved_examples` 0 · `insight_patterns` 0 ·
`insight_loop_runs` 0. 스케줄 실행에는 `--dry` 가 안 붙으므로 오늘 밤
크론 전에 지우는 것이 전제다.

---

## §13.13 정정 — "다나와에 본체가 없다"는 틀렸다 (2026-09-02)

§13.10 이 에어팟 프로 3 과 갤럭시 버즈3 프로를 **"다나와에 본체가 없다"**
로 적었다. 틀렸다. 둘 다 등재돼 있다.

```
pcode=97405013  APPLE 에어팟 프로3 MFHP4KH/A          리뷰 수 없음
pcode=59537216  삼성전자 갤럭시 버즈3 프로 SM-R630N   리뷰 수 없음
```

### 왜 못 봤나 — 내 검사 방법이 정답을 가렸다

스캐너가 `reviews !== null` 로 거른 뒤 리뷰 수 상위 6개만 저장했다.
**리뷰가 없는 제품은 목록에서 통째로 사라진다.** 찾으려던 제품이 정확히
그 조건이었다.

그래서 "없다"라고 보고했는데 실제로는 **"내 정렬 기준에서 빠졌다"**였다.
§7.1 의 "비었을 때와 못 읽었을 때를 가르라"를 내가 어긴 형태다 — 0건과
"보이는데 필터가 뺐다"는 다른 사건인데 같은 결론으로 접었다.

결론(수집할 리뷰가 없다)은 같지만 원인이 다르고, 원인이 다르면 다음 수가
다르다. 미등재면 시간이 지나도 안 생기고, 등재됐는데 리뷰가 0이면 나중에
쌓일 수 있다.

### 브랜드 전체를 훑고 나온 진짜 그림

무선이어폰에서 **다나와 상품리뷰는 '프로' 라인에 거의 없고 보급형에 몰려
있다.**

애플 — 프로 계열은 전멸이다.

- `97405013` 에어팟 프로3 — 없음 / `28208783` 프로2 USB-C — 없음
- `17941787` 프로2 라이트닝 — 7건 / `15616310` 프로1 — 2건
- `15463181` **에어팟3 맥세이프 — 136건** / `18546173` 에어팟3 라이트닝 — 96건
- `65920895` 에어팟 맥스 USB-C — 135건 (오버이어)

삼성 — 프로만 비어 있다.

- `59537216` 버즈3 프로 — 없음 / `106702589` 버즈4 프로 — 없음
- `17641574` 버즈2 프로 — 16건
- `96987275` **버즈3 FE SM-R420 — 825건** ★4.8
- `106702613` 버즈4 SM-R540 — 681건
- `103414031` 버즈 코어 SM-R410 — 238건 / `28531961` 버즈 FE — 67건

이미 매핑 후보가 있는 둘은 이 왜곡의 반대편에 있다 —
`71645780` QCY MeloBuds Pro 474건, `8594714` 소니 XM3 584건
(단 `27250154` XM5 는 85건).

### 이게 뜻하는 것

플래그십 ANC 이어폰은 애플스토어·삼성닷컴·쿠팡에서 팔리고, 다나와 최저가
경유 구매는 보급형에 몰린다. **다나와를 단독 소스로 쓰는 한, 무선이어폰
카테고리에서 "프로 라인 경쟁 분석"은 성립하지 않는다.** 리뷰가 있는 쪽으로
가면 제품군이 보급형으로 바뀌고, 제품군을 지키면 리뷰가 없다.

탈모샴푸·유산균에는 이 문제가 없다(전부 수백 건대). **카테고리별로 소스
적합도가 다르다**는 것이 이번에 처음 드러난 사실이고, §1 의 "다나와 단독"
판단을 카테고리 단위로 다시 볼 근거가 된다 — 지금 열지는 않는다.

### 직전 세대 교체는 데이터상 성립하지 않는다

승인받은 방향(직전 세대로 교체)의 전제는 "직전 세대에는 리뷰가 충분하다"
였는데 거짓이다. 에어팟 프로2 는 0~7건, 버즈2 프로는 16건으로 기준
("최소 수십 건 이상")에 미달한다. 판단을 다시 받아야 한다.

---

## §13.14 다나와 리뷰의 카테고리별 편향 — 세그먼트 분석 (2026-09-02)

§13.13 이 무선이어폰에서 발견한 것과 듀오락에서 발견한 것이 같은 현상의
다른 얼굴이다. **다나와 상품리뷰는 "다나와 최저가로 사는 사람들"의 구매
패턴을 반영한다.** 소스 하나가 카테고리마다 다른 편향을 갖는다.

수집 데이터를 해석할 때도 기억해야 한다 — 리뷰가 많은 제품이 잘 팔리는
제품이 아니라, **다나와를 거쳐 사는 제품**이다.

### 유산균 — 리뷰가 어린이 라인에 몰린다

`듀오락` 브랜드 검색 상위 전문:

```
745건 10425627  듀오락 어린이 유산균 프로바이오틱스 100정
603건 18175409  쎌바이오텍 듀오락 생유산균 초코볼 180g
134건 10598364  듀오락 데일리 키즈 프로바이오틱스 딸기맛 60정
125건 120094306 듀오락 듀오 디 드롭스 7.5ml
 60건 115106380 서울우유 듀오안 오리지널 150ml     ← 듀오락 아님(이름 충돌)
 34건 15631754  쎌바이오텍 듀오락 요거맘 10T
```

카테고리 이탈은 **없다**(전부 진짜 유산균이다). 브랜드도 맞다. 문제는
**세그먼트**다 — 상위 4개가 전부 어린이·유아용이고, 대상이던 "듀오락 골드
하루한포"는 성인 일반이다. 듀오락 성인 라인은 `20198603` 골드 캡슐
30캡슐 **리뷰 2건**이 전부다.

브랜드를 지키면 소비자층이 성인→어린이로 바뀌고, 세그먼트를 지키면
브랜드가 바뀐다. 둘 다는 안 된다. → 세그먼트를 지켰다
(`29304419` 유한양행 엘레나 UREX 292건).

### 무선이어폰 — '프로'가 붙으면 리뷰가 0에 수렴한다

애플:

```
   0건 97405013  에어팟 프로3          ← 대상
   0건 28208783  에어팟 프로2 USB-C
   7건 17941787  에어팟 프로2 라이트닝
 2~4건 15616310 / 9805773  에어팟 프로1
 136건 15463181  에어팟3 맥세이프      ← 표준형(ANC 아님)
  96건 18546173  에어팟3 라이트닝
 135건 65920895  에어팟 맥스 USB-C     ← 오버이어
```

삼성:

```
   0건 106702589 버즈4 프로
   0건 59537216  버즈3 프로            ← 대상
  16건 17641574  버즈2 프로
   0건 13010462  버즈 프로
 825건 96987275  버즈3 FE              ← 보급형
 681건 106702613 버즈4
 238건 103414031 버즈 코어
  67건 28531961  버즈 FE
```

**두 브랜드 모두 '프로' 접미사가 붙는 순간 리뷰가 사라진다.** 우연이
아니라 구조적이다 — 플래그십은 애플스토어·삼성닷컴·통신사에서 팔린다.

### 두 번째 축 — 최신 세대는 어느 브랜드든 리뷰가 없다

대안 브랜드를 훑으니 다른 패턴이 겹쳐 있다.

```
보스     20건 94884290  QC 울트라 이어버드 2세대  ← 최신
        130건 94085129  QC 이어버드 2
        104건 12708203  QC 이어버드
젠하이저 13건 36205724  MTW4                      ← 최신
        305건 94085210  MTW3
        280건 6840208   MTW
소니     85건 27250154  WF-1000XM5                ← 최신
        584건 8594714   WF-1000XM3
```

**다나와 리뷰는 누적 지표다.** 출시 후 시간이 필요하다. 프로 라인은
공식몰 판매 비중까지 겹쳐 이중으로 불리하다.

즉 무선이어폰 슬롯의 제약은 "프로 vs 보급형" 하나가 아니라 **"프로 vs
보급형" × "최신 vs 숙성"** 두 축이다. 이미 매핑한 소니 XM5(85건)도 최신
축에 걸려 리뷰가 얇다.

### 트레이드오프 — 등급이냐 브랜드냐

- **브랜드 유지(애플·삼성)** → 등급이 프로에서 보급형으로 내려간다.
  에어팟3 136건 / 버즈3 FE 825건. 리뷰는 충분하지만 소니 XM5 와 비교축이
  어긋난다(플래그십 ANC vs 표준형). 듀오락 어린이 라인과 같은 형태의 손실
- **등급 유지(플래그십 ANC)** → 브랜드가 바뀐다. 보스 QC 이어버드2 130건 /
  젠하이저 MTW3 305건. 애플 vs 삼성 구도는 깨지지만 제품 성격은 유지된다

### CJ 바이오코어 — 정확한 제품은 리뷰 0, 동일 라인은 555건

`4fcea3ff` 의 실제 대상은 CJ 바이오코어 건강한 생유산균 100억 30포+10포
기획(올리브영 `A000000179239`)이다.

```
   0건 18938333  CJ웰케어 바이오코어 건강한 생 유산균 100억 30포    ← 정확히 그 라인
   0건 119249550 CJ웰케어 바이오코어 건강한 생 유산균 100억 30캡슐
 555건 18938615  CJ웰케어 바이오 코어 건강한 생 유산균 500억 450mg 60캡슐
   7건 78456539  CJ웰케어 바이오 코어 건강한 생 유산균 500억 370mg 30캡슐
```

여기서도 같은 편향이다 — 포(스틱) 제형·소용량은 리뷰가 없고, 캡슐
대용량에 몰린다. 같은 브랜드·같은 라인·같은 성인 세그먼트이므로
`18938615`(500억 60캡슐, 555건)가 "동일 라인 다른 용량" 조건을 만족한다.
차이는 함량(100억↔500억)과 제형(포↔캡슐)이다.

---

## §13.15 7단계 매핑 — 적용 전 스냅샷 (2026-09-02)

`review_targets` 12행을 넣고 `analysis_projects` 를 실제 매핑 제품에 맞게
갱신한다. **`competitor_url` 을 다나와 상품 페이지로 바꾸면 원래 발견 경로
(올리브영·컬리·쿠팡·제조사 URL)가 DB 에서 사라진다.** 되돌릴 수 있도록
변경 전 값을 여기 남긴다.

| project | 변경 전 pitch | 변경 전 competitor_url |
|---|---|---|
| `3f38dd36` | 탈모샴푸 경쟁 분석 (라보에이치 두피강화샴푸 333ml+50ml) | oliveyoung A000000152475 |
| `ce069cb2` | 탈모샴푸 경쟁 분석 (려 자양윤모 샴푸) | m.oliveyoung A000000120876 |
| `94b55865` | 탈모샴푸 경쟁 분석 (올뉴 TS 샴푸) | kurly/goods/5072613 |
| `e69c8412` | 탈모샴푸 경쟁 분석 (닥터포헤어 폴리젠 씨크닝 샴푸) | oliveyoung A000000186037 |
| `d404afa9` | 유산균 경쟁 분석 (락토핏 생유산균 골드) | ckdhc.com CHC0000010 |
| `4fc8e9c7` | 유산균 경쟁 분석 (듀오락 골드 하루한포) | kurly/goods/1000862349 |
| `39caee12` | 유산균 경쟁 분석 (비에날씬 프로 BNR17) | oliveyoung B000000155794 |
| `4fcea3ff` | 유산균 카테고리 경쟁 분석 | oliveyoung A000000179239 |
| `659642c8` | 무선이어폰 경쟁 분석 (소니 WF-1000XM5) | sony.co.kr wf-1000xm5 |
| `55d574a2` | 무선이어폰 경쟁 분석 (QCY 멜로버즈 프로 플러스 HT08) | m.coupang 8670889752 |
| `f966b3e9` | 무선이어폰 경쟁 분석 (에어팟 프로 3) | apple.com/kr airpods-pro-3 |
| `9f12cebe` | 무선이어폰 경쟁 분석 (갤럭시 버즈3 프로) | samsung.com galaxy-buds3-pro |

전체 UUID (앞 8자만으로는 조회가 안 된다):

```
3f38dd36-a393-44ac-a7d3-1da7b5a449d4   ce069cb2-d3e0-43a0-99e8-36f9f8177f5f
94b55865-bb37-42e8-bc6a-25e893b5cddf   e69c8412-98e8-402d-99cc-2fb10a8604df
d404afa9-c9fc-41e4-9562-aead96b82c3d   4fc8e9c7-9ca8-41e4-b9a6-93f53d8e0632
39caee12-1f29-4772-bf25-b71d861ab206   4fcea3ff-a930-4017-b301-888423284c86
659642c8-9da6-4831-827b-78c25429008b   55d574a2-60a2-444b-88b7-8a625b857175
f966b3e9-8a68-42ed-8051-8f8f3a7895a2   9f12cebe-137d-4c4b-a23c-ff9f30df9181
```

---

## §13.16 7단계 완료 — 12개 프로젝트 다나와 매핑 (2026-09-02)

`review_targets` 12행 적재 완료. 12 프로젝트 / 12 pcode / 전부 `active`.
`analysis_projects` 의 `product_elevator_pitch` 와 `competitor_url` 도 실제
매핑 제품으로 갱신했다 — 변경 전 값은 §13.15 에 있다.

**왜 프로젝트 레코드까지 고쳤나.** 지정한 제품과 수집되는 제품이 다르면,
나중에 분석 결과를 볼 때 "이 리뷰가 왜 이 프로젝트에 있지"를 처음부터 다시
추적해야 한다. `competitor_url` 을 다나와 상품 페이지로 통일해
**지정 = 수집**이 되도록 했다. 무결성 검사로 12행 전부
`competitor_url` 의 pcode 와 `review_targets.product_ref` 가 일치함을 확인했다.

### 최종 매핑

**탈모샴푸 — 4개, 전부 브랜드·라인 유지**

- `3f38dd36` → `18753650` 라보에이치 두피강화 샴푸 700ml · **363건** ★4.9
  (원래 333ml+50ml 기획은 다나와 미등재. 같은 라인 다른 용량)
- `ce069cb2` → `14071175` 려 자양윤모 9EX 탈모증상케어 샴푸 중건성 400ml ·
  **247건** ★4.7 (915건짜리 제주산들바람은 하위 라인이라 기각 —
  헤어케어는 포뮬러가 다르면 다른 제품이다)
- `94b55865` → `5922857` TS 올뉴 플러스 TS 샴푸 500g · **602건** ★4.7
  (880건짜리 비디샴푸는 다른 제품)
- `e69c8412` → `119095215` 닥터포헤어 폴리젠 씨크닝 샴푸 500ml · **288건** ★4.7
  (프로젝트가 지목한 제품과 정확히 일치)

**유산균 — 4개, 1개는 브랜드 교체**

- `d404afa9` → `61827344` 종근당건강 락토핏 생유산균 골드 2g 90포 ·
  **100건** ★4.6 (515건짜리 "5X 골드"는 다른 제품일 가능성이 있어 기각.
  이름 정확도 우선)
- `4fc8e9c7` → `29304419` 유한양행 엘레나 UREX 프로바이오틱스 170mg 90캡슐 ·
  **292건** ★4.6 — **브랜드 교체**. 듀오락 성인 라인이 다나와에 리뷰
  2건뿐이고 상위는 전부 어린이 라인이라(§13.14) 세그먼트를 지켰다
- `39caee12` → `89523488` 비에날씬 다이어트 유산균 BNR17 슬림+ 2g 14포 ·
  **551건** ★4.8 ('프로' 라인 자체가 다나와에 없어 리뷰 수 기준)
- `4fcea3ff` → `18938615` CJ웰케어 바이오코어 건강한 생 유산균 500억
  450mg 60캡슐 · **555건** ★4.7 (정확한 대상인 100억 30포 `18938333` 은
  리뷰 0. 같은 라인 다른 함량·제형)

**무선이어폰 — 4개, 2개는 브랜드 교체**

- `659642c8` → `27250154` SONY WF-1000XM5 · **85건** ★4.9
- `55d574a2` → `71645780` QCY MeloBuds Pro HT08 · **474건** ★4.6
  (프로젝트명의 '플러스'는 등재명에 없지만 모델명 HT08 이 동일)
- `f966b3e9` → `94085129` BOSE QC 이어버드 2 · **130건** ★4.8 — **브랜드 교체**
- `9f12cebe` → `94085210` 젠하이저 모멘텀 트루 와이어리스 3 MTW3 ·
  **305건** ★4.7 — **브랜드 교체**

### 애플·삼성이 이 카테고리에서 빠진 이유

판단이 아니라 **소스의 한계**다. 두 브랜드의 플래그십 ANC 이어폰은 다나와
상품리뷰가 0이다(§13.14). 등급(플래그십 ANC)을 지키고 브랜드를 바꾸는
쪽을 택해, 무선이어폰 4개가 소니·QCY·보스·젠하이저로 전부 같은 등급이 됐다.
비교축은 일관되지만 **국내 점유율 1·2위가 빠진 경쟁 분석**이라는 것을 결과
해석에서 잊으면 안 된다.

### 이번 매핑에서 쓴 판정 기준

- 리뷰 수보다 **제품 동일성이 우선**이다. 하위 라인·다른 포뮬러·이름이
  비슷한 다른 제품은 리뷰가 몇 배 많아도 기각했다(려 585ml, 락토핏 5X,
  TS 비디샴푸, 소니 XM3)
- 같은 브랜드·같은 라인의 **용량·제형 차이는 허용**했다(라보에이치 700ml,
  CJ 500억 60캡슐)
- 대상 제품이 다나와에 리뷰 0일 때만 **브랜드 교체**를 검토했고, 그때는
  세그먼트·등급을 지키는 쪽을 골랐다

---

## §13.17 첫 실제 수집 — dry-run 으로 다나와에 실요청 (2026-09-02)

7단계 매핑 직후 `nightly-review-collect.yml` 을 `dry_run=true` 로 돌렸다.
dry-run 은 **요청은 보내되 적재하지 않는다.** 즉 이것이 수집기·파서가
실제 소스에 대고 돈 첫 실행이다 — §11 이 "첫 실수집에서 확인된다"고
남겨둔 항목들이 여기서 풀린다.

run `33531048692`, conclusion `success`, **595.4초**.

```
- 소스 danawa · 타깃 12개 · 요청 149건
- 파싱 1269건(실패 0) · 신규 0건 · 폴백키 0건 · robots 회피 0건
```

### 풀린 것

- **파서가 실제 다나와 응답을 1269건 읽었다. 파싱 실패 0.** §13 감사에서
  고친 커서 버그(페이지 전진 `1,2,2,2`)가 실제로 안 나는 것도 이걸로 확인된다
  — 149요청/12타깃이면 타깃당 평균 12.4페이지이고, 커서가 안 움직였으면
  1~2페이지에서 멈췄어야 한다
- **폴백키 0건** — 모든 리뷰에서 안정 식별자를 얻었다. 지문이 `composite`
  로 새지 않았다
- **robots 회피 0건** — 12타깃 전부 robots 판정을 통과했다
- **차단·요청 실패 0건** — 149건 연속 요청에 4초 간격으로 차단이 없었다.
  일일 상한 200건에도 안 닿았다(149건)

### ⚠️ "신규 0건" 은 0 이 아니라 **측정 안 함**이다

`lib/review/runner.ts:423` 이 `if (opts.dryRun) continue` 를 `newCount++`
**앞**에서 한다. dry-run 은 지문을 쓰지 않으므로 중복 판정 자체를 못 한다.
**구조상 항상 0이고, 버그가 아니다.**

그런데 요약은 `신규 0건` 으로 찍는다. **"새 게 없다"와 "세지 않았다"가 같은
글자로 나온다** — §7.1 의 그 형태다. 실수집에서 진짜로 0건이 나온 날과
구별되지 않는다. dry-run 일 때는 `신규 —(dry-run 은 판정하지 않음)` 으로
렌더하는 게 맞다. 아직 안 고쳤다.

### ⚠️ 5개 타깃이 20페이지 상한에 걸려 잘렸다 (§7.2)

타깃별 결과에서 `진행` 으로 끝난 5건이다.

```
진행(상한)      18753650 라보에이치 · 5922857 TS · 89523488 비에날씬
                18938615 CJ바이오코어 · 71645780 QCY
끝까지 읽음     14071175 려 · 119095215 닥터포헤어 · 61827344 락토핏
                29304419 엘레나 · 27250154 소니 · 94085129 보스 · 94085210 젠하이저
```

`runner.ts:250` 의 `outcome` 초기값이 `'진행'` 이고, `for (page = 0; page <
MAX_PAGES_PER_TARGET; page++)` 가 break 없이 완주하면 그대로 남는다.
**즉 `진행` = 20페이지를 다 쓰고도 끝에 도달하지 못했다는 뜻이다.**

§7.2 대로 "상한에 걸려 끝난 실행은 성공이 아니라 확인 대상"이라 짚어둔다.
다만 이 경우는 **정상이다** — 리뷰가 200건대를 넘는 제품이고, 실수집에서는
커서가 저장되므로 다음 밤이 21페이지부터 이어 읽는다. 며칠에 걸쳐 과거분을
따라잡는 설계다(dry-run 이라 이번엔 커서가 저장되지 않았다).

확인이 필요해지는 경우는 **실수집을 며칠 돌렸는데도 같은 타깃이 계속
`진행` 일 때**다. 그때는 커서가 전진하지 않는다는 뜻이다.

### 아직 안 풀린 것

- **쓰기 경로.** `store.appendInput` / `recordFingerprint` / `linkFingerprint`
  는 dry-run 이 건너뛴다. UNIQUE 위반이 정말 `23505` 로 오는지는 여전히
  실수집 첫날에 확인된다
- **증분 종료.** `lastReviewAt` 이 null 이라 `이미 본 구간 도달` 경로가
  한 번도 안 탔다. 2회차 실행에서 처음 검증된다
