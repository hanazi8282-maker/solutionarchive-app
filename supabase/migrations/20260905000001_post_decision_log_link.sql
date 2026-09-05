-- ============================================================
-- 발행 글(posts) ↔ 방법론 판정 로그(LOG-xxxx) 연결
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
-- 왜 컬럼 1개인가 (설계 선택):
--   (A) posts.decision_log_code 컬럼  ← 이 파일
--   (B) post_decision_links 매핑 테이블 (N:N)
--   (C) decision_logs 테이블로 로그 자체를 DB 에 복제
--
--   (C) 는 하지 않는다. 판정 로그의 정본은 methodology/content/04-decisions.md
--   이고 그건 append-only 마크다운이다. DB 에 복제하는 순간 정본이 둘이 되고,
--   둘이 어긋났을 때 어느 쪽이 맞는지 판단할 근거가 없어진다.
--
--   (B) 는 지금 필요 없다. 한 글이 여러 판정에서 나오는 경우가 실제로 관측되면
--   그때 만든다. 지금 만들면 조인이 하나 늘고 백필 대상이 늘 뿐이다.
--   ⚠️ 다만 (A) → (B) 이행 경로를 파일 하단에 적어 둔다. 나중에 필요해졌을 때
--      "이건 어떻게 옮기지"로 멈추지 않게.
--
-- 왜 FK 를 걸지 않는가:
--   참조 대상(LOG-20260910-01 같은 코드)이 DB 에 없다. 마크다운에만 있다.
--   FK 를 걸려면 (C) 를 해야 하는데 위 이유로 안 한다. 대신 **형식 CHECK** 로
--   오타를 막고, 실제 존재 여부는 scripts/verify-methodology-archive.py 쪽에서
--   대조한다 (DB 값 → 마크다운 코드 목록).
--   ⚠️ 이건 타협이다. "형식은 맞지만 존재하지 않는 코드"가 들어갈 수 있고,
--      그건 검증기가 잡는다. 검증기를 안 돌리면 못 잡는다는 뜻이다.
--
-- 기존 데이터 영향: 없다. nullable 컬럼 추가뿐이고 백필하지 않는다.
--   기존 행은 전부 NULL 로 남는다 — 실제로 판정 로그에서 나온 글이 아니므로
--   NULL 이 맞다. 모르는 것을 추측으로 채우면 신뢰도 계산이 오염된다.
--
-- 가역: 동명 rollback 파일 참조.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) 컬럼
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS decision_log_code text;

COMMENT ON COLUMN public.posts.decision_log_code IS
  '이 글을 만들게 한 방법론 판정 로그 코드. 정본은 methodology/content 의 '
  '04-decisions.md / cross-decisions.md. 형식: LOG-YYYYMMDD-NN, UPD-…, NEW-…, XUP-…. '
  'NULL = 판정에서 나온 글이 아님(추측 백필 금지).';

-- ────────────────────────────────────────────────────────────
-- 2) 형식 CHECK
--
-- 코드 네임스페이스는 3층이고 로그 계열은 접두사 4종이다
-- (LOG- 신규판정 / UPD- 규칙갱신 / NEW- 신규규칙 / XUP- 교차갱신).
-- 접두사를 열거해 두면 R-01 같은 **규칙 코드**를 여기 잘못 넣는 사고를 막는다.
-- 규칙 코드는 이 컬럼이 아니라 판정 로그 엔트리 안에 있다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_decision_log_code_format_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_decision_log_code_format_check
  CHECK (
    decision_log_code IS NULL
    OR decision_log_code ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$'
  );

-- ────────────────────────────────────────────────────────────
-- 3) 인덱스
--
-- 조회 방향은 "규칙 → 그 규칙으로 쓴 글들 → 지표" 다. 즉 코드로 긁는다.
-- NULL 이 대부분일 것이므로 부분 인덱스로 만든다.
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS posts_decision_log_code_idx
  ON public.posts (decision_log_code)
  WHERE decision_log_code IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4) 확인 쿼리 (적용 후 대시보드에서 직접 돌려볼 것)
-- ────────────────────────────────────────────────────────────
-- 컬럼·제약·인덱스가 다 붙었는지:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'posts'
--      AND column_name = 'decision_log_code';
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'posts_decision_log_code_format_check';
--
-- CHECK 가 실제로 막는지 (양성·음성 둘 다 확인 — CLAUDE.md §7.1):
--   -- 통과해야 함
--   SELECT 'LOG-20260910-01' ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';   -- t
--   -- 막혀야 함
--   SELECT 'R-01'            ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';   -- f
--   SELECT 'LOG-2026-09-10'  ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$';   -- f
--
-- ────────────────────────────────────────────────────────────
-- 5) 나중에 N:N 이 필요해지면 (옵션 B 이행 경로)
--
-- 한 글이 여러 판정에서 나오는 사례가 관측되면 아래로 옮긴다.
-- 지금 실행하지 말 것. 적어 두는 이유는 이행이 가능하다는 걸 보이기 위해서다.
--
--   CREATE TABLE public.post_decision_links (
--     post_id           uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
--     decision_log_code text NOT NULL,
--     corpus            text NOT NULL CHECK (corpus IN ('solfa', 'pdp', 'cross')),
--     role              text NOT NULL CHECK (role IN ('primary', 'secondary')),
--     created_at        timestamptz NOT NULL DEFAULT now(),
--     PRIMARY KEY (post_id, decision_log_code)
--   );
--
--   -- 무손실 이행: 기존 컬럼 값이 primary 링크가 된다
--   INSERT INTO public.post_decision_links (post_id, decision_log_code, corpus, role)
--   SELECT id, decision_log_code, 'solfa', 'primary'
--     FROM public.posts
--    WHERE decision_log_code IS NOT NULL;
--   -- ⚠️ corpus 를 'solfa' 로 박은 게 아니다. 이행 시점에 코드별 corpus 를
--   --    04-decisions.md / cross-decisions.md 에서 실제로 조회해 채울 것.
--   --    위 문장은 형태 예시이지 그대로 돌릴 문장이 아니다.
--
--   ALTER TABLE public.posts DROP COLUMN decision_log_code;   -- 이행 확인 후
-- ────────────────────────────────────────────────────────────
