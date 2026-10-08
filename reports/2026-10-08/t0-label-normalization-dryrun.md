# T0 라벨 정규화 — 드라이런 (v37 작업 2, 2026-10-08)

> 서브에이전트 산출물이다. **DB 에 아무것도 쓰지 않았다**(서비스키 없음·DB 접근 없음). 적용은 남헌 승인 뒤 오케스트레이터.
> 입력: 오케스트레이터가 뽑은 `review_targets` 84행(id·project_id·source_key·label·status) + `data/area-map-v26.json`.
> 설계: `english-expansion-design-v31.md` §1-5·§T0. 마이그: `supabase/migrations/20261008000010_review_targets_label_normalize.sql`(+`_rollback.sql`).

## 결론

- **변경 58 · 보류 26 · 충돌 0** (84행 전부 분류됨, 해석 실패 0).
- 바꿔도 깨지는 곳은 **없다 — 머지 차단급 0건**. label 은 UNIQUE·커서·지문·멱등·프로젝트 재사용 어디에도 열쇠로 안 쓰인다(§3).
- 코드 수정 0건. 투입기는 이미 새 형식(`${태그}:${slug}`)으로 쓰고 멱등 키가 (source_key, product_ref)라 재실행해도 중복이 안 생긴다.

## 1. 규칙

- 옛 형식은 #443(v27, `dade32c`) 이전 투입기가 만든 것이다 — 그때 label 은 `${사전 영역 파일}:${slug}` 였다(`01-meeting-notes`·`07-ecommerce-ops`).
- 새 label = `<지도 값>:<slug>`, us-en 은 `<지도 값>:us-en|<slug>`. 지도 값은 사전 번호(01~07)가 아니라 `data/area-map-v26.json` 값이다.
- 지도 값이 `"1"`~`"5"` 인 slug 만 바꾼다. `hold`·`out`·`null`·지도에 없음 은 **그대로 두고** 아래 보류 목록에 적는다(⑥⑦ 보류·삭제 금지).
- 영역 판독 `^([1-5]):`(target-supply.ts:175-178)에 새 label 58개가 전부 걸리는 것을 생성 단계와 마이그 DO 블록 ②에서 둘 다 확인한다.

## 2. 영역별 건수

- 영역 1(회의록) — 56행: `01-meeting-notes:*` 전부(slug 29개, us-en 4행 포함). 지도에 01 slug 가 전부 `"1"` 로 있다.
- 영역 3(마케팅) — 2행: `07-ecommerce-ops:triple-whale`(appstore·googleplay). 07 slug 13개 중 지도 값이 숫자인 것은 이것 하나다.
- 보류(out) — 26행: 07 의 나머지 12 slug. aftership · ezadmin · helium-10 · itemscout · linnworks · pandarank · playauto · sellerbox · sellmate · sello · shipstation · shopmoa — 지도 값 전부 `out`. `hold`·`null`·지도에 없음 은 0행.
- us-en 7행: 변경 4(granola·meeting-os·read-ai·tldv → `1:us-en|…`) · 보류 3(helium-10·linnworks·shipstation, out).
- 소스별: 변경 = appstore 26(전부 exhausted) + googleplay 32(전부 active). 보류 = appstore 12(exhausted) + googleplay 14(active).
- target-supply 에 미치는 영향(areaOf 는 active 만 센다): googleplay active 의 unmapped 가 32 줄고 영역 1 이 +31, 영역 3 이 +1. appstore 는 전부 exhausted 라 영역 집계 변화 없음. DB 전체 숫자는 확인 불가(입력이 이 84행뿐) — 적용 뒤 `node scripts/target-supply.mjs` 의 "영역 활성" 줄로 본다.

## 3. 라벨이 열쇠로 쓰이는가 — 코드 감사

판정 표기: **영향 없음** = label 을 안 읽거나 표시만 / **의도된 변화** = 읽지만 정규화가 목적대로 바꾼다 / 차단급 = 바꾸면 깨진다.

- DB 제약 — 영향 없음. `review_targets` UNIQUE 는 `(project_id, source_key, product_ref)` 하나뿐(20260829000003:127-128). label 에 걸린 인덱스·제약은 마이그 전체에 없다(grep: 마이그 안 label 은 INSERT 열 목록·COMMENT 뿐). 인덱스는 `review_targets_due_idx (source_key, last_run_at)`(:132-134).
- 수집 러너·커서·증분 종료 — 영향 없음. store 가 읽는 열이 `id, project_id, source_key, product_ref, cursor, last_review_at, consecutive_empty, total_collected`(lib/review/store.ts:55)이고 label 이 없다. runner.ts:877 의 `label` 은 로그 문자열용 지역 변수다. 커서·증분 종료는 `cursor`·`last_review_at`.
- 중복 제거(지문) — 영향 없음. `review_fingerprints` UNIQUE `(source_key, identity_key)`(20260829000003:270-271), identity_key = `sha256(sourceKey|externalId)` 또는 `sha256(sourceKey|productRef|externalId)`(lib/review/fingerprint.ts:113-116). label 이 안 들어간다.
- upsert/onConflict — 영향 없음. `lib/review/` 에 review_targets onConflict 0건. v44 us:en 마이그는 `ON CONFLICT (project_id, source_key, product_ref)`.
- 투입기 `scripts/dictionary-targets.mjs` — 영향 없음(중복 안 생김).
  - 지금 쓰는 label 은 이미 새 형식 `${tag}:${p.slug}`(:141). 옛 형식을 다시 INSERT 하는 경로가 없다.
  - 멱등 키 = `(source_key, product_ref)` — `loadExisting`(:289-299)이 label 없이 대조하고 `exists` 로 건너뛴다(:178). INSERT 23505 도 exists(:317). 주석 :26-28.
  - 프로젝트 재사용 키 = `analysis_projects.product_elevator_pitch`(findProjectsByPitch :300-311, pitch = `name — summary_ko` :122). label 이 안 들어간다. `projectKey: base.label`(:171)은 드라이런 요약의 프로젝트 수 세기에만 쓴다(:204).
  - 결론: 정규화 뒤 재실행해도 이미 있는 (source, ref) 는 exists 로 빠진다 — label 이 달라도 새 행이 안 생긴다.
- 공급 판정 `lib/review/target-supply.ts` — **의도된 변화**. areaOf(:175-178)가 label 접두로 영역을 읽어 소스별 area_active(:268-269)·영역 최소 할당·unmapped≥50% 판정(:302-313)을 만든다. 출력은 리포트(scripts/target-supply.mjs:89-90)뿐이고 자동 행동(투입·되살리기)은 영역 수치를 안 쓴다(`.areas` 소비처 grep: target-supply.mjs 출력·selftest 뿐).
- 사전필터 `lib/analysis/prefilter.ts` areaOfProject(:276-279) — **의도된 변화**. 정규식이 `^([^:\s]+):` 라 옛 label 은 `01-meeting-notes` 를 영역으로 읽었다. 정규화 뒤 `1`·`3`. 소비처는 오탈락 표본 층화(scripts/prefilter-falsedrop-sample.mjs:55-56) — 섀도 모드 표본의 층 이름이 바뀔 뿐이다. 한 프로젝트에 옛·새 label 이 섞이면 `mixed` 가 되는데, 이번 변경은 slug 단위로 그 slug 의 모든 소스 행을 같이 바꾸므로 84행 안에서는 안 섞인다. 84행 밖에 같은 프로젝트 행이 있는지는 **확인 불가** → 마이그 '적용 전' 마지막 쿼리로 본다.
- ramp(`lib/review/ramp.ts`)·request-cap(`lib/review/request-cap.ts`·`scripts/review-request-cap.mjs`)·되살리기(`scripts/target-revive.mjs`) — 영향 없음. label 참조 0건(grep).
- 야간 워크플로 `.github/workflows/nightly-review-collect.yml` — 영향 없음. label 참조 0건, 주석에 review_targets 언급 1줄(:141).
- 발굴 `scripts/discovery-run.mjs:499` — 영향 없음. label 에 `row.name` 을 쓰기만 하고 읽지 않는다(접두 없는 unmapped, 이번 범위 밖).
- 수동 등록 API `app/api/analyze/targets/route.ts:116` — 영향 없음. 요청 body 의 label 을 그대로 저장·표시.
- v44 us:en 마이그 2차 블록(origin/feat/v44-googleplay-us-en-targets, 하단 주석·미실행) — **개선**. 새 label 을 `split_part(k.label, ':', 1)`(kr:ko 원본 접두)로 만든다. 정규화 뒤 원본이 `1:krisp`·`3:triple-whale` 이 되므로 2차는 손대지 않아도 `1:us-en|krisp`·`3:us-en|triple-whale` 로 나온다(설계 T0 "라벨 식을 영역번호로" 요구가 저절로 충족). DO ⑥ 정규식 `^([^:|]+:)?us-en\|.+$` 도 그대로 통과.
- v44 롤백 식별자 `label LIKE '%us-en|%'`(reports/2026-10-08/20261008000001_googleplay_us_en_targets_rollback.sql:24) — 영향 없음. `1:us-en|granola` 도 걸린다.
- `analysis_projects.product_elevator_pitch` — 영향 없음. 이 마이그는 analysis_projects 를 건드리지 않고, pitch 는 label 로 만들지 않는다.

확인 불가: 리포 밖(Supabase 대시보드 저장 쿼리·Notion·외부 스크립트)에서 `label = '01-meeting-notes:…'` 로 찾는 곳이 있는지. 리포 안 reports/ 의 과거 SQL 은 기록물이라 고치지 않는다.

## 4. 충돌

- 84행 안: 변경 후 (source_key, label) 중복 **0쌍**. 같은 slug 의 kr·us-en 은 `1:granola` vs `1:us-en|granola` 로 갈린다.
- DB 전체: 확인 불가(입력이 84행뿐). 마이그 DO 블록 ③이 적용 순간에 DB 전체를 세고 1쌍이라도 있으면 RAISE → 전부 롤백한다. 충돌은 제약 위반이 아니지만 드라이런과 다르면 멈추고 보자는 뜻이다.

## 5. 마이그레이션 요약

- `ALTER TABLE … ADD COLUMN IF NOT EXISTS label_original text NULL` → 58행만 `label_original = label`, `label = 새 값`. WHERE = id ∧ source_key ∧ 현재 label = 옛 값 ∧ label_original IS NULL. 한 트랜잭션.
- DO 블록: ① 58행 최종 상태(새 label ∧ 원본 보존) ② 새 label `^[1-5]:` ③ (source_key, label) 중복 0. 하나라도 틀리면 RAISE.
- 재실행 멱등(이미 바뀐 행은 0행 갱신, 최종 상태만 다시 확인). 그 사이 누가 label 을 고쳤으면 RAISE.
- 롤백: 58개 id ∧ label = 새 값 ∧ label_original = 옛 값 인 행만 `label = label_original, label_original = NULL`. 열은 남긴다. 그 뒤 손댄 행은 덮어쓰지 않고 NOTICE.
- §10.2 판단 재료: 58행 label 한 열 UPDATE(원본 보존·롤백 동반) — 예외 2번 "대량 UPDATE" 4조건(드라이런=이 문서·롤백=파일·무중단=제약/인덱스 무관·Notion 기록) 대상.

## 6. 셀프테스트 (PGlite = WASM Postgres, 리포 밖 일회성 하네스)

입력 84행 + 무관한 행 5개(`2:us-en|gong`·`3:klaviyo`·NULL·`Baremetrics`·`1:supernormal`)를 넣고 실제 마이그·롤백 파일을 그대로 실행:

```
PASS 정방향: label_original 58
PASS 정방향: ^01- 0
PASS 정방향: ^07- 26(out 보류)
PASS 정방향: 영역 1=56 · 3=2
PASS 정방향: us-en 4행 1:us-en|
PASS 음성: 다른 행 불변(개수·해시) — 31/31
PASS 재실행 멱등: 여전히 58
PASS 롤백: 84 옛 라벨 복원·전체 해시 원상
PASS 롤백: label_original 전부 NULL·열은 남음
PASS 롤백 재실행 무해
PASS 드리프트: RAISE + 전부 롤백
PASS 충돌: (source_key,label) 중복이면 RAISE
ALL PASS
```

- 첫 실행에서 무관 행으로 `1:otter-ai`(googleplay)를 넣었더니 DO ③이 "중복 1쌍"으로 멈췄다 — 충돌 검사가 실제로 걸리는 것을 확인한 셈이고, 무관 행을 `1:supernormal` 로 바꿔 다시 돌렸다.
- 한계: 테이블은 이 검사에 필요한 열·제약만 재현했다(FK·RLS·다른 열 없음). 실 DB 적용 전 '적용 전' 쿼리 4개를 먼저 돌린다.
- 기존 셀프테스트(코드 무변경 확인): target-supply 79/0 · dictionary-targets 73/0 · prefilter 108/0.

## 7. 행 목록 (84행)

### 변경 58

- 변경 · appstore · `01-meeting-notes:adot` → `1:adot` · exhausted · id 9ed187b2-7100-4b08-a56d-4b73149624ee
- 변경 · googleplay · `01-meeting-notes:adot` → `1:adot` · active · id 7a8996d5-ed2f-4558-a826-dd06ce6d1e12
- 변경 · appstore · `01-meeting-notes:avoma` → `1:avoma` · exhausted · id 3e27b97a-51a4-46b1-a216-1f77b1354f63
- 변경 · googleplay · `01-meeting-notes:avoma` → `1:avoma` · active · id 2f8e8631-769d-4212-9e36-cdf7598252fc
- 변경 · appstore · `01-meeting-notes:bluedot` → `1:bluedot` · exhausted · id a03d42b8-bd1c-4609-904a-308a4afb3403
- 변경 · googleplay · `01-meeting-notes:bluedot` → `1:bluedot` · active · id 85457838-262e-447c-a9a8-144d625fbb6b
- 변경 · appstore · `01-meeting-notes:callabo` → `1:callabo` · exhausted · id b4109e76-745b-48cc-b67d-6fb86286696d
- 변경 · googleplay · `01-meeting-notes:callabo` → `1:callabo` · active · id 0cf9129c-b3b2-4ec7-8504-cc0f73c0a951
- 변경 · googleplay · `01-meeting-notes:callog` → `1:callog` · active · id 7da3e4b4-abea-48de-9870-37724d3a43f5
- 변경 · appstore · `01-meeting-notes:circleback` → `1:circleback` · exhausted · id edce8b2b-e69a-405e-a13b-c40ab69c2f7c
- 변경 · googleplay · `01-meeting-notes:circleback` → `1:circleback` · active · id bea4dea8-b0f7-4343-9d04-ee507e8f73e4
- 변경 · appstore · `01-meeting-notes:clova-note` → `1:clova-note` · exhausted · id 390b32ad-a86e-4044-b9c3-9e17007f3d1f
- 변경 · googleplay · `01-meeting-notes:clova-note` → `1:clova-note` · active · id 34b6c17a-914e-4f99-9521-df309d5a8559
- 변경 · appstore · `01-meeting-notes:daglo` → `1:daglo` · exhausted · id d390ef97-49cc-4ea1-b739-2ad712053841
- 변경 · googleplay · `01-meeting-notes:daglo` → `1:daglo` · active · id 914bcf4d-649c-4041-86bf-0cb3b73e9f1c
- 변경 · appstore · `01-meeting-notes:fathom` → `1:fathom` · exhausted · id 63b75d14-8dfc-4971-b469-14175ee14193
- 변경 · appstore · `01-meeting-notes:fellow` → `1:fellow` · exhausted · id 9b8ef541-4343-400a-9082-5c8a4b91b1c5
- 변경 · googleplay · `01-meeting-notes:fellow` → `1:fellow` · active · id b56092b8-a5cd-430b-b63d-d4b46ecb97bc
- 변경 · appstore · `01-meeting-notes:fireflies-ai` → `1:fireflies-ai` · exhausted · id 19bc2c00-2518-448f-9cfe-7073704d927d
- 변경 · googleplay · `01-meeting-notes:fireflies-ai` → `1:fireflies-ai` · active · id 9468b0ea-5df2-4a9d-b80a-9949dd80a5d9
- 변경 · appstore · `01-meeting-notes:granola` → `1:granola` · exhausted · id d1622847-8988-4d21-b389-7969a484e4ac
- 변경 · googleplay · `01-meeting-notes:granola` → `1:granola` · active · id 404123b9-3ba0-487f-8e48-15f7b175d215
- 변경 · googleplay · `01-meeting-notes:us-en|granola` → `1:us-en|granola` · active · id 8c819671-3158-41f8-ad17-d66c5afaea50
- 변경 · appstore · `01-meeting-notes:hoirock` → `1:hoirock` · exhausted · id fb61b71c-7e00-4814-9414-2cc82970138f
- 변경 · googleplay · `01-meeting-notes:hoirock` → `1:hoirock` · active · id 2fd10519-85d1-4f3d-badd-eee86dc4f9c3
- 변경 · appstore · `01-meeting-notes:ixio` → `1:ixio` · exhausted · id c6875e78-1706-4e7f-b102-0c2c6d771886
- 변경 · googleplay · `01-meeting-notes:ixio` → `1:ixio` · active · id 65393347-5555-4c8c-883e-547687bae24d
- 변경 · appstore · `01-meeting-notes:jamie` → `1:jamie` · exhausted · id fd75779f-d0b2-423d-abe2-db34f7a110a1
- 변경 · googleplay · `01-meeting-notes:jamie` → `1:jamie` · active · id f397e8f6-4dc4-458a-b3a3-68c774c65a6b
- 변경 · appstore · `01-meeting-notes:krisp` → `1:krisp` · exhausted · id 998e297a-9af5-4368-a9bc-a485ee8d7354
- 변경 · googleplay · `01-meeting-notes:krisp` → `1:krisp` · active · id c66f3f63-2bc7-43b3-9271-cd51630c974b
- 변경 · appstore · `01-meeting-notes:meetgeek` → `1:meetgeek` · exhausted · id 8e9d98da-eca5-4725-9946-270a5aae347d
- 변경 · googleplay · `01-meeting-notes:meetgeek` → `1:meetgeek` · active · id be04065f-5a32-4fb9-8e46-a70a6f01eaa1
- 변경 · googleplay · `01-meeting-notes:meeting-os` → `1:meeting-os` · active · id d1b3ca55-898e-41da-ac72-84382b972cdc
- 변경 · googleplay · `01-meeting-notes:us-en|meeting-os` → `1:us-en|meeting-os` · active · id 0715fe6d-0042-4e75-969c-d7a41b558baa
- 변경 · appstore · `01-meeting-notes:notta` → `1:notta` · exhausted · id a034084b-4e31-445a-9f4c-d7b1568c28cc
- 변경 · googleplay · `01-meeting-notes:notta` → `1:notta` · active · id 0625893b-768f-4a3b-9062-452074b1d27e
- 변경 · appstore · `01-meeting-notes:otter-ai` → `1:otter-ai` · exhausted · id 68e23c87-23de-4dc3-a70a-2b8e6b0fb944
- 변경 · googleplay · `01-meeting-notes:otter-ai` → `1:otter-ai` · active · id 06864918-a985-4ed0-8090-6656cdce135b
- 변경 · appstore · `01-meeting-notes:plaud` → `1:plaud` · exhausted · id c8c4c905-15c1-4944-94d6-9e87c55bc6bb
- 변경 · googleplay · `01-meeting-notes:plaud` → `1:plaud` · active · id 11ec12ba-b4b3-44af-b046-cae12a6802a0
- 변경 · appstore · `01-meeting-notes:read-ai` → `1:read-ai` · exhausted · id 22b3e5e4-fd9a-4d9e-bec9-5c3970ed3974
- 변경 · googleplay · `01-meeting-notes:read-ai` → `1:read-ai` · active · id d69b4673-7b7c-4927-8689-59d8b5b0775c
- 변경 · googleplay · `01-meeting-notes:us-en|read-ai` → `1:us-en|read-ai` · active · id 44be035e-cead-4b5b-920b-6594743ba0b9
- 변경 · appstore · `01-meeting-notes:remember-note` → `1:remember-note` · exhausted · id e15e20ea-d45b-4116-ac4f-bb87699b28b8
- 변경 · googleplay · `01-meeting-notes:remember-note` → `1:remember-note` · active · id d8218846-5cfb-42e3-b279-97b1de4db7da
- 변경 · appstore · `01-meeting-notes:rev` → `1:rev` · exhausted · id 35b22aad-759f-4e5e-a21d-6684fe11090e
- 변경 · googleplay · `01-meeting-notes:rev` → `1:rev` · active · id 07a34412-60f2-418f-83f9-cc94a6805c8f
- 변경 · appstore · `01-meeting-notes:sembly-ai` → `1:sembly-ai` · exhausted · id 6171147e-7ce9-4ce8-90b9-6efee8a5ff44
- 변경 · googleplay · `01-meeting-notes:sembly-ai` → `1:sembly-ai` · active · id ea464383-0e53-4ca4-92a4-525b6ece65d1
- 변경 · appstore · `01-meeting-notes:tiro` → `1:tiro` · exhausted · id 28f43a50-9670-470b-aa45-b1ebba736b22
- 변경 · googleplay · `01-meeting-notes:tiro` → `1:tiro` · active · id d3d6c4a3-3486-4126-82ca-c740e75e79f1
- 변경 · appstore · `01-meeting-notes:tldv` → `1:tldv` · exhausted · id e2ba601b-b251-4380-beaa-ecb615e56c74
- 변경 · googleplay · `01-meeting-notes:tldv` → `1:tldv` · active · id 48ef8d40-2441-4f52-a94a-895da9ecdbb1
- 변경 · googleplay · `01-meeting-notes:us-en|tldv` → `1:us-en|tldv` · active · id ad719988-da5e-4bb2-8110-de8af6d0e239
- 변경 · appstore · `07-ecommerce-ops:triple-whale` → `3:triple-whale` · exhausted · id 55ebf8aa-a3c7-4467-b238-edcf878e00c2
- 변경 · googleplay · `07-ecommerce-ops:triple-whale` → `3:triple-whale` · active · id 7460dec5-43a3-4858-8378-0ed61bb41b90
- 변경 · googleplay · `01-meeting-notes:vito` → `1:vito` · active · id 793fb4ee-707b-4040-9be0-663b0034aaf6

### 보류 26 (지도 값 out — 바꾸지 않음, 삭제 금지)

- 보류(out) · appstore · `07-ecommerce-ops:aftership` 그대로 · exhausted · id dfd23d2e-63ea-4e6c-8ce3-9513cf5676dd
- 보류(out) · googleplay · `07-ecommerce-ops:aftership` 그대로 · active · id d0e3c16a-cf10-46b1-af23-05e3a6de942a
- 보류(out) · appstore · `07-ecommerce-ops:ezadmin` 그대로 · exhausted · id 2494b427-bb16-44f7-99d5-81f71b6a9d52
- 보류(out) · googleplay · `07-ecommerce-ops:ezadmin` 그대로 · active · id 26c4b4e5-eb08-4d52-af3f-dc05f464aed4
- 보류(out) · appstore · `07-ecommerce-ops:helium-10` 그대로 · exhausted · id 36ec9b41-c5c8-42f9-9c58-f6ce5776cdd6
- 보류(out) · googleplay · `07-ecommerce-ops:helium-10` 그대로 · active · id 325be79c-21c3-46eb-abbf-333052878d66
- 보류(out) · googleplay · `07-ecommerce-ops:us-en|helium-10` 그대로 · active · id 1f0cbbdb-96c2-4cf7-8179-4ff8fa2d214d
- 보류(out) · appstore · `07-ecommerce-ops:itemscout` 그대로 · exhausted · id 45e08231-1818-4134-830b-c941afda7403
- 보류(out) · googleplay · `07-ecommerce-ops:itemscout` 그대로 · active · id a6862741-952c-4659-802a-09ab8a2a4aa5
- 보류(out) · googleplay · `07-ecommerce-ops:linnworks` 그대로 · active · id 867e5296-0365-4de7-8c21-975985477763
- 보류(out) · googleplay · `07-ecommerce-ops:us-en|linnworks` 그대로 · active · id 0454be9c-029b-488d-872d-6d75368860ae
- 보류(out) · appstore · `07-ecommerce-ops:pandarank` 그대로 · exhausted · id 0a07a2ac-fdd3-4f9e-a93a-ec9a03fbd3e5
- 보류(out) · googleplay · `07-ecommerce-ops:pandarank` 그대로 · active · id 8d626003-b88a-4b40-a6d0-6b379ea75e4e
- 보류(out) · appstore · `07-ecommerce-ops:playauto` 그대로 · exhausted · id 23954f13-2894-4089-9fd2-00e5f11b1b0b
- 보류(out) · googleplay · `07-ecommerce-ops:playauto` 그대로 · active · id 206a0e84-3523-4f12-aa96-710cd8601871
- 보류(out) · appstore · `07-ecommerce-ops:sellerbox` 그대로 · exhausted · id 996ba187-c184-4811-8241-dc432ba5eaef
- 보류(out) · googleplay · `07-ecommerce-ops:sellerbox` 그대로 · active · id 7f887e8a-8905-4968-8ff2-8b33c2171f5c
- 보류(out) · appstore · `07-ecommerce-ops:sellmate` 그대로 · exhausted · id 902f5a29-47e5-4c26-9227-c777c4215e72
- 보류(out) · googleplay · `07-ecommerce-ops:sellmate` 그대로 · active · id ffc2c726-be43-437b-b440-b941f8449112
- 보류(out) · appstore · `07-ecommerce-ops:sello` 그대로 · exhausted · id 56c22876-44d9-4321-86de-736f349cb936
- 보류(out) · googleplay · `07-ecommerce-ops:sello` 그대로 · active · id 0f14a5a6-761b-40dd-baf5-d01333bc0de8
- 보류(out) · appstore · `07-ecommerce-ops:shipstation` 그대로 · exhausted · id 576ed7f6-3c8e-41c9-b2ec-7fd367a2de21
- 보류(out) · googleplay · `07-ecommerce-ops:shipstation` 그대로 · active · id 28d7ebbd-b03f-4ff2-8494-66693652a702
- 보류(out) · googleplay · `07-ecommerce-ops:us-en|shipstation` 그대로 · active · id 1b465428-95b1-41c7-89ca-1fea40fb50b8
- 보류(out) · appstore · `07-ecommerce-ops:shopmoa` 그대로 · exhausted · id ab2d5365-078a-4472-a1cd-99cb41b62c81
- 보류(out) · googleplay · `07-ecommerce-ops:shopmoa` 그대로 · active · id 8b65bc9e-e7d2-4a49-baa7-402a860656b0

참고: 보류 26행 중 googleplay 14행은 active 다. 지도 값 out 은 "신규 수집 중단"인데 이 행들은 계속 수집된다 — 이 마이그 범위 밖이고, 끌지 말지는 별도 판단이다(삭제·중단 금지 지시와 겹치므로 사람 판단).
