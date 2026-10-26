-- v71bi: 영역 밖 재고 글 단위 영역·제품종류 라벨 (추가 전용). 영역 판정이 아니라 다음 영역 후보 탐색용.
create table if not exists public.review_topic_labels (
  id bigint generated always as identity primary key,
  input_id uuid not null,
  project_id uuid,
  area_guess text not null check (area_guess in
    ('1','2','3','4','5','work','design','hold-ecom','out-consumer','other')),
  category_group text,
  category_label text,
  product_name text,
  is_saas boolean,
  reason_quality text check (reason_quality in ('reason','weak','none')),
  lang text,
  confidence numeric(3,2),
  model text,
  prompt_version text not null,
  batch_id text,
  judged_at timestamptz not null default now(),
  unique (input_id, prompt_version)
);
create index if not exists review_topic_labels_input_idx on public.review_topic_labels (input_id);
create index if not exists review_topic_labels_group_idx on public.review_topic_labels (category_group);
alter table public.review_topic_labels enable row level security;
comment on table public.review_topic_labels is '영역 밖 재고 글 단위 영역·제품종류 라벨(v71bi, 추가 전용). 영역 판정이 아니라 다음 영역 후보 탐색용. 정책 0개 = service_role 전용.';
