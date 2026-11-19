# story flow B안 구현 — 진단 칸 채우기 · 주제 신호 · 나란히 비교 하니스 (2026-11-20)

상태: **구현·셀프테스트 완료, 실DB 비교는 오케스트레이터 몫.** 깃발 `STORY_FLOW_ENABLED` 는 그대로 OFF. 점수식 상수(0.35/0.30/0.15/0.15/0.05)는 바꾸지 않았다.
마이그레이션 없음. DB 접근 없음(서브에이전트). `compose.ts` 는 건드리지 않았다 — 결론서 경로의 기본 동작은 한 글자도 안 바뀐다.

배경: 3차 검수(`reports/2026-11-19-v71cu/story-flow-rereview3.md`) — 새 경로는 사업 설명을 안 보고, 실진단 경로는 단계만 채워 영역⑤ 추천 3건이 0.745 동점 → slug 알파벳 순. 남헌 결정 B안: 상수는 두고 신호를 채운다.

## 바꾼 것

| 파일 | 무엇 | 성격 |
|---|---|---|
| `lib/consult/story-flow-topic.ts` (새) | B1 `enrichDiagnosis` · B2 `topicProfile`/`topicMatch`/`TOPIC_LEXICON` · `priceBandFromText` | 순수 함수, 모델·DB 없음 |
| `lib/consult/story-flow-select.ts` | `SelectOpts.topic`(기본 OFF) · `situationWithTopic` · `scoreCard(…, opts)` · `STORY_FLOW_B_OPTS` · 동점 기준에 주제 점수(옵션 ON 일 때만 존재) · `ScoredPick.topic?` | 추가. 옵션 OFF 면 점수·순서 동일(셀프테스트 고정) |
| `lib/consult/cases.ts` | `retrieveSimilar(i, deps?)` — `llmJson`·`sb` 주입 선택 인자 | 추가. 인자 없으면 기존 `consultLlmJson`·`db()` 그대로 |
| `scripts/story-flow-compare.mjs` (새) | B4 비교 하니스(`--dry`/`--real`, `--db`) + B5 인용 검증 | 읽기 전용 |
| `scripts/story-flow-topic-selftest.mjs` (새) | B1~B5 회귀 | consult-selftest 에 한 줄로 배선(CI build-check) |
| `fixtures/story-flow/topic-cards.json` (새) | 합성 카드 5장(3차 검수 영역⑤ 동점 모양 재현) + 합성 회사 2곳 | 실제 회사·인용 아님 |
| `reports/2026-11-20-story-flow/compare-dry.{md,json}` | 오프라인 드라이런 결과(합성) | 산출 |

## B1 진단 칸 채우기 — `enrichDiagnosis(base, { oneLiner, url, category, detail, segment })`

기존 칸(예: `diagnosisFromReport` 의 stage)은 덮지 않는다. 단서가 없으면 칸을 비운다(= 모름 0.5, 지어내지 않음). 칸마다 근거를 `enrich_basis` 에 남긴다.

- customer: `discover.inferStructure` 재사용(buyer_type smb_owner→smb, enterprise, dev, consumer). team_lead 는 smb/enterprise 를 몰라 비움. 크리에이터 낱말 → creator.
- pricing_model: 같은 함수의 과금(구독·사용량·일회). freemium 은 카드 어휘에 없어 비움.
- price_band: 글 속 **월** 값(`$29/mo`·`월 $19`·`월 9,900원`·`월 5만원`, 원은 고정 환율 1,350)만. 없으면 세그먼트 M·E → `250+`, P·S 는 값대 여러 칸에 걸쳐 비움(F6 조사 결론 그대로).
- team_size: "1인 창업·solo founder·indie hacker" 명시만 solo.
- mechanism: **채우지 않는다.** 카드 원리 어휘(자유 snake_case 1,600종+)와 정확 일치(mechanismScore)를 만들 근거가 없다. 원리는 아래 주제 신호의 개념으로만 들어간다. 0.15×0.5 상수는 그대로 남는다.
- topic: 사업 설명 + URL 호스트 낱말 + 카테고리 + 진단 글 → 개념·낱말.

## B2 주제 신호 — 선택: **(b) 상황 일치 항 안에 주제 칸 편입**, 옵션 이름 `topic`

`topicMatch(card, profile)` = 진단 개념 중 카드에 있는 비율 0.7 + 낱말 겹침 0.3 (개념이 없으면 낱말만). 카드 쪽 글 = `domain` + 그 장 에피소드의 `sub_topic`·`mechanism`·`mechanism_norm`·`adversity_ko`·`action_ko`. 신호가 없으면 0.5.
- 한·영 혼합: 손으로 만든 개념 사전 21개(`TOPIC_LEXICON`, 개념마다 한국어·영어 낱말)가 다리다 — 진단 글은 한국어, 카드의 domain·sub_topic·mechanism 은 영어. 한국어 2글자는 `discover.hasWord`(조사 규칙), 영어 짧은 낱말은 낱말 경계(`seo≠seoul`, `review≠preview`, `search≠research`, `api≠capital`, `ads≠uploads`). 한국어 낱말 겹침은 조사 붙은 꼴(리뷰를↔리뷰)을 같은 낱말로 본다. 형태소 분석기 없음.
- `opts.topic` 이 참이고 진단에 신호가 있으면 상황 일치 = (기존 5칸 합 + 주제) / 6. 가중치 0.30 은 그대로. 점수 동점이면 주제 점수가 첫 기준(옵션 OFF 면 칸이 없어 기존 순서).

**(a) 하이브리드를 고르지 않은 이유**
1. 후보 우주가 다르다. 기존 경로 후보는 `case_bank`(`case_retrieve`) 회사 이름이고, story flow 카드는 `ss_story_labels` slug 다. 이미 2-4 구현 보고(`story-flow-impl.md` 미확인 절)에 "두 원천의 slug 체계가 달라 같은 회사가 한 번씩 나올 수 있다"고 적혀 있다 — 이름으로 맞추면 교집합이 비거나 틀린 짝이 생긴다.
2. 결정성이 없다. 기존 경로는 LLM 질의·LLM 심사 두 번을 거치고, 판정 실패면 빈 목록이다(`cases.ts` 두 `catch`). 그 위에서 재정렬하면 story flow 의 장점(결정적 결과·실패 표시·인용 검증)이 LLM 실패에 묶인다.
3. 비용·지연. 결론서마다 LLM 2회가 story flow 경로에도 붙는다. (b)는 0회.

**(b)의 한계(측정값, 합성 픽스처)**: 주제 칸 하나는 상황 6칸 중 1칸이라 총점에 최대 ±0.05만 움직인다. 영역⑤ 재현 픽스처에서 주제만 켜면(칸 채우기 없이) 주제가 맞는 카드가 여전히 3건 밖이다(증거 B 차이 0.06 을 못 넘음). 칸 채우기만 켜면 주제 맞는 카드가 동점 1위로 올라온다. **둘 다 켜야** 1위가 점수로 정해진다(0.5678 vs 0.5532). 그래서 권장 설정은 칸 채우기 + 주제 + 단계 우선을 한 묶음으로 쓴다.

## B3 권장 설정 — `STORY_FLOW_B_OPTS = { stageFirst: true, topic: true }` + `enrichDiagnosis`

실진단 경로(`diagnosisFromReport` — 장·단계만)에 칸 채우기를 얹어 오프라인 픽스처로 시험했다(`story-flow-topic-selftest.mjs`).
- 영역⑤(리뷰 관리 SaaS, 검색 노출 없음, zero_rev): 기존 동작 = 세 건 동점 → `attributer · giveaway · agency`(알파벳, 3차 검수 실샘플 재현). B = `reviewpages(리뷰를 검색 페이지로) · attributer(게스트 포스트로 검색 유입) · agency(⚠ 실패 표시)`. 소비재 기브어웨이·미용 예약금은 빠진다. 이유 문장도 "같은 장에서 비슷한 막힘" 대신 "손님·값대…가 같다"가 된다.
- 영역②(영업 도우미, 체험 뒤 유료 전환 안 됨, early_rev): B 추천 = 단계·손님·과금이 같은 `fx-sales-a`.
- 옵션 OFF 불변: 기존 픽스처 카드 전부에서 `scoreCard` 가 옵션 없이·`topic:false`·진단에 topic 이 있어도 같은 값, 신호 없는 topic ON 도 기존 5칸 그대로.

## B4 나란히 비교 하니스 — `scripts/story-flow-compare.mjs`

- 회사 고르기(쿼리 + `pickCompanies` 순수 함수): `analysis_projects` 에서 `id, competitor_url, product_elevator_pitch, area_code, bottleneck` 을 `area_code ∈ {1,2,3,4,5,design}` ∧ 사업 설명 NOT NULL 로 읽고(id 순, 최대 5,000), 설명 20자 이상·중복 설명 제외, **영역②·⑤ 각 3곳 먼저**, 나머지 영역을 돌아가며 K(기본 12)까지. K·②⑤ 미달이면 "확인 실패"로 기록하고 종료 1.
- 진단: 장 = `bottleneck`(AWARENESS·DISTRIBUTION→5, TRUST·CONVERSION·UNIT_ECONOMICS→6, RETENTION→7), 없으면 5장 기본(`chapter_basis` 에 남김). 단계는 이 표에 매출 칸이 없어 모름. 그 위에 `enrichDiagnosis(사업 설명·URL·영역 이름)`.
- 같은 실행에서: (1) 기존 `retrieveSimilar`(카테고리 자리에 영역 이름, 질의·심사 Haiku) (2) 새 경로 B. 참고로 현재 기본 동작(옵션 없음)도 덤프.
- 채점: Sonnet 이 X/Y 두 목록을 1~5점(주제 적합성만). X/Y 에 어느 경로가 갈지는 시드 난수(`--seed`, 기본 20261120)로 회사마다 무작위, 순서는 JSON `blind` 에 남는다. 1~5 정수가 아니면 채점 실패(평균·승패에서 제외, 문제 목록에 기록). 두 목록이 다 비면 둘 다 1(규칙).
- LLM 은 전부 구독 경로 `lib/story-label/cli.mjs` `runCli`(ANTHROPIC_API_KEY 를 뺀 env, 도구 없이 1턴). 한도 오류(`StopRun`)면 그 자리에서 멈추고 그때까지를 쓴다.
- 출력: `reports/2026-11-20-story-flow/compare-<dry|real>.json`·`.md` — 회사별 점수, 평균, B 기준 승/무/패, B 실패 표시 건수, B 인용 검증.

## B5 인용 검증

하니스가 B 선택마다 `collectQuotes → quoteSlugs` 로 원본 표 `ss_episode_tags` 를 다시 읽어(`--db`) `verifyQuotes` strict 로 대조한다(기존 `story-flow-quote-check.mjs` 와 같은 공용 함수). 불일치·원문 못 읽음은 확인 실패로 센다. 셀프테스트: B 선택 인용 3/3 일치, 한 낱말 바꾸면 실패.

## 오케스트레이터가 실행할 명령 (메인 리포에서, 이 브랜치 체크아웃 뒤 — `.env.local` 필요, 전부 읽기 전용)

```
node --env-file=.env.local scripts/story-flow-compare.mjs --dry --db
node --env-file=.env.local scripts/story-flow-compare.mjs --real --db --k 12 --seed 20261120
```
- 첫 줄: LLM 없이 실DB 선택 결과만(회사 고르기·칸 채우기·B 3건·인용 검증 확인). 두 번째 줄: 기존 경로 + 블라인드 채점(구독 한도 사용: 회사당 Haiku 2회 + Sonnet 1회, 12곳이면 36회).
- `compare-real.json` 에는 사업 설명 원문·내부 slug(UUID 포함)가 들어간다. 공개 리포이므로 커밋 전에 확인하고, 기본은 `.md` 만 커밋을 권한다.
- 인용만 따로: `node --env-file=.env.local scripts/story-flow-quote-check.mjs --payload reports/2026-11-20-story-flow/compare-real.json --db`(B 선택의 인용을 모두 훑는다).

## 테스트

- `node scripts/consult-selftest.mjs` → **통과 227건**(226 + 새 묶음 1)
- `story-flow-selftest` · `story-flow-select-selftest` · `story-flow-topic-selftest` 전부 통과
- `untrusted-input-selftest` 77/77 (하니스 채점 프롬프트에 표준 경고 포함)
- tsc(`--strict --skipLibCheck`, 바뀐 TS 4파일 + compose.ts) 오류 0 · eslint(바뀐 파일) 0
- 오프라인 `--dry`(합성): 2곳 모두 B ok 3건, 인용 ok

## 한계 · 미확인

- **실데이터 효과는 미확인.** 합성 픽스처는 3차 검수 실샘플의 모양을 흉내 낸 것뿐이다. 실제로 동점이 얼마나 풀리는지, 기존 경로보다 주제 적합성이 나은지는 `--real` 결과가 정한다.
- 개념 사전은 21개다. 사전 밖 주제(예: 법률·의료)는 낱말 겹침만 남고, 카드 요약은 한국어·카드 원리는 영어라 사전이 없으면 다리가 약하다. 부족하면 임베딩 유사도로 바꾼다(`ponytail:` 주석).
- 주제 칸의 영향은 최대 ±0.05(상수 불변의 대가). 칸 채우기 없이 주제만 켜면 거의 효과가 없다.
- 하니스의 진단은 실제 결론서 진단이 아니다 — `analysis_projects` 에는 Fit 단계·매출 칸이 없어 장은 bottleneck(대부분 NULL 일 수 있음 → 5장 기본), 단계는 모름. 기존 경로도 `ch1.position.category` 대신 영역 이름을 받는다. 두 경로에 같은 조건이라 비교는 공정하지만, 결론서 실경로 그대로는 아니다.
- `analysis_projects` 는 경쟁사 분석용 표라 사업 설명이 "우리 회사"가 아니라 "경쟁사 제품"이다. 주제 적합성 비교에는 쓸 수 있다.
- `compose.ts` 에 B 를 배선하지 않았다(깃발 OFF·기본 동작 불변 지시). 켜기로 하면 `diagnosisFromReport(...)` 결과를 `enrichDiagnosis(d, { oneLiner: run.one_liner, url: run.company_url, category: ch1.position.category, detail: ch1.leak_or_gap?.detail, segment: ch1.viability?.segment })` 로 감싸고 `selectStoryFlow(d, dbLoaders(sb), STORY_FLOW_B_OPTS)` 로 부르는 두 줄이다. 그때 `story-flow-topic-selftest` 의 "compose 는 B 옵션을 켜지 않는다" 검사를 같이 고친다.
- stageFirst 의 기존 한계(1·2순위만 봄, 실패 카드를 추천 자리로 올릴 수 있음 — 표시는 붙음)는 그대로다.
