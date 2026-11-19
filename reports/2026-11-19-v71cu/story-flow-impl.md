# v71cu story flow 구현 (2-2 ~ 2-8)

상태: **구현 완료·독립 검수 대기.** 자기검증(셀프테스트·타입·린트)만 통과했고, DB 실측·독립 리뷰는 아직이다.
깃발 `STORY_FLOW_ENABLED` 는 건드리지 않았다(코드 기본값 OFF 그대로, 변수 변경 없음). **독립 검수 판정: 깃발을 켜지 말 것** (`story-flow-independent-review.md`). 아래 "수정 이력" 참고.
마이그 `20261119000030` 은 오케스트레이터가 적용했다(9,705행, 파일 내용 그대로). 새 마이그 `20261119000031` 은 **파일만** 있고 적용하지 않았다.

근거: Notion 지시서 v71ct §4 · v71ct-1 §4 원문은 이 세션에서 열어 보지 않았다(서브에이전트, 오케스트레이터 지시문 + 기존 코드 기준). 아래 "미확인" 참고.

## 바꾼 파일

| 파일 | 무엇 | 성격 |
|---|---|---|
| `lib/consult/story-flow.ts` | 내부 함수 8개에 `export` 만 붙임 · `fetchFlowCards` 추가(사본 → 기존 뷰 폴백) · `loadStoryFlow` 가 그걸 부름 | 추가. `similarity`·`persuasion`·`pickFlowCards` 본문 불변 |
| `lib/consult/story-flow-select.ts` (새) | `scoreCard`·`dedupeBySlug`·`selectStoryFlow`(폴백 주입)·`chooseSimilar`(깃발 분기)·`diagnosisFromReport`·`dbLoaders`·`verifyQuotes` | 새 경로 |
| `lib/consult/report/compose.ts` | ③ 비슷한 회사 칸을 `chooseSimilar` 로 감쌈 · `ReportPayload.story_flow?` 추가 | 깃발 OFF 면 기존 `retrieveSimilar` 한 줄 그대로 |
| `supabase/migrations/20261119000030_story_flow_cards_mat.sql` (+ `_rollback.sql`) | `story_flow_cards_mat` materialized view + 인덱스 2개, anon·authenticated 권한 제거 | 추가 전용, 기존 뷰 불변 |
| `scripts/story-flow-select-selftest.mjs` (새) | 새 회귀 13묶음 | 테스트 |
| `scripts/consult-selftest.mjs` | 위 셀프테스트를 한 줄로 불러 CI(build-check)에 배선 | 테스트 |
| `scripts/story-flow-samples.mjs` (새) | 2-7 전/후 샘플 생성기(픽스처 또는 `--db`) | 스크립트 |
| `scripts/story-flow-quote-check.mjs` (새) | 2-8 인용 검증기 CLI | 스크립트 |
| `fixtures/story-flow/cards.json` (새) | **합성** 카드 7·진단 2(영역② sales_assistant, 영역⑤ review_writing) — 실제 회사·인용 아님 | 픽스처 |
| `reports/2026-11-19-v71cu/story-flow-samples/` | 오프라인 샘플 4개(`area2_sales_assistant.md/.json`, `area5_review_writing.md/.json`) | 산출 |

## 항목별

- **2-2 성능** — `story_flow_cards_mat` = 기존 뷰 `story_flow_cards` 전부 + `ss_story_labels.created_at`(최신성 칸용). 인덱스 `(chapter, weight)`·`(slug)`.
  로더 `fetchFlowCards` 는 사본을 먼저 읽고, 없거나 오류면 기존 뷰로 폴백, 둘 다 실패면 던진다(→ `not_run`, §7.1).
  **새로 고침(문서 한 줄): 꼬리표 회차 적재 뒤 `REFRESH MATERIALIZED VIEW public.story_flow_cards_mat;`**
  고유 인덱스가 없어 `CONCURRENTLY` 는 못 쓴다(새로 고치는 동안 사본 읽기가 기다린다) — 중복 0건 확인 뒤 `(source_key,slug,label_run,chapter)` 고유 인덱스를 더하면 된다.
- **2-3 점수식** — `scoreCard = 0.35·weight/100 + 0.30·situationMatch(모름 0.5) + 0.15·mechanism(진단 원리 모름 0.5) + 0.15·증거(A1·B0.6·C0.3, grain=signal 이면 0, 그 장 결과 있는 에피소드 최댓값) + 0.05·최신성(created_at 3년 선형, 없으면 0.5)`.
  **공존 방식:** `similarity`/`persuasion`/`pickFlowCards` 는 지우지 않았고 `loadStoryFlow`(기존 진입점)가 계속 쓴다. 새 결론서 경로(`selectStoryFlow`)만 `scoreCard` 로 정렬하고, `persuasion` 은 동점 처리·표시용으로, `similarWhy`/`persuasiveWhy` 는 이유 두 줄로 재사용한다.
  회사당 1장: `dedupeBySlug` 가 같은 slug 중 점수 최고 1장만 남긴다(장이 여러 개인 병목에서도).
- **2-4 폴백** — story flow 카드(적격·원리 없는 다른 업종 제외·회사당 1장)가 3장 이상이면 그것만 쓴다(폴백 로더 호출 0). 모자라면 `ss_move_tags_current`(+ `ss_moves` 로 slug·회사명) → `case_bank`(`case_retrieve` RPC) 순으로 채운다. 후보가 2장 이상이고 안 된 시도(negative·mixed)가 후보에 있으면 3건 안에 1건 넣는다. DB 로더는 `Loaders` 로 주입, 기존 `retrieveSimilar`·`loadStoryFlow` 코드는 안 건드림.
- **2-5 최종 선택** — 정렬 = 병목 장(주된 장 먼저) → score → 상황 일치 → 설득력. 추천 1 + 대안 2, 건마다 `reasons:[비슷한 이유, 설득력 이유]`.
- **2-6 결론서 연결** — `compose.ts` 의 ③ 칸만. 깃발이 정확히 `'true'` 일 때만 `selectStoryFlow`, 결과가 `ok` 가 아니면(장 못 정함·부족·조회 실패) 기존 `retrieveSimilar` 로 폴백. 화면(`/r/{token}`)은 `ch1.similar` 의 name·what·why 만 그리므로 렌더러 변경 없음. 원문 인용·점수는 `payload.story_flow` 에만 남는다(화면 비노출).
  병목 장: 콜드메일 결론서엔 상황 질문 답이 없어 **1장 Fit 끊긴 단계 → 장 임시 대응**(1→4장, 2→5장, 3→6장, 4→7장, 0·⬜ → 장 없음 = 기존 경로). 상황 답(`bottleneck`)이 들어오면 `BOTTLENECK_CHAPTERS` 가 우선.
- **2-7 샘플** — 오프라인(합성 픽스처) 생성 완료. 영역②: 전/후 모두 3건(후는 점수 표시·회사당 1장 적용). 영역⑤: 전 `insufficient`(카드 2장) → 후 `ok`(story flow 1 + 꼬리표 1 + 사례 은행 1, 폴백 순서 확인). 실데이터 샘플은 아래 명령으로 오케스트레이터가 만든다.
- **2-8 인용 검증** — `verifyQuotes(payload, 원문)` 은 payload 안의 모든 `quote:{slug,episode_idx,text}` 를 원문 `quote_orig` 와 대조(공백·따옴표 모양만 정규화). 다르면 `text_differs`, 원문·에피소드를 못 찾으면 `source_missing`/`episode_missing` = **실패**. CLI 종료 코드 0/1/2.

## 테스트 결과

- `node scripts/consult-selftest.mjs` → **통과 226건 / 실패 0** (작업 전 225건 + 새 묶음 1건). CI `build-check.yml` 이 이 파일을 돈다.
- `node scripts/story-flow-selftest.mjs` → 기존 10묶음 **전부 통과**(⑨ 조회 실패 → `not_run` 도 사본·뷰 두 곳 모두 실패하는 경로로 유지).
- `node scripts/story-flow-select-selftest.mjs` → 새 13묶음 **전부 통과**: ①점수식 정확값 ②모름 0.5·signal 0 ③회사당 1장 ④3장 이상이면 폴백 미호출 ⑤안 된 시도 포함 ⑥원리 없는 다른 업종 제외 ⑦폴백 순서 move_tags→case_bank ⑧조회 실패 not_run ⑨깃발 OFF·'TRUE' 면 story flow 미호출·legacy 결과 그대로 ⑩진단→장 ⑪mat→뷰 폴백 ⑫인용 일치/불일치/원문 없음 ⑬코드 기본 OFF·워크플로가 깃발을 켜지 않음·마이그가 기존 뷰를 바꾸지 않음.
- `story-flow-quote-check.mjs`: 샘플 → 0(3건 일치) · 원문 한 단어 바꾼 사본 → 1(불일치 1건).
- 타입: 바뀐 TS 3파일만 `tsc --noEmit`(전체 빌드는 메모리 때문에 생략) 오류 0 · `eslint` 바뀐 7파일 오류 0.
- "consult-selftest 회귀 6개": 그 이름의 6건 묶음은 파일에 없다. 작업 전 실측은 **225건**, v71ct 관련 회귀는 2줄(`v71ct: story-flow 회귀 10건…`, `v71ct: story-label 자동 검사…`). 지시서의 "6개"가 무엇을 가리키는지는 미확인.

## 오케스트레이터가 DB 에서 할 일 (서브에이전트는 하지 않았다)

1. 적용 전 실측: `SELECT to_regclass('public.story_flow_cards'), to_regclass('public.story_flow_cards_mat');` (앞은 있어야, 뒤는 NULL 이어야)
2. 적용: `supabase db query --linked -f supabase/migrations/20261119000030_story_flow_cards_mat.sql` (또는 SQL Editor) — 대상 `qmgrfqjfxqhxuufrnkwf`. 비파괴(새 사본·인덱스만), §10.2 예외 1~8 해당 없음 판단.
3. 적용 후 양성/음성: 마이그 하단 쿼리 4개(존재·행 수 일치·EXPLAIN 인덱스 사용·anon SELECT=false).
4. 실데이터 샘플(읽기 전용): `node --env-file=.env.local scripts/story-flow-samples.mjs --db --out reports/2026-11-19-v71cu/story-flow-samples-db` — 진단은 픽스처의 영역②·⑤ 두 개를 쓴다.
5. 실데이터 인용 검증: `node --env-file=.env.local scripts/story-flow-quote-check.mjs --payload reports/2026-11-19-v71cu/story-flow-samples-db/area2_sales_assistant.json --db` (⑤도 같은 식), 깃발 ON 결론서는 `--token <token> --db`.
6. 회차 적재 뒤마다: `REFRESH MATERIALIZED VIEW public.story_flow_cards_mat;`
7. `docs/migration-exceptions.md` 한 줄 · Notion 일일 상태 로그.

## 롤백

- 동작: **깃발 OFF**(`STORY_FLOW_ENABLED` 를 비우거나 `'true'` 아닌 값) → 결론서는 기존 `retrieveSimilar` 경로 100%. 지금 이미 OFF.
- DB: `20261119000030_story_flow_cards_mat_rollback.sql`(사본만 DROP) — 로더는 자동으로 기존 뷰로 돌아간다.
- 코드: PR revert.

## 미확인 · 주의

- Notion 지시서 §4 원문 대조 안 함 — 특히 (a) 최신성의 기준 시각(지금은 꼬리표 단 시각 대용, 원 게시일 칸 없음) (b) mechanism 모름을 0.5 로 둔 것 (c) Fit 단계→장 임시 대응표 (d) "회귀 6개"의 정체.
- `story_flow_cards` 뷰가 실제로 몇 초 걸리는지, 사본 생성이 10분 안에 끝나는지 실측 안 함. 사본은 기존 뷰에 의존하므로 앞으로 `story_flow_cards` 를 `CREATE OR REPLACE` 로 열 구성을 바꾸려면 사본을 먼저 DROP 해야 한다.
- `case_bank` 폴백은 `case_retrieve` 를 카테고리 없이 부른다(관련성 약함, 결과 grade·outcome 만 씀). `ss_move_tags_current` 폴백은 장 비중을 몰라 weight=50(모름)으로 둔다. 두 원천의 slug 체계가 달라 같은 회사가 story flow 와 case_bank 에 한 번씩 나올 수 있다.
- story flow 카드의 화면 이름은 slug 그대로다(카드에 회사명 칸이 없다).
- 원문 인용(`quote_orig`)은 `payload.story_flow` 에만 있고 화면에 안 나간다. 화면에 인용을 내기로 하면 소스별 인용 허용(`quote_allowed`) 판단이 먼저다.
- PR CI 결과는 PR 본문/보고 참조.

## 수정 이력 — 독립 검수(F1~F7) 반영, 2026-11-19

깃발은 계속 OFF. DB 접근·마이그 적용 없음. 모두 추가 방식이다. 기존 `similarWhy`/`persuasiveWhy` 는 손대지 않았고, 새 경로는 V2 함수를 쓴다.

- **F1 반영.** 새 경로의 이유 문장을 `similarWhyV2`·`persuasiveWhyV2` 로 바꿨다.
  - "다른 업종, 같은 원리:" 는 진단 원리가 있고, 기준 에피소드의 원리와 실제로 같을 때만 붙는다. 그 밖에 R1 이 아닌 카드는 "다른 업종:" 만 붙는다.
  - 조사는 받침 판별 함수 `iGa` 로 고른다(팀 크기가·단계가·손님이).
  - 카드마다 기준 에피소드 하나(`anchorEpisode`)를 정한다. 기준 순서는 grain → 증거 → 원문 있음 → 번호다. 요약·인용·설득력 이유를 모두 그 에피소드에서 뽑는다.
  - 남는 것: 옛 `similarWhy` 의 조사 오류는 그대로다. 옛 함수는 `loadStoryFlow` 만 쓰고, 프로덕션에서 부르는 곳은 없다.
- **F2 반영.** `displayName` 을 추가했다.
  - UUID 꼬리, 숫자가 섞인 6자 이상 16진 해시 꼬리, `case_bank:` 접두를 뗀다. 남은 게 없거나 기계 문자열이면 "비슷한 사례 N" 으로 쓴다.
  - 노출 지점은 `compose.ts` 의 `toItems: selectionToSimilar` 이고, 그 안에서 `displayName` 을 적용한다.
  - `payload.story_flow` 의 slug 는 내부용으로 남긴다. 화면에는 나가지 않는다.
- **F3 반영.**
  - `verifyQuotes` 는 기본이 strict 다. 원문 전체, 또는 연속된 문장 단위와 같아야 통과한다. 문장 중간에서 자른 발췌는 `not_sentence` 로 떨어진다.
  - `--loose` 는 부분 문자열을 허용하되 경고를 단다(`mid_clause`·`short_excerpt`(40% 미만)·`negation_nearby`).
  - 인용 0건이면 `no_quotes` 로 실패하고 종료 1이다. 샘플 생성기 안의 자체 대조는 0건을 허용하고 "독립 검증 아님"으로 표기한다.
  - `--db` 는 원본 표 `ss_episode_tags` 를 다시 읽는다(source_key·label_run·episode_idx 까지 대조). 인용에는 source_key·label_run 을 싣는다.
  - 원천 허용 목록: 상수 `QUOTE_SOURCE_ALLOWLIST=['starterstory']`, env `STORY_FLOW_QUOTE_SOURCES`(쉼표, 덧붙이기만)로 늘릴 수 있다. source_key 가 없는 카드는 막는다(fail-closed).
  - 허용 목록은 story flow 카드(원문 인용을 가진 원천)에만 걸린다. 꼬리표·사례 은행 폴백은 인용이 없고, 사례 은행은 기존 legacy 경로와 같은 내용이라 걸지 않았다.
  - starterstory 자체의 `quote_policy` 는 여전히 **확인불가**다(DB 미접근).
- **F4 반영.**
  - `fetchFlowCards` 는 `.order('slug').order('label_run').order('source_key')` 로 쪽 순서를 고정한다. 꼬리표 폴백은 `.order('move_id')` 를 쓴다.
  - 기존 `story-flow-selftest` ⑨ 의 가짜 클라이언트에 `order` 를 더했다. 이유: 이게 없으면 TypeError 로 우연히 `not_run` 이 나서, 의도한 실패 경로를 시험하지 못한다.
- **F5 반영.**
  - 새 파일: 마이그 `20261119000031_story_flow_refresh_fn.sql`(+롤백). `refresh_story_flow_cards_mat()` 함수이고 SECURITY DEFINER, search_path='', statement_timeout 600s, 실행 권한은 service_role 만이다. **미적용**이다.
  - 새 스크립트 `scripts/story-flow-refresh.mjs`:
    - 기본: rpc 로 새로 고친 뒤 원본 뷰 행 수와 대조한다. 같으면 0, 다르면 1, 확인 불가면 2.
    - `--skip-compare`: 원본 뷰 대조를 건너뛴다.
    - `--print`: 함수가 없을 때 쓸 SQL 한 줄을 낸다.
  - **부르는 지점:** `scripts/story-label.mjs` 회차 적재가 끝난 직후, 오케스트레이터가 `node --env-file=.env.local scripts/story-flow-refresh.mjs` 를 한 번 돌린다. 워크플로 배선은 하지 않았다. story-label 은 대화형으로만 돈다.
- **F6 반영(옵션) + 조사(제안만, 구현 안 함).**
  - `story-flow-samples.mjs --real-diagnosis` 를 추가했다. 픽스처 `real_inputs` 로 `diagnosisFromReport` 를 그대로 거친 진단(장 + 단계만)을 만든다. 파일 이름은 `<영역>-real.md/.json` 이다.
  - 오프라인 결과는 `story-flow-samples/area2_sales_assistant-real.*`·`area5_review_writing-real.*` 다. 실데이터는 오케스트레이터가 `--db --real-diagnosis` 로 돌린다.
  - 진단 칸을 더 채울 수 있는 곳:
    - **손님·과금:** `lib/consult/discover.ts` `inferStructure(one_liner)` 가 이미 buyer_type·pricing_model 을 낱말로 뽑는다. buyer_type→customer 대응표(smb_owner→smb 등)가 필요하다.
    - **값대:** `ch1.viability.segment`(P/S/M/E)를 쓸 수 있다. 다만 P=월 $50 미만이 `<10`·`10-49` 둘에 걸쳐 있어 거칠다. P→모름, S/M/E→`250+` 정도만 안전하다.
    - **팀 크기:** 콜드메일 경로에는 근거가 없다. 유료 상황 질문(`situation.ts` team_size·customer_type·price_band·bottleneck)의 답이 run 에 연결되면 거기서 채울 수 있다. 연결 위치는 미확인이다.
    - **원리(mechanism):** 진단 쪽 어휘가 없다. `cases.ts` 의 MECHANISMS 는 다른 어휘 체계라 그대로 쓸 수 없다. 원리 항은 당분간 0.5 상수로 남는다.
- **F7 미반영(지시대로 가중치 유지), 설계 한계로 명시.**
  - 최신성(0.05)은 원 게시일이 아니라 꼬리표를 단 시각이다. 모든 카드가 2026-11 에 꼬리표를 받아 사실상 상수다.
  - 원리(0.15)는 실제 진단에 원리가 없어 0.075 상수다.
  - 그래서 실제 경로의 순위는 `0.35·weight + 0.30·상황(단계 하나만 실효) + 0.15·증거` 로 정해진다.
  - 기존 `similarity` 에 있던 역경 텍스트 일치(0.25)와 R1 우선은 새 점수식에 없다(지시서 점수식 그대로).

### 수정 후 테스트
- `consult-selftest`: 226/226 통과. 새 테스트는 기존 `story-flow-select-selftest` 묶음 안에 들어가 줄 수는 그대로다.
- `story-flow-selftest`: 통과.
- `story-flow-select-selftest`: 기존 ①~⑬ + 새 F1~F6 검사 전부 통과.
- tsc(바뀐 TS 3파일) 오류 0, eslint(바뀐 파일) 오류 0.
- 인용 CLI: 인용 0건 → 종료 1. 문장 중간 발췌 → `not_sentence`.

### 오케스트레이터 몫(추가)
1. 마이그 `20261119000031_story_flow_refresh_fn.sql` 적용 여부를 판단한다. 비파괴이고 함수 하나뿐이다. 적용 뒤 하단 양성·음성 쿼리를 돌린다.
2. `node --env-file=.env.local scripts/story-flow-samples.mjs --db --real-diagnosis --out reports/2026-11-19-v71cu/story-flow-samples-db`
3. `node --env-file=.env.local scripts/story-flow-quote-check.mjs --payload reports/2026-11-19-v71cu/story-flow-samples-db/area2_sales_assistant-real.json --db` — 영역⑤도 같은 식으로. 이번 대조는 원본 표로 하는 독립 대조다.

## 수정 이력 2 — 재검수(G1~G4) 반영, 2026-11-19

점수식(0.35/0.30/0.15/0.15/0.05)은 바꾸지 않았다. 깃발은 OFF, 머지·DB·마이그 적용은 없다.

- **G1 반영.** 기준 에피소드가 negative·mixed 인 카드는 payload 에 `failed:true`·`fail_kind` 를 남긴다.
  - 화면 칸 `what` 앞에 문구가 붙는다: negative 는 "이 사례는 잘 안 풀린 경우입니다", mixed 는 "이 사례는 반쯤만 풀린 경우입니다".
  - 추천 자리뿐 아니라 대안 자리에도 붙는다.
- **G2 반영.** 점수가 같을 때 순서를 정하는 규칙만 바꿨다(점수 불변): ①상황 일치 → ②진단 단계와 같은 카드 → ③증거 등급 → ④slug.
  - 예전 규칙의 설득력·slug 순서는 빠졌다.
- **G3 반영(기본 OFF, 남헌 결정 대기).** `selectStoryFlow(…, { stageFirst: true })` 와 `stageFirst()` 를 추가했다.
  - 진단 단계를 알고 있는데 1순위 카드의 단계가 알려진 다른 값이면, 2순위가 그렇지 않을 때만 둘의 자리를 바꾼다.
  - 카드 단계가 모름이면 다르다고 보지 않는다.
  - `compose.ts` 는 이 옵션을 켜지 않는다(셀프테스트로 고정).
  - 샘플 두 벌 만들기: `story-flow-samples.mjs [--db] --real-diagnosis` 로 한 번, 같은 명령에 `--stage-first` 를 붙여 한 번 더 돌린다. 두 번째 파일은 `-stagefirst` 로 끝난다.
  - 오프라인 결과는 `story-flow-samples/*-real-stagefirst.*` 다(합성 픽스처라 OFF 결과와 같다).
- **G4 반영.** 선택이 끝난 뒤 저장본을 정리한다.
  - `slug` 는 `cleanSlug`(UUID·해시 꼬리 제거)로, `name` 은 `displayName` 으로 바꿔 저장한다.
  - 원문 slug 는 내부 키 `slug_internal`(카드·인용 둘 다)에만 남긴다. dedupe·폴백 중복 제거·인용 검증은 `slug_internal` 로 한다.
  - 화면 렌더 경로 `selectionToSimilar` 의 출력에는 `slug_internal` 도 UUID 도 없다(셀프테스트로 고정).
- 테스트: `consult-selftest` 226/226, `story-flow-selftest` 통과, `story-flow-select-selftest`(기존 + G1~G4) 통과. tsc·eslint 0.
- 오케스트레이터 몫: 실데이터로 `node --env-file=.env.local scripts/story-flow-samples.mjs --db --real-diagnosis --out reports/2026-11-19-v71cu/story-flow-samples-db` 를 돌리고, 같은 명령에 `--stage-first` 를 붙여 한 번 더 돌린다. 두 결과(OFF/ON)를 남헌이 비교해 정한다.
