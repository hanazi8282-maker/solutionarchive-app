-- v71eg B2-②: 사례 라벨의 신호(S-code) 한 줄 = 한 행. 사전 v0.6 정본(c12v06, config_hash 9e6fe1c2d96c6a08)으로 라벨한 결과를 담는다.
-- 추가 전용 새 테이블 1개. 기존 표(ss_story_labels·ss_episode_tags 등)는 건드리지 않는다. 다시 라벨하면 config_hash 가 다른 줄이 더해진다.
-- 접근: service_role 전용(RLS 켜고 anon·authenticated 권한 제거). 원문 전문은 넣지 않는다(evidence 는 근거 문장 일부).
-- 남헌 허가: v71eg 지시 전송으로 이 테이블 1개의 생성과 쓰기(2026-11-24).
BEGIN;
CREATE TABLE IF NOT EXISTS public.case_signal_labels_v06 (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_slug    text NOT NULL,
  episode_id    uuid,                                   -- ss_episode_tags.id (이야기 단위 라벨이면 NULL)
  signal_code   text NOT NULL CHECK (signal_code ~ '^S[0-9]{2}$'),
  evidence      text NOT NULL CHECK (length(btrim(evidence)) > 0),   -- R-E: 근거가 빈 신호는 넣지 않는다
  dict_version  text NOT NULL,                          -- 예: v0.6
  labeled_at    timestamptz NOT NULL DEFAULT now(),
  config_hash   text NOT NULL,                          -- 예: 9e6fe1c2d96c6a08
  source_key    text NOT NULL DEFAULT 'starterstory',
  label_model   text,                                   -- 최종 라벨을 낸 방식(예: haiku-x3-majority, sonnet-escalated)
  UNIQUE (story_slug, episode_id, signal_code, config_hash)
);
CREATE INDEX IF NOT EXISTS case_signal_labels_v06_slug_idx ON public.case_signal_labels_v06 (story_slug);
CREATE INDEX IF NOT EXISTS case_signal_labels_v06_code_idx ON public.case_signal_labels_v06 (signal_code);
ALTER TABLE public.case_signal_labels_v06 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_signal_labels_v06 FROM anon, authenticated;
COMMIT;
-- 확인: select count(*) from information_schema.tables where table_name='case_signal_labels_v06';  (1)
