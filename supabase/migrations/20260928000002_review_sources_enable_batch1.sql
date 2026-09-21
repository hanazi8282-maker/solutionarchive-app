-- 리뷰 소스 활성화 1차 — clien · theqoo · todayhumor
--
-- 남헌 2026-09-22 승인: "꺼져 있는 8곳을 2~3곳씩 켜서 실제로 리뷰가 들어오는지 확인하며 진행".
-- 1차는 소비재(탈모샴푸·유산균·이어폰) 글이 실제로 있는 커뮤니티 세 곳. 리스크는 각 소스의 disabled_reason
-- 에 이미 적혀 있고(clien SP-027 · theqoo 약관 조항 0건 · todayhumor 약관 페이지 없음=확인 불가) 남헌이
-- 09-22 지시로 켜기를 승인했다. 야놀자·티스토리는 남헌이 제외·보류 — 이 파일과 무관(등록된 적도 없다).
--
-- 🟢 비파괴. review_sources 3행 UPDATE. 롤백 파일 있음. 새 소스 추가 아님(§10.2 "신규 스크래핑 소스" 예외 아님).
-- disabled_reason 은 CHECK(enabled OR disabled_reason IS NOT NULL) 때문에 켤 때 NULL 로 지운다(20260910000003 과 같은 이유).
-- 원래 문구는 health_detail 에 요약해 남긴다 — "왜 꺼져 있었나"는 git 이력으로 본다.

UPDATE public.review_sources
   SET enabled = true, disabled_reason = NULL, disabled_at = NULL,
       health = 'ok', health_checked_at = now(),
       health_detail = '2026-09-22 남헌 승인 1차 활성화. 이전 사유: SP-027(robots 를 우리 UA 에 404 로 감춤 — 어댑터 parseProductRef 가 코드로 방어)'
 WHERE key = 'clien';

UPDATE public.review_sources
   SET enabled = true, disabled_reason = NULL, disabled_at = NULL,
       health = 'ok', health_checked_at = now(),
       health_detail = '2026-09-22 남헌 승인 1차 활성화. 이전 사유: robots 없음(404)·약관 6,315자 크롤 조항 0건·본문 전용(댓글은 POST+세션이라 계약 밖)'
 WHERE key = 'theqoo';

UPDATE public.review_sources
   SET enabled = true, disabled_reason = NULL, disabled_at = NULL,
       health = 'ok', health_checked_at = now(),
       health_detail = '2026-09-22 남헌 승인 1차 활성화. 이전 사유: robots 없음·이용약관 페이지 미발견(확인 불가). 베스트 글은 원본 table·no 로 등록해야 댓글이 잡힘'
 WHERE key = 'todayhumor';

-- 확인: select key, enabled, disabled_reason from review_sources where key in ('clien','theqoo','todayhumor'); → 전부 true / NULL
