# Claude Code 전달용 — 마스터 프롬프트 (통합본)

> **이 파일 하나만 던지면 된다.** 프롬프트 A / G / B-CC 를 하나로 합치고 실행 순서를 고정했다.
> 개별 프롬프트는 `prompt-A-updated.md` / `prompt-G-loop.md` / `prompt-B-CC.md` 에 상세본으로 남아 있으니,
> 각 Phase에서 막히면 그쪽을 열어보면 된다.
>
> **첨부 파일**: `methodology-content/` 폴더 전체 (27개 파일)

---

## ⚠️ 남헌이 먼저 확인할 것

이 프롬프트는 **이전 Claude Code 세션의 보고 내용을 반영하지 못한 상태**다.
(보고서 첨부가 비어 있었음)

아래 4가지는 이전 보고에서 이미 답이 나왔을 수 있다. **답이 있으면 해당 Phase를 건너뛰고,
없으면 그대로 실행**하면 된다.

| # | 확인 항목 | 이 프롬프트에서의 위치 |
|---|---|---|
| 1 | `solfa/README.md`에 "부재" 줄이 있는가 | Phase 0 · Q1 |
| 2 | `feedback-loop-design.md`의 정체 | Phase 0 · Q2 |
| 3 | Threads API `saves` 가용성 | Phase 0 · Q3 |
| 4 | 발행 건 ↔ 판정 로그 연결 방식 | Phase 0 · Q4 |

---

```
콘텐츠 방법론 아카이브를 전량 교체하고, 폐쇄 학습 루프까지 구현해줘.
첨부한 methodology-content/ 폴더가 정본이다.

═══════════════════════════════════════════════════════════════
전체 목표
═══════════════════════════════════════════════════════════════

  스킬이 초안 생성
     ↓
  게이트 통과 (판정 + 지문 + 예측 기록)
     ↓
  발행  ← 사람 승인. §10 정책상 자동 발행 절대 금지
     ↓
  Threads metrics 수집 (h1/h24/h168 — 이미 구현돼 있음)
     ↓
  예측 vs 실측 자동 채점        ← ★ 이번에 만드는 핵심
     ↓
  규칙별 신뢰도 갱신 (Wilson 하한)
     ↓
  무효 3건 누적 시 UPD- 갱신 후보 자동 생성
     ↓
  자가 문항 생성 (eval-set 자동 확장)
     ↓
  스킬 갱신 → 회귀 검사(eval) → 배포

남헌의 목표: "스킬을 만들고, 배포하고, 데이터를 수집하고, 다시 보완하고를 반복해서
점점 더 정교하고 고차원적인 로직을 만들어 거의 완전자동화."
그리고 "제대로 작동하는지 판가름하는 것은 데이터" — 조회수·좋아요·공유·저장이
거의 유일한 평가 항목이다.

따라서 eval-set은 목표가 아니라 **회귀 방지 장치**이고, 진짜 평가는 발행 실측이다.

═══════════════════════════════════════════════════════════════
Phase 0 — 선행 확인 (파일 건드리지 말고 답만)
═══════════════════════════════════════════════════════════════

⚠️ Q3가 확인 안 되면 Phase 4를 시작하지 마라. 전체 설계가 바뀐다.
   이 프로젝트는 "찾지 못함"을 "없음"으로 접는 실수가 반복적으로 발생했다.
   확인 불가와 확인 결과 음성을 반드시 구분해라. (CLAUDE.md §7.1)

### Q1. solfa/README.md 에 "부재" 줄이 있는가?

2026-09-03에 잘못된 지시가 나갔다.
  "05-provenance.md는 재작성하지 않는다. README.md 파일 지도 테이블에
   '부재 — 원문 대조 검증(B-3) 수행 불가' 한 줄만 추가한다."

파일은 실제로 존재했고 지금은 복구돼 있다. 그 지시가 실행됐다면 잘못된 줄이 남아 있다.

  grep -rn "부재" methodology/content/
  grep -rn "provenance.*부재\|부재.*provenance" .

  - 해당 줄이 있는가? 있으면 정확한 파일·행번호·원문
  - 커밋 7e15df1 에서 검증기는 되돌렸다는데, README 쪽도 같이 고쳤나?
  - **다른 파일에도 퍼졌는지** grep 결과 원문 그대로 보여줘

### Q2. feedback-loop-design.md 의 정체는?

"삭제 미스테이징" 상태인데 삭제가 맞는지 판단이 안 선다.

  1. 파일 경로와 크기
  2. 첫 30줄
  3. git log --follow 로 언제 누가 왜 만들었는지
  4. 참조하는 다른 파일:
     grep -rn "feedback-loop-design" . --include="*.md" --include="*.py" --include="*.mjs" --include="*.sh"
  5. 아래 셋 중 무엇에 가까운가?
     (a) 콘텐츠 방법론 아카이브의 학습 루프 설계 → methodology/ 로 이동
     (b) 제품(solutionarchive-app)의 인사이트 루프 설계 → 그대로 두거나 docs/ 로
     (c) 이미 04-decisions.md 로 대체된 초기 초안 → 삭제

  ⚠️ 애매하면 (c)로 단정하지 말고 "애매하다"고 답해라.

  ※ 참고: 이번에 prediction-schema.md 를 새로 추가한다. 내용이 겹치면 (a)나 (c)일 가능성이 높다.
    겹치는 부분이 있으면 어느 절인지 알려줘.

### Q3. ★ Threads API가 `saves` 를 주는가?

**저장률이 1순위 지표인데 가용성이 확인 안 됐다.** 이게 없으면 설계가 바뀐다.

  - Threads Insights API 응답에 saves / saved / bookmarks 필드가 있는지
  - 현재 metrics collector 가 실제로 저장하는 컬럼 전체 목록
  - posts / post_metrics 테이블 스키마 (컬럼명 그대로)
  - h1 / h24 / h168 스냅샷이 실제로 어느 필드를 담고 있는지

결과에 따라:
  있으면 → 그대로 진행
  없으면 → 우선순위를 like_rate > share_rate > reply_rate > views 로 재조정하고
          prediction-schema.md §1-1 표를 수정. **임의로 진행하지 말고 보고 후 대기**
  대안   → profile_visits 를 저장 프록시로 (둘 다 "나중에 다시 보겠다" 신호)

### Q4. 발행 건 ↔ 판정 로그를 어떻게 연결하나?

  - posts 테이블에 decision_log_code 컬럼 추가?
  - 별도 매핑 테이블?
  - 기존 matcher(Dice 0.82/0.08, draft ↔ published)와 어떻게 이어붙이나?

현재 스키마를 보고 **침습도가 낮은 순으로 2~3안** 제안해줘.
DB 변경이 필요하면 마이그레이션 SQL만 작성하고 **적용은 하지 마** —
남헌이 Supabase 대시보드에서 직접 실행한다(MCP는 회사 프로젝트에 잠겨 있음).

═══════════════════════════════════════════════════════════════
Phase 1 — 파일 전량 교체
═══════════════════════════════════════════════════════════════

⚠️ 부분 적용 금지. 네임스페이스 충돌 수정이라 일부만 반영하면
   게이트 코드와 규칙 코드가 섞여서 판정이 뒤바뀐다.

### 무엇이 바뀌었나

**① 코드 네임스페이스 3층 충돌 해소**

프드프는 게이트와 규칙이 같은 코드를 쓰고 있었다:
  게이트 P-10 = 행동 유도  /  규칙 P-10 = 감성 vs 디자인
  게이트 P-13 = 로그       /  규칙 P-13 = 알고리즘 ★★ 최대 취약점
로그 코드 D-/U-/X- 도 통합게이트 D-1~D-5 / U-1~U-3 / X-1~X-3 과 충돌했다.

새 규약 (양쪽 02-gate.md 말미에 표로 들어감):
  게이트     G-0~G-13, G-R     (두 아카이브 공통, 무패딩)
  솔파규칙   R-01~R-14         (제로패딩)
  프드프규칙 P-01~P-14         (제로패딩)
  교차       C-01~C-12
  통합게이트 U-1~3 / D-1~5 / X-1~3
  로그       LOG- / UPD- / NEW- / XUP-

**② 지문(Fingerprint) 필드 추가**

04-decisions.md 양쪽에 §1-1b 절이 신설됐다.
`게이트: 통과`라고 적혀 있어도 판정한 결과인지 적기만 한 것인지 구분이 안 됐다.
그러면 D+30에 유효율이 낮게 나와도 규칙이 틀린 건지 판정을 안 한 건지 모른다.

  게이트: G-3 통과
  지문: "이 분야에 관심 없는 사람이 볼 이유"를 실제로 쓴 문장
       → "마케터가 아니어도 '내가 만든 걸 아무도 안 봤다'는 경험은 다 있다"

**③ 신규 파일 6종**
  prediction-schema.md      ★ 예측 자동 채점 규격 (Phase 4의 핵심)
  _setup/infra-decisions.md   인프라 제안 반복 추적 (INF-01~06)
  _setup/HANDOVER-SEED.md     설계·구조·인프라
  _setup/HANDOVER-LOG.md      미해결·사고 (append-only)
  _setup/prompt-*.md          개별 프롬프트 상세본
  _setup/eval-namheon-Q1-Q10.md  남헌 응답 기록 (참고용)

### 교체 대상 (총 27개)

  solfa/     README, 01-methodology, 02-gate, 03-excerpts, 04-decisions, 05-provenance
  pdp/       README, 01-methodology, 02-gate, 03-excerpts, 04-decisions, 05-provenance
  루트       00-gate.md, cross-decisions.md, cross-summary.md, eval-set.md,
             prediction-schema.md ★신규
  _setup/    prompts.md, project-setup-v2.md, verify-additions.py,
             infra-decisions.md, HANDOVER-SEED.md, HANDOVER-LOG.md,
             prompt-A-updated.md, prompt-B-CC.md, prompt-G-loop.md,
             eval-namheon-Q1-Q10.md, MASTER-PROMPT.md (이 파일)

※ 기존 setup/ 이 있으면 _setup/ 으로 rename 후 덮어써
※ 기존 _setup/HANDOVER.md 가 있으면 삭제 — SEED/LOG로 분리됐다

### .gitattributes

  methodology/content/solfa/04-decisions.md merge=union
  methodology/content/pdp/04-decisions.md merge=union
  methodology/content/cross-decisions.md merge=union
  methodology/content/eval-set.md merge=union
  methodology/content/_setup/infra-decisions.md merge=union
  methodology/content/_setup/HANDOVER-LOG.md merge=union

═══════════════════════════════════════════════════════════════
Phase 2 — 검증기 확장
═══════════════════════════════════════════════════════════════

_setup/verify-additions.py 의 세 검사를 verify-methodology-archive.py 에 병합:

  check_namespace()    게이트/규칙/로그 접두어 4종
  check_paths()        백틱 안 .md 경로 실존
  check_fingerprint()  게이트: 통과 인데 지문이 비면 실패

그리고 하나 더 추가:

  check_prediction_schema()
    - 04-decisions.md의 LOG 엔트리 중 `예측:` 블록이 있는 것은
      필수 6필드(metric/direction/baseline/threshold/horizon/because)를 갖췄는가
    - metric 코드가 prediction-schema.md §1-1에 정의된 것인가
    - because 코드가 실제 정의된 규칙인가 (R-01~14 / P-01~14 / C-01~12)
    - ⚠️ 템플릿(``` 블록)은 제외

⚠️ 화이트리스트를 반드시 유지해:
   SKIP_DIRS  = ("_setup",)
   SKIP_FILES = {"insight-guide.md", "SKILL.md"}
없으면 오탐이 51건 나온다. 첫 실행에서 53건 중 51건이 오탐이었다.
오탐 많은 검증기는 무시하게 되고, 그러면 진짜를 놓친다.

병합 후 실행해서 exit code 와 실패 항목 보고. 0이어야 한다.

═══════════════════════════════════════════════════════════════
Phase 3 — 스킬 동기화
═══════════════════════════════════════════════════════════════

1. scripts/sync-content-skill.sh 실행 → references 8개 동기화
2. .claude/skills/content-gate/SKILL.md 갱신:
   - 게이트 참조를 G- 로: "pdp P-0~P-13" → "pdp G-0~G-13",
     "pdp P-3·P-7 건너뜀" → "pdp G-3·G-7 건너뜀", 그 외 게이트를 가리키는 P-숫자 전부
   - 로그 절에 추가: "로그 엔트리에 예측·지문을 반드시 채운다.
     예측은 prediction-schema.md 포맷을 따른다. 자연어 예측 금지."
3. references/ 에 prediction-schema.md 추가 (스킬이 예측을 쓰려면 필요)
   ⚠️ eval/answers.md 는 절대 넣지 마

═══════════════════════════════════════════════════════════════
Phase 4 — ★ 폐쇄 학습 루프  (Q3 확인 후에만)
═══════════════════════════════════════════════════════════════

상세 규격은 methodology/content/prediction-schema.md 전문 참조.
아래는 구현 지시만.

### 4-1. scripts/parse-predictions.mjs

04-decisions.md 양쪽에서 `### LOG-YYYYMMDD-nn` 엔트리의 `예측:` YAML 블록을 파싱.
필수 6필드 검증. 누락 시 INVALID 마킹 + 이유 리포트.
⚠️ 템플릿 코드블록은 제외.
출력: eval/predictions.json

### 4-2. scripts/score-predictions.mjs

prediction-schema.md §4 규칙 그대로 구현:

  1. horizon 시점 metrics 조회
  2. views < 100 → 보류 (표본 부족)
  3. baseline 계산 (median_last_k 기본 K=10 / median_format_k / median_all /
                    absolute / paired)
  4. MAD 계산. **0이면 20pct 폴백**
  5. delta = 실측 − 기준선
  6. up:     delta ≥ threshold×MAD           → 유효
     down:   delta ≤ −(threshold×MAD)        → 유효
     within: value[0] ≤ 실측 ≤ value[1]      → 유효
     임계 미달(up/down)                       → **보류** (무효 아님)

⚠️ **무효와 보류를 반드시 구분.** 방향이 반대면 무효, 노이즈 범위면 보류.
   섞으면 규칙 신뢰도가 오염된다. CLAUDE.md §7.1과 같은 원칙.

부트스트랩 (§2-3):
  1~4건  → 자동 보류
  5~9건  → median_all + 20pct, 가중치 0.5
  10건+  → median_last_10 + 1.0mad, 정식

복합 판정 (§4-3) — 가중 다수결:
  가중치 save_rate 8 / like_rate 4 / share_rate 2 / views 1
  score = Σ(가중치 × 판정값), 유효 +1 / 무효 −1 / 보류 0
  > 0 유효 / < 0 무효 / = 0 보류

### 4-3. 결과를 04-decisions.md에 append

⚠️ 기존 엔트리 수정 금지. append-only.
해당 LOG 엔트리 아래에 `실측:` / `채점:` / `검증:` 블록 추가.
merge=union 이 걸려 있으니 충돌은 자동 처리된다.

### 4-4. scripts/rule-confidence.mjs

`because` 로 규칙에 귀속. **Wilson score 하한** 사용 (단순 비율 금지).

  n = 유효 + 무효          (보류는 분모 제외)
  p = 유효 / n,  z = 1.96
  lower = (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)

  1승 0패 → 단순 100% vs Wilson 21%
  7승 1패 → 단순  88% vs Wilson 53%

출력: eval/rule-confidence.md

자동 액션:
  무효 3건 누적          → 04-decisions.md §3 에 UPD- 후보 자동 생성
  Wilson하한 < 30% (n≥5) → ⚠️ 규칙 재검토 플래그
  유효 10건 + 하한 > 70%  → ✅ 안정 규칙 마킹
  보류 비율 > 50% (n≥10)  → ⚠️ **규칙이 아니라 측정이 틀린 것.** 지표·임계 재설계

### 4-5. scripts/generate-eval-questions.mjs

prediction-schema.md §6 규칙:
  정방향 `무효`              → 문항 생성. 정답 = 실측
  역방향 "한쪽만 탈락"       → C-xx 갱신 대상으로도 등재
  역방향 "둘 다 탈락"인데 터짐 → 양쪽 공통 구멍

⚠️ `[자동생성]` 태그 필수. 원문 30문항은 정답이 검증된 것이고,
   자동 생성은 **내 데이터가 정답지**다.

### 4-6. scripts/run-loop.mjs

  node scripts/run-loop.mjs --horizon h168
  → parse → score → append → confidence → generate-questions → 리포트

GitHub Actions 워크플로 파일도 만들되 **`on: workflow_dispatch` 로만** 둬.
스케줄 등록은 남헌 승인 후.

### 4-7. 규칙별 기본 예측 템플릿

규칙 SEED 28개(R-01~14, P-01~14)에 **기본 예측**을 붙여줘.
판정과 예측은 1:1로 대응한다 — "P-03을 적용해 표본을 넓혔다"면
"저장률이 오른다"가 따라 나온다.

  R-11 / P-03  →  기본 예측: save_rate up, 1.0mad, h168
  P-04         →  기본 예측: views within [하한,상한], h168
  R-13 / C-10  →  (효율화는 성과 예측이 아님 — 예측 없음으로 명시)

04-decisions.md 의 각 규칙 블록 말미에 `기본 예측:` 줄을 추가.
전부 붙일 필요는 없다. **예측이 도출되지 않는 규칙은 "예측 없음"이라고 명시**해줘.

이러면 규칙 SEED가 판정 기준 + 예측 생성기 두 역할을 하게 되고,
규칙 자체가 **반증 가능한 가설**이 된다.

═══════════════════════════════════════════════════════════════
Phase 5 — 평가 하니스 (회귀 방지)
═══════════════════════════════════════════════════════════════

### 5-1. 문항/정답 물리 분리 (INF-04 해소)

  methodology/content/eval-set.md       ← 유지 (설명·사용법·확장)
  methodology/content/eval/questions.md ← §2 문항 30개
  methodology/content/eval/answers.md   ← §3 정답 + §4 채점표

eval-set.md 의 §2·§3·§4 자리에 포인터만 남겨.
⚠️ answers.md 는 스킬 references·프로젝트 지식 어디에도 넣지 마.

### 5-2. scripts/run-eval.mjs

  - questions.md 파싱 → content-gate 스킬이 로드된 **깨끗한 컨텍스트**에 하나씩
  - answers.md 는 컨텍스트에 절대 안 들어감. 이전 문항 답변도 안 들어감
  - 채점: 각 2점 (선택 1점 + 근거 1점). 근거는 **표현이 달라도 같은 규칙이면 정답**
  - ★ **선택 O / 근거 X** 따로 카운트 (우연히 맞힌 것)
  - **3회 실행** → 안정 정답 / 불안정 / 안정 오답 3분류
    (3회 다 맞음=안다 / 다 틀림=모른다 / 1~2회=우연)
  - 결과: eval/results/YYYY-MM-DD-<commit>.md

서술형 13문항(Q1,6,10,11,13,17,22,23,25,26,27,29,30)은 자동 채점이 어렵다.
키워드 매칭 + 애매하면 `수동확인` 마킹, 건수를 리포트에 명시.

⚠️ **스킬이 못 푼다고 스킬을 고치지 마.** 이번엔 측정만. 베이스라인 확보가 목적.

### 5-3. 재실행 가이드

eval-set.md 에 §6 추가:
  언제: SKILL.md 수정 / references 갱신 / 규칙 SEED 갱신 후
  명령: node scripts/run-eval.mjs --runs 3
  판정: 베이스라인 대비 -4점 이상이면 회귀 → 수정 되돌림
  ⚠️ 문항이 추가되면 만점이 바뀌므로 **비율(%)로 비교**

═══════════════════════════════════════════════════════════════
Phase 6 — MANIFEST (INF-01, 강제 착수 대상)
═══════════════════════════════════════════════════════════════

infra-decisions.md 의 INF-01 은 **반복 2회 + 사고 2건**으로 강제 착수 기준이다.

  2026-09-03 제안: --check-project-sync (SHA 비교)
  2026-09-04 제안: MANIFEST.txt (md5)
  그 사이 사고: solfa 자리에 pdp 사본 / 02-gate 구버전 커밋

methodology/content/MANIFEST.txt 생성:

  solfa/01-methodology.md   <md5>   119 subs   116 markers
  solfa/02-gate.md          <md5>   12 gates   G-R:yes
  pdp/01-methodology.md     <md5>    95 subs    92 markers
  pdp/02-gate.md            <md5>   15 gates   G-R:yes
  cross-decisions.md        <md5>   12 C-codes
  ...

pre-commit hook 에서 실제 파일과 대조. 세 가지가 한 번에 잡힌다:
  사본 사고    — solfa와 pdp의 md5가 같으면 즉시 발견
  구버전 커밋  — 전달 시점 md5와 다르면 발견
  누락        — 매니페스트에 있는데 파일이 없으면 발견

완료 후 infra-decisions.md 의 INF-01 상태를
`미착수` → `[완료 YYYY-MM-DD] 커밋 <해시>` 로. **엔트리는 지우지 마.**

═══════════════════════════════════════════════════════════════
Phase 7 — 잔재 정리 및 커밋
═══════════════════════════════════════════════════════════════

  cross-summary.md          → 첨부본으로 커밋
  setup/                    → _setup/ 으로 rename
  리포 루트 solfa/           → 삭제 (정본은 methodology/content/solfa/)
  feedback-loop-design.md   → ⚠️ Phase 0 Q2 답변 후 남헌 결정. 지금 건드리지 마

커밋을 Phase별로 쪼개줘 (되돌리기 쉽게):

  1) fix(methodology): 네임스페이스 충돌 해소 + 지문 필드 + 문서 6종 신규
  2) feat(verify): 네임스페이스·경로·지문·예측스키마 검사 4종
  3) chore(skill): content-gate references 동기화 + G- 코드 반영
  4) feat(loop): 예측 자동 채점 파이프라인 (parse/score/confidence/questions/run)
  5) feat(eval): 문항·정답 분리 + 평가 러너 + 베이스라인
  6) feat(verify): MANIFEST 드리프트 검출 (INF-01 완료)

═══════════════════════════════════════════════════════════════
제약 (전부 실제 사고에서 나온 것)
═══════════════════════════════════════════════════════════════

- **자동 발행 절대 금지.** §10 정책. 한 번 드리프트 재발로 재확인됐다.
  루프가 잘 돌수록 "발행만 자동화하면 완전자동"이라는 유혹이 커지는데 그게 가장 위험하다.
- DB 마이그레이션은 SQL만 작성, 적용 금지 (Supabase 대시보드에서 남헌이 직접)
- 04-decisions.md `## 2. 규칙 SEED` 영구 보존. 절대 수정 금지 (기본 예측 줄 추가는 예외)
- 기존 LOG 엔트리 수정 금지. append만
- infra-decisions.md / HANDOVER-LOG.md 도 append-only. 상태만 변경
- Q3(saves) 미확인 시 Phase 4 진행 금지
- 시작 전 `pwd` + `git remote -v` 확인

═══════════════════════════════════════════════════════════════
보고 사항
═══════════════════════════════════════════════════════════════

**Phase 0 (가장 중요)**
- Q1 grep 결과 원문
- Q2 5개 항목 답변 (+ prediction-schema.md 와 겹치는 절)
- **Q3 saves 가용 여부 + metrics 컬럼 전체 목록 + 테이블 스키마**
- Q4 연결 방식 2~3안 (침습도 순) + 마이그레이션 SQL

**Phase 1~3**
- 교체 파일 수 / 첨부본과 리포 md5 대조 (전부 일치해야 함)
- 검증기 exit code + 오탐 건수 (0이어야 함. 아니면 화이트리스트 확인)
- SKILL.md 에서 P- → G- 로 바꾼 지점 목록

**Phase 4**
- 생성한 스크립트 목록과 역할
- 로그가 비어 있으니 **더미 데이터로 dry-run** 한 결과
- 기본 예측을 붙인 규칙 / "예측 없음"으로 남긴 규칙 목록

**Phase 5**
- 3회 실행 총점 (평균/최소/최대), 선택O·근거X 건수
- 안정 정답 / 불안정 / 안정 오답 3분류
- **C-01 오답 수** (2개 이상이면 강조 — 두 방법론이 일치한 유일 영역)
- 수동확인 마킹 문항

**Phase 6~7**
- MANIFEST 생성 결과 + hook 동작 확인
- 잔재 정리 결과

**공통**
- 이 설계로 커버 안 되는 케이스가 보이면 지적해줘
```

---

## 부록 A: 실행 순서와 차단점

```
Phase 0 (확인)
   ├─ Q1, Q2 → Phase 7 잔재 정리에 영향
   └─ Q3 ★ → 통과해야 Phase 4 진행 가능
         Q4 → Phase 4 구현 방식 결정

Phase 1 → 2 → 3        (순차. 파일 → 검증 → 스킬)
Phase 4                (Q3 통과 후)
Phase 5                (Phase 1 후 언제든. 독립)
Phase 6                (Phase 1 후 언제든. 독립)
Phase 7                (마지막)
```

**Phase 5·6은 Phase 4와 병렬 가능하다.** Q3가 막히면 5·6을 먼저 돌리면 된다.

## 부록 B: 첨부 파일 목록 (27개)

```
methodology-content/
├── 00-gate.md                    통합 게이트 (U-3 / D-5 / X-3)
├── cross-decisions.md            교차 판정 C-01~C-12
├── cross-summary.md              지식 주입용 요약본
├── eval-set.md                   평가 세트 30문항
├── prediction-schema.md          ★ 예측 자동 채점 규격 (신규)
├── _setup/
│   ├── MASTER-PROMPT.md          이 파일
│   ├── prompt-A-updated.md       Phase 1~3 상세본
│   ├── prompt-G-loop.md          Phase 4 상세본
│   ├── prompt-B-CC.md            Phase 5 상세본
│   ├── prompts.md                프롬프트 A~G 목록
│   ├── project-setup-v2.md       프로젝트 지식 구성 + 커스텀 인스트럭션
│   ├── verify-additions.py       검증기 확장분
│   ├── infra-decisions.md        INF-01~06 (신규)
│   ├── HANDOVER-SEED.md          설계·구조 (신규)
│   ├── HANDOVER-LOG.md           미해결·사고 (신규)
│   └── eval-namheon-Q1-Q10.md    남헌 응답 기록
├── solfa/    README, 01~05  (6)
└── pdp/      README, 01~05  (6)
```
