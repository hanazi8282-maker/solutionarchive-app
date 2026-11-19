# S6b — 안정화 3종(심장박동·소스 카나리·깔때기 5숫자) — 점검표 11번

브랜치 `feat/v71cu-s11-stab`. **마이그레이션 미적용**(서브에이전트가 만든 파일, §10.2). 프로덕션 DB 는 건드리지 않았다.

## 무엇을 만들었나

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20261119000014_collect_stability_views.sql` | 새 뷰 3개 + 인덱스 1개 + 브리핑 뷰에 섹션 9~11 추가 + `collect_build_report` 에 `heartbeat`·`canary`·`funnel` 키 추가 |
| `..._rollback.sql` | 함수·브리핑 뷰를 000007·000006 본문으로 되돌리고 새 뷰 3개·인덱스 삭제(데이터 손실 없음) |
| `scripts/collect-briefing-format.mjs` | md 렌더·Notion 요약(순수 함수, 스크립트에서 분리) |
| `scripts/collect-daily-report.mjs` | 위 모듈 사용. Notion "막힌것"에 심장박동·카나리·깔때기 요약 |
| `scripts/collect-daily-report-selftest.mjs` | 오프라인 셀프테스트. 워크플로 `collect-daily-report.yml` 에 한 줄 연결 |

### 판정 규칙
- **심장박동** `v_collect_heartbeat`(켜진 소스만): 마지막 `status='ok'` 실행(dry_run 제외)이 26시간 넘음 → `stale`, 30일 실행 기록 없음 → `never`, 그 밖 `ok`.
  크론(워크플로) 미발화는 기존 `cron-watchdog` 이 맡는다. 여기서는 소스 단위만 본다.
- **카나리** `v_collect_canary`(켜진 소스, 24시간 실행 합계 vs 그 전 7일):
  `unknown`=24h 실행 0 또는 받은 페이지 0(확인 불가, §7.1) / `parse_fail`=글 0 + 파싱 실패>0, 또는 실패율 ≥5% 이면서 평소의 3배 이상 /
  `empty`=페이지는 받았는데 글·실패 모두 0(빈 것인지 셀렉터가 못 잡은 것인지 사람 확인) / `ok`.
  설계의 "소스마다 고정 타깃 1개"는 이번엔 안 만들었다 — 소스 단위 24시간 합계가 같은 신호를 준다. 타깃 단위가 필요해지면 `target_yield_daily` 로 내린다.
- **깔때기 5숫자** `v_collect_funnel_daily`: 어제(DB 날짜, 섹션 2 와 같은 경계) vs 그제.
  discovered(discovery_candidates·source_candidates `created_at`) → tested(`probe_at`·`robots_checked_at`) → provisional(review_targets `onboard_batch` 있는 새 행) → collected(analysis_inputs `collected_at`) → judged(verdicts `judged_at`).
  그제>0 이고 어제<그제/2 이면 `alert`(브리핑 note 에 `[경보]`).
- 섹션 9·10 은 요약 줄(sort 0)이 늘 나온다. md 에서 9~11 이 비면 "(없음)"이 아니라 "확인 불가"로 찍는다(마이그 미적용 감지).

## 로컬 검증(프로덕션 아님)
- PGlite(@electric-sql/pglite 0.2.17, 스크래치패드)에 스텁 표 + 000006 + 000007 + 000014 를 적용 → 소스 5개 시나리오(정상·stale+파싱실패·빈 결과·실행 없음·실패율 급증)가
  각각 ok/stale/never, ok/parse_fail/empty/unknown/parse_fail 로 나옴, 깔때기 collected 10→3 이 `alert=true`, `collect_build_report` payload 에 3키 존재.
- 롤백 적용 → 섹션 9~11 행 0, 새 뷰 3개 `to_regclass` NULL, payload 키 원래 5개로 복귀.
- `node scripts/collect-daily-report-selftest.mjs` OK.

## 적용 순서
1. 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인. 선행: 000006·000007 적용됨(S6, 적용 완료).
2. `20261119000014_collect_stability_views.sql` 적용(한 파일. 인덱스 → 새 뷰 3개 → 브리핑 뷰 교체 → 함수 교체 순서가 파일 안에 있음).
   `review_relevance_verdicts` 인덱스는 일반 CREATE INDEX 라 짧은 쓰기 잠금이 걸린다 — 판정 크론 슬롯 사이에 적용.
3. 아래 확인 쿼리 → PR 머지 → `collect-daily-report` 워크플로 `workflow_dispatch` 1회 → `ops/state/collect-briefing/<날짜>.md` 에 9~11 섹션 확인.
4. `docs/migration-exceptions.md` 한 줄 + Notion 일일 상태 로그.

## 적용 후 확인 SQL
```sql
-- 양성 1: 새 뷰 3개 존재
SELECT table_name FROM information_schema.views
 WHERE table_schema='public' AND table_name IN ('v_collect_heartbeat','v_collect_canary','v_collect_funnel_daily');   -- 3행

-- 양성 2: 브리핑 섹션 9·10 요약 줄 + 11 은 5줄
SELECT section, count(*), min(sort) FROM public.v_collect_briefing_daily WHERE section >= 9 GROUP BY 1 ORDER BY 1;
-- 기대: 9 → ≥1 (min 0) · 10 → ≥1 (min 0) · 11 → 5

-- 양성 3: 상태 분포(3상태 구분이 실제로 갈리는지)
SELECT state, count(*) FROM public.v_collect_heartbeat GROUP BY 1;
SELECT state, count(*) FROM public.v_collect_canary GROUP BY 1;
SELECT * FROM public.v_collect_funnel_daily ORDER BY ord;

-- 양성 4: 함수 payload 에 3키 (collect_daily_report 오늘 행을 덮어쓴다 — 멱등 upsert 라 무해)
SELECT jsonb_array_length(p->'heartbeat') hb, jsonb_array_length(p->'canary') cn, jsonb_array_length(p->'funnel') fn
  FROM (SELECT public.collect_build_report((now() AT TIME ZONE 'Asia/Seoul')::date) AS p) x;   -- fn = 5

-- 양성 5: 굳힌 행에도 들어갔나
SELECT report_date, payload ? 'heartbeat' AS hb, payload ? 'canary' AS cn, payload ? 'funnel' AS fn
  FROM public.collect_daily_report ORDER BY report_date DESC LIMIT 1;

-- 음성: anon·authenticated 는 새 뷰·함수 권한 없음
SELECT has_table_privilege('anon','public.v_collect_canary','SELECT') AS anon_view,
       has_function_privilege('authenticated','public.collect_build_report(date)','EXECUTE') AS auth_fn;   -- 둘 다 false

-- 비용: 함수 실행 시간(180s 한도 안인지)
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.v_collect_funnel_daily;
```

## 남은 것
- 카나리 고정 타깃(설계 D 의 "반드시 글 나오는 타깃 1개") — 소스 단위로 대신함. 필요해지면 추가.
- 깔때기 단계는 지시대로 발굴→시험→임시등록→수집→판정. 설계 표의 "중복·광고 제외 / 쓸 수 있는 것 / 분야 자산" 칸은 아님(쓸 수 있는 것은 섹션 4·`v_source_yield_30d` 에 있음).
- 점검표 11번은 적용·수동 1회 실행 뒤 "통과"로 바꾼다.
