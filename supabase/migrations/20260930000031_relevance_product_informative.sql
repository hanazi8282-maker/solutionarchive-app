-- T2 자동 승인 rr-v2 — "이 글에 독자가 이 제품을 판단하는 데 쓸 구체 정보가 있는가" 를 relevant 와 따로 기록한다.
--
-- 근거: 남헌 2026-09-28 정정 — rr39(둘 다 관련 39건) 사람 채점에서 무관 8건이 "제품이 도구로 지나가는 남의 이야기·
--   정보 없는 질문·자기소개" 였다. relevant(분석 재료인가)만으로는 이걸 못 거른다. 정의는 lib/analysis/relevance-criteria.ts
--   PRODUCT_INFORMATIVE_CRITERIA 한 곳, 사람용 설명은 docs/t2-relevance-criteria.md "자동승인 추가 질문".
--
-- 🟢 비파괴. nullable boolean 3개 ADD COLUMN IF NOT EXISTS 뿐 — 백필·CHECK·인덱스 없음. 기존 행은 전부 NULL(= 아직 안 물음).
--    롤백 파일 있음(`_rollback.sql` — DROP COLUMN 3줄). 사라지는 값: 1차·2차는 다음 판정이 다시 채우고, 사람 값은 채점표에서 다시 import.
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 데이터 변경 없음 · 인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--    선행: 20260930000027(second_verdict 등) — 이 파일은 그 컬럼을 참조하지 않지만 rr-v2 코드는 둘 다 읽는다.
--
-- 컬럼 (true | false | null — null 은 "판단 불가·아직 안 물음", false 로 접지 않는다 §7.1)
--   · product_informative         — 1차 판정(relevance-judge-auto)
--   · second_product_informative  — 2차 판정(relevance-second-opinion-import --record-second)
--   · human_product_informative   — 사람(relevance-grading-import 의 정보 열 · 채점 웹 화면). 있으면 이긴다.
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용해도 자동 승인은 켜지지 않는다(AUTO_APPROVAL_ENABLED 기본 꺼짐).

ALTER TABLE public.review_relevance_verdicts
  ADD COLUMN IF NOT EXISTS product_informative boolean,
  ADD COLUMN IF NOT EXISTS second_product_informative boolean,
  ADD COLUMN IF NOT EXISTS human_product_informative boolean;

COMMENT ON COLUMN public.review_relevance_verdicts.product_informative IS
  '1차: 독자가 이 제품(또는 경쟁·대체재)을 판단하는 데 쓸 구체 정보가 원문에 있나. null = 판단 불가.';
COMMENT ON COLUMN public.review_relevance_verdicts.second_product_informative IS
  '2차: product_informative 와 같은 질문의 독립 판정. null = 판단 불가.';
COMMENT ON COLUMN public.review_relevance_verdicts.human_product_informative IS
  '사람: product_informative 와 같은 질문. 있으면 이긴다. rr-v2 감사 오류 = human_verdict irrelevant 또는 이 값 false.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='review_relevance_verdicts'
--      and column_name in ('product_informative','second_product_informative','human_product_informative');  -- 3행, boolean, YES
--   select count(*) from public.review_relevance_verdicts where product_informative is not null;          -- 0 (백필 없음)
-- ── 음성 (롤백되는 형태) ──
--   begin;
--     update public.review_relevance_verdicts set human_product_informative = 'maybe'
--      where input_id = (select input_id from public.review_relevance_verdicts limit 1);   -- 기대: ERROR 22P02
--   rollback;
