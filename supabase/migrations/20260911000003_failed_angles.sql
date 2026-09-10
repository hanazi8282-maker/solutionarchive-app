-- ============================================================
-- 20260911000003_failed_angles
--
-- 반증마켓(§13-2) 콜드스타트용 실패 앵글 원장. 원안(CB Insights/Failory/
-- Kaggle/Kickstarter 자동 백필)은 전부 상업적 노출 라이선스 저촉으로 폐기됐다
-- (SP-012, §17-3 수정안). 대신 공개적으로 널리 보도된 실패 사례를 자체
-- 문장으로 재서술해서 수동 큐레이션한다.
--
-- 정본은 docs/failed-angles.md 표이고, scripts/failed-angles-sync.mjs 가
-- 그 표를 파싱해 이 테이블로 upsert 한다.
--
-- 트랙 분리(§20/§21): 이 테이블은 완전히 독립된 신규 제품 트랙 테이블이다.
-- case_studies/case_evidence(방법론 트랙)를 참조하는 FK·조인을 두지 않는다.
--
-- ⚠️ AC-3(라이선스 확인 게이트)는 이 마이그레이션 범위가 아니다. 시드 행은
--    전부 "공개 보도 기반 재서술"이라 원 데이터셋 라이선스 문제와 무관하다는
--    점만 evidence_source 에 명시했다. AC-3 자체는 별도 후속 작업이다.
--
-- lib/cases/advisor.ts 의 corpus_b: { status: 'pending' } placeholder는 이번
-- 마이그레이션에서 wiring 하지 않는다 — 테이블 + 큐레이션 툴링까지만.
--
-- ⚠️ 미적용 (CLAUDE.md §10.1). 남헌이 대시보드에서 직접 실행. 프로젝트 ref: qmgrfqjfxqhxuufrnkwf
-- ============================================================

CREATE TABLE IF NOT EXISTS public.failed_angles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 소문자·숫자·하이픈만. sync 스크립트의 upsert 충돌 키.
  case_key           text NOT NULL UNIQUE CHECK (case_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  product_category   text NOT NULL,

  -- 실패한 제품/서비스가 내세웠던 소구점 그 자체.
  claimed_angle      text NOT NULL,

  -- 무엇이, 왜 실패했는지 — 결과 서술.
  outcome            text NOT NULL,

  -- 어디서 나온 근거인지에 대한 서술(매체명 나열이 아니라 "다수 매체 보도" 같은
  -- 서술형). 이 원장에서는 전부 공개 보도 기반 재서술이라는 점을 명시하는 자리.
  evidence_source    text NOT NULL,

  -- 이 원장에서는 항상 '공개 보도'. 향후 다른 출처 등급이 추가될 가능성을 열어
  -- 두기 위해 자유 텍스트로 둔다(strategy_principles.evidence_grade 처럼 닫힌
  -- CHECK 어휘로 잠그지 않음 — 아직 단일 값뿐이라 조기 확정하지 않는다).
  source_tier        text NOT NULL,

  -- 재서술 과정에서 추정·해석이 섞였으면 true, 보도된 사실 그대로면 false.
  is_estimate        boolean NOT NULL DEFAULT false,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.failed_angles IS
  '반증마켓(§13-2) 콜드스타트 — 공개 보도 기반으로 재서술한 실패 사례 원장. '
  '정본은 docs/failed-angles.md 표. sync: scripts/failed-angles-sync.mjs. '
  '제품 트랙 전용 — case_studies/case_evidence(방법론 트랙) 참조 금지(§20/§21).';
COMMENT ON COLUMN public.failed_angles.claimed_angle IS
  '실패한 제품/서비스가 내세웠던 소구점.';
COMMENT ON COLUMN public.failed_angles.is_estimate IS
  '재서술 과정에서 추정·해석이 섞였으면 true, 보도된 사실 그대로면 false.';

-- RLS: 정책 없이 활성화만 (deny-all). 접근은 전부 서버 Route Handler 의
-- service_role 경유 — strategy_principles 와 동일 패턴.
ALTER TABLE public.failed_angles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS failed_angles_category_idx
  ON public.failed_angles (product_category);

-- ────────────────────────────────────────────────────────────
-- 시드 — docs/failed-angles.md 표
--   parser: scripts/failed-angles-sync.mjs parseFailedAnglesTable
--   재적용 안전: ON CONFLICT (case_key) DO UPDATE 로 표 최신값을 반영한다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.failed_angles (case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate) VALUES
  ('quibi-mobile-shortform', '모바일 숏폼 스트리밍', '"이동 중에만 보는 8분 이하 프리미엄 숏폼 — 모바일 전용, 회전하면 화면비까지 바뀐다"는 차별화 소구', '2020년 4월 출시 후 가입자·시청 지표가 목표에 크게 못 미쳤고, 팬데믹으로 "이동 중 시청" 전제 자체가 무너지면서 약 6개월 만에 서비스 종료를 발표했다', '출시·종료 시점과 사유가 다수 주요 매체에서 폭넓게 보도됨', '공개 보도', false),
  ('juicero-connected-press', '커넥티드 프리미엄 가전(IoT)', '"앱과 연동된 프리미엄 착즙기가 QR코드로 신선도·유통기한을 인증해준다"는 스마트 가전 소구', '2017년 한 매체가 손으로 직접 짜도 기기와 동일한 결과가 나온다는 사실을 보도하면서 고가(수백 달러) 하드웨어의 필요성에 대한 신뢰가 크게 흔들렸고, 이후 약 1년 반 만에 사업을 접었다', '손으로 짜는 시연 보도와 이후 폐업 소식이 다수 매체에서 보도됨', '공개 보도', false),
  ('google-glass-explorer', '착용형 스마트 디바이스', '"일상적으로 착용하는 핸즈프리 증강현실 안경으로 사진·검색·길안내를 눈앞에서 해결한다"는 소구', '소비자용(Explorer) 버전은 사생활 침해 우려로 인한 사회적 반발("Glasshole" 낙인)과 실사용성 문제가 겹치며 대중 소비자 시장에서 철수했고, 이후 기업용(Enterprise) 라인으로 방향을 틀었다', '사회적 반발·소비자용 판매 중단 보도가 다수 매체에서 폭넓게 다뤄짐', '공개 보도', true),
  ('amazon-fire-phone', '스마트폰(제조사 직접 진출)', '"다이내믹 퍼스펙티브(머리 움직임에 반응하는 3D 패럴랙스 UI)로 경쟁 스마트폰과 확실히 다른 경험"이라는 차별화 소구', '2014년 출시 후 판매가 크게 부진했고, 재고 상각 손실을 회계에 반영한 뒤 약 1년 만에 단종됐다', '출시·재고 손실·단종 소식이 다수 매체에서 보도됨', '공개 보도', false),
  ('segway-personal-transporter', '개인용 이동수단(2륜 자립형)', '"도시 내 걷기와 자동차 사이를 대체할 차세대 개인 이동수단"이라는 소구로 대중적 혁신을 예고', '높은 가격, 각국의 보도·통행 관련 규제, 기대에 못 미친 실사용 편의성이 겹치며 일반 소비자 대중화에는 이르지 못했고, 이후 경비·순찰·투어 등 B2B/틈새 용도 중심으로 자리 잡았다', '출시 당시의 대중화 기대와 이후 저조한 소비자 판매에 대한 보도가 다수 매체에서 다뤄짐', '공개 보도', true),
  ('google-plus-social', '소셜 네트워크', '"구글 서비스 전반을 하나로 묶는 차세대 소셜 네트워크"라는 통합 플랫폼 소구', '강제 연동 논란과 낮은 자발적 참여율이 이어졌고, 보안 결함 노출이 겹치며 일반 소비자용 서비스가 예정보다 앞당겨 종료됐다', '저조한 참여율·보안 이슈·서비스 종료 발표가 다수 매체에서 보도됨', '공개 보도', false)
ON CONFLICT (case_key) DO UPDATE SET
  product_category = EXCLUDED.product_category,
  claimed_angle    = EXCLUDED.claimed_angle,
  outcome          = EXCLUDED.outcome,
  evidence_source  = EXCLUDED.evidence_source,
  source_tier      = EXCLUDED.source_tier,
  is_estimate      = EXCLUDED.is_estimate,
  updated_at       = now();

-- ============================================================
-- 검증 (적용 직후 — 양성/음성 둘 다)
-- ============================================================
-- 양성 1) 6행이 들어갔는가
--   SELECT count(*) FROM public.failed_angles;                          -- 기대: 6
--   SELECT case_key FROM public.failed_angles ORDER BY case_key;
-- 양성 2) 카테고리 인덱스 조회
--   SELECT case_key FROM public.failed_angles WHERE product_category = '소셜 네트워크';
--     기대: google-plus-social
-- 음성 1) case_key 형식 위반 거절
--   INSERT INTO public.failed_angles (case_key, product_category, claimed_angle, outcome, evidence_source, source_tier)
--     VALUES ('Not Valid Key', 'x', 'x', 'x', 'x', 'x');
--     기대: ERROR 23514 check constraint "failed_angles_case_key_check"
-- 음성 2) 중복 case_key 거절(UNIQUE)
--   INSERT INTO public.failed_angles (case_key, product_category, claimed_angle, outcome, evidence_source, source_tier)
--     VALUES ('quibi-mobile-shortform', 'x', 'x', 'x', 'x', 'x');
--     기대: ERROR 23505 duplicate key value violates unique constraint
