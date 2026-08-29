-- ============================================================
-- 저장 글 기반 피드백 루프 — saved_examples + hypotheses 출처 추적
--
-- 피드백 루프 설계안 §2 의 테이블을 만든다. Notion 인박스에 사람이 저장한
-- Threads 글을 받아, 나이틀리 배치가 패턴을 추출해 가설로 승격시키는 경로의
-- 시작점이다.
--
-- ⚠️ 설계안 §2/§4 원안과 의도적으로 다른 곳이 3군데 있다. 실제 스키마와
--    충돌하거나, 그대로 두면 루프가 조용히 끊기기 때문이다. 아래에 사유를
--    남긴다 — 원안으로 되돌리기 전에 반드시 읽을 것.
--
--    (1) proposed_hypothesis_code 를 hypotheses(code) 로 가는 진짜 FK 로 걸었다.
--        원안은 "FK 아님, 텍스트 참조"였다. 텍스트로 두면 오타나 삭제된 코드가
--        조용히 남고, 나중에 "이 인사이트가 어느 가설이 됐나"를 되짚을 때
--        끊긴 참조를 사람이 눈으로 찾아야 한다. 이 컬럼은 nullable 이라
--        FK 를 걸어도 분석 전 행에는 아무 제약이 없다.
--
--    (2) hypotheses.status 에 'proposed' 를 추가하지 않는다.
--        원안 §4 는 자동 추출 가설을 status='proposed' 로 넣고, §6 에서
--        'confirmed' 로 올린다고 했다. 그런데 실제 제약은
--          hypotheses_status_check: testing | supported | rejected | inconclusive
--        이라 'proposed' / 'confirmed' 는 INSERT 자체가 실패한다.
--
--        더 중요한 문제: .claude/commands/threads-draft.md 는 초안 생성 시
--          hypotheses?...&status=eq.testing
--        로만 가설을 읽는다. 'proposed' 라는 새 상태를 만들면 자동 추출된
--        가설은 초안 생성기에 영영 안 잡히고, 실험이 돌지 않으니 표본도
--        안 쌓이고, 승격도 기각도 영원히 일어나지 않는다. 에러 없이 루프만
--        끊긴다 — 가장 발견하기 어려운 형태의 고장이다.
--
--        그래서 자동 추출 가설도 기존 어휘 그대로 status='testing' 으로
--        들어간다. 초안 생성기를 한 줄도 안 고쳐도 즉시 실험군에 편입된다.
--        "사람이 만든 것"과 "자동 추출된 것"의 구분은 status 가 아니라
--        아래 (3) 의 source 컬럼이 담당한다. 상태와 출처는 서로 다른 축이고
--        하나의 컬럼에 두 축을 섞으면 이런 충돌이 반복된다.
--
--    (3) hypotheses 에 source / source_example_id 를 추가한다.
--        원안 §4 의 INSERT 는 source 컬럼을 쓰지만 그 컬럼이 없어 42703 으로
--        실패한다. 둘 다 nullable ADD COLUMN 이라 기존 7행(H1~H7)에 영향 0.
--
-- ⚠️ 승격 가드에 대한 경고 (설계안 §5/§6 의 전제 하나가 사실과 다르다):
--    설계안은 "guard_learning_promotion() 트리거를 그대로 재사용하므로 신규
--    코드가 불필요"하다고 본다. 그러나 그 트리거는 learnings 테이블에만
--    걸려 있고(BEFORE INSERT OR UPDATE ON public.learnings), hypotheses 에는
--    걸려 있지 않다. 즉 §6 이 hypotheses.status 만 바꾸는 방식으로 자동
--    승격하면 표본 5개 가드를 통째로 우회한다.
--
--    이 파이프라인은 §10 예외로 main 직접 push 권한을 받은 유일한 경로다.
--    표본 2~3개짜리 노이즈가 가드 없이 confirmed 로 굳어 가이드 파일에
--    자동 커밋되면, 그 결론이 다음 생성에 피드백되어 스스로를 강화한다.
--    되돌리기 가장 어려운 종류의 오류다.
--
--    따라서 아래에 trg_guard_hypothesis_promotion 을 추가해 hypotheses 쪽에도
--    같은 문턱(5)을 세운다. learnings 의 가드와 값이 같아야 두 경로가 서로
--    다른 기준으로 갈라지지 않는다.
--
-- 가역: 동명 rollback 파일 참조(20260829000001_saved_examples_rollback.sql).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) saved_examples — Notion 인박스에서 동기화된 저장 글 1건 = 1행
--
--    notion_page_id 가 멱등성 키다. 크론이 같은 행을 여러 번 읽어도
--    upsert(onConflict: notion_page_id)로 중복이 생기지 않는다.
--    UNIQUE 제약이 없으면 재실행마다 같은 글이 새 행으로 쌓이고,
--    같은 패턴이 "2건 이상 반복 관찰"된 것처럼 보여 §4 의 우선순위
--    가중치가 거짓 신호를 받는다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_examples (
  id              uuid        NOT NULL DEFAULT gen_random_uuid()
                              CONSTRAINT saved_examples_pkey PRIMARY KEY,
  notion_page_id  text        NOT NULL
                              CONSTRAINT saved_examples_notion_page_id_key UNIQUE,
  source_url      text,
  raw_text        text,
  user_note       text,
  saved_at        timestamptz NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now(),

  analysis_status text        NOT NULL DEFAULT 'pending',
  analyzed_at     timestamptz,
  analysis_error  text,

  insight_type       text,
  extracted_insight  text,
  extracted_pattern  text,
  why_it_works       text,
  is_generalizable   boolean,

  proposed_hypothesis_code text,

  CONSTRAINT saved_examples_analysis_status_check
    CHECK (analysis_status = ANY (ARRAY['pending'::text, 'analyzed'::text, 'failed'::text])),

  -- insight_type 은 분석 전/실패 시 null 이므로 null 을 허용하되,
  -- 값이 있다면 insight-guide.md 의 3개 기준 중 하나여야 한다.
  -- 자유 텍스트로 두면 LLM 이 매번 다른 표현을 넣어 집계가 불가능해진다.
  CONSTRAINT saved_examples_insight_type_check
    CHECK (insight_type IS NULL OR insight_type = ANY (
      ARRAY['actionable'::text, 'reframe'::text, 'transferable_frame'::text])),

  -- 설계안 원안은 텍스트 참조였다. 위 헤더 (1) 참조.
  CONSTRAINT saved_examples_proposed_hypothesis_code_fkey
    FOREIGN KEY (proposed_hypothesis_code) REFERENCES public.hypotheses(code)
);

-- 크론 STEP 2 는 매 실행마다 analysis_status='pending' 을 훑는다.
-- 행이 쌓일수록 풀스캔 비용이 커지므로 부분 인덱스를 둔다.
CREATE INDEX IF NOT EXISTS saved_examples_pending_idx
  ON public.saved_examples (saved_at)
  WHERE analysis_status = 'pending';

-- ⚠️ 자격증명은 아니지만 사람이 저장한 원문·메모가 들어간다.
--    이 앱은 anon 키를 브라우저에 노출하므로 RLS 를 켜고 정책을 만들지 않아
--    service_role(서버 라우트·크론) 전용으로 둔다. api_tokens 와 같은 방침이다.
ALTER TABLE public.saved_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_examples FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.saved_examples IS
  'Notion 인사이트 인박스에서 동기화된 저장 글. 나이틀리 배치가 패턴을 추출해 hypotheses 로 승격시킨다. RLS 정책 없음 = service_role 전용.';
COMMENT ON COLUMN public.saved_examples.notion_page_id IS
  'Notion 페이지 ID. 멱등성 키 — 크론 재실행 시 upsert 충돌 기준이다. 중복되면 같은 패턴이 여러 번 관찰된 것으로 오인된다.';
COMMENT ON COLUMN public.saved_examples.raw_text IS
  '원문. Threads 공개 스크레이핑이 불안정해 사람이 붙여넣는 게 정본이다. 없으면 분석 단계가 source_url 로 재확인을 시도한다.';
COMMENT ON COLUMN public.saved_examples.user_note IS
  '"왜 좋았는지" 사람의 직관 1줄. 선택 입력이지만 있으면 분석 정확도가 올라간다.';
COMMENT ON COLUMN public.saved_examples.analysis_status IS
  'pending: 동기화만 됨 / analyzed: LLM 추출 완료 / failed: 추출 실패(analysis_error 참조). 실패를 pending 으로 되돌리면 매일 같은 행을 무한 재시도한다.';
COMMENT ON COLUMN public.saved_examples.analysis_error IS
  '분석 실패 사유. 이게 없으면 failed 행이 왜 실패했는지 추적할 방법이 없어 사람이 원문을 다시 읽어야 한다.';
COMMENT ON COLUMN public.saved_examples.is_generalizable IS
  '다른 소재에도 재사용 가능한 규칙인가. false 면 이 글 하나에만 해당하는 우연이므로 가설을 만들지 않는다(설계안 §3).';
COMMENT ON COLUMN public.saved_examples.proposed_hypothesis_code IS
  '이 인사이트에서 파생된 hypotheses.code. 가설이 만들어지기 전과 is_generalizable=false 인 행에서는 null 이다.';


-- ────────────────────────────────────────────────────────────
-- 2) hypotheses 출처 추적 — 사람이 세운 가설과 자동 추출 가설을 구분
--
--    전부 nullable ADD COLUMN 이라 기존 H1~H7 은 영향받지 않는다
--    (source 가 null = 사람이 세운 것).
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.hypotheses
  ADD COLUMN IF NOT EXISTS source            text,
  ADD COLUMN IF NOT EXISTS source_example_id uuid;

ALTER TABLE public.hypotheses
  DROP CONSTRAINT IF EXISTS hypotheses_source_example_id_fkey;
ALTER TABLE public.hypotheses
  ADD CONSTRAINT hypotheses_source_example_id_fkey
    FOREIGN KEY (source_example_id) REFERENCES public.saved_examples(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.hypotheses.source IS
  '출처. null = 사람이 세운 가설(H1~H7). auto_extracted_from_saved_examples = 나이틀리 배치가 추출. status 와는 다른 축이다 — 상태에 출처를 섞지 말 것.';
COMMENT ON COLUMN public.hypotheses.source_example_id IS
  '자동 추출된 경우 근거가 된 saved_examples 행. 승격 커밋 메시지에 근거 링크를 넣을 때 쓴다.';


-- ────────────────────────────────────────────────────────────
-- 3) 가설 승격 가드 — hypotheses 에도 표본 5개 문턱을 세운다
--
--    ⚠️ 이 트리거가 이 마이그레이션에서 가장 중요한 부분이다.
--
--    learnings 에는 guard_learning_promotion() 이 이미 있지만 hypotheses 에는
--    없다. 이 파이프라인은 사람 승인 없이 main 에 push 할 권한을 받은 유일한
--    경로이므로, DB 레벨 가드가 없으면 표본 2개짜리 결론이 가이드 파일에
--    자동 반영되고 그게 다음 생성에 피드백된다.
--
--    문턱 5 는 guard_learning_promotion() 및 scripts/threads-report.mjs 와
--    같은 값이다. 세 곳이 어긋나면 리포트에서 충분해 보이던 것이 승격에서
--    막히고, 사람이 이유를 다시 추적하게 된다.
--
--    표본 수는 post_performance 에서 직접 센다. 애플리케이션이 넘긴 숫자를
--    믿으면 가드를 통과시키려 그 숫자만 바꾸면 되므로 가드의 의미가 없다.
--    views_24h 가 없는 글은 아직 측정이 안 끝난 것이라 세지 않는다 —
--    scripts/threads-report.mjs 의 집계 규칙과 같다.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_hypothesis_promotion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  n integer;
begin
  -- 'supported' 로 올라가는 순간에만 검사한다. testing → rejected 는
  -- 막지 않는다(근거 부족으로 접는 건 표본이 적어도 정당하다).
  if new.status = 'supported' and (old.status is distinct from 'supported') then
    select count(*) into n
      from public.post_performance
     where hypothesis_code = new.code
       and views_24h is not null;

    if n < 5 then
      raise exception
        '가설 % 는 표본 %개로 supported 불가. 최소 5개 필요(24h 측정 완료 기준).',
        new.code, n;
    end if;
  end if;
  return new;
end;
$function$;

-- CREATE OR REPLACE TRIGGER 는 PostgreSQL 14+ 문법이다(Supabase 는 15 이상).
-- DROP 후 CREATE 로 쓰지 않는 이유: 두 문장 사이에 가드가 잠깐 사라지는 창이 생긴다.
CREATE OR REPLACE TRIGGER trg_guard_hypothesis_promotion
  BEFORE UPDATE ON public.hypotheses
  FOR EACH ROW EXECUTE FUNCTION public.guard_hypothesis_promotion();

COMMENT ON FUNCTION public.guard_hypothesis_promotion() IS
  '표본 5개 미만인 가설의 supported 승격을 막는다. 자동 승격 파이프라인(§6)이 사람 승인 없이 도는 유일한 경로라 DB 레벨 가드가 필요하다.';
