# story flow 콘텐츠 가치(고객 관점) 평가 파이프라인 — 사용법 (2026-11-20)

상태: **구현·셀프테스트 완료, 실DB 실행은 하지 않았다(오케스트레이터 몫).** `STORY_FLOW_ENABLED`·`stageFirst`·`topic` 기본 OFF 그대로, 점수식 상수(0.35/0.30/0.15/0.15/0.05) 그대로, `compose.ts` 안 건드림, 마이그레이션 없음, DB 쓰기 없음.

## 무엇을 하나

1. `scripts/story-flow-eval-pack.mjs` — 외부 진단 입력(리포 밖 JSON) 하나로, 같은 실행에서 진단마다
   - 기존 경로 `retrieveSimilar`
   - 새 경로 `enrichDiagnosis` + `selectStoryFlow` — 변형 `base`(칸 채우기 + `stageFirst`) · `topic`(칸 채우기 + `stageFirst` + `topic` = `STORY_FLOW_B_OPTS`)
   - 나쁜 대조군(일반론 템플릿 2건 + 다른 영역 진단의 새 경로 사례 1건, 다른 영역이 없으면 일반론 3건)
   - 좋은 대조군(같은 장(병목) story flow 카드 중 잘 된 사례만, 주제 일치(영역) → 점수 순 3건)

   을 **같은 마크다운 형식**("### 결론서 X" → "비슷한 사례" → `사례 N` · 무엇을 했나 · 왜 비슷한가 · 원문 인용 + 번역)으로 렌더링하고, 칸 순서를 시드로 섞어 채점 패킷을 만든다. 회사명은 `사례 N` 으로 바꾸고, 실패 사례에는 `⚠ 잘 안 풀린 경우`(mixed 는 `반쯤만 풀린 경우`), 인용에는 `quote_ko` 를 병기한다(없으면 "(번역 없음)").
2. `scripts/story-flow-eval-score.mjs` — 채점자 응답 JSON 들 + 정답 표로 합격 판정.
3. `scripts/story-flow-eval-selftest.mjs` — 합성 입력 회귀(`consult-selftest` 에 한 줄 배선, CI build-check 에서 돈다).

## 진단 입력 스키마 (리포 밖 파일, 배열 또는 `{ "diagnoses": [...] }`)

```json
{ "id": "d01", "area": "5", "has_pitch": false, "name": "…", "pitch": "…", "url": "https://…", "business_model": "월 구독",
  "bottleneck": "방문하는 사람이 적다", "situation": { "stage": "zero_rev", "customer": "smb", "price_band": "<10", "team_size": "solo", "pricing_model": "subscription" },
  "adversity_text": "…", "customer_story": "…" }
```

- `area`: `1`~`5` · `design`. `bottleneck`: 결론서 질문 답(`방문하는 사람이 적다`·`와서 가입을 안 한다`·`가입하고 쓰다 만다`·`써 보고 돈은 안 낸다`), 장 키(`not_arriving` 등), analysis 코드(`AWARENESS`·`DISTRIBUTION`·`TRUST`·`CONVERSION`·`UNIT_ECONOMICS`·`RETENTION`) 중 하나. 모르면 입력 오류(기본 장으로 접지 않는다).
- **`has_pitch=false` = 실제 경로 조건**: 두 경로 모두 사업 설명을 비우고, 상황은 `stage` 만 넘긴다(결론서 `diagnosisFromReport` 가 채우는 칸과 같다). URL·영역 이름·`adversity_text` 는 넘긴다.
- **`has_pitch=true`**: `pitch`(+`business_model`)를 사업 설명으로, `situation` 다섯 칸 전부를 넘긴다.
- 채점자에게는 두 조건 모두 입력의 사업 설명·상황·고객 이야기를 그대로 보여 준다(고객은 자기 사정을 안다). 병목은 코드 대신 말로 바꿔 보여 준다.

## 명령

```bash
# 오프라인 연기 시험(합성 카드 픽스처 · 기존 경로 미실행 → 그 칸은 비어 나감, 실채점에 쓰지 않는다)
node scripts/story-flow-eval-pack.mjs --diagnoses <리포 밖>/diagnoses.json --out <리포 밖>/eval-01 --seed 20261120 --variants both

# 실DB(오케스트레이터만 — 읽기 전용 + 기존 경로 질의·심사 Haiku, 구독 경로 claude -p)
node --env-file=.env.local scripts/story-flow-eval-pack.mjs --diagnoses <리포 밖>/diagnoses.json --out <리포 밖>/eval-01 --seed 20261120 --variants both --db

# 채점(응답 파일 1개 이상, 두 채점자 일치도는 --agree)
node scripts/story-flow-eval-score.mjs --key <리포 밖>/eval-01/key.json --responses <리포 밖>/opus.json <리포 밖>/fable.json --agree --out <리포 밖>/eval-01/result.json

# 셀프테스트
node scripts/story-flow-eval-selftest.mjs
node scripts/consult-selftest.mjs
```

- `--variants`: `base` · `topic`(기본) · `both`(두 열), 쉼표 목록도 된다.
- 실DB 비용: 진단당 Haiku 2회(기존 경로 질의·심사). 한도 오류(`StopRun`)면 파일을 쓰지 않고 종료 1.
- 종료 코드 — pack: 0 끝까지 · 1 확인 실패 있음(`key.json` problems: 기존 경로 실패로 뺀 진단, 좋은 대조군 3건 미만 등) · 2 입력/DB 못 읽음 · 64 사용법. score: 0 모든 변형 합격 · 1 불합격/무효 · 2 파일 못 읽음 · 64 사용법(모르는 인자 포함).

## 산출물 — 채점자 폴더와 정답 표를 나눈다

```
<out>/packet/packet.md          채점자가 읽는 패킷(진단 + 결론서 칸들 + 시험① 짝)
<out>/packet/packet.json        같은 내용(자동 채점자용)
<out>/packet/form.schema.json   응답 JSON Schema
<out>/packet/form-template.json 빈 응답(packet_id·진단·칸 글자·짝이 채워져 있음)
<out>/key.json                  정답 표 — 채점자에게 주지 않는다(칸 글자 → legacy/base/topic/bad/good, 짝, 변형 옵션, fallback, 진단 조건, problems)
```

- 채점자에게는 **`packet/` 폴더만** 준다. 패킷에는 경로·플래그·점수식·코드·대조군 정체·회사명·내부 slug 가 없다(셀프테스트가 금지어 목록으로 고정).
- 새 경로가 `ok` 가 아니면 결론서 실경로(`chooseSimilar`)처럼 그 칸에 기존 경로 목록이 나간다 — `key.json` `notes.<변형>.fallback=true`.
- ⚠ **공개 리포.** 진단·고객 이야기가 패킷·key 에 들어간다. `--out` 은 리포 밖에 둔다(리포 안이면 경고). 커밋하지 않는다.

## 좋은 대조군을 사람·외부 작성자가 고르기 (E3, 2026-11-20 추가)

배경: 첫 실채점(진단 15개, Opus·Fable)에서 두 채점자 모두 **대조군 신뢰 검사 실패 → 무효**가 났다(일치도 r 0.85~0.97). 자동 좋은 대조군이 "같은 장 상위 점수 카드"라 진단과 안 맞았다(예: 콜센터 QA 서비스에 월 $2,500 이메일 클로징·Profit First 마진 사례) — 채점자가 합리적으로 낮게 준 것이다. 합격선·채점자·`PASS` 는 그대로 두고, 좋은 대조군을 실제로 좋은 것으로 넣는 경로를 더했다. `--good-controls` 가 없으면 기존 동작(자동) 그대로다.

```bash
# 1) 후보 덤프 — 진단마다 새 경로 후보 상위 40장(권장 설정 순위, 에피소드 전부) + 기존 경로 후보. 채점자에게 주지 않는다.
node --env-file=.env.local scripts/story-flow-eval-pack.mjs --diagnoses <리포 밖>/diagnoses.json --out <리포 밖>/eval-02 --seed 20261120 --variants both --db --dump-candidates <리포 밖>/eval-02-cand

# 2) <리포 밖>/eval-02-cand/candidates.json 을 보고 진단마다 좋은 사례 3건을 골라 good-controls.json 을 쓴다(사람 또는 별도 작성자 — 채점자와 다른 사람/세션).

# 3) 같은 진단·시드로 다시 패킷 — 좋은 대조군 칸을 외부 작성본으로
node --env-file=.env.local scripts/story-flow-eval-pack.mjs --diagnoses <리포 밖>/diagnoses.json --out <리포 밖>/eval-02 --seed 20261120 --variants both --db --good-controls <리포 밖>/good-controls.json
```

- `candidates.json`: `{ diagnoses: [{ id, info(진단), chapters, new_candidates: [{ cand_id, display_name, source, chapter, score, topic, failed, summary_ko, episodes: [{ chapter, episode_idx, result_class, evidence_strength, adversity_ko, action_ko, result_ko, condition_ko, quote_orig, quote_ko }] }], legacy_candidates: [{ name, what, why }] }] }`. 내부 slug 는 없다(표시용 이름 + 후보 번호).
- `good-controls.json`: `{ "<진단 id>": { "cases": [ { "display_name", "what", "why", "quote_orig", "quote_ko" } ×3 ] } }`.
- 렌더링은 다른 칸과 똑같다(`사례 N`, 무엇을 했나·왜 비슷한가·원문 인용·번역). `display_name` 은 key 에만 남고 패킷에 안 나간다. 칸 글자는 다른 칸처럼 시드로 섞인다(블라인드 유지 — 항상 D 로 고정하지 않는다).
- 검사(하나라도 걸리면 **패킷·key 를 쓰지 않고 종료 1**, 후보 덤프는 씀): 진단마다 정확히 3건 · `what` 필수 · `quote_orig` 가 있으면 **같은 실행에서 다시 뽑은 그 진단의 후보 40장 원문 안에 실제로 포함**(공백·따옴표만 정규화한 부분 문자열) · 입력에 없는 진단 id 없음 · 패킷 진단이 전부 들어 있음. `quote_orig` 를 비우면 인용 줄 없이 나간다.
- 후보는 같은 진단·시드·DB 상태에서 결정적이다. 덤프와 패킷 사이에 DB 가 바뀌어 원문이 빠지면 검사가 실패한다(안전한 쪽).
- `key.json` `good_controls: "external" | "auto"`, 진단별 `notes.good.source`.

## 응답 형식 (form.schema.json)

```json
{ "packet_id": "…", "grader": "opus", "round": "1",
  "diagnoses": [ { "id": "d01",
    "panels": { "A": { "same_situation": 0-5, "specificity": 0-5, "actionability": 0-5, "novelty": 0-5, "decision_help": 0-5, "readability": 0-5,
                       "tomorrow_action": "한 줄", "action_concrete": true } , "B": {…} },
    "test1": [ { "pair_id": "p1", "choice": "A" | "C" | "tie" } ] } ] }
```

- 시험 ① = 진단마다 (기존 vs 변형) 짝. 변형이 둘이면 짝도 둘. 짝의 글자 순서도 섞인다.
- 시험 ② = 칸마다 `tomorrow_action`(내일 할 일 한 줄) + `action_concrete`(행동 구체성 통과 여부, 별도 슬롯 — 같은 채점자가 채우거나 다른 채점자가 채워도 된다).

## 합격 계산 (`story-flow-eval-score.mjs` `PASS` — 남헌 확정, CC 변경 금지, 인자·env 로 못 바꿈)

변형마다 따로 판정한다. 유효 회차(아래 무효 아닌 응답)만 쓴다.

| 검사 | 기준 | 계산 |
|---|---|---|
| 6항목 평균 | ≥ 3.8 | 진단별로 채점자 평균 → 진단 평균의 6항목 평균 |
| 항목별 평균 | 각 ≥ 3.5 | 같은 방식, 항목마다 |
| 샘플 최저 | 어느 항목도 < 3.0 없음 | 샘플 = 채점자 × 진단의 원점수(평균으로 접지 않는다) |
| 시험 ① | (승 + 무) / 전체 ≥ 70% | 채점자 × 진단 × 짝 |
| 시험 ② | `action_concrete` 참 ≥ 80% | 채점자 × 진단의 새 경로 칸 |
| 후퇴 없음 | 새 경로 6항목 평균 ≥ 기존 | 같은 진단·같은 채점자 |

- 비교는 소수 넷째 자리 반올림 값으로(3.8 이 3.7999…로 떨어지는 것 방지). 경계값은 포함(≥).
- **대조군 신뢰 검사 → 실패면 그 회차(응답 파일) 무효**: 진단마다 나쁜 결론서 6항목 평균 < 3.0, 좋은 결론서 평균 ≥ 3.5 이고 나쁜 것보다 높음. 좋은 대조군이 한 건도 없으면 확인 불가 = 무효. *좋은 쪽 3.5 는 지시("높은 점수")의 CC 해석값이라 남헌 확인 전이다(`GOOD_CONTROL_MIN`, 합격선 `PASS` 와 따로 둠).*
- **형식 오류 = 확인 불가 = 무효**: packet_id 불일치, 진단·칸·짝 누락, 0~5 정수 아님, 내일 할 일 빈칸, `action_concrete` 가 true/false 아님, 시험① 선택이 짝 글자·tie 아님.
- 유효 회차가 0이면 판정은 `무효(유효 회차 없음)`.
- `--agree`: 서로 다른 `grader` 의 형식이 맞는 응답 쌍마다, 같은 (진단, 칸) 전부(대조군 포함)로 항목별 Pearson 상관·평균 차이(a−b)·평균 절대 차이. 분산 0·2쌍 미만이면 상관은 확인 불가(null).

## 테스트

- `node scripts/story-flow-eval-selftest.mjs` → 통과: 입력 검사·두 조건(has_pitch)·두 변형 열·같은 형식·실패 표시·번역 병기·금지어(경로·플래그·점수식·대조군·회사명·slug) 없음·대조군 구성·시드 결정성·fallback·기존 경로 실패 제외·StopRun 멈춤·합격선 상수 고정·경계값(평균 3.8/3.77, 항목 3.5/3.0, 샘플 최저 2, 시험① 0.70/0.60, 시험② 0.80/0.60, 후퇴 같음/낮음)·대조군 무효(나쁜 3.0·좋은 3.33·좋은 없음)·무효 회차 제외·형식 오류 5종·일치도·CLI 끝까지(pack → 응답 → score 종료 0)·합격선 인자 거부(64).
- `node scripts/consult-selftest.mjs` 에 배선.

## 한계 · 미확인

- **실DB 실행·실채점은 하지 않았다.** 실제 카드에서 좋은 대조군이 3건 나오는지, 기존 경로 Haiku 판정 실패율은 실행해 봐야 안다(`key.json` problems).
- 블라인드는 "이름·라벨·순서" 수준이다. 새 경로의 이유 문장("손님·값대가 같다 / 숫자로 확인된 결과")과 원문 인용 줄은 형식상 기존 경로(인용 없음, LLM 이 쓴 이유)와 달라 보일 수 있다 — 채점자가 경로를 추측할 여지는 남는다.
- 좋은 대조군은 자동 선택이라 "확실히 좋다"는 보장이 아니다(주제 사전 21개 기반). 대조군 검사가 자주 실패하면 대조군 쪽부터 의심한다.
- 상황 값(`smb`·`zero_rev` 등)은 코드 그대로 보여 준다.
- 오프라인 모드는 기존 경로를 돌리지 않는다 — 연기 시험 전용.
