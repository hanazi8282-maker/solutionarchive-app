-- 롤백: 20260928000002_review_sources_enable_batch1.sql — 세 소스를 다시 끈다. 타깃·수집분은 남는다.
UPDATE public.review_sources SET enabled=false, disabled_at=now(),
  disabled_reason='리스크 인지 후 진행 승인(SP-027). robots를 우리 UA에게 404로 감춘다 — 러너가 규칙을 못 보므로 어댑터의 parseProductRef가 코드로 방어한다. 사람이 켤 때까지 꺼둠'
 WHERE key='clien';
UPDATE public.review_sources SET enabled=false, disabled_at=now(),
  disabled_reason='robots.txt 없음(실측 404) + 이용약관 전문 6,315자 확인, 크롤링·봇·AI·재가공 조항 0건. 셀렉터 실측 완료(본문 전용 — 댓글은 AJAX, POST+세션쿠키 필요해 러너 계약으로 표현 불가). 사람이 켠다'
 WHERE key='theqoo';
UPDATE public.review_sources SET enabled=false, disabled_at=now(),
  disabled_reason='robots.txt 없음(양 오리진 실측 404). 이용약관 페이지를 찾지 못했다 — 확인 불가이지 허용이 아니다. 댓글까지 수집(1글=2요청). 베스트/베오베 글은 URL의 table·no가 가짜 별칭이라 원본 부모키로 불러야 함(별칭이면 조용히 0건). 사람이 판단한 뒤 켠다'
 WHERE key='todayhumor';
