-- 롤백: 개정 표 전체 제거(원본 case_bank_labels 는 영향 없음). 개정 행이 쌓인 뒤에는 데이터 삭제이므로 사람 확인 후에만.
DROP TABLE IF EXISTS public.case_bank_label_revisions;
