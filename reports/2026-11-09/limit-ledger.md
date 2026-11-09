# 한도 대장 일일 갱신 2026-11-09

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-08T15:56Z -->
(node:2538) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-09]
- 앱스토어 N/T/여유: 활성 5 / 필요 166 / 30% 여유 31 · 24h 방문 20 요청 32 신규 93 (exhausted 501는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 209 (appstore 130 · danawa 7 · googleplay 38 · hackernews 25 · shopify_apps 6 · wordpress_org 3)
- 등록 속도(24h 새 타깃): 0
- 요청 예산 사용률(목표 90%↑): devto 40/42 근접 · googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-08T15:56Z -->
(node:2551) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-09]
- 수집 연료계: 소비형 appstore 3.2일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 3.2일(활성 5 + 즉시 예약 75) · 대기 예약 426 · 다음 자격 2026-11-08T19:55Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-10T15:52Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 13) · 대기 예약 22 · 다음 자격 2026-11-09T05:19Z · 경고
- hackernews: 순환형(활성 8) · 대기 예약 83 · 다음 자격 2026-11-08T17:06Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 0 · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-09T16:36Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-11-13T07:46Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-09T04:58Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 426개가 간격 대기 중(다음 자격 2026-11-08T19:55:25.809Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-10T15:52:00.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 22개가 간격 대기 중(다음 자격 2026-11-09T05:19:17.760Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 83개가 간격 대기 중(다음 자격 2026-11-08T17:06:44.033Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:36:05.854Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 5개가 간격 대기 중(다음 자격 2026-11-13T07:46:25.610Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-09T04:58:37.012Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), kakao_cafe(활성 0), n8n_community(활성 3), okky(활성 1), softr_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-08T15:56Z -->
(node:2565) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-09]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1862건 × 보수 단가) ≈ $1.68 / 한도 $15 (11%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-08T19:40Z -->
(node:2299) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-09]
- 앱스토어 N/T/여유: 활성 0 / 필요 168 / 30% 여유 36 · 24h 방문 24 요청 34 신규 62 (exhausted 506는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 223 (appstore 132 · danawa 7 · googleplay 41 · hackernews 27 · shopify_apps 10 · wordpress_org 6)
- 등록 속도(24h 새 타깃): 0
- 요청 예산 사용률(목표 90%↑): googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-08T19:40Z -->
(node:2313) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-09]
- 수집 연료계: 소비형 appstore 2.8일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 2.8일(활성 0 + 즉시 예약 71) · 대기 예약 435 · 다음 자격 2026-11-08T19:55Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-10T15:52Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 13) · 대기 예약 22 · 다음 자격 2026-11-09T05:19Z · 경고
- hackernews: 순환형(활성 7) · 대기 예약 84 · 다음 자격 2026-11-08T22:50Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 0 · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-09T16:36Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-11-13T07:46Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-09T04:58Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 435개가 간격 대기 중(다음 자격 2026-11-08T19:55:25.809Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-10T15:52:00.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 22개가 간격 대기 중(다음 자격 2026-11-09T05:19:17.760Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 84개가 간격 대기 중(다음 자격 2026-11-08T22:50:01.383Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:36:05.854Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 5개가 간격 대기 중(다음 자격 2026-11-13T07:46:25.610Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-09T04:58:37.012Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), kakao_cafe(활성 0), n8n_community(활성 3), okky(활성 1), softr_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-08T19:40Z -->
(node:2326) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-09]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1862건 × 보수 단가) ≈ $1.68 / 한도 $15 (11%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-09T00:49Z -->
(node:2285) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-09]
- 앱스토어 N/T/여유: 활성 1 / 필요 169 / 30% 여유 35 · 24h 방문 24 요청 27 신규 42 (exhausted 505는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 241 (appstore 133 · danawa 7 · googleplay 41 · hackernews 15 · shopify_apps 11 · wordpress_org 34)
- 등록 속도(24h 새 타깃): 0
- 요청 예산 사용률(목표 90%↑): devto 40/42 근접 · github_issues 30/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-09T00:49Z -->
(node:2298) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-09]
- 수집 연료계: 소비형 appstore 2.8일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 2.8일(활성 1 + 즉시 예약 70) · 대기 예약 435 · 다음 자격 2026-11-09T04:38Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-10T15:52Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 13) · 대기 예약 22 · 다음 자격 2026-11-09T05:19Z · 경고
- hackernews: 순환형(활성 7) · 대기 예약 84 · 다음 자격 2026-11-09T04:48Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 0 · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-09T16:36Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-23T00:21Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-11-13T07:46Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-09T04:58Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 435개가 간격 대기 중(다음 자격 2026-11-09T04:38:46.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-10T15:52:00.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 22개가 간격 대기 중(다음 자격 2026-11-09T05:19:17.760Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 84개가 간격 대기 중(다음 자격 2026-11-09T04:48:11.771Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-09T16:36:05.854Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 5개가 간격 대기 중(다음 자격 2026-11-13T07:46:25.610Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-09T04:58:37.012Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 11곳 — brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), kakao_cafe(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-09T00:49Z -->
(node:2313) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-09]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1857건 × 보수 단가) ≈ $1.67 / 한도 $15 (11%) [추정]
- 상향 가능 소스(제안만):
  - 없음
