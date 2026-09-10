# HN Firebase 옵션 C — dead/deleted 지속측정

같은 표본(Airtable·Zapier, `search_by_date` page 0, 각 50댓글)을 날짜마다 다시 재서
아래에 **append** 한다. 덮어쓰지 않는다.

**왜:** Stage 2 실측(2026-09-10)에서 옵션 C 의 원래 목적 — Algolia 인덱스가 라이브
HN 보다 지연돼 남는 `dead`/`deleted` 댓글을 걸러내기 — 은 수집 시점 최근 댓글
50건 중 stale 0건으로 값이 안 나왔다. `docs/review-source-findings.md` 가설이
맞다면 **며칠 지나며** 그 댓글들 중 일부가 dead/deleted 로 바뀌어 stale 합이
커져야 한다. 그게 사실이면 C 가 필요하다는 근거가 되고, 계속 0 이면 A/B 로 충분하다.

- 측정 스크립트: `scripts/hn-firebase-c-track.mjs`
- 트리거: `.github/workflows/hn-firebase-c-probe.yml` — `workflow_dispatch` 전용(크론 없음)
- DB 미접속. 프로덕션 나이틀리 수집과 무관.

## 판독 기준

- **stale 합**(dead + deleted + 사라짐)이 날짜가 갈수록 커지면 → 인덱스 지연 가설이
  맞고, C 의 필터링 가치가 실재한다.
- 계속 0 근처면 → 최근 댓글에 한해 A/B 로 충분하다(C 요청비용 50배를 정당화 못 함).
- 3~5일(남헌 확인 후 조정) 쌓고 판단한다.

---

<!-- 엔트리는 이 아래에 날짜순으로 붙는다. 첫 실행은 workflow_dispatch 로. -->

## 2026-09-10

- 총 실측 요청: 168건 · 표본: search_by_date page 0 × 2 쿼리

| 쿼리 | 댓글 | 확인 | dead | deleted | 사라짐 | **stale 합** | 자식답글 | 스토리 | score(min–med–max) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Airtable | 50 | 50 | 0 | 0 | 0 | **0** | 26 | 27 | 2–109–1242 |
| Zapier | 50 | 50 | 0 | 0 | 0 | **0** | 16 | 39 | 1–138–1765 |

- 나이틀리 예산(간격 2000ms, 상한 200): C 는 타깃당 P페이지에 요청 ≈ P + 50P건. 1페이지면 51건(1분), 5페이지면 255건(상한 초과).
  (B 는 P + 스토리 33개 ≈ 34건/페이지)

