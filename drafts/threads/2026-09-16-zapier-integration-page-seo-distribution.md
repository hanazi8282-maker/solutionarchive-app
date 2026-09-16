# 판정 전문 — Zapier 앱 디렉토리 선제 구축 (2026-09-16)

- 케이스: `zapier-integration-page-seo-distribution` / 무브 인덱스 0 (`case_moves` 8bc1bc9d-64a2-440d-83d8-d9a37ec1d5e3)
- 레버: CHANNEL / 병목: DISTRIBUTION / 등급: **A** (오케스트레이터가 `case_moves`에서 전달. 이 역할은 DB 접근 도구가 없어 독립 재확인은 불가 — §7.1 확인 불가 표기, 단 아래 「등급 축 확인」에서 `lib/cases/draft.ts`를 직접 Read해 손으로 재현) / 방향: positive
- content_code: `CS-20260916-01` (오케스트레이터 고정, 재채번 안 함)

## 적용 규칙

- `ops/roles/_principles.md` — 0(진행 판단 절차), 1(확인 실패≠정상), 4(근거 없는 숫자 금지)
- `.claude/agents/sa-cmo-writer.md` — 무브 1개=초안 1개, transfer_note를 뼈대로, D 등급 숫자 금지(해당 없음 — 아래 확인대로 등급 D 아님)
- `content/guides/voice-guide.md` §0·§2 — 모드 A(3인칭 케이스 서술, 평어체, 4단 골격)
- `.claude/skills/content-gate/references/00-gate.md` Ⅰ~Ⅴ, `pdp-gate.md` G-0~G-13
- `content/guides/learned-patterns.md` — 적용 패턴 검토 (아래 참조)

## 등급 축 확인 — evidence_grade(A) 와 fact_check_grade 는 다른 축이다

지시받은 "등급 A"는 `case_moves.evidence_grade`(독자 인사이트 축, `gradeMove()`)다. CG-1이 보는 것은
`fact_check_grade`(사실확인 축, `factCheckGrade()`)이고, 이 둘은 2026-09-16 재설계로 분리됐다
(`lib/cases/draft.ts` 주석). DB 접근 도구가 없어 실제 컬럼값을 조회할 수 없으므로, 산식을 직접 Read해
이 무브의 근거로 손으로 재현했다.

이 무브(인덱스 0)의 근거는 `drafts/cases/zapier-integration-page-seo-distribution.json`의 evidence 중
`"move": 0`인 두 건뿐이다.

| 근거 | source_tier | is_self_reported | supports_metric | observation_key |
|---|---|---|---|---|
| 퍼스트라운드 팟캐스트(2023-10-05) | primary | true | true | zapier-firstround-wade-foster-podcast-2023 |
| 컨트래리 리서치(2015 그루브HQ 인용) | secondary | true | false | zapier-groovehq-wade-foster-interview-2015 |

`factCheckGrade()` 산식을 대입하면: 법정 공시 없음 → 비자기보고 1차 없음(둘 다 self_reported) →
`supports_metric===true`이면서 `!is_self_reported`인 교차 확인 후보가 0건(두 근거 모두 self_reported) →
자기보고 1차(퍼스트라운드) 1건은 있으나 그것과 다른 원 관측이 없음 → **`fact_check_grade = C`**
("자기보고 1차뿐 — 다른 원 관측 없음"). 그루브HQ 근거는 `supports_metric: false`라 이 무브의 수치를
뒷받침하는 쪽으로 세지 않는다.

`gradeMove()`는 이 `fact_check_grade`가 D가 아니면(C는 D가 아니다) transfer_note·preconditions가
채워진 것만으로 A를 반환한다 — 실제로 이 무브의 transfer_note(43자, 구체적 행동)와 preconditions가
모두 채워져 있어 지시받은 "등급 A"와 정합한다. **두 값이 모순 없이 공존한다.**

**결론: 이 무브는 `fact_check_grade = C`이므로 CG-1(출처 귀속 문구) 대상이다.** 본문에 자기귀속
문구를 넣었다 — 아래 CG-1 판정 참조.

## 상황

포럼에 링크를 하나씩 남기는 수작업 홍보는 검증에는 충분했지만(링크당 방문자 10~20명, 전환율 약 50%)
사람 손이 느는 만큼만 늘어 규모가 나지 않았다. Zapier 창업자 Wade Foster는 검색 결과 품질 저하와
포럼의 반복 연동 요청을 관찰하고, Patrick McKenzie의 Bingo Card Creator 사례에서 유추해 최초 고객이
붙기도 전에 지원 앱마다 랜딩페이지를 두는 앱 디렉토리를 먼저 만들었다. 케이스 무브는 2개(인덱스 0
CHANNEL, 인덱스 1 PARTNERSHIP)이고 이번 초안은 인덱스 0(앱 디렉토리 선제 구축)만 쓴다 — "무브 1개 =
초안 1개" 규칙에 따라 인덱스 1(파트너 상호 홍보)은 별도 초안 대상이다.

## 판정

**통과.** Ⅰ~Ⅲ 전 항목 통과 또는 예외통과(사유 명시). CG-1 통과(자기귀속 문구 포함). 발행 대기로
스테이징 가능.

## 게이트 — Ⅰ. 공통 관문

| 항목 | 판정 | 근거 |
|---|---|---|
| U-1 타깃(C-01) | 통과 | "검증된 수작업 채널이 사람 손 늘리는 만큼만 커진다"는 상황과 "첫 고객 전에 검색이 닿을 자리부터 만든다"는 해법은 SaaS·연동 비즈니스를 몰라도 대입 가능하다. transfer_note가 "자주 같이 쓰이는 도구 5개 + 조합 페이지"로 구체화돼 있어 조건을 곱하지 않았다 |
| U-2 구조(C-12) | 통과 | 해소 구간이 하나로 특정된다 — "첫 고객이 붙기도 전에 지원하는 앱마다 랜딩페이지를 만들었다"는 단일 지점. 무브 인덱스 0만 썼으므로 인덱스 1(파트너 상호 홍보)로 흩어지지 않는다 |
| U-3 관찰(C-08) | **확인 불가** | 상시 습관 점검 항목이라 이 역할(Writer, 개별 초안 단위)이 판단할 근거가 없다. CMO 부서 차원의 주간 점검 대상이며, 이 세션에서 별도로 확인하지 않았다는 사실을 그대로 남긴다 |

Ⅰ에서 탈락 없음 → Ⅱ로 진행.

## 게이트 — Ⅱ. 조건 분기

- **D-1(초반 몇 초)**: Threads = 스크롤 피드 → **프드프 기본값**. 첫 문장("포럼에 링크를 하나씩
  남겨 방문자를 모으는 회사가 있었다")에 병목을 압축했다.
- **D-2(레퍼런스 출처)**: 이 계정은 아직 기본기 확립 단계 → 프드프 스타일(같은 플랫폼 레퍼런스,
  `threads-playbook.md`) 기본. 이번 초안도 케이스 서술이라 TPL-A~E 어느 것과도 정확히 일치하지
  않는다(아래 Ⅲ-b 참조).
- **D-3(현실 연결)**: 1단계(돈) — 채널이 사람 손만큼만 늘어나는 것은 성장 상한 문제. 2단계
  (사후 정당화 아님) — 검색 결과 품질 저하와 반복 연동 요청은 Foster가 앱 디렉토리를 "결정"하기
  전부터 관찰한 현실. 3단계(근원 이득) — 표면은 "앱 디렉토리 페이지 수"지만 근원은 "사람 손을
  늘리지 않고도 검색 유입이 스스로 쌓이는 채널을 만드는 것".
- **D-4(시간 투입)**: 해당 없음 — 텍스트 콘텐츠, 편집·촬영 투입 판단 대상 아님.
- **D-5(라벨)**: 권위 라벨 불필요(3인칭 케이스 서술, 화자 미등장). 계층 라벨도 없음(감정 이입형
  서사가 아니라 사실 서술형).

→ Ⅲ은 **`pdp-gate.md`** 한쪽만 돈다.

## 게이트 — Ⅲ. 매체별 게이트 (pdp/02-gate.md, G-3·G-7은 Ⅰ과 중복이라 생략)

| 항목 | 판정 | 근거 |
|---|---|---|
| G-0 레퍼런스 확인 | 예외통과 | `threads-playbook.md` T-01~T-16을 사전에 Read했으나, 이번 초안은 케이스 서술형이라 TPL-A~E 어느 템플릿과도 정확히 일치하지 않는다. 대신 `voice-guide.md` §2(모드 A 4단 골격: 병목→통상의 선택→실제 무브→독자 질문)를 구조 레퍼런스로 썼다. 이 골격이 voice-guide 위계 2층 문서이므로 playbook 3층 템플릿보다 우선 |
| G-1 목적 확인 | 통과 | `@solution_arch_`는 전환/신뢰 축적 목적. 이 글이 "터뜨리기" 목적이 아니어도 문제 없음(브랜딩 손해 계정 아님) |
| G-2 본능 | 통과 | 돈(매출·성장 상한) 축. 근원 이득까지 내려감 — 표면은 "앱 지원 수 2개→6000개"라는 숫자지만, 근원은 "사람 손 늘리지 않고 채널을 확장하는 구조". 이 아이디어가 나오기 전부터 있던 현실(사후 정당화 아님) |
| G-4 1초 | 통과 | 첫 문장이 추상어가 아니라 구체적 상황("포럼에 링크를 하나씩 남겨 방문자를 모으는 회사가 있었다") + 구체 수치(10~20명, 절반)로 멈추게 함 |
| G-5 가치 입증 | 통과 | 내 입으로 자랑하지 않고 창업자 자기귀속 수치로 우회. 숫자에 실제 근거 있음(evidence 배열 대조 완료, 단 사실확인 C — 위 등급 축 확인 참조) |
| G-6 반박 제거 | 통과 | "왜 사람 손을 더 늘리지 않았나"라는 예상 반문을 2단(통상의 선택)에서 먼저 제시하고, 검색 결과 품질 저하·반복 요청 관찰로 그 반문을 지웠다 |
| G-8 반응도 | 통과 | 저장보다 답글 유도 설계 — 마지막 질문이 독자 자신의 제품-도구 조합 페이지 유무를 되묻게 한다 |
| G-9 하방선 | 면제 | 제작 시간 30분 미만(텍스트 단문)이라 적용 대상 아님(`pdp-gate.md` G-9 적용 조건) |
| G-10 행동 유도 | 예외통과 | 본문 안·고정 댓글에 명시적 CTA(팔로우/문의 유도 문구)는 없음. 케이스 서술형 정보 콘텐츠라 CTA를 강제로 붙이면 어색해지고, `voice-guide.md` 금지목록("좋아요 눌러주세요류 인게이지먼트 베이트")과 충돌. 대신 마지막 질문 자체가 답글 유도 장치 |
| G-11 규격 | 해당없음 | 텍스트 전용, 영상 규격(화면 전환·자막 등) 대상 아님 |
| G-12 진위 | 통과 | 본문의 모든 수치·주장이 `drafts/cases/zapier-integration-page-seo-distribution.json`의 evidence 배열(관측키 `zapier-firstround-wade-foster-podcast-2023`)에서만 나옴. 타인 등장은 창업자 본인·Patrick McKenzie(제3자 사례 인용, 실명 공개 인물, 실제 발생한 공개 사실)뿐이라 사전동의 이슈 없음. 각색 없음 |
| G-13 로그 | 이 문서 자체가 로그 | 예측·지문 아래 기입 |

Ⅲ-b(문체·구조층, `threads-playbook.md`): Ⅲ 통과 후 적용. 위 G-0에서 밝혔듯 TPL 코드는 미적용.
훅 유형은 playbook의 H-카탈로그(자기 브랜드 번역용 30개)가 아니라 voice-guide §2의 병목 제시형을
그대로 썼다.

## CG-1 판정 (사실확인 등급 C)

- **대상**: 이 무브(인덱스 0)는 `fact_check_grade = C`(위 「등급 축 확인」). CG-1 대상이다.
- **본문 조치**: "포스터가 스스로 밝힌 수치로는, 지원 앱 수가 2011년 2개에서 2023년 6000개 이상으로
  늘었다." — `lib/cases/publish-gate.ts`의 `SELF_MARKERS` 중 `/스스로\s*(밝힌|밝혔|공개한|공개했|집계한)/`에
  "스스로 밝힌"이 정확히 매칭된다. 브랜드명은 본문에 "재피어"(한글 표기)로 썼기 때문에, 게이트의
  `findNamedMarker`(영문 "Zapier" 문자열 매칭)에는 걸리지 않는다는 점을 확인했다 — 그래서 이름 귀속이
  아니라 `SELF_MARKERS`의 일반 자기귀속 표현("스스로 밝힌")으로 통과시켰다. `2026-09-15-convertkit`
  건과 같은 경로다.
- **CG-2**: 이 무브는 `fact_check_grade = C`이지 D가 아니므로 CG-2(등급 D 숫자 금지)는 대상이 아니다.

## Ⅳ. 충돌 3건(X-1~X-3)

해당 없음. 감/재능 판단, 알고리즘 최적화 작업, 연출/주작 판단 어느 것도 이 초안에서 발생하지 않았다.
Patrick McKenzie 사례 인용은 공개적으로 잘 알려진 업계 일화(창업자 본인이 여러 매체에서 반복 언급)라
사전동의가 필요한 "타인 등장"으로 보지 않았다.

## 근거 (case JSON evidence 대조)

- `zapier-firstround-wade-foster-podcast-2023` (primary, 자기보고, 2023-10-05 공개): 검색 결과 품질
  저하 관찰, Bingo Card Creator 유추, 지원 앱 수 2개→6000개 이상 수치의 유일한 출처. 창업자 자기보고이며
  다른 원 관측으로 교차 확인되지 않았다 — `fact_check_grade C`의 근거.
- `zapier-groovehq-wade-foster-interview-2015` (secondary, 2015년 인터뷰의 재인용, `supports_metric: false`):
  포럼 링크 성과(방문자 10~20명, 전환율 약 50%) 서술을 뒷받침하지만 이 무브의 수치(지원 앱 수)는
  뒷받침하지 않는다. 원문(groovehq.com)이 현재 열리지 않아 이 재인용으로만 확인했다.
- 등급 C이므로 `sa-cmo-writer.md` 인용 규칙상 CG-1(출처 귀속 문구) 대상이며, 본문에 "스스로 밝힌
  수치로는"이라는 주체 명시 문장을 넣었다(게이트 용어·URL·날짜는 자기답글로 뺐다).

## 지문

> "첫 고객이 붙기도 전에 지원하는 앱마다 랜딩페이지를 만들었다."

이 문장이 가장 뾰족하다. "검색 유입을 늘렸다"는 진단은 흔하지만, "고객이 아직 없는데 그 고객을 위한
페이지부터 만든다"는 순서의 반전이 이 케이스의 핵심이고, 잘라내도 단독으로 성립하는 조각이다
(U-2 "조각" 기준 충족). transfer_note의 "내일 5개 도구 조합 페이지를 만들라"는 행동도 이 한 문장의
구조를 그대로 옮긴 것이다.

## 예측

```yaml
예측:
  - metric: like_rate
    direction: up
    baseline: median_last_10
    threshold: 1.0mad
    horizon: h168
    because: C-01
    rationale: "타깃을 넓힌 병목-반전 구조(수작업 채널 상한 vs 선제 페이지 구축)라 SaaS·연동을 몰라도 반응할 것"
  - metric: reply_rate
    direction: up
    baseline: median_last_10
    threshold: 1.0mad
    horizon: h168
    because: C-12
    rationale: "마지막 질문이 독자 자신의 제품-도구 조합 페이지 유무를 즉시 자가 점검하게 만들어 답글로 되물을 것"
```

발행 누적이 10건 미만이면 위 채점이 자동 `보류`로 나오는 게 정상이다(`prediction-schema.md` §2-3
부트스트랩 단계). 현재 누적 건수는 이 역할에서 확인하지 못했다(DB 접근 도구 없음) — 확인 불가로 남긴다.

## 학습 패턴 적용 여부

`content/guides/learned-patterns.md`의 4개 패턴 중 어느 것도 이 초안에 직접 적용하지 않았다.

- `edit-observation-to-warning`: 개인 관찰을 일반화된 경고로 재구성하는 패턴 — 이 초안은 처음부터
  외부 근거 기반 케이스 서술이라 "개인 관찰"이 아니어서 대상이 아님
- `edit-report-tone-to-spoken`: 리포트체를 구어체 종결(`~된거죠`)로 바꾸는 패턴 — voice-guide 모드 A가
  그 어미들을 명시적으로 금지하므로 적용하지 않음
- `self-admission-contradiction-hook`, `stereotype-reversal-anecdote-reflection-close`: 둘 다 근거 수
  2건짜리 "참고" 등급 저장 글 패턴이며 구조가 이 케이스 서술과 맞지 않음(자기 모순 고백형·제3자 반전
  일화형 — 이번 케이스의 4단 병목 구조와 다름)

`applied_patterns: []`로 stage.json에 기록.
