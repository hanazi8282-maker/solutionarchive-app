# 옛 인용 입력 대조 백필 — 실행 절차서 (§10.2 대량 UPDATE 4조건)

- 근거: 남헌 v23 4·5-c(2026-10-06) — 옛 인용(source_key 없음)은 입력 대조 백필로 살리고, 폐기 원문 유래 인용은 요약으로 대체한다.
- 설계: `reports/2026-10-06/design-report-v22.md` §3-4
- 도구: `scripts/quote-backfill.mjs`(CLI) · `lib/analysis/quote-backfill.ts`(규칙) · `scripts/quote-backfill-selftest.mjs`(CI 등록)
- 실행 주체: 오케스트레이터(역할·대화형 세션). 서비스키가 필요하므로 서브에이전트·무인 루프는 돌리지 않는다(§10.1).
- **마이그레이션 없음.** 바꾸는 것은 `evidence_quotes` jsonb 항목 안의 키뿐이다(컬럼 추가·타입 변경 0).

## 0. 무엇을 바꾸나

저장 위치: `analysis_aspects.evidence_quotes` (jsonb NOT NULL DEFAULT `'[]'`, 마이그 `20260923000001`).
항목 모양: `{ text, source_type, source_key? }` — 쓰는 곳은 `lib/analysis/extract-run.ts` 의 `normalizeEvidenceQuotes`
(`lib/analysis/evidence-quotes.ts`) 하나다. `source_key` 는 2026-10-05 부터 붙는다. 그 전 항목이 이번 대상(옛 인용)이다.
`evidence_quotes_ko`(번역)는 같은 인덱스로 짝지어져 있어서 배열 길이·순서는 건드리지 않는다.

옛 항목마다 같은 프로젝트의 `analysis_inputs` 전부(폐기 행 포함, `created_at` 순)와 대조한 뒤 키 3개를 **더한다**.
`text`·`source_type` 은 덮어쓰지 않는다.

| verified | 판정 | source_key |
|---|---|---|
| `full` | 보존 원문 중 하나에 `isVerbatimExcerpt`(#418 고객 화면 규칙: 공백 정규화, '…' 조각 순서 대조)가 통과한다 | 찾은 입력의 키(입력에 키가 없으면 안 붙임) |
| `prefix` | 전문은 안 맞고 앞 20자만 맞는다(저장 때 `normalizeEvidenceQuotes` 와 같은 기준) | 같은 규칙 |
| `purged` | 보존 원문 어디에도 없고, 그 프로젝트에 원문 폐기 입력(`raw_text IS NULL`)이 있다 | 없음 |
| `none` | 보존 원문 어디에도 없고, 폐기 입력도 없다 | 없음 |

더하는 세 번째 키는 `backfill: 'qb-v1'` 이다(되돌리기 표식).
`none`·`purged` 는 지우지 않는다. 후속 요약 대체 PR(PR-Q4)이 이 표시를 읽고 요약으로 바꾼다.
고객 화면(`publicQuotes`)은 지금처럼 `source_key` 없는 항목을 빼므로 `none`·`purged` 는 이 백필 뒤에도 안 나간다.
고객 화면이 전문 대조를 다시 하기 때문에 `prefix` 도 원문이 남아 있는 동안에는 걸러진다.

`purged` 는 추정이라는 점에 유의한다. 원문이 없으니 "거기서 나왔다"를 증명할 수 없고, "보존 원문엔 없고 폐기 원문은 있다"까지만 말할 수 있다.
그래서 `none` 과 이름을 갈랐을 뿐, 둘 다 출처 미확인으로 취급한다.

## 1. 드라이런 (조건 1)

```
node --env-file=.env.local scripts/quote-backfill.mjs            # --measure (읽기 전용)
node --env-file=.env.local scripts/quote-backfill.mjs --apply    # 드라이런: 위 출력 + 바뀔 행 3건 before/after
```

출력 형식(한 줄 요약 + JSON 한 줄):

```
[시각] quote-backfill legacy=<옛 항목>/<전체 항목> full=<n> prefix=<n> none=<n> purged=<n> matched_no_key=<n> with_key=<n> already=<n> malformed=<n> aspects_to_update=<n>/<전체 속성> projects=<n>
{"aspects":…,"quotes":…,"with_key":…,"malformed":…,"legacy":…,"full":…,"prefix":…,"none":…,"purged":…,"matched_no_key":…,"already":…,"aspects_to_update":…,"projects":…,"by_source":{"danawa":…,"(purged)":…,"(none)":…,"(matched:no-key)":…}}
```

- `legacy = full + prefix + none + purged`. `already` = 이미 백필된 항목(재실행하면 건너뛴다). `matched_no_key` = 맞았는데 입력에 `source_key` 가 없어서 키를 못 단 수.
- `by_source` = 옛 항목이 붙을 소스(키)별 분포. 괄호로 싼 버킷은 키를 못 다는 몫이다.
- 교차 확인 SQL(SQL Editor, 읽기 전용) — `legacy + already` 가 스크립트 값과 같아야 한다:
  ```sql
  select count(*) filter (where q->>'source_key' is null) as no_key, count(*) as total
    from analysis_aspects a, jsonb_array_elements(a.evidence_quotes) q;
  ```
  (`no_key` 에는 백필 뒤 `none`/`purged`/`matched_no_key` 몫도 들어가므로, 적용 뒤에는 `none+purged+matched_no_key` 와 같아야 한다.)

적용 판단 기준: 분포를 보고 `none` 비율이 높으면(예: 옛 항목의 30% 초과) 멈추고 원인부터 본다. 대조 대상 입력이 예상과 다르다는 뜻일 수 있다.

## 2. 적용

```
node --env-file=.env.local scripts/quote-backfill.mjs --apply --run [--batch 200] [--pause 500]
```

- UPDATE 하기 전에 그 행의 원값을 `.tmp-quote-backfill-apply-<시각>.jsonl` 에 `{id, before}` 한 줄로 남긴다. `.tmp-*` 는 `.gitignore` 대상이라 커밋되지 않는다(리뷰 원문 조각이고 이 리포는 공개다). 실행이 끝나면 리포 밖으로 옮겨 보관한다.
- 끝 줄: `apply 끝 — updated=<n> gone=<n> / <n>`. `gone` 은 계획과 쓰기 사이에 재추출로 지워진 행이다. 새 행에는 이미 `source_key` 가 있으니 손실이 아니다.
- 적용 뒤 `--measure` 를 다시 돌린다. 기대값: `legacy=0`, `already` = 직전 `legacy`.

## 3. 롤백 (조건 2)

1차 — 표식 제거(스크립트):
```
node --env-file=.env.local scripts/quote-backfill.mjs --rollback          # 드라이런: 대상 속성 수
node --env-file=.env.local scripts/quote-backfill.mjs --rollback --run    # backfill='qb-v1' 항목에서 source_key·verified·backfill 을 뗀다
```
- 백필은 키를 더하기만 했으므로 세 키를 떼면 원값과 같아진다(셀프테스트가 `rollback(apply(x)) = x` 를 행 단위로 확인한다).
- 그 사이 후속 PR 이 붙인 다른 키(예: `summary`)는 남긴다. 스냅샷을 통째로 되돌리면 그 작업까지 지워지는데, 이 방식은 그러지 않는다.
- 롤백도 UPDATE 전 원값을 `.tmp-quote-backfill-rollback-<시각>.jsonl` 에 남긴다.

2차 — 백업 파일(1차가 불가능할 때만): `.tmp-quote-backfill-apply-*.jsonl` 의 `before` 를 행마다 `update analysis_aspects set evidence_quotes = <before> where id = <id>` 로 되돌린다. 백필 뒤 생긴 변경까지 지워지므로 1차를 먼저 쓴다.

한계: 원래부터 `source_key: null` 이 명시돼 있던 항목은 롤백하면 키 자체가 빠진다. `normalizeEvidenceQuotes` 는 null 을 쓰지 않으므로(키를 아예 생략) 실제로는 생기지 않는다. `publicQuotes` 기준으로는 둘 다 결과가 같다.

## 4. 무중단 (조건 3)

- 행 하나에 UPDATE 하나를 쓴다(PostgREST 요청 1개 = 트랜잭션 1개). 잠금은 그 행 하나만, 아주 짧게 잡힌다. 테이블 잠금·DDL 은 없다.
- `--batch` 행마다(기본 200) 진행 로그를 찍고 `--pause` ms(기본 500) 쉰다.
- 중간에 오류가 나면 그 자리에서 멈춘다(exit 3). 이미 쓴 행에는 표식이 있으므로 그대로 두고 재실행해도 된다(멱등, 표식 있는 항목은 건너뜀). 되돌리려면 `--rollback --run`.
- `evidence_quotes` 를 쓰는 다른 코드는 추출(`extract-run.ts`, delete→insert) 하나뿐이다. 겹쳐도 지워진 행은 `gone` 으로 넘어간다. 그래도 겹치지 않게 `nightly-extract` 슬롯(KST 03:33·12:33·18:33, Actions 지연 1~3시간 포함)은 피해서 돌린다.
- 읽는 쪽도 영향이 없다. 결과·검수 화면, 요약 복사, 인사이트 근거, 번역, aspect-review-eval 은 `text`·`source_type` 만 읽는다(2026-10-06 grep). `publicQuotes` 는 `source_key` 가 생긴 `full`·`prefix` 항목만 새로 후보로 보고, 전문 대조를 다시 한다.

## 5. Notion 기록 (조건 4)

일일 상태 로그 행(트랙 = 실행 세션 트랙)의 "한일"에 아래 문구를 붙인다(숫자는 실제 출력으로 채운다):

```
옛 인용 입력 대조 백필(qb-v1, scripts/quote-backfill.mjs) 적용 — 드라이런 legacy=<n>/<total> full=<n> prefix=<n> none=<n> purged=<n> matched_no_key=<n>,
적용 updated=<n> gone=<n>, 재측정 legacy=0. 원문 텍스트 불변·키 추가만, 롤백은 --rollback --run(표식 제거) + 백업 .tmp-quote-backfill-apply-<시각>.jsonl(리포 밖 보관).
§10.2 판단: 예외 2번(대량 UPDATE)이지만 4조건(드라이런·롤백·무중단·기록)을 충족해 자율 적용. none·purged 는 요약 대체(PR-Q4) 입력.
```

비고: PR 번호(feat/quote-backfill), 실행 세션 이름.
