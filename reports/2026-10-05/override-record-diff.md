# 소유자 예외 사용 기록 — 최소 수정안 (미적용, 남헌 승인 대기)

> v19 C. 러너가 소유자 예외(`review_sources.override='owner_2026-10-05'`, robots 금지 통과)를 쓴 요청 수를 수집 요약에 남긴다.
> **코드에 반영하지 않았다.** 남헌 승인 뒤 오케스트레이터가 `git apply` 로 적용한다. 기준: `feat/ramp-wiring` 브랜치의 `scripts/review-collect.mjs`.

한 줄 설명: 러너는 이미 `RunResult.robotsOwnerOverride`(lib/review/runner.ts:185, 반환 :821)를 세고 있는데, review-collect.mjs 가 그 값을 요약에도 sourceResults 에도 꺼내지 않는다 — 요약 줄 1개와 sourceResults 필드 1개만 더한다(`health.warnings` 는 건드리지 않는다).

```diff
--- a/scripts/review-collect.mjs
+++ b/scripts/review-collect.mjs
@@ -278,6 +278,8 @@
       .map(([h, c]) => `${h}: ${c}`)
       .join(', ')
     say(`- robots 예외 통과 ${result.robotsBypassed ?? 0}건${bypassHosts ? `(${bypassHosts})` : ''}`)
+    // 소유자 예외(OWNER_ROBOTS_OVERRIDE, §7.1)로 robots 금지를 통과한 요청. 0 이어도 찍는다(위 줄과 같은 이유).
+    say(`- 소유자 예외 사용 ${result.robotsOwnerOverride ?? 0}건`)
     // ⚠️ 0 이어도 찍는다. "신규 0건"과 "중복만 받았다"는 다른 사건이고, 이 줄이
     //    없으면 둘이 똑같이 보인다(§7.1). 같은 글이 `url:`·`board:` 두 타깃으로
     //    들어오는 것을 2차 방어(content_hash)가 걸러낸 수다.
@@ -339,5 +341,6 @@
     // 소스 고장 보고(review-source-health-report.mjs)의 재료. 러너는 더 이상 review_sources 에 판정을 쓰지 않는다.
     health: result?.health ?? null,
     perTarget: result?.perTarget ?? [],
+    robotsOwnerOverride: result?.robotsOwnerOverride ?? 0,
   })
 }
```

- 저장(`review_collection_runs`)은 안 한다 — 칸이 없고 새 컬럼은 마이그가 필요하다(robotsBypassed 와 같은 처지).
- sourceResults 필드는 Notion CTO 행(`review-collect-status.mjs`)이 나중에 쓸 재료 자리다. 그 파일은 이 수정안에서 바꾸지 않는다.
- 적용 뒤 확인: `node scripts/review-runner-selftest.mjs`(카운트 `소유자 예외: 사용 건수를 센다`) + `node scripts/review-ramp-selftest.mjs`.
