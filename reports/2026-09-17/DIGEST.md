# CMO 데일리 다이제스트 2026-09-17

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 2건 · 적립 2건 · 초안 1건.
2. 막힌 단계 없음.
3. 실패한 단계 1개 — 사람이 봐야 한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 2건
- 적립(committed): 2건
- 초안(drafted): 1건
- 스테이징(staged): 2건
- 막힘(blocked): 0단계
- 실패(failed): 1단계

## 병목 진단

- ❌ TRUST — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ DISTRIBUTION — 케이스 1곳 · 무브 2건 (Zapier). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 4 / 7
- ❌ `digest` 다이제스트·상태·커밋 — 커밋 화이트리스트 위반 — 화이트리스트 밖 1건: "ops/state/status-log-pending/2026-09-17-/352/270/260/355/203/200.md". 커밋하지 않았고 스테이징을 되돌렸다.

## 개선 방안

# 성과 분석 — 2026-09-17 (sa-cmo-analyst)

**결론 먼저**
- 이번 라운드 채점 가능 예측 0건 — 4건 전부 보류, 2건은 연결 누락으로 확인 불가. 규칙 신뢰도 판단 근거 없음.
- 커버리지는 4/7 병목만 매칭 성립(AWARENESS/CONVERSION/RETENTION/SUPPLY). TRUST·UNIT_ECONOMICS 는 0케이스, DISTRIBUTION 은 1케이스로 매칭 불가.
- 다음 앵글은 매칭 성립한 4개 안에서 고른다. TRUST 는 드래프트 중인 케이스 2건이 승인되면 갭이 풀리지만 아직 미승인.

## 채점 결과

- 유효 0 / 무효 0 / **보류 4** (표본 부족 — h168 스냅샷 미도달)
  - LOG-20260906-01: like_rate↑, share_rate↑ — 둘 다 보류
  - LOG-20260907-03: share_rate↑, like_rate↑ — 둘 다 보류
- **채점 불가 2건** (보류와 다른 사유 — 연결된 발행 글 없음): LOG-20260907-01, LOG-20260907-02
- 규칙별 신뢰도 — C-12 / G-8 / P-03 / P-09 전부 유효0·무효0·보류1, Wilson 하한 계산 불가(표본 1)
- **부트스트랩 경고**: 실측 스냅샷이 붙은 발행 글이 3건뿐(누적 10건 미만). 지금 나온 판정은 전부 참고값이며, 이걸로 "이 훅이 먹힌다/안 먹힌다"를 결론 내릴 수 없다.

## 커버리지 갭

- 매칭 가능 병목 **4/7**
- ❌ TRUST — 케이스 0곳·무브 0건 (갭)
- ❌ UNIT_ECONOMICS — 케이스 0곳·무브 0건 (갭)
- △ DISTRIBUTION — 케이스 1곳(Zapier)·무브 2건 — 1곳은 매칭 불가, 절반이 아니라 갭으로 센다
- ✅ AWARENESS — 케이스 3곳·무브 5건 (e.l.f. Beauty, GoPro, Pets.com)
- ✅ CONVERSION — 케이스 2곳·무브 2건 (ConvertKit, Homejoy) — 매칭 최소선
- ✅ RETENTION — 케이스 2곳·무브 5건 (Blue Apron, Fab.com)
- ✅ SUPPLY — 케이스 3곳·무브 6건 (Oatly, Peloton, Purple Innovation)

## 다음 앵글 후보 (최대 3)

1. **AWARENESS (e.l.f. Beauty / GoPro / Pets.com, 5무브)** — 매칭 병목 중 케이스·무브가 가장 두껍고, 오늘 드래프트 큐(RETENTION 2건)와 겹치지 않아 바로 이어 뽑을 수 있다.
2. **SUPPLY (Oatly / Peloton / Purple Innovation, 6무브)** — 매칭 병목 중 무브 수가 최다라 앵글 소진 위험이 가장 낮다.
3. **CONVERSION (ConvertKit / Homejoy, 2무브)** — 케이스 2곳으로 매칭 최소선에 걸려 있다. 지금 소비하지 않으면 새 케이스가 들어오기 전까지 이 병목의 앵글이 늘지 않는다.

## 확인 못 한 것

- LOG-20260906-01 / -03 의 h168 스냅샷이 "아직 시점이 안 됐다"인지 "수집 실패"인지 원자료에 구분자가 없어 확인 불가.
- LOG-20260907-01 / -02 가 "발행 안 됨"인지 "발행됐지만 로그 연결이 빠짐"인지 원자료로는 확인 불가 — 이건 보류(표본 부족)와 다른 결함이라 별도 항목으로만 표시했다.
- 무브 단위 후보를 케이스명까지만 확인했고, 개별 무브의 구체 내용(무엇을 다뤘는지)은 이 원자료에 없어 CMO/researcher 쪽 케이스 파일 확인이 필요하다.
- TRUST 드래프트 2건(everlane, zenefits)의 승인 상태는 이 분석 범위 밖(DB 접근 없음)이라 갭 해소 여부를 단정하지 않았다.

## 다음 주 주목 지표

- `like_rate` — blue-apron-paid-acquisition-treadmill (이번에 스테이징한 초안의 예측)
- `reply_rate` — blue-apron-paid-acquisition-treadmill (이번에 스테이징한 초안의 예측)
- `like_rate` — fab-com-curation-retention-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — fab-com-curation-retention-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-17-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-17 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-17T22:50:46.613Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 9건 / 후보 10건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 3건 (내일 다시 후보): blue-apron-paid-acquisition-treadmill/OPERATIONS(A), blue-apron-paid-acquisition-treadmill/CHANNEL(A), fab-com-curation-retention-collapse/OPERATIONS(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":3,"transferability_unrated":9})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})
- ❌ `digest` 다이제스트·상태·커밋 — 커밋 화이트리스트 위반 — 화이트리스트 밖 1건: "ops/state/status-log-pending/2026-09-17-/352/270/260/355/203/200.md". 커밋하지 않았고 스테이징을 되돌렸다.
- ℹ️ Notion 푸시: cal-transparency-trust-3de100b7ffb481f7b7d1e7bdaadac375 ✅ DISCOVERY-2026-09-17 → https://app.notion.com/p/DISCOVERY-2026-09-17-3de100b7ffb48143a9e0f9ff5aaab976 푸시 완료 — 초안 2건 · 신규케이스 2건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-18-CMO-2 기록·재확인

_실행 키 `cmo-2026-09-17-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
