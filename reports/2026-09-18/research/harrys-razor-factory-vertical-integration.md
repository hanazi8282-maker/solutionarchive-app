# 조사 노트 — Harry's (harrys-razor-factory-vertical-integration)

큐 사유: coverage_gap (UNIT_ECONOMICS 병목, 승인 케이스 0건 — 매칭 성립에 3곳 필요).
대상 미정 → WebSearch 로 직접 선정. 이미 적립된 slug 목록(casper-dtc-unit-economics,
kurly-unit-economics, shyp-flat-fee-unit-economics-collapse 등)과 겹치지 않음을 확인.

## 대상 선정 이유

면도날 D2C 브랜드 Harry's (2012~, 미국). 선정 이유:
- UNIT_ECONOMICS 병목의 **성공** 사례가 필요했다(큐 메모: 승인 0건). Harry's 는
  "외주 제조 마진 구조를 직접 소유로 바꿔 원가를 통제"한, 병목에 정확히 들어맞는
  긍정 사례다.
- 창업자 Jeff Raider·Andy Katz-Mayfield 가 2023년 팟캐스트(How I Built This)에서
  **1인칭으로** 관찰→추론→결정의 흐름을 직접 설명한다 — "사고의 흐름" 요건을
  채울 수 있는 드문 케이스.
- `outcome_status` 를 Wikipedia(직접 열람)로 2026년 현재까지 독립 기업으로
  운영 중임을 확인했다 — Edgewell 인수 시도(2019)가 FTC 소송(2020)으로 무산된
  뒤에도 존속, 2025년 리브랜딩까지 함.

## 찾은 것

- **외주 제조의 한계 관찰**: 팟캐스트에서 창업자들은 고객 피드백(예: 손잡이
  뒷면 트리머 블레이드 추가 요청)을 받고도 계약 제조 구조로는 제품을 빠르게
  못 바꾼다는 것을 확인했다고 1인칭으로 말한다. ("it would be really difficult
  to meaningfully inflect product improvement without actually owning the
  manufacturing process")
- **추론→결정**: 물량이 월 수백만 개 단위로 커질 것을 계산하면서 "결국 이
  공정을 직접 사야 한다"는 결론에 이르렀다는 회고가 같은 팟캐스트에 있다.
- **인수 사실**: 2014년 1월 22일, 창업 약 10개월 만에 독일 면도날 제조사
  Feintechnik 을 1억 달러에 인수(TechCrunch, 직접 열람 확인). 그 직전 투자자로부터
  1억 2,250만 달러를 모았다는 것도 같은 기사에서 확인.
- **현재 상태**: Wikipedia(직접 열람) 기준 2026년에도 독립 비상장 기업으로 운영
  중이며, 2025년 로고·패키징·웹사이트 리브랜딩을 했다. Edgewell 의 인수 시도는
  2020-02-03 FTC 소송으로 무산됐다.

## 못 찾은 것 (확인 불가로 남긴 것)

- **인수 전후 카트리지 단가·마진율** — 이게 이 케이스의 핵심 "유닛 이코노미"
  수치인데, 신뢰할 만한 출처로 확인하지 못했다. 팟캐스트 원문을 다시 확인했을 때
  "$0.35" 언급이 나왔지만("$300,000... $0.35,000 of cartridge"), 자동 생성
  대화록의 구간이 명백히 깨져 있어(숫자·단위가 문법적으로 성립하지 않음) 실제
  값을 특정할 수 없었다. **근거 없는 숫자를 만들지 않는다**(CLAUDE.md §7.1,
  ops/roles/_principles.md §4) 원칙에 따라 이 수치는 쓰지 않았다. 그래서 무브에
  `metric_after` 를 채우지 않았다 — 등급 D(사실확인)/C(독자 인사이트)로 정직하게
  남긴다.
- **경쟁사 대비 카트리지 소비자가 비교** — Gadgeteer 리뷰(2016) 등 블로그
  후기에서 "Harry's 가 Gillette 보다 카트리지당 얼마 싸다"는 숫자가 여럿
  나오지만, 리뷰마다 금액이 다르고(연도·제품 라인마다 $0.6~$1대 편차) 전부
  3차 리뷰 블로그라 근거로 쓰지 않았다.
- **정확한 창업일** — TechCrunch 헤드라인이 인수 시점(2014-01-22)을 "창업
  10개월 후"로만 적어, 정확한 창업 연월을 1차 소스로 확인하지 못했다.
  `period_start`/`moves[0].observed_period_start` 를 비워 뒀다.
- **CNBC(2026-06-07) 매출·EBITDA 기사** — Mammoth Brands(추정 모회사명)의
  2024년 매출 $835M, adjusted EBITDA 약 $100M 이라는 수치가 WebSearch 요약에
  나왔으나, CNBC 원문을 WebFetch 로 직접 열지 못했다(403). 직접 열지 못한
  출처는 근거로 쓰지 않는다는 원칙에 따라 초안에서 뺐다. "Mammoth Brands"라는
  모회사명 자체도 Wikipedia(직접 열람)에는 없어 확인 불가로 남긴다.
- **Inc.com 매거진 기사(2016)** — WebFetch 가 403으로 막혀 직접 열지 못했다.
  WebSearch 요약으로만 접한 내용(창업자 인용 등)은 초안 근거로 쓰지 않았다.

## 등급·검증 결과

- 무브 1개, 근거 3건(무브 근거 2건 + 케이스 단위 근거 1건).
- 독자 인사이트 등급(gradeMove): **C** — `transfer_note`·`preconditions` 는
  구체적이나, `metric_after` 가 없어 사실확인(factCheckGrade)이 D 이고, 그게
  독자 인사이트 등급을 C 로 끌어내린다. 이건 "근거가 나빠서"가 아니라
  "수치를 못 채워서"다 — 등급 D/C 짜리라도 옮길 수 있는 무브면 값이 있다는
  지시문 원칙에 따라 그대로 남겼다.
- 사실확인 등급(factCheckGrade): **D** — 수치 없음, 서술만 있음.
- `outcome_direction=positive` 이고 이건 부정 사례 검증(§ 실패 사례 축소 여부)
  대상이 아니다.

## 실패 사례 축소 여부 점검

해당 없음 — 이 케이스는 `outcome_direction=positive` 다. 다만 반대로 "성공을
과장하지 않았는가"는 점검했다: 인수 결정 자체는 명확한 사실(TechCrunch 직접
확인)이지만, 그 결정이 실제로 유닛 이코노미를 얼마나 개선했는지(단가·마진
변화)는 수치로 확인하지 못했으므로 summary·claim 모두 "결정을 했다"까지만
적고 "그래서 마진이 몇 % 좋아졌다"는 문장을 넣지 않았다.

## validate 실행 결과

```
node scripts/case-research.mjs validate --slug harrys-razor-factory-vertical-integration
→ 무브 1건 · 근거 3건 · 등급 A0 B0 C1 D0
→ warn 2건 (evidence[2].published_at 없음 / moves[0] 수치 없음 — 둘 다 위 "못 찾은 것"에서 설명)
→ error 0건, exit 0 (VALIDATE_EXIT_0 로 직접 확인)
```
