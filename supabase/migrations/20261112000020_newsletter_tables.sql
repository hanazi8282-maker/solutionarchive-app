-- 20261112000020_newsletter_tables — v71ci A6: 뉴스레터 수집 표 3개(전부 신규, add-only) + 발신자→라벨 매핑.
-- RLS 켬·정책 0 = service_role 전용, anon/authenticated 권한 회수. 롤백: 20261112000020_newsletter_tables_rollback.sql
--  newsletter_items          수신한 뉴스레터 1통 = 1행(발신자·제목·수신 시각·본문 요약·URL). content_hash 로 중복 방지.
--  newsletter_changes        같은 발신자의 연속 호에서 감지한 변화(신규/가격/기능/삭제) — 경쟁사 변화 추적의 재료.
--  newsletter_sender_labels  발신자(이메일 또는 도메인) → 라벨. 라벨은 Gmail 라벨 이름과 같은 문자열을 쓴다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.newsletter_sender_labels (
  sender     text PRIMARY KEY CHECK (sender = lower(sender)),   -- 이메일 주소 또는 도메인(소문자)
  label      text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.newsletter_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender       text NOT NULL CHECK (sender = lower(sender)),
  sender_label text,                                            -- 수신 시점에 매핑된 라벨(없으면 NULL = 미분류)
  subject      text NOT NULL,
  received_at  timestamptz NOT NULL,
  url          text,
  summary      text,
  content_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash)
);
CREATE INDEX IF NOT EXISTS idx_newsletter_items_sender ON public.newsletter_items (sender, received_at DESC);

CREATE TABLE IF NOT EXISTS public.newsletter_changes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id    bigint NOT NULL REFERENCES public.newsletter_items(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('new','price','feature','removed')),
  before     jsonb,
  after      jsonb,
  noticed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_newsletter_changes_item ON public.newsletter_changes (item_id);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['newsletter_sender_labels','newsletter_items','newsletter_changes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
COMMIT;
-- 확인(양성): 3표 relrowsecurity=true / 음성: has_table_privilege('anon','public.newsletter_items','SELECT') = false
-- 발신자→라벨 매핑 행은 비워 둔다: 어떤 발신자가 어느 라벨인지는 받은편지함 실측이 필요하고 추측으로 채우지 않는다(§7.1).
