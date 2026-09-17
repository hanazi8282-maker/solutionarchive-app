# 자율 VOC 발굴 엔진 — 설계 정본

작성 2026-09-17. 구현 브랜치 `feat/voc-discovery-engine`.

사람이 `review_targets` 를 하나씩 등록하던 병목을, **자기 판정을 실측으로
검증하는** 야간 루프로 대체한다.

> **한 줄 요약: LLM 은 후보 이름만 낸다. 채택 여부는 실제 소스 질의 결과(hit 수)가 정한다.**

이게 전부다. LLM 이 "이 제품 리뷰 많아요" 라고 한 말은 근거로 쓰지 않는다 —
사람이 하던 "그거 진짜 후기 있나 검색해 보기"를 코드가 대신한다.

---

## 1. 루프

```
[1] 축 선택(코드)      kind ∈ {physical, saas} 중 가장 오래 안 뽑힌 것
[2] 후보 제안(claude -p) 하루 DISCOVERY_TARGET=2건. name/category_hint/homepage_url/why
[3] 게이트(코드)        이미 아는 이름 → rejected/already_known
                       같은 카테고리 채택 3건 이상 → rejected/duplicate_category
                       ⚠️ 네트워크 쓰기 전에 돈다
[4] 프로브(네트워크)    saas    : hn.algolia.com search_by_date → nbHits
                       physical: search.danawa.com/dsearch.php → 최다리뷰 pcode + 리뷰수
                       채택 창은 양쪽이 닫혀 있다: 30 ≤ hits ≤ 500
                       hits < MIN_VOC_HITS(30) → rejected/insufficient_voc
                       hits > MAX_VOC_HITS(500) → rejected/oversized_voc
                       캡된 값이 경계를 걸침   → unverified/bounds_unverifiable
                       요청·파싱 실패          → unverified  (rejected 와 다르다)
[5] 적재(DB, 통과분만)  analysis_projects INSERT(status='collecting', mode='forward')
                       + review_targets INSERT(product_ref = 프로브가 찾은 값)
                       + discovery_candidates INSERT(verdict, probe_*, project_id)
[6] 보고                Notion 다이제스트 (채택 0건이면 섹션 자체를 안 보여준다)
```

파일: `lib/discovery/candidate.ts`(순수 판정) · `lib/discovery/probe.ts`(프로브) ·
`scripts/discovery-run.mjs`(오케스트레이터) · `scripts/discovery-selftest.mjs`(검증).

## 2. 왜 이렇게 했나 — 결정 근거

### 2-1. `research_queue` 를 재사용하지 않는다

CMO 루프가 그 테이블을 `status IN ('queued','claimed')` 로만 훑고 `reason` 을
보지 않는다(`scripts/research-queue.mjs`). 발굴 후보를 거기 넣으면 CMO 가 그걸
조사 대상으로 집어 간다. 그래서 `discovery_candidates` 를 따로 판다.

### 2-2. `unverified` 는 `rejected` 와 다른 상태다

`hits=null`(못 셌다)과 `hits=0`(세어 봤더니 없다)은 다른 사건이다. 섞으면
다나와가 마크업을 바꾼 날 후보 전부가 "정상 기각" 으로 찍히고 발굴이 영영
0건이 된다(CLAUDE.md §7.1). 코드·DB CHECK·셀프테스트 세 군데가 이걸 강제한다.

### 2-3. HTTP 200 으로 성공을 판정하지 않는다

다나와 프로브는 `id="productListArea"` 컨테이너가 있어야 성공으로 친다.
컨테이너가 없으면 200 이어도 실패(unverified)다. 상품은 있는데 리뷰수 마커가
하나도 없을 때도 실패다 — 0 이 아니다.

### 2-3-1. 채택 창은 양쪽이 닫혀 있다 (2026-09-18 추가)

하한만 있으면 **초대형 브랜드가 전부 통과한다.** 2026-09-17 dry-run 실측으로
Notion 79,072 · Heroku 25,461 · 다이슨 999+ · 하기스 648 이 네 건 전부
`accepted` 였고, 같은 날 실제 적재된 2건도 필립스 에어프라이어 XXL(93)과
오랄비 전동칫솔(999+, 브라운/P&G)이었다. 그 규모는 VOC 가 없어서 문제가 아니라
**우리 독자에게 이식 가능한 규모가 아니다.**

- **상한도 실측값으로만 거른다.** "LLM 프롬프트로 대형 브랜드를 제외하라"는
  대안은 기각됐다(남헌 2026-09-18) — 프롬프트 제약은 LLM 의 주장에 의존해
  "채택은 hits 가 정한다"는 이 엔진의 전제를 깨뜨린다.
- 기본값 `MAX_VOC_HITS = 500`. 읽을 수 있는 실측 두 점 사이다:
  93(필립스, 남헌이 kept 로 판정 → 창 안) < 500 < 648(하기스, 킴벌리클라크 → 창 밖).
  env `DISCOVERY_MAX_VOC_HITS` · 워크플로 `vars` 로 조정한다.
- **verdict 어휘는 늘리지 않았다.** 상한 초과는 `rejected` + 사유
  `oversized_voc:` 다. `rejected` 는 이미 사유로 사건을 가르는 바구니이고
  (`insufficient_voc` · `already_known` · `duplicate_category`), 상한 초과는
  분명히 "실측을 해 봤고 기준 밖"이라 `unverified`("못 알아봤다")가 아니다.
  새 verdict 값을 만들면 CHECK 제약을 넓히는 마이그레이션이 필요해지고,
  **코드가 머지됐는데 마이그레이션이 미적용인 밤에 루프가 23514 로 죽는다.**

### 2-3-2. 캡된 값(`999+`)은 점이 아니라 구간이다

다나와는 리뷰수를 999 에서 끊는다. `999+` 는 "999 이상"이고 진짜 값은 5만일 수도
있다. 그래서 `judge` 는 실측값을 구간 `[hits, ∞)`(캡됨) 또는 `[hits, hits]`(정확)로
보고 판정한다.

| 상황 | 판정 |
|---|---|
| 구간 전체가 창 밖 (예: `999+` vs 상한 500) | `rejected` — 알아봤고, 아니다 |
| 구간이 경계를 걸침 (예: `999+` vs 상한 999 또는 5,000) | `unverified/bounds_unverifiable` |
| 캡된 하한선이 최소선보다 낮음 (예: `999+` vs 최소 2,000) | `unverified` — 미달로 접지 않는다 |

캡된 값을 "상한 이하"로 접으면 5만 건짜리가 조용히 통과하고, 전부 "상한 초과"로
접으면 정확히 999 인 멀쩡한 상품을 근거 없이 버린다. 둘 다 하지 않는다 — 모르는
것은 모른다고 적는다(CLAUDE.md §7.1).

**따라서 상한을 999 이상으로 올리면 physical 쪽 상한은 사실상 죽는다**(캡된 값이
전부 판정 불가가 되어 아무도 채택되지 않는다). 기본값 500 이 그 아래인 이유다.

`DISCOVERY_MIN_VOC_HITS > DISCOVERY_MAX_VOC_HITS` 로 창이 뒤집힌 설정은
모든 후보를 `unverified/config_error` 로 만든다. 조용히 전부 기각하면 발굴이
영영 0건인데 로그는 초록불이다(§7.2).

### 2-4. HN 질의는 따옴표 구절 + `advancedSyntax=true`

Algolia 는 기본이 단어 OR 매칭이라 두 단어 이름이 수만 건으로 걸린다.
실측: `linear app` 17,622건 vs `"linear app"` 20건. **최소 건수 게이트가 항상
통과하면 게이트가 없는 것과 같다.**

### 2-5. `targets/route.ts` 의 "자동 선택 금지" 와 어긋나지 않는다

그 금지는 **기존 프로젝트에 상품을 갖다 붙일 때** 유효하다. 자동 선택은 조용히
틀린 상품의 리뷰를 모아 오고, 분석 결과가 그럴듯해서 아무도 못 알아챈다.
발굴이 **새로 만드는** 프로젝트는 "찾아낸 pcode 가 곧 그 프로젝트의 정의" 라
잘못 붙을 대상 자체가 없다. 기존 프로젝트에는 이 경로로도 안 붙인다.
(`lib/review/target-ref.ts` 헤더와 `discovery_candidates.probe_ref` 의 COMMENT
에 같은 내용이 박혀 있다.)

사람이 나중에 "이거 엉뚱한 상품인데" 를 알아볼 수 있게 프로브가 **상품명을
`probe_note` 에 적어 둔다**. 판정에는 안 쓴다.

## 3. 실측 근거 (2026-09-17 당일 재확인)

| 대상 | 확인한 것 | 결과 |
|---|---|---|
| `search.danawa.com/robots.txt` | `/dsearch.php` 허용 여부·Crawl-delay | Disallow 6개 전부 `/api_ui/` `/classes/` `/genfile/` `/globalData/` `/snippets/` `/tpl/` `/mobile/tpl/` — **dsearch.php 는 밖. `Crawl-delay: 10`** |
| `itunes.apple.com/robots.txt` | appstore 재개 가능 여부 | `Disallow: /*/rss/*` **그대로 → 재개 불가** (SP-019/021 유지) |
| `hn.algolia.com` | robots·이용 조건 | robots 없음, 공개 API. 상업이용 금지 문구 없음 |

Crawl-delay 는 **호출하는 쪽**이 진다. `scripts/discovery-run.mjs` 의 `fetchText`
가 다나와 요청 사이에 10초를 채우고, **잰 간격을 로그에 찍는다** — 안 찍으면
"지켰다"는 주장을 사람이 확인할 방법이 없다.

## 4. 비용·물량 가드

`lib/analysis/budget.ts`($0.50/요청, $5/일)는 **이 루프에 못 쓴다.** 그건
`app/api/analyze/{extract,angle}` 의 API 경로 전용이다. 발굴은 `cmo-daily.mjs`
처럼 `claude -p`(구독)로 돈다.

실제로 막는 건 호출 횟수다:

- LLM 호출: 하루 **1회**(후보 `DISCOVERY_TARGET=2`건을 한 번에 받는다)
- 외부 요청: 후보당 1건 (하루 2건)
- 다나와: 요청 간격 10초 이상

## 5. 권한 경계 (CLAUDE.md §10.1)

허용: `discovery_candidates` 전체 / `analysis_projects` 신규 INSERT
(`status='collecting'` 한정, UPDATE·DELETE 금지) / `review_targets`
(`review_sources.enabled=true` 인 소스 한정).

금지: **`review_sources` 에는 INSERT/UPDATE 하지 않는다.** 새 소스는 robots·ToS
판단이 들어가므로 사람이 마이그레이션으로만 추가한다. 루프는 꺼진 소스에
타깃을 만들지 않는다 — 만들어 두면 나중에 소스를 켜는 순간 아무도 예상 못 한
타깃이 같이 돌기 시작한다.

LLM 서브프로세스 env 에는 `CLAUDE_CODE_OAUTH_TOKEN` 하나만 넘어간다. DB 자격
증명은 오케스트레이터만 갖는다.

## 6. 아직 안 한 것

- **`kind='service'`** (무형 컨설팅·대행): CHECK 어휘에는 있지만 로직이 고르지
  않는다. 검증할 한국어 서비스 VOC 소스를 아직 실측하지 않았다. 경로 없이
  뽑으면 전부 unverified 로 쌓여 큐만 더럽힌다.
- **appstore 프로브**: robots 가 그대로라 재개 불가(위 3절).
- ~~**`999+` 상한**: 채택 판정(≥30)에는 영향이 없어 그대로 둔다.~~
  → 2026-09-18 해결. 상한(≤500)이 생기면서 캡 여부가 판정에 **직접 들어간다**.
  `ProbeResult.capped` 가 프로브에서 `judge` 까지 건너간다(§2-3-2).
- **축별 상한 분리**: 두 축의 hits 는 스케일이 다르다(다나와=한 상품 리뷰수, 캡
  999 / HN=구절 댓글수, 캡 없음, 실측 최대 79,072). 지금은 한 값으로 본다.
  한쪽 축만 기각이 몰리면 `DISCOVERY_MAX_VOC_HITS_{PHYSICAL,SAAS}` 로 쪼갠다.
- **`--dry` 에서의 중복 게이트**: dry 는 DB 를 아예 열지 않아 기존 이름 목록이
  없다. 그래서 중복/포화 게이트가 무력하고, 그 사실을 로그 첫 줄에 찍는다.
