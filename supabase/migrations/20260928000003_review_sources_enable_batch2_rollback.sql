-- 롤백: 20260928000003 — 세 소스를 다시 끈다. 타깃·수집분은 남는다.
UPDATE public.review_sources SET enabled=false, disabled_at=now(), disabled_reason='리스크 인지 후 진행 승인(SP-028). /best·/best2·/humor 범위만 수집. 댓글은 마지막 페이지만 온다(알려진 한계). 사람이 켤 때까지 꺼둠' WHERE key='fmkorea';
UPDATE public.review_sources SET enabled=false, disabled_at=now(), disabled_reason='실물 셀렉터·robots 실측 완료. 본문만 수집 — 댓글 API는 robots 금지(/api/). 본문은 5,000자에서 잘린다. min_interval 5000은 robots의 Crawl-delay: 5를 지키는 유일한 장치다. 사람이 켤 때까지 꺼둠' WHERE key='brunch';
UPDATE public.review_sources SET enabled=false, disabled_at=now(), disabled_reason='셀렉터 실측 완료(2026-09-17). 후원자 코멘트·프로젝트 설명은 정적 HTML에 없어 창작자 후기 프리뷰(창작자당 최대 4건)로 축을 바꿈. 이용약관 "자동화된 수단" 조항을 남헌이 인지 후 진행 승인 — SP-031 참조. 사람이 켤 때까지 꺼둠' WHERE key='tumblbug';
