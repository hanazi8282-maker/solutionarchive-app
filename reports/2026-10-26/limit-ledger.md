# 한도 대장 일일 갱신 2026-10-26

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-10-25T18:24Z -->
(node:2376) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-26]
- 앱스토어 N/T/여유: 활성 10 / 필요 70 / 30% 여유 34 · 24h 방문 1 요청 1 신규 9 (exhausted 488는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 139 (appstore 26 · danawa 7 · googleplay 44 · hackernews 40 · wordpress_org 22)
- 등록 속도(24h 새 타깃): 6
- 요청 예산 사용률(목표 90%↑): googleplay 13/13 도달 · hackernews 502/540 근접
- 구글 플레이: 활성 24 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-25T18:24Z -->
(node:2390) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-26]
- 수집 연료계: 소비형 appstore 1.4일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 1.4일(활성 10 + 즉시 예약 4) · 대기 예약 484 · 다음 자격 2026-10-26T07:21Z · 경고
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
- googleplay: 순환형(활성 24) · 대기 예약 71 · 다음 자격 2026-10-31T05:09Z · 경고
- hackernews: 순환형(활성 11) · 대기 예약 83 · 다음 자격 2026-10-25T21:13Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 7 · 다음 자격 2026-10-26T08:13Z · 경고
- softr_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-03T23:33Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-10-27T00:13Z · 경고
- wordpress_org: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-29T20:52Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-25T21:17Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 484개가 간격 대기 중(다음 자격 2026-10-26T07:21:10.863Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 2개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 71개가 간격 대기 중(다음 자격 2026-10-31T05:09:32.170Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 83개가 간격 대기 중(다음 자격 2026-10-25T21:13:15.042Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - indiehackers: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 7개가 간격 대기 중(다음 자격 2026-10-26T08:13:07.155Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-10-27T00:13:16.820Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-10-29T20:52:21.168Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-25T21:17:16.933Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 10곳 — brunch(활성 0), damoang(활성 0), disquiet(활성 1), fmkorea(활성 0), make_community(활성 2), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-25T18:24Z -->
(node:2403) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-26]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 3167건 × 보수 단가) ≈ $2.85 / 한도 $15 (19%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-25T23:13Z -->
(node:2372) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-26]
- 앱스토어 N/T/여유: 활성 6 / 필요 70 / 30% 여유 41 · 24h 방문 10 요청 18 신규 260 (exhausted 492는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 134 (appstore 23 · danawa 7 · googleplay 44 · hackernews 40 · wordpress_org 20)
- 등록 속도(24h 새 타깃): 1
- 요청 예산 사용률(목표 90%↑): devto 36/36 도달 · googleplay 13/13 도달 · hackernews 499/540 근접 · shopify_apps 7/7 도달
- 구글 플레이: 활성 24 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-25T23:13Z -->
(node:2385) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-26]
- 수집 연료계: 소비형 appstore 1일 · youtube 0.5일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 1일(활성 6 + 즉시 예약 4) · 대기 예약 488 · 다음 자격 2026-10-26T07:21Z · 경고
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
- googleplay: 순환형(활성 24) · 대기 예약 71 · 다음 자격 2026-10-31T05:09Z · 경고
- hackernews: 순환형(활성 13) · 대기 예약 83 · 다음 자격 2026-10-26T00:02Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 7 · 다음 자격 2026-10-26T08:13Z · 경고
- softr_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-03T23:33Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-10-27T00:13Z · 경고
- wordpress_org: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-29T20:52Z · 긴급
- youtube: 재고 0.5일(활성 5 + 즉시 예약 0) · 대기 예약 37 · 다음 자격 2026-10-26T00:17Z · 정상
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 488개가 간격 대기 중(다음 자격 2026-10-26T07:21:10.863Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 2개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 71개가 간격 대기 중(다음 자격 2026-10-31T05:09:32.170Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 83개가 간격 대기 중(다음 자격 2026-10-26T00:02:38.864Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - indiehackers: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 7개가 간격 대기 중(다음 자격 2026-10-26T08:13:07.155Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-10-27T00:13:16.820Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-10-29T20:52:21.168Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 37개가 간격 대기 중(다음 자격 2026-10-26T00:17:00.013Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 10곳 — brunch(활성 0), damoang(활성 0), disquiet(활성 1), fmkorea(활성 0), make_community(활성 2), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-25T23:13Z -->
(node:2399) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-26]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1524건 × 보수 단가) ≈ $1.37 / 한도 $15 (9%) [추정]
- 상향 가능 소스(제안만):
  - 없음
