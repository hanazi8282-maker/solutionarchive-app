-- ============================================================
-- 발행 글(posts) ↔ 방법론 판정 로그(LOG-xxxx) 연결
--   → 별도 매핑 테이블 public.post_decision_link  (Option B)
--
-- ⛔ 아직 적용하지 않았다. 남헌이 Supabase 대시보드에서 직접 실행할 것.
--    (MCP 는 회사 프로젝트에 잠겨 있어 이 레포에서 적용할 수 없다.)
--
-- 배경: prediction-schema.md §7-3 이 남긴 마지막 구멍이다.
--   matcher 는 이미 Dice 계수로 "발행된 Threads 글 ↔ posts 초안"을 잇는다.
--   그런데 그 글이 **어떤 판정에서 나왔는지** 를 잇는 곳이 없다. 없으면
--   score-predictions.mjs 가 지표를 규칙으로 되돌리지 못하고, 규칙 신뢰도
--   (§5 Wilson 하한)가 영영 계산되지 않는다. 루프가 거기서 끊긴다.
--
-- ────────────────────────────────────────────────────────────
-- 설계 선택 기록 (남헌 확정 2026-09-05)
--
--   (A) posts.decision_log_code 컬럼 추가
--   (B) post_decision_link 매핑 테이블          ← ★ 채택. 이 파일의 정본.
--   (C) decision_logs 테이블로 판정 로그 자체를 DB 에 복제
--
--   ⚠️ 이 파일의 이전 판(커밋 7f80309)은 (A) 를 정본으로 썼다. 남헌이 (B) 로
--      뒤집었다. 아래 3가지가 뒤집은 근거다. (A) 는 파일 하단에 주석으로 보존한다
--      — 지우면 "왜 컬럼으로 안 했지"를 다음 사람이 다시 조사한다.
--
--   (B) 를 택한 이유 3가지:
--
--   1. 트랙 경계. posts 는 제품 트랙(solutionarchive-app)의 핵심 테이블이다.
--      방법론 트랙 때문에 컬럼을 추가하면 HANDOVER-SEED.md §2 의 두 트랙 분리
--      원칙이 흐려진다. 별도 테이블이 경계를 유지한다.
--
--   2. 롤백. 테이블 drop 이 컬럼 drop 보다 안전하다. posts 를 아예 안 건드린다.
--      (A) 의 롤백은 제품 트랙의 핵심 테이블에 DDL 을 거는 일이었다.
--
--   3. paired 예측. prediction-schema.md §2-1 의 `paired` 기준선(A/B 성격 실험)은
--      한 판정에 두 발행이 붙는다. (A) 는 posts 1행당 코드 1개라 구조적으로 불가능하고,
--      paired 를 쓰기 시작하는 날 다시 마이그레이션해야 한다. role 컬럼이 이걸 푼다.
--
--   (C) 는 하지 않는다. 판정 로그의 정본은 methodology/content 의
--   solfa/04-decisions.md · pdp/04-decisions.md · cross-decisions.md 이고
--   그건 append-only 마크다운이다. DB 에 복제하는 순간 정본이 둘이 되고,
--   둘이 어긋났을 때 어느 쪽이 맞는지 판단할 근거가 없어진다.
--
-- ────────────────────────────────────────────────────────────
-- 왜 decision_log_code 에 FK 를 걸지 않는가:
--   참조 대상(LOG-20260910-01 같은 코드)이 DB 에 없다. 마크다운에만 있다.
--   FK 를 걸려면 (C) 를 해야 하는데 위 이유로 안 한다. 대신 **형식 CHECK** 로
--   오타를 막고, 실제 존재 여부는 scripts/verify-methodology-archive.py 쪽에서
--   대조한다 (DB 값 → 마크다운 코드 목록).
--   ⚠️ 이건 타협이다. "형식은 맞지만 존재하지 않는 코드"가 들어갈 수 있고,
--      그건 검증기가 잡는다. 검증기를 안 돌리면 못 잡는다는 뜻이다.
--
-- 기존 데이터 영향: 없다. 새 테이블 하나뿐이고 백필하지 않는다. posts 는
--   읽지도 쓰지도 않는다 (FK 참조만 건다).
--
-- 가역: 동명 rollback 파일 참조. DROP TABLE 하나면 흔적이 남지 않는다.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) 테이블
--
-- PK 를 (post_id, decision_log_code, role) 로 잡는 이유:
--   같은 글이 같은 판정에 대해 primary 이면서 동시에 paired_variant 일 수는 없다.
--   그러나 한 글이 서로 다른 두 판정에 붙는 건 정상이고(연쇄 판정),
--   한 판정에 두 글이 붙는 것도 정상이다(paired). 그래서 N:N 이다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_decision_link (
  post_id           uuid        NOT NULL
                      REFERENCES public.posts(id) ON DELETE CASCADE,
  decision_log_code text        NOT NULL,
  role              text        NOT NULL DEFAULT 'primary',
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT post_decision_link_pkey
    PRIMARY KEY (post_id, decision_log_code, role),

  -- 코드 네임스페이스는 3층이고 로그 계열은 접두사 4종이다
  -- (LOG- 신규판정 / UPD- 규칙갱신 / NEW- 신규규칙 / XUP- 교차갱신).
  -- 접두사를 열거해 두면 R-01 같은 **규칙 코드**를 여기 잘못 넣는 사고를 막는다.
  -- 규칙 코드는 이 컬럼이 아니라 판정 로그 엔트리 안에 있다.
  CONSTRAINT post_decision_link_code_format_check
    CHECK (decision_log_code ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$'),

  -- role 이 없으면 paired 예측에서 대조군과 실험군을 구분할 수 없다.
  -- 구분 못 하면 §4 의 유효/무효 판정이 두 글을 뒤섞어 계산한다.
  CONSTRAINT post_decision_link_role_check
    CHECK (role IN ('primary', 'paired_control', 'paired_variant'))
);

COMMENT ON TABLE public.post_decision_link IS
  '발행 글 ↔ 방법론 판정 로그 매핑. 방법론 트랙 전용이며 posts 스키마를 건드리지 않는다. '
  '정본 로그는 methodology/content 의 04-decisions.md / cross-decisions.md (append-only 마크다운).';

COMMENT ON COLUMN public.post_decision_link.decision_log_code IS
  '판정 로그 코드. 형식 LOG-YYYYMMDD-NN (UPD-/NEW-/XUP- 포함). DB 에 FK 대상이 없어 '
  '형식 CHECK 만 걸고 존재 여부는 verify-methodology-archive.py 가 대조한다.';

COMMENT ON COLUMN public.post_decision_link.role IS
  'primary = 단일 발행. paired_control / paired_variant = prediction-schema.md §2-1 paired '
  '기준선(A/B 성격 실험)의 두 짝. 한 판정에 두 발행이 붙을 때 이 컬럼으로 가른다.';

-- ────────────────────────────────────────────────────────────
-- 2) 인덱스
--
-- 조회 방향은 "규칙/판정 코드 → 그 판정으로 쓴 글들 → 지표" 다. 즉 코드로 긁는다.
-- PK 의 선두 컬럼이 post_id 라서 코드 단독 조회는 PK 인덱스를 못 탄다.
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS post_decision_link_code_idx
  ON public.post_decision_link (decision_log_code);

-- paired 만 골라 보는 조회가 잦다. 대부분 행은 primary 이므로 부분 인덱스.
CREATE INDEX IF NOT EXISTS post_decision_link_paired_idx
  ON public.post_decision_link (decision_log_code, role)
  WHERE role <> 'primary';

-- ────────────────────────────────────────────────────────────
-- 3) 확인 쿼리 (적용 후 대시보드에서 직접 돌려볼 것)
--
-- ⚠️ 양성·음성 둘 다 확인한다. "에러 안 났다"는 통과의 근거가 아니다
--    (CLAUDE.md §7.1).
-- ────────────────────────────────────────────────────────────
-- 테이블·제약이 다 붙었는지:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'post_decision_link'
--    ORDER BY ordinal_position;
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.post_decision_link'::regclass;
--
-- 형식 CHECK 가 실제로 막는지:
--   -- 통과해야 함 (t)
--   SELECT 'LOG-20260910-01' ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';
--   SELECT 'XUP-20260910-01' ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';
--   -- 막혀야 함 (f)
--   SELECT 'R-01'            ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';
--   SELECT 'LOG-2026-09-10'  ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';
--
-- role CHECK 가 실제로 막는지 — 아래는 **에러가 나야 정상**이다:
--   INSERT INTO public.post_decision_link (post_id, decision_log_code, role)
--   SELECT id, 'LOG-20260910-01', 'variant' FROM public.posts LIMIT 1;
--   -- ERROR: new row violates check constraint "post_decision_link_role_check"
--
-- paired 한 쌍이 실제로 들어가는지 (같은 코드 + 서로 다른 글 2개):
--   INSERT INTO public.post_decision_link (post_id, decision_log_code, role)
--   SELECT id, 'LOG-20260910-01',
--          CASE WHEN row_number() OVER (ORDER BY published_at) = 1
--               THEN 'paired_control' ELSE 'paired_variant' END
--     FROM public.posts ORDER BY published_at LIMIT 2;
--   -- 확인 후 되돌릴 것:
--   DELETE FROM public.post_decision_link WHERE decision_log_code = 'LOG-20260910-01';

-- ============================================================
-- 4) 거부된 대안 (A) — posts 컬럼 추가. 실행하지 말 것.
--
-- 커밋 7f80309 까지 이 파일의 정본이었다. 위 헤더의 3가지 이유로 뒤집혔다.
-- 형태를 남기는 이유는, 나중에 "테이블까지 필요했나"라는 질문이 나왔을 때
-- 비교 대상이 없으면 같은 논의를 처음부터 다시 하기 때문이다.
--
--   ALTER TABLE public.posts
--     ADD COLUMN IF NOT EXISTS decision_log_code text;
--
--   ALTER TABLE public.posts
--     ADD CONSTRAINT posts_decision_log_code_format_check
--     CHECK (
--       decision_log_code IS NULL
--       OR decision_log_code ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$'
--     );
--
--   CREATE INDEX IF NOT EXISTS posts_decision_log_code_idx
--     ON public.posts (decision_log_code)
--     WHERE decision_log_code IS NOT NULL;
--
-- (A) 가 못 하는 것: posts 1행당 코드 1개. paired 예측(한 판정 ↔ 두 발행)이
-- 구조적으로 표현되지 않는다. §2-1 을 쓰기 시작하는 날 재마이그레이션이 필요하다.
--
-- 만약 이미 (A) 를 적용한 환경이 있다면 (지금은 없다 — 한 번도 적용 안 됐다),
-- 무손실 이행 경로는 이렇다:
--
--   INSERT INTO public.post_decision_link (post_id, decision_log_code, role)
--   SELECT id, decision_log_code, 'primary'
--     FROM public.posts
--    WHERE decision_log_code IS NOT NULL;
--
--   -- 건수 대조 후에만 컬럼을 떨어뜨린다:
--   --   SELECT count(*) FROM public.posts WHERE decision_log_code IS NOT NULL;
--   --   SELECT count(*) FROM public.post_decision_link WHERE role = 'primary';
--   ALTER TABLE public.posts DROP COLUMN decision_log_code;
--
-- ⚠️ corpus 컬럼은 넣지 않았다. 코드 접두사(LOG/UPD/NEW/XUP)와 마크다운 정본에서
--    corpus 를 되찾을 수 있어서 중복이고, 중복은 어긋난다. 되찾을 수 없다는 게
--    실제로 확인되면 그때 추가한다.
-- ============================================================
