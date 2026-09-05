# Claude Code 전달용 — 프롬프트 G (폐쇄 루프 구현)

> **목적**: 예측 → 실측 → 규칙 갱신 → 자가 문항 생성까지 자동화한다.
> **선행**: 프롬프트 A(네임스페이스 전량 교체)가 반영된 뒤에 실행. 안 됐으면 A부터.
> **핵심 문서**: `methodology/content/prediction-schema.md` (이번에 새로 추가됨)

---

```
콘텐츠 방법론 아카이브에 폐쇄 학습 루프를 구현해줘.
예측 → 실측 → 자동 채점 → 규칙 신뢰도 갱신 → 자가 문항 생성까지.

## 목표 아키텍처

  스킬이 초안 생성
     ↓
  게이트 통과 (판정 + 지문 + 예측 기록)
     ↓
  발행  ← 사람 승인. §10 정책상 자동 발행 절대 금지
     ↓
  Threads metrics 수집 (h1/h24/h168 — 이미 구현돼 있음)
     ↓
  예측 vs 실측 자동 채점        ← ★ 이번에 만드는 것
     ↓
  규칙별 신뢰도 갱신 (Wilson 하한)
     ↓
  무효 3건 누적 시 UPD- 갱신 후보 자동 생성
     ↓
  자가 문항 생성 (eval-set 자동 확장)

앞뒤는 이미 있다. Threads API 토큰, metrics collector(1h/24h/168h 스냅샷),
Dice 계수 0.82/0.08 matcher, 04-decisions.md의 예측·지문 칸.
**없는 건 예측과 실측을 기계가 대조하는 부분**이다.

지금 예측은 자연어라 채점이 안 된다. prediction-schema.md 가 그걸 구조화한다.

## STEP 0 — ⚠️ 선행 확인 (이거 먼저)

### 0-1. Threads API가 `saves`를 주는가?

**저장률이 1순위 지표인데 가용성이 확인 안 됐다.** 이게 없으면 설계가 바뀐다.

  - Threads Insights API 응답에 saves / saved / bookmarks 필드가 있는지
  - 현재 metrics collector가 실제로 저장하고 있는 컬럼 전체 목록
  - posts / post_metrics 테이블 스키마 (컬럼명 그대로)

결과에 따라:
  - 있으면 → 그대로 진행
  - 없으면 → 우선순위를 like_rate > share_rate > reply_rate > views 로 재조정하고
            prediction-schema.md §1-1 표를 수정. **임의로 진행하지 말고 보고 후 대기**
  - 대안 프록시: profile_visits (저장과 같은 "나중에 다시 보겠다" 신호)

### 0-2. 발행 건과 판정 로그를 어떻게 연결하나?

  - posts 테이블에 decision_log_code 컬럼을 추가할지
  - 별도 매핑 테이블을 만들지
  - 기존 matcher(draft ↔ published)와 어떻게 이어붙일지

현재 스키마를 보고 **가장 침습적이지 않은 방법**을 제안해줘.
DB 변경이 필요하면 마이그레이션 SQL만 작성하고 **적용은 하지 마** —
남헌이 Supabase 대시보드에서 직접 실행한다(MCP는 회사 프로젝트에 잠겨 있음).

## STEP 1 — 예측 파서

scripts/parse-predictions.mjs

04-decisions.md 양쪽(solfa, pdp)의 판정 로그에서 예측 블록을 파싱한다.

  - 대상: `### LOG-YYYYMMDD-nn` 로 시작하는 엔트리
  - `예측:` 아래 YAML 블록을 구조체로 변환
  - 필수 필드 검증: metric / direction / baseline / threshold / horizon / because
  - 누락되면 그 엔트리를 `INVALID`로 마킹하고 이유를 리포트
  - ⚠️ 템플릿(``` 로 감싼 코드블록)은 파싱 대상에서 제외

출력: eval/predictions.json (또는 리포 컨벤션에 맞는 위치)

## STEP 2 — 채점기

scripts/score-predictions.mjs

prediction-schema.md §4의 규칙을 그대로 구현한다.

  1. horizon 시점의 metrics 스냅샷 조회
  2. views < 100 이면 → 보류 (표본 부족)
  3. baseline 계산 (§2-1)
     - median_last_k : 직전 K건 중앙값 (기본 K=10)
     - median_format_k : 같은 형식 태그의 직전 K건
     - median_all / absolute / paired
  4. MAD 계산. **0이면 20pct 폴백**
  5. delta = 실측 − 기준선
  6. 판정
     up     → delta ≥ threshold × MAD
     down   → delta ≤ −(threshold × MAD)
     within → value[0] ≤ 실측 ≤ value[1]
     임계 미달(up/down) → **보류** (무효 아님)

⚠️ **무효와 보류를 반드시 구분해라.**
   방향이 반대면 무효, 차이가 노이즈 범위면 보류다.
   섞으면 규칙 신뢰도가 오염된다.
   (이 프로젝트 CLAUDE.md §7.1 — "확인 실패"와 "확인 결과 음성"을 구분하라와 같은 원칙)

### 부트스트랩 처리 (§2-3)

  1~4건   → 자동 보류. 채점 안 함
  5~9건   → median_all + 20pct, 신뢰도 가중치 0.5
  10건+   → median_last_10 + 1.0mad, 정식 판정

부트스트랩 구간 판정을 규칙 갱신 근거로 쓰지 마라.

### 복합 판정 (§4-3)

여러 지표를 걸었으면 가중 다수결.
  가중치: save_rate 8 / like_rate 4 / share_rate 2 / views 1
  score = Σ(가중치 × 판정값), 판정값 유효 +1 / 무효 −1 / 보류 0
  score > 0 유효 / < 0 무효 / = 0 보류

## STEP 3 — 결과를 04-decisions.md에 append

⚠️ **기존 엔트리를 수정하지 마.** append-only다.

채점 결과를 해당 LOG 엔트리 **아래에 블록으로 추가**한다:

    실측:            # 자동 기입 YYYY-MM-DD
      h168:
        views: 12400
        saves: 387
        save_rate: 0.0312
    채점:            # 자동 기입
      - metric: save_rate  baseline: 0.0190  mad: 0.0061  delta: +2.00mad → 유효
      - metric: views      within [3000,100000]                          → 유효
      종합: score +9 → 유효
    검증: 유효

`.gitattributes` 에 merge=union 이 걸려 있으니 충돌은 자동 처리된다.

## STEP 4 — 규칙 신뢰도

scripts/rule-confidence.mjs

각 LOG 엔트리의 `because` 로 규칙에 귀속시켜 집계한다.

**Wilson score 하한을 쓴다** (단순 비율 금지 — 1승 0패를 100%로 읽으면 안 됨)

    n = 유효 + 무효          (보류는 분모에서 제외)
    p = 유효 / n
    z = 1.96
    lower = (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)

출력: eval/rule-confidence.md

    | 규칙 | 유효 | 무효 | 보류 | 단순비율 | Wilson하한 | 상태 |
    |---|---|---|---|---|---|---|
    | R-11 | 7 | 1 | 3 | 88% | 53% | 관찰중 |

### 자동 액션 (§5-3)

  무효 3건 누적          → 04-decisions.md §3 에 UPD- 갱신 후보 자동 생성
  Wilson하한 < 30% (n≥5) → ⚠️ 규칙 재검토 플래그
  유효 10건 + 하한 > 70%  → ✅ 안정 규칙 마킹
  보류 비율 > 50% (n≥10)  → ⚠️ **예측 설계 오류.** 규칙이 아니라 측정이 틀린 것

마지막 항목이 중요하다. 보류가 많으면 지표나 임계를 바꿔야 한다.

## STEP 5 — 자가 문항 생성

scripts/generate-eval-questions.mjs

prediction-schema.md §6 규칙대로.

  정방향 판정이 `무효`           → 문항 생성. 정답 = 실측
  역방향 "한쪽만 탈락"           → C-xx 갱신 대상으로도 등재
  역방향 "둘 다 탈락"인데 터짐   → 양쪽 공통 구멍

출력 위치: eval/questions.md 말미에 append (STEP 1에서 분리한 파일)
정답은 eval/answers.md 에 append

⚠️ **`[자동생성]` 태그를 반드시 달아라.** 원문 기반 30문항과 구분해야 한다.
   원문 문항은 정답이 검증된 것이고, 자동 생성은 **내 데이터가 정답지**다.

## STEP 6 — 통합 실행기

scripts/run-loop.mjs

    node scripts/run-loop.mjs --horizon h168

  1. parse-predictions
  2. score-predictions
  3. 04-decisions.md append
  4. rule-confidence 갱신
  5. generate-eval-questions
  6. 리포트 출력

GitHub Actions 크론으로 걸 수 있게 만들어줘. **단 스케줄 등록은 하지 마** —
남헌 승인 후에 한다. 워크플로 파일만 작성하고 `on: workflow_dispatch` 로만 둬.

## STEP 7 — 검증기 확장

verify-methodology-archive.py 에 추가:

  check_prediction_schema()
    - 04-decisions.md의 LOG 엔트리 중 `예측:` 블록이 있는 것은
      필수 필드 6개(metric/direction/baseline/threshold/horizon/because)를 갖췄는가
    - metric 코드가 prediction-schema.md §1-1에 정의된 것인가
    - because 코드가 실제 정의된 규칙인가 (R-01~R-14 / P-01~P-14 / C-01~C-12)
    - ⚠️ 템플릿 블록은 제외

## STEP 8 — 문서 반영

  1. prediction-schema.md 를 methodology/content/ 에 배치 (첨부본)
  2. 양쪽 04-decisions.md §1-2(발행 후 성과 기입) 절에 포인터 추가:
     "예측 포맷과 자동 채점 규격은 `../prediction-schema.md` 참조"
  3. 00-gate.md Ⅴ 로그 체크리스트에 추가:
     "□ 예측이 prediction-schema.md 포맷을 따르는가 (자연어 예측 금지)"
  4. _setup/infra-decisions.md 에 INF-06 추가:
     제목 "폐쇄 학습 루프 (예측 자동 채점)"
     상태 진행중, 반복 1, 제안일 2026-09-04

## 제약

- **자동 발행은 절대 구현하지 마.** §10 정책이다. 한 번 드리프트 재발로 재확인됐다.
  루프가 잘 돌수록 "발행만 자동화하면 완전자동"이라는 유혹이 커지는데, 그게 가장 위험하다.
- DB 마이그레이션은 SQL만 작성. 적용 금지 (Supabase 대시보드에서 남헌이 직접)
- 04-decisions.md의 `## 2. 규칙 SEED`는 영구 보존. 절대 수정 금지
- 기존 LOG 엔트리 수정 금지. append만
- STEP 0의 saves 가용성이 확인 안 되면 **STEP 1부터 진행하지 말고 보고 후 대기**

## 보고 사항

- **STEP 0-1: Threads API saves 가용 여부 + 현재 metrics 컬럼 전체 목록**
- **STEP 0-2: 발행 건 ↔ 판정 로그 연결 방식 제안 (침습도 순으로 2~3안)**
- 생성한 스크립트 목록과 각 역할
- 마이그레이션 SQL (있으면)
- 검증기 exit code
- 지금 로그가 비어 있어서 실제 채점을 못 돌리는데, **더미 데이터로 dry-run** 한 결과
- 이 설계로 커버 안 되는 케이스가 보이면 지적해줘
```

---

## 부록: 왜 이 순서인가

| STEP | 왜 여기 |
|---|---|
| 0 | **`saves` 가용성이 전체 설계를 좌우한다.** 1순위 지표가 없으면 우선순위 표가 바뀌고 가중치도 바뀐다 |
| 1~2 | 파서와 채점기는 로그가 비어 있어도 만들 수 있다. **더미로 검증** |
| 3 | append-only 규약 준수가 여기서 깨지기 쉽다 |
| 4 | Wilson을 안 쓰면 초기 5건에서 규칙을 잘못 확신한다 |
| 5 | 자가 문항은 **무효 판정이 있어야** 생성된다. 4번 뒤 |
| 6~7 | 통합·검증 |
| 8 | 문서 반영은 마지막. 구현이 확정된 뒤 |

## 부록: 이 루프가 완성되면 사람이 하는 일

```
1. 발행 승인          ← §10. 영구히 사람
2. 분기별 diff 판독   ← "덮여쓴 규칙 수 / 14"
3. 규칙 갱신 승인     ← UPD- 후보가 자동 생성되면 채택 여부 판단
4. 지표 우선순위 조정 ← 보류 비율이 높으면 측정 자체를 재설계
```

나머지는 전부 자동이다.
