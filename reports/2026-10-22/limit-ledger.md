# 한도 대장 일일 갱신 2026-10-22

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-10-21T19:18Z -->
(node:2443) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-22]
- 앱스토어 N/T/여유: 활성 0 / 필요 490 / 30% 여유 41 · 24h 방문 59 요청 60 신규 1 (exhausted 382는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 670 (appstore 449 · danawa 7 · googleplay 163 · hackernews 22 · wordpress_org 29)
- 등록 속도(24h 새 타깃): 43
- 요청 예산 사용률(목표 90%↑): disquiet 34/36 근접 · googleplay 65/31 도달 · retool_community 22/24 근접
- 구글 플레이: 활성 27 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-21T19:18Z -->
(node:2457) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-22]
- 수집 연료계: 소비형 appstore 0.1일 · youtube 0.2일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0.1일(활성 0 + 즉시 예약 10) · 대기 예약 372 · 다음 자격 2026-10-21T19:25Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-01T04:42Z · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-04T14:46Z · 경고
- clien: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-31T05:05Z · 긴급
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 27) · 대기 예약 83 · 다음 자격 2026-10-21T19:56Z · 경고
- hackernews: 순환형(활성 8) · 대기 예약 82 · 다음 자격 2026-10-21T19:35Z · 경고
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
- youtube: 재고 0.2일(활성 1 + 즉시 예약 1) · 대기 예약 40 · 다음 자격 2026-10-22T08:29Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 372개가 간격 대기 중(다음 자격 2026-10-21T19:25:44.415Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 82개가 간격 대기 중(다음 자격 2026-10-21T19:35:56.414Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 40개가 간격 대기 중(다음 자격 2026-10-22T08:29:32.514Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 13곳 — brunch(활성 0), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-21T19:18Z -->
(node:2470) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-22]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 5166건 × 보수 단가) ≈ $4.65 / 한도 $15 (31%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-21T23:59Z -->
(node:2218) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-22]
- 앱스토어 N/T/여유: 활성 6 / 필요 490 / 30% 여유 34 · 24h 방문 65 요청 67 신규 1 (exhausted 376는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 666 (appstore 450 · danawa 7 · googleplay 162 · hackernews 20 · wordpress_org 27)
- 등록 속도(24h 새 타깃): 41
- 요청 예산 사용률(목표 90%↑): googleplay 49/31 도달 · n8n_community 28/28 도달 · retool_community 22/24 근접
- 구글 플레이: 활성 27 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-21T23:59Z -->
(node:2231) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-22]
- 수집 연료계: 소비형 appstore 0.4일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0.4일(활성 6 + 즉시 예약 19) · 대기 예약 357 · 다음 자격 2026-10-22T08:01Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-01T04:42Z · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-04T14:46Z · 경고
- clien: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-31T05:05Z · 긴급
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 27) · 대기 예약 74 · 다음 자격 2026-10-22T08:31Z · 경고
- hackernews: 순환형(활성 7) · 대기 예약 83 · 다음 자격 2026-10-22T08:11Z · 경고
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
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-22T08:29Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 357개가 간격 대기 중(다음 자격 2026-10-22T08:01:16.135Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 83개가 간격 대기 중(다음 자격 2026-10-22T08:11:28.572Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-22T08:29:32.514Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 13곳 — brunch(활성 0), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-21T23:59Z -->
(node:2244) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-22]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 3957건 × 보수 단가) ≈ $3.56 / 한도 $15 (24%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-22T08:31Z -->
(node:2421) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-22]
- 앱스토어 N/T/여유: 활성 0 / 필요 546 / 30% 여유 39 · 24h 방문 64 요청 66 신규 1 (exhausted 416는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 730 (appstore 507 · danawa 7 · googleplay 167 · hackernews 18 · wordpress_org 31)
- 등록 속도(24h 새 타깃): 36
- 요청 예산 사용률(목표 90%↑): googleplay 47/31 도달 · n8n_community 27/28 근접
- 구글 플레이: 활성 25 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-22T08:31Z -->
(node:2435) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-22]
- 수집 연료계: 소비형 appstore 0.2일 · youtube 0.1일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0.2일(활성 0 + 즉시 예약 17) · 대기 예약 399 · 다음 자격 2026-10-22T19:20Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-01T04:42Z · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-04T14:46Z · 경고
- clien: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-31T05:05Z · 긴급
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 25) · 대기 예약 76 · 다음 자격 2026-10-22T08:31Z · 경고
- hackernews: 순환형(활성 6) · 대기 예약 84 · 다음 자격 2026-10-22T12:17Z · 경고
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
- youtube: 재고 0.1일(활성 0 + 즉시 예약 1) · 대기 예약 41 · 다음 자격 2026-10-22T19:10Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 399개가 간격 대기 중(다음 자격 2026-10-22T19:20:51.129Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 84개가 간격 대기 중(다음 자격 2026-10-22T12:17:01.686Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 41개가 간격 대기 중(다음 자격 2026-10-22T19:10:16.720Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 13곳 — brunch(활성 0), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-22T08:31Z -->
(node:2448) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-22]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 847건 × 보수 단가) ≈ $0.76 / 한도 $15 (5%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-10-22T14:29Z -->
(node:2381) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-10-22]
- 앱스토어 N/T/여유: 활성 0 / 필요 546 / 30% 여유 42 · 24h 방문 70 요청 72 신규 1 (exhausted 416는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 716 (appstore 504 · danawa 7 · googleplay 163 · hackernews 14 · wordpress_org 28)
- 등록 속도(24h 새 타깃): 42
- 요청 예산 사용률(목표 90%↑): googleplay 47/31 도달 · n8n_community 27/28 근접
- 구글 플레이: 활성 25 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 1 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-10-22T14:29Z -->
(node:2424) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-10-22]
- 수집 연료계: 소비형 appstore 0.1일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 25곳(82cook, bobaedream, brunch, bubble_forum, damoang 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-02T19:25Z · 긴급
- appstore: 재고 0.1일(활성 0 + 즉시 예약 11) · 대기 예약 405 · 다음 자격 2026-10-22T19:20Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-01T04:42Z · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 3) · 대기 예약 1 · 다음 자격 2026-11-04T14:46Z · 경고
- clien: 순환형(활성 8) · 대기 예약 2 · 다음 자격 2026-10-31T05:05Z · 정상
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 정상
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-03T14:34Z · 경고
- googleplay: 순환형(활성 25) · 대기 예약 70 · 다음 자격 2026-10-31T05:09Z · 경고
- hackernews: 순환형(활성 5) · 대기 예약 85 · 다음 자격 2026-10-22T20:09Z · 경고
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
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-10-22T19:10Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 2개가 간격 대기 중(다음 자격 2026-11-02T19:25:05.196Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 405개가 간격 대기 중(다음 자격 2026-10-22T19:20:51.129Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-01T04:42:47.217Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-04T14:46:25.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T14:34:17.562Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 85개가 간격 대기 중(다음 자격 2026-10-22T20:09:48.091Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-03T23:33:44.577Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-10-22T19:10:16.720Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — brunch(활성 0), damoang(활성 0), disquiet(활성 1), fmkorea(활성 0), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 3), okky(활성 1), retool_community(활성 4), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-10-22T14:29Z -->
(node:2437) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-10-22]
- appstore 200→400 (2026-10-22T09:11Z, cc-ceo-staff-2026-10-22-v71bc): pending — 변경 5h 경과 — 24h 뒤 재평가
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1022건 × 보수 단가) ≈ $0.92 / 한도 $15 (6%) [추정]
- 상향 가능 소스(제안만):
  - 없음
