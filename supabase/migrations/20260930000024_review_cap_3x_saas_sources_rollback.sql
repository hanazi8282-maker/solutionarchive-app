-- 롤백: 20260930000024_review_cap_3x_saas_sources — 적용 전 값(2026-09-28 실측)으로 되돌린다.
UPDATE public.review_sources SET daily_request_cap = v.old_cap
  FROM (VALUES
    ('hackernews', 200, 600), ('clien', 154, 462), ('bobaedream', 112, 336), ('82cook', 123, 369),
    ('okky', 100, 300), ('velog', 100, 300), ('damoang', 100, 300), ('theqoo', 100, 300),
    ('fmkorea', 100, 300), ('brunch', 50, 150)
  ) AS v(key, old_cap, new_cap)
 WHERE review_sources.key = v.key AND review_sources.daily_request_cap = v.new_cap;
