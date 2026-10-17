# 공급 P0 두 건 현재 단계 — 언급 루프 · 후보 생성기 등록 모드 (남헌 v71al §4)

- 작성: CTO 서브에이전트, 2026-10-17. 기준 = origin/main `89e3c98`(#571 머지 뒤).
- 읽기 조사만 했다. **DB 는 못 본다**(접근 없음). 코드·리포 파일·PR 본문만 근거다.
- 표기: [코드] = 파일에서 직접 확인 · [문서] = 리포 보고서에 적힌 것 · [확인 불가] = 리포만으로는 못 정함(무엇을 보면 되는지 함께 적음).

## 1. 언급 앱 → 후보 → 자동 등록 루프 (D-36, v71ad §1)

**오늘 가능한 다음 산출물 1개: 실데이터 dry-run 1회 — CEO-staff 가 `mention-loop-v71aj.md` §2 (A') 읽기 SQL 을 돌려 넘기면, `scripts/mention-loop.mjs --input=A.json --write --sample-out=<scratch>/review.csv --sample-n=30` 으로 사람 채점 시트 30행 + `mention-ledger.sql`(#561 칸이 적용됐으니 이제 실행 가능한 대장 INSERT) + 지표 한 줄을 낸다.** 이 루프는 아직 실데이터로 한 번도 안 돌았다(아래 ①).

### ① 어디까지 구현됐나

- 추출·판정·검증·게이트·지표 전부 순수 함수로 있다 [코드] `lib/discovery/mention-loop.ts`(555줄). 셀프테스트 `scripts/mention-loop-selftest.mjs`, CI build-check 에 한 줄.
- 실행기 `scripts/mention-loop.mjs` 는 파일 입력(`--input`)만 받는다. DB import 없음 [코드].
- PR 이력(전부 머지):
  - #560 (10-16) — 1차 루프 dry-run. 이름 검색 막힘 때문에 등록 사실상 0.
  - #565 (10-16) — 앱스토어 같은 개발사 앱 → 후보 생성기 입력 인터페이스(`lib/review/appstore-same-developer.ts`). 부르는 무인 경로 없음.
  - #568 (10-16) — iTunes `/search` 정책 A(하루 100·3초·식별 UA·차단 즉시 중단). `scripts/anchor-verify.mjs` 로컬 수동 실행 전용.
  - #570 (10-16) — 발전 5안: 입력 풀 확대·기준 비교·같은 개발사 고리·HN 영역 어댑터·**등록 모드 `--register --review=<csv>`**.
  - #561 (10-17 머지) — `discovery_candidates` 칸 10개 마이그 `20261017000021_discovery_candidates_mention.sql`.
  - #571 (10-17 머지) — `review_area_verdicts` 표 + `v_input_area_effective` 뷰 `20261017000090_review_area_verdicts.sql`.
- 등록 모드가 하는 일 [코드]: 사람 채점 CSV 가 30건 이상·적합 90% 이상이면(`reviewGate`, mention-loop.ts:393) `mention-approved.json` → `candidate-register-draft.mjs` 로 **마이그 초안 + 롤백 파일**을 만든다(mention-loop.mjs:216-228). DB 에는 쓰지 않는다.
- #561·#571 이 "오늘 DB 적용됨"은 지시서 전달 내용이다. 리포 안에서는 [확인 불가] — `docs/migration-exceptions.md` 에 두 파일의 적용 기록 줄이 없다. 각 마이그 하단 확인 쿼리를 돌리거나 `information_schema.columns`(discovery_candidates.origin 등)로 보면 된다.
- 실데이터 실행 흔적 없음 [코드]: `reports/**/mention-loop.json`·`mention-ledger.json`·`mention-approved.json` 이 어느 브랜치 이력에도 없다(`git log --all` 0건). 설계 문서의 수량은 전부 [추정]이다.

### ② 무인 INSERT 를 막고 있는 것

1. **헌법 문구** — CLAUDE.md §10.1 "창문 자동 등재" 끝 문장 "새 소스·새 제품은 이 경로로 못 만든다(후보 승인 경로)". 언급 루프는 새 제품(`analysis_projects`)을 만든다. 개정 문구 전/후 제안은 `mention-loop-v71aj.md` §4 에 있다(남헌 몫, §7-1). 지금 허용되는 것은 "초안 파일 → PR → 역할 세션 적용"뿐.
2. **사람 채점 표본 0건** — 등록 모드 문턱(30건·90%)의 입력이 없다. 실데이터 dry-run 이 먼저 있어야 시트가 생긴다(위 첫 줄).
3. **이름 → 앱 ID 가 수동** — `/search` 정책 A 는 풀렸지만 `anchor-verify.mjs` 는 로컬 수동 실행이고 무인 배선이 없다. 루트 `/lookup`(같은 개발사·`--lookup`)은 "정책 A 밖, 판단 대기"(#568·v71aj §7-2) — `--allow-lookup` 없으면 0요청.
4. **무인 배선 없음** — 워크플로가 `mention-loop.mjs` 를 부르지 않는다(의도). 자동 등록에는 워크플로 + 롤백 선기록 + push-pending 커밋 경로가 새로 필요하다.
5. **구글 플레이 우회가 죽어 있음** [코드] — `mention-loop.mjs:138` 이 `play_pkg: null` 로 고정한다. 그래서 `planGate` 의 구글 플레이 갈래(mention-loop.ts:458)는 지금 한 번도 안 탄다. 게다가 구글 플레이 활성 85 > 동결 80(cap-registry.md §2, 10-16 실측)이라 자리가 있어도 0이다.
6. **적용 시점 앱스토어 30% 가드 없음** [코드] — 등록 초안을 만드는 `candidate-register-draft.mjs` SQL 은 구글 플레이 80 만 검사한다(160-203줄). 창문 초안(`window-migration-draft.mjs:129-132`)에는 있는 앱스토어 30% `RAISE EXCEPTION` 이 여기엔 없다. 계획 단계(`planGate`)에서만 걸러진다. 무인 INSERT 로 가기 전에 맞춰야 할 빈칸이다.

작은 어긋남(동작 영향 없음): `mention-loop.mjs:24`·설계 문서 §5·§12 가 마이그를 `20261017000020` 으로 적는데, 실제 파일은 `000021` 이다(000020 은 창문 타깃이 씀).

## 2. 후보 생성기(#552) 등록 모드 전환 (D-15·D-16)

### ① dry-run 결과 산출물이 리포에 있나

- **없다.** `reports/<날짜>/candidate-generator-dryrun.json` 은 `--write` 때만 생기는데(scripts/candidate-generator.mjs:39-44), 어느 브랜치에도 커밋된 적이 없다(`git log --all` 0건).
- 리포에 있는 것은 설계 문서의 요약 숫자뿐이다 [문서] `reports/2026-10-16/candidate-generator-design.md` §7: 후보 106 · 통과 106 · 오늘 몫 45 · 등록 0 · 평균 기대 수확 49.7. 입력은 창문 대장 pending 만, 중복 판정 재료는 DB 가 아니라 대장 등록분 25.
- 그 106건의 원재료는 `reports/2026-10-17/window-pending-batch.json`(창문 pending 106, 전부 앱스토어)·`reports/window-adopted.json` 에 있다. 다만 이것은 "사람이 읽을 30건 표본"이 아니다.

### ② 전환 기준을 코드가 어떻게 구현하나

- **30건 직접 읽고 90% 이상** — 후보 생성기에는 **없다**. 같은 문턱은 언급 루프에만 있다 [코드] `reviewGate`(mention-loop.ts:393, minN=30·minOk=0.9, 30건 미만이면 `unverified`). 후보 생성기 쪽에는 채점 입력·등록 모드 자체가 없다.
- **일일 상한 45** — 있다, 다만 "고를 몫"이다 [코드] `GENERATOR_DAILY_CAP = 45`(candidate-generator.ts:15), `pickDaily` 가 기대 수확 × 영역 가중(② = 2) 순으로 자른다. 등록 수를 막는 상한이 아니다(등록 경로가 없으므로 `registered` 는 항상 0, 96줄).
- **앱스토어 30% 에 걸리면 구글 플레이 후보 먼저** — 후보 생성기에는 **없다**. 30% 게이트 호출도, 구글 플레이 우선 정렬도 없다. 언급 루프 `planGate` 만 "앱스토어 자리 → 넘치면 구글 플레이(패키지를 알 때만) → 둘 다 안 되면 차단"을 한다(mention-loop.ts:447-464). 그 갈래도 위 1-② 5번 때문에 지금 실효가 없다.
- 후보 생성기의 필터 순서는 영역(①~⑤, out-* 제외) → 중복 → 차단 소스 → 소스 행·enabled·약관·robots(candidate-generator.ts:39-54).

### ③ 아직 안 된 것

1. 실데이터 dry-run 파일(실제 `review_targets`·`review_sources` 를 `--targets`·`--sources` 로 넣은 것)이 없다.
2. 등록 모드(초안 생성)가 없다. 설계 §6 "2단계 = 오늘 몫을 candidate-register-draft 꼴 초안으로"가 미구현.
3. 30건 채점 시트를 뽑는 기능이 없다(언급 루프의 `--sample-out` 같은 것).
4. 30% 게이트·구글 플레이 우선이 생성기 안에 없다.
5. 입력 갈래 ①~④ 어댑터 중 붙은 것은 창문 대장(`fromWindowLedger`)과 언급 루프의 `candidate-input.json`(앱스토어 등록 계획분만, `toGeneratorCandidates` mention-loop.ts:294) 둘뿐이다. `product-name-candidates` 어댑터(설계 §9-2)는 없다.
6. 무인 직접 등재(3단계)는 헌법 문구가 필요하다 — 제안 문구는 설계 §8(남헌 몫).
7. 갈래 구분 주의: 창문 pending 106건은 이미 별도 경로(창문 자동 등재, `DISCOVERY_TARGET_MAX` 200 으로 상향)로 들어간다(cap-registry.md §2). 후보 생성기가 같은 106건을 등록하면 겹친다.

## 3. 앱스토어 30% 게이트

- **분모 = enabled 소스의 `status='active'` 타깃 전체** — `lib/review/target-supply.ts:222` (`totalActive = enabled.reduce(… activeOf …)`, activeOf 는 221줄 `status === 'active'`).
- 언급 루프 쪽 분모는 조금 다르다 — `lib/discovery/mention-loop.ts:437` 은 `status='active' ∧ source_enabled !== false` 라서, 소스 행이 없어 `source_enabled` 가 null 인 타깃도 센다(target-supply 는 안 센다). 입력 SQL 이 `left join review_sources` 라 그런 행이 실제로 있는지는 [확인 불가] — `review_targets` 중 `review_sources` 에 없는 `source_key` 를 세면 된다.
- 창문 초안 SQL 의 사후 검사도 target-supply 와 같은 분모다(`scripts/window-migration-draft.mjs:129`, `JOIN review_sources … AND s.enabled`).

**여유 계산식 대조**

- 코드: 남은 자리 k = floor((0.3·T − a) / 0.7) (`target-supply.ts:167-169`). a = 앱스토어 활성, T = 전체 활성. "앱스토어만 늘린다"는 가정(165줄 주석).
- 앱스토어 M곳을 더하려면 비앱스토어 활성 O(= T − a)가 **O ≥ (7/3)·(a + M)** 이어야 한다. 모자란 만큼 더 필요한 비앱스토어 타깃 수 = max(0, ceil(7·(a+M)/3) − O). 앱스토어 1곳당 비앱스토어 약 2.33곳.
- 대조: k ≥ M ⇔ 0.3(a+O) − a ≥ 0.7M ⇔ O ≥ (7/3)(a+M). 코드 식과 같다. 셀프테스트 값으로도 맞다 — `shareHeadroom(46,175)=9`(target-supply-selftest.mjs:131): O=129, M=9 면 필요 128.3 ≤ 129, M=10 이면 130.7 > 129.
- 운영상 주의 [문서, 10-16 실측]: 앱스토어는 비증분형이라 한 번 방문하면 바로 exhausted 가 된다. 그래서 10-16 앱스토어 **활성은 0**(exhausted 155)이었고, 이 게이트는 그날 막지 않았다(cap-registry.md §2·§4). 30% 는 "등록된 앱스토어 타깃 전체"가 아니라 "그 순간 active 인 것"의 비중이다.
- 오늘 a·T 값은 [확인 불가] — `mention-loop-design.md` §9 (C) 쿼리(소스별 active·비중)로 본다.

## 4. 사람 판단이 필요한 것 (이 보고서가 새로 만든 것은 없다, 기존 항목 재확인)

- 언급 앱 자동 등재 헌법 문구(v71aj §4) — 남헌.
- 루트 `/lookup` 사용 여부(#565·#568) — 남헌.
- 후보 생성기 3단계 문구(candidate-generator-design §8) — 남헌.

## 부록 — dry-run 후보 30건 표

- **옮길 파일이 없다.** 후보 생성기 dry-run JSON, 언급 루프 채점 시트(`review.csv`), `mention-loop.json` 모두 리포에 없다(§1-①·§2-①).
- 언급 루프 채점 시트는 원문 조각이 들어가 "리포 커밋 금지"로 설계돼 있다(mention-loop.mjs:12·182). 생기더라도 scratchpad 에 둔다. 사람이 읽을 표는 이름·근거 글 수·영역·모델(규칙) 판정만 뽑아 따로 만들어야 한다.
- 만드는 법: 위 §1 첫 줄 명령. 시트의 `verify` 칸이 기계 판정(anchored·lookup_failed 등), `human_ok` 칸이 사람 판정이다 — 두 칸을 섞지 않는다.
