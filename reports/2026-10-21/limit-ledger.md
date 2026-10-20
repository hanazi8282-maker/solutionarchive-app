# 한도 대장 일일 갱신 2026-10-21

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-10-20T19:14Z -->
(node:2396) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-21]
- 앱스토어 N/T/여유: 활성 0 / 필요 448 / 30% 여유 45 · 24h 방문 55 요청 58 신규 79 (exhausted 343는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 788 (appstore 403 · danawa 7 · googleplay 353 · wordpress_org 25)
- 등록 속도(24h 새 타깃): 51
- 요청 예산 사용률(목표 90%↑): bubble_forum 25/24 도달 · github_issues 60/60 도달 · glide_community 22/24 근접 · googleplay 65/63 도달 · hackernews 389/420 근접 · retool_community 24/24 도달 · shopify_apps 12/7 도달 · softr_community 24/24 도달
- 구글 플레이: 활성 37 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-20T19:14Z -->
(node:2410) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-21]
- 수집 연료계: 소비형 appstore 0일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 343 · 다음 자격 2026-10-20T21:56Z · 긴급
- bobaedream: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-10-21T04:42Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 4) · 대기 예약 0 · 경고
- clien: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-31T05:05Z · 긴급
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 37) · 대기 예약 76 · 다음 자격 2026-10-21T12:42Z · 경고
- hackernews: 순환형(활성 6) · 대기 예약 80 · 다음 자격 2026-10-20T22:10Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:31Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:32Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 4) · 대기 예약 0 · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 9 · 다음 자격 2026-10-25T18:19Z · 경고
- softr_community: 순환형(활성 3) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-10-23T22:43Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 9 · 다음 자격 2026-10-23T12:18Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-21T17:58Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 343개가 간격 대기 중(다음 자격 2026-10-20T21:56:31.615Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 2개가 간격 대기 중(다음 자격 2026-10-21T04:42:47.501Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 76개가 간격 대기 중(다음 자격 2026-10-21T12:42:24.992Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 80개가 간격 대기 중(다음 자격 2026-10-20T22:10:54.704Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-21T17:58:30.227Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 15곳 — brunch(활성 0), bubble_forum(활성 4), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), softr_community(활성 3), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-20T19:14Z -->
(node:2423) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-21]
- github_issues 120→240 (2026-10-18T08:14Z, cc-ceo-staff-2026-10-18): rollback — 변경 뒤 24h 차단·쿼터 신호 1건
    롤백(적용 안 함): -- reason 인용: 롤백: daily_request_cap=120.
- github_issues 60→120 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): rollback — 변경 뒤 24h 차단·쿼터 신호 1건
    롤백(적용 안 함): -- reason 인용: 롤백 cap_base=120,target=60.
- appstore 120→140 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): keep — 요청당 신규 21.8 → 25.0
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 287건 × 보수 단가) ≈ $0.26 / 한도 $15 (2%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-20T23:51Z -->
(node:2187) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-21]
- 앱스토어 N/T/여유: 활성 6 / 필요 448 / 30% 여유 39 · 24h 방문 55 요청 58 신규 79 (exhausted 337는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 786 (appstore 403 · danawa 7 · googleplay 354 · wordpress_org 22)
- 등록 속도(24h 새 타깃): 51
- 요청 예산 사용률(목표 90%↑): bubble_forum 23/24 근접 · disquiet 31/31 도달 · googleplay 63/63 도달 · hackernews 410/420 근접 · retool_community 22/24 근접 · shopify_apps 8/7 도달 · softr_community 22/24 근접
- 구글 플레이: 활성 36 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-20T23:51Z -->
(node:2200) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-21]
- 수집 연료계: 소비형 appstore 0.1일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0.1일(활성 6 + 즉시 예약 2) · 대기 예약 335 · 다음 자격 2026-10-21T11:59Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-10-21T04:42Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 4) · 대기 예약 0 · 경고
- clien: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-31T05:05Z · 긴급
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 36) · 대기 예약 77 · 다음 자격 2026-10-21T12:42Z · 경고
- hackernews: 순환형(활성 9) · 대기 예약 79 · 다음 자격 2026-10-21T12:22Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:31Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:32Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 4) · 대기 예약 0 · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 9 · 다음 자격 2026-10-25T18:19Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T23:33Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-10-23T22:43Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 9 · 다음 자격 2026-10-23T12:18Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-21T17:58Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 335개가 간격 대기 중(다음 자격 2026-10-21T11:59:48.721Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 2개가 간격 대기 중(다음 자격 2026-10-21T04:42:47.501Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 77개가 간격 대기 중(다음 자격 2026-10-21T12:42:24.992Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 79개가 간격 대기 중(다음 자격 2026-10-21T12:22:56.316Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-21T17:58:30.227Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 14곳 — brunch(활성 0), bubble_forum(활성 4), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-20T23:51Z -->
(node:2213) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-21]
- github_issues 120→240 (2026-10-18T08:14Z, cc-ceo-staff-2026-10-18): rollback — 변경 뒤 24h 차단·쿼터 신호 1건
    롤백(적용 안 함): -- reason 인용: 롤백: daily_request_cap=120.
- github_issues 60→120 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): rollback — 변경 뒤 24h 차단·쿼터 신호 1건
    롤백(적용 안 함): -- reason 인용: 롤백 cap_base=120,target=60.
- appstore 120→140 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): keep — 요청당 신규 21.8 → 25.0
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1937건 × 보수 단가) ≈ $1.74 / 한도 $15 (12%) [추정]
- 상향 가능 소스(제안만):
  - 없음
