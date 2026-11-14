# 한도 대장 일일 갱신 2026-11-15

하루 4회 bottleneck-watch 가 덧붙인다. 읽기 전용 — 제안·판정만, 적용은 사람·역할 세션.


<!-- 2026-11-14T15:46Z -->
(node:2298) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[병목 2026-11-15]
- 앱스토어 N/T/여유: 활성 10 / 필요 192 / 30% 여유 25 · 24h 방문 19 요청 77 신규 2660 (exhausted 505는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 202 (appstore 157 · danawa 7 · googleplay 35 · wordpress_org 3)
- 등록 속도(24h 새 타깃): 15
- 요청 예산 사용률(목표 90%↑): appstore 77/50 도달 · github_issues 50/30 도달 · googleplay 11/11 도달
- 구글 플레이: 활성 17 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 2 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

<!-- 2026-11-14T15:46Z -->
(node:2313) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/review/target-supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[재고 게이지 2026-11-15]
- 수집 연료계: 소비형 appstore 4.5일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 25곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-20T13:15Z · 긴급
- appstore: 재고 4.5일(활성 10 + 즉시 예약 124) · 대기 예약 381 · 다음 자격 2026-11-14T17:49Z · 경고
- bobaedream: 순환형(활성 1) · 대기 예약 0 · 경고
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 1 · 다음 자격 2026-11-23T23:13Z · 경고
- clien: 순환형(활성 6) · 대기 예약 3 · 다음 자격 2026-11-15T05:52Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 1) · 대기 예약 0 · 경고
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 40) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 1) · 대기 예약 1 · 다음 자격 2026-11-15T08:18Z · 경고
- googleplay: 순환형(활성 17) · 대기 예약 16 · 다음 자격 2026-11-15T05:58Z · 경고
- hackernews: 순환형(활성 5) · 대기 예약 82 · 다음 자격 2026-11-14T17:51Z · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 3 · 다음 자격 2026-11-21T21:13Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 1 · 다음 자격 2026-11-26T00:21Z · 긴급
- make_community: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-11-15T18:37Z · 긴급
- n8n_community: 순환형(활성 3) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-11-23T00:21Z · 경고
- softr_community: 순환형(활성 1) · 대기 예약 2 · 다음 자격 2026-11-23T00:21Z · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 2) · 대기 예약 0 · 경고
- wordpress_org: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-11-15T21:33Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 42 · 다음 자격 2026-11-15T21:30Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - 82cook: 예약 1개가 간격 대기 중(다음 자격 2026-11-20T13:15:58.578Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - appstore: 보충 보류 — 24h 차단·쿼터 신호 1건(상향 금지)
  - bubble_forum: 예약 1개가 간격 대기 중(다음 자격 2026-11-23T23:13:24.148Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 3개가 간격 대기 중(다음 자격 2026-11-15T05:52:16.289Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - glide_community: 예약 1개가 간격 대기 중(다음 자격 2026-11-15T08:18:33.340Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 16개가 간격 대기 중(다음 자격 2026-11-15T05:58:23.891Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 82개가 간격 대기 중(다음 자격 2026-11-14T17:51:07.721Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 3개가 간격 대기 중(다음 자격 2026-11-21T21:13:52.482Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 1개가 간격 대기 중(다음 자격 2026-11-26T00:21:50.044Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - make_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-15T18:37:16.852Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - retool_community: 예약 3개가 간격 대기 중(다음 자격 2026-11-23T00:21:24.709Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - softr_community: 예약 2개가 간격 대기 중(다음 자격 2026-11-23T00:21:37.106Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 5개가 간격 대기 중(다음 자격 2026-11-15T21:33:47.031Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 42개가 간격 대기 중(다음 자격 2026-11-15T21:30:13.654Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 12곳 — bobaedream(활성 1), brunch(활성 0), damoang(활성 0), devto(활성 1), disquiet(활성 1), fmkorea(활성 0), n8n_community(활성 3), okky(활성 1), theqoo(활성 0), tumblbug(활성 0), velog(활성 2), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫

<!-- 2026-11-14T15:46Z -->
(node:2326) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/solutionarchive-app/solutionarchive-app/lib/analysis/budget.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/solutionarchive-app/solutionarchive-app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
[한도 재평가 2026-11-15]
- 최근 72h 한도 변경 없음
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 2474건 × 보수 단가) ≈ $2.23 / 한도 $15 (15%) [추정]
- 상향 가능 소스(제안만):
  - 없음
