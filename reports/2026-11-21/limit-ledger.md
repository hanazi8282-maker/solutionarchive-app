# 한도 대장 일일 갱신 2026-11-21

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-20T17:45Z -->
(node:2283) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-21]
- 앱스토어 N/T/여유: 활성 295 / 필요 196 / 30% 여유 0 · 24h 방문 15 요청 50 신규 1437 (exhausted 545는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 7 (danawa 7)
- 등록 속도(24h 새 타깃): 69
- 요청 예산 사용률(목표 90%↑): appstore 50/50 도달 · dcinside 20/20 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 31 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-20T17:45Z -->
(node:2297) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-21]
- 수집 연료계: 소비형 appstore 16.7일 · youtube 1.6일 (14일 미만 1/2개) · 순환형 이상 29곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 16.7일(활성 295 + 즉시 예약 205) · 대기 예약 340 · 다음 자격 2026-11-20T22:20Z · 정상
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-23T08:18Z · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 31) · 대기 예약 13 · 다음 자격 2026-11-23T06:11Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 84 · 다음 자격 2026-11-20T20:00Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-22T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-21T04:22Z · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 0) · 대기 예약 0 · 긴급
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-23T00:21Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 정상
- softr_community: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 긴급
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 정상
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-21T21:14Z · 경고
- youtube: 재고 1.6일(활성 48 + 즉시 예약 0) · 대기 예약 107 · 다음 자격 2026-11-20T22:31Z · 정상
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - dcinside: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T08:18:57.864Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 13개가 간격 대기 중(다음 자격 2026-11-23T06:11:29.896Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 84개가 간격 대기 중(다음 자격 2026-11-20T20:00:25.942Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-22T07:43:27.232Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T04:22:00.894Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 4개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:14:40.730Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 107개가 간격 대기 중(다음 자격 2026-11-20T22:31:47.250Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 14곳 — 82cook(활성 1), bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), obsidian_forum(활성 0), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-20T17:45Z -->
(node:2311) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-21]
- hackernews 540→300 (2026-11-18T20:51Z, yield-realloc): keep — 요청당 신규 4.0 → 4.7
- okky 150→75 (2026-11-18T20:51Z, yield-realloc): rollback — 요청당 신규 2.1 → 0.3 (12% < 70%)
    롤백(적용 안 함): -- 롤백법이 reason 에 없음 — 한도 대장 확인
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1458건 × 보수 단가) ≈ $1.31 / 한도 $15 (9%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-20T22:15Z -->
(node:2290) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-21]
- 앱스토어 N/T/여유: 활성 295 / 필요 196 / 30% 여유 0 · 24h 방문 15 요청 50 신규 1437 (exhausted 545는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 7 (danawa 7)
- 등록 속도(24h 새 타깃): 69
- 요청 예산 사용률(목표 90%↑): appstore 50/50 도달 · ghost_forum 18/20 근접 · googleplay 11/11 도달
- 구글 플레이: 활성 31 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-20T22:15Z -->
(node:2304) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-21]
- 수집 연료계: 소비형 appstore 16.7일 · youtube 1.3일 (14일 미만 1/2개) · 순환형 이상 29곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 16.7일(활성 295 + 즉시 예약 205) · 대기 예약 340 · 다음 자격 2026-11-20T22:20Z · 정상
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-23T08:18Z · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 31) · 대기 예약 13 · 다음 자격 2026-11-23T06:11Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 83 · 다음 자격 2026-11-20T22:29Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-22T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-21T04:22Z · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 정상
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 0) · 대기 예약 0 · 긴급
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-23T00:21Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 정상
- softr_community: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 긴급
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 정상
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-21T21:14Z · 경고
- youtube: 재고 1.3일(활성 38 + 즉시 예약 0) · 대기 예약 117 · 다음 자격 2026-11-20T22:31Z · 정상
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - dcinside: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T08:18:57.864Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 13개가 간격 대기 중(다음 자격 2026-11-23T06:11:29.896Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 83개가 간격 대기 중(다음 자격 2026-11-20T22:29:31.662Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-22T07:43:27.232Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T04:22:00.894Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 4개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:14:40.730Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 117개가 간격 대기 중(다음 자격 2026-11-20T22:31:47.250Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 14곳 — 82cook(활성 1), bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), obsidian_forum(활성 0), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-20T22:15Z -->
(node:2318) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-21]
- hackernews 540→300 (2026-11-18T20:51Z, yield-realloc): keep — 요청당 신규 4.0 → 4.7
- okky 150→75 (2026-11-18T20:51Z, yield-realloc): rollback — 요청당 신규 2.1 → 0.3 (12% < 70%)
    롤백(적용 안 함): -- 롤백법이 reason 에 없음 — 한도 대장 확인
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1458건 × 보수 단가) ≈ $1.31 / 한도 $15 (9%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-21T02:10Z -->
(node:2284) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-21]
- 앱스토어 N/T/여유: 활성 297 / 필요 195 / 30% 여유 0 · 24h 방문 15 요청 50 신규 1437 (exhausted 545는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 7 (danawa 7)
- 등록 속도(24h 새 타깃): 52
- 요청 예산 사용률(목표 90%↑): appstore 50/50 도달
- 구글 플레이: 활성 31 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-21T02:10Z -->
(node:2299) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-21]
- 수집 연료계: 소비형 appstore 18.5일 · youtube 0.7일 (14일 미만 1/2개) · 순환형 이상 34곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 18.5일(활성 297 + 즉시 예약 220) · 대기 예약 325 · 다음 자격 2026-11-21T03:12Z · 정상
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-23T08:18Z · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 31) · 대기 예약 13 · 다음 자격 2026-11-23T06:11Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 80 · 다음 자격 2026-11-21T06:08Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-22T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-21T04:22Z · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 0) · 대기 예약 0 · 긴급
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-23T00:21Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 경고
- softr_community: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 긴급
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-21T21:14Z · 경고
- youtube: 재고 0.7일(활성 45 + 즉시 예약 1) · 대기 예약 121 · 다음 자격 2026-11-21T06:18Z · 정상
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - dcinside: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T08:18:57.864Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 13개가 간격 대기 중(다음 자격 2026-11-23T06:11:29.896Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 80개가 간격 대기 중(다음 자격 2026-11-21T06:08:38.289Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-22T07:43:27.232Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T04:22:00.894Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 4개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:14:40.730Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 121개가 간격 대기 중(다음 자격 2026-11-21T06:18:16.554Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 19곳 — 82cook(활성 1), bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), frappe_forum(활성 2), ghost_forum(활성 2), mautic_forum(활성 2), n8n_community(활성 3), obsidian_forum(활성 0), okky(활성 1), shopify_community(활성 2), suitecrm_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-21T02:10Z -->
(node:2312) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-21]
- hackernews 540→300 (2026-11-18T20:51Z, yield-realloc): keep — 요청당 신규 4.0 → 4.7
- okky 150→75 (2026-11-18T20:51Z, yield-realloc): rollback — 요청당 신규 2.1 → 0.3 (12% < 70%)
    롤백(적용 안 함): -- 롤백법이 reason 에 없음 — 한도 대장 확인
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1440건 × 보수 단가) ≈ $1.30 / 한도 $15 (9%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-21T10:54Z -->
(node:2302) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-21]
- 앱스토어 N/T/여유: 활성 250 / 필요 196 / 30% 여유 0 · 24h 방문 47 요청 50 신규 101 (exhausted 592는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 7 (danawa 7)
- 등록 속도(24h 새 타깃): 14
- 요청 예산 사용률(목표 90%↑): appstore 50/50 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 32 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-21T10:54Z -->
(node:2317) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-21]
- 수집 연료계: 소비형 appstore 17.1일 · youtube 0.4일 (14일 미만 1/2개) · 순환형 이상 34곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 17.1일(활성 250 + 즉시 예약 229) · 대기 예약 363 · 다음 자격 2026-11-21T15:48Z · 정상
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-23T08:18Z · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 32) · 대기 예약 18 · 다음 자격 2026-11-23T06:11Z · 경고
- hackernews: 순환형(활성 15) · 대기 예약 79 · 다음 자격 2026-11-21T15:51Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-22T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 1) · 대기 예약 0 · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 0) · 대기 예약 0 · 긴급
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-11-23T00:21Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 경고
- softr_community: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 긴급
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-21T21:14Z · 경고
- youtube: 재고 0.4일(활성 24 + 즉시 예약 3) · 대기 예약 140 · 다음 자격 2026-11-21T13:47Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - dcinside: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T08:18:57.864Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 18개가 간격 대기 중(다음 자격 2026-11-23T06:11:29.896Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 79개가 간격 대기 중(다음 자격 2026-11-21T15:51:57.249Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-22T07:43:27.232Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 4개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:14:40.730Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 140개가 간격 대기 중(다음 자격 2026-11-21T13:47:09.637Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 20곳 — 82cook(활성 1), bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), frappe_forum(활성 2), ghost_forum(활성 2), make_community(활성 1), mautic_forum(활성 2), n8n_community(활성 3), obsidian_forum(활성 0), okky(활성 1), shopify_community(활성 2), suitecrm_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-21T10:54Z -->
(node:2330) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-21]
- hackernews 540→300 (2026-11-18T20:51Z, yield-realloc): keep — 요청당 신규 4.0 → 4.7
- okky 150→75 (2026-11-18T20:51Z, yield-realloc): rollback — 요청당 신규 2.1 → 0.3 (12% < 70%)
    롤백(적용 안 함): -- 롤백법이 reason 에 없음 — 한도 대장 확인
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 4298건 × 보수 단가) ≈ $3.87 / 한도 $15 (26%) [추정]
- 상향 가능 소스(제안만):
  - 없음
