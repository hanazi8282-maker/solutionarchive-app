-- content_columns — 분석 칼럼(3,000~8,000자) + 그 칼럼에서 뗀 스레드를 대시보드에서 검수한다.
--
-- 왜 새 테이블인가: `posts` 는 Threads 게시물 1건 = 1행(짧은 본문·pattern·hook_type·chain 등
-- 스레드 전용 필드) 설계라 칼럼 전문을 담을 자리가 없다. 칼럼은 drafts/columns/*.md 파일이
-- 정본이고(케이스-작성-가이드.md), 이 테이블은 그 파일을 사람이 검수할 수 있게 "적재"한
-- 사본이다 — /cases 가 case_studies 를 검수하는 것과 같은 자리.
--
-- 적재는 scripts/column-stage.mjs 가 한다(무인 루프 아님, 사람이 CLI 로 실행).
-- review_status 는 그 화면 서버 액션(사람)만 approved/rejected 로 바꾼다 (CLAUDE.md §10.1).
--
-- 스레드는 별도 테이블 대신 jsonb 배열로 둔다 — 칼럼 1건당 스레드 2~4개뿐이라 조인 테이블은
-- 과하다(YAGNI). 편별 승인은 하지 않는다 — 칼럼과 그 스레드는 한 세트로 검수한다.

CREATE TABLE IF NOT EXISTS public.content_columns (
  id              uuid        NOT NULL DEFAULT gen_random_uuid()
                              CONSTRAINT content_columns_pkey PRIMARY KEY,
  slug            text        NOT NULL
                              CONSTRAINT content_columns_slug_key UNIQUE,
  source_path     text        NOT NULL,
  reader_type     text        NOT NULL,
  title           text        NOT NULL,
  -- 칼럼 원문 그대로(근거 메모·자체 점검 절 포함) — 검수자가 원문 전체를 봐야 한다.
  body            text        NOT NULL,
  char_count      int         NOT NULL,
  -- [{ "seq": "1", "body": "...", "char_count": 419 }, ...] — column-check.mjs checkThreads 파싱 그대로.
  threads         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- 독립 검증(.verify.md) 결과. 파일이 없으면 둘 다 NULL — "미검증"과 "검증 통과"를 같은 값으로 접지 않는다(§7.1).
  verify_path     text,
  verify_verdict  text,
  review_status   text        NOT NULL DEFAULT 'draft',
  review_note     text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  staged_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_columns_reader_type_check
    CHECK (reader_type = ANY (ARRAY['창업자'::text, '셀러'::text])),
  CONSTRAINT content_columns_review_status_check
    CHECK (review_status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text]))
);

CREATE INDEX IF NOT EXISTS content_columns_review_status_idx
  ON public.content_columns USING btree (review_status, staged_at DESC);

COMMENT ON TABLE public.content_columns IS
  '칼럼·스레드 검수 대시보드(/columns)의 데이터 원본. 정본은 drafts/columns/*.md — 이 테이블은 검수용 사본.';
COMMENT ON COLUMN public.content_columns.threads IS
  'checkThreads() 파싱 결과 배열 그대로: [{n, body, char_count, warns}]. 편별 승인 없음 — 칼럼 단위로 검수.';

-- RLS ON + 정책 0 = service_role(서버 액션·스테이징 스크립트)만 접근, anon/authenticated 는 전 행 차단.
-- 이 리포의 다른 테이블과 같은 규약(20260915000002_enable_rls_service_only.sql 참조).
ALTER TABLE public.content_columns ENABLE ROW LEVEL SECURITY;
