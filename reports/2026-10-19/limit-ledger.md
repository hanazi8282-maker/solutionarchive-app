# 한도 대장 일일 갱신 2026-10-19

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-10-18T16:04Z -->
(node:2175) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-19]
- 앱스토어 N/T/여유: 활성 19 / 필요 294 / 30% 여유 25 · 24h 방문 66 요청 126 신규 2748 (exhausted 223는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 591 (appstore 250 · danawa 7 · googleplay 316 · wordpress_org 18)
- 등록 속도(24h 새 타깃): 54
- 요청 예산 사용률(목표 90%↑): appstore 126/140 근접
- 구글 플레이: 활성 67 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-18T16:04Z -->
(node:2188) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-19]
- 수집 연료계: 소비형 appstore 0.5일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 2) · 대기 예약 0 · 경고
- appstore: 재고 0.5일(활성 19 + 즉시 예약 1) · 대기 예약 222 · 다음 자격 2026-10-19T23:20Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-10-21T04:42Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- clien: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-10-31T05:05Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 16) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 0 · 경고
- googleplay: 순환형(활성 67) · 대기 예약 50 · 다음 자격 2026-10-20T00:05Z · 경고
- hackernews: 순환형(활성 2) · 대기 예약 81 · 다음 자격 2026-10-18T20:39Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:31Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:32Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 2) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 2) · 대기 예약 0 · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 9 · 다음 자격 2026-10-25T18:19Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-10-23T22:43Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 9 · 다음 자격 2026-10-23T12:18Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 19 · 다음 자격 2026-10-18T21:27Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 예약 222개가 간격 대기 중(다음 자격 2026-10-19T23:20:04.764Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 2개가 간격 대기 중(다음 자격 2026-10-21T04:42:47.501Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 3개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 50개가 간격 대기 중(다음 자격 2026-10-20T00:05:07.609Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 81개가 간격 대기 중(다음 자격 2026-10-18T20:39:55.706Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 19개가 간격 대기 중(다음 자격 2026-10-18T21:27:33.244Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 17곳 — 82cook(활성 2), brunch(활성 0), bubble_forum(활성 2), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), glide_community(활성 2), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 2), okky(활성 1), retool_community(활성 2), softr_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-18T16:04Z -->
(node:2202) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-19]
- github_issues 120→240 (2026-10-18T08:14Z, cc-ceo-staff-2026-10-18): pending — 변경 8h 경과 — 24h 뒤 재평가
- github_issues 60→120 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): pending — 변경 1h 경과 — 24h 뒤 재평가
- appstore 120→140 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): pending — 변경 1h 경과 — 24h 뒤 재평가
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 7158건 × 보수 단가) ≈ $6.44 / 한도 $15 (43%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-18T23:07Z -->
(node:2207) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-19]
- 앱스토어 N/T/여유: 활성 6 / 필요 294 / 30% 여유 54 · 24h 방문 62 요청 140 신규 3971 (exhausted 236는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 558 (appstore 234 · danawa 7 · googleplay 310 · wordpress_org 7)
- 등록 속도(24h 새 타깃): 106
- 요청 예산 사용률(목표 90%↑): appstore 140/140 도달 · bubble_forum 19/20 근접 · github_issues 58/60 근접 · glide_community 19/20 근접 · googleplay 63/63 도달 · retool_community 19/20 근접 · shopify_apps 15/15 도달 · softr_community 20/20 도달
- 구글 플레이: 활성 66 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-18T23:07Z -->
(node:2220) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-19]
- 수집 연료계: 소비형 appstore 0.1일 · youtube 0.5일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 2) · 대기 예약 0 · 경고
- appstore: 재고 0.1일(활성 6 + 즉시 예약 0) · 대기 예약 236 · 다음 자격 2026-10-19T23:20Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-10-21T04:42Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 4) · 대기 예약 0 · 경고
- clien: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-10-31T05:05Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 3) · 대기 예약 0 · 경고
- googleplay: 순환형(활성 66) · 대기 예약 51 · 다음 자격 2026-10-20T00:05Z · 경고
- hackernews: 순환형(활성 4) · 대기 예약 80 · 다음 자격 2026-10-19T12:41Z · 경고
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
- youtube: 재고 0.5일(활성 5 + 즉시 예약 0) · 대기 예약 37 · 다음 자격 2026-10-21T17:58Z · 정상
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 예약 236개가 간격 대기 중(다음 자격 2026-10-19T23:20:04.764Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 2개가 간격 대기 중(다음 자격 2026-10-21T04:42:47.501Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 3개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 51개가 간격 대기 중(다음 자격 2026-10-20T00:05:07.609Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 80개가 간격 대기 중(다음 자격 2026-10-19T12:41:16.321Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 37개가 간격 대기 중(다음 자격 2026-10-21T17:58:30.227Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 17곳 — 82cook(활성 2), brunch(활성 0), bubble_forum(활성 4), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), glide_community(활성 3), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), softr_community(활성 3), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-18T23:07Z -->
(node:2233) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-19]
- github_issues 120→240 (2026-10-18T08:14Z, cc-ceo-staff-2026-10-18): pending — 변경 15h 경과 — 24h 뒤 재평가
- github_issues 60→120 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): pending — 변경 9h 경과 — 24h 뒤 재평가
- appstore 120→140 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): pending — 변경 9h 경과 — 24h 뒤 재평가
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 7516건 × 보수 단가) ≈ $6.76 / 한도 $15 (45%) [추정]
- 상향 가능 소스(제안만):
  - 없음
