-- 리뷰 소스 활성화 2차 — fmkorea · brunch · tumblbug
--
-- 1차(20260928000002: clien·theqoo·todayhumor)가 수동 실행으로 신규 724건을 실제로 가져온 것을 확인한 뒤 켠다
-- (남헌 09-22 지시: 2~3곳씩 켜서 들어오는지 확인하며 진행). 리스크는 남헌이 이미 인지·승인한 것들이다:
-- fmkorea SP-028(/best·/best2·/humor 만, 댓글은 마지막 페이지만) · brunch(본문 5,000자 절단, Crawl-delay 5 는 min_interval 로 준수)
-- · tumblbug SP-031("자동화된 수단" 약관 조항 인지 후 승인, 창작자 후기 프리뷰 최대 4건).
-- 🟢 비파괴. review_sources 3행 UPDATE. 롤백 파일 있음.

UPDATE public.review_sources SET enabled=true, disabled_reason=NULL, disabled_at=NULL, health='ok', health_checked_at=now(),
  health_detail='2026-09-22 남헌 승인 2차 활성화. 이전 사유: SP-028 — /best·/best2·/humor 범위만, 댓글은 마지막 페이지만(알려진 한계)'
 WHERE key='fmkorea';
UPDATE public.review_sources SET enabled=true, disabled_reason=NULL, disabled_at=NULL, health='ok', health_checked_at=now(),
  health_detail='2026-09-22 남헌 승인 2차 활성화. 이전 사유: 본문만(댓글 API robots 금지), 5,000자 절단, min_interval 5000 = Crawl-delay 5 준수'
 WHERE key='brunch';
UPDATE public.review_sources SET enabled=true, disabled_reason=NULL, disabled_at=NULL, health='ok', health_checked_at=now(),
  health_detail='2026-09-22 남헌 승인 2차 활성화. 이전 사유: SP-031 — 약관 "자동화된 수단" 조항 인지 후 승인, 창작자 후기 프리뷰(창작자당 최대 4건)'
 WHERE key='tumblbug';
