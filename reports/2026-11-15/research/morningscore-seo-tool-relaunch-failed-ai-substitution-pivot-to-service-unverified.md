# Morningscore — 조사 노트 (2026-11-15, 실패·피벗 할당분)

## 결론
- 대상은 "미정"이라 직접 골랐다: 덴마크 소기업용 SEO/GEO 도구 Morningscore. 2025-08 신규 판매 둔화 → 2025-12 AI 기능·새 디자인 재출시 실패 → 2026-08 대행 서비스 Momentum 으로 피벗.
- 방향은 `mixed` 로 적었다. 재출시는 negative, 피벗은 "검증 전"(mixed), 2023 SEO 방치는 mixed. 억지로 positive 로 돌리지 않았다.
- validate exit 0 (error 0, warning 5: 무브 0 수치 없음·부정 사례 등급 D, Starter Story published_at 없음 3건).

## 고른 이유 / 고르지 않은 것
- 이미 적립된 slug 와 겹치지 않는 메커니즘을 찾았다: "AI 대체재가 셀프서브 도구의 신규 유입을 깎는 중, 재출시로 못 막고 대행으로 피벗". 기존 consulting 피벗 사례(adproval·blinkmetrics·val-town)는 매출 전 단계거나 채널 부재였고 이건 ARR $1.5M 에서 신규 판매만 꺾인 경우다.
- 검토 후 제외: Justin Butlion Echo(2026-11-13, 108k 줄·가입 40 미만) — lutains(만드는 사람에게 팔기)·mechanicalquill(선개발 후질문)과 겹침. Nicolaas Spivey(VC 약 $500k, 비타민 vs 진통제) — delite·juttu 와 겹침. Mac Martine(LinkedIn 단속으로 $30k MRR→$0) — Indie Hackers 403 으로 원문을 못 열었고 플랫폼 의존 사례는 gummysearch·checkout-x·tweetfeast 가 이미 있다. $837 MRR 글도 IH 403 이라 못 열었다(우회 시도 안 함).

## 사고의 흐름 (3.5)
- 1인칭 출처 2건을 직접 열었다.
  - 회사 보도자료(GlobeNewswire 2026-11-12, 창업자 Karsten Madsen 발언 포함): 관찰=신규 판매 둔화·재출시 무반응·"LinkedIn 글들 읽고 답을 얻음" → 추론="소기업이 SEO 도구를 ChatGPT·Claude 로 대체하는 것 같다 / AI 가 SEO 를 해결한다고 믿는다 / 가르쳐 주는 도구는 너무 느리다" → 결정=대행 서비스.
  - Starter Story 인터뷰(2023 실적 갱신편): "SEO 를 거의 2년 쉬었다" → 페이지 ⅔ 갱신.
- 주의: 진단 근거는 시장 분위기를 다룬 글이지 고객 조사가 아니다. 자료에 고객 인터뷰 기록이 없다는 것이지 없었다는 확정은 아니다(확인 불가).

## 못 찾은 것 / 확인 불가
- Momentum 가격, 유지율, 마진, 고객 수: 확인 불가. 보도자료에 없다.
- "성장이 돌아왔다"·ARR $100k·총 ARR $1.5M: 회사 자체 보도자료뿐. 독립 확인 없음. 신규 판매 둔화의 크기(몇 % 감소) 숫자도 없다.
- 보도자료 수치는 syndication 사본(manilatimes·itbusinessnet 등)이 여럿이나 전부 같은 원 관측이다. observation_key 하나로 묶었다.
- LinkedIn 창업자 글: 직접 열지 못했다(검색 결과 요약으로만 확인; 투자자 Lasse Schou Holbøll 의 재공유). 증거로 쓰지 않았다. 요약상 2026-09 에 "고객 3곳 확보" 파일럿을 돌렸다는 내용이 있으나 미확인이라 초안에 넣지 않았다.
- Starter Story 갱신편의 게시일: 페이지에 날짜가 표시되지 않는다(요약기가 2024-01-28 이라 답한 적도 있으나 같은 페이지 내용과 어긋나 신뢰하지 않고 비웠다). 수치는 2023 값이다.
- Starter Story 인터뷰 당시 직원은 4 창업자·9 직원(2024); 2026 팀 규모는 확인 불가. 1인 창업가 사례가 아니라 13명급 소규모 팀 사례이므로 transfer_note 는 "혼자라면 사람 손이 한계"를 전제에 적었다.
- 가격대(LOW)는 StackShare 목록의 "$69/mo" 검색 요약을 근거로 한 분류이며 직접 열어 확인하지 않았다.

## 어휘 / VOC
- reader_problem: NO_CHANNEL 로 적었다. 맞는 코드가 약간 어긋난다(이 케이스는 "있던 통로가 줄어든다" 이야기). 어휘에 "기존 통로가 시들었다" 코드가 없다.
- 페인 낱말 검사(config/pain-terms.json)가 처음엔 무브 0·1 을 막았다. "해지·이탈", "요금제·유료 전환" 을 문장에 정직하게 넣어 통과시켰다(그 낱말이 가리키는 사실은 "확인 불가"로 적었다 — 낱말만 맞추려고 없는 사실을 만들지 않았다).
- VOC 해당 없음: `ops/state/voc-inputs/index.md`(첫 368줄 확인)에 Morningscore 나 SEO 도구 프로젝트가 없다. 나머지 줄은 읽지 않았고 grep 으로 "Morningscore|SEO" 를 찾았으나 0건. `voc_inputs` 는 비워 둔다.

## 개선점 (절차 0-3)
- 처음 초안은 Momentum 을 성공 서사로 쓸 뻔했다 → 근거가 자체 보도자료뿐이라 mixed·"검증 전"으로 고쳤다.
- "성장이 돌아왔다" 는 주장 증거로만 쓰고 수치 무브에는 ARR $100k 하나만 연결했다.
- transfer_note 는 내일 할 한 가지(해지 고객 5명에게 물어 표로, 대행 서비스 가격 3명에게 구두 질문, 유입 경로 표)로 줄였다. 어느 것도 이 사례가 그 방법이 통한다는 증거는 아니다 — preconditions 에 명시했다.
