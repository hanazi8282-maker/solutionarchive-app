# 쌍 찾기 구현 — outcome_pairs_matched (2026-11-20)

설계: `reports/2026-11-19-v71cu/pair-finder-design.md`. 이 문서는 구현 결과와 **적용 순서**다.
이 PR 은 파일만 만든다. 마이그는 **미적용**이고 DB 는 보지 않았다. `PAIR_FINDER_ENABLED` 는 OFF 그대로이고, 이 PR 의 어떤 코드도 그 깃발을 읽지 않는다.
숫자 옆 **[실측]** 은 지시서 값 또는 로컬에서 직접 돌린 값, **[추정]** 은 실제 DB 로 확인하지 않은 값이다.

## 0. 먼저 — outcome_pairs_repeated 처리 방침

- `supabase/migrations/20261119000012_outcome_pairs_repeated.sql` 은 본문이 `SELECT 1;` 한 줄이다. 표 `outcome_pairs_repeated` 와 함수 `refresh_outcome_pairs_repeated()` 의 실제 정의는 MCP 로만 적용돼 리포에 없다.
- **방침: 건드리지 않고 우회한다.**
  - 새 마이그는 그 표·함수를 읽지도, 바꾸지도, 지우지도 않는다. 새 함수는 `ss_story_labels_current`·`ss_episode_tags` 만 읽는다. (셀프테스트가 마이그 본문에 그 이름이 없다는 것을 고정한다.)
  - `000012` 파일도 고치지 않는다. 정의를 모르는 채로 "아마 이럴 것"이라고 채워 넣으면 리포와 DB 가 다른데 같아 보이게 된다.
  - 정의를 떠 오는 것은 `scripts/pair-finder-queries.sql` 의 **Q7** 이다(읽기 전용). 결과를 리포에 옮길지는 오케스트레이터가 정한다.
  - 설계 §3-4 의 "서로 다른 안 된 글 ≥3 ∧ 된 글 ≥2" 집계는 기존 표에 얹지 않고 새 표 위에서 스크립트(`pair-finder-refresh.mjs`)와 쿼리(V5)로 센다.

## 1. 만든 것

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20261120000010_outcome_pairs_matched.sql` | 표 `outcome_pairs_matched` + 함수 `refresh_outcome_pairs_matched(k int default 3, min_score int default 2)` + RLS·권한 회수 + `outcome_pairs_norm` 뷰 주석 |
| `..._outcome_pairs_matched_rollback.sql` | 함수·표 DROP, 뷰 주석 비우기 |
| `lib/consult/pairs.ts` | 점수·순위·차이 후보·집계의 순수 함수(SQL 미러). DB 조회 없음 |
| `scripts/pair-finder-refresh.mjs` | refresh 호출 → 표를 읽어 장별 쌍 수·점수 분포·통과 칸 수 출력 |
| `scripts/pair-finder-selftest.mjs` | 미러 회귀 + 마이그 정적 점검. `consult-selftest.mjs` 에 연결(CI) |
| `scripts/pair-finder-queries.sql` | Q1·Q2·Q3·Q5·Q7·Q8·Q11 + 드라이런 D1 + 검증 V1~V6 |
| `scripts/mechanism-norm.mjs` | `--pairs` 가 `outcome_pairs_norm` 대신 새 표를 읽는다(4줄) |

앱 코드(`app/`) 변경 0. 기존 뷰 `outcome_pairs`·`outcome_pairs_norm` 의 정의는 그대로다(주석 한 줄만 붙는다).

## 2. 설계 초안(§4-2)에서 고친 것

- **성능(가장 큰 것).** 초안을 CTE 로만 옮기면 통계가 없어 계획이 중첩 루프로 떨어지고 순위 계산이 행마다 다시 돈다. 로컬 Postgres 에서 에피소드 2,195행에 4.1초 → 분석된 임시 표 + `ranked AS MATERIALIZED` 로 0.08초 [실측, 합성 데이터]. 초안의 임시 표 방식을 유지하되 `ANALYZE`·id 인덱스를 더했다.
- **좁은 정렬.** 점수·순위는 id 와 순위 재료만 들고 계산하고, 긴 문장 칸(`condition_ko`·`adversity_ko`)은 마지막 k 행에만 붙인다.
- **뷰 위의 뷰 제거.** `ss_story_labels_current` 를 한 번만 계산하고 `ss_episode_tags` 에 직접 붙인다(뷰 `ss_episode_tags_current` 와 같은 조인 조건).
- **SECURITY DEFINER + `search_path = ''`**(초안은 INVOKER). 모든 객체를 `public.`·`pg_temp.` 로 적었다. EXECUTE 는 service_role 만.
- **`DELETE … WHERE true`.** API 역할에는 WHERE 없는 DELETE 를 막는 장치가 걸려 있을 수 있다.
- **동시 실행.** `pg_advisory_xact_lock` 으로 줄을 세운다(없으면 PK 충돌).
- **멱등.** 동점 정렬을 끝까지 정했다(점수 → 증거 A>B>C → md5 → 소스 → slug, 전부 `COLLATE "C"`). `UNIQUE (앵커, 된 쪽 글)` 로 "글당 1개"를 표가 강제한다.
- **인자 검사.** k 1~10, min_score 0~10 밖이면 표를 비우기 전에 예외.
- **모름 표기 결정.** `diff_candidates` 의 닫힌 칸은 **둘 다 알고 다를 때만** 싣는다(unknown 은 차이가 아니다). 기존 뷰는 `"unknown"` 문자열을 차이로 실었다. `cross_domain` 도 한쪽 업종을 모르면 NULL.
- **자유 문장 칸.** `pricing_model` 은 CHECK 가 없어 소문자·공백 정리 후 비교한다. `sub_topic`·`domain` 의 `'unknown'` 문자열도 모름으로 친다.
- **기본 k = 3**(지시). 넉넉히 저장하려면 `refresh_outcome_pairs_matched(5, 2)` 로 부르고 읽는 쪽이 `rank <= 3`.
- **statement_timeout.** 함수에 `SET statement_timeout` 을 넣지 않았다. 이미 시작된 문장에 듣는지 확인하지 못했다. 대신 실행 경로를 아래처럼 정했다.

## 3. 로컬에서 확인한 것 [실측]

DB 접근 없이, 임시 인메모리 Postgres(PGlite, 리포에 의존성 추가 없음)에 표·뷰 골격을 만들고 이 마이그를 그대로 적용했다.

- 마이그 적용·두 번 재적용·롤백이 오류 없이 돈다. 롤백 뒤 원본 표 행 수 불변.
- 무작위 글 400개·에피소드 1,182개(옛 회차·시험 회차 섞음)에서 **SQL 결과 = `lib/consult/pairs.ts` 결과**, (k, min_score) = (3,2)·(5,2)·(3,0)·(1,4)·(10,1) 다섯 조합 전부. 같은 인자로 두 번 돌리면 같은 내용.
- 잘못된 인자 4종은 예외이고 표가 비워지지 않는다.
- anon·authenticated: 표 SELECT false, 함수 EXECUTE false, anon 호출은 `permission denied`. service_role: EXECUTE true, 호출 성공.
- 합성 데이터(에피소드 13,170행·앵커 1,860·후보 쌍 168,375)에서 함수 1회 0.9초, 5,487행.
- `pair-finder-queries.sql` 의 문장 전부(Q7 제외)가 문법 오류 없이 돈다.

**이건 실제 DB 가 아니다.** Supabase 의 Postgres 버전·역할 설정·실제 분포에서는 아래 4번으로 다시 본다.

## 4. 적용 순서 (오케스트레이터)

대상 프로젝트 solutionarchive `qmgrfqjfxqhxuufrnkwf`. 쿼리는 전부 `scripts/pair-finder-queries.sql` 에 있다.

```bash
# ① 적용 전 실측(읽기 전용): Q1 Q2 Q3 Q5 Q7 Q8
#    Q8 둘째 문장 기대: matched_already = NULL, fn_already = 0, has_norm_col = 1

# ② 마이그 적용 (MCP apply_migration name=outcome_pairs_matched, 또는)
supabase db query --linked -f supabase/migrations/20261120000010_outcome_pairs_matched.sql

# ③ 드라이런(D1): BEGIN … ROLLBACK 묶음. 실행 시간·장별 쌍 수·점수 분포를 보고 되돌린다

# ④ 갱신 — SQL 경로 권장(API 역할 타임아웃을 안 탄다)
#    SELECT public.refresh_outcome_pairs_matched();        -- k=3, min_score=2
#    또는 rpc:
node --env-file=.env.local scripts/pair-finder-refresh.mjs --out reports/2026-11-20-pair-finder/refresh.json

# ⑤ 검증: V1(행 수 = 반환값) V2(위반 전부 0) V4(음성 전부 false·service 둘 true)
#    V3 지문을 적어 두고 → ④ 를 한 번 더 → V3 가 같으면 멱등 통과

# ⑥ 보고용 집계
node --env-file=.env.local scripts/pair-finder-refresh.mjs --stats-only --out reports/2026-11-20-pair-finder/refresh.json
node --env-file=.env.local scripts/mechanism-norm.mjs --pairs     # 장별 쌍 수(정리 전 뷰 · 새 표)
#    V5 의 passing_cells 합계 = 스크립트의 passing_cells 여야 한다. V6 으로 된 쪽 재사용, Q11 로 칸 통계

# ⑦ 기록: docs/migration-exceptions.md 한 줄 + Notion 일일 상태 로그

# 되돌리기
supabase db query --linked -f supabase/migrations/20261120000010_outcome_pairs_matched_rollback.sql
```

`pair-finder-refresh.mjs` 종료 코드: 0 = 갱신하고 표 행 수가 반환값과 같음 · 1 = 불일치 · 2 = 실행 못 함(확인 불가). 2 를 성공으로 읽지 않는다.

적용 판단에 필요한 점:

- 함수는 파생 표를 `DELETE` 한 뒤 다시 채운다. 원본은 읽기만 한다. §10.2 예외 1번(데이터 DELETE)에 해당하는지는 오케스트레이터가 판단한다. 내 의견은 "해당하지 않는다"(언제든 같은 내용으로 다시 만들 수 있는 스냅샷)지만 결정은 아니다.
- 적용 전 Q1 의 합이 17,998 [실측, 지시서] 근처가 아니면 멈추고 옛 회차가 섞였는지부터 본다.

## 5. 기대 값 — 전부 [추정]

- 앵커: (negative 1,487 + mixed 630 = 2,117 [실측]) × 기타 아닌 비율 0.886 ≈ **1,880** [추정: 안 된 에피소드의 기타 비율이 전체 11.4% 와 같다고 가정]. 실제 값은 Q3.
- 쌍 수 상한: k=3 이면 **약 5,600 이하**, k=5 면 약 9,400 이하. 문턱(점수 ≥2)과 "글당 1개" 때문에 더 적다. 얼마나 적을지는 모른다(D1).
- 실행 시간: **수 초** [추정]. 근거는 합성 데이터 0.9초뿐이다. 5장이 글 단위 근사로 368,236쌍 [실측, 지시서]이라 에피소드 단위 후보는 합성 데이터의 몇 배다. D1 의 `Execution Time` 이 실측이 된다.
- 통과 칸 수: 모른다. 0칸일 수도 있다. 그러면 지시서대로 "사례 없음".

## 6. 미확인

- 실제 DB 에서의 실행 시간·쌍 수·점수 분포(D1 전에는 전부 추정).
- 문턱 2 가 맞는지. sub_topic·domain 일치가 드물면 닫힌 칸 5개 중 2개가 맞아야 해서 앵커가 많이 빠질 수 있다(Q5, D1 둘째 묶음).
- 역할별 `statement_timeout`(Q8). rpc 경로가 시간 안에 끝나는지.
- Supabase 의 `postgres` 역할로 만든 SECURITY DEFINER 함수가 임시 표 생성·`ANALYZE` 를 문제없이 하는지(로컬에서는 됨).
- `outcome_pairs_repeated` 의 정의(Q7).
- `scripts/mechanism-norm.mjs --pairs` 와 `pair-finder-refresh.mjs` 의 DB 호출부는 돌려 보지 못했다(키 없음). 문법 검사와 집계 함수 테스트만 했다.
- `PAIR_FINDER_ENABLED` 가 리포 변수·Vercel env 에 있는지(코드에서 읽는 곳은 여전히 없다).
- 점수 가중치(3·2·1)는 검증된 값이 아니다. 원리 오분류 8% 도 그대로다.
