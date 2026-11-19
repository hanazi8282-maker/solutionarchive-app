-- 쌍 찾기 층별 수정: sub_topic(자유 문장 snake_case, 17,998행에 고유값 15,845개)을 mechanism_norm 처럼 닫힌 목록 값으로 정리한다.
-- 원본 sub_topic 은 그대로 두고 새 칸 sub_topic_norm 에 추가 전용으로 쓴다. 채우는 것은 scripts/sub-topic-norm.mjs --classify(오케스트레이터 실행).
-- 20261118000006(mechanism_norm) 과 같은 모양. 다른 점 하나: 뷰 ss_episode_tags_current 를 다시 만들지 않는다.
--   e.* 뷰에 칸을 붙이면 롤백의 DROP COLUMN 이 뷰 의존성에 걸려 실패한다(그 뷰 위에 outcome_pairs_norm 등이 또 얹혀 있다).
--   새 칸을 읽는 곳(refresh_outcome_pairs_matched v2·스크립트)은 기본 표를 id·(source_key, slug, label_run) 로 직접 읽는다.
BEGIN;
ALTER TABLE public.ss_episode_tags ADD COLUMN IF NOT EXISTS sub_topic_norm text;
ALTER TABLE public.ss_episode_tags ADD COLUMN IF NOT EXISTS sub_topic_norm_run text;
CREATE INDEX IF NOT EXISTS ss_episode_tags_subnorm_idx ON public.ss_episode_tags (chapter, mechanism_norm, sub_topic_norm) WHERE sub_topic_norm IS NOT NULL;
COMMENT ON COLUMN public.ss_episode_tags.sub_topic_norm IS 'sub_topic 의 닫힌 목록 값(reports/2026-11-20-pair-finder/sub-topic-norm-list.json 의 key 또는 기타). scripts/sub-topic-norm.mjs 가 채운다. 원본 sub_topic 불변';
COMMIT;
-- 확인(양성): SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ss_episode_tags' AND column_name IN ('sub_topic_norm','sub_topic_norm_run');  → 2행
--            SELECT to_regclass('public.ss_episode_tags_subnorm_idx');  → NULL 아님
-- 음성:      SELECT count(*) FROM public.ss_episode_tags WHERE sub_topic_norm IS NOT NULL;  → 적용 직후 0 (기존 행을 건드리지 않았다)
