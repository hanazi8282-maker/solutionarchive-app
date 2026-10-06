-- ============================================================
-- 20261007000003_review_sources_kakao_enable — 카카오(다음) 블로그·카페 검색 2행 켜기 (남헌 v27 소유자 예외)
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1). 적용은 남헌(§10.2 예외 4번 — 새 법적 리스크).
-- 선행: 20261006000003_review_sources_kakao(2행 INSERT, enabled=false). 없으면 0행 UPDATE 로 끝난다 — 아래 양성 쿼리로 확인한다.
--
-- 근거: 남헌 결정 v27(2026-10-06) — 약관 충돌을 **알고** 소유자 예외로 켠다.
--   충돌 조항(Kakao Developers 운영정책 developers.kakao.com/terms/ko/site-policies, 시행 2026-04-20,
--   2026-10-07 원문 재확인 — 제5조(금지된 행동)):
--     20호 "앱에서 사용자 환경을 개선하기 위한 목적 외 다른 목적으로 카카오에서 받은 데이터를 캐시하거나
--          캐시 후 최신 데이터로 유지하지 않는 행위"
--     30호 "서비스 및 개발자센터를 이용하여 얻은 정보(예: 데이터, 비밀 키, 엑세스 토큰 등 포함)를 카카오의
--          사전 승낙 없이, 복사, 복제, 변경, 번역, 출판, 방송, 검색 엔진 또는 디렉터리에 입력 기타의 방법으로
--          사용하거나 이를 타인에게 제공하는 행위"
--   해석: 검색 결과를 분석용으로 적재하는 것 **자체**가 20호(다른 목적 캐시)·30호(사전 승낙 없는 복제·사용)에 걸린다.
--         짧게 인용하든 안 하든 저장 단계에서 이미 충돌이다. 상세·되돌림은 docs/review-collection-design.md §1.3.
--
-- 값 선택:
--   tos_status='prohibited' — 허용값(permitted/silent/prohibited/unverified/forbids_automation, 20261005000003) 중
--     "콘텐츠 이용 금지"가 정확하다. 공식 키 API 라 자동 접근 자체는 허용(forbids_automation 아님), 원문을 확인했으니 unverified 도 아님.
--     코드는 tos_status 를 읽지 않는다(2026-10-07 grep: lib·scripts·app 에 사용처 0) — 기록용 컬럼이라 하위 호환 영향 없음.
--   quote_allowed=false — 'prohibited' 면 DB CHECK review_sources_tos_prohibited_no_quote(20261005000001)가 강제한다.
--     deprecated 컬럼이라 코드는 안 읽는다(quote_policy 만 읽음). 빼면 이 UPDATE 가 23514 로 실패한다.
--   quote_policy='short_only' — CHECK review_sources_tos_restricts_quote_policy(prohibited ⇒ full 불가) 통과.
--   override='owner_2026-10-06' — 소유자 예외 표식. robots_status='not_applicable' 이라 러너의 robots 예외
--     (lib/review/runner.ts isOwnerRobotsOverride — disallowed 일 때만)는 이 행에 작동하지 않는다. 기록용이다.
--
-- 우회 없음: UA 는 러너 고정값(헤더 합쳐도 User-Agent 덮지 않음, scripts/review-collect.mjs), 쿠키·프록시·IP 회전·캡차 풀이 없음.
-- 타깃(q:<검색어>)은 이 파일에 없다 — 켜도 타깃 0 = 요청 0. 상한 그대로(1000ms · 200/일).
--
-- 🟡 비파괴 UPDATE 2행(대량 아님). DDL·DELETE 없음. 롤백 파일 있음. 되돌림 = 소스 비활성화(롤백 파일).
-- ============================================================

BEGIN;

UPDATE public.review_sources
   SET enabled = true,
       disabled_reason = NULL,
       override = 'owner_2026-10-06',
       quote_policy = 'short_only',
       tos_status = 'prohibited',
       quote_allowed = false
 WHERE key IN ('kakao_blog', 'kakao_cafe')
   AND enabled = false;
-- 기대: UPDATE 2

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: SELECT key, enabled, disabled_reason, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed,
--              min_interval_ms, daily_request_cap
--         FROM public.review_sources WHERE key IN ('kakao_blog', 'kakao_cafe') ORDER BY key;
--   기대 2행: true · NULL · not_applicable · prohibited · owner_2026-10-06 · short_only · false · true · 1000 · 200
--   (0행이면 선행 20261006000003 미적용 — 이 파일은 아무것도 안 바꾼 것이다. "성공"으로 보고하지 않는다.)
-- 음성(롤백 형태): 약관 금지 소스를 full 로 못 올린다
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'kakao_blog'; ROLLBACK;     -- 기대: 23514 review_sources_tos_restricts_quote_policy
--   BEGIN; UPDATE public.review_sources SET quote_allowed = true WHERE key = 'kakao_cafe'; ROLLBACK;       -- 기대: 23514 review_sources_tos_prohibited_no_quote
-- 음성: 다른 소스는 안 바뀌었다
--   SELECT count(*) FROM public.review_sources WHERE override = 'owner_2026-10-06' AND key NOT IN ('kakao_blog','kakao_cafe','googleplay');  -- 기대: 0
-- 음성: 타깃 0(이 파일은 타깃을 만들지 않는다)
--   SELECT count(*) FROM public.review_targets WHERE source_key IN ('kakao_blog', 'kakao_cafe');  -- 기대: 0
