# 코드 진단 리포트 — 2026-09-15

> **[2026-09-16 추적] 치명 12건은 전부 닫혔다.** 각 항목 제목 옆에 `해결됨(PR #번호)` /
> `미착수(사유)` 를 달았다. 09-15 시점에 이미 닫혀 있던 3건(4-2·3-1·3-2)은 이번에 main 코드를
> 직접 대조해 재확인했고, 나머지 9건은 항목당 브랜치 1개로 고쳐 머지했다(#107·#109·#111·
> #112·#114·#116·#117·#118·#119). 각 PR 에 회귀 셀프테스트가 붙어 있고 `build-check.yml`
> 또는 해당 워크플로가 매번 돌린다. **중요 27건·사소 19건은 손대지 않았다 — 아래 목록 그대로 남아 있다**
> (같은 파일을 고치는 김에 함께 닫은 2-4·3-4·3-5·3-9 는 예외로 표시했다).
>
> 아직 열려 있는 것 중 사람 판단이 필요한 것: RBAC 실구현(5-1 의 계획 절), 미등록 Actions
> 시크릿 7개 처리(5-3 에서 발견), 마이그레이션 이력 복구(4-1, DB 쓰기라 승인 필요).

> 코드는 한 줄도 고치지 않았다. 5개 주제(Gemini 비용·에러 처리·크론 실패·마이그레이션 대조·문서 불일치)를 읽기 전용 에이전트 4개 + 오케스트레이터 직접 DB 대조로 조사했다. 모든 주장은 `file:line` 근거가 있고, 확인 못 한 것은 "확인 불가"로 적었다. 덤으로 ③-1 수정 중 발견한 검증기 상태를 6절에 붙였다.

## 심각도 요약 3줄
1. **지금 막아야 할 것 셋** — RLS 꺼진 테이블 7개가 브라우저 anon 키에 그대로 노출(4-2, 마이그 1개·30분). Threads 토큰 만료가 구조적으로 은폐돼 60일 뒤 성과 파이프라인이 통째로 죽는다(3-1, 1~2시간). 크론이 "안 돌았다"를 감지하는 장치가 어디에도 없다(3-2, 2~3시간).
2. **돈이 새는 곳** — Gemini 는 앵글 파이프라인 한 곳에 몰려 있다. 락 부재로 배치 전량 중복(1-1), 프롬프트 순서가 거꾸로라 캐시 적중 0(1-2), 429 재시도 예산이 함수 상한을 넘어 쿼터만 태우고 산출물 0(1-3). 셋 합쳐 6시간이면 대부분 잡힌다.
3. **조용히 사라지는 데이터** — HN enrich·Notion 피드백 크론은 전량 실패해도 초록불(2-1·2-2), 인사이트 루프는 DB 오류를 "패턴 없음"으로 접어 그날 근거를 영구 유실(2-3). 문서 불일치 20건 중 치명 3건은 RBAC 허위(5-1)·크론 시각(5-2)·PAT 존재(5-3). 마이그레이션은 **스키마 내용은 일치**하지만 이력 표가 38건 중 8건만 기록(4-1).

## 전 영역 심각도 순 색인 (번호는 아래 절의 항목)
**치명적 12건 — 2026-09-16 기준 12/12 해결됨** (아래 각 항목 옆 표시가 정본)
- 4-2 RLS 정책 0 + RLS OFF 테이블 7개 → anon 키 노출 — **해결됨(PR #97, 마이그레이션 적용까지 완료)**
- 3-1 refresh-token 실패 200 은폐, 60일 뒤 Threads 전체 정지 — **해결됨(PR #101)**
- 3-2 크론 미발화·조기사망 감지 장치 부재 — **해결됨(PR #101, cron-watchdog)**
- 1-1 앵글 POST 낙관적 락 없음, 배치 전량 중복 — **해결됨(PR #112)**
- 1-2 judge 프롬프트 순서 역전, 캐시 적중 0 — **해결됨(PR #114)**
- 1-3 429 재시도 20회·700초 > maxDuration 300초 — **해결됨(PR #116, 비용 가드레일 포함)**
- 2-1 (=3-3) HN enrich 전량 실패 초록불 — **해결됨(PR #107)**
- 2-2 (=3-4·3-9) Notion 피드백 전량 실패 exit 0 + 로그 중복 누적 — **해결됨(PR #109, 3-5 도 함께)**
- 2-3 인사이트 루프 DB 쓰기 9곳 error 무시, 근거 영구 유실 — **해결됨(PR #111, 실제로는 12곳. 2-4 도 함께)**
- 5-1 CLAUDE.md "RLS 로 RBAC 강제" — 실제 RBAC 없음 — **해결됨(PR #119, 문서. RBAC 실구현은 미착수)**
- 5-2 셋업 문서 크론 시각 `0 19` — 실제 `41 18` — **해결됨(PR #117)**
- 5-3 "PAT 없음" 문서 vs `GH_PAT` 주입 — **해결됨(PR #118, 빌드 배선 제거 + 실측 인벤토리)**

**중요 27건**
- 1-4 사고 토큰 지불 후 폐기 · 2h — 1-5 파싱 실패 시 20KB 재전송 · 2h — 1-6 검수 저장만으로 앵글 전체 재생성 · 4h — 1-7 judge 건별 호출(배치 가능) · 4h
- 2-4 인사이트 로그 실패 exit 0 · 0.25h — 2-5 다이제스트 푸시 exit 0·"무브 없음" 발행 · 1h — 2-6 리뷰 수집 마감·집계 실패 무기록 · 0.5h — 2-7 (=3-7) Vercel 크론 부분 실패 200 · 0.5h — 2-8 매니페스트 깨지면 "대기 0건" · 1h — 2-9 수동 발행 뒤 UPDATE 실패 → 중복 발행 · 0.5h
- 3-5 notion-feedback concurrency 없음 · 5분 — 3-6 fatal 소스 health 안 내려감 · 1h
- 4-1 마이그레이션 이력 38건 중 8건 · 2h + 승인
- 5-4 없는 훅이 typecheck 강제 · 0.2h — 5-5 §7.1 경로 오지목 · 0.1h — 5-6 §6/§7 없는 경로 · 0.5h — 5-7 스택 표 LLM 공급자 · 0.3h — 5-8 Actions 가 헌법에 없음 · 0.3h — 5-9 매시 크론 예외 미등록 · 0.3h — 5-10 정규식 깨져 편집자 메모가 Notion 에 나감 · 0.4h — 5-11 보고 정본 참조 문서 2개 없음 · 0.5h — 5-12 보고 정본 예시가 금지된 넓은 표 · 0.3h
- 6-1 검증기를 아무도 안 돌림 · 15분 — 6-2 경로 검사 오탐 16건 · 30분

**사소 19건**
- 1-8, 1-9 · 2-10~2-14 · 3-8(PR #93 반영 완료), 3-9, 3-10 · 4-3 · 5-13~5-20 · 6-3

---

## 1. Gemini API 낭비 비용

조사 범위: `app/api/**`, `lib/**`, `scripts/**`, `.github/workflows/**`. Gemini(유료 API)는 `app/api/analyze/extract`·`app/api/analyze/angle` 두 경로에서만 쓰인다. 크론 루프(cmo-daily·insight-loop)는 전부 Claude CLI 구독 경로라 API 과금과 무관하다. 낭비는 앵글 파이프라인에 집중돼 있다.

### [치명적·해결됨 PR #112] 1-1. 앵글 생성 POST 에 낙관적 락이 없어 같은 배치가 두 벌 나간다
- 위치: `app/api/analyze/angle/route.ts:606`(상태 읽기) → `:690`(LLM 호출) → `:745-748`(상태 갱신)
- 문제: status 가 `reviewed` 인지 읽기만 하고 수 분짜리 배치를 돌린 뒤 맨 끝에서야 `angled` 로 바꾼다. 그 사이 들어온 두 번째 요청도 통과한다.
- 왜 문제: 더블클릭·탭 두 개·새로고침 재시도만으로 프로젝트당 10~32회 호출이 통째로 중복된다. 바로 옆 `extract/route.ts:391-410` 은 조건부 UPDATE 로 락을 걸어 뒀는데 angle 에만 빠졌다.
- 고치면: 중복 실행이 409 로 끊긴다. 무료 티어 일일 한도(`lib/analysis/llm.ts:31` 주석상 20건/일)에서는 중복 1회가 그날 하루를 날리는 것과 같다.
- 예상 작업량: 1시간 (extract 의 락 패턴 복사 + `angling` 중간 상태 1개)

### [치명적·해결됨 PR #114] 1-2. judge 프롬프트 순서가 거꾸로라 컨텍스트 캐시 적중이 구조적으로 0
- 위치: `app/api/analyze/angle/route.ts:299-330` (`buildJudgePrompt`), 특히 `:305`(변하는 문구 맨 앞) 와 `:324-327`(20KB 공통 코퍼스 맨 뒤)
- 문제: 코퍼스는 요청당 1회만 DB 에서 읽지만(`:642`) LLM 에는 앵글마다 매번 전송된다. Gemini 암묵적 캐시는 앞쪽 공통 접두사가 일치해야 걸리는데 변하는 부분이 맨 앞이다.
- 왜 문제: 앵글 6~8건 × (judge+재작성+재심사) 최대 3회 = 20KB 를 20회 이상 정가로 반복 전송. 프로젝트당 40만 자 규모의 중복 입력.
- 고치면: 코퍼스를 앞으로, 변하는 문구를 뒤로 옮기는 것만으로 2번째 호출부터 입력 대부분이 캐시 단가(약 1/4)로 떨어진다. 판정 품질은 그대로.
- 예상 작업량: 1시간 (lines 배열 순서 + 셀프테스트 기대값)

### [치명적·해결됨 PR #116] 1-3. 429 재시도 예산(최대 20회·약 700초)이 함수 상한(300초)을 넘는다
- 위치: `lib/analysis/llm.ts:181`(MAX_ATTEMPTS=4), `:185`(백오프 20초), `:268-281`(모델 체인 5개 루프) × `app/api/analyze/extract/route.ts:27`(maxDuration=300)
- 문제: 모델당 4회(20+40+80초) 뒤 다음 모델로 넘어가 반복. 최악 20회 요청·700초 대기인데 함수는 300초에 죽는다.
- 왜 문제: 일일 한도 소진 상태에서 "반드시 실패할 20회"를 다 날리고 저장 전에 강제 종료된다. 쿼터는 다 쓰고 산출물은 0. extract 는 `processing` 에 갇혔다가 10분 뒤 stale 판정(`extract/route.ts:108,127`)으로 같은 낭비를 반복한다. CLAUDE.md §7.2 의 정확한 사례.
- 고치면: 429 는 모델 내 1~2회만 재시도하고 곧장 다음 모델로. 실패 경로 20회 → 5회, 300초 안에 끝나 결과가 저장된다. 응답의 quotaId 로 일일/분당을 가르면 더 깔끔.
- 예상 작업량: 2시간

### [중요] 1-4. 사고(thinking) 토큰을 지불하고 즉시 버린다
- 위치: `lib/analysis/llm.ts:143-147`(generationConfig 에 thinkingConfig 없음), `:170-175`(`thought===true` 파트 폐기), `:57`(maxOutputTokens 32000 고정)
- 문제: judge 출력은 `{verdict, reason, evidence_quote}` 세 필드인데(`angle/route.ts:202-227`) 32k 출력 여유와 기본 사고 예산을 준다. 사고 토큰은 출력 단가로 과금되고 코드가 읽지도 않는다.
- 고치면: judge/재작성에 `thinkingBudget: 0` + maxOutputTokens 1024. label 인자(`extract`/`angle:judge`/`angle:rewrite`)가 이미 있어 분기 키가 있다.
- 예상 작업량: 2시간 (label 별 파라미터 표 + judge 잘림 실측)

### [중요] 1-5. JSON 파싱 실패 시 20KB 프롬프트를 통째로 재전송
- 위치: `lib/analysis/llm.ts:307-319`; 호출부 `angle/route.ts:426, 474, 503`
- 문제: 파싱 실패 → 같은 system+user 프롬프트에 안내 한 줄만 붙여 재요청. `parseJsonObject`(`llm.ts:341-355`)는 중괄호 추출만 하고 trailing comma·잘린 JSON 은 안 다룬다. 재요청은 1-3 의 예산 위에 그대로 얹힌다.
- 고치면: 코드 복구 한 단계를 먼저 두고, 재요청하더라도 코퍼스를 뺀 "직전 응답만 정리해라" 형태로 보내면 전송량이 1/100.
- 예상 작업량: 2시간

### [중요] 1-6. 검수 화면 저장만 눌러도 앵글 전체가 재생성된다
- 위치: `app/api/analyze/review/route.ts:139`(REVIEWABLE 에 angled/done 포함) → `:309`(status 를 reviewed 로 되돌림) → `angle/route.ts:606`
- 문제: 속성이 바뀌었는지 비교하지 않고, 입력 해시·멱등키도 없다. 기존 앵글은 삭제되므로(`angle/route.ts:708-711`) 재실행 유인도 크다.
- 고치면: 속성 집합 해시를 `analysis_projects` 에 저장해 같으면 건너뛰거나 바뀐 속성만 재생성.
- 예상 작업량: 4시간 (컬럼 1개 마이그 + 부분 재생성 분기)

### [중요] 1-7. judge 가 앵글 1건당 1회 호출 — 배치 가능한데 쪼개져 있다
- 위치: `angle/route.ts:26`(CONCURRENCY=1), `:489`·`:534`(앵글마다 judgeHeadline), `:690`
- 문제: 변하는 입력은 문구 한 줄과 속성 메모뿐. 8건을 한 요청에 넣고 배열로 받으면 코퍼스 전송이 8회 → 1회. 인용 검증(`:441-451`)은 어차피 코드가 한다.
- 고치면: judge 호출 1/8, 1-2 와 함께 적용 시 앵글 파이프라인 입력 토큰이 기존의 20~30%.
- 예상 작업량: 4시간 (배치 프롬프트 + 인덱스 정합성 + 누락 시 개별 폴백)

### [사소] 1-8. 재작성 호출이 속성 블록 전문을 다시 붙인다
- 위치: `angle/route.ts:503-518`, "## 맥락" 블록 `:516-517`
- 고치면: 속성명·레이어·판단근거 3줄로 줄이면 재작성 입력이 절반 이하. 예상 1시간 + 비교 실측 1시간.

### [사소] 1-9. force 재분석이 입력 변경 여부를 안 본다
- 위치: `app/api/analyze/extract/route.ts:33-34`(8,000자/입력·120,000자 총합), `:130`(force 허용)
- 고치면: 입력 원문 해시 비교로 거부. 1-6 과 같이 하면 1시간.

### 확인했지만 문제 아님
- `extract/route.ts:391-410` 조건부 UPDATE 락 있음 · `app/analyze/new/page.tsx:236-245` 409 를 폴링으로 처리, 재POST 없음 · `:181` 백그라운드 탭 폴링 생략
- `angle/route.ts:631-642` 근거 원문 요청당 1회 조회 · `:537` 재심사 무한루프 없음(앵글당 최대 4회 고정) · `:644-663` 유형 배정은 코드 규칙 · `:665-677` TABLE_STAKES 는 이미 배치
- `app/api/analyze/advisor/route.ts:122` LLM 미사용(순수 매칭) · `angle/validate/route.ts` LLM 미사용
- `lib/insight/loop.ts:231` `analysis_status='pending'` 필터로 재분석 없음, 실패는 `failed` 마킹(`:338`)
- `lib/insight/llm.ts:25` / `scripts/cmo-daily.mjs:404-410` 기본 프로바이더 claude-cli(구독) · 워크플로 10개 중 Gemini 키 쓰는 것 없음
- `lib/analysis/llm.ts:187-194` 지수 백오프+지터 있음, `:179-180` 402/400 은 재시도 제외

정리: 가장 크게 먹는 건 1-2+1-7(코퍼스 중복 전송), 가장 위험한 건 1-1(락 부재). 1-1·1-2·1-3 만 처리해도 하루 6시간 안에 대부분 잡힌다.

---

## 2. 에러 처리 — 실패했는데 조용히 넘어가는 곳

조사 범위: 워크플로 8개, `scripts/*.mjs` 무인 진입점 전부, `lib/insight/`·`lib/review/`·`lib/threads/`, `app/api/threads/**`. 먼저 확인하고 **못 찾은 것**: `Promise.allSettled` 0건. `Promise.all` 7곳은 전부 거부가 상위로 전파되거나 `{ok}` 객체를 돌려줘 삼켜지는 자리가 없다. 반대로 `app/api/threads/collect-metrics·match-posts·collect-replies`, `scripts/case-match.mjs`, `review-purge.mjs`, `review-collect.mjs` 의 종료코드 규약은 이미 기준을 지킨다. 아래는 그 표준을 아직 안 따르는 자리들이다.

### [치명적·해결됨 PR #107] 2-1. 나이틀리 HN enrich 는 전부 실패해도 초록불 (3-3 과 같은 건, 상세)
- 위치: `scripts/review-hackernews-enrich.mjs:190`(`if (res.ok)` 비-2xx 는 그냥 통과), `:194-196`(네트워크 예외 console.log), `:208-212`(UPDATE 실패 continue), `:225-229`
- 왜 문제: 워크플로가 이 스텝 하나라 잡 전체가 매일 초록. `review-collect.mjs:310-312` 가 "한 소스라도 실패하면 1"을 지키는 것과 정반대. 원인이 안 고쳐지면 score 는 영영 안 붙는다.
- 고치면: 카운터 세서 끝에 `process.exitCode = 1`(`review-purge.mjs:130-136` 관례). 아울러 `:190-201` 에서 HTTP 실패와 "score 필드 없음(삭제·dead 글)"이 같은 카운터로 합쳐지는 것도 `httpFailed`/`noScoreField` 로 가른다(§7.1). 0.5시간.

### [치명적·해결됨 PR #109] 2-2. Notion 피드백 풀백: 전부 실패해도 exit 0 + 로그가 매일 밤 중복 누적 (3-4·3-9 와 같은 건, 상세)
- 위치: `scripts/notion-pull-feedback.mjs:168`(`exit 0`), `:125-129`, `:155`(로그 append 먼저) → `:157-164`(`pulled_at` UPDATE 실패는 경고만)
- 왜 문제: `pulled_at` 이 null 로 남아 `:103` 이 다음 밤에도 같은 행을 집고 `:140 nextLogCode()` 가 새 코드를 발급 → 같은 판정이 LOG-…-01/-02/-03 으로 매일 늘어난다. `:162` 의 42703 힌트는 실제로 겪은 상황. 워크플로(`nightly-notion-feedback.yml:56-73`)가 그 파일을 자동 커밋까지 한다.
- 고치면: `counts.error > 0 || updFailed > 0` 이면 exit 1, append 를 UPDATE 뒤로. 1시간.

### [치명적·해결됨 PR #111] 2-3. 인사이트 루프의 DB 쓰기 9곳이 error 를 안 보고, 그중 하나는 "확인 불가"를 "패턴 없음"으로 접는다
- 위치: `lib/insight/loop.ts:370`(핵심), 같은 패턴 `:299-312, :336-339, :381-384, :404, :423, :501-505, :518-524, :527-536, :539, :617-623, :672`
- 문제: `:370` 의 `insight_patterns` 존재 확인이 `error` 를 구조분해하지 않는다. 조회 실패 → `existing=undefined` → `:420` "신규 패턴" 분기 → `:423` INSERT 가 UNIQUE(`20260829000002_insight_patterns.sql:38-39`) 위반으로 실패하는데 `:423` 도 error 를 안 본다 → **그날 밤 근거 1건이 영구히 사라진다.** 해당 `saved_examples` 는 `:299-312` 에서 이미 `analyzed` 로 바뀌어 다음 밤에 안 온다. 보고에는 `new: [키]` 로 "신규 패턴 1건"이 뜬다(`:435-441`).
- 같은 계열: `:672` `hypotheses.select('code')` error 무시 → `max=0` → `H1` 재발급 → `:392` INSERT UNIQUE 위반 → `:404 if (!hErr)` 의 else 가 없어 어디에도 안 남는다. `:501-524` 승격 경로는 `counts.promoted++` 를 먼저 올리고 결과를 안 봐서 DB 는 그대로인데 보고와 `insight_loop_runs.promoted_count` 에 "승격 1".
- 왜 문제: 이 루프가 `main` 에 사람 승인 없이 커밋하는 유일한 파이프라인이고 그 근거가 `evidence_count` 누적이다. 누적이 조용히 끊기면 `shouldReflect` 가 영영 안 걸려 "도는데 아무것도 안 배우는" 상태로 몇 달 간다. `:255` 는 "키 목록을 못 읽었으면 빈 목록으로 넘어가지 않는다"고 막아 뒀는데 바로 아래는 안 막혀 있다.
- 고치면: `:370` 에 `error` 받아 throw, 나머지 8곳 `const { error } = …; if (error) throw` 한 줄씩. 못 읽은 밤은 `ok:false` → `insight-loop.mjs:181` 이 1. 2시간(셀프테스트 포함).

### [중요·해결됨 PR #111] 2-4. 인사이트 루프: 실행 로그를 못 남겨도 종료코드 0
- 위치: `lib/insight/loop.ts:630`(`ok` 계산) → `:633-649`(`insight_loop_runs` insert 실패는 `fatal` 에만) → `:652` → `scripts/insight-loop.mjs:181`
- 왜 문제: 헤더 `:30` 이 "안전장치 3겹" 중 셋째로 꼽은 로그가 작동 안 한 밤이 정상으로 기록된다(§2). 그날 `main` 커밋이 어느 실행에서 나왔는지 추적할 행이 없다.
- 고치면: `:652` 를 `ok: ok && !fatal`. 0.25시간.

### [중요] 2-5. Notion 다이제스트 푸시: 한 건도 못 올려도 exit 0, 무브 조회 실패는 "무브 없음"으로 발행
- 위치: `scripts/notion-push-digest.mjs:230`(`exit 0`), `:202`(`{ data: moves }` error 미수신), `:143`(`ci` error 미검사), `:177-189`
- 문제: ① `:202` 실패 → `moves=null` → `:215-216 summary='(무브 없음)'` 페이지가 **실제로 Notion 에 만들어진다**. ② `:143` 실패 → "결정문서 못 찾음"으로 오진. ③ `:177-189` `notion_sync_log` INSERT 실패 시 console.error 만 → 그 행이 없으면 풀백(`notion-pull-feedback.mjs:103`)이 그 페이지를 영원히 못 읽어 피드백 루프에서 초안 1건이 빠진다. ④ 전부 겪고도 exit 0 이라 `cmo-daily.mjs:746 if (notion.code !== 0)` 이 안 걸리고 상태 로그 "막힌것"에도 안 들어간다.
- 고치면: `skipped.length > 0 || linkFailed > 0` 이면 exit 1(배선은 `cmo-daily.mjs:747-749` 에 이미 있다), `:202`/`:143` 은 error 받아 "확인 불가"로 스킵. 1시간.

### [중요] 2-6. 리뷰 수집: 실행 로그 마감·누적 집계 실패가 아무 데도 안 남는다
- 위치: `scripts/review-collect.mjs:213-229`(마감 UPDATE error 미수신), `:248-268`(`if (!error && data)`)
- 문제: ① 마감 실패 → 행이 `running` 으로 남고 다음 실행 `:102-109` 가 `interrupted` 로 덮어 "잡이 죽었다"는 거짓 기록 + `lib/review/store.ts:41-52` 의 예산 합산이 틀어진다. ② 조회 실패 시 "프로젝트별 누적 리뷰" 섹션이 통째로 사라진다 — 0건도 확인 불가도 아니다(`:245` 가 extract 시점 판단의 유일한 근거).
- 고치면: ① `failures.push`, ② `else say('- ⚠️ 누적 집계 확인 불가')`. 0.5시간.

### [중요] 2-7. Vercel 크론 3개 부분 실패 200 (3-7 과 같은 건)
- 위치: `collect-metrics/route.ts:232-243`, `collect-replies/route.ts:154-164`, `match-posts/route.ts:254-294`. 테이블 단위 실패는 제대로 500(`collect-metrics:109-116, 138-146`, `match-posts:118-123, 144-149`)인데 건 단위만 200 으로 샌다. `failed.length > 0` 이면 207/500(`match-posts` 는 `recordUnlinkedCheck` 뒤에). 0.5시간.

### [중요] 2-8. CMO 루프: 스테이징 매니페스트가 깨지면 "붙여넣기 대기 0건"
- 위치: `scripts/cmo-daily.mjs:1419-1425`(`stagedJobs`), `:1477-1481`(`stagedMetrics`), `:1488`(`catch { continue }`)
- 왜 문제: `ops/state/<runKey>-stage.json` 이 깨지면 판정 로그 엔트리와 DIGEST 최상단 "붙여넣기 대기 N건"이 함께 0 이 된다(`:1431-1433` 이 자랑한 "정본이 같아 자동으로 맞는다"가 여기선 "함께 틀린다"로 작동). DB 에는 `pending_review` 가 실제로 있는데 남헌이 못 본다.
- 고치면: catch 에서 `[]` 대신 `{ error }` 를 돌려 "확인 불가" 줄. 1시간.

### [중요] 2-9. 수동 발행 라우트: 실제 발행 뒤 DB 갱신 실패가 삼켜져 중복 발행 경로가 열린다
- 위치: `app/api/threads/publish/route.ts:70-76, 80-82`
- 문제: `publishPostWithReply` 성공 후 `thread_posts` UPDATE 를 error 확인 없이 await. 실패하면 행이 `queued` 로 남는데 응답은 `:78 { ok: true }`. 다음 호출이 `:57 posts[0]` 로 같은 행을 다시 집어 **같은 글을 한 번 더 발행**한다.
- 왜 문제: 되돌릴 수 없는 외부 부작용 뒤의 기록 실패. 계정 리스크(§10) 직결.
- 고치면: UPDATE 실패 시 `postId`/`replyId` 를 담아 500. 0.5시간.

### [사소] 2-10 ~ 2-13
- **2-10** 워크플로 어디에도 `shell:`/`defaults:` 선언이 없어 `run:` 이 `bash -e {0}` (pipefail 없음)로 돈다. 당장 걸리는 건 `hn-firebase-c-probe.yml:50-53` 의 `| tee` 뿐 → PR #93 에 반영. 다른 워크플로에 같은 패턴을 복사하지 않도록 `defaults.run.shell: bash` 한 줄 검토. 0.1시간.
- **2-11** `lib/threads/token.ts:155-172` 갱신한 토큰 upsert 실패 시 console.error 후 새 토큰을 그대로 반환. 주석(`:167-168`)이 "반복되면 만료로 이어진다"고 적어 뒀는데 반복 여부를 알 방법이 로그 grep 뿐. `creds.persisted=false` 를 응답 `usage` 옆에 노출. 0.5시간.
- **2-12** 부수 쓰기 error 무시 5곳 — `lib/insight/loop.ts:154`, `lib/review/store.ts:149-152`, `scripts/cmo-daily.mjs:613`·`:682`(`catch {}`), `lib/insight/claude-cli.ts:362/386`. 의도는 타당하나 실패 횟수가 안 쌓인다. 실행 요약에 `부수기록 실패 N건`(0 이면 안 찍음, `review-collect.mjs:196` 관례). 0.5시간.
- **2-13** `scripts/cmo-daily.mjs:756` 이 `status-render.mjs` 의 exit 2("DB 확인 불가")를 안 보고, `:771-776` 재렌더 커밋/push 실패가 경고 한 줄. `state.counts.dashboard_stale=1` 로 DIGEST 에. 0.5시간.
- **2-14** `app/api/threads/sync-conversions/route.ts:31/52/61` `{ data }` 만 받아 테이블 부재(PGRST205)가 `ok:true, matched:0` 으로 나간다. 지금은 `vercel.json` 크론에 없어 아무도 안 부르지만 재활성화 때 지뢰. `:52`·`:61` 은 주석에서 언급조차 없다. 0.5시간.

정리: 실패를 표현할 수단이 아예 없는 크론 2개(HN enrich·Notion 피드백)부터 1.5시간. 가장 비싼 손실은 `lib/insight/loop.ts:370` (2시간).

---

## 3. 크론 작업 실패 시 처리

조사 범위: GitHub Actions 워크플로 6개 + 그 스크립트, Vercel 크론 4개 라우트(`vercel.json:6-11`) + 헬퍼. Slack·Kakao·이메일·GitHub issue 알림은 **리포 전체에 없다** (kakao 는 전부 인바운드 webhook). 사람에게 가는 경로는 Notion "일일 상태 로그" 행이 유일하고, 그것도 6개 크론 중 2개(CMO 루프·리뷰 수집)만 쓴다.

### 크론별 실제 동작 (한 줄씩)
- **daily-cmo-loop** (20:17 UTC): 스텝 실패는 그 스텝만 `failed`, 나머지 계속(`scripts/cmo-daily.mjs:248-253`). preflight 실패만 즉시 `exit 2`(`:333-342`). 재시도 없음 — "다음 밤이 같은 일을 다시 한다"(`daily-cmo-loop.yml:128-129`), 못 쓴 초안이 이월되진 않음(목표 고정 `:93-94`). 사람 전달 = Notion CMO 행(`:272-306`), Notion 죽으면 `ops/state/status-log-pending/` 폴백. 종료코드 `failed>0 ? 1 : 0`(`:787`). ⚠️ `npm ci`·CLI 설치·selftest·90분 타임아웃에서 죽으면 스크립트가 시작조차 안 해 **Notion 행 0개**.
- **nightly-review-collect** (17:37 UTC): 소스별 try/catch, 실패 소스는 `review_collection_runs.status='failed'`+`error`(`scripts/review-collect.mjs:141-165, 211-229`). 좀비 `running` 은 다음 실행이 `interrupted` 처리(`:102-109`). 사람 전달 = Notion CTO 행 + `사람판단필요=true`(`review-collect-status.mjs:32-50`). 종료코드 `failures>0 ? 1 : 0`(`:312`). **6개 중 부분 실패 기록이 유일하게 제대로 된 곳.** ⚠️ 어댑터가 예외로 죽으면 `review_sources.health` 가 안 내려간다(`lib/review/runner.ts:387-394`).
- **nightly-hackernews-enrich** (18:19 UTC): 전제조건 실패는 `exit 1`(`scripts/review-hackernews-enrich.mjs:101-154`)이지만 본 루프 실패는 전부 삼킨다 — fetch 실패 `storiesNoScore++`(`:189-196`), UPDATE 실패 `continue`(`:214-217`). **100건 전부 실패해도 exit 0.** 사람 전달·DB 기록·STEP_SUMMARY 전부 없음. 유일한 장점: 대상이 "아직 ▲ 안 붙은 행"이라 다음 밤 자동 catch-up(`:144-152`).
- **nightly-insight-loop** (18:41 UTC): 단계 실패 시 `result.ok=false`, `exit 1`(`scripts/insight-loop.mjs:72-80, 181`). 재시도 없음(멱등). 사람 전달 = `GITHUB_STEP_SUMMARY` 만(`:106-108`) → Actions 탭 전용. 단 이 루프가 `review_sources.health≠ok` 를 경보로 찍는 **다른 크론의 실패를 사람에게 보여주는 유일한 통로**(`:53-63, 117-137`).
- **nightly-notion-feedback** (12:07 UTC): 페이지 읽기 실패 `counts.error++` 후 continue(`scripts/notion-pull-feedback.mjs:124-129`), DB 갱신 실패는 `⚠️` 만(`:164-167`). ⚠️ `NOTION_API_TOKEN` 없으면 **`exit 0`**(`:85-88`), 전건 실패해도 **`exit 0`**(`:167-168`). 사람 전달 없음. **concurrency 블록 없음**(워크플로 유일). 대상이 `pulled_at IS NULL` 이라 미처리분 자동 catch-up 은 됨(`:101-103`).
- **hn-firebase-c-probe**: 조사 시점엔 수동 전용(이번 PR #93 으로 매일 15:23 UTC 스케줄 추가). ⚠️ `node ... | tee` 파이프라인에 `pipefail` 이 없어 Node 가 죽어도 스텝이 초록(`hn-firebase-c-probe.yml:51-53`) → **PR #93 에 `set -o pipefail` 반영함.**
- **Vercel 4개 공통**: `CRON_SECRET` 은 4개 전부 첫 줄에서 검사, 변수 비면 500 fail-closed, `timingSafeEqual`(`lib/cron-auth.ts:41-62`) — **잘 돼 있다.** `maxDuration` 은 4개 어디에도 없음. 플랜 천장(Hobby 10s vs Pro 300s)은 코드로 **확인 불가**(`collect-metrics/route.ts:42-43` 주석만 "Pro 팀").
- **refresh-token** (주 1회 일 19:00 UTC): 토큰 만료로 갱신 불가여도 **HTTP 200 + `needsReauth`**(`refresh-token/route.ts:19-24`, `lib/threads/token.ts:121-123`). 그 본문을 읽는 코드가 리포에 없다. DB 장애만 503.
- **match-posts** (매시 정각): 조회·Threads API 실패는 500/502 로 정직(`:118-163`). 개별 UPDATE 실패는 `failed[]` 에 담고 **200**(`:239-249, 294`). 유일하게 `agent_run_steps` 에 흔적(`:286-292`) → DASHBOARD 에 노출.
- **collect-metrics** (매시 30분): 글별 실패 `failed[]` + **200**(`:199-207, 232-243`). 토큰 없으면 200 으로 조용히 빠짐(`:85-87`). ⚠️ 1h 버킷 창이 `0.5~1.9h` 로 닫혀(`lib/threads/buckets.ts:40, 68`) **두 시간 연속 실패하면 `views_1h` 영구 결손**, `spread_multiple` NULL.
- **collect-replies** (매시 45분): collect-metrics 와 동일 구조(`:67, 136-139, 154-162`). "유실추정" 카운트는 응답 본문에만 있고 저장 안 됨(`:151`).
- **누락된 하루가 드러나는가**: DASHBOARD 는 존재하는 run 만 그린다(`scripts/status-render.mjs:45-61`). `running` 5분 stale 은 표시(`:54-55`). `ops/state/cmo-YYYY-MM-DD-cron.jsonl` 은 ls 하면 빠진 날이 보이지만 자동 감지 코드 없음. **"어젯밤 안 돌았다"는 Notion 행 부재라는 부재 신호뿐이고, 아침 브리핑은 전날 행을 최신으로 오인한다**(`cmo-daily.mjs:275` 주석도 같은 말).

### [치명적·해결됨 PR #101] 3-1. refresh-token 실패가 구조적으로 은폐된다 — 60일 뒤 Threads 파이프라인 전체가 죽는다
- 위치: `app/api/threads/refresh-token/route.ts:19-24`, `lib/threads/token.ts:121-123`, `vercel.json:7`
- 문제: 갱신 불가여도 200. 주 1회라 재시도 간격 7일. `needsReauth` 를 읽는 코드가 없다. match-posts·collect-metrics·collect-replies 도 토큰 없으면 200 으로 빠진다.
- 왜 문제: 장기 토큰은 60일 뒤 갱신 불가(`:5`) → 수동 재인증만 답. 성과 데이터가 몇 주 끊긴 뒤에야 발견되고 `views_1h` 는 영구 손실.
- 고치면: 만료까지 남은 일수를 상태 로그에 한 줄, 또는 `needsReauth` 시 `agent_run_steps` 1행(match-posts 의 `recordUnlinkedCheck` 방식) → 아침 브리핑에 뜬다.
- 예상 작업량: 1~2시간

### [치명적·해결됨 PR #101] 3-2. 크론이 "안 돌았다"를 감지하는 장치가 어디에도 없다
- 위치: `scripts/status-render.mjs:45-61`, `scripts/cmo-daily.mjs:275`, 워크플로 6개 전체(`if: failure()` 0건)
- 문제: `npm ci` 실패·Actions 스케줄 미발화(2026-09-01 실측, `nightly-review-collect.yml:21-26`)·90분 타임아웃이 전부 완전한 침묵으로 나타난다.
- 고치면: 각 워크플로에 `if: failure()` 스텝 하나로 `notion-status-log.mjs --track … --needs-human` 호출(스크립트 CLI 이미 있음 `scripts/notion-status-log.mjs:5-7`). 하루 걸러 도는 상태를 다음 아침에 안다.
- 예상 작업량: 2~3시간

### [중요·해결됨 PR #107] 3-3. nightly-hackernews-enrich 은 전량 실패해도 초록불
- 위치: `scripts/review-hackernews-enrich.mjs:189-196, 214-217`
- 고치면: `if (storiesNoScore > storiesOk) process.exitCode = 1` + 요약 한 줄. 3-2 와 맞물려 자동으로 사람에게 간다. 30분.

### [중요·해결됨 PR #109] 3-4. nightly-notion-feedback 은 토큰이 없어도, 전건 실패해도 exit 0
- 위치: `scripts/notion-pull-feedback.mjs:85-88, 167-168` (같은 파일이 Supabase 쪽은 `exit 2` 를 제대로 씀 `:98-99`)
- 왜 문제: 시크릿 만료가 "매일 밤 성공하는 아무것도 안 하는 잡"으로 보인다. CLAUDE.md §7.1 위반 그 자체.
- 고치면: 토큰 없음 → exit 2, error>0 → exit 1. 30분.

### [중요·해결됨 PR #109] 3-5. nightly-notion-feedback 에 concurrency 가드가 없다
- 위치: `.github/workflows/nightly-notion-feedback.yml:25-31`
- 왜 문제: 수동 실행과 스케줄이 겹치면 같은 `pulled_at IS NULL` 행을 둘이 집어 로그 중복 append(`notion-pull-feedback.mjs:158`)·같은 코드 발급(`:76-80`)·push 충돌. 다른 워크플로는 전부 가드가 있다.
- 고치면: 3줄. 5분.

### [중요] 3-6. review-collect 가 fatal 로 죽은 소스는 health 경보에 안 뜬다
- 위치: `lib/review/runner.ts:387-394`, `scripts/review-collect.mjs:171-172`
- 왜 문제: 아침 경보 경로(insight-loop `:117-129`)는 `review_sources.health` 를 읽는데, 매일 밤 예외로 터지는 소스가 영원히 `ok` 로 보인다.
- 고치면: fatal 분기에서 `updateSourceHealth(key, {health:'broken', detail})`. 1시간.

### [중요] 3-7. Vercel 크론 3개가 부분 실패를 200 으로 반환
- 위치: `match-posts/route.ts:294`, `collect-metrics/route.ts:232-243`, `collect-replies/route.ts:154-162`
- 왜 문제: Vercel 은 non-2xx 만 실패로 본다. 매시간 절반씩 실패해도 전부 초록. collect-metrics 는 손실이 소급 불가.
- 고치면: 전건 실패일 때만 500(알람 피로 방지). 1시간.

### [사소] 3-8~3-10
- **3-8** `hn-firebase-c-probe.yml:51-53` `| tee` 가 종료코드 삼킴 → PR #93 에서 `set -o pipefail` 반영 완료.
- **3-9** `notion-pull-feedback.mjs:164-167` 로그 append 뒤 `pulled_at` 갱신 실패 시 다음 밤 같은 페이지 중복 기록. DB 먼저 갱신하도록 순서 교체. 30분.
- **3-10** "2일 연속 실패면 CTO 에스컬레이션"(`review-collect-status.mjs:40`)을 세는 코드가 없다. `review_collection_runs` 쿼리 하나. 1시간.

### 확인 불가
- Vercel 플랜 천장(Hobby/Pro) — 대시보드 설정이라 코드로 판정 불가.
- insight-loop 단계별 실패가 `agent_runs` 에 영속되는지 — `lib/insight/loop.ts` 본체는 이번 범위에서 안 읽음.
- Actions 스케줄 실제 발화율 — Actions 탭을 열어야 안다. `ops/state/` 로 CMO 만 09-08~09-14 연속 확인.

---

## 4. 마이그레이션 이력 대조 (`supabase/migrations/` vs 실제 DB)

방법: 로컬 정방향 마이그레이션 35파일(rollback 제외)에서 CREATE TABLE/ALTER ADD/INDEX/VIEW/FUNCTION/TRIGGER 를 파싱해 기대 객체 목록(테이블 34·컬럼 447·인덱스 49·뷰 1·함수 2·트리거 2)을 만들고, `information_schema`·`pg_indexes`·`pg_policies`·`pg_proc`·`pg_trigger` 를 한 번에 덤프(451컬럼·98인덱스·348제약)해 양방향으로 대조했다. 이력은 `supabase_migrations.schema_migrations` 를 MCP `list_migrations` 로 읽었다.

### 결론 3줄
- **스키마 내용은 일치한다.** 마이그레이션이 기대하는 객체 중 DB 에 없는 것 0건, DB 에 있는데 마이그레이션에 없는 테이블·컬럼 0건 (`post_performance` 는 뷰이고 `20260905000002` 가 만든다).
- **적용 이력은 불일치한다.** 로컬 정방향 38건(첫 파일 `20260816000001`) 중 DB 이력 테이블에는 **8건**만 있고 전부 `20260910` 이후다. 앞선 30건은 대시보드 SQL 에디터·MCP `execute_sql` 로 적용돼 기록이 없다.
- **9/15 `case_reader_axis` 는 적용됐지만 미기록.** `reader_problem`·`transfer_note`·`preconditions`·`transferability*` 컬럼과 CHECK 2개(`case_studies_reader_problem_format`, `case_moves_transferability_vocab`)가 DB 에 있다. 이력 마지막 행은 `case_review_note`(20260913170852).

### [치명적·해결됨 PR #97 — 마이그레이션 적용까지 완료] 4-2. RLS 정책 0개 + RLS 꺼진 테이블 7개가 브라우저 anon 키에 노출 (대조 중 발견, Supabase 어드바이저 경고)
- 문제: `pg_policies` 가 비어 있다(모든 테이블 정책 0). RLS 켜진 테이블은 anon 이 접근 못 해서 괜찮지만, RLS 가 **꺼진** 7개 — `post_replies`, `agent_runs`, `agent_run_steps`, `research_queue`, `pmf_assessments`, `pmf_assessment_moves`, `notion_sync_log` — 는 anon 키로 전 행 읽기·쓰기가 된다. 그 anon 키는 `lib/supabase/client.ts:5-7` 에서 브라우저 번들에 들어간다(`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Google 로그인 허용목록은 앱 라우트만 막고 PostgREST 직접 호출은 못 막는다.
- 왜 문제: `research_queue`(조사 대기열 정본)·`agent_runs`(실행 로그 정본)·`notion_sync_log`(발행 대기함 동기화)를 외부인이 조작할 수 있다. 각 테이블은 `20260907000003`·`20260908000001`·`20260908000002`·`20260908000003`·`20260909000001` 마이그가 "service_role 전용" 주석과 함께 만들었는데 RLS 를 켜지 않아 주석과 실제가 다르다.
- 고치면: 7개에 `ENABLE ROW LEVEL SECURITY` (정책 없이 켜면 anon 차단, service_role 은 그대로). 서버 스크립트는 전부 service key 라 영향 없음.
- 예상 작업량: 30분 (마이그 파일 1개) + 적용은 남헌. 어드바이저가 준 SQL:
  ```sql
  ALTER TABLE public.post_replies ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.research_queue ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.pmf_assessments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.pmf_assessment_moves ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.notion_sync_log ENABLE ROW LEVEL SECURITY;
  ```

### [중요·미착수] 4-1. 이력 테이블이 실제 적용을 대표하지 못한다
- 문제: 38건 중 8건 기록. 기록된 8건도 이름 규칙이 둘이다 — 5건은 `hackernews_enable` 처럼 접두 숫자를 뺐고 3건은 `20260911000002_analysis_angles_adaptation_suggestion` 처럼 파일명 전체다. 버전 번호도 파일의 `20260911000002` 가 아니라 적용 시각(`20260911101459`)이다.
- 왜 문제: `supabase db push`·`migration repair`·브랜치 기능이 이 표를 기준으로 "무엇을 아직 안 했나"를 판단한다. 지금 표로는 30건을 다시 적용하려 들거나(대부분 `IF NOT EXISTS` 라 무해하지만 seed INSERT 8건은 중복 위험), 반대로 9/15 건을 미적용으로 오판한다. 사람이 "적용됐나?"를 물을 때 답할 정본이 없다 — 이번 대조도 스키마를 전부 덤프해야 답이 나왔다.
- 고치면: 이력 표 하나로 적용 여부를 답할 수 있고, 새 마이그를 `apply_migration` 으로만 넣는 규칙이 성립한다.
- 예상 작업량: 2시간 — `supabase migration repair --status applied <version>` 30건 + 9/15 건 1건을 스크립트로 일괄 등록하고, 이름을 파일명 기준으로 통일. (DB 쓰기라 남헌 승인 후)

### [사소] 4-3. 케이스 초안 파일과 DB 가 1건 어긋난다
- `drafts/cases/` 33개 vs `case_studies` 32행. `hoka-specialty-retail-awareness-engine.json` 만 DB 에 없다(스테이징 안 됨). 마이그레이션 문제는 아니지만 대조 중 확인.

---

## 5. 레포-문서 버전 불일치

검사 범위: CLAUDE.md, `ops/roles/*.md`(4), `.claude/agents/*.md`(11), `docs/*.md`(12), `content/guides/queue-guide.md`, 워크플로 10개 헤더 주석, `supabase/migrations/*.sql` 전수, `vercel.json`, `package.json`, `.env.local` 키명. **일치 확인된 것**: 크론 5개 주석 vs 실제 시각 전부 일치, CTO 헌장의 `pmf_score` 부재·`not_run` CHECK·`cut=0.5`, §7.1 3상태 인용처, CG-1/CG-2, 병목 7종, posts.status 4값, COMMIT_PREFIXES 4개, 서브에이전트 env 화이트리스트. 아래는 어긋난 것만이다.

### [치명적·해결됨 PR #119 — 문서만. RBAC 실구현은 미착수] 5-1. "권한은 Supabase RLS 로 DB 레벨에서 강제"라는 헌법 주장 — 실제 RBAC 는 없다
- 문서: `CLAUDE.md:107-112` (super_admin/admin/member 3역할·`brand_access[]`), `:111` "화면 숨김 수준이 아니라 데이터 접근 자체를 차단"
- 실제: `lib/auth/policy.ts:4-7` "허용 목록 = 전원 같은 권한. §5 의 역할×브랜드 RBAC 는 아직 없다 … service_role 이라 RLS 를 우회한다". 마이그레이션 전체에 `CREATE POLICY` 0건. `super_admin`/`brand_access` 는 어디에도 없다.
- 왜 문제: 이 문서를 근거로 민감 재무(§113 "원가·순이익 원장은 member 비노출")를 DB 에 넣으면 그 순간 전원 열람. 4-2 의 RLS 미설정과 합치면 "정책 0 + 7테이블 RLS OFF + anon 키 브라우저 노출"이 실제 상태다.
- 고치면: §5 를 "현 상태: 허용목록 단일 권한 / 계획: RBAC" 로 분리. 0.5시간(문서). RBAC 실구현은 별건 8~16시간.

### [치명적·해결됨 PR #117] 5-2. 셋업 문서의 크론 시각이 폐기된 값
- 문서: `docs/insight-loop-setup.md:216` "`0 19 * * *` = KST 04:00", `:221` "04:00 을 고른 덕에 3시간 여유"
- 실제: `nightly-insight-loop.yml:23` `41 18 * * *`. 같은 파일 `:20-22` 가 "정각에서 옮겼다. 정각은 Actions 가 미루거나 건너뛴다"고 명시.
- 왜 문제: 정각 크론 미발화 사고(2026-09-01, `nightly-review-collect.yml:23-26`)의 교훈이 셋업 문서에만 없다. 이 문서 보고 새 워크플로를 만들면 사고 재현. 0.2시간.

### [치명적·해결됨 PR #118] 5-3. "PAT 을 만들지 않는다"는 문서 vs 실제 주입되는 `GH_PAT`
- 문서: `docs/insight-loop-setup.md:125-129` "GITHUB_TOKEN 은 넣지 않는다 … PAT 을 만들면 권한이 리포 밖으로 넓어지기만 한다"
- 실제: `build-check.yml:29` `GITHUB_TOKEN: ${{ secrets.GH_PAT }}` — main push·모든 PR 빌드의 `next build` env 로 들어간다.
- 왜 문제: 자격증명 인벤토리가 문서와 갈라지면 회수·회전 대상에서 빠진다. 문서가 "우리 리포엔 PAT 없음"이라고 믿게 만든다. 고치면: 시크릿 8종 실제 목록을 한 곳에 + GH_PAT 이 빌드에 왜 필요한지 판정. 0.3+0.5시간.

### [중요] 5-4. 존재하지 않는 훅이 typecheck 를 "강제한다"는 헌장
- 문서: `.claude/agents/implementer.md:42` "PostToolUse hook 이 typecheck 를 강제하므로"
- 실제: 리포에 `.claude/settings.json` 없음. 전역 settings 의 hooks 는 5종 전부 role-badge/role-status 호출 — PostToolUse 항목 자체가 없다.
- 왜 문제: §7.1 이 금지한 "초록불이 뜬다고 믿고 쌓기". 타입 오류는 `build-check.yml:24` 까지 가서야 터진다. 고치면: "훅 없음, `npx tsc --noEmit` 직접 실행" 또는 훅 실제 설치. 0.2/0.5시간.

### [중요] 5-5. 에이전트 헌장이 §7.1·§7.2 를 엉뚱한 파일로 지목
- 문서: `.claude/agents/implementer.md:34` "`methodology/content/00-gate.md` §7.1/§7.2"
- 실제: 그 파일에 §7 없음(섹션은 `## 0`, `Ⅰ~Ⅵ`, `U-`, `D-`, `X-`). 정의처는 `CLAUDE.md:150/:181`. `_principles.md:30,46` 은 올바르게 인용.
- 왜 문제: 구현 에이전트에게만 가장 자주 인용되는 두 원칙이 깨진 링크. 찾지 못하면 "해당 없음"으로 넘어간다. 0.1시간.

### [중요] 5-6. 폴더 구조 §6·코딩 규칙 §7 이 없는 경로를 지목
- 문서: `CLAUDE.md:145` "모든 외부 API 호출은 `/lib/adapters` 에 격리", `:124-130` `/lib/engine`·`/lib/ai`·`/components/ui`·`/components/charts`, `:135` "`/docs/CLAUDE.md`"
- 실제: 전부 없다. lib/ 는 agents·analysis·auth·cases·insight·onboarding·predictions·review·supabase·threads. 어댑터는 `lib/review/adapters/`, LLM 래퍼는 `lib/analysis/llm.ts`·`lib/insight/llm.ts` 두 벌, UI 는 `app/_ds`. CLAUDE.md 는 루트.
- 왜 문제: 금지 조항의 대상 디렉터리가 없어 새 어댑터마다 자리를 새로 정한다. 이미 LLM 호출이 두 벌. 0.5시간(문서).

### [중요] 5-7. 기술 스택 표가 실제 LLM 공급자와 다름
- 문서: `CLAUDE.md:28` "AI 인사이트/콘텐츠 | Anthropic API (Claude)"
- 실제: `lib/analysis/llm.ts:3` "LLM_PROVIDER=gemini (기본)", `.env.local` 에 `GEMINI_API_KEY` 있고 `ANTHROPIC_API_KEY` 없음. 인사이트 루프만 `claude-cli`(`lib/insight/llm.ts:25`).
- 고치면: "분석=Gemini 기본 / 인사이트 루프=claude-cli / 폴백=anthropic" 세 줄. 0.3시간.

### [중요] 5-8. 정기 작업 실행 환경 — GitHub Actions 가 헌법에 한 번도 안 나온다
- 문서: `CLAUDE.md:30` "정기 작업 | Vercel Cron / Supabase Edge Functions"
- 실제: 스케줄 작업 대부분이 Actions(cron 5개). `supabase/functions/` 는 `kakao-webhook` 1개뿐. 이관 사유는 `docs/insight-loop-setup.md:13-16`(300초 천장·3중 발화). §10.1 권한 경계 전체가 Actions 루프 전제인데 단어가 없다.
- 고치면: "장시간 배치=Actions / 짧은 라우트=Vercel Cron" 한 줄. 0.3시간.

### [중요] 5-9. "실시간 수집 금지·매일 새벽 1회" vs 매시 크론 3개
- 문서: `CLAUDE.md:34` "실시간 금지. 매일 새벽 1회 배치. 예외 명시"
- 실제: `vercel.json:8-10` match-posts·collect-metrics·collect-replies 매시. 예외 등록 없음. `queue-guide.md:12` 는 사용자에게 이미 "매시 정각"이라고 공표.
- 고치면: §2 에 "예외: Threads 지표 3종(매시, 근거 vercel.json)" 두 줄. 0.3시간.

### [중요] 5-10. 코드 주석 "Notion 에 안 보낸다"인데 정규식이 깨져 실제로 보낸다 (문서·코드 불일치 중 유일한 실동작 결함)
- 문서: `scripts/notion-push-digest.mjs:67` "앞머리 HTML 주석은 편집자용이라 Notion 으로 보내지 않는다"
- 실제: `:68` `.replace(/^s*<!--[sS]*?-->s*/, '')` — 백슬래시가 빠져 `\s`→`s`, `[\s\S]`→`[sS]`. 한글 주석 본문에 절대 매치되지 않는다. 결과: `queue-guide.md:1-4` 의 편집자 메모("selftest 가 코드 상수와 대조한다 — 마음대로 줄이지 마라")가 매일 아침 남헌용 Notion 설명란 맨 위에 나간다. `cmo-daily-selftest.mjs:1287-1307` 은 원본 파일을 읽어 검사하므로 못 잡는다.
- 고치면: 백슬래시 4개 복구 + selftest 1줄. 0.4시간.

### [중요] 5-11. 보고 포맷 정본이 참조하는 문서 2개가 없다
- 문서: `docs/report-diagnostic-format.md:5` `PRD-phase1-sales-kpi.md`, `:54` `seed-strategy-kpi.md`
- 실제: 둘 다 리포에 없음. 이 파일은 `_principles.md:80` 이 지목한 모든 역할의 보고 정본이고, 스코어보드·병목 판정 기준(달성률 70%, `is_delayed`)이 없는 문서에 있다.
- 고치면: 흡수하거나 "PRD 미작성" 명시. 0.5시간.

### [중요] 5-12. 보고 정본의 예시가 `_principles.md` 가 금지한 넓은 표
- `_principles.md:76` "넓은 표를 쓰지 않는다" vs `docs/report-diagnostic-format.md:85-91` 5열 표가 유일한 완성 예시. 두 지시가 정반대라 사실상 §5 가 무효. 표를 불릿 5줄로. 0.3시간.

### [사소] 5-13 ~ 5-20
- **5-13** `queue-guide.md:3` "2000자 넘으면 막는다" vs `notion-push-digest.mjs:71-77` 은 2000자씩 잘라 보낸다. 0.1시간.
- **5-14** `docs/insight-loop-setup.md:188` "판정 4단계"인데 `insight-headless-probe.mjs:77-103` 은 3종(viable/inconclusive/blocked). 0.05시간.
- **5-15** `CLAUDE.md:243-244` "`case_evidence` 도 `review_status='draft'`" — `20260906000001:187` case_evidence 에 그 컬럼 없음(무브 종속). 0.1시간.
- **5-16** `ops/roles/cmo.md:31,68-69` `references/threads-playbook.md`·`references/00-gate.md` — 루트에 `references/` 없음. 실물은 `.claude/skills/content-gate/references/`(사본)와 `methodology/content/`(정본). 전체 경로로. 0.1시간.
- **5-17** `SESSION-HANDOVER-2026-09-15-재설계.md:39` `node scripts/column-check.mjs …` 실행 안내 — 스크립트·`drafts/columns/`·가이드 3종 전부 PR #91 미머지라 main 에 없음. "(PR #91, 미머지)" 한 마디. 0.1시간.
- **5-18** `docs/insight-loop-setup.md:116-123` 시크릿 표에 `NOTION_API_TOKEN`/`NOTION_DATABASE_ID` 벌이 없다(`NOTION_API_KEY`/`NOTION_INSIGHT_DB_ID` 만). 실제 다수 경로(daily-cmo-loop·notion-feedback·review-collect·status-log 5곳)는 전자. 새 환경 셋업 시 Notion 푸시가 조용히 안 나간다(`daily-cmo-loop.yml:100-101` 자체 경고). 0.3시간 + 이름 통일 0.5시간.
- **5-19** `CLAUDE.md:256-257` "무인 루프 환경에 `THREADS_ACCESS_TOKEN` 자체가 없다. 정책이 아니라 구조다" — CMO 루프엔 정말 없지만(`daily-cmo-loop.yml:104-105`) Actions 시크릿 자체는 존재하고 `build-check.yml:32` 가 빌드 env 로 주입. "구조"가 아니라 "그 워크플로에 안 넣는 규율". selftest 로 강제 가능. 0.4시간.
- **5-20** `CLAUDE.md:46` ai-office "데이터: 없음" vs `ai-office/wrangler.jsonc:19` KV 바인딩 + `/api/report`. 0.1시간.

합계: 치명 3·중요 9·사소 8. 문서 수정만으로 닫히는 것 18건, 코드가 섞인 것 2건(5-10 정규식, 5-4 훅). 문서 측 약 4.5시간. 우선순위: 5-2 → 5-3 → 5-1 → 5-10 → 5-4·5-5.

---

## 6. (덤) 방법론 검증기가 main 에서 빨간 상태이고 아무도 안 돌린다
③-1 인코딩 수정(PR #94) 뒤에도 `py scripts/verify-methodology-archive.py` 는 실패 20건으로 exit 1 이다. 인코딩과 무관한 콘텐츠 문제라 코드를 고치지 않고 여기 적는다.
- **[중요] 아무도 안 돌린다.** CI(`build-check.yml`)도 `.githooks/pre-commit` 도 이 검증기를 호출하지 않는다(pre-commit 은 `manifest-methodology.py` 만). 그래서 빨간 채로 열흘 지났다. 고치면: pre-commit 또는 CI 에 한 줄. 15분.
- **[중요] 경로 검사 오탐 16건.** `threads-playbook.md` 가 9/14 #85 로 `methodology/content/` 안에 들어왔는데 리포 루트 기준 경로(`content/guides/voice-guide.md`, `ops/roles/cmo.md`)와 스킬 기준 경로(`references/pdp-gate.md`)를 쓴다. 검사기(`verify-methodology-archive.py:284-313`)는 아카이브 기준으로만 푼다. `pdp/04-decisions.md` 의 `HANDOVER-SEED.md`(실제는 `_setup/`)·`drafts/threads/...`·`prediction-schema.md`(아카이브 루트) 3건도 같은 류. 고치면: 검사기에 "리포 루트 폴백" 한 줄 또는 `SKIP_FILES` 에 `threads-playbook.md`. 30분. `methodology/` 는 어떤 역할도 수정 금지라 문서 쪽을 고치는 선택지는 없다.
- **[사소] 예측 코드 형식 4건.** `pdp/04-decisions.md` LOG-20260907-01~03 의 `because` 가 `H1`·`H3`(가설 코드)·`G-4`·`G-8`(게이트 코드)인데 `PRED_CODE_RE`(`:110`)는 `[RPC]-\d{2}` 만 받는다. 규약상 게이트는 무패딩 `G-` 가 맞으니 문서가 아니라 정규식이 좁다. 고치면: 정규식에 `G-\d{1,2}`·`H\d` 허용. 15분.
