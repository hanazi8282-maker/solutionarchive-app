-- 리뷰 소스 활성화 3차 — okky · velog
--
-- 1차(724건)·2차(330건) 수동 실행으로 수집이 실제로 들어오는 것을 확인한 뒤 남은 둘을 켠다(남헌 09-22 승인, 8곳 순차).
-- ⚠️ 두 곳은 개발자 커뮤니티라 지금 활성 프로젝트(전부 실물 소비재)와 겹치는 글이 없다. 타깃 0 으로 켜 두며,
--    SaaS·개발자 대상 프로젝트가 생기면 그때 글 주소를 등록한다. 켜 두는 이유: 타깃 등록 경로(/api/analyze/targets)가
--    enabled 소스에만 열리므로, 꺼져 있으면 등록 자체가 막힌다.
-- 🟢 비파괴. review_sources 2행 UPDATE. 롤백 파일 있음.

UPDATE public.review_sources SET enabled=true, disabled_reason=NULL, disabled_at=NULL, health='ok', health_checked_at=now(),
  health_detail='2026-09-22 남헌 승인 3차 활성화. 타깃 0 — SaaS 프로젝트 생기면 /articles/<번호> 등록. 이전 사유: robots /articles 허용·/api 금지, 약관 조항 0건, 댓글 평탄화 대조 필수'
 WHERE key='okky';
UPDATE public.review_sources SET enabled=true, disabled_reason=NULL, disabled_at=NULL, health='ok', health_checked_at=now(),
  health_detail='2026-09-22 남헌 승인 3차 활성화. 타깃 0 — SaaS 프로젝트 생기면 /@handle/slug 등록. 이전 사유: 본문 전용(대댓글 GraphQL 계약 밖), 약관 4,193자 조항 0건, released_at UTC→KST'
 WHERE key='velog';
