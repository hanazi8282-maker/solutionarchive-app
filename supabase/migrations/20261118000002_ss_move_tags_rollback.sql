-- 롤백: 장별 꼬리표 표 제거(원본 ss_moves 는 영향 없음). 행이 쌓인 뒤에는 데이터 삭제이므로 사람 확인 후에만.
DROP TABLE IF EXISTS public.ss_move_tags;
