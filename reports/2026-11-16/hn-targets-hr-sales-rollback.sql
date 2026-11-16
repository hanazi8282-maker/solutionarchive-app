-- v71cp 2026-11-16: HN q: 타깃 16개 등재(영역 ④ 인사 8 · ② 영업 8, 기존 프로젝트에 연결, INSERT 전용) 롤백.
-- 수집된 analysis_inputs·지문은 지우지 않는다(데이터 삭제 없음) — 타깃 행만 뺀다.
DELETE FROM public.review_targets WHERE id IN (
 'd46f656b-6138-4a05-b03f-1ff6354d4e57','5d8a8d7f-6628-49b5-8e17-ff8fd9afd89f','e9e9224c-66b9-4fb4-a8fa-42faee1532e3','8388d6f6-0d2c-4094-b18c-9f58ab0f1e20',
 '47d7cae3-adcb-404a-a1b7-1983ed68672a','f7f19ead-2ba3-4fb6-a283-14e61e95449a','2a7fe1f8-0ffa-47c9-b514-6e1c5defa5a5','6b78dceb-ff1e-439d-b573-a0656e6a5112',
 '3657285f-c534-475c-9a05-f137ab0e0039','d566bc31-17ad-48d8-85ef-872be103a08b','1fb487cf-e148-4991-833b-0fc7f8ea0bbc','7ba20239-b2cb-4318-ab9d-b3461c85bf3d',
 '4e4a55f4-5dea-4983-906b-d95b8d355538','74918af9-57d7-4373-8895-76a5fceaeb0e','ebd77979-da05-443c-ad16-939f1063c173','78f3cf1b-2ebd-4917-83d2-e5d14e5d7149')
 AND source_key='hackernews' AND total_collected = 0;
