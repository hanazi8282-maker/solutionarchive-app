# S14 회사 추천표 — 기준 완화 + 근거 얇음 (구현 메모, 2026-11-20)

## 기준
- 원래 S14 기준(cc-instruction-2026-11-19-v71cu-collection-v2.md §S14): 한국 스토어 리뷰(한국어) 100건+, 1~2점 30건+(S14.md 는 "한국어 100건+, 1~2점 30건+"로 해석, Hootsuite 만 통과). 연락 메일 실존 확인도 원 조건(미실행).
  상수 `LEGACY_CRITERIA`(koMin 100, koLowMin 30)로 보존.
- 새 기준(남헌 결정): 전체 1~2점 150건+ AND 한국어 50건+. 기본 동작. `NEW_CRITERIA`, env `COMPANY_MIN_LOW_TOTAL`·`COMPANY_MIN_KO` 로 조정.
- 가정: "한국어 50+" 는 한국어 글 수(전체 한국어)로 읽었다. 한국어 1~2점으로 뜻했다면 `COMPANY_MIN_KO` 가 아니라 코드 수정 필요 — 확인 요청.
- 기준 미달은 행을 만들지 않는다.

## 해석 결정(2026-11-20 후속): 기본 OR, AND 는 선택
- 오케스트레이터 실측(DB, 4분야 112개): AND 는 1곳(Hootsuite), 전체 1~2점 ≥150 단독 12곳, 한국어 ≥50 단독 6곳(겹침 1) → OR 약 17곳.
- 남헌 취지("기준을 낮추고 근거 얇은 곳은 표시해 건너뛴다")에 맞게 표는 OR 로 넓히고 얇은 곳은 thin_evidence 로 거른다. `mode:'or'` 기본, `COMPANY_CRITERIA_MODE=and` 로 AND.
- 17곳 중 얇음이 빠지면 충분한 곳은 17보다 적다. 목표 20곳 대비는 스크립트 요약 한 줄이 "데이터 한계"로 표시(억지로 채우지 않음).
- 원래 S14 표는 DB 가 아니라 보고서 마크다운(reports/2026-11-19-v71cu/S14.md)이었다.

## 근거 얇음(thin_evidence) 규칙 — `lib/consult/company-table.ts` thinReasons (임계값은 THIN_RULE 한 곳, 초안값)
- 한국어 1~2점 < 10 이면서 전체 1~2점 < 150 → 얇음
- 한국어 글 ≥ 50 인데 전체 1~2점 < 20 → 얇음 (`ko_only_low<20`; Judge.me ko1626·low3, Loox ko1347·low1 같은 경우)
- 1~2점이 20건 이상이면서 한쪽 점수(1점 또는 2점)가 90% 초과 → 얇음 (`score_skew>90%`)
- 이름 칸이 `candidate:` 코드인 행은 `name_needs_fix` 로 표시(회사명을 사람이 고친다).

## 파일
- 마이그: `supabase/migrations/20261120000001_company_candidates_thin_evidence.sql` (+`_rollback.sql`) — 미적용. repo 에서 company_candidates 표를 찾지 못해 CREATE IF NOT EXISTS + 칸 추가(ADD COLUMN IF NOT EXISTS)로 작성.
- 집계 SQL: `scripts/sql/company-candidates.sql` (SELECT 전용). 이름 칸은 analysis_projects 에 name 이 없어 competitor_url.
- 계산·표·UPSERT SQL 출력: `scripts/company-candidates.mjs`(DB 접근 없음).
- 건너뛰기: `scripts/generate-report.mjs` — 환경변수 `COMPANY_THIN_SKIP_ENABLED=true`(기본 OFF)일 때만 company_candidates.thin_evidence 를 조회, true 면 exit 6 으로 건너뜀. `--force` 로 우회. 표·칸이 없거나 조회 실패면 경고만 하고 기존 경로.
- 셀프테스트: `node scripts/company-table-selftest.mjs`(CI build-check 에 추가).

## 오케스트레이터 실행 순서 (DB 는 오케스트레이터만)
1. PR 머지 후 마이그 적용(§10.2 절차, 추가 전용).
2. `scripts/sql/company-candidates.sql` 을 execute_sql 로 실행 → 결과를 `rows.json` 으로 저장.
3. 확인: `node scripts/company-candidates.mjs rows.json` (--dry 와 동일, 표만 출력). 새 기준 후보 수·얇음 수 확인. 원 기준과 비교는 `--legacy`.
4. 적재 SQL 생성: `node scripts/company-candidates.mjs rows.json --sql` 의 INSERT 줄을 실행(UPSERT). 20곳이 안 되면 억지로 채우지 않는다.
5. 결론서 세션 환경에 `COMPANY_THIN_SKIP_ENABLED=true` 를 켠다. 얇음 회사는 exit 6 으로 건너뜀.
6. 연락 메일 확인(원 조건)은 별도 — contact_email 칸에 공개 연락처만 기록.
