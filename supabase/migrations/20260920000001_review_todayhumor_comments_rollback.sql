-- 롤백: todayhumor 댓글 수집 반영 철회
-- ⛔ Claude 가 실행하지 않는다. 사람이 supabase db query --linked -f 로 적용한다.
--
-- 이 마이그레이션은 표시명과 주석만 바꾼다. 데이터를 옮기지 않으므로 롤백도
-- 문구를 되돌리는 것뿐이다. **어댑터 코드를 되돌리는 게 본체다** — 그쪽을
-- 되돌리지 않은 채 이 파일만 돌리면 주석이 거짓이 된다(그게 애초의 문제였다).
--
-- 수집을 급히 멈춰야 하면 이 파일이 아니라 kill-switch 를 써라:
--   update public.review_sources set enabled = false where key = 'todayhumor';

UPDATE public.review_sources
   SET display_name = '오늘의유머 게시글'
 WHERE key = 'todayhumor';

-- product_ref 컬럼 주석은 되돌리지 않는다. 주석은 동작에 영향이 없고,
-- 20260919000001 의 문구로 되돌리면 "todayhumor 는 댓글 0건이 정상"이라는
-- 잘못된 안내가 되살아난다. 되돌릴 일이 있으면 그 파일을 직접 다시 돌려라.
