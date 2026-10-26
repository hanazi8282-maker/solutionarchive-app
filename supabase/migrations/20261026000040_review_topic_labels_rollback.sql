-- 롤백(삭제성 — 남헌 실행). 대신 prompt_version 으로 걸러 쓰지 않는 방식이 우선.
drop table if exists public.review_topic_labels;
