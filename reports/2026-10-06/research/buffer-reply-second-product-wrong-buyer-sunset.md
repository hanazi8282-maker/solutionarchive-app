# 조사 노트 — Buffer Reply (큐: failure_quota, 2026-10-06)

대상은 "미정"이라 웹서치로 정했다. 1인·소규모 SaaS 실패 사례를 먼저 찾았지만 아래 이유로 Buffer Reply 로 갔다.

## 선정 경위 (다른 후보를 버린 이유)
- Voiczy(1인 개발 언어학습 SaaS, 유료 11명 전원 이탈): 원문이 Substack 이라 WebFetch 가 403. 검색 요약만 있고 1인칭 원문을 직접 열지 못해 제외 — 확인 불가를 근거로 쓰지 않았다.
- LeaderBird(플랫폼 의존): 같은 403. 게다가 meerkat·wesabe 와 병목이 겹친다.
- Elliot Bonneville 가격 검증 실패(HN 23033448): 원문(elliotbonneville.com)이 검색에 안 잡혔고 content-goblin(저가 요금제·지원 부담)과 겹친다.
- UIPrompt(구독→1회 구매): 실패·철수 사례가 아니라 진행 중(결과 미정).
- 채택: Buffer Reply. 창업자 CEO 본인 글 3건(인수 발표·인수 후 월간 리포트·종료 공지)을 직접 열어 확인했다. Buffer 는 직원 65명 이상이라 1인 창업가가 아니다 — 큐 지침대로 transfer_note 에 "옮길 부분"을 명시했다.

## 1인칭 출처 (사고의 흐름)
- 2015-12-17 인수 발표(Joel Gascoigne): "fast customer development around whether our customers were already also doing customer service and using a tool for that" — 인수 전 검증이 '이미 그 일을 하는지'를 보는 수준이었다.
- 2015-12-21 월간 업데이트: Respondly MRR $4k, "many Buffer customers already also do social media customer service" — 인수 근거.
- 2016-08-04 Respond 월간 리포트: 유료 고객 100곳 근접, 이탈 월 3곳, 매출 전월 대비 +3%, 몇 달째 성능·버그 문제.
- 2020-05-11 종료 공지: Reply 고객 500곳 vs Buffer 유료 7만 곳 이상, 대부분 대기업, "Buffer 를 키운 전략과 팀의 강점이 Reply 에 필요한 것과 달랐다", 2020-06-01 종료.
- 추론 흐름: 관찰(기존 고객이 고객지원을 한다) → 추론(그 도구도 우리에게서 살 것이다) → 결과(실제 구매자는 대기업이었고 소규모 사업자 기반과 겹치지 않음).

## 무브
- 0 OFFER (negative, 수치 있음: 100곳→500곳): '이미 한다'를 '살 것이다'로 읽은 가정. 근거 5건(원 관측 5개) — validate 는 A 로 판정, 사실확인 C(자기보고 1차뿐).
- 1 OPERATIONS (negative, 수치 없음): 버그·성능·개선 속도 부족. 근거 3건. 등급 C.
- 2 PARTNERSHIP (mixed, 수치 없음): 종료 공지 21일 + 대체 서비스 3곳 제휴. 근거 2건. 고객 유지 효과는 글에 없다. 억지로 positive 로 돌리지 않고 mixed.

## 못 찾은 것 (확인 불가)
- Reply 매출·MRR 추이(종료 공지에 없음), 정확한 인수가(계약상 비공개), 종료 시점 직원 수, 전환 혜택으로 실제 옮겨 간 고객 수.
- 2016-08 "nearing 100"은 근사치다 — 무브 0 의 before=100 은 "약"이다. 4년간 100→500 증가는 두 시점 사이의 비교일 뿐 연속 추이가 아니다.
- 인수 전 고객 개발에서 '몇 명'이 그렇다고 답했는지(비율·표본 크기) 원문에 없다.
- price_band: 요금제 가격을 확인하지 못해 비웠다(validate 경고).
- 종료 이후 Reply 사업이 다른 곳에서 이어졌는지는 확인하지 않았다 — outcome_status=shutdown 은 Buffer 공지 기준.
- 검색 요약이 말한 "$4k MRR"은 처음엔 인수 발표 글에서 안 나왔다. 2015-12-21 월간 업데이트에서 직접 확인했고 그 출처만 인용했다.

## 어휘 메모
- reader_problem: '기존 고객에게 새 제품을 팔려다 막힌다'에 정확히 맞는 코드가 없다. 가장 가까운 NO_CHANNEL 로 두었다(기존 채널이 새 제품의 구매자에게 닿지 않음).
- 이식성은 판정하지 않았다(사람이 승인 시 고름).

## VOC
VOC 해당 없음 — ops/state/voc-inputs/index.md 에 Buffer·소셜 고객지원 도구 프로젝트가 없다. voc_inputs 는 비웠다.

## validate
`node scripts/case-research.mjs validate --slug buffer-reply-second-product-wrong-buyer-sunset` — error 0건, "전부 통과" 출력 확인. (종료 코드 숫자는 셸 제약으로 별도 캡처하지 못했다.) 무브 등급 A1 C2, 경고 5건(price_band 비어 있음, 부정 사례라 사실확인 A 아니면 발행 불가).
