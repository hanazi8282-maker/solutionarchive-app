-- 롤백(삭제성 — 남헌 실행). 대신 이 열을 쓰지 않으면 된다.
alter table public.review_topic_labels drop column if exists category_group_norm;
