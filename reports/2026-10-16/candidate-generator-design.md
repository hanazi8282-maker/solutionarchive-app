# 후보 생성기(우물 파기 자동화) 설계 — 1단계 dry-run

- 지시: 남헌 v71aa 1-4 (CEO-staff 전달, 2026-10-16)
- 작성: CTO 세션 서브에이전트. DB 접근 없이 코드·리포 파일·Actions 로그만 보고 썼다.
- 상태: **설계 + 최소 골격**. 등록 경로 없음. 무인 루프 연결 없음(워크플로 추가 안 함).

## 0. 왜 필요한가 (한 문단)

10-13 이후 일 신규 수집이 약 절반으로 줄었다. 원인은 판정이 아니라 수집 유입이다.
앱스토어 타깃 등록은 10-06~12 에 일회성 배치 마이그(영어 확장 46·영역① 14 등)가 메웠고, 10-13 이후에는
창문 자동 등재 하루 5개만 남았다. HN 발굴은 LLM 이 이미 아는 이름을 반복해 내서 등록이 하루 0~1개다.
사람이 배치를 만들지 않으면 공급이 끊기는 구조라, 후보를 사람 없이 계속 대는 장치가 필요하다.

## 1. 이미 있는 부품 (새로 만들지 않는다)

| 갈래 | 이미 있는 것 | 지금 한계 |
|---|---|---|
| ① 승인 리뷰 속 대안·갈아탄 제품 | `scripts/product-name-candidates.mjs`(규칙 추출: "X 대신 Y"·"alternative to X"·스토어 링크) → 승인 시트 → `scripts/candidate-register-draft.mjs`(마이그 초안) | 사람이 시트에 답해야 다음 단계로 간다. 영역별 하루 3 |
| ② 앱스토어/구글플레이 유사 앱 | 없음. 같은 앱 다른 국가 창문은 `scripts/window-discovery.mjs` | 아래 §2-② 법적 범위 |
| ③ 승인 출처 도메인의 포럼·카테고리 | `scripts/board-discovery.mjs`(디렉터리 1장 → 게시판 slug) | 스케줄 워크플로 없음(수동) |
| ④ 영역 키워드 공개 검색 | `scripts/store-search-discovery.mjs`(4 스토어 검색 경로 전부 robots 금지 → 제안만), HN `scripts/discovery-run.mjs` | 스토어 검색은 요청 0. HN 은 LLM 반복 |
| (덤) 창문 대장 pending | `reports/window-adopted.json` — 실측 채택됐는데 하루 5 상한으로 못 넣은 것 | 10-16 기준 **106건 대기** |

생성기는 이 부품들의 **출력을 한 줄로 모아 같은 필터·같은 지표로 세는 층**이다. 갈래별 수집 로직은 각 스크립트에 그대로 둔다.

## 2. 발굴 갈래별 범위 (합법·공개만)

- **① 언급 추출**: 입력 = 최종 라벨 relevant 인 글(human_verdict 우선). 기존 규칙 추출 그대로. LLM 보강은 붙이지 않는다(나중 단계).
- **② 유사 앱**:
  - 앱스토어: 공식 iTunes Search API 에는 "유사 앱" 관계가 없다. 쓸 수 있는 것은 `lookup?id=<개발사 id>&entity=software`(같은 개발사의 다른 앱)뿐이다. 이 호스트의 robots·약관 판정은 아직 안 했다 → **판정 전에는 요청 0**.
  - 구글플레이: 공식 공개 API 가 없다. 웹의 "비슷한 앱"은 `/_/` batchexecute 경로(robots 금지)다. 소유자 예외(`owner_2026-10-06`)는 **리뷰 수집용**이라 유사 앱 탐색으로 넓히는 것은 새 법적 판단이다(§10.2 예외 4) → **이 단계에서는 하지 않는다.**
- **③ 포럼 링크**: `board-discovery.mjs` 그대로. robots 확인 불가면 요청 0, 403·429 즉시 중단.
- **④ 키워드 탐색**: 스토어 검색은 robots 금지라 제안만(요청 0). HN 은 Algolia 공개 API(`hn.algolia.com`, robots 404 = 없음)로 hits 만 잰다. 차단 신호(403·429·캡차·빈 응답) 보이면 그 갈래는 그날 중단.

## 3. 필터 (순서 고정, `lib/discovery/candidate-generator.ts` rejectReason)

1. 갈래 이름 확인 → `bad_generator`
2. 영역 적합성: 라벨 앞 `N:` 이 ①~⑤ 여야 한다. `out-*` 는 `out_area`, 영역 없음·design·hold 는 `no_area`
3. 중복: 기존 review_targets 의 (source_key, product_ref) 와 같은 묶음 안 중복 → `duplicate`
4. 차단 유지 소스: G2·Capterra(SP-007 약관 금지)·danawa·todayhumor·producthunt → `blocked_source`
5. 법적 라벨: 소스 행 없음(새 소스는 이 경로 밖) `no_source` · `enabled=false` `disabled` · 약관 `prohibited`/`forbids_automation` `tos_blocked` · robots 가 허용/해당없음이 아니고 소유자 예외도 아니면 `robots_unverified`(§7.1 — 못 읽은 것은 허용 아님)

## 4. 선택 (하루 몫)

- 점수 = 기대 수확 × 영역 가중. 가중은 ② = 2, 나머지 1(② 유입이 약하다. 가중만 하고 ②로 한정하지 않는다)
- 기대 수확을 모르면(null) 0 으로 접지 않고 맨 뒤로 보낸다. 지표에 "모름 N" 으로 따로 센다
- 하루 상한 **45**(`GENERATOR_DAILY_CAP`). 1단계에서 이 수는 "오늘 고를 몫"이고 등록 수가 아니다

## 5. 일일 지표 (dry-run 출력 `reports/<KST>/candidate-generator-dryrun.json`)

`generated`(생성 후보) · `passed`(적합성 통과) · `picked`(오늘 몫) · `registered`(1단계는 항상 0) ·
`avg_expected_yield`(오늘 몫의 평균 기대 수확, 모르면 null) · `yield_unknown` · `by_generator` · `by_area`(영역별 생성/통과/몫) · `rejected`(사유별 건수)

## 6. 등록 (1단계에서는 하지 않는다)

- 자동 DB 쓰기 없음. 생성기 코드에 supabase import·fetch·insert 가 없다는 것을 셀프테스트가 정적으로 본다.
- 남헌 승인 뒤 2단계: 오늘 몫을 `candidate-register-draft.mjs` 와 같은 꼴의 **마이그 초안 + 롤백 SQL** 로 만들어 PR 로 올린다.
  하루 ≤45. 적용은 §10.2 대로 대화형·역할 세션.
- 무인 루프가 직접 INSERT 하는 3단계는 아래 §8 문구가 헌법에 들어간 뒤에만 설계한다.

## 7. 1단계 실측 (2026-10-16, 리포 파일만)

`node scripts/candidate-generator.mjs --targets=<대장 등록분 25> --sources=<appstore 행>` (창문 대장 pending 만, ①~④ 입력 없음):

- 후보 106 · 적합성 통과 106 · 오늘 몫 45 · 등록 0 · 평균 기대 수확 49.7(앱스토어 첫 페이지 신규, **하한**)
- 영역: ② 8(몫 0 — 기대 수확 5~20) · ③ 53(몫 25) · ④ 5(몫 1) · ⑤ 40(몫 19) · ① 0
- 주의: 중복 판정 재료가 DB 가 아니라 대장 등록분이다. 실제 운영에서는 `window-discovery-inputs.mjs` 의 targets.json(SELECT 전용)을 넣는다.

## 8. 헌법 §10.1 — 1단계는 어기는 부분 없음. 3단계(무인 직접 등재)에 필요한 문구 제안만

1단계(파일 출력만)와 2단계(마이그 PR → 세션 적용)는 지금 문구 안이다. 무인 루프가 직접 넣으려면 "발굴 적재" 아래에 한 줄이 필요하다(제안, 수정하지 않음):

> - **후보 생성기 등재**(남헌 v71aa 승인 뒤) — `scripts/candidate-generator.mjs` 가 고른 후보만 `review_targets` INSERT, `enabled` ∧ robots 허용(또는 소유자 예외) ∧ 약관 금지 아님 ∧ 라벨 영역 ①~⑤(out-* 금지) ∧ 기존 (source_key, product_ref) 중복 불가, 하루 ≤45, 롤백 SQL 을 INSERT 전에 `reports/` 에 쓴다. 새 소스는 이 경로로 못 만든다.

## 9. 다음 단계

1. 남헌: 1단계 dry-run 을 하루 1회 돌릴지(워크플로 추가 = 읽기 전용 SELECT + 파일) 결정
2. ① 출력(`product-name-candidates.mjs` 대장 tier_rows)을 `Candidate` 꼴로 바꾸는 어댑터 — 이 골격의 `fromWindowLedger` 와 같은 크기
3. ② 앱스토어 같은 개발사 lookup 의 robots·약관 판정(판정 전 요청 0)
