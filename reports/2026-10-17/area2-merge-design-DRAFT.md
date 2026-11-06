# ② 영업 → design 합치기 초안 (v71ad §2, 적용 금지)

조건: `reports/2026-10-17/area2-daily-approvals.sql`(#559) [2] 의 verdict 가 `미달 → design 합치기 조건` 일 때만 쓴다. `확인 불가(기간 부족)` 는 미달이 아니다.

## 파일

- `area2-merge-design-DRAFT.sql` — [전 1] 영역별 숫자(프로젝트·입력·판정·승인·활성 타깃) → [A] 정방향(analysis_projects 영역 칸 5개, 기록 표 기반) → [B] 선택(라벨 '2:'→'3:', ③ 으로 합칠 때만) → [후 1] 같은 숫자 → [후 2] 음성.
- `area2-merge-design-DRAFT_rollback.sql` — 기록 표의 이전 값 복원.
- `supabase/migrations/` 밖에 둔 것은 일부러다. 쓰기로 하면 그날 번호의 마이그로 옮긴다.

## 합칠 영역 코드 — 사람 판단

지시서는 "design(③)" 이라고 적었다. DB 어휘에서 `design`(디자인 임시: Carat·Canva·MiriCanvas)과 `3`(③ 마케팅 직접 도구)은 **다른 코드**다. 초안은 글자 그대로 `design` 으로 두고, `_m2_into` 한 줄만 바꾸면 `3` 이 된다.

## 헌법·정본 문구와 부딪히는 곳 (목록만, 고치지 않았다)

1. `config/areas.json` `_areas`: "영역을 끄는 것(hold 로 옮기기)은 남헌 판단 — 코드는 이 파일을 쓰지 않는다." → 합치기는 남헌 조건부 지시(3일 판정)의 집행이라고 Notion 에 근거를 남겨야 한다. 이 파일의 `"2"` 를 `active:false` 로 바꾸는 것은 `scripts/areas-selftest.mjs` 기대값 5개(실 DB 하루 5슬롯·floor 줄 등)를 같이 고쳐야 해서 초안에 넣지 않았다. 안 바꾸면 ② 는 프로젝트 0개인 '결손 영역'으로 대시보드에 계속 뜬다(공급 부족 칸, T2 순서에 해는 없음).
2. `supabase/migrations/20261009000020_analysis_projects_area.sql` 영역 어휘 주석: `'design' 디자인(임시 — Carat·Canva·MiriCanvas)`. 영업 제품이 design 에 들어가면 그 정의와 어긋난다(③ 으로 합치면 ③ 정의 "마케팅(직접 도구만)" 과 어긋난다).
3. `lib/analysis/relevance-criteria.ts` 153행 판정 프롬프트: "영역 ①회의·통화 기록 ②영업 ③마케팅 ④인사 운영 ⑤리뷰 관리". 합쳐도 이 문구는 그대로 둬야 한다 — 기준 문구를 바꾸면 CLAUDE.md §10.1 T2 조건 2("기준 문구를 바꾸면 같은 하네스로 다시 잰다")에 걸려 자동 승인 재평가가 필요하다.
4. `lib/review/target-supply.ts` `areaOf` 는 라벨 접두 `^([1-5]):` 로 영역을 센다. design 으로 합치면 라벨은 '2:' 그대로라 공급 대시보드·창문 발굴·#554 순위식은 계속 ② 로 본다(프로젝트 영역 design ≠ 라벨 영역 2). ③ 으로 합치면 [B] 로 맞출 수 있다.
5. `data/case-area-map.json` `allowed_areas` 에 "2" 가 있다(CMO 루프 앵글 선정). 케이스 영역이라 이 초안과 직접 충돌하지는 않지만, ② 를 접으면 같이 볼 자리다.
6. `reports/2026-10-05/product-dictionary/area-03-sales-assistant.json` 와 `data/area-map-v26.json` 이 영업 slug 를 "2" 로 매핑한다. v37-1 소급을 다시 돌려도 `area_basis='manual'` 행은 안 건드리므로(정방향이 manual 로 쓴다) 되돌아가지는 않는다.

CLAUDE.md 본문에는 ② 를 직접 정의한 문구가 없다(grep 결과 0).
