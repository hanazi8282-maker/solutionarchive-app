# 한도 대장 일일 갱신 2026-11-08

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-07T15:38Z -->
(node:2494) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-08]
- 앱스토어 N/T/여유: 활성 5 / 필요 164 / 30% 여유 33 · 24h 방문 28 요청 36 신규 172 (exhausted 501는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 229 (appstore 126 · danawa 7 · googleplay 37 · hackernews 24 · shopify_apps 5 · wordpress_org 30)
- 등록 속도(24h 새 타깃): 1
- 요청 예산 사용률(목표 90%↑): github_issues 39/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 2 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-07T15:38Z -->
(node:2587) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-08]
- 수집 연료계: 소비형 appstore 4.1일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 4.1일(활성 5 + 즉시 예약 97) · 대기 예약 404 · 다음 자격 2026-11-07T22:44Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
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
- hackernews: 순환형(활성 10) · 대기 예약 76 · 다음 자격 2026-11-07T16:41Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-07T20:30Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 0 · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-13T07:46Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-07T22:54Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 404개가 간격 대기 중(다음 자격 2026-11-07T22:44:45.536Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 76개가 간격 대기 중(다음 자격 2026-11-07T16:41:42.467Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 1개가 간격 대기 중(다음 자격 2026-11-07T20:30:54.448Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 3개가 간격 대기 중(다음 자격 2026-11-13T07:46:25.610Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-07T22:54:52.629Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — bobaedream(활성 1), brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), kakao_cafe(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-07T15:38Z -->
(node:2601) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-08]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1867건 × 보수 단가) ≈ $1.68 / 한도 $15 (11%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-07T19:25Z -->
(node:2284) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-08]
- 앱스토어 N/T/여유: 활성 0 / 필요 165 / 30% 여유 37 · 24h 방문 29 요청 42 신규 114 (exhausted 506는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 241 (appstore 128 · danawa 7 · googleplay 39 · hackernews 26 · shopify_apps 7 · wordpress_org 34)
- 등록 속도(24h 새 타깃): 1
- 요청 예산 사용률(목표 90%↑): devto 42/42 도달 · github_issues 30/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 2 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-07T19:25Z -->
(node:2297) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-08]
- 수집 연료계: 소비형 appstore 3.7일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 3.7일(활성 0 + 즉시 예약 92) · 대기 예약 414 · 다음 자격 2026-11-07T22:44Z · 경고
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
- googleplay: 순환형(활성 13) · 대기 예약 23 · 다음 자격 2026-11-08T04:57Z · 경고
- hackernews: 순환형(활성 8) · 대기 예약 77 · 다음 자격 2026-11-08T04:42Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-07T20:30Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 0 · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 2) · 대기 예약 3 · 다음 자격 2026-11-13T07:46Z · 경고
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-07T22:54Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 414개가 간격 대기 중(다음 자격 2026-11-07T22:44:45.536Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-10T15:52:00.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 77개가 간격 대기 중(다음 자격 2026-11-08T04:42:34.397Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 1개가 간격 대기 중(다음 자격 2026-11-07T20:30:54.448Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 3개가 간격 대기 중(다음 자격 2026-11-13T07:46:25.610Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-07T22:54:52.629Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 11곳 — brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), kakao_cafe(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-07T19:25Z -->
(node:2311) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-08]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1867건 × 보수 단가) ≈ $1.68 / 한도 $15 (11%) [추정]
- 상향 가능 소스(제안만):
  - 없음

<!-- 2026-11-08T00:31Z -->
(node:2285) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-08]
- 앱스토어 N/T/여유: 활성 1 / 필요 165 / 30% 여유 35 · 24h 방문 25 요청 38 신규 101 (exhausted 505는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 218 (appstore 129 · danawa 7 · googleplay 41 · hackernews 26 · shopify_apps 9 · wordpress_org 6)
- 등록 속도(24h 새 타깃): 0
- 요청 예산 사용률(목표 90%↑): devto 42/42 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 13 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 2 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-08T00:31Z -->
(node:2300) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-08]
- 수집 연료계: 소비형 appstore 3.3일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 26곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 3.3일(활성 1 + 즉시 예약 82) · 대기 예약 423 · 다음 자격 2026-11-08T14:44Z · 경고
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
- googleplay: 순환형(활성 13) · 대기 예약 23 · 다음 자격 2026-11-08T04:57Z · 경고
- hackernews: 순환형(활성 5) · 대기 예약 86 · 다음 자격 2026-11-08T04:42Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 0 · 긴급
- make_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T18:37Z · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-08T10:23Z · 경고
- shopify_apps: 순환형(활성 6) · 대기 예약 2 · 다음 자격 2026-11-12T06:40Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-08T06:57Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-12T00:49Z · 긴급
- wordpress_org: 순환형(활성 1) · 대기 예약 4 · 다음 자격 2026-11-13T07:46Z · 경고
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-08T07:57Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 예약 423개가 간격 대기 중(다음 자격 2026-11-08T14:44:30.606Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 1개가 간격 대기 중(다음 자격 2026-11-10T15:52:00.541Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 2개가 간격 대기 중(다음 자격 2026-11-09T16:35:12.848Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 4개가 간격 대기 중(다음 자격 2026-11-12T22:16:26.112Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - hackernews: 예약 86개가 간격 대기 중(다음 자격 2026-11-08T04:42:34.397Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 1개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-08T10:23:45.344Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T06:40:27.672Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-08T06:57:01.122Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-12T00:49:43.988Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 4개가 간격 대기 중(다음 자격 2026-11-13T07:46:25.610Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-08T07:57:43.776Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 11곳 — brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), kakao_cafe(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-08T00:31Z -->
(node:2314) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-08]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1856건 × 보수 단가) ≈ $1.67 / 한도 $15 (11%) [추정]
- 상향 가능 소스(제안만):
  - 없음
