# v71ek — DB 를 바꾸는 egress 제안 (전부 미적용 · 마이그 파일 아님)

아래 SQL 은 스케치다. 적용하려면 마이그·롤백·권한(`service_role` 전용, `REVOKE ... FROM anon, authenticated`)을 따로 쓰고 §10.2 를 따른다.

## 1. 대기열 수를 서버에서 센다 — 약 3.5~5 MB/회 → 0.1 미만
```sql
CREATE OR REPLACE FUNCTION public.relevance_unjudged_counts(p_statuses text[])
RETURNS TABLE (project_id uuid, source_key text, quality boolean, tagged boolean, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT i.project_id, i.source_key,
         EXISTS (SELECT 1 FROM content_quality_flags f WHERE f.input_id = i.id
                  AND (CASE WHEN f.flag = 'promo' THEN f.rule_ver = 'cq-v2'
                       ELSE f.flag IN ('too_short','near_dup','quote_only','dev_reply') END)),
         EXISTS (SELECT 1 FROM consumer_material_tags t WHERE t.input_id = i.id AND t.project_id = i.project_id),
         count(*)
    FROM analysis_inputs i JOIN analysis_projects p ON p.id = i.project_id
   WHERE i.purged_at IS NULL AND p.status = ANY (p_statuses)
     AND NOT EXISTS (SELECT 1 FROM review_relevance_verdicts v WHERE v.input_id = i.id AND v.project_id = i.project_id)
   GROUP BY 1,2,3,4
$$;
```
주의: 소비재 허용 목록(`config/consumer-allow-ids.txt`)과 파생 규칙은 id 단위라 JS 에 남겨야 한다(허용 id 를 인자로 넘기거나 따로 조회). 규칙이 SQL·JS 두 벌이 된다.

## 2. HN 저가치만 남은 프로젝트를 후보에서 가려낸다 — pendingFor 헛읽기 제거
지금도 미판정 원문(HN 저가치 약 3,600건)을 실행마다 다시 받는다. 입력에 파생 표시(`t1_skip_reason`)를 두면 0 이 된다.
표시를 쓰는 코드·재계산(설정 `prefilter-rules.json` 이 바뀌면)이 필요하다.

## 3. 사전필터 전체 요약·중복을 원문 없이
`analysis_inputs.body_hash`(적재 때 앱이 계산: 머리말 제거 → 소문자 → 공백 제거 → md5) 를 두면 중복 검출에 판정된 원문이 필요 없다.
`project_all` 요약의 나머지 규칙은 원문이 필요하므로, 요약을 "미판정만"으로 바꿀지 먼저 결정해야 한다(동작 변경).

## 4. 2차 후보 — 약 15 MB/회
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_relevance_verdicts_second_pending_idx
  ON public.review_relevance_verdicts (input_id) WHERE second_verdict IS NULL AND human_verdict IS NULL;
```
(인덱스는 속도용.) 전송을 줄이려면 순서·상한까지 하는 RPC 가 필요하다: 영역 그룹 → SaaS 우선 → 프로젝트별 수 → id 순으로 상한만큼 반환.
정렬 규칙(`compareAutoPriority`)이 SQL 로 한 벌 더 생겨 권장하지 않는다.

## 5. 시간 제한 여유 (속도용)
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS analysis_inputs_project_live_id_idx
  ON public.analysis_inputs (project_id, id) WHERE purged_at IS NULL;
```
적용 전에 `EXPLAIN (ANALYZE, BUFFERS)` 로 anti-join 계획을 본다. 같은 열 인덱스가 이미 있는지 `pg_indexes` 로 먼저 확인한다.

## 6. 언급 루프 증분화
B 는 매번 전체를 다시 본다. "마지막 실행 뒤 바뀐 글"만 읽으려면 판정 변경 시각(`updated_at`)과 결과를 둘 비공개 저장소가 필요하다
(원문이 든 파일은 공개 Actions 캐시·아티팩트에 둘 수 없다). 글 id·판정 종류만 DB 표에 쌓는 방식이 후보다.
