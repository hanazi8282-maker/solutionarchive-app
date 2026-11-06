# 한도 대장 일일 갱신 2026-11-06

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-05T17:21Z -->
(node:2540) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-06]
- 앱스토어 N/T/여유: 활성 9 / 필요 168 / 30% 여유 30 · 24h 방문 7 요청 20 신규 664 (exhausted 497는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 222 (appstore 129 · danawa 7 · googleplay 35 · hackernews 21 · shopify_apps 2 · wordpress_org 28)
- 등록 속도(24h 새 타깃): 2
- 요청 예산 사용률(목표 90%↑): devto 43/42 도달 · github_issues 30/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 14 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 2 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-05T17:21Z -->
(node:2553) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-06]
- 수집 연료계: 소비형 appstore 1.6일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 1.6일(활성 9 + 즉시 예약 33) · 대기 예약 464 · 다음 자격 2026-11-05T18:03Z · 경고
- bobaedream: 순환형(활성 2) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 14) · 대기 예약 22 · 다음 자격 2026-11-08T04:57Z · 경고
- hackernews: 순환형(활성 8) · 대기 예약 76 · 다음 자격 2026-11-05T21:07Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 4 · 다음 자격 2026-11-07T13:37Z · 경고
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-05T21:16Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 76개가 간격 대기 중(다음 자격 2026-11-05T21:07:48.865Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-11-07T13:37:58.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-05T21:16:01.756Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — 82cook(활성 1), bobaedream(활성 2), brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-05T17:21Z -->
(node:2566) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-06]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 2957건 × 보수 단가) ≈ $2.66 / 한도 $15 (18%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-05T21:28Z -->
(node:2511) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-06]
- 앱스토어 N/T/여유: 활성 9 / 필요 165 / 30% 여유 29 · 24h 방문 13 요청 29 신규 704 (exhausted 497는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 222 (appstore 127 · danawa 7 · googleplay 35 · hackernews 21 · shopify_apps 3 · wordpress_org 29)
- 등록 속도(24h 새 타깃): 2
- 요청 예산 사용률(목표 90%↑): github_issues 30/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 14 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 3 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-05T21:28Z -->
(node:2525) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-06]
- 수집 연료계: 소비형 appstore 1.8일 · youtube 0.2일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 1.8일(활성 9 + 즉시 예약 40) · 대기 예약 457 · 다음 자격 2026-11-06T03:48Z · 경고
- bobaedream: 순환형(활성 2) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 14) · 대기 예약 22 · 다음 자격 2026-11-08T04:57Z · 경고
- hackernews: 순환형(활성 6) · 대기 예약 78 · 다음 자격 2026-11-05T22:27Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 4 · 다음 자격 2026-11-07T13:37Z · 경고
- youtube: 재고 0.2일(활성 0 + 즉시 예약 1) · 대기 예약 41 · 다음 자격 2026-11-06T18:06Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 보충 보류 — 24h 차단·쿼터 신호 2건(상향 금지)
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 78개가 간격 대기 중(다음 자격 2026-11-05T22:27:31.271Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-11-07T13:37:58.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 41개가 간격 대기 중(다음 자격 2026-11-06T18:06:56.241Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — 82cook(활성 1), bobaedream(활성 2), brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-05T21:28Z -->
(node:2538) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-06]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 2957건 × 보수 단가) ≈ $2.66 / 한도 $15 (18%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-06T01:31Z -->
(node:2526) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-06]
- 앱스토어 N/T/여유: 활성 9 / 필요 167 / 30% 여유 29 · 24h 방문 21 요청 37 신규 761 (exhausted 497는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 211 (appstore 129 · danawa 7 · googleplay 35 · hackernews 9 · shopify_apps 3 · wordpress_org 28)
- 등록 속도(24h 새 타깃): 2
- 요청 예산 사용률(목표 90%↑): github_issues 30/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 14 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 4 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-06T01:31Z -->
(node:2541) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-06]
- 수집 연료계: 소비형 appstore 1.6일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 1.6일(활성 9 + 즉시 예약 34) · 대기 예약 463 · 다음 자격 2026-11-06T03:48Z · 경고
- bobaedream: 순환형(활성 2) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 14) · 대기 예약 22 · 다음 자격 2026-11-08T04:57Z · 경고
- hackernews: 순환형(활성 8) · 대기 예약 78 · 다음 자격 2026-11-06T06:32Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-11-07T13:37Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-06T18:06Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 보충 보류 — 24h 차단·쿼터 신호 3건(상향 금지)
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 78개가 간격 대기 중(다음 자격 2026-11-06T06:32:50.155Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 5개가 간격 대기 중(다음 자격 2026-11-07T13:37:58.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-06T18:06:56.241Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — 82cook(활성 1), bobaedream(활성 2), brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-06T01:31Z -->
(node:2554) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-06]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 2935건 × 보수 단가) ≈ $2.64 / 한도 $15 (18%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-06T10:44Z -->
(node:2510) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-06]
- 앱스토어 N/T/여유: 활성 0 / 필요 162 / 30% 여유 38 · 24h 방문 30 요청 33 신규 97 (exhausted 506는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 223 (appstore 124 · danawa 7 · googleplay 39 · hackernews 14 · shopify_apps 7 · wordpress_org 32)
- 등록 속도(24h 새 타깃): 2
- 요청 예산 사용률(목표 90%↑): devto 40/42 근접 · github_issues 30/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 3 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-06T10:44Z -->
(node:2526) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-06]
- 수집 연료계: 소비형 appstore 3.1일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 3.1일(활성 0 + 즉시 예약 83) · 대기 예약 423 · 다음 자격 2026-11-06T22:25Z · 경고
- bobaedream: 순환형(활성 2) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 2 · 다음 자격 2026-11-09T16:35Z · 경고
- clien: 순환형(활성 6) · 대기 예약 4 · 다음 자격 2026-11-12T22:16Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 13) · 대기 예약 23 · 다음 자격 2026-11-08T04:57Z · 경고
- hackernews: 순환형(활성 8) · 대기 예약 76 · 다음 자격 2026-11-06T17:54Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-06T21:39Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-06T21:42Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-11-07T13:37Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-06T18:06Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 보충 보류 — 24h 차단·쿼터 신호 3건(상향 금지)
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 23개가 간격 대기 중(다음 자격 2026-11-08T04:57:56.098Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 76개가 간격 대기 중(다음 자격 2026-11-06T17:54:48.140Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-06T21:39:42.332Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-06T21:42:39.633Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 5개가 간격 대기 중(다음 자격 2026-11-07T13:37:58.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-06T18:06:56.241Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — 82cook(활성 1), bobaedream(활성 2), brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-06T10:44Z -->
(node:2539) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-06]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1936건 × 보수 단가) ≈ $1.74 / 한도 $15 (12%) [추정]
- 상향 가능 소스(제안만):
  - 없음
