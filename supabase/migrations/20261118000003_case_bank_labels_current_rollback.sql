-- 롤백: 뷰만 제거(데이터 없음). 읽는 쪽 코드를 case_bank_labels 로 되돌린 뒤에 실행.
DROP VIEW IF EXISTS public.case_bank_labels_current;
