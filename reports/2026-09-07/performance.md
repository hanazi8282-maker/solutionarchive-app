# 성과 원자료

## score-predictions
```
(출력 없음)
```
exit 1

## coverage
```
# 병목별 승인 커버리지

  (매칭이 성립하려면 **서로 다른 케이스 2곳 이상**이 필요하다)

  ✅ AWARENESS       케이스 2곳 · 무브 4건 — e.l.f. Beauty, Nubank (Nu Holdings)
  ✅ TRUST           케이스 2곳 · 무브 4건 — Carvana, Warby Parker
  ✅ CONVERSION      케이스 2곳 · 무브 4건 — Slack, Notion
  ✅ RETENTION       케이스 2곳 · 무브 4건 — Chewy, Duolingo
  ✅ UNIT_ECONOMICS  케이스 2곳 · 무브 4건 — Casper, 컬리 (마켓컬리)
  ✅ DISTRIBUTION    케이스 2곳 · 무브 4건 — 조선미녀 (Beauty of Joseon), Figma
  ✅ SUPPLY          케이스 3곳 · 무브 6건 — Oatly, Peloton, Purple Innovation

매칭 가능 병목 7 / 7
```
exit 0


# 해설

## CMO 성과 분석 — 2026-09-07

**결론**: 예측 채점은 실행 자체가 실패해 **확인 불가**(규칙 신뢰도 갱신 못 함). 커버리지는 7/7 병목 매칭 완료·갭 없음. 다음 앵글은 성과 데이터가 아니라 "오늘 이미 다룬 병목"과 "케이스 조사는 끝났는데 초안이 없는 병목"만으로 고른다.

## 예측 채점 (score-predictions.mjs)
- 유효 0 / 무효 0 / 보류 0 — 셋 다 아니다. **확인 불가**: exit 1 이 잡혔는데 원문 로그가 없다.
- 스크립트 자체 규격(주석): exit 0=예측 0건(정상), exit 1=파싱 에러, exit 2=링크 테이블 없음. exit 1 은 "예측을 썼는데 못 읽은 것"이지 "0건"이 아니다 — 0건으로 접지 않는다.
- 이 결과로는 어떤 훅·규칙이 먹히는지 안 먹히는지 판단 근거를 하나도 못 낸다.

## 커버리지 (case-match --coverage)
- 매칭 가능 병목 **7/7** — 오늘 기준 갭 없음.
- AWARENESS: 케이스 2·무브 4 (e.l.f. Beauty, Nubank) — Threads 초안 미착수, 케이스 조사는 완료(`elf-beauty-awareness-engine.json`, `nubank-word-of-mouth-acquisition.json`).
- TRUST: 케이스 2·무브 4 (Carvana, Warby Parker) — 오늘 carvana 초안 기록됨.
- CONVERSION: 케이스 2·무브 4 (Slack, Notion) — Threads 초안 미착수, 조사는 완료(`slack-bottom-up-conversion.json`, `notion-template-gallery.json`).
- RETENTION: 케이스 2·무브 4 (Chewy, Duolingo) — Threads 초안 미착수, 조사는 완료(`chewy-autoship-retention.json`, `duolingo-streak.json`).
- UNIT_ECONOMICS: 케이스 2·무브 4 (Casper, 컬리) — 오늘 casper 초안 기록됨.
- DISTRIBUTION: 케이스 2·무브 4 (조선미녀, Figma) — Threads 초안 미착수, 조사는 완료(`beauty-of-joseon.json`, `figma-non-designer-distribution.json`).
- SUPPLY: 케이스 3·무브 6 (Oatly, Peloton, Purple Innovation) — 오늘 peloton 초안 기록됨.

## 다음 앵글 후보 (최대 3)
1. **AWARENESS — e.l.f. Beauty × Nubank**: 게이트(2케이스) 통과, 케이스 조사 완료, Threads 초안은 0건 — 착수 비용이 이미 가장 낮다.
2. **CONVERSION — Slack × Notion**: 동일하게 조사 완료·초안 0건. 무브 4건 중 하나도 안 나갔다.
3. **RETENTION — Chewy × Duolingo**: 미착수 병목 중 하나. DISTRIBUTION과 우선순위 동률이며, 성과 데이터가 확인 불가라 이 이상 순위를 매길 근거가 없다.

## 확인 못 한 것
- score-predictions 원문 에러 메시지 — 이 세션에서 재실행이 승인 대기로 막혀 원인(정본 파일 누락 vs 예측 블록 파싱 실패)을 특정 못 함.
- threads-report.mjs(발행 지표) — 원자료에 포함 안 됨, 이번 분석 범위 밖.
- DISTRIBUTION의 실제 착수 여부는 `drafts/threads/` 파일명 기준 판단이며, 진행 중인 별도 작업이 있는지는 미확인.
