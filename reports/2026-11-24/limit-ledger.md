# 한도 대장 일일 갱신 2026-11-24

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-23T21:16Z -->
(node:2665) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-24]
- 앱스토어 N/T/여유: 활성 100 / 필요 437 / 30% 여유 0 · 24h 방문 68 요청 100 신규 1508 (exhausted 756는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 368 (appstore 337 · danawa 7 · googleplay 24)
- 등록 속도(24h 새 타깃): 22
- 요청 예산 사용률(목표 90%↑): appstore 100/100 도달 · devto 43/42 도달 · github_issues 30/30 도달 · googleplay 22/22 도달
- 구글 플레이: 활성 49 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-23T21:16Z -->
(node:2680) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-24]
- 수집 연료계: 소비형 appstore 6.2일 · youtube 0.3일 (14일 미만 2/2개) · 순환형 이상 34곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 1) · 대기 예약 0 · 경고
- appstore: 재고 6.2일(활성 100 + 즉시 예약 291) · 대기 예약 465 · 다음 자격 2026-11-23T23:02Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 7) · 대기 예약 0 · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- dcinside: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- frappe_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- ghost_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- github_issues: 순환형(활성 43) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-30T00:57Z · 경고
- googleplay: 순환형(활성 49) · 대기 예약 20 · 다음 자격 2026-11-24T01:12Z · 경고
- hackernews: 순환형(활성 19) · 대기 예약 60 · 다음 자격 2026-11-23T23:03Z · 경고
- invoiceninja_forum: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-12-03T07:43Z · 긴급
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-24T01:18Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- mautic_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- obsidian_forum: 순환형(활성 0) · 대기 예약 0 · 긴급
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-28T08:08Z · 긴급
- ruliweb: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-12-03T09:41Z · 긴급
- shopify_community: 순환형(활성 2) · 대기 예약 0 · 경고
- softr_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-28T12:35Z · 경고
- suitecrm_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-30T19:56Z · 긴급
- wordpress_org: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-28T01:18Z · 경고
- youtube: 재고 0.3일(활성 22 + 즉시 예약 0) · 대기 예약 163 · 다음 자격 2026-11-24T00:38Z · 경고
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 예약 465개가 간격 대기 중(다음 자격 2026-11-23T23:02:33.474Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T00:57:56.156Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 20개가 간격 대기 중(다음 자격 2026-11-24T01:12:49.256Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 60개가 간격 대기 중(다음 자격 2026-11-23T23:03:45.127Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - invoiceninja_forum: 예약 2개가 간격 대기 중(다음 자격 2026-12-03T07:43:26.969Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 2개가 간격 대기 중(다음 자격 2026-11-24T01:18:06.505Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 2개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-28T08:08:48.304Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - ruliweb: 예약 1개가 간격 대기 중(다음 자격 2026-12-03T09:41:36.284Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-28T12:35:13.705Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 2개가 간격 대기 중(다음 자격 2026-11-30T19:56:23.774Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 1개가 간격 대기 중(다음 자격 2026-11-28T01:18:23.087Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 163개가 간격 대기 중(다음 자격 2026-11-24T00:38:33.283Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 21곳 — 82cook(활성 1), bobaedream(활성 1), brunch(활성 0), clien(활성 7), damoang(활성 0), dcinside(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), frappe_forum(활성 2), ghost_forum(활성 2), make_community(활성 2), mautic_forum(활성 2), n8n_community(활성 3), obsidian_forum(활성 0), okky(활성 1), shopify_community(활성 2), suitecrm_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-23T21:16Z -->
(node:2694) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-24]
- hackernews 540→270 (2026-11-23T00:00Z, yield-realloc): pending — 변경 21h 경과 — 24h 뒤 재평가
- okky 150→75 (2026-11-23T00:00Z, yield-realloc): pending — 변경 21h 경과 — 24h 뒤 재평가
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1475건 × 보수 단가) ≈ $1.33 / 한도 $15 (9%) [추정]
- 상향 가능 소스(제안만):
  - 없음
