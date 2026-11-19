# 쌍 찾기 층별 수정 — sub_topic 닫힌 목록 (2026-11-20)

이 PR 은 파일만 만든다. 마이그 2개는 **미적용**, DB·LLM 은 돌리지 않았다. `PAIR_FINDER_ENABLED` 는 OFF 그대로이고 이 PR 의 어떤 코드도 읽지 않는다.
**[실측]** = 로컬에서 직접 돌린 값, **[추정]** = 실제 DB 로 확인하지 않은 값.

## 0. 왜

- 독립 채점 4회: `mechanism_norm` 칸만 같은 쌍은 "비교할 만함" 15~35%, 같은 `sub_topic` 까지 요구하면 65% (안 된 쪽 = 명확한 negative · 증거 A/B 조건).
- 그런데 `ss_episode_tags.sub_topic` 은 17,998행에 고유값 15,845개(자유 문장 snake_case)라 정확 일치가 거의 없다(통과 칸 3개).
- 수정: `sub_topic` 을 `mechanism_norm` 처럼 닫힌 목록(`sub_topic_norm`)으로 정리해 점수·거르기에 쓴다.

## 1. 만든 것

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20261120000011_ss_sub_topic_norm.sql` (+`_rollback`) | `ss_episode_tags` 에 `sub_topic_norm`·`sub_topic_norm_run` 칸 + 색인. 원본 `sub_topic` 불변 |
| `supabase/migrations/20261120000020_outcome_pairs_matched_v2.sql` (+`_rollback`) | `refresh_outcome_pairs_matched` v2 + 표에 칸 4개(`sub_topic_norm`·`lose_run`·`win_run`·`refresh_opts`) |
| `scripts/sub-topic-norm.mjs` | `--propose` · `--classify [--dry]` · `--audit` · `--selftest` (CI `build-check.yml` 에 연결) |

### v2 함수

`refresh_outcome_pairs_matched(k int = 3, min_score int = 2, require_same_sub_norm boolean = false, lose_negative_only boolean = false, evidence_ab_only boolean = false)`

- 점수 = `LEAST(10, sub_topic 원문 일치 3 + sub_topic_norm 일치 3 + domain 2 + customer·stage·price_band·team_size·pricing_model 각 1)`. `sub_topic_norm` 의 `'기타'`·NULL 은 일치가 아니다.
- `require_same_sub_norm` — 같은 `sub_topic_norm`(기타 제외) 쌍만.
- `lose_negative_only` — 안 된 쪽이 `result_class='negative'` ∧ `result_grain IN ('metric','qual','learned')`.
- `evidence_ab_only` — 양쪽 `evidence_strength IN ('A','B')`.
- 옵션 기본값이 전부 false 이고 `sub_topic_norm` 이 비어 있으면 결과는 v1 과 **같다** [실측, 아래 3].
- 옛 2인자 시그니처는 같은 트랜잭션에서 DROP 한다. `CREATE OR REPLACE` 만 하면 2인자·5인자 두 함수가 남아 `refresh_outcome_pairs_matched()` 가 "is not unique" 로 깨진다. 인자 이름·기본값이 같아 `SELECT refresh_outcome_pairs_matched()`, `(5, 2)`, rpc `{k, min_score}`(`pair-finder-refresh.mjs`) 는 그대로 된다.
- 함수 권한 이름이 바뀐다: 확인 쿼리의 `refresh_outcome_pairs_matched(int,int)` 는 `(int,int,boolean,boolean,boolean)` 로 읽는다(`scripts/pair-finder-queries.sql` V4 포함).

## 2. 쌍 중복(label_run 만 다른 같은 쌍) — 코드로 확인한 결과

- **함수 안에서는 생기지 않는다.** `ss_story_labels_current` 는 `DISTINCT ON (source_key, slug)` 로 글마다 최신 회차 1행만 남기고(시험 회차 `test_%` 제외, 동점은 `label_run DESC`), 함수는 에피소드를 그 회차(`label_run` 일치)로만 붙인다. `ss_episode_tags` 는 `UNIQUE (source_key, slug, label_run, episode_idx)` 라 앵커 (source, slug, ep) 는 한 번만 나오고, 된 쪽은 `per_story` 가 글당 1개만 남긴다. 표의 PK(앵커, rank)·`UNIQUE(앵커, 된 쪽 글)` 가 같은 것을 강제한다. `ss_episode_tags_current` 도 같은 조인이라 같다.
- **중복이 보이는 곳은 읽는 쪽이다.** 표에는 회차가 없어서, 표를 기본 표 `ss_episode_tags` 에 (source_key, slug, episode_idx) 로만 다시 붙이면 `v1_sonnet`·`p4a_sonnet` 두 회차에 다 걸린다. 합성 데이터에서 그대로 재현됐다 [실측].
- **처리:** 표에 `lose_run`·`win_run` 을 남겼다. 다시 붙일 때는 `(source_key, slug, label_run, episode_idx)` 로 붙이거나 `ss_episode_tags_current` 에 붙인다. 함수에 별도 중복 제거는 넣지 않았다(제거할 중복이 없다).
- **남은 것 (미확인):** 같은 `slug` 가 **다른 source_key** 로 들어온 글(교차 게시)은 `(source_key, slug)` 가 달라 서로 쌍이 될 수 있다. 회차 중복과는 다른 문제라 손대지 않았다. 실제 건수는 아래 ⑨ 의 쿼리로 센다.

## 3. 로컬에서 확인한 것 [실측]

DB 접근 없이, 임시 인메모리 Postgres(PGlite 0.2.17, 리포 의존성 추가 없음 — #686 과 같은 방식)에 표·뷰 골격(`ss_story_labels`·`ss_episode_tags`·`*_current` 뷰)을 만들고 `20261120000010`(origin/feat/pair-finder-matched 본문) → `000011` → `000020` 을 그대로 적용했다. 합성 데이터: 글 468행(회차 2개·시험 회차·같은 slug 다른 소스 섞음)·에피소드 1,147행(현재 회차 764). **32/32 통과.**

- `000011`·`000020` 을 두 번씩 적용해도 오류 없음. 적용 뒤 함수는 1개(옛 시그니처 없음).
- `sub_topic_norm` 이 빈 상태에서 v2 = v1: (k, min_score) = (3,2)·(5,0)·(1,4)·(10,1), 인자 없음, 이름 인자 호출 — 전부 같은 내용.
- 표 안 중복 0, `lose_run`·`win_run` = 현재 회차, 옛 회차·시험 회차 0. 회차 없이 기본 표에 붙이면 행이 늘어난다(원인 재현), 회차로 붙이면 같은 수.
- 모든 칸이 같은 쌍(원점수 13)은 10 으로 잘린다. `sub_topic_norm` 칸은 두 쪽이 같고 기타가 아닐 때만 채워지고, 그때 점수 ≥ 3.
- 옵션 셋 각각·셋 다: 조건을 어긴 행 0, rank ≤ k, score ≥ min_score.
- 잘못된 인자(k=0, min_score=11, 옵션 NULL 2종)는 예외이고 표가 비워지지 않는다.
- anon·authenticated EXECUTE false, service_role true, anon 표 SELECT false.
- 롤백(`000020` → `000011` 순): v1 시그니처 복귀, v1 결과와 동일, 새 칸 0. 재적용 뒤 다시 v1 과 동일.
- `node scripts/sub-topic-norm.mjs --selftest` 24/24, `untrusted-input-selftest` 77/77.

**실제 DB 가 아니다.** 실행 시간·분포·통과 칸 수는 아래 순서로 잰다.

## 4. 오케스트레이터 실행 순서

대상 solutionarchive `qmgrfqjfxqhxuufrnkwf`. 선행: `20261120000010` 적용됨(지시서). 스크립트는 SolutionArchive 루트에서, `.env.local` 로.

```bash
# ① 적용 전 실측(읽기 전용)
#    SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_episode_tags' AND column_name LIKE 'sub_topic_norm%';   -- 기대 0행
#    SELECT p.oid::regprocedure FROM pg_proc p WHERE p.proname='refresh_outcome_pairs_matched';                                                         -- 기대 refresh_outcome_pairs_matched(integer,integer) 1행
#    SELECT public.refresh_outcome_pairs_matched(); 를 돌린 상태라면 ⑨ 의 통과 칸 쿼리로 "v1 기준값"을 먼저 적어 둔다

# ② 마이그 적용 — 000011 먼저, 000020 다음 (000020 은 000011 의 칸을 읽는다)
supabase db query --linked -f supabase/migrations/20261120000011_ss_sub_topic_norm.sql
supabase db query --linked -f supabase/migrations/20261120000020_outcome_pairs_matched_v2.sql
#    각 파일 하단 확인 쿼리(양성·음성). 000020 뒤 SELECT public.refresh_outcome_pairs_matched(); 결과는 v1 과 같아야 한다(sub_topic_norm 이 아직 비어 있음)

# ③ propose — 장·mechanism_norm 칸별 표본(기본 900줄) → 목록 초안 80~150개
node --env-file=.env.local scripts/sub-topic-norm.mjs --propose
#    → reports/2026-11-20-pair-finder/sub-topic-norm-list.json. 개수가 80~150 밖이면 경고가 찍힌다. 사람이 훑어보고 key 를 고쳐도 된다(고친 뒤 ④부터)

# ④ classify 드라이런 — DB 에 쓰지 않는다. 기타 비율·못 읽은 줄 수를 먼저 본다
node --env-file=.env.local scripts/sub-topic-norm.mjs --classify --dry --limit 400

# ⑤ classify 전체 — 이어하기(이미 채운 줄은 건너뜀). 종료 코드 0 이 될 때까지 같은 명령을 다시 돌린다
node --env-file=.env.local scripts/sub-topic-norm.mjs --classify
#    종료 코드: 0 = 전부 채움 · 1 = 못 읽은 줄 있음(다시 돌리면 그 줄만) · 5 = 구독 한도(재개는 한도 풀린 뒤 같은 명령)
#    목록을 바꿨으면 --redo --run stn_v2 로 덮어쓴다(그때 ⑥ 도 --run stn_v2)

# ⑥ audit — 무작위 60줄을 Opus 가 검수
node --env-file=.env.local scripts/sub-topic-norm.mjs --audit --n 60
#    오분류 > 10% → 목록 정의를 고쳐 ⑤ --redo. 기타 > 25% → "목록 확장 필요" — ③ 을 다시(기타 줄이 표본에 들어가게) 하고 ⑤ --redo
#    결과 파일 reports/2026-11-20-pair-finder/sub-topic-norm-stn_v1-audit-aud1.json

# ⑦ 채움 확인
#    SELECT count(*) FILTER (WHERE sub_topic_norm IS NULL) AS empty, count(*) FILTER (WHERE sub_topic_norm='기타') AS etc, count(DISTINCT sub_topic_norm) AS kinds
#    FROM public.ss_episode_tags e JOIN public.ss_story_labels_current s USING (source_key, slug, label_run);

# ⑧ refresh — 옵션 조합마다 한 번씩(함수는 표를 갈아 끼운다). 각 줄 바로 뒤에 ⑨ 를 돌려 수를 적는다
#    SELECT public.refresh_outcome_pairs_matched();                                                    -- A: v2 기본(점수에 sub_norm +3 만)
#    SELECT public.refresh_outcome_pairs_matched(3, 2, require_same_sub_norm => true);                 -- B: 같은 sub_norm 만
#    SELECT public.refresh_outcome_pairs_matched(3, 2, true, true, false);                              -- C: B + 명확한 negative
#    SELECT public.refresh_outcome_pairs_matched(3, 2, true, true, true);                               -- D: C + 양쪽 증거 A/B (채점에서 65% 가 나온 조건)
#    SELECT public.refresh_outcome_pairs_matched(3, 2, false, true, true);                              -- E: sub_norm 없이 D 의 안 된 쪽·증거 조건만(비교용)
#    끝나면 PAIR_FINDER 를 읽는 쪽이 기대하는 조합으로 한 번 더 돌려 둔다(정하기 전에는 A). 지금 표를 읽는 앱 코드는 없다
#    rpc 경로: node --env-file=.env.local scripts/pair-finder-refresh.mjs 는 {k, min_score} 만 넘기므로 A 만 된다. 옵션 조합은 SQL 로

# ⑨ 통과 칸 수 (rank<=3, 서로 다른 안 된 글 ≥3 ∧ 된 글 ≥2) — 칸을 (장, mechanism_norm) 과 (장, mechanism_norm, sub_topic_norm) 두 가지로
#    WITH c AS (SELECT chapter, mechanism_norm, count(DISTINCT (lose_source,lose_slug)) ls, count(DISTINCT (win_source,win_slug)) ws, count(*) pairs
#               FROM public.outcome_pairs_matched WHERE rank <= 3 GROUP BY 1,2)
#    SELECT 'mech' AS cell, count(*) AS cells, count(*) FILTER (WHERE ls>=3 AND ws>=2) AS passing, sum(pairs) AS pairs, (SELECT refresh_opts FROM public.outcome_pairs_matched LIMIT 1) AS opts FROM c
#    UNION ALL
#    SELECT 'mech+sub', count(*), count(*) FILTER (WHERE ls>=3 AND ws>=2), sum(pairs), NULL FROM (
#      SELECT chapter, mechanism_norm, sub_topic_norm, count(DISTINCT (lose_source,lose_slug)) ls, count(DISTINCT (win_source,win_slug)) ws, count(*) pairs
#      FROM public.outcome_pairs_matched WHERE rank <= 3 AND sub_topic_norm IS NOT NULL GROUP BY 1,2,3) c2;
#    중복 0 확인:   SELECT count(*) FROM (SELECT 1 FROM public.outcome_pairs_matched GROUP BY lose_source,lose_slug,lose_ep,win_source,win_slug HAVING count(*)>1) d;   -- 0
#    교차 게시 확인(미확인 항목): SELECT count(*) FROM public.outcome_pairs_matched WHERE lose_slug = win_slug AND lose_source <> win_source;
#    다음 채점 표본은 D 에서 뽑는다. 원문에 다시 붙일 때 (source_key, slug, label_run=lose_run/win_run, episode_idx)

# ⑩ 기록: docs/migration-exceptions.md 두 줄(000011·000020) + Notion 일일 상태 로그

# 되돌리기 — 순서 지킬 것 (000020 롤백이 v1 함수를 되살린다)
supabase db query --linked -f supabase/migrations/20261120000020_outcome_pairs_matched_v2_rollback.sql
supabase db query --linked -f supabase/migrations/20261120000011_ss_sub_topic_norm_rollback.sql
#    그다음 SELECT public.refresh_outcome_pairs_matched(); 로 v1 스냅샷을 다시 채운다
```

적용 판단에 필요한 점:

- `000011` 은 칸 추가뿐(기존 행 불변). `000020` 은 함수 교체(옛 시그니처 DROP → 새로 CREATE, 같은 트랜잭션)와 파생 스냅샷 표의 칸 추가다. 롤백은 파생 표의 칸 4개를 DROP 한다 — 값은 언제든 다시 계산된다.
- `000011` 롤백은 `sub_topic_norm` 값(LLM 분류 결과, ⑤ 의 비용)을 지운다. 원본 손실은 없지만 다시 돌리려면 ⑤ 를 다시 해야 한다.
- 뷰 `ss_episode_tags_current` 는 다시 만들지 않았다. 다시 만들면 롤백의 DROP COLUMN 이 뷰 의존성에 걸린다(그 뷰 위에 `outcome_pairs_norm` 등이 있다). 그래서 그 뷰에는 새 칸이 안 보이고, 스크립트·함수는 기본 표에서 읽는다.

## 5. 기대 값 — 전부 [추정]

- ⑤ 호출 수: 현재 회차 약 18,000줄 ÷ 80 ≈ 225회(Sonnet, effort low), 목록 150개가 매 호출 system 에 실린다. 비용·시간은 mechanism-norm 실측(같은 배치 크기)을 기준으로 보되 목록이 4배 길어 입력 토큰이 늘어난다 — 모른다.
- 기타 비율: 모른다. 25% 를 넘으면 ⑥ 이 알려 준다.
- 통과 칸 수: v1 기준 3칸(지시서). D 조합에서 얼마나 늘지는 모른다 — 0 일 수도 있다.

## 6. 미확인

- 실제 DB 에서 마이그 적용·함수 실행 시간·통과 칸 수(전부 ③~⑨ 를 돌리기 전에는 모른다).
- 스크립트의 DB·LLM 경로(`--propose`·`--classify`·`--audit`)는 돌려 보지 못했다(키 없음, 지시대로 DB 실행 안 함). 순수 함수·프롬프트·마이그 정적 점검만 셀프테스트로 고정했다.
- 목록 80~150개가 sub_topic 15,845종을 기타 25% 이하로 덮는지. 표본 900줄이 칸(장×원리 약 260)마다 최소 6줄이라 작은 칸이 과대 표집된다 — 의도(작은 칸 주제를 놓치지 않기)지만 목록이 작은 칸 쪽으로 치우칠 수 있다.
- 같은 slug 다른 source_key 교차 게시가 실제로 있는지(⑨ 마지막 쿼리).
- `lib/consult/pairs.ts`(JS 미러)와 `scripts/pair-finder-queries.sql` 은 아직 main 에 없는 PR #686 브랜치에 있다. 이 PR 은 main 기준이라 그 둘을 v2 에 맞게 고치지 않았다 — #686 이 머지되면 미러에 `sub_norm +3`·상한·옵션 3개, V4 의 함수 시그니처를 맞춰야 한다.
- 가중치(+3)와 상한 10 은 검증된 값이 아니다. 채점 65% 는 "같은 sub_topic" 원문 일치 표본 기준이고, 닫힌 목록 일치에서도 같은지는 다음 채점에서 본다.
