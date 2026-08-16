-- 스키마 적용 상태 검증 (단일 쿼리 버전)
-- Supabase SQL Editor는 여러 문장을 실행하면 마지막 결과만 보여주므로
-- 전부 한 결과 테이블로 합쳤다. 통째로 붙여넣고 실행 → 결과 전체를 복사해서 전달.

select '1. 테이블'  as 구분, t.name as 항목,
       case when to_regclass('public.' || t.name) is null then '❌ 없음' else '✅ 있음' end as 결과
from (values ('channels'),('content_items'),('hypotheses'),('posts'),
             ('metric_snapshots'),('benchmarks'),('learnings')) as t(name)

union all
select '2. 뷰', 'post_performance',
       case when to_regclass('public.post_performance') is null then '❌ 없음' else '✅ 있음' end

union all
select '3. 트리거', 'trg_guard_learning',
       case when to_regclass('public.learnings') is null then '⏭ learnings 테이블 없음'
            when exists (select 1 from pg_trigger
                         where tgrelid = 'public.learnings'::regclass
                           and not tgisinternal
                           and tgname = 'trg_guard_learning')
            then '✅ 있음' else '❌ 없음' end

union all
select '4. 시드', 'channels (기대 2)',
       case when to_regclass('public.channels') is null then '⏭ 테이블 없음'
            else (select count(*)::text || '행' from channels) end
union all
select '4. 시드', 'hypotheses (기대 7)',
       case when to_regclass('public.hypotheses') is null then '⏭ 테이블 없음'
            else (select count(*)::text || '행' from hypotheses) end
union all
select '4. 시드', 'content_items (기대 21)',
       case when to_regclass('public.content_items') is null then '⏭ 테이블 없음'
            else (select count(*)::text || '행' from content_items) end

union all
select '5. 가설코드', 'H1~H7 존재 여부',
       case when to_regclass('public.hypotheses') is null then '⏭ 테이블 없음'
            else coalesce((select string_agg(code, ',' order by code) from hypotheses), '(비어있음)') end

union all
select '5. 채널', 'handle 목록',
       case when to_regclass('public.channels') is null then '⏭ 테이블 없음'
            else coalesce((select string_agg(handle || '/' || owner_type, ', ' order by handle) from channels), '(비어있음)') end

order by 구분, 항목;
