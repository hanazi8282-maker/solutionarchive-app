-- 롤백: 20260928000004 — okky · velog 를 다시 끈다(원 사유 요약으로 복원).
UPDATE public.review_sources SET enabled=false, disabled_at=now(), disabled_reason='본문·댓글 수집 가능(robots /articles 허용, 약관 조항 0건). 사람이 켤 때까지 꺼둠 — 상세는 git 이력 20260922000001' WHERE key='okky';
UPDATE public.review_sources SET enabled=false, disabled_at=now(), disabled_reason='본문 전용(댓글은 GraphQL 계약 밖, 마커 불화해). 약관 4,193자 조항 0건. 사람이 켤 때까지 꺼둠 — 상세는 git 이력 20260922000001' WHERE key='velog';
