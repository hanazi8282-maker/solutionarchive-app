# 한도 대장 일일 갱신 2026-11-20

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-19T18:13Z -->
(node:2512) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-20]
- 앱스토어 N/T/여유: 활성 293 / 필요 210 / 30% 여유 0 · 24h 방문 25 요청 70 신규 2048 (exhausted 531는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 7 (danawa 7)
- 등록 속도(24h 새 타깃): 309
- 요청 예산 사용률(목표 90%↑): appstore 70/50 도달 · frappe_forum 20/20 도달 · ghost_forum 20/20 도달 · googleplay 11/11 도달 · mautic_forum 20/20 도달 · obsidian_forum 20/20 도달 · shopify_community 20/20 도달 · suitecrm_community 20/20 도달
- 구글 플레이: 활성 28 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-19T18:13Z -->
(node:2525) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-20]
- 수집 연료계: 소비형 appstore 14.6일 · youtube 0.3일 (14일 미만 1/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 14.6일(활성 293 + 즉시 예약 175) · 대기 예약 356 · 다음 자격 2026-11-19T19:13Z · 정상
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 1) · 대기 예약 0 · 정상
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 28) · 대기 예약 12 · 다음 자격 2026-11-20T07:28Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 87 · 다음 자격 2026-11-19T20:49Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-22T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-21T04:22Z · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-23T00:21Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 정상
- softr_community: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 긴급
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 정상
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-19T23:30Z · 긴급
- youtube: 재고 0.3일(활성 32 + 즉시 예약 1) · 대기 예약 69 · 다음 자격 2026-11-20T22:31Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 12개가 간격 대기 중(다음 자격 2026-11-20T07:28:05.557Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 87개가 간격 대기 중(다음 자격 2026-11-19T20:49:17.560Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-22T07:43:27.232Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T04:22:00.894Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 4개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-11-19T23:30:53.182Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 69개가 간격 대기 중(다음 자격 2026-11-20T22:31:47.250Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-19T18:13Z -->
(node:2538) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-20]
- hackernews 540→300 (2026-11-18T20:51Z, yield-realloc): pending — 변경 21h 경과 — 24h 뒤 재평가
- okky 150→75 (2026-11-18T20:51Z, yield-realloc): pending — 변경 21h 경과 — 24h 뒤 재평가
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 5377건 × 보수 단가) ≈ $4.84 / 한도 $15 (32%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-19T22:39Z -->
(node:2377) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-20]
- 앱스토어 N/T/여유: 활성 293 / 필요 210 / 30% 여유 0 · 24h 방문 14 요청 50 신규 1640 (exhausted 531는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 7 (danawa 7)
- 등록 속도(24h 새 타깃): 79
- 요청 예산 사용률(목표 90%↑): appstore 50/50 도달 · dcinside 20/20 도달 · frappe_forum 20/20 도달 · ghost_forum 20/20 도달 · googleplay 11/11 도달 · mautic_forum 20/20 도달 · obsidian_forum 20/20 도달 · shopify_community 20/20 도달 · suitecrm_community 20/20 도달
- 구글 플레이: 활성 28 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-19T22:39Z -->
(node:2403) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-20]
- 수집 연료계: 소비형 appstore 14.7일 · youtube 0.1일 (14일 미만 1/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 14.7일(활성 293 + 즉시 예약 178) · 대기 예약 353 · 다음 자격 2026-11-19T22:50Z · 정상
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 1) · 대기 예약 0 · 정상
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 28) · 대기 예약 12 · 다음 자격 2026-11-20T07:28Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 86 · 다음 자격 2026-11-20T13:14Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-22T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-21T04:22Z · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-23T00:21Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 정상
- softr_community: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 긴급
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 정상
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-19T23:30Z · 긴급
- youtube: 재고 0.1일(활성 6 + 즉시 예약 1) · 대기 예약 95 · 다음 자격 2026-11-20T22:31Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 12개가 간격 대기 중(다음 자격 2026-11-20T07:28:05.557Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 86개가 간격 대기 중(다음 자격 2026-11-20T13:14:12.038Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-22T07:43:27.232Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T04:22:00.894Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 4개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-11-19T23:30:53.182Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 95개가 간격 대기 중(다음 자격 2026-11-20T22:31:47.250Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-19T22:39Z -->
(node:2432) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-20]
- hackernews 540→300 (2026-11-18T20:51Z, yield-realloc): keep — 요청당 신규 4.0 → 4.7
- okky 150→75 (2026-11-18T20:51Z, yield-realloc): rollback — 요청당 신규 2.1 → 0.3 (12% < 70%)
    롤백(적용 안 함): -- 롤백법이 reason 에 없음 — 한도 대장 확인
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 5377건 × 보수 단가) ≈ $4.84 / 한도 $15 (32%) [추정]
- 상향 가능 소스(제안만):
  - 없음
