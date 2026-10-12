-- 롤백: 20261014000020_relevance_prompt_version.sql
-- prompt_version 기록만 사라진다. verdict·model·사람 채점·2차·자동 승인 표시는 그대로다.
-- 코드는 컬럼이 없으면 그 필드만 빼고 저장하므로 롤백 뒤에도 판정은 멈추지 않는다.
ALTER TABLE public.review_relevance_verdicts
  DROP COLUMN IF EXISTS prompt_version;
