# S7·S9 발굴 구현 (feat/s7-s9-discovery) — 마이그 미적용·머지 안 함

## 변경
**S7 제품 발굴 (언급 + 스토어 순위)**
- `lib/discovery/product-discover-shared.mjs` — 일반 명사·인프라 이름 사전(`GENERIC`, table·data·production·S3·OpenAI 등 ~330어) + `isGenericName`·`looksLikeProductName`(소문자 평범한 단어로만 쓰인 이름 제외), 집계, 스토어 이름 일치, 분야 판정, 하루 상한(분야당 10·전체 30), 80% 탈락 중단, 후보 등록.
- `scripts/product-discover-v2.mjs` — `--mode=mention|chart|all [--dry] [--force-chart]`.
  - mention: 최근 14일 `analysis_inputs` → 기존 `extractMentions`(전환·대안 문맥만) → 일반어 거름 → 서로 다른 글 ≥3 → iTunes 검색 시험(이름 머리 일치·평가 50+·분야 판정) → `discovery_candidates(origin='mention', accepted)` + 임시 타깃(kr·us, `prov_YYYYMMDD`). 시험을 HN 이 아니라 앱스토어 검색으로. 기존 unverified 행은 안 덮고 INSERT 만. 검색 요청 40회/일.
  - chart: 월요일(UTC)만. 기존 `appstore-chart-dictionary.collect` 로 kr·us·jp 상위 100 → 응답 없으면 건너뛰고 `stopped` 에 기록 → lookup 으로 장르(Business/Productivity/Finance)·평가 50+ → 분야 판정·일반어 거름 → `origin='chart'` 등록.
  - 통로마다 `discovery_run_log` 에 후보 수·연결 수(프로젝트+타깃 등록)·일반어 제외 수·요청 수·중단 사유 기록.
- `.github/workflows/product-discover-v2.yml` — 스케줄은 리포 변수 `PRODUCT_DISCOVER_V2_ENABLED=true` 일 때만(기본 OFF), `workflow_dispatch` 상시. 기존 검색 통로(product-discover.yml)와 concurrency 공유.

**S9 새 커뮤니티 발굴 (지문)**
- `scripts/source-discover.mjs` — 등록 제품 도메인 × 접두(community/forum/discuss/forums) + `--hosts=` 수동 씨앗 → 호스트당 robots → 첫 화면(지문: Discourse·XenForo·phpBB·그누보드·XE/라이믹스·inSided/Khoros) → (Discourse) latest.json 글 ≥10 → 약관 1장, 요청 ≤5·4초 간격·하루 10곳. 403 호스트 중단(blocked 기록), 429 전체 중단. `source_candidates` 에 upsert(ignoreDuplicates)로 추가만, robots 발췌·AI 신호·약관 주소·발췌·`legal_label`(forbids_automation/unverified/allowed) 필수. **켜지 않음**(onboarded_source_key·onboard_batch NULL, review_* 쓰기 0).
- `.github/workflows/source-discover.yml` — 변수 `COMMUNITY_FINGERPRINT_ENABLED=true` 일 때만 스케줄(기본 OFF), `workflow_dispatch`(hosts·dry 입력).

**마이그 (파일만, 미적용)** `20261120000001_discovery_v2_log.sql` + `_rollback.sql`
- `discovery_run_log`, `source_probe_log`, 뷰 `v_discovery_link_daily`(RLS 잠금).
- `discovery_candidates_mention_accept_check` 를 OR 로 넓힘: 스토어 시험 통과(appstore/googleplay·probe_ref·hits≥50) + 글 3건·근거 3건이면 area_code 없이 채택 가능. 옛 조건은 HN 시절 것. **이 완화는 판단 건 — 아래 "미확인" 참고.**

## 셀프테스트 (네트워크·DB 0)
- `node scripts/product-discover-v2-selftest.mjs` — 42 pass (table·production·openai·s3·data 후보 0건, 429 중단, 80% 탈락 중단, 상한).
- `node scripts/source-discover-selftest.mjs` — 25 pass (지문 7종, 라벨 규칙, robots 금지 시 첫 화면 요청 0, 403/429, 요청 ≤5).
- `node scripts/cron-watchdog-selftest.mjs` — PASS 93.

## 오케스트레이터 실행 순서
1. PR CI 확인 → 머지(사람/§10.2 판단).
2. 마이그 `20261120000001_discovery_v2_log.sql` 적용(`solutionarchive` 확인, 적용 전 `information_schema` 로 표 부재 확인). 롤백 파일 있음.
3. S7 드라이런: `node --env-file=.env.local scripts/product-discover-v2.mjs --mode=mention --dry` (DB 읽기만·검색 요청 최대 40회, 3.5초 간격) → 후보·탈락 로그에서 일반어 없는지 확인.
4. S7 수동 1회: `node --env-file=.env.local scripts/product-discover-v2.mjs --mode=all --force-chart` → 끝에 확인:
   ```sql
   select day, channel, candidates, linked, rejected_generic, requests from v_discovery_link_daily order by 1 desc;
   select origin, probe_source_key, count(*), count(project_id) as linked from discovery_candidates where created_at>'2026-11-19' group by 1,2;
   select count(*) from discovery_candidates where created_at>'2026-11-19' and origin='mention' and lower(name) in ('table','data','production','s3');  -- 0
   ```
5. S9 수동 1회: `node --env-file=.env.local scripts/source-discover.mjs --dry` 로 호스트 목록 확인 후 `node --env-file=.env.local scripts/source-discover.mjs` (하루 10곳). 확인:
   ```sql
   select legal_label, tech_feasible, count(*), count(onboarded_source_key) from source_candidates group by 1,2;
   select outcome, count(*) from source_probe_log group by 1;
   ```
6. 매일 자동화: 리포 변수 `PRODUCT_DISCOVER_V2_ENABLED=true`, `COMMUNITY_FINGERPRINT_ENABLED=true` 설정(기본 OFF).

## 미확인
- 실네트워크·DB 실행은 안 했다(셀프테스트만). iTunes 검색 이름 일치율·차트 피드 응답은 첫 실행에서 확인.
- mention 후보가 `discovery_candidates_mention_accept_check`(옛 조건) 때문에 마이그 전에는 INSERT 실패한다 → 마이그 적용 먼저(순서 2).
- 채택 조건 완화(area_fit 대신 스토어 시험)는 판단 건 — 불가하면 area_code 를 코드로 채우는 방식으로 바꿔야 함.
- HN 통로 하루 5개 축소(S7-5)·깃허브 주제 검색(S7-4)·Haiku 이름 확인은 이번에 안 함(HN 통로 코드가 이 리포 경로에서 확인되지 않음, 일반어 사전·스토어 이름 일치로 대체).
- S9: 제품 도메인에서 접두 추측 방식이라 한국 게시판(그누보드·XE)은 `--hosts=` 수동 씨앗이 있어야 잡힌다. 한국 호스트는 robots·약관 라벨만 달고 어댑터 없음(tech_feasible NULL).
- 이름 사전(`GENERIC`)은 영어 위주 — 한국어 일반어 보강 필요할 수 있음.
