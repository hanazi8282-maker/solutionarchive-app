# v71bg 드라이런 — ⑧ 업무관리·⑨ 디자인 신설, ⑤ 개명, 리뷰 앱 17곳 hold 이동 (2026-10-26)

> 읽기 전용 쿼리와 코드 조사만 했다. DB 데이터는 하나도 바꾸지 않았다. 숫자는 2026-10-26 00:00~02:00 KST 실측 [DB 직접 확인].
> "쓸 수 있는 정보" = relevant ∧ (2차 통과 ∨ 자동 승인) 의 누적 건수(10-22 확정 정의).

## 1. 큰 그림

- 새로 영역으로 세는 것: ⑧ 업무관리 6개 프로젝트(쓸 수 있는 정보 1,029), ⑨ 디자인 3개(2,681, 이미 판정 끝). 빠지는 것: 리뷰 앱 17곳(−439). 노트 둘(Bear·Evernote)이 ⑤ 로 +14.
- 새로 2차 판정 대기가 되는 글은 첫 쌍에서 0건이다(전부 판정이 끝나 있다). 판정 용량 문제는 이번 단계에 없다.
- 이름 정본은 `config/areas.json` 한 곳이다. 이름 바꾸기 1단계는 PR #611. 이동(2단계)은 코드가 덮어쓰기 없이 "유효 영역"을 읽도록 먼저 바꿔야 해서 D+2 에 한다.

## 2. 전후 수치 (같은 쿼리, 프로젝트 단위 영역 기준)

이동 후 = 17곳 `hold`, ⑧ 6곳 `work`, 노트 `5`, 디자인 그대로(표시만 ⑨). 입력 건수 / 쓸 수 있는 정보 누적:

- ① 49개: 이동 전 10,981 / 4,712 → 후 같음
- ② 55개: 6,851 / 4,559 → 같음
- ③ 35개: 7,663 / 3,569 → 같음
- ④ 32개: 8,110 / 4,419 → 같음
- ⑤ 47개 → 33개: 15,513 / 5,969 → 12,166 / 5,544 (−425 = 리뷰 앱 −439 + 노트 +14)
- ⑧ 0개 → 6개: 0 / 0 → 3,375 / 1,029
- ⑨ 3개: 5,481 / 2,681 → 같음 (지표에 처음 들어옴)
- hold 12개 → 29개: 1,101 / 692 → 5,005 / 1,131 (영역으로 세지 않음)
- 영역 미부여(NULL) 25개 → 16개: 7,950 / 1,422 → 4,018 / 379
- 영역 밖(소비재 30 · 창업가 60): 변화 없음. 2차 대기 relevant 10,109(창업가 9,246 · 소비재 863)는 전부 여기에 있다.

합계(쓸 수 있는 정보 누적):
- 지금 정의(①~⑤): 23,228 → 22,803 (−425)
- 새 정의(①~⑤ + ⑧ + ⑨): 22,803 + 1,029 + 2,681 = 26,513. 지금 정의 대비 +3,285.
- 줄어드는 부분(리뷰 앱 −439)과 늘어나는 부분(⑧ +1,029, ⑨ +2,681, 노트 +14)을 따로 보지 않으면 합계만 오른 것처럼 보인다. 일일 증가분(하한 300 비교)에는 ⑨·⑧ 의 최근 7일 입력(⑨ 319 · ⑧ 861)만 들어간다.

## 3. 리뷰 앱 17곳 (영역 ⑤ → hold)

입력 합 3,904 · 쓸 수 있는 정보 합 439. 대상 project_id (제1참모의 `conclusion-topic-ledger.md §2` 표는 이 환경에서 읽을 수 없어 DB 소개문으로 골랐다 — 어긋나면 알려 달라):
- Judge.me ad9ef981-1bd1-40ac-af84-9e947d61632a (2,015 / 204)
- Loox 4711d37c-154b-4d9d-805a-f41ac054bbe8 (1,361 / 5)
- Okendo 901e14aa-44fe-40f0-a5ab-e22691ce1735 (171 / 14)
- Yotpo b5717973-9943-436c-8a98-bdf1448ae9c4 (52 / 28)
- Trustindex(Widgets for Google Reviews) a2412fa3-f3e1-4731-8511-f6524bd5c07b (42 / 26)
- Site Reviews a1cfc2e9-e209-4993-b5e1-1bc51e2de828 (32 / 26)
- WP Customer Reviews 7dd23340-06d3-4183-ab35-60eb7eba80a2 (31 / 14)
- Photo Reviews for WooCommerce 53536c76-3625-4d5a-bb07-fe12b95bbb33 (30 / 19)
- Reviews Feed(Smash Balloon) 974f8e85-1d17-4b55-a854-2ef625333e6c (30 / 19)
- Customer Reviews for WooCommerce(CusRev) 297d58d2-7417-440c-b278-0915042a8755 (30 / 13)
- Trustpilot Reviews 3a0464c9-6faf-4417-9a85-a0c57d8b736b (30 / 24)
- Stamped cfc2fb66-cff0-448a-ada9-4a482020ce4d (17 / 15)
- Rivyo 5e3de25e-3636-4ce2-830e-0d9d3afc7ce8 (16 / 6)
- Ali Reviews fedbb26a-f189-430f-a986-5a819bf8bbdd (14 / 3)
- Fera a0f0a31a-8807-46ed-9dcc-63533f155b64 (14 / 8)
- CREMA 91ec0609-63e0-4315-af09-de674f3f33f3 (11 / 9)
- Alpha Review 2f949956-cf5c-43e0-81e7-d0e6f13053c2 (8 / 6)

주의: `7-리뷰도구` 라는 이름은 리포 어디에도 없다. 코드에서 보류는 `hold` 하나뿐이고 ⑥⑦ 구분이 없다. 이 17곳은 `hold` 로 가고, "⑦ 이커머스 운영" 안의 세부 라벨은 이동 매핑표의 `note` 칸에만 적는다.

## 4. 영역이 비어 있는 25개 프로젝트의 분류 제안 (근거와 함께, 애매한 것은 비움)

입력 / 1차 relevant / 쓸 수 있는 정보:
- ⑧ 업무관리(제안): RescueTime 861/379/290 · Todoist 598/274/232 · Airtable 703/253/229 · Calendly 606/154/148 · Trello 454/147/130 · Harvest 153/0/0. 합 3,375 / 1,207 / 1,029.
- ⑧ 후보이지만 이미 영역 값이 있어 덮어쓸 수 없는 것: Basecamp(창업가, 806입력, 2차 대기 95) · Fantastical(창업가, 639입력, 2차 대기 5). 이동 매핑표(override)가 생기면 같이 옮길 수 있다 → 2차 판정 대기 약 100건이 새로 생긴다.
- ⑤ 로(노트): Bear 500/10/3 · Evernote 57/36/11 · Apple Notes 입력 0(목록만).
- 비움(영역 밖 또는 후보 미정, 근거):
  - Zapier 465/179/142 — 자동화 도구. ⑧ 에 들어갈 수 있으나 "일정·할 일·시간" 정의 밖이라 비움. 영역 정의를 넓힐지는 남헌.
  - Dovetail 662/2/2 · Descript 417/0/0 · Equal Time 239/0/0 · Groove 265/0/0 · Harvest(위, 0) — 관련 글이 거의 없다.
  - Chargebee 247/147/59 · Freshbooks 572/170/115 · Paddle 178/5/5 — 결제·회계. 새 영역 후보(영역 확장 기획의 "결제·청구").
  - Doppler 411/20/18 · Teachable 320/9/9 · Linktree 172/58/18 · Beamer 70/14/11 — 소수 관련.
  - 소비재 2(무선이어폰, 입력 0) · yozm · 인프런(입력 0) — 입력이 없어 분류 불필요.

## 5. 이동 방식 (덮어쓰기 없이)

- 새 표 `project_area_override(project_id pk, area_code, reason, rule_ver, set_at)` 와 뷰 `v_project_area_effective = coalesce(override, analysis_projects.area_code)`. 기존 `area_code` 는 그대로, 이미 쓴 판정·집계도 그대로. 되돌리기 = override 행 삭제(DELETE 라 사람이 SQL Editor 에서) 또는 rule_ver 별 비활성 칸.
- 읽는 쪽(조사 결과): 유효 영역을 읽게 바꿔야 하는 곳은 5곳이다 — `v_goal_daily`, `v_area_t2_coverage`, `v_input_area`(+`_effective`), `lib/analysis/area-priority.ts`, `lib/analysis/second-opinion.ts`. 프로젝트 행을 읽어 `area_code` 를 쓰는 스크립트(`relevance-judge-auto`, `relevance-second-judge-auto`, `consumer-material-tag`)는 로더 한 곳(`lib/analysis/area-effective.ts` 신설)을 거치게 한다.
- `work` 를 쓰려면 DB CHECK 확장이 먼저다. 마이그 `20261026000030_area_work_vocab.sql` 은 CHECK 를 DROP+ADD 하는데 CC 도구 훅이 DROP 을 막는다(v71ak §1, 우회하지 않음). **정확한 한 줄: 남헌이 Supabase SQL Editor 에서 그 파일 전체를 실행**하면 된다. 그 전까지 ⑧ 이동은 대기한다(⑨ 표시·노트 ⑤·리뷰 앱 hold 이동은 override 표만으로 가능해 막히지 않는다).

## 6. 이름이 어긋나는 곳 (지시서 §6)

고객 화면·발행물 (D+2 PR 에서 고친다, 발행물은 건드리지 않는다):
- `app/page.tsx:48,201` — "인사 운영, 리뷰 관리 영역" 문구
- `app/opengraph-image.tsx:21` — `SUB = '회의·통화 기록 · 영업 · 마케팅 · 인사 운영 · 리뷰 관리'`
- `app/legal-draft/terms/page.tsx:11`, `app/legal-draft/pricing/page.tsx:10` — "영역은 … 리뷰 관리다 / 리뷰 관리 중에서 고른다"
- `content/guides/인사이트-추출-기준.md` — 1건(파일 미확인)
- LLM 판정 프롬프트: `lib/analysis/relevance-criteria.ts:153,165,185`("①회의·통화 기록 ②영업 ③마케팅 ④인사 운영 ⑤리뷰 관리", "SaaS 인데 영역 ①~⑤ 밖이면 irrelevant") · `lib/analysis/area-reclass.ts:29`. 여기가 가장 위험하다: ⑧⑨ 제품이 1차 판정에서 "영역 밖 SaaS" 로 떨어질 수 있다. 판정 기준 v2.3 초안(영역 목록을 config 에서 읽기)을 D+3 에 낸다. 기존 판정은 지우지 않는다.

내부 코드·설정: `config/areas.json`(PR #611 에서 고침) · `config/discovery-c1.json:11`(⑤ 키워드 "리뷰 관리") · `config/community-seeds.json:2`, `config/product-name-discovery.json:50,57`(주석) · 뷰 `v_input_area.area_name`(마이그 20261009000020:438 에 이름이 박힘 → 다음 마이그에서 뷰 재정의) · `lib/analysis/area-reclass.ts`, `mention-loop.ts:550`(`'①②③④⑤'[n-1]`, `work` 에서 깨짐).

내부 문서: reports/ 40파일 285건(역사 기록이라 유지) · docs/migration-exceptions.md 5 · ops/ 3파일. Notion 은 역사 로그(10-07~10-15)가 대부분이고, 살아 있는 문서는 "사업기획" 페이지, CC 지시함, 장부 L-21 이다 → 제1참모가 고칠 목록.

Cowork 쪽(제1참모가 고칠 곳): `claude/conclusion-topic-ledger.md`, `ig-topic-ledger.md` 의 "리뷰 관리", "영역 ⑤", "디자인(③ 포함)" 줄. 이미 발행된 카드가 있으면 번호·이름을 대조해 알려 주면 된다.

## 7. 코드가 조용히 달라질 수 있는 곳 (조사 결과 요약)

- 새 `work` 코드: `lib/analysis/area-priority.ts` 는 최소량 200 에 못 미치면 1차 판정 맨 앞으로 올린다. ⑧ 프로젝트는 이미 3,375건이 판정돼 있어 결손이 없다. 
- `lib/review/target-supply.ts:197` `areaOf` 는 라벨 `8:`/`9:` 를 '미부여'로 읽는다 → 새 타깃 라벨에 `work:` 같은 접두를 쓰지 말고 프로젝트 영역으로만 연결한다.
- `consumer-material.ts` 의 `IN_SCOPE_AREAS` 와 `candidate-generator.ts` 의 `ACTIVE_AREAS` 에는 `work` 가 없다 → ⑧ 프로젝트에 붙는 소비재 소스 글이 소비재로 분류된다. D+2 PR 에서 함께 고친다.
- `review_area_verdicts` (글 단위 영역 재판정)는 1~5/none 만 받는다. ⑧⑨ 는 프로젝트 단위로만 간다.

## 8. 확인이 필요한 것 (남헌)

1. ④ 의 정의: 지시서 "채용·HR(근태 포함)" ↔ 코드·판정 프롬프트 "채용 제외". 채용을 넣으려면 판정 기준 v2.3 에 반영해야 한다. 지금은 코드 정의 유지.
2. CHECK 확장 마이그 실행(§5, 정확한 한 줄).
3. 리뷰 앱 17곳과 Basecamp·Fantastical 목록 확인(§3·§4).
