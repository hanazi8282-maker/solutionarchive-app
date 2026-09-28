# T2 기준 통일 — SaaS 100건 재시험 (2026-09-28)

## 결론

- **통과(92.4% ≥ 90%)**: 기준 반영 뒤 새 표본 100건에서 1차·2차 일치율을 쟀다.
  - 셈법은 기존 import 리포트와 같다. 한쪽이라도 unknown 인 8건을 빼고 92건 중 85건이 일치했다.
  - 3상태를 그대로 비교하면(unknown 도 불일치로 셈) **88%(88/100)**다.
- **기준 반영 전**: 같은 100건의 옛 1차(DB) × 옛 2차(PR #296) 일치율은 **50.5%(49/97)**였다. 09-27 전체 282건의 49.8% 와 같은 수준이다.
- **1회차(초안 기준)는 87.8%(79/90)로 미달이었다.** 불일치 11건을 보고 기준에 "누구의 목소리인지" 규칙 3줄을 더했다. 그다음 **1회차와 겹치지 않는 새 100건**으로 2회차를 쟀다. 같은 표본으로 다시 재면 기준이 그 표본에 맞춰질 뿐이라 새 표본을 썼다.
- **한계 1. 2차 역할은 Gemini 가 아니었다.** 실제 운영의 2차 판정은 Gemini 다. 이번 재시험은 1차 역할 Sonnet, 2차 역할 Opus 서브에이전트로 쟀다. 이 숫자는 "같은 기준 문구를 주면 서로 다른 판정자가 얼마나 같게 읽나"를 잰 것이다. 운영 조합(Sonnet × Gemini)의 일치율이 아니다.
  - 자동 승인을 켜기 전에 새 export(기준 포함) → Gemini 2차 → `import` 드라이런으로 같은 수치를 한 번 더 재기를 권고한다.
- **한계 2. 사람 정답은 없다.** SaaS 사람 채점은 아직 0건이다. 이 수치는 "두 판정자가 같게 읽는다"는 뜻이지 "맞게 읽는다"는 뜻이 아니다. 정확도는 감사 루프가 잰다(`approval-automation-design.md` §2·§3).

## 1. 방법

- 모집단: `ops/state/relevance-export-2026-09-27.json` 의 SaaS 5개 프로젝트 282건. export 기본값이라 전부 1차 relevant 다.
  - 뺀 것: 기준 상수에 예시로 인용한 행 7건과 superwhisper 결제 링크 행 5건 → 270건
- 표본: 프로젝트 비례로 100건(seed 20260928).
  - 1회차: Lemon Squeezy 29 · ConvertKit 34 · Baremetrics 23 · Cal.com 8 · Plausible 6
  - 2회차: 1회차 100건을 뺀 170건에서 새로 100건. Lemon Squeezy 29 · ConvertKit 33 · Baremetrics 24 · Cal.com 9 · Plausible 5
- 1차 역할(Sonnet 서브에이전트)
  - 실제 `buildRelevancePrompt`(`lib/analysis/relevance-judge.ts`)로 만든 system/user 를 그대로 받았다.
  - 20건씩 8묶음, `business_model=SAAS` 로 판정했다.
- 2차 역할(Opus 서브에이전트)
  - 실제 `SECOND_OPINION_INSTRUCTIONS`(`lib/analysis/second-opinion.ts`)와 export 행 모양(판정 없음, input_id 순)을 그대로 받았다.
- 눈가림: 두 판정자 모두 지정 파일 하나만 읽게 했다. 옛 판정이 든 파일은 보지 않았다.
- 원자료와 스크립트: `ops/state/t2-retest-2026-09-28/`(`r{1,2}-sample/first/second.json`, `retest-build.mjs`, `retest-score.mjs`)

## 2. 결과

### 1회차 — 초안 기준

| 비교 | 일치(unknown 제외) | 3상태 그대로 |
|---|---|---|
| 기준 전: 옛 1차(DB) × 옛 2차 | 54/100 = 54.0% | 54% |
| 기준 후: 새 1차 × 새 2차 | 79/90 = **87.8%** | 83% |

- 새 판정 분포: 1차 R32·I61·U7 / 2차 R35·I58·U7
- 불일치 11건은 거의 전부 두 가지 해석 차이였다.
  - **남에게 주는 권고**: 1차는 "본인 경험이 아니다"며 무관, 2차는 "이유가 있다"며 관련으로 봤다.
    - `4dcc1cb4` ConvertKit 을 백엔드 없는 이메일 수집용으로 권함
    - `f812610e` 무료 티어로 충분하다며 Cal.com 권함
    - `af5e7bea` 세금 때문에 MoR(Paddle·LS)을 권함
    - `e1c845de` "Baremetrics doubled everyone's price last year (after being acquired)"
  - **다른 제품 글 속의 경험**: 1차는 관련, 2차는 "홍보글·다른 주제"라며 무관으로 봤다.
    - `78135231` 보일러플레이트 홍보글 속 "LS 웹훅 관리가 번거로웠다"
    - `548ed381` 여러 결제망 매출 합산의 고충
    - `7b92dcde` "가장 비싼 도구" 목록의 "$49/month of ConvertKit"
- 반영한 규칙(`relevance-criteria.ts`, `docs/t2-relevance-criteria.md` §2 "누구의 목소리인지는 넓게 본다")
  - 구체 이유를 든 권고·만류는 관련이다.
  - 다른 제품 글이어도 그 도구 경험이 한 문장 있으면 관련이다.
  - 금액을 밝힌 사용 목록은 관련이다(wtp=true).
  - 가격 인상으로 떠나는 이야기는 (c) 반대 이유다.

### 2회차 — 확정 기준, 새 표본

| 비교 | 일치(unknown 제외) | 3상태 그대로 |
|---|---|---|
| 기준 전: 옛 1차(DB) × 옛 2차 | 49/97 = **50.5%** | 49% |
| 기준 후: 새 1차 × 새 2차 | 85/92 = **92.4%** ✅ | 88% |
| 참고: 새 1차 × 옛 2차 | 75/94 = 79.8% | 77% |
| 참고: 옛 1차 × 새 2차 | 43/94 = 45.7% | 43% |

- 새 판정 분포: 1차 R47·I48·U5 / 2차 R43·I51·U6
- 동의 구성: 둘 다 relevant 40 · 둘 다 irrelevant 45 · 반대 7 · unknown 이 낀 것 8
- **자동 승인 대상(완전 동의 RR)은 100건 중 40건이다.** 나머지 60건 중 7건(반대)과 8건(unknown 포함)이 사람 줄로 간다. 둘 다 irrelevant 인 45건은 자동 폐기가 아니다. 그대로 1차 판정대로 둔다(설계 §6).
- 프로젝트별(unknown 제외)
  - Baremetrics 23/23
  - Plausible 5/5
  - Cal.com 8/8
  - ConvertKit 27/32
  - Lemon Squeezy 22/24
- 옛 판정과 비교해 보면 어디가 바뀌었는지 보인다.
  - 옛 1차 × 새 2차가 45.7% 다. 옛 1차의 과편입(이름만 나오는 글까지 relevant)이 불일치의 주원인이었다.
  - 새 1차 × 옛 2차가 79.8% 다. 옛 2차의 "불만만 relevant" 기준도 일부 불일치를 만들었다.

### 2회차 남은 불일치 7건 (R×I) — 다음 기준 개정 후보

- `2dcba3c1` "Built with ConvertKit" 배지를 광고차단 필터로 지운 방문자
  - 1차 R(브랜딩 페인), 2차 I(사용자 아님)
  - 쟁점: 도구의 **최종 수신자·방문자** 목소리를 넣을지
- `feb028c6` WordPress.com 폼 추가에 유료 플랜이 필요하다는 불만(ConvertKit 폼 맥락)
  - 1차 R, 2차 I
  - 쟁점: 불만 대상이 대체재·인접 도구일 때
- `6374499d` ConvertKit 초창기 스레드의 "I fit the target market … need reliable sales funnels"
  - 1차 R, 2차 I(창업자 쪽 설명으로 봄)
- `b4cd9ff3` "We used InfusionSoft … This can all be done now with ConvertKit"
  - 1차 R, 2차 I(예시 언급)
- `f93f2f10` 자사 프레임워크 홍보 속 "free newsletter account with ConvertKit"
  - 1차 R(무료라는 이유), 2차 I(홍보)
- `52c2c101` 크롬 확장 결제 폐지 뒤 Paddle 로 옮긴 이야기
  - 1차 I(목록 언급), 2차 R(대체재 선택 이유)
- `6e82a440` "Lemonsqueezy or paddle are options to the main problem"(세금)
  - 1차 I(이름만), 2차 R(권유)
  - 쟁점: 이유가 **글 주제에만** 있고 문장엔 없을 때
- 7건 중 5건이 ConvertKit·LS 다. 다음 개정은 "방문자·수신자 목소리"와 "인접 도구 불만"을 정하면 된다. 지금 통과선 판단에는 영향이 없다.

## 3. 사람 판단이 필요한 것

- **통과를 운영 조합으로 재확인할지**
  - 권고: 켜기 전 1회. 새 export → Gemini 2차 → `relevance-second-opinion-import.mjs` 드라이런 → "DB 판정 대비 일치" 줄이 90% 이상인지 본다.
  - 그 전에 1차는 시행일 이후 새 기준으로 판정된 행이어야 한다.
- **"권고·다른 글 속 경험·금액 목록을 관련에 넣는" 해석**(기준 §2)이 남헌 의도와 맞는지
  - 빼면 1회차 수준(87.8%)으로 돌아갈 가능성이 높다[추정].
