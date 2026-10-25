# 조사 노트 — Sourcetrail (Coati Software) · 실패 사례 할당분 (failure_quota) · 2026-10-25

## 대상을 이렇게 정했다
- 큐가 대상 "미정" 이라 직접 골랐다. 적립 slug 목록과 겹치는 곳(Kite·Juttu·Cydoc·Content Goblin·College Conductor·GrowRecruit·Gummysearch 등)은 피했다.
- 후보로 본 것과 버린 이유:
  - Voiczy(솔로, 유료 11명 전원 이탈, 가격 €9→€3) · Growblocks(직원 29명, 시드 6M유로 — 소규모 아님) · "$837 MRR→0" 인디해커스 글 · Juttu 급 사례 → 모두 원문이 Substack/Indie Hackers 라 이 환경에서 403 이라 열 수 없었다(확인 불가). 열지 못한 글로 케이스를 쓰지 않았다.
  - Hackernoon "Two Founders, One Decision" → 글쓴이가 익명 합성 사례라고 밝혀 제외.
  - gravity.fast "세 번의 폐업" → 제품 설명·폐업 이유·수치가 글에 없고 자사 홍보성 블로그라 제외.
  - Decide.com → 투자 받은 회사, 제휴사 한 곳 매출 80% 의존이 핵심인데 창업자 원문 링크 없음.
- Sourcetrail 을 고른 이유: 소규모 팀(오스트리아 Coati Software), 4년 유료 판매 → 무료 공개+후원 → 중단까지 끝이 확인되고, 언론·저장소 README 로 서로 다른 출처에서 확인된다. 단 SaaS 가 아니라 PC 설치형 도구다 — JSON `business_model` 을 `OTHER` 로 두고 summary 에 명시했다.
- Kite(적립 완료)와 겹치지 않게 각도를 달리했다: Kite 는 "개인 개발자는 돈을 안 낸다 + 수익화를 맨 마지막에 했다", 이쪽은 "가격을 올리지 않기로 한 선택 → 무료 공개+후원 전환 → 흥미 상실로 중단"이다.

## 찾은 것
- 2015년 말 창업, 2016년 Coati 라는 이름으로 유료 출시(검색 결과 요약, 위키 기준). 2019-11 GPL 공개, Patreon 후원 전환. 2021-09-23 유지보수 중단 공지, 2021-11-30 마지막 릴리스, 2021-12-14 저장소 보관.
- 팀 글 인용(해커뉴스 O_H_E 댓글, 2021-02-16): 4년이 지나도 일부 개발자만 썼고 "we didn't get rich. Not even close", 손해가 나기 시작했다.
- InfoWorld(2019-11-21) 인용: "not enough paid customers to adequately compensate the company".
- 팀 글 인용: 경쟁사처럼 갈수록 가격을 올리는 길은 원치 않았다.
- 중단 글 인용(해커뉴스 41179446 janice1999 댓글): 분야에 흥미를 잃었다, 개발자 도구 제작은 손이 많이 가고 자주 답답하며 재미없다.
- GitHub README(직접 열람): 원 저자·메인테이너가 2021년 말 보관, 상표는 Coati Software 보유.

## 사고의 흐름(1인칭)
- **1인칭 원문은 직접 못 열었다 — 부분 확인.** sourcetrail.com/blog/open_source, /discontinue_sourcetrail 은 모두 404, web.archive.org 는 이 도구가 막아 열 수 없었다. 팀의 문장은 해커뉴스 댓글과 InfoWorld 가 인용한 것을 읽었다. 흐름은 (관찰) 4년 뒤에도 일부만 씀·손해 → (추론) 가격을 올리면 모든 개발자에게 주겠다는 목표와 어긋남 → (결정) 라이선스를 접고 공개+후원 → (결과) 2년 뒤 흥미를 잃고 중단. 2019년 결정 부분의 추론은 팀 인용문에 직접 있고, 중단 부분의 "흥미 상실"도 인용문에 직접 있다. 다만 두 결정 사이에 후원이 얼마나 들어왔는지는 어디에도 없다.
- CppCast 에피소드 163(창업자 Eberhard Gräther 출연) 쇼노트는 열었으나 사업 내용 발언이 없고 오디오·전사본은 확인 불가.

## 못 찾은 것 (확인 불가)
- 라이선스 가격, 판매 수, 매출, 손실액, 후원 금액, 팀 인원, 받은 "펀딩"의 종류·액수 → 어디에도 없음. 그래서 모든 무브의 수치 칸이 비었고 등급 D.
- 2019년 이후 유료→무료 전환 때 기존 고객 환불·반응.
- 중단 글 원문의 전체 맥락(돈 문제가 중단에 얼마나 작용했는지 — 인용문은 흥미 상실만 직접 말한다).
- 해커뉴스 댓글들이 "가끔만 쓰는 도구라 돈 받기 어렵다 / JetBrains 가 이미 잘한다"고 말하지만 모두 제3자 의견이라 근거로 안 썼다. 무브에도 넣지 않았다.
- X(@Sourcetrail) 공지는 열지 않았다.

## 어휘 메모
- reader_problem 은 MAKE_BUT_NO_MONEY 로 뒀다. 억지 맞춤은 아니다.
- business_model 어휘에 "PC 설치형 라이선스"가 없어 OTHER. purchase_frequency·price_band 는 모르는 값이라 비웠다(검증기가 경고).
- 이식성(transferability)은 쓰지 않았다(사람이 승인 때 고른다).

## VOC
- `ops/state/voc-inputs/index.md` 를 프롬프트가 가리키지 않았다. VOC 해당 없음.

## 진행 판단 절차 (원칙 §0)
- 검토: 무브 3개가 정말 이 사례가 받치는 것인지 본다 → "가격 안 올림→손해"는 팀 인용문이 직접 받침, "공개+후원 전환"은 InfoWorld 가 받침, "흥미 상실 중단"은 인용문이 받침.
- 개선점 반영: (1) 무브 2의 "포크로 이어 갔다"는 증거에 없어 삭제. (2) 세 무브 모두 transfer_note 가 이 팀의 행동 그대로가 아니라 "독자가 내일 할 일"인 것을 summary 와 노트에 숨기지 않았다 — 특히 무브 3의 "그만둘 기준 한 줄"은 팀이 기준이 없었다는 증거가 없어서 claim 에 '확인 불가'로 적었다.
- 한계: 이 케이스는 발행 가능한 등급(A)이 못 된다. 사내 참고용이 맞다. 부정 사례는 쓸 수 있는 근거가 약하면 이렇게 두는 것이 정상이다.

## validate
- `node scripts/case-research.mjs validate --slug sourcetrail-occasional-use-dev-tool-open-source-rescue-discontinued` → error 0건, 경고는 빈 매칭 축 2개(purchase_frequency·price_band)·published_at 1건·수치 없음(D)이다.
