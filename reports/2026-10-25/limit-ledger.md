# 한도 대장 일일 갱신 2026-10-25

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-10-24T18:07Z -->
(node:2384) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-25]
- 앱스토어 N/T/여유: 활성 0 / 필요 1317 / 30% 여유 45 · 24h 방문 46 요청 90 신규 253 (exhausted 498는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 1433 (appstore 1272 · danawa 7 · googleplay 48 · hackernews 25 · wordpress_org 81)
- 등록 속도(24h 새 타깃): 50
- 요청 예산 사용률(목표 90%↑): devto 36/36 도달 · googleplay 17/13 도달 · hackernews 446/480 근접 · n8n_community 30/28 도달 · retool_community 30/28 도달
- 구글 플레이: 활성 25 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-24T18:07Z -->
(node:2397) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-25]
- 수집 연료계: 소비형 appstore 0일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 498 · 다음 자격 2026-10-24T20:47Z · 긴급
- bobaedream: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-01T04:42Z · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-04T14:46Z · 경고
- clien: 순환형(활성 8) · 대기 예약 2 · 다음 자격 2026-10-31T05:05Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 정상
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 25) · 대기 예약 70 · 다음 자격 2026-10-31T05:09Z · 경고
- hackernews: 순환형(활성 9) · 대기 예약 84 · 다음 자격 2026-10-24T20:54Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-06T21:39Z · 경고
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 4) · 대기 예약 0 · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 9 · 다음 자격 2026-10-25T18:19Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T23:33Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-10-27T00:13Z · 경고
- wordpress_org: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-29T20:52Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-24T21:11Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 498개가 간격 대기 중(다음 자격 2026-10-24T20:47:23.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 2개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 70개가 간격 대기 중(다음 자격 2026-10-31T05:09:32.170Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 84개가 간격 대기 중(다음 자격 2026-10-24T20:54:34.724Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-10-27T00:13:16.820Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-10-29T20:52:21.168Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-24T21:11:17.517Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — brunch(활성 0), damoang(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-24T18:07Z -->
(node:2411) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-25]
- appstore 200→400 (2026-10-22T09:11Z, cc-ceo-staff-2026-10-22-v71bc): keep — 요청당 신규 0.0 → 1.8
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 2664건 × 보수 단가) ≈ $2.40 / 한도 $15 (16%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-24T23:09Z -->
(node:2151) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-25]
- 앱스토어 N/T/여유: 활성 0 / 필요 1325 / 30% 여유 47 · 24h 방문 46 요청 90 신규 259 (exhausted 498는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 1435 (appstore 1278 · danawa 7 · googleplay 46 · hackernews 25 · wordpress_org 79)
- 등록 속도(24h 새 타깃): 51
- 요청 예산 사용률(목표 90%↑): googleplay 13/13 도달 · hackernews 528/480 도달 · n8n_community 26/28 근접 · retool_community 29/28 도달
- 구글 플레이: 활성 25 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-24T23:09Z -->
(node:2203) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-25]
- 수집 연료계: 소비형 appstore 0일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 498 · 다음 자격 2026-10-25T15:38Z · 긴급
- bobaedream: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-01T04:42Z · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-04T14:46Z · 경고
- clien: 순환형(활성 8) · 대기 예약 2 · 다음 자격 2026-10-31T05:05Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 정상
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 25) · 대기 예약 70 · 다음 자격 2026-10-31T05:09Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 80 · 다음 자격 2026-10-25T07:52Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 4) · 대기 예약 0 · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 9 · 다음 자격 2026-10-25T18:19Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T23:33Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-10-27T00:13Z · 경고
- wordpress_org: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-29T20:52Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-25T21:17Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 498개가 간격 대기 중(다음 자격 2026-10-25T15:38:43.241Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 2개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 70개가 간격 대기 중(다음 자격 2026-10-31T05:09:32.170Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 80개가 간격 대기 중(다음 자격 2026-10-25T07:52:37.909Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-10-27T00:13:16.820Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-10-29T20:52:21.168Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-25T21:17:16.933Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — brunch(활성 0), damoang(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-24T23:09Z -->
(node:2236) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-25]
- appstore 200→400 (2026-10-22T09:11Z, cc-ceo-staff-2026-10-22-v71bc): keep — 요청당 신규 0.0 → 1.8
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 4769건 × 보수 단가) ≈ $4.29 / 한도 $15 (29%) [추정]
- 상향 가능 소스(제안만):
  - 없음
