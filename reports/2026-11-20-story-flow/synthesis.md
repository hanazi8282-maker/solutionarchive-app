# 사례 기반 맞춤 적용 문장 층 — 사용법 (2026-11-20, v71cu §4-1)

상태: **구현·셀프테스트 완료, 실DB·실LLM 실행은 하지 않았다(오케스트레이터 몫).** `STORY_FLOW_ENABLED`·`stageFirst`·`topic` 기본 OFF 그대로, 점수식 상수·평가 합격선(`PASS`) 그대로, `compose.ts` 안 건드림, 마이그레이션 없음, DB 쓰기 없음.

배경: 진단 15개 독립 채점(Opus·Fable)에서 새 경로 '비슷한 사례' 칸 6항목 평균 1.84(합격선 3.8). 낮은 항목은 상황 같음 1.2 · 실행 가능성 1.27 · 판단 도움 1.27 · 새로움 1.5(구체성·읽기 2.87). 채점 대상이 사례 3개를 나열한 칸뿐이라, 그 사례를 이 고객의 단계·자원·병목에 맞춰 풀어 주는 문장이 없으면 이 항목들이 구조적으로 오를 수 없다. 지시서 §4-1 '생성 문장이 일반론/적용 문장 부재' 층.

## 무엇을 만들었나

| 파일 | 무엇 |
|---|---|
| `lib/consult/story-flow-synthesis.ts` (새) | `buildSynthesisPrompt(diagnosis, picks)` · `parseSynthesis(raw, n)` · `verifySynthesis(out, picks, diagnosis?)` · `synthesize(d, picks, askJson)`(LLM 주입) |
| `lib/consult/clip-text.ts` (새) | `clipText`(story-flow-select 에서 옮김, 그대로 다시 내보냄) · `clipSentences`(인용 원문용) · `healClip`(옛 200자 잘림 복구) |
| `scripts/story-flow-eval-pack.mjs` | `--synth`(기본 꺼짐) — 모든 칸에 같은 합성 층 |
| `scripts/story-flow-synthesis-selftest.mjs` (새) | 회귀, `consult-selftest` 에 배선 |

출력 스키마: `{ summary_for_you, do_this_week: [{step, from_case, why}] ≤3, dont_do: [{avoid, from_case, why}] ≤2, caveat }`.

프롬프트 규칙(파서·검사·테스트가 고정): 지어내기 금지(사례·진단에 없는 사실·수치·도구·회사·고객 정보 금지, 새 숫자 금지) · 모든 항목 `from_case` 필수(1~N) · 할 일은 1주 안에 시작·단계·자원에 맞게·사례 행동에서만 · 하지 말 것은 실패 사례에서 · 사례가 진단과 크게 안 맞으면 요약에 쓰고 할 일을 0~1개로 · 인용 금지 소스(`[인용: 금지]`)는 번역 인용을 아예 싣지 않고 따옴표로 옮기지 않음 · `UNTRUSTED_INPUT_NOTICE` 를 system 에, 데이터는 user 의 `<diagnosis>`·`<cases>` 블록에만.

`parseSynthesis`: 빈 칸·길이 초과(요약 700·항목 200·주의 300)·개수 초과·`from_case` 범위 밖·정수 아님이면 실패(잘라서 살리지 않는다).

`verifySynthesis`(사고 방지선): 출력의 숫자(낱개 토큰 비교 — `1` 은 `1.2` 의 근거가 아니다, `사례 N` 참조는 제외)·영어 낱말 2자 이상(도구·서비스 이름)·한국 플랫폼 이름 목록(`KO_NAMES`)이 사례 글(+진단 글)에 없으면 실패 → 그 합성은 버린다. 인용 금지 소스의 번역은 근거로 쓰지 않는다.

## 평가에서 쓰기 (오케스트레이터 — 메인 리포, 이 브랜치 체크아웃 뒤)

```bash
node --env-file=.env.local scripts/story-flow-eval-pack.mjs --diagnoses <리포 밖>/diagnoses.json --out <리포 밖>/eval-03 --seed 20261120 --variants both --db --synth --good-controls <리포 밖>/good-controls.json
node scripts/story-flow-eval-score.mjs --key <리포 밖>/eval-03/key.json --responses <리포 밖>/opus.json <리포 밖>/fable.json --agree --out <리포 밖>/eval-03/result.json
```

- 합성 대상: 새 경로 칸(base·topic) · 기존 경로 칸(비어 있지 않을 때) · 나쁜·좋은 대조군 칸 — **같은 진단·같은 프롬프트·같은 모델(Sonnet, 구독 경로 `runCli`)**. 진단은 채점자가 보는 진단 그대로(`diagnosisInfo` — 사업 설명·막힌 곳·상황·어려움·고객 이야기 600자).
- 합성 입력: 새 경로 칸은 기준 에피소드의 행동·결과·조건·어려움 + 인용 번역(인용 허용 소스만). 기존 경로·일반론·외부 대조군 칸은 화면에 보이는 '무엇을 했나'(+번역)뿐이다 — 원천에 그 이상이 없다(공정성 한계, 아래).
- 패킷: 각 칸 사례 아래에 `이 고객에게(요약) · 이번 주 할 일(사례 N) · 하지 말 것 · 주의` 를 덧붙이고, 채점 안내에 "그 칸까지 포함해 채점" 한 줄이 붙는다. 칸 글자·배치는 합성 켜고 끄기와 무관(난수 안 씀). `--synth` 없으면 패킷은 한 글자도 안 바뀐다(packet_id 같음).
- 사례 없는 칸은 합성하지 않고 '(제시된 사례 없음)' 그대로.
- 실패 처리: 호출·형식 실패(`failed`) · 근거 없는 숫자·이름(`unsupported`) → 그 칸만 합성 없이 원래 모양, `key.json` `notes.synth.<칸 종류>` 와 `problems` 에 기록(→ 종료 1). 한도 오류(`StopRun`)면 파일을 쓰지 않고 멈춘다.
- 비용: 사례 있는 칸마다 Sonnet 1회. 진단 15개 × 칸 5개(기존·base·topic·나쁜·좋은) ≈ 75회 + 기존 경로 Haiku 30회.
- `key.json` `synth: { enabled, model, input }`.
- 블라인드: 패킷에 경로·플래그·합성 단어가 없다(셀프테스트 금지어: legacy·story_flow·topic·base·synth·합성·variant·대조·slug·src 등). 패킷 JSON 칸의 합성 필드 이름은 `for_you`.

## 결론서 연결 방법 (하지 않았다 — 평가에서 효과가 확인된 뒤 결정)

`compose.ts` 에서 `similar` 가 정해진 뒤 `synthesize({ pitch: run.one_liner, bottleneck, situation, adversity: ch1.leak_or_gap?.detail }, similar.map(toSynthPick), askJson)` 을 부르고 `status==='ok'` 일 때만 `ch1.for_you` 로 붙이는 한 블록이다(`askJson` = `consultLlmJson` purpose `'synth'`, 실패·`unsupported` 면 칸 없이 기존 모양). 그때 화면(ch1 렌더러)·`ch1-validate` 에 칸을 더하고, story flow 쪽 `toSynthPick` 은 `payload.story_flow` 의 기준 에피소드에서 만든다.

## 잘림 필드 수정 (직전 패킷 eval-round2b D12 패널 E 의 끊긴 마지막 문장)

| 필드 | 어디서 | 이전 | 지금 |
|---|---|---|---|
| 꼬리표 `action_ko`·`result_ko`·`quote_ko`·`condition_ko`·`adversity_ko`·`why_ko` 등 | `lib/story-label/core.mjs` `clip` | `slice(0, 200)` — 낱말 중간 | `clipText(…, 200)` |
| 꼬리표 `quote_orig` | 같은 파일 | `slice(0, 800)` | `clipSentences(…, 800)` — 완결 문장 단위만, 한 문장도 안 들어가면 자르지 않음 |
| 이미 저장된 옛 꼬리표(200자 잘림) | 패킷 `quoteKo`(번역)·`pickItem` src · `story-flow-select` 요약(`summary_ko` = what) | 그대로 노출 | `healClip` — 정확히 200자이고 문장 끝·'…' 로 안 끝나면 199자 안에서 문장·낱말 경계로 다시 자름 |
| 기존 경로 `what` | `lib/consult/cases-validate.ts` `caseLine` | `slice(0, 110)` | `clipText(…, 110)` (이름도 `clipText(…, 60)`) |
| 기존 경로 `why` | 같은 파일 `pickSimilar` | `slice(0, 60)` | `clipText(…, 60)` |
| 새 경로 `why` | `pickItem` | 이미 `clipText(…, 120)` | 그대로 |

- D12 패널 E 의 마지막 줄이 어느 필드였는지는 그 패킷을 보지 못해(리포 밖) 확정하지 못했다. 후보는 번역(`quote_ko` 200자 저장 잘림 — 800자 원문의 번역이라 가장 유력)·기존 경로 `what`(110자)·요약(200자 `action_ko`) 셋이고, 셋 다 고쳤다.
- `quote_orig` 는 화면·패킷에서 자르지 않는다(인용 검증이 원문 문장 단위 일치를 요구).
- 옛 꼬리표 DB 값 자체는 그대로다(백필 없음). `healClip` 은 읽을 때만 고친다.

## 덤으로 고친 것

- `lib/story-label/cli.mjs` `runCli` 가 자식 `claude -p` 에 `SUPABASE_SERVICE_ROLE_KEY` 도 넘기지 않는다(`--env-file=.env.local` 로 부르는 평가 스크립트가 이 경로를 지난다, CLAUDE.md §10.1).

## 테스트

- `node scripts/story-flow-synthesis-selftest.mjs` — 프롬프트 규칙 키워드 12개·표준 경고·데이터 분리·인용 금지 소스 미적재 / 파서 경계(할 일 3·4개, 하지 말 것 2·3개, from_case 0·N·N+1·1.5, 요약 700·701자, 빈 칸) / 근거 검사(지어낸 30%·하루 5명·`1` vs `1.2`·Zapier·네이버 → 실패, 사례·진단의 숫자·Notion·Google·"사례 N" → 통과) / `--synth` 패킷(칸 배치 불변·꺼짐=packet_id 같음·빈 칸 미합성·모든 칸 같은 프롬프트·금지어 없음·근거 실패·호출 실패 칸은 원래 모양+problems·버린 합성 미노출·StopRun 멈춤) / 자르기(옛 200자 복구·$1.2k 안 쪼갬·인용 원문 문장 단위·기존 경로 what 110·why 60 경계)
- `node scripts/consult-selftest.mjs` → 통과 229건(기존 테스트 전부 + 새 묶음 1) · `untrusted-input-selftest` 80/80(합성 프롬프트 등록) · tsc strict(바뀐 TS + compose.ts) 0 · eslint(바뀐 파일) 0

## 한계 · 미확인

- **실LLM 출력 품질·검사 통과율 미확인.** 근거 검사는 엄격하다 — 사례에 없는 일반 영어 낱말(SEO·CTA 등)도 실패시킨다. 버림이 많으면 `key.json` `notes.synth` 를 보고 프롬프트를 조이거나 허용 낱말 목록을 둔다.
- 한국어 수 낱말("세 명")·한국어 고유명(목록 밖)은 못 잡는다(`ponytail:` 주석).
- 공정성: 새 경로 칸은 에피소드의 조건·어려움까지 합성 입력으로 받지만, 기존 경로 칸은 원천(`case_bank` 한 줄)에 행동 한 줄뿐이다. 같은 프롬프트·같은 진단이지만 입력 정보량은 다르다 — 그 차이는 원천 차이 그대로다.
- 합성 일부 칸만 실패하면 그 진단의 칸끼리 비교가 기울 수 있다 — `problems` 로 보이니 실채점 전에 확인한다.
