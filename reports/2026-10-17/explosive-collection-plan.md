# v71ad §5 폭발적 수집 방안 — CTO 실행 보고 (2026-10-17)

- 기준: origin/main a2a0c76에서 출발. DB는 접근하지 않았다(서비스키·MCP 미사용).
- 외부 실측: 무토큰·무키 공식 API만 썼다. GitHub 약 30요청, Stack Exchange 9요청, iTunes 2요청, robots 4건이며 전부 2xx 또는 정상 404/400이었고 차단 신호는 0건이다.
- 참고 실측(CEO-staff 2026-10-17 DB 조회):
  - 앱스토어: 타깃 155·16,216건이고, 0건 타깃이 64개(41%)다.
  - 구글 플레이: 121·3,790건이고, 활성 중 7일 방문 0인 타깃이 16개다.
  - HN: 83·38,465건이고, 활성은 2개뿐이다.
  - youtube: 19·10,554건이다.
  - 활성 타깃은 모두 합쳐 109개다.
- 숫자에 [추정]이 붙은 것은 실측이 아니다. 근거 수치를 옆에 적었다.

## (a) 증분형 시계 천장 — PR #558 (머지 9a31b0c)

- 바뀐 것:
  - `REVIVE_TOTAL_PER_RUN`(40)은 리포 변수 `TARGET_REVIVE_TOTAL_CEILING`, `REVIVE_PER_RUN`(6)은 `TARGET_REVIVE_PER_SOURCE`로 바꿨다. 둘 다 기본값은 현행이고, 잘못된 값이면 기본값으로 가며, 코드 하드 천장은 200이다.
  - `TARGET_CLOCK_INCREMENTAL_MAX`가 천장을 넘으면 이제 `⚠️ 되살리기 상한 경고` 한 줄이 로그와 job summary에 남는다. 지금 값 20은 천장 40 안이라 경고가 뜨지 않는다.
  - 새 로그 `증분형 건너뜀 사유: revisit_not_due N, expected_low M, …`를 추가했다. 상한을 올려도 늘지 않는 이유를 이 한 줄로 본다.
- 되살림 쿨다운이 정해지는 곳(코드 확인):
  - `lib/review/target-supply.ts` `revisitDays`: `clamp(3 ÷ λ × 2^consecutive_empty, 3, 14)`일. λ = min(적재 수 ÷ 타깃 나이, 1 ÷ (마지막 방문 − 최신 리뷰)).
  - 증분형은 러너가 연속 0건 3회(글)·30회(게시판)에서 닫는다(`runner.ts` `closeAfter`). 그래서 되살림 후보는 항상 ce≥3이고, `2^ce`가 8배 이상 붙어 λ < 1.7건/일이면 **전부 14일**이 된다. 지난 실측의 `revisit_not_due`가 큰 것은 이 지수 때문이다.
  - `expected_low`(λ × 경과일 < 1)는 조용한 타깃 자체의 문제다. 간격을 줄이면 경과일이 줄어 오히려 더 걸린다.
  - **숨은 세 번째 천장**: `planRevive`의 `queue_full`이 시계 되살림을 소스마다 `tpr − active`개로 묶는다. 증분형 상한을 아무리 올려도 Σ(회당 타깃 수 − 현재 활성)를 넘지 못한다. 사유 로그에 `queue_full`이 보이면 램프 `targets_per_run`이 병목이다.
- 소스별 간격 변수: `TARGET_REVISIT_SCALE` = JSON `{"clien":0.5}`.
  - 배율 범위는 [0.25, 1]이고 줄이는 방향만 허용한다. 하한은 1일이며 기본은 미설정(배율 1)이다.
  - ⚠️ **CLAUDE.md §10.1은 "재방문 간격 3~14일"이라고 적고 있다.** 이 변수를 설정하면 3일 아래로 갈 수 있다. 남헌 확인 또는 문구 개정 전에는 설정하지 말 것(아래 충돌 목록 1).
- 단계 상향 절차(변수만 바꾼다):
  - 20 → 40은 지금 천장 안이다.
  - 60·100·200은 `TARGET_REVIVE_TOTAL_CEILING`을 먼저 같은 값으로 올린다.
  - 올리는 조건은 두 가지다: 직전 단계 슬롯들의 `blocked_responses` 합이 0이다. 그리고 로그 `증분형 상한 X, 대상 후보 M, 실제 되살림 K`에서 K가 X에 닿았다. K < X면 올리지 않고 사유 로그를 본다.
  - 로그 확인: `gh run view <id> --log | grep -E "되살리기 상한 경고|증분형 상한|증분형 건너뜀 사유"`
- 되돌리기: 변수를 삭제하면 현행 동작으로 돌아간다. 코드는 #558 revert.

## (d) 공식 API 소스 어댑터 — 코드 PR #563 (머지 eb01790) · 마이그 PR #564 (미적용·머지 안 함)

- GitHub Issues — `github_issues`
  - 무토큰 REST Search(`/search/issues?q=repo:<r> is:issue`)를 쓴다.
  - 목록 API(`/repos/<r>/issues`)는 PR이 섞인다. twenty는 30/30이 PR이었고, kimai 27/30·postiz 25/30이 PR이었다. 그래서 Search를 택했다.
  - 한도는 무토큰 Search 분당 10회이고, 간격 7초면 분당 8.6회다. 한도 초과 403·429·HTML은 요청 1건 뒤 **차단**으로 멈춘다. quotaMarkers는 일부러 두지 않았다.
  - 거름: PR·봇·메인테이너(OWNER/MEMBER/COLLABORATOR) 이슈. 작성자는 미저장, @멘션은 `@user`로 바꾸고, 코드 블록·템플릿 주석은 걷어낸다.
  - 타깃 16개(영역 ①~⑤ 오픈소스 도구, 실측 사용자 이슈/일):
    - ① meetily 0.48 · vexa 0.94 · jitsi-meet 0.54
    - ② twenty 4.37 · frappe-crm 0.52 · espocrm 0.53 · krayin 0.38 · suitecrm 0.33
    - ③ postiz 0.93 · mautic 8.35(5일 폭주일 수 있음) · listmonk 0.69
    - ④ kimai 0.36 · frappe-hrms 0.84
    - ⑤ languagetool 0.24 · appflowy 1.44 · affine 1.66
  - 예상: 하루 약 22건 유입 [추정, 최근 50건 간격 기준]. 첫 실행 백필은 타깃당 ≤250건으로 최대 약 4,000건 1회다.
  - **정직한 한계**: 상당수가 사용 중 버그·설치 문제라 T2 관련 비율이 낮을 수 있다. 영역 ①~⑤의 주류 상용 도구(Otter·Fireflies·HubSpot·Grammarly 등)에는 공개 트래커가 없다. 그래서 이 소스는 "오픈소스 대안 사용자의 목소리"이지 주류 고객의 목소리가 아니다.
  - 제외: hyprnote(→ anarlog, 이슈 꺼짐), orangehrm(0.06/일), 라이브러리·SDK 저장소.
  - Discussions는 GraphQL 전용이고 GraphQL은 인증이 필수라 무토큰 설계로는 **안 했다**.
  - 라벨: `tos_status=unverified`다. GitHub AUP §7은 연구(오픈 액세스)·아카이브만 허용 용도로 적고 상업 분석은 명시하지 않는다. 그 밖에 `quote_policy=none`, `robots_status=not_applicable`(api.github.com robots 404)이다.
- Stack Exchange — `stackexchange`
  - API 2.3 `/questions?filter=withbody`, 무키(IP당 하루 300)다. 스로틀 400·403·429는 첫 응답에서 멈춘다.
  - **효과가 매우 낮다**: 90일 질문 수가 superuser microsoft-teams 2 · zoom 1 · webapps google-meet 2 · softwarerecs note-taking 0 · microsoft-word 5다. 기대치는 하루 0.1건 안팎 [추정]이다.
  - stackoverflow는 개발자 질문이라 제외했다. 마이그는 **등록만(enabled=false, 타깃 0)** 한다.
- YouTube 댓글: 어댑터가 이미 있다(`commentThreads`, owner override 경계 안). 코드 변경은 없다. 타깃 확대 방법은 아래 (f)-4에 적었다.

## (e) 앱스토어 같은 개발사 앱 — PR #565

- `lib/review/appstore-same-developer.ts` 한 파일이다. 앵커 앱에서 iTunes lookup으로 artistId를 얻고, 같은 개발사 앱 목록을 받아 후보 생성기 `Candidate[]`(generator `similar_app`)로 넘긴다. `lib/discovery/*`는 수정하지 않았다.
- robots(itunes.apple.com, 실측을 `robots.ts`로 판정):
  - `/lookup?id=`(루트)는 allowed다.
  - `/<cc>/lookup?`·`/search*`·`/*/rss/*`는 disallowed다.
  - 루트 형태만 쓰고, 실행 전에 다시 읽어 allowed가 아니면 0요청이다.
- 안전장치: 4초 간격(Apple 안내 분당 약 20회), 실행당 40요청, 403·429·5xx·HTML이면 즉시 중단.
- 하지 않은 것과 이유:
  - 앱스토어 웹의 'You Might Also Like'·개발자 페이지 스크래핑은 하지 않았다. apps.apple.com robots는 `/api/*`·`/v1/*`·`*/search?*`만 막는다. 하지만 Apple 웹사이트 이용 약관이 "deep-link, page-scrape, robot, spider or other automatic device … to access, acquire, copy or monitor any portion of the Site"를 금지한다.
  - '함께 설치한 앱'은 공개 API 경로가 없다.
- 판단 항목:
  - Search API 안내의 용도는 "웹사이트에 검색 필드를 넣어 스토어 콘텐츠를 홍보"다. 우리 용도는 그 밖이다.
  - robots가 국가 경로 lookup을 막은 취지와도 가깝다.
  - 그래서 무인 루프에는 연결하지 않았다(호출 스크립트 없음).
- 효과 [추정]: 앱스토어 앵커가 고유 앱 약 50개(타깃 155 ÷ 국가 창문 약 3)라면 2요청 × 50 = 100요청 1회로 후보 수십 개를 얻는다. Canva 실측은 개발사 앱 3개 중 장르·평점 필터 통과 1개였다. 대형 SaaS 개발사는 앱이 1~3개라 수확이 작다.

## (f) CC 자체 아이디어 (설계만, 구현은 보고 후)

### f-1. 수확 순위로 방문 순서·예산 재배분
- 무엇: `listDueTargets` 순서를 "같은 소스 안에서 total_collected ÷ 타깃 나이(일)가 큰 순"으로 바꾼다. 하루 예산이 모자라는 소스(구글 플레이: 활성 중 7일 방문 0인 타깃 16개)에서 굶는 타깃을 수확 순으로 정리하자는 것이다.
- 예상 하루 증가: 구글 플레이 +20~40건 [추정]. 근거는 타깃당 평균 31건이다. 방문 0이던 16개 중 수확 상위가 하루 1~2건씩만 더 내도 이 정도다. 앱스토어는 비증분형(RSS 500 상한·시계)이라 효과가 거의 없다.
- 요청 예산: 0. 순서만 바꾼다.
- 차단 위험: 없음. 요청 수와 간격이 같다.
- 되돌리기: 정렬 함수 한 곳을 revert한다.
- 자동화: 러너 pre-step이 이미 매 슬롯 돈다. 정렬만 넣으면 된다.
- 병목: 새 타깃(나이 < 3일)은 비율이 불안정하다. 미방문 우선 규칙(`runner.ts` 0·1등급)은 유지해야 한다.
- 남헌 할 일: 없음(코드 PR 머지 판단만).

### f-2. 0건 타깃 쿨다운 연장·퇴출로 슬롯 비우기
- 무엇: 앱스토어 0건 타깃 64개(41%)는 재방문 시계가 14일마다 다시 열고, 회당 슬롯(tpr − active)을 차지한다. `total_collected=0 ∧ 방문 ≥2회`이면 간격을 30일로 늘리고, 3회면 `exhausted` 고정(사유 대장)으로 둔다. 그렇게 비운 `queue_full` 자리를 수확 타깃과 창문 대기 106개(#554)에 준다.
- 예상 하루 증가: +50~150건 [추정]. 근거:
  - 0건 타깃 64개가 14일 주기로 하루 약 4.6슬롯을 쓴다.
  - 그 자리를 창문 대기의 첫 페이지 신규 중앙값 33건(`reports/window-adopted.json` pending 106개, 합 3,215)으로 채우면 4.6 × 33 ≈ 150이다.
  - 하한 50은 절반만 대체된다고 본 값이다.
- 요청 예산: 0(같은 슬롯).
- 차단 위험: 없음.
- 되돌리기: 사유 대장 id의 롤백 SQL(재방문 시계와 같은 형식, UPDATE 전에 `reports/`에 쓴다).
- 자동화: `target-revive --auto`의 `revisitDays`에 0건 분기 하나를 넣는다(§10.1 "재방문 시계 되살리기" 권한 안, exhausted→active 방향만). 퇴출은 이미 exhausted인 행을 다시 열지 않는 것이라 쓰기가 없다.
- 병목: 0건의 원인이 "리뷰 없음"인지 "RSS 404·국가 미판매"인지 갈라야 한다. 후자는 타깃 교체 대상이다(아래 읽기 SQL 2).
- 남헌 할 일: CLAUDE.md §10.1의 "3~14일" 문구 밖(30일)이라 문구 개정 승인.

### f-3. 같은 앱 다른 국가 창문보다 신규 앱 우선
- 무엇: window-discovery(소스당 하루 ≤5)의 몫 일부를 새 앱 후보(e의 같은 개발사 + #560 리뷰 속 언급 앱)로 돌린다. 같은 리뷰어 집단이 국가만 바뀌는 중복을 줄이고, 영역 커버리지(프로젝트 수)를 늘리려는 것이다.
- 예상 하루 증가: 첫 실행 기준 +100~250건 [추정]. 근거:
  - 앱스토어 비0건 타깃 평균은 16,216 ÷ 91 ≈ 178건이다(첫 통독 최대 500).
  - 창문 첫 페이지 중앙값은 33건이다.
  - 신규 앱 0건 확률이 41%라 하루 2~3개 전환 × 0.59 × 178 ≈ 210이다.
  - 창문의 전체 통독 수확은 미실측이라 우열은 **확실하지 않다** — 읽기 SQL 3으로 먼저 비교한다.
- 요청 예산: 같은 수(타깃 1개 = 첫 통독 ≤10요청).
- 차단 위험: 앱스토어 RSS(owner override 경계)는 변화가 없다. 새 앱 발굴 lookup 쪽은 (e)의 판단 항목에 걸린다.
- 되돌리기: 등록 마이그 롤백(INSERT만 하므로 enabled/status 되돌리기).
- 자동화: 후보 생성기 `pickDaily` 점수에 generator 가중(similar_app·mention > window)을 하나 넣는다. lib/discovery라 (가) 세션 소관이므로 그쪽 PR로 넘긴다.
- 병목: 등록은 여전히 마이그 PR과 승인을 거친다(사람 병목). 30% 게이트(appstore)도 남는다.
- 남헌 할 일: (e) lookup 사용 판단, 후보 승인.

### f-4. YouTube 타깃을 같은 채널 업로드 목록으로 확대(search.list 없이)
- 무엇: 지금 영상 19개는 사람이 골랐고, 타깃당 평균 555건으로 **소스 중 타깃당 수확이 가장 크다**. 이 채널들의 업로드 재생목록(`channels.list` 1유닛 → `playlistItems.list` 1유닛)에서 최근 영상을 후보로 낸다.
  - `search.list`(하루 100회 별도 버킷)를 쓰지 않는다. 어댑터 머리말의 원칙 그대로다.
  - 댓글 꺼진 영상은 `videos.list`의 `statistics.commentCount` 유무로 미리 거른다(403 commentsDisabled가 소스 전체를 끄는 사고 방지).
- 예상 증가: 1회 +5,000~11,000건 [추정]. 근거는 신규 영상 10~20개 × 타깃당 평균 555(상위 채널 편중이라 절반으로 깎은 하한)다. 이후 하루 +20~50건 [추정]이다.
- 요청 예산: 발굴 약 50유닛(1회), 댓글 수집은 기존 하루 cap 200요청 안이다. 10,000유닛 풀의 2%이고 cap은 그대로 둔다.
- 차단 위험: 낮다(공식 API·키 할당량). 쿼터는 quotaMarkers로 차단과 갈린다.
- 되돌리기: 타깃 등록 마이그 롤백.
- 자동화: 발굴 스크립트가 후보 목록을 `reports/`에 쓰고, 등록은 마이그 PR로 한다(무인 등록 없음).
- 병목: SP-026 약관 제약(비인증 API 데이터 30일 보관·파생 데이터 금지)은 이미 남헌이 owner 경계로 연 상태다. 타깃 수가 늘면 같은 리스크가 비례해 커진다.
- 남헌 할 일: 영상 타깃 확대가 기존 youtube 예외 범위 안인지 한 줄 확인.

### f-5. HN 소진 81개 — 같은 질의의 시간창 재사용
- 무엇: HN은 질의(`q:`) 타깃이 증분형인데 81/83이 exhausted다(연속 0건 3회). 같은 질의를 `TARGET_REVISIT_SCALE`로 다시 여는 것보다, 새 질의는 발굴 엔진(가 세션)에 맡긴다. 기존 질의는 `TARGET_CLOCK_INCREMENTAL=on`과 사유 로그로 `expected_low` 비율을 먼저 본다.
- 예상: 지금은 [추정] 불가다. 질의별 λ 분포가 필요하다(읽기 SQL 1).
- 남헌 할 일: 없음.

## CLAUDE.md와 충돌·불일치 문구 (수정하지 않음, 목록만)
1. §10.1 "재방문 시계 되살리기 — 재방문 간격 3~14일": 새 변수 `TARGET_REVISIT_SCALE`은 1일까지 내릴 수 있다. 미설정이면 3~14 그대로다. 설정 전에 문구 개정 또는 남헌 확인이 필요하다.
2. §7.1 robots 예외에 `proceedWhenRobotsUnverified` 등재 호스트로 Product Hunt만 적혀 있다. 실제 코드에는 `www.googleapis.com`(youtube)이 이미 있고, 이번에 `api.github.com`·`api.stackexchange.com`이 더해졌다. 셋 다 robots가 없는 공식 API 호스트(404/400)다.
3. §10.1 "발굴 적재 — 막히거나 불확실(확인 불가)한 소스 → 큐, 남헌 승인 뒤에만": github_issues·stackexchange는 `tos_status=unverified`다. 남헌 v71ad 승인으로 마이그 PR까지만 냈고, 적용 세션은 이 승인 근거를 `docs/migration-exceptions.md`에 남겨야 한다.

## CEO-staff가 돌릴 읽기 SQL
1. 증분형 되살림 병목 분포(쿨다운이 지수에 묶였는지):
   ```sql
   SELECT source_key, count(*) AS exhausted,
          count(*) FILTER (WHERE consecutive_empty >= 3) AS ce_ge3,
          count(*) FILTER (WHERE consecutive_empty >= 30) AS ce_ge30,
          round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM now() - last_run_at) / 86400)::numeric, 1) AS med_days_since_run
     FROM public.review_targets WHERE status = 'exhausted' GROUP BY 1 ORDER BY 2 DESC;
   ```
2. 앱스토어 0건 타깃의 모양(f-2: 리뷰 없음 vs 경로 문제):
   ```sql
   SELECT split_part(product_ref, ':', 1) AS country, status, count(*),
          count(*) FILTER (WHERE last_run_at IS NULL) AS never_run
     FROM public.review_targets WHERE source_key = 'appstore' AND coalesce(total_collected, 0) = 0
    GROUP BY 1, 2 ORDER BY 3 DESC;
   ```
3. 창문(같은 앱 다른 국가) vs 첫 국가 수확 비교(f-3 우열):
   ```sql
   WITH a AS (SELECT split_part(product_ref, ':', 2) AS app, product_ref, total_collected, created_at,
                     row_number() OVER (PARTITION BY split_part(product_ref, ':', 2) ORDER BY created_at) AS nth
                FROM public.review_targets WHERE source_key = 'appstore')
   SELECT CASE WHEN nth = 1 THEN 'first_country' ELSE 'window' END AS kind, count(*),
          round(avg(total_collected)) AS avg_collected, count(*) FILTER (WHERE total_collected = 0) AS zero
     FROM a GROUP BY 1;
   ```
4. 수확 순위(f-1) — 소스별 상·하위:
   ```sql
   SELECT source_key, product_ref, label, total_collected,
          round(total_collected / greatest(1, extract(epoch FROM now() - created_at) / 86400))::numeric AS per_day
     FROM public.review_targets WHERE status = 'active' AND source_key IN ('googleplay', 'appstore')
    ORDER BY source_key, per_day DESC NULLS LAST;
   ```
5. 단계 상향 조건(a) — 최근 3일 차단·쿼터:
   ```sql
   SELECT source_key, sum(blocked_responses) AS blocked, sum(quota_responses) AS quota, sum(new_reviews) AS new, count(*) AS runs
     FROM public.review_collection_runs WHERE started_at > now() - interval '3 days' AND NOT dry_run GROUP BY 1 ORDER BY 1;
   ```
6. (d) 마이그 적용 뒤 첫 실행 확인:
   ```sql
   SELECT source_key, started_at, requests, new_reviews, blocked_responses, status
     FROM public.review_collection_runs WHERE source_key IN ('github_issues', 'stackexchange') ORDER BY started_at DESC LIMIT 10;
   ```
- 열 이름(`quota_responses`·`started_at`)은 `review_collection_runs` 마이그 000033 기준이다. 없다는 오류가 나면 `information_schema.columns`로 확인한다.

## 남헌 판단 필요
- (e) iTunes lookup 사용: 용도(홍보) 밖이고 robots 취지와도 가깝다. 쓸지, 무인 루프에 연결할지 정해야 한다.
- #564 적용: github_issues `tos_status=unverified`(AUP §7)로 수집해도 되는지 재확인. v71ad 승인으로 진행 가능하다고 판단했지만 적용은 세션 몫이다.
- `TARGET_REVISIT_SCALE`·f-2(30일)는 CLAUDE.md §10.1 "3~14일" 밖이다. 문구 개정 여부.
- stackexchange: 켜지 않는 것을 권고한다(하루 0.1건 [추정]).
