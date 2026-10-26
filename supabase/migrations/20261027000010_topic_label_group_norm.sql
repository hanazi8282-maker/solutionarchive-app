-- v71bj §5: 라벨 대분류 정규화 열(추가 전용). 원본 category_group 은 그대로 둔다. 값은 scripts/topic-group-norm.mjs --apply 가 NULL 칸에만 채운다.
alter table public.review_topic_labels add column if not exists category_group_norm text;
create index if not exists review_topic_labels_group_norm_idx on public.review_topic_labels (category_group_norm);
comment on column public.review_topic_labels.category_group_norm is '정규화된 대분류(config/topic-group-norm.json 사전 + 제품별 다수결). 원본은 category_group.';
