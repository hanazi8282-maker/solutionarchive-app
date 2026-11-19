# T2 info 'v23 후보' 구현과 평가 배선 (2026-11-20)

브랜치 `feat/t2-v23-candidate`. PR #682(`feat/t2-improvement-p1-p4`)를 `origin/main`(20f73409)에 리베이스한 위에 쌓았다. 충돌은 없었다.
LLM 호출·DB 실행·마이그 적용은 하지 않았다. 킬스위치 수치(`KILL`)는 바꾸지 않았다. **기본값은 그대로 v1(꺼짐)이다.** 머지만으로는 아무것도 바뀌지 않는다.

## 1. 바뀐 것

- `lib/analysis/relevance-criteria.ts`
  - `PRODUCT_INFORMATIVE_CRITERIA_V23`(`info-v23cand-2026-11-20`)을 추가했다. 구성은 info-v1 본문에 남헌 확정 규칙 a~f 블록을 붙인 것이다. v1 본문은 머리글 버전만 바꾸고 Apple Pay 줄은 T(기능 요청)로 뒤집었다.
  - info-v2 블록은 싣지 않았다. v2 (d)의 "개발자 도구 = 영역 안"이 이번 (d)의 "config 로 판단"과 다르기 때문이다.
  - `InfoMode` 에 `'v23'` 을 추가했다. `INFO_CRITERIA=v23` 일 때만 켜진다(`parseInfoMode`).
  - `withInfoCriteria` 가 v24 1차 SYSTEM 과 2차 지시문 안의 v1 블록을 v23 블록으로 바꾼다.
  - `infoVersionSuffix('v23')` 는 `+info-v23cand-2026-11-20` 이다. 그래서 `relevance-judge-auto` 의 `prompt_version` 이 행마다 v23 을 기록한다.
- 예시는 전부 `(가상)` 문장이다. C세트 원문은 넣지 않았다.
  - (b)의 예시는 남헌이 준 가상 예("합법 마케팅 메일은 많이 받고 진짜 스팸은 거의 안 받는다")를 그대로 썼다.
  - `INFORMATIVE_EXAMPLE_INPUT_IDS` 는 9건 그대로다.
- `scripts/t2-approval-eval.mjs`
  - `--info v23`: v23 블록으로 판정한다.
  - `--ids <json>`: 그 ID 만 평가한다. 사람 채점 전체는 끌어오지 않는다. t2-resample 출력을 그대로 받고, `set` 이 있으면 세트별 소계를 낸다.
  - `--gold <json>`: 형식은 `[{input_id, verdict, informative}]` 다. `informative` 는 true, false, `"weak"`, null 중 하나다. 파일을 주면 DB 채점은 섞지 않는다(파일에 없는 행은 정답 없음으로 둔다). 형식 오류가 하나라도 있으면 멈춘다.
  - `--compare v1,v23`: 같은 인자로 두 모드를 자식 프로세스로 차례로 돌리고 비교표를 낸다. 캐시 TAG 는 모드별로 따로다.
  - `--dump-texts <리포 밖 경로> [--dump-set C]`: 누설 검사용 원문을 리포 밖에만 쓴다. 리포 안 경로를 주면 거부한다.
  - 결과 json 에 `unjudged_causes`, `weak`, `by_set`, `rows`(행별 예측·정답·원인), `gold_source` 를 추가했다.
- 정보약 안전 처리
  - `relevance-judge.ts` 파서는 `weak=true` 인 행을 info=true 로 답했어도 false 로 내린다.
  - `second-opinion.ts` `validateOpinions` 도 같다.
  - `relevance-judge-auto` 는 v23 정보약 행의 reason 끝에 `[정보약]` 을 붙인다. promo 태그는 v2·v23 둘 다 붙인다.
- 승인 범위(v23)
  - 내용 가드: 출처 제외를 하지 않는다(v2 와 같다). 버그 리포트와 기능 요청은 규칙 (a)가 가른다.
  - `scopeOptionsFor('v23')`: out-founder 를 v1 처럼 뺀다. 규칙 (d)가 영역 밖을 무관으로 두기 때문이다.

## 2. '정보약'을 담는 방식과 자동 승인 취급

- 판정 스키마에 칸이 없어서 마이그 없이 이렇게 담는다.
  - 출력은 `info=false` 에 태그 키 `weak=true` 를 더한다.
  - 1차 행은 reason 끝에 `[정보약]` 을 단다. 조회는 `reason LIKE '%[정보약]%'` 로 한다.
  - 2차는 `product_informative=false` 이고, 행 단위로 `weak` 를 받는다. DB 에는 저장하지 않는다.
- 자동 승인(rr-v2)은 둘 다 info=true 인 행만 승인한다. 그래서 **정보약은 코드 변경 없이 승인에서 빠진다.** 모델이 info=true·weak=true 처럼 어긋나게 답해도 파서가 false 로 내린다. 태그가 빠졌다고 승인 쪽으로 새지 않는 구조다.
- 평가에서는 gold 가 `"weak"` 인 행을 **승인하면 오류**로 센다.
- 제안(미구현)
  1. 정보약을 따로 재고 싶으면 `review_relevance_verdicts.product_info_level`(`strong|weak|none`) 컬럼 마이그를 만든다. rr-v2 는 계속 둘 다 strong 인 행만 승인한다.
  2. 감사 표본에 정보약 층을 소량 넣는다. 그러면 사람이 "정보약 = 승인 불가"에 동의하는지 잴 수 있다.
  3. 정보약을 승인 대상으로 여는 일은 사람 판단이다(§10.1 조건 2: 기준 문구를 바꾸면 재측정).

## 3. unjudged 15→66 — 코드로 본 원인 후보

`scoreEval` 의 unjudged 는 **1차나 2차 캐시에 그 행이 아예 없을 때**만 센다. 모델이 rel=unknown 을 냈거나 info=null 인 행(원인 a, 모름)은 not-A 로 채점되고 unjudged 에는 들어가지 않는다. 그래서 "모름 증가"로는 15→66 을 설명할 수 없다. 이번 결과 json 은 모름을 `a_unknown` 으로 따로 센다.

후보는 가능성 높은 순서다.

1. **1차 배치 통째 실패(b 또는 c).**
   - `o.error` 면 그 배치(최대 20건)를 캐시하지 않는다. 66 은 20건 배치 3개와 낱건 6건 같은 계단 모양과 맞는다.
   - 실패 경로는 세 가지다.
     - 로컬 claude `spawnSync` 가 600초에 걸린다. v24 와 few-shot 에 info 블록까지 붙어 프롬프트가 길어졌다. `exit=null` 이 나면 JSON 파싱 오류로 던져진다(b).
     - 응답 JSON 파싱에 실패한다(c).
     - 한도 플래그가 서면 `break firstLoop` 로 **남은 프로젝트 전부**를 시도하지 않는다(b).
2. **2차 Gemini 실패(b 또는 c).**
   - `callGeminiRotating` 이 4바퀴를 다 실패하면 배치를 버리고, 체인이 소진되면(stop) 남은 행 전부를 시도하지 않는다(b).
   - 응답에서 행이 빠졌거나 `validateOpinions` 가 거부한 행도 있다. 예를 들어 product_informative 가 불리언이 아닌 경우다(c).
   - v2·v23 지시문은 promo·weak 같은 새 키를 말한다. 그래서 모델이 `product_informative: "weak"` 처럼 어휘 밖 값을 낼 위험이 커진다. v23 블록은 "2차는 product_informative=false + weak" 로 못박았다.
3. **캐시 TAG 가 바뀌어 처음부터 다시 불렀다.**
   - 기준과 info 가 달라지면 캐시 파일 이름(TAG)이 바뀐다. 실패한 호출은 캐시하지 않는다.
   - 이전 15 는 여러 번 재실행해 캐시가 쌓인 뒤의 수치였을 수 있다. 새 TAG 의 첫 실행은 실패가 그대로 드러난다.
4. **대상 증가.** `--sample` 은 사람 채점 전체에 표본 100행을 더한다. 호출 수가 늘면 한도에 걸릴 확률도 오른다. `--ids` 를 쓰면 100행만 돈다.
5. (d 기타) `GEMINI_API_KEY` 가 없으면 2차 전부가 빠진다. 원문 폐기는 unjudged 가 아니다(`purged_excluded`).

다음 실행부터는 `unjudged_causes.by_cause`·`by_pass`·`detail` 과 `rows[].cause` 로 실제 원인을 행 단위로 볼 수 있다.

## 4. 오케스트레이터 실행 명령 (Git Bash, 리포 루트)

```bash
# 0) 표본이 없으면 한 번만 만든다(있으면 덮지 않고 멈춘다)
node --env-file=.env.local scripts/t2-resample.mjs --new-since 2026-11-18 --seed 20261119

# 1) C세트 원문을 리포 밖에 뽑는다(LLM 호출 없음, 커밋 금지)
node --env-file=.env.local scripts/t2-approval-eval.mjs --ids ops/state/t2-eval/resample-2026-11-19.json --dump-texts "$TEMP/t2-cset.json" --dump-set C --local-claude

# 2) 시험지 오염 검사 — C세트 원문 문장이 v23 프롬프트·테스트에 없는지
T2_CSET_TEXTS="$TEMP/t2-cset.json" node scripts/t2-approval-eval-selftest.mjs

# 3) 같은 ID 로 v1(info-v1 = 지금 운영값) vs v23 비교 — 정답은 DB 사람 채점
node --env-file=.env.local scripts/t2-approval-eval.mjs --ids ops/state/t2-eval/resample-2026-11-19.json --criteria v24 --compare v1,v23 --local-claude --out ops/state/t2-eval/v23-compare
#    정답을 외부 파일로 줄 때(남헌 채점본): 위 명령에 --gold <gold.json> 을 더한다 — [{input_id, verdict, informative(true|false|"weak"|null)}]

# 4) 원문 파일 지우기
rm "$TEMP/t2-cset.json"
```

- 산출물은 `ops/state/t2-eval/v23-compare-v1.json`, `-v23.json`, `v23-compare.json`(비교)과 `reports/<KST>/t2-v23-compare.md` 다. 자식 실행마다 `reports/<KST>/t2-approval-eval.md` 를 덮으니, 비교는 위 파일로 한다.
- 자식이 3(판정 빠짐)으로 끝나도 비교표는 나온다. 빠진 수와 원인은 표에 있다. 다시 돌리면 캐시로 이어간다.
- 켜는 판단 잣대는 계획 §6 그대로다. v23 의 `with_content_guard.precision` 이 93% 이상이어야 한다. 켜기는 리포 변수 `INFO_CRITERIA=v23` 이고 `AUTO_APPROVAL_SINCE` 를 옮겨야 한다. 사람·역할 세션이 판단한다.

## 5. 셀프테스트

- `t2-approval-eval-selftest`: 69 pass / 0 fail. 새로 더한 32건이 확인하는 것:
  - 규칙 a~f 키워드가 v23 블록, v24 1차 프롬프트, v24 2차 프롬프트 세 곳에 다 들어 있다.
  - 정보약은 info=false 와 weak 로 담긴다. v2 블록은 섞이지 않는다.
  - 기본값은 v1 이고 v1 에서는 글자 하나 바뀌지 않는다. 치환이 실패하면 던진다.
  - 예시 줄은 전부 `(가상)` 이고, input_id·URL 이 없고, 예시 id 는 9건 그대로다.
  - 가상 B세트 7건(버그 리포트, 맥락 있는 기능 요청, 스치듯 이름 + 품질 사실, 이름만, 스토어 한 줄 증상, 경쟁사 포지셔닝, 영역 밖 습관 앱)의 파싱·정보약 내림·승인 후보 여부가 기대대로 나온다.
  - 2차 검증의 weak 처리, `[정보약]` 기록 배선, 하네스 부품(원인 분류, gold, ids 파싱, 원인 요약, 모드 비교, 세트 소계)을 확인한다.
- C세트 누설 검사: `T2_CSET_TEXTS` 가 없으면 **확인 불가**로 찍고 통과로 세지 않는다(CI 상태). 검사가 제대로 도는지는 가짜 파일로 확인했다. 누설 문장을 넣으면 1 fail, 깨끗한 문장이면 71 pass 였다.
- 회귀: 관련 셀프테스트 19개가 모두 exit 0 이다. auto-approval 107, relevance-second-judge 79, approval-scope 6, analyze-relevance 136, relevance-judge-all 97 등이다. `t2-resample --selftest` 도 통과했다.
- 전체 빌드와 tsc 는 돌리지 않았다(메모리 제약). CI `build-check` 가 확인한다.

## 6. 확인 못 한 것

- **C세트 원문 대조.** 원문은 DB 에만 있다. 위 1)~2) 를 실행해야 확인된다.
- **모델이 실제로 규칙 a~f 대로 답하는지.** 위 3)이 잰다.
- **규칙 (d) "개발자 도구는 config 확인".** `config/areas.json` 에 개발자 도구 영역이 없다. 그래서 v23 에서 개발자 도구는 활성 영역에 맞을 때만 영역 안이다. 이것은 info-v2 (d)와 남헌 #20(Doppler 채용글 = 관련·정보 있음, 개발자 도구 = 영역 안) 과 방향이 다르다. 남헌 확인이 필요하다.
- **v23 의 out-founder 처리.** out-founder 를 승인 범위에서 계속 빼면 B세트 Doppler(가정상 hackernews·out-founder)는 v23 에서 승인 후보가 아니다(v2 는 후보). 규칙 (c)와 (d) 중 어느 쪽을 우선할지 확인이 필요하다.
- 실제 15→66 실행 로그. 원인은 코드상 후보로만 남긴다.
- `graphify update .` 는 돌리지 않았다(분류기 차단 이력).
