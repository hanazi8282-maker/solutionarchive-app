-- ============================================================
-- 20260910000005_strategy_principles
--
-- 크로스섹션 어드바이저(§20 / §13-7)의 Corpus C — 원칙 원장.
-- 수익화 리서치 §22 표를 구조화한 조각. 정본은 docs/strategy-principles.md 표이고,
-- scripts/strategy-principles-sync.mjs 가 그 표를 파싱해 이 테이블로 upsert 한다.
-- 아래 시드 INSERT 도 같은 표에서 생성했다(파서 출력과 1:1).
--
-- 설계 근거: docs/case-study-pipeline-design.md 계열 / lib/cases/advisor.ts 헤더
--
-- 왜 자유 태그(text[]) 인가 — case_studies 는 매칭 축을 고정 어휘 CHECK 로 잠갔지만,
--   여기 태그는 "이 원칙이 어떤 질문에 걸려야 하는가"를 큐레이터가 판단해 다는
--   것이라 어휘가 사전에 닫히지 않는다. 대신 매칭은 부분문자열 겹침이라 오타·
--   변형에 관대하고, "0건"이 로직 문제인지 진짜 없는 건지는 advisor 가 3상태로 구분한다.
--
-- ✅ 적용됨 (2026-09-10, CLAUDE.md §10.2 — 남헌 1회성 예외 승인으로 클로드코드가
--    직접 실행). 프로젝트 ref: qmgrfqjfxqhxuufrnkwf. 이후 마이그레이션은 다시
--    §10.1 기본 원칙(사람이 대시보드에서 직접 실행)으로 돌아간다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.strategy_principles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SP-NNN. 표의 ID 그대로. sync 스크립트의 upsert 충돌 키.
  sp_id               text NOT NULL UNIQUE CHECK (sp_id ~ '^SP-\d{3}$'),

  -- 매칭용. 큐레이터가 표에 직접 단다.
  tags                text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) > 0),

  statement           text NOT NULL,

  -- 표의 evidence_grade 셀은 'B (3자 서베이)' 꼴. 앞 글자가 등급, 괄호가 주석.
  evidence_grade      text NOT NULL CHECK (evidence_grade IN ('A', 'B', 'C', 'D')),
  evidence_grade_note text,

  -- 수익화 리서치 문서 내 섹션 참조(§0-1 등). URL 이 아니라 문서 앵커다.
  source_ref          text NOT NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.strategy_principles IS
  '크로스섹션 어드바이저 Corpus C. 정본은 docs/strategy-principles.md 표. sync: scripts/strategy-principles-sync.mjs';
COMMENT ON COLUMN public.strategy_principles.tags IS
  '매칭용 자유 태그. case_studies 의 고정 어휘 축과 달리 사전에 닫지 않는다.';
COMMENT ON COLUMN public.strategy_principles.evidence_grade IS
  'A/B/C/D. 표의 "B (3자 서베이)" 에서 앞 글자. 괄호는 evidence_grade_note 로.';
COMMENT ON COLUMN public.strategy_principles.source_ref IS
  '수익화 리서치 문서 섹션 앵커(§0-1 등). URL 아님.';

CREATE INDEX IF NOT EXISTS strategy_principles_tags_idx
  ON public.strategy_principles USING gin (tags);
CREATE INDEX IF NOT EXISTS strategy_principles_grade_idx
  ON public.strategy_principles (evidence_grade);

-- RLS: 정책 없이 활성화만 (deny-all). 접근은 전부 서버 Route Handler 의
-- service_role 경유 — analysis_pipeline / case_study_pipeline 과 동일 패턴.
ALTER TABLE public.strategy_principles ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 시드 — docs/strategy-principles.md §22 표 (SP-001~SP-023)
--   parser: scripts/strategy-principles-sync.mjs parseStrategyTable
--   재적용 안전: ON CONFLICT (sp_id) DO UPDATE 로 표 최신값을 반영한다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.strategy_principles (sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref) VALUES
  ('SP-001', ARRAY['pricing', 'hybrid']::text[], '하이브리드(구독+종량) 프라이싱이 2026년 B2B SaaS 채택률 1위(37%), 전년 대비 급증', 'B', '3자 서베이', '§0-1'),
  ('SP-002', ARRAY['pricing', 'antipattern']::text[], 'AdCreative.ai식 "크레딧 절벽"(no-rollover)은 확인된 이탈 유발 안티패턴', 'B', NULL, '§3'),
  ('SP-003', ARRAY['pricing', 'antipattern']::text[], 'Triple Whale식 "GMV 구간별 가격 점프"는 확인된 이탈 유발 안티패턴', 'B', NULL, '§3'),
  ('SP-004', ARRAY['differentiation', 'evidence-grade']::text[], 'evidence_grade(A/B/C/D) 노출은 경쟁사 중 확인된 선례가 없는 유일한 방어 가능 차별화 지점', 'C', '자체 판단', '§0-4'),
  ('SP-005', ARRAY['reddit', 'api-risk']::text[], 'GummySearch는 Reddit 상업 라이선스 협상 실패로 셧다운(2025-11 신규가입 중단, 2026-12 데이터 삭제) — 단순 비용 문제가 아니라 협상 결렬이 원인', 'B', '창업자 자기보고 기반', '§0, §16'),
  ('SP-006', ARRAY['reddit', 'architecture']::text[], 'PainMap은 Reddit API 완전 독립 아키텍처(라이브 AI 웹서치)로 API 리스크를 원천 제거 — 5개 경쟁사 중 유일하게 완전 독립 확인', 'B', '교차검증 완료', '§16'),
  ('SP-007', ARRAY['channel', 'legal']::text[], 'G2·Capterra 이용약관은 스크래핑·자동수집을 명시적으로 금지(원문 직접 확인)', 'A', '원문 직접 확인', '§18-2'),
  ('SP-008', ARRAY['channel', 'legal']::text[], 'Product Hunt 공식 API는 상업적 이용 기본 금지, 비즈니스 문의 시 예외 가능', 'A', '공식 문서 직접 확인', '§18-2'),
  ('SP-009', ARRAY['channel', 'legal']::text[], 'Apple App Store Connect API는 본인 소유 앱만 조회 가능 — 경쟁사 리뷰 조회 자체가 API 설계상 불가능', 'A', '공식 문서 직접 확인', '§18-2'),
  ('SP-010', ARRAY['competitor', 'scantheg']::text[], 'ScanTheGap은 디지털 상품 전용(Buildability 필터로 실물 배제) — 솔루션아카이브와 인접시장이지 직접 경쟁 아님(초기 오판 정정됨)', 'B', NULL, '§15'),
  ('SP-011', ARRAY['legal', 'korea-crawling']::text[], '2026 저작권법 개정(8/11 시행)으로 고의 침해 시 최대 5배 징벌적 손해배상 가능, 네이버는 2026-02 크롤러 상대 DB침해 소송 승소', 'A', '법조문/판례', '§0-7'),
  ('SP-012', ARRAY['falsification-market', 'data-sourcing']::text[], '반증마켓 콜드스타트 후보 4개 소스(ICPSR/Maven/CB Insights/Failory) 전부 상업적 노출 라이선스 저촉 확인 — 자동 백필 대신 수동 큐레이션으로 전환', 'A', '약관 원문 확인, Failory는 확인 실패로 별도 표기', '§17-3'),
  ('SP-013', ARRAY['positioning', 'byo']::text[], 'BYO(사용자 직접 입력)를 "임시방편"이 아니라 "우리는 리뷰를 훔쳐 팔지 않는다"는 신뢰 기반 포지셔닝으로 전환 가능', 'C', '자체 제안, 미검증', '§18 wildcard'),
  ('SP-014', ARRAY['channel', 'legal']::text[], 'G2 robots.txt는 Googlebot·Bingbot의 리뷰 크롤링은 허용하되 GPTBot·ClaudeBot·Google-Extended·CCBot 등 AI 크롤러는 리뷰 경로에서 별도 차단 — "일반 검색 노출엔 동의, AI 재사용엔 비동의"라는 입장을 기술적으로 명시', 'A', 'robots.txt 직접 확인', '§21-A'),
  ('SP-015', ARRAY['channel', 'legal', 'korea']::text[], '한국법상 크롤링 리스크는 미국 판례뿐 아니라 데이터베이스제작자 권리(잡코리아 v 사람인)·부정경쟁방지법 카목(성과도용)·야놀자 v 여기어때(대법원, DB침해 무죄이나 접근제어 우회는 별도 유죄)까지 병존', 'A', '판례 직접 확인', '§21-A'),
  ('SP-016', ARRAY['channel', 'hacker-news']::text[], 'Hacker News(Firebase 공식 API)는 상업적 이용 금지 조항이 없는 것으로 확인된 사실상 유일한 완전 자유 채널', 'B', '약관 검토 기반, 확정 판례 아님', '§21-B'),
  ('SP-017', ARRAY['channel', 'aggregator', 'rejected']::text[], 'B2B 소셜데이터 애그리게이터(Octolens, SnitchFeed 등 월정액 구매형)는 §24 결정에 따라 폐기 — 구매형 데이터 조달 원칙 위배', 'C', '자체 판단', '§21-B, §24'),
  ('SP-018', ARRAY['infra', 'bug', 'robots-txt']::text[], '리뷰 수집 공용 robots.ts가 RFC 9309 와일드카드(Allow: /*.json$ 등)를 구현하지 않아 오탐 가능 — HN 어댑터 추가 중 발견, fix/robots-wildcard 브랜치로 수정 확정', 'A', '실측 확인', '§26-2'),
  ('SP-019', ARRAY['infra', 'legal', 'appstore']::text[], 'robots.ts 와일드카드 버그 수정 결과, appstore 어댑터가 Apple의 실제 robots.txt Disallow 규칙을 "규칙 없음=허용"으로 오판정해 위반 상태로 계속 수집해온 사실 확인 — 즉시 enabled=false로 중단 결정', 'A', 'robots.txt 실측 확인', '§27'),
  ('SP-020', ARRAY['channel', 'legal']::text[], 'Google Play 공개 페이지 스크래핑은 이용약관 3.3조에 "자동화된 수단으로 접근 금지 + robots.txt 준수 의무"가 원문으로 확인됨', 'A', '약관 원문 직접 확인', '§29'),
  ('SP-021', ARRAY['channel', 'legal', 'conflict']::text[], 'App Store RSS 피드에 대해 우호적인 개발자포럼 답변이 있으나, 실측된 robots.txt가 해당 경로를 명시적으로 Disallow — 라이브 robots.txt가 과거 포럼 답변보다 우선한다고 판단해 SP-019의 중단 결정 유지', 'A', 'robots.txt는 실측, 포럼 답변은 3자 정황', '§29'),
  ('SP-022', ARRAY['channel', 'rejected']::text[], '유료 데이터벤더(Appfigures Public Data API add-on, Sensor Tower/data.ai, Datarade)는 전부 "구매형 데이터 조달" 범주로 배제', 'B', '공식 문서 기반', '§29'),
  ('SP-023', ARRAY['competitor', 'market']::text[], 'G2가 Gartner로부터 Capterra·GetApp·Software Advice 인수를 2026-01-29 공식 발표(Q1 2026 종결 예정) — 향후 이 3사 약관이 G2 체계로 통합될 가능성, Tier 4 배제 목록 갱신 필요 시점 모니터링', 'B', '보도자료 기반', '§29')
ON CONFLICT (sp_id) DO UPDATE SET
  tags                = EXCLUDED.tags,
  statement           = EXCLUDED.statement,
  evidence_grade      = EXCLUDED.evidence_grade,
  evidence_grade_note = EXCLUDED.evidence_grade_note,
  source_ref          = EXCLUDED.source_ref,
  updated_at          = now();

-- ============================================================
-- 검증 (적용 직후 — 양성/음성 둘 다)
-- ============================================================
-- 양성 1) 23행이 들어갔는가
--   SELECT count(*) FROM public.strategy_principles;                     -- 기대: 23
--   SELECT sp_id, evidence_grade FROM public.strategy_principles ORDER BY sp_id LIMIT 3;
--     기대: SP-001|B , SP-002|B , SP-003|B
-- 양성 2) 태그 GIN 조회
--   SELECT sp_id FROM public.strategy_principles WHERE tags && ARRAY['legal'] ORDER BY sp_id;
--     기대: SP-007,008,009,011,014,015,019,020,021 등
-- 음성 1) 어휘 밖 등급 거절
--   INSERT INTO public.strategy_principles (sp_id, tags, statement, evidence_grade, source_ref)
--     VALUES ('SP-999', ARRAY['x'], 'x', 'Z', '§x');
--     기대: ERROR 23514 check constraint "strategy_principles_evidence_grade_check"
-- 음성 2) sp_id 형식 거절
--   INSERT INTO public.strategy_principles (sp_id, tags, statement, evidence_grade, source_ref)
--     VALUES ('SP-1', ARRAY['x'], 'x', 'A', '§x');
--     기대: ERROR 23514 check constraint "strategy_principles_sp_id_check"
-- 음성 3) 빈 태그 거절
--   INSERT INTO public.strategy_principles (sp_id, tags, statement, evidence_grade, source_ref)
--     VALUES ('SP-998', ARRAY[]::text[], 'x', 'A', '§x');
--     기대: ERROR 23514 check constraint "strategy_principles_tags_check"
-- 정리: DELETE FROM public.strategy_principles WHERE sp_id IN ('SP-999','SP-998','SP-1');
