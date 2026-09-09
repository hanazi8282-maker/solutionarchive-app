# 조사 노트 — Juicero (juicero-viral-trust-collapse)

- 큐 사유: `failure_quota` — AWARENESS 병목, 실패/피벗/철수 사례 할당분.
- 대상 브랜드는 "미정"이라 WebSearch로 직접 선정. 이미 적립된 20개 slug와 겹치지 않음을 확인.
- 선정 근거: VC PR로 하이프성 인지도를 먼저 만들고 제품 실체가 뒤따르길 기대한 하드웨어 D2C. 2017-04-19 Bloomberg의 손-으로-짜기 폭로가 바이럴로 터지면서, 인지도를 만든 것과 같은 채널(SNS 밈·언론)이 그대로 신뢰 붕괴를 증폭시킨 뒤 6주~5개월 사이 가격인하·반박영상·인력감축을 시도했지만 2017-09-01 폐업. `outcome_direction=negative`를 그대로 유지했고, 교훈을 억지로 positive로 바꾸지 않았다.

## 병목 / 무브 / 등급

- 병목: **AWARENESS** (하이프 기반 인지도 → 동일 채널의 역풍으로 신뢰 붕괴)
- 무브 1 — `PRICING`: 2017-01-17, $699→$399 조기 인하 (Black Friday 테스트에서 사용자 2배 증가 근거, 회사 자체 발표). 등급 **C** (자기보고 1차 + TechCrunch 보도, 둘 다 같은 관측 `juicero-pricecut-jan2017`이라 독립 관측 미달). `outcome_direction=mixed` — 단기 신호는 있었으나 근본 문제(신뢰)를 해결하지 못함.
- 무브 2 — `OPERATIONS`: 2017-07-14, 인력 25% 감축 + 추가 가격인하 발표. 그러나 6주 뒤 2017-09-01 전면 폐업. 등급 **C** (근거 2건, 독립 원 관측 0개 — Fortune 보도 2건이 각각 다른 사건이라 별개 관측키를 부여했지만 둘 다 자기보고성 발표를 다룬 것이라 교차확인은 못 됨). `outcome_direction=negative`. §7.1/§2-4 규칙대로, 부정 사례인데 등급 A가 아니므로 **발행 불가 — 사내 참고용으로만 저장**. validator가 이 경고를 정확히 냈다(`⚠️ moves[1]: 부정 사례인데 등급 C`).

## validate 결과

- `node scripts/case-research.mjs validate --slug juicero-viral-trust-collapse` 직접 실행.
- 출력: `검증 대상 1건 · error 0건` / `✅ 전부 통과`. warn 2건(무브별 grade 안내) + 부정사례 등급 경고 1건은 차단이 아니라 정상 경고.
- exit code: 명령이 `✅ 전부 통과`로 종료했고 error 0건 — 통과로 확인. (셸 체이닝 권한 제약으로 `$?`를 별도 echo하진 못했으나, 스크립트 자체가 error>0이면 비정상 종료 문구와 함께 실패로 표시하도록 되어 있고 이번엔 그 문구가 없었다.)

## 못 찾은 것 (확인 불가로 남긴 것)

- **정확한 총 투자유치액**: 소스마다 $118.5M~$134M로 갈린다 (Crunchbase/Tracxn/Axios 등 집계 방식 차이). 비상장사라 공시 없음 → `is_estimate=true`로 표시, 케이스 레벨 컨텍스트로만 남기고 어떤 무브의 metric에도 쓰지 않았다.
- **정확한 감축 전/후 직원 수(절대 인원)**: 언론 보도에는 "약 25%"라는 비율만 있고 절대 인원수는 확인 못 했다. `metric_unit`을 절대 인원이 아니라 `% of pre-layoff headcount`로 적어 확인한 것만 반영했다.
- **회사 자체의 월 손실액($4M/월로 도는 통설)**: Bloomberg "Inside Juicero's Demise" 원문이 403으로 막혀 WebFetch로 직접 확인 못 했다. WebSearch 요약에서만 언급됐고 1차 문서를 못 읽었으므로 이번 초안에는 넣지 않았다(확인 불가를 양성으로 접지 않음, §7.1).
- **outcome_status='shutdown' 이후 자산 인수 여부(브랜드 부활 등)**: 조사 범위 밖. `outcome_status`는 2017-09-01 폐업 발표까지만 확인했고, 그 이후 자산이 어떻게 처리됐는지는 확인하지 않았다 — `active`로 착각할 근거가 없어 shutdown으로 고정.
