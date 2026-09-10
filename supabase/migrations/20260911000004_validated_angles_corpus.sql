-- ============================================================
-- 20260911000004_validated_angles_corpus
--
-- 앵글 "실전 채택 표시" — 사람이 명시적으로 승인한 성공 사례만 쌓는 신규
-- 제품 트랙 테이블(§20/§21). analysis_angles 를 FK 로 참조하는 건 같은 제품
-- 트랙 내부라 트랙 분리 위반이 아니다 — case_studies/case_evidence(방법론
-- 트랙) 쪽은 참조하지 않는다.
--
-- 왜 자동 적재가 아니라 수동 승인인가: analysis_angles.substantiation_verdict
-- 가 'SUBSTANTIATED' 인 건 "이 카피 문장에 근거가 있다"는 LLM 판정일 뿐,
-- "이 앵글이 실제 시장에서 성과를 냈다"는 것과 다르다. 이 둘을 섞어서 자동
-- 적재하면, 크로스섹션 어드바이저가 검증 안 된 카피 판정을 성공 사례처럼
-- 추천하게 된다. 그래서 사람이 명시적으로 "이 앵글 실전에서 써봤고 됐다"고
-- 표시하는 지점만 만든다 — app/api/analyze/angle/validate/route.ts 의 POST
-- 호출로만 채워지고, 자동 트리거는 어디에도 없다.
--
-- angle_id 는 nullable + ON DELETE SET NULL: 앵글 생성 POST(/api/analyze/angle)
-- 는 재실행할 때마다 project_id 의 기존 analysis_angles 를 통째로 delete→insert
-- 한다. angle_id 를 NOT NULL + CASCADE 로 두면 앵글을 재생성할 때마다 이미
-- 승인해둔 실전 채택 기록이 함께 삭제된다(승인 이력 유실). RESTRICT 로 두면
-- 반대로 앵글 재생성 자체가 막힌다(기존 동작 파손). product_category/
-- angle_summary/outcome_note 를 이미 스냅샷으로 들고 있으므로, 원본 앵글이
-- 없어져도(id 가 null 이 되어도) 승인 이력 자체는 살아남는다.
--
-- ⚠️ 미적용 (CLAUDE.md §10.1). 남헌이 대시보드에서 직접 실행. 프로젝트 ref: qmgrfqjfxqhxuufrnkwf
-- ============================================================

CREATE TABLE IF NOT EXISTS public.validated_angles_corpus (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 원본 앵글. 앵글 재생성 시 삭제돼도 이 승인 기록은 남아야 하므로 SET NULL.
  angle_id           uuid REFERENCES public.analysis_angles(id) ON DELETE SET NULL,

  product_category   text NOT NULL,

  -- 승인 시점의 앵글 문구 스냅샷. angle_id 가 나중에 null 이 되더라도
  -- "무엇을 승인했는지"가 남아야 어드바이저(향후 wiring 시)나 사람이 읽을 수 있다.
  angle_summary      text NOT NULL,

  -- "실전에서 어떻게 됐는지" — 사람이 직접 쓰는 자유 서술.
  outcome_note       text NOT NULL,

  -- 승인자. 이 앱에는 로그인/세션이 없어(1인 운영 내부 도구) 요청 바디로 받되,
  -- 안 주면 기본값으로 채운다.
  validated_by       text NOT NULL DEFAULT '남헌',

  validated_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.validated_angles_corpus IS
  '앵글 "실전 채택 표시" — 사람이 명시적으로 승인한 성공 사례만 쌓는다. 자동 '
  '트리거 없음(app/api/analyze/angle/validate/route.ts 의 POST 호출로만 적재). '
  'substantiation_verdict=SUBSTANTIATED 와는 다른 판정 — 카피 근거 있음과 실전 '
  '성과는 별개다. 제품 트랙 전용, case_studies/case_evidence 참조 금지(§20/§21).';
COMMENT ON COLUMN public.validated_angles_corpus.angle_id IS
  '원본 analysis_angles.id. 앵글 재생성으로 원본이 삭제되면 null 이 되지만 '
  '승인 기록(angle_summary/outcome_note)은 남는다.';

-- RLS: 정책 없이 활성화만 (deny-all). 접근은 서버 Route Handler 의 service_role
-- 경유 — strategy_principles/failed_angles 와 동일 패턴.
ALTER TABLE public.validated_angles_corpus ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS validated_angles_corpus_angle_id_idx
  ON public.validated_angles_corpus (angle_id);
CREATE INDEX IF NOT EXISTS validated_angles_corpus_category_idx
  ON public.validated_angles_corpus (product_category);

-- 확인용 (적용 후):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name='validated_angles_corpus' ORDER BY ordinal_position;
--
--   -- 음성: angle_id 없는 INSERT 도 통과해야 한다(nullable 설계 확인)
--   INSERT INTO public.validated_angles_corpus (product_category, angle_summary, outcome_note)
--     VALUES ('테스트', '테스트 앵글', '테스트 결과');
--   기대: 성공 (에러 없음)
--   정리: DELETE FROM public.validated_angles_corpus WHERE product_category = '테스트';
