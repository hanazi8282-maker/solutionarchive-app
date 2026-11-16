UPDATE public.review_sources
   SET disabled_reason = '약관 리스크 인지 후 남헌 승인으로 활성화 — SP-024 참조. 라이선스 변경 시 즉시 중단',
       disabled_at = NULL
 WHERE key = 'reddit' AND enabled = false;
