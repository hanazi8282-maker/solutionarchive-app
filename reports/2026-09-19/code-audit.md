# 코드 감사 — 2026-09-19 (읽기 전용)

> 코드·git 손대지 않음. 범위: `app/`·`lib/`·`scripts/`·`proxy.ts`·`.github/workflows/`·`supabase/migrations/`. 제외: `.claude/worktrees/`·`node_modules/`·`ai-office/`·`graphify-out/`.
> 직전 감사(`reports/2026-09-15-code-audit.md`)에서 닫힌 치명 12건은 다시 적지 않았다. 남겨 둔 중요/사소 중 6건을 표본 재확인했고 결과는 §0 에 있다.
> 참조 수는 전부 grep 으로 셌다(스크립트 `dead.mjs`/`scan.mjs`, 세션 스크래치). 확인 못 한 것은 맨 끝 "확인 불가" 에 이유와 함께 있다.

> **[2026-09-19 세션 내 조치]** `[자동수정 가능]` 중 2-4 · 3-1 · 3-3 → PR #160 머지 / 2-1 · 2-2 → PR #161 머지(32개 배선, CI 1m04s 통과) / 2-5 · 2-6 · 2-7 → PR #162. 나머지는 `ceo-staff-session.md` "STEP 3" 절의 사람 판단 목록. npm audit: critical 1 · high 3(next 16.2.7 계열 + js-yaml, 의존성 변경이라 미적용).

## 심각도 요약 3줄
1. **치명 2건** — 자율 VOC 발굴 엔진이 다나와 검색을 robots 판정 없이 때린다(리뷰 수집 트랙이 fail-closed 로 막는 바로 그 규칙을 우회, §7.1 마지막 항목 위반). 그리고 발행 파이프라인 크론 3개는 여전히 건 단위 실패를 200 으로 돌려 Vercel 이 실패를 못 본다(직전 감사 2-7/3-7 그대로).
2. **중요 14건** — 직전 감사에서 "남겨 둔" 중요 항목 표본 6건 중 5건이 그대로 열려 있고 1건은 반만 닫혔다(§0). 새로 찾은 것: selftest 54개 중 34개가 어떤 워크플로에도 배선돼 있지 않다(CG 게이트 `case-pipeline-selftest` 포함). `extract` 상태 라우트가 조회 실패를 `aspects_count: 0` 으로 접는다. `thread_posts`·`sales_fact`·`conversions` 는 마이그레이션 99개 어디에도 없는데 그 테이블을 읽는 라우트 2개가 살아 있다.
3. **사소 13건** — 죽은 export 6개(`callLlm`·`callLlmJson`·`scoreEntry`·타입 3개), 어떤 워크플로·문서·코드도 부르지 않는 스크립트 14개(그중 selftest 9개는 "테스트가 있다"는 착시만 준다), Supabase 클라이언트를 정본(`lib/supabase/server.ts`, 게이트웨이 재시도 포함) 우회로 만드는 스크립트 3개, KST 변환 4벌.

## 0. 직전 감사 잔여 항목 표본 재확인 (6건)
- 2-5 notion-push-digest — **반만 닫힘**. posts 조회 실패는 이제 exit 2(`scripts/notion-push-digest.mjs:168`). 그러나 `:240` `const { data: moves }` 는 여전히 error 를 안 받아 조회 실패가 "등급 없음" 으로 발행되고, `:308` 은 `skipped.length > 0` 이어도 `exit 0`.
- 2-6 review-collect 실행 로그 마감 — **열림**. `scripts/review-collect.mjs:246-261` UPDATE 결과를 받지 않는다(`await supabase.from(...).update(...)` 단독).
- 2-7/3-7 Vercel 크론 부분 실패 200 — **열림**. `collect-metrics/route.ts:232-243`, `collect-replies/route.ts:154-164`, `match-posts/route.ts:298-299` 전부 `ok: failed.length === 0` 을 본문에만 싣고 status 는 200.
- 2-8 CMO 루프 스테이징 매니페스트 — **열림**. `scripts/cmo-daily.mjs:1428` `catch { return [] }`, `:1484` 동일.
- 2-9 수동 발행 라우트 — **열림**(단, §2-3 참고: 테이블이 없어 실제로는 도달 불가). `app/api/threads/publish/route.ts:70-76`·`:81-83` UPDATE 결과 미확인.
- 3-6 review-collect fatal → health 미반영 — **열림**. `scripts/review-collect.mjs:197`(fatal 잡음) 이후 `:204-265` 어디에도 `updateSourceHealth` 호출 없음. `lib/review/runner.ts:554` 는 정상 종료 경로에서만 부른다.

## 1. 치명 (2)
- 1-1 · 발굴 엔진이 다나와 검색을 robots 판정 없이 요청 · `scripts/discovery-run.mjs:76-95`, `lib/discovery/probe.ts:30-31` · `fetchText()` 가 `search.danawa.com/dsearch.php` 를 `DANAWA_CRAWL_DELAY_MS = 10_000`(손으로 잰 상수) 만 지키고 바로 GET. `lib/review/robots.ts::robotsVerdict` 나 `runner.ts` 의 3상태 판정을 전혀 거치지 않는다(`grep robots scripts/discovery-run.mjs` → 주석 2줄뿐). UA 도 리뷰 수집기(`solutionarchive-review-collector`)와 다른 `solutionarchive-discovery/0.1` → robots 가 바뀌거나 `/dsearch.php` 가 Disallow 여도 매일 02:13 KST 크론이 계속 간다. §7.1 "읽지 못한 규칙을 허용으로 해석하지 마라" 위반이자 §10.1 발굴 권한의 전제 조건 흔들림 · 60분(runner 의 `RobotsGate` 재사용) · `[사람판단필요]`
- 1-2 · 발행 크론 3개 건 단위 실패가 200 · `app/api/threads/collect-metrics/route.ts:232-243`, `collect-replies/route.ts:154-164`, `match-posts/route.ts:298-299` · 테이블 단위 실패는 500 인데 루프 안 실패(`failed[]`)는 `ok:false` 만 싣고 200 → Vercel 크론 대시보드·cron-watchdog 둘 다 초록. collect-metrics 는 버킷 시각이 지나면 소급 불가 · 30분(`failed.length === targets.length ? 500 : 207`) · `[사람판단필요]`(발행 로직·알람 기준)

## 2. 중요 (14)
- 2-1 · selftest 54개 중 34개가 CI 어디에도 없음 · `.github/workflows/build-check.yml:23-65`(15개 배선) + 다른 워크플로 5개(cmo-daily·discovery·review-hackernews-enrich·notion-pull-feedback·notion-status-log) · 배선 없는 34개: agents-status, analyze-angle-adaptation, analyze-angle-validate, analyze-danawa-url, case-match, **case-pipeline**(CG-1/CG-2 게이트 유일한 테스트), case-review-rules, failed-angles-sync, insight-cli, insight-kakao, insight-patterns, kakao-proxy, onboarding-quiz, review-82cook/appstore/bobaedream/brunch/clien/damoang/danawa/fmkorea/hackernews/naver-blog/purge/theqoo/todayhumor/tumblbug, review-health, score-predictions, strategy-principles-sync, threads-collect, threads-replies, voice-check → 깨져도 초록불(직전 감사 6절 "아무도 안 돌린다" 와 같은 모양) · 20분(build-check 에 줄 추가, 네트워크 없는 것만) · `[자동수정 가능]`
- 2-2 · `discovery-selftest` 는 PR 이 아니라 밤 크론에서만 돈다 · `.github/workflows/nightly-discovery.yml:77` · 게이트 회귀가 머지 뒤 첫 실행에서야 드러난다 · 5분 · `[자동수정 가능]`
- 2-3 · 존재하지 않는 테이블을 읽는 라우트 2개 · `app/api/threads/publish/route.ts:50`(`thread_posts`), `app/api/threads/sync-conversions/route.ts:32,53,61`(`sales_fact`·`thread_posts`·`conversions`) · `supabase/migrations/` 99개 파일에 세 테이블 생성문 0건 → publish 는 항상 `fetchErr` 500, sync-conversions 는 error 를 안 받아 PGRST205 를 `{ ok:true, matched:0 }` 로 위장(코드 주석 `:27-30` 이 스스로 인정). publish 는 §10 "자동 발행 API 사용 안 함" 과도 어긋나고 `docs/insight-loop-setup.md:215` 는 "실제로 발행한다" 고 적어 문서까지 어긋남 · 30분(삭제) · `[사람판단필요]`(발행 로직·문서 정합)
- 2-4 · extract 상태 조회가 실패를 0건으로 접음 · `app/api/analyze/extract/route.ts:440-448` · `const { count }` 만 받고 `aspects_count: count ?? 0` → 조회 실패가 "속성 0개" 로 화면(`review/page.tsx`)에 간다. §7.1 "비었을 때와 못 읽었을 때를 가르라" 위반 · 10분 · `[자동수정 가능]`
- 2-5 · 앵글 목록의 속성 조인 실패가 조용히 배지 누락 · `app/api/analyze/angle/route.ts:732-736` · `const { data: aspects }` error 미수신 → `aspect_name/quadrant` 전부 null 로 내려가 화면은 "사분면 없음" 으로 그린다 · 10분 · `[자동수정 가능]`
- 2-6 · 어드바이저 속성 조회 실패 → 설명 누락 · `app/api/analyze/advisor/route.ts:76-82` · error 미수신, `aspectName=null` 로 매칭 품질만 조용히 떨어짐 · 10분 · `[자동수정 가능]`
- 2-7 · review 저장 뒤 상태 재조회 실패 → `status:null` · `app/api/analyze/review/route.ts:320-325` · `const { data: current }` error 미수신, 실패와 "상태 없음" 구분 불가 · 10분 · `[자동수정 가능]`
- 2-8 · notion-push-digest 무브 조회 실패 + 스킵 있어도 exit 0 · `scripts/notion-push-digest.mjs:240`, `:308` · §0 2-5 참조. `cmo-daily.mjs` 의 `if (notion.code !== 0)` 배선이 영영 안 걸린다 · 30분 · `[자동수정 가능]`
- 2-9 · review-collect 실행 로그 마감 UPDATE 미확인 · `scripts/review-collect.mjs:246-261` · §0 2-6 참조. 마감 실패 → 다음 실행이 `interrupted` 로 덮어 거짓 기록 · 15분 · `[자동수정 가능]`
- 2-10 · review-collect fatal 소스가 health 에 안 남음 · `scripts/review-collect.mjs:197-265` · §0 3-6 참조. 매일 밤 예외로 죽는 소스가 `/agents` 에 `ok` 로 보임 · 30분(fatal 분기에서 `updateSourceHealth(key,{health:'broken'})`) · `[사람판단필요]`(health 판정 기준)
- 2-11 · CMO 루프 스테이징 매니페스트 깨지면 "대기 0건" · `scripts/cmo-daily.mjs:1428`, `:1484` · §0 2-8 참조 · 30분 · `[자동수정 가능]`
- 2-12 · 발굴 게이트 미고정 분기 6개 · `lib/discovery/candidate.ts:182-207`(judge), `lib/discovery/probe.ts:185-188`, `scripts/discovery-run.mjs:344-350,472-484` vs `scripts/discovery-selftest.mjs` · selftest 가 문자열로 고정하지 않은 분기: ① `minHits > maxHits`(설정 역전 → unverified), ② hits 는 충분한데 `product_ref` 못 만듦(→ unverified, grep `product_ref` 0건), ③ 밴드 걸침 `lo<min||hi>max`(→ unverified), ④ 다나와 상품은 있는데 리뷰수 마커 0(→ hits null, grep `리뷰수 마커` 0건), ⑤ `source_disabled` 판정(grep 0건), ⑥ 전건 unverified 시 exit 1. ①③ 은 "채택" 을 잘못 내는 쪽 경계다 · 40분 · `[자동수정 가능]`
- 2-13 · 리뷰 러너 미고정 분기 · `lib/review/runner.ts:215-222`(`proceedHosts` 우회), `:424-435`(`disallowed` 분기) vs `scripts/review-runner-selftest.mjs` · grep `proceedHosts|bypass` 0건, `disallowed` 0건 → "사이트가 막았다" 와 "우리가 못 읽었다" 를 다른 문장으로 남긴다는 `:424-428` 주석의 약속을 테스트가 안 지킨다. `robots-selftest` 는 순수 판정만 본다 · 30분 · `[자동수정 가능]`
- 2-14 · CG 게이트 수치 정규식 구멍 · `lib/cases/publish-gate.ts:186` `NUMERIC_CLAIM = /\d+\s*(%|배|억|만원|명|[xX])/` · "1,200만 명"·"3천억"·"$4M"·"40%p"·"5개월"·"2배 이상"→통과, "2024년" 은 selftest 가 통과로 고정(`case-pipeline-selftest.mjs:613`) 하나 "40 만원"·"1억 2천만 원" 은 안 잡힘. 등급 D 초안의 유일한 숫자 방어선 · 30분 · `[사람판단필요]`(게이트 기준)

## 3. 사소 (13)
- 3-1 · 죽은 export 2개 — LLM 래퍼 · `lib/analysis/llm.ts:306` `callLlm`, `:351` `callLlmJson` · 리포 전체 참조 1건(정의)씩. 실사용은 `callLlmWithModel`/`callLlmJsonWithModel`(`angle/route.ts:27`, `extract/route.ts:10`) · 5분 · `[자동수정 가능]`
- 3-2 · 죽은 export — `scoreEntry` · `lib/predictions/score.ts:283` · 참조 1건(정의). `score-predictions.mjs:21` 은 `scoreOne·tallyByRule·wilsonLower·ruleAction` 만 씀 · 5분 · `[자동수정 가능]`
- 3-3 · 죽은 타입 3개 · `lib/analysis/types.ts:80` `AnalysisProject`, `:94` `AnalysisInput`, `lib/onboarding/quiz.ts:28` `OptionSource` · 자기 파일 포함 참조 0 · 5분 · `[자동수정 가능]`
- 3-4 · 어디서도 안 부르는 스크립트 14개 · `scripts/{analyze-danawa-url,failed-angles-sync,onboarding-quiz,review-brunch,review-clien,review-fmkorea,review-hackernews,review-theqoo,review-todayhumor,strategy-principles-sync,voice-check}-selftest.mjs` + `hn-firebase-ab-probe.mjs`·`link-decision-log.mjs`·`seed-angles-fixture.mjs`·`threads-drafts-save.mjs` · 코드·워크플로·`docs/`·`reports/`·`ops/`·`CLAUDE.md`·`package.json` 참조 0. selftest 9개는 2-1 의 부분집합이되 문서에도 없어 "손으로도 안 돌린다" 쪽 · 각 5분(배선 또는 삭제) · `[자동수정 가능]`
- 3-5 · Supabase 클라이언트 정본 우회 3곳 · `scripts/review-purge.mjs:39`, `scripts/score-predictions.mjs:98`, `scripts/link-decision-log.mjs:46` · `@supabase/supabase-js` `createClient(url,key)` 직접 호출 → `lib/supabase/server.ts:10-31` 의 게이트웨이 재시도(`fetchWithGatewayRetry`)를 안 탄다. 다른 스크립트 26곳은 `../lib/supabase/server.ts` 를 쓴다(주석은 정본을 명시하지 않음) · 10분 · `[자동수정 가능]`
- 3-6 · KST 변환 4벌 · `scripts/notion-status-log.mjs:43` `kstDate(now)`(정본이라고 `cmo-daily.mjs:1687` 주석이 지목) / `lib/review/adapters/velog.ts:172` 같은 이름 `kstDate(iso)` 다른 시그니처 / `lib/agents/status.ts:133` `(hh+9)%24` 수기 산식 / 페이지 5곳 각자 `Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'})`(`cases:67`·`columns:43`·`discovery:60-61`·`agents:238`·`analyze:54`) · 30분(`lib/kst.ts` 한 벌) · `[자동수정 가능]`
- 3-7 · 세션 클라이언트 2벌 · `lib/auth/session.ts:18`, `proxy.ts:21` · 둘 다 `createServerClient` + 쿠키 플러밍. 주석(`session.ts:1-2`)이 "proxy 는 요청 쿠키를 직접 다뤄야 해서 따로" 라고 의도 명시 → 정본 표시는 있음, 판정 로직은 `policy.ts` 한 벌. 기록만 · 0분 · `[자동수정 가능]`
- 3-8 · 등급 산식 정본 표시 양호 · `lib/cases/draft.ts:211` `factCheckGrade`·`:332` `gradeMove` 가 정본, `publish-gate.ts:4-8` 주석이 이를 지목, `case-review.mjs:413` regrade 는 lib 를 import. 중복 아님 · 0분 · 기록
- 3-9 · N+1 — sync-conversions · `app/api/threads/sync-conversions/route.ts:40-70` · 주문 1건당 `thread_posts` SELECT + `conversions` UPSERT, 7일치 `orders` 상한 없음(`.limit` 없음). 2-3 으로 삭제되면 소멸 · 0분 · `[사람판단필요]`
- 3-10 · N+1 — 인사이트 루프 패턴 갱신 · `lib/insight/loop.ts:391-460`(`analyzed` 1건당 SELECT+UPDATE/INSERT+가설 INSERT ≤4쿼리), `:500-590`(패턴 1건당 ≤3쿼리) · 상한 `ANALYZE_LIMIT`(env, 기본 10, `:85`)·`KNOWN_KEY_LIMIT` 60(`:94`) → 최악 ~220쿼리/밤, 밤 1회 Actions 라 허용 범위. `must()` 로 error 는 전부 잡음 · 0분 · 기록
- 3-11 · N+1 — 크론 루프 · `collect-replies/route.ts:86-130`(대상 글당 SELECT 1 + UPDATE n), `match-posts/route.ts:189-240`(매칭 1건당 UPDATE), `analyze/review/route.ts:210-232,290-300`(속성 1건당 UPDATE) · 값이 행마다 달라 배치 불가한 UPDATE 가 대부분. collect-replies 의 `existRows` 만 `in('post_id', ids)` 로 한 번에 당길 수 있다. 상한: 대상 글 수(`targets`, 최근 창 안 발행글 ≈ 수십) · 20분 · `[자동수정 가능]`
- 3-12 · TODO 4건 전부 유효 · `app/api/onboarding/quiz/route.ts:29`(SSO 후 user_id — 인증은 들어왔으나 quiz 는 익명 공개 경로라 여전히 미채움), `app/api/threads/sync-conversions/route.ts:27`(2-3 과 같은 건), `app/onboarding/quiz/page.tsx:18`(같은 사유), `lib/supabase/server.ts:34`(service_role → 세션 RLS 전환 미완, `lib/auth/session.ts:4-5` 주석이 확인) · 0분 · 기록
- 3-13 · 에러 삼킴 — 검증 스크립트 · `scripts/case-pipeline-verify.mjs:164,238`, `scripts/predictions-migration-verify.mjs:135,155`, `scripts/review-migration-verify.mjs:126` 프로브 행 DELETE 결과 미확인 → 프로브 잔재가 남아도 "정리됨" 으로 끝남. `case-review.mjs` 의 `await supabase.from(...)` 13곳은 `q()`/`Promise.all` 래퍼 안이라 제외 · 10분 · `[자동수정 가능]`

## 4. 항목별 소견 (요구 항목 1~7 대응)
- **1 죽은 코드**: 3-1·3-2·3-3·3-4. 컴포넌트는 전부 참조 있음(`ProgressBar` 7, `Badge`·`Notice`·`StatTile` 다수). `lib/threads/publish.ts` 는 2-3 의 publish 라우트만 부른다 — 라우트를 지우면 파일째 죽는다. 도달 불가 분기: `sync-conversions/route.ts:37` 이후 전부(테이블 부재).
- **2 중복 로직**: 3-5·3-6·3-7·3-8. robots 판정은 `lib/review/robots.ts` 한 벌이고 어댑터 16개는 주석으로만 언급(중복 아님) — 문제는 중복이 아니라 **미사용**(1-1). 3상태 판정은 `lib/agents/status.ts::classify`·`lib/threads/unlinked-status.ts`·`lib/cases/backfill.ts` 가 각자 문자열("확인 불가") 을 만든다 — 타입은 안 겹치고 문구만 같아 중복으로 안 셌다.
- **3 N+1**: 3-9·3-10·3-11. `scripts/case-review.mjs:488-522`(regrade: 케이스당 evidence SELECT + 무브당 UPDATE, 케이스 ~40) 은 사람이 돌리는 CLI 라 제외.
- **4 에러 핸들링**: (a) 2-4·2-5·2-6·2-7·2-8·3-13, (b) 2-4·2-8·2-11 + §0 항목들, (c) 클라이언트 4페이지(`angles`·`review`·`new`·`quiz`)는 `res.json().catch(()=>({}))`+`!res.ok`+`catch` 3단 전부 있음 — 공백 없음, (d) 사용자 노출 메시지는 전부 한국어(`app/**` grep 결과 영어 노출 0건). 로그는 `[analyze/review]` 등 영어 접두 + 한국어 본문 혼용이나 §7 "로그는 영어" 는 이미 리포 전체가 안 지키고 있어 별도 항목으로 안 잡았다.
- **5 테스트 공백**: (a) 2-12·2-2, (b) CG-1 은 귀속 문구 8종·"업계에 따르면" 부정·B/A 비대상·혼합·0건 고정(`case-pipeline-selftest.mjs:430-463`), CG-2 는 단위 7종·띄어쓰기·연도 통과·비대상·혼합 고정(`:599-623`) — 남은 구멍은 2-14 의 정규식 범위와 `NAMED_WINDOW`(25자) 경계, `attributionHint()` 미검증. 그리고 이 파일 자체가 2-1 로 CI 밖. (c) robots 순수 판정은 촘촘(`review-robots-selftest.mjs` 45/28/9/15회 호출, 403/404/Crawl-delay/ReDoS 포함), 러너는 2-13. `review-runner-selftest` 가 `MAX_PAGES_PER_TARGET`·`STALE_STREAK_TO_STOP` 은 다루나(`stale` 4, `cursor` 17) §7.2 의 "커서 미전진 1,2,2,2" 시나리오 문자열은 0건 — 안전장치가 걸린 실행을 정상으로 읽지 않는지는 여전히 사람 눈에 의존. 미배선 목록은 2-1.
- **6 TODO**: 3-12, 4건 모두 유효.
- **7 UI**: 서버 페이지 7개(`agents`·`analyze`·`cases`·`columns`·`dashboard`·`discovery`·`login`) 전부 `res.error || !res.data` 분기 → "확인 불가" Notice, 테이블 부재(42P01/PGRST205)는 별도 분기. `dashboard/page.tsx:45,167-169` 는 null/[]/[..] 3상태를 주석으로 못박음. 클라이언트 4페이지는 `role="status"` 로딩 + 에러 Notice. `<table>` 0개, 고정 px 폭 0개, `StatGrid` 는 `minmax(min(100%,…))`(`Shell.tsx:140`), 상단 nav 는 `overflowX:auto`(`AppNav.tsx:69`). 접근성: DS 컨트롤 15곳 전부 `id+htmlFor` 또는 `aria-label`, 아이콘 전용 버튼 0개, Badge 는 텍스트 동반. **375px 에서 깨질 후보로 남는 것**: `app/columns/page.tsx:58`·`post-review-form.tsx:71` `<pre>` 는 `pre-wrap+overflowWrap` 이라 안전; `AppNav.tsx:110` 사용자 이메일 `maxWidth:220` 은 `overflow:hidden` 있음. 찍을 만한 결함 없음 — 유일한 지적은 `agents/page.tsx:64` `steps = st.error ? [] : …` 가 실패를 빈 배열로 접되 `:78` 라벨에 "스텝 확인 불가" 를 붙여 화면상 구분은 됨(코드 냄새만).

## 확인 불가
- `search.danawa.com/robots.txt` 가 `/dsearch.php` 를 실제로 허용하는지 — 네트워크 요청은 감사 범위 밖. 1-1 은 "판정 없이 간다" 는 코드 사실만 적었다.
- `thread_posts`·`sales_fact`·`conversions` 가 **실 DB** 에 있는지 — Supabase MCP 연결 실패(CONNECT_TIMEOUT) + 서브에이전트 DB 접근 금지. 2-3 은 마이그레이션 파일 기준.
- `review-runner-selftest.mjs` 가 `looksLikeMarkup`(HTML 본문) 경로를 고정하는지 — 파일 안 grep `looksLikeMarkup|HTML 본문` 0건이나 build-check.yml 주석(`:56-59`)은 "403/404/HTML 본문" 을 포함한다고 적음. 다른 문자열로 고정했을 수 있어 2-13 에 넣지 않았다.
- 3-4 의 스크립트 14개를 사람이 `node scripts/...` 로 손수 돌리는 관행이 있는지 — 문서·워크플로 기준 0건이라는 사실만.
- 3-10 의 실제 쿼리 수 — `INSIGHT_ANALYZE_LIMIT` 환경값을 Actions 시크릿에서 못 본다. 기본값 10 기준 추정.
- `npm audit` — 지시대로 돌리지 않음.
