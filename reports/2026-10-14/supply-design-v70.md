# v70 새 소스 자동 공급 — 현재 구현과 제안 설계 (Fable 검수 대상)

작성: cowork-4a(CEO-STAFF) 2026-10-14. 정본 지시서 v70 개정 2 (§1 정책, §3 표본, §4 파이프라인, §7 검수 관점 12개, §9 무인 운영).
검수 요청: 아래 "A. 이미 구현·가동", "B. 제안(미구현)" 을 v70 §7 의 12개 관점으로 검토하고 표 `지적 / 근거 / 권고 수정 / 심각도(높음·중간·낮음)` 로 낸다. 코드는 읽기 전용으로 확인해도 된다.

## A. 이미 구현·가동 (PR #514~#518, 2026-10-14)

### A-1 소스 라벨(스키마 신설 없음 — 기존 `review_sources` 컬럼 재사용)
- v70 `legal_status` ↔ `tos_status`(permitted/silent/prohibited/unverified/forbids_automation) 로 매핑: clear = permitted·silent, tos_risk = prohibited·forbids_automation, unknown = unverified.
- `robots_status`(allowed/disallowed/unverified/not_applicable) = v70 `robots_disallowed`. `robots_ai_signal`·`access_status`·`relevance_sample` 컬럼은 **아직 없다**(B 에서 제안).
- 인용 방어: DB CHECK 3개 — tos prohibited → quote_allowed=false · tos prohibited/forbids_automation → quote_policy≠'full' · quote_allowed → citation_allowed. 새 소스 6곳은 전부 quote_policy='none'·quote_allowed=false.
- `override='owner_2026-10-14'` = 남헌 v70 결정 기록(약관 예외). 러너의 OWNER_ROBOTS_OVERRIDES 에 값이 들어 있어 robots_status='disallowed' 인 소스에서만 robots 금지가 열리고, 그 소스는 간격 2배·일일 상한 절반(코드 강제, PR #516, `lib/review/runner.ts` isRobotsDisallowedSlow).
- 기술 차단(403/429/빈 응답/캡차)은 기존 엄격 모드가 즉시 중단 + 소스 broken 경보. 우회 코드 없음. robots 확인 불가(unverified)는 fail-closed.

### A-2 어댑터
- `lib/review/adapters/discourse.ts` 팩토리 `makeDiscourseAdapter({key, host, boards})` — host 는 상수(SSRF 방지). 인스턴스 6개(n8n 가동, make·bubble·retool·glide·softr 는 PR #518 미적용). Discourse 공개 JSON(`/c/<slug>/<id>.json` 목록 → `/t/<id>.json` 토픽 큐).
- 작성자 미저장(v70 §10): username·name·avatar 를 읽지 않고, 본문의 `@멘션`·인용 머리글은 `@user` 로 치환.
- 토픽이 20게시글을 넘으면 첫 20개만(알려진 한계).

### A-3 등록 경로(수동 마이그레이션 PR)
- 소스 1개 = 어댑터 인스턴스 + 4곳 등록(review-collect.mjs 맵 · target-ref.ts · target-supply.ts BOARD_SOURCES · 워크플로 options) + 소스·램프(50% 출발: cap_base 40, 목표 20/일)·타깃 INSERT 마이그레이션 + 롤백(enabled=false·override NULL·램프 동결). 적용은 세션이 DO 블록 검증과 함께 한다. 아직 **자동 생성기 없음**.

### A-4 앵커 검증(`lib/review/anchor.ts`, 회사/앱 후보용)
- iTunes Search 로 이름 일치 + 평가 수 ≥50 + 판매자 단일일 때만 anchored. 동명 앱이 서로 다른 판매자면 ambiguous. 3상태 + lookup_failed. 실측: Notion·Evernote anchored, Ivory ambiguous, "ask AI"·Fera·InVideo AI no_match. 웹 전용 제품은 구조적으로 no_match(도메인 앵커는 없다).

### A-5 접근 정책 근거 기록
- `scripts/robots-originals-v70.mjs` 가 후보 48호스트 robots.txt 원문을 우리 UA 로 1회씩 읽어 JSON 으로 저장(요약본 아님). 루트 + 내용 경로 샘플 판정.

### A-6 E2E 실측(n8n 커뮤니티, 2026-10-14 02:5x KST)
- 요청 10 · 신규 23 · 파싱 실패 0 · 차단 0 · robots 예외 사용 0 · 작성자 핸들 0(@user 2건만). 영역: 프로젝트 영역 상속(`v_input_area`) → 해당 프로젝트 area_code='out-founder'. 관련성 판정은 아직 0건(판정 배치 대기).

## B. 제안(미구현) — 검수 대상

### B-1 상태기계: insert-only 이벤트 로그
- 테이블 `source_lifecycle_events(id, source_key, state, at, actor, evidence jsonb, note)` insert-only(UPDATE/DELETE 트리거로 거부) + 뷰 `v_source_state`(소스별 최신 1행).
- 상태: DISCOVERED → ACCESS_CHECKED → SAMPLED → {RETRY | BLOCKED | OUT | CANDIDATE} → PROVISIONAL → {PROMOTED | DISCARDED}, 추가로 PAUSED(킬스위치)·NO_ADAPTER(대기 장부).
- 허용 전이 표를 DB CHECK 가 아니라 앱 코드(순수 함수 + 셀프테스트)로 강제. 역행은 새 이벤트(예: BLOCKED→RETRY 는 사람/정책 이벤트)로만.
- CLAUDE.md §10.1 에 이 로그 테이블 INSERT 를 무인 루프에 허용하는 문구가 필요한지는 미정 — 세션(대화형)만 쓰면 불필요, 무인 루프가 쓰려면 문구 필요(CLAUDE.md 직접 편집 금지 → 완성 문구만 제공).

### B-2 임시 등록 자동화
- 후보 → 접근성 검사(robots 원문·로그인벽·렌더) → 다중 표본(3구역×20, 평균≥40% 또는 한 구역≥60%) → 법적 라벨 → 앵커 검증(회사/앱 후보) → 마이그레이션 PR 자동 생성(템플릿 = A-3) → CI 통과 시 세션이 머지·적용. 하루 신규 임시 소스 영역당 10개(처음 며칠 5개).
- 관련성 표본 판정은 현재 WebFetch 요약 모델(관대함 확인됨) 또는 제목 기준 수작업. 자동화 시 판정기(LLM) 선정·비용 미정.

### B-3 킬스위치·롤백
- 임계: 신규 등록분 감사 샘플 오탐률 20% 초과 / 차단·경고·법적 통지 수신 / 수집 실패율 급증 → 해당 레인 자동 정지(enabled=false + PAUSED 이벤트) + Notion 사람판단필요=true.
- 롤백: 마이그 롤백 파일(소스 비활성화) + 소스 단위 purge 스크립트(`analysis_inputs.source_key` 기준, purged_at). **purge 스크립트는 아직 없다**(원문 삭제는 §10.2 예외 1 — 승인된 임시 소스 purge 만 예외).

### B-4 모니터링
- "소스는 ok 인데 쓸모 있는 글(관련성 L4↑)이 0" 감지: 소스별 7일 신규·판정 relevant 비율을 일일 로그 `[자율 공급]` 블록에 출력. 임계·알림 미정.

### B-5 무인 8시간 운영
- 루프: 세션 내부 CronCreate(2시간마다 재개 프롬프트, 세션 종료 시 소멸). 서브에이전트는 DB 접근 금지, WebFetch 조사만. 표본·약관 판정은 서브에이전트(요약 모델)가 해 신뢰도에 한계.

## C. 검수자가 특히 봐 줄 것 (v70 §7 의 12개 관점)
(1) 상태기계 누락 상태·역행 경로 (2) insert-only 로그의 조회 성능·정합성 (3) 어댑터 부재·사이트 개편 시 자동 감지와 정지 (4) 분류 오염(동음이의어)과 앵커 검증 허점 (5) 속도 제한·차단·IP 밴 대응 (6) 법적 라벨 상속과 quote_allowed 강제의 우회 경로(결론서·칼럼 생성 단계에서 새는지) (7) 킬스위치 임계치 적정성 (8) 롤백 리허설 범위 (9) 모니터링 사각지대 (10) 토큰 비용 폭주 방지 (11) robots_disallowed 소스 취급이 사이트 반응(차단·통지)에 노출되는 위험과 완화 (12) 8시간 무인 중 자기 강화 오류(잘못된 판정이 반복 등록을 부르는 경우).
추가 질문: 우리가 이미 수집한 n8n 글이 `area_code='out-founder'` 로 상속된다 — 영역 ①~⑤ 분석에 쓰이지 않는 소스를 늘리는 것이 맞는가, 아니면 소스 등록 전에 "영역 적합성" 을 후보 조건으로 넣어야 하는가.
