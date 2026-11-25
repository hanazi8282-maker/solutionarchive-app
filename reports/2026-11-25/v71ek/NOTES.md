# v71ek — DB egress 절감

하네스 기준 커밋 `df540298`(그 뒤 main 은 보고서 커밋뿐). 앱 API 는 402 상태라 실제 API 대조는 아직 안 했다. 전송량은 전부 **압축 전 추정**이다.

커밋: ① 판정 대기열(시간 초과 프로젝트는 예전 방식에 고정) ② 언급·새 출시 입력 ③ 번역·채점 읽기 ④ 고정 해제(이 커밋만 revert 하면 되돌아간다) ⑤ 이 보고 폴더.

## 파일

- `real-api-compare.mjs` · `readonly-guard.mjs` — 머지 전 실제 API 대조(아래 "머지 전 실측")
- `egress-harness.mjs` · `mock-postgrest.mjs` · `dataset.mjs` · `net-stub.mjs` — 원본↔새 코드 대조. `node reports/2026-11-25/v71ek/egress-harness.mjs` (결과 `harness-output.txt`)
- `PROPOSALS.md` — DB 를 바꾸는 제안(미적용)

## 전송량 추정 (MB, 압축 전)

| 작업 | 전 /회 | 후 /회 | 회/일 | 전 /일 | 후 /일 |
|---|---|---|---|---|---|
| A 관련성 판정 | 약 95 | 약 21~56 (대표 25~38) | 4 | 378 | 약 85~225 (대표 130) |
| B 언급·새 출시 입력 | 약 140 | 약 8~30 (대표 15) | 2 | 280 | 약 16~60 (대표 30) |
| C 번역 | 약 125 | 약 26 (상한 39) | 1 | 125 | 약 26 |
| 합 | | | | 783 | 약 130~320 (대표 190) |

### A 가정
- countFor: 원문 id·source_key 23.7만 행(17.8) + 판정 id 약 18만 행(9.5) → 미판정 행만 약 4.2만~5.7만 × 84 B = 3.5~4.8. 행 수 근거: 11-24 로그의 소비재 보류 37,613 + 품질 321 + HN 저가치 3,552~3,590 + 실제 미판정 0~4,010.
- pendingFor: 원문 6.8만 행(37) + 그 프로젝트의 판정 id(3.2). 새 코드는 표본 0 프로젝트에서 미판정 원문만 받는다.
  11-24 17:27Z 실행은 읽은 82개 전부 표본 0(HN 저가치 3,590건) → 2~10. HN 저가치는 200자 미만 또는 2,000자 이상이라 행 크기가 불확실하다. 그 82개에 소비재 보류 행이 많으면 더 커진다(SQL 4).
  11-24 12:04Z 실행은 94개 중 30개가 대상 → 대상 프로젝트 원문은 예전과 같다. 대상이 6.8만 행 중 얼마인지 로그에 없어 2~37(대표 20)로 둔다.
- 영역 수: project_id 18.2만 행(10) → 요청 약 15회(0.05 미만).
- 2차 후보: 6만 행 × 291 B(17.2) → × 248 B(14.7).

### B 가정
- 전: 판정 18.1만 × 131 B + 원문 23.9만 × 약 490 B.
- 후: 받는 원문 = (전환 낱말 ∧ 느슨한 대안 문구) ∪ (전환 낱말 ∧ relevant). 11-24 실측 결과 글 12,507건이라 1.3만~2만 행, 행당 0.6~1.5 KB(전환 낱말이 있는 글은 평균보다 길다고 가정). SQL 5 로 확정된다.

### C 가정
- 전: 18.5만 행 × 689 B(합성 데이터 실측 687 B).
- 후: 2차 판정 있는 행만 × 209 B(합성 실측). 11-24 로그에서 2차 없는 행이 6만 이상이라 12.5만 행 이하로 둔다. 전 행이면 39.
- 덤: `/relevance/grade`·`/relevance/feedback` 은 화면 1회 127 → 약 54 MB(291 B 실측). 일일 합계에는 넣지 않았다.

### 압축
Node `fetch` 는 기본으로 `accept-encoding` 을 보낸다. Supabase 가 압축해 보냈다면 청구 전송량은 위 수치보다 작다. 비율은 비슷할 것이나 확인 안 함.

## 동치 증거
- 셀프테스트: 기준 커밋에서 33/33 스크립트 통과 → 변경 후 36/36 통과(기존 33 + 신규 3). `prefilter-selftest` 단언 1개는 고쳤다(원문 조회의 "두 번째 호출"을 보던 것 → "마지막 원문 호출". 새 경로 시도 호출이 앞에 생겼다).
- `tsc --noEmit` 통과, 바꾼 파일 eslint 통과.
- 하네스 160/160: 함수 대조(설정 8벌), 판정 스크립트 쓰기 실행(LLM mock), 2차 스크립트 쓰기 실행(Gemini 가짜), 입력 추출 JSON 바이트 동일(5벌), 번역 대상 id·순서 동일, pickBatch 60일×3회, 화면 집계, 후퇴 경로.
- 변이 확인: 새 코드에 일부러 넣은 오류 5개를 하네스가 모두 잡았다.

## 동작이 달라질 수 있는 곳 (머지 전 확인)
1. **프로젝트 `55d574a2-…` 의 statement timeout.** 11-24 로그 두 번 모두 이 프로젝트의 원문 수 조회가 시간 초과로 빠졌다. 커밋 ④부터 새 질의로 읽는다.
   **판정 대상은 늘지 않는다**(처음 보고의 "늘어난다"는 틀렸다). 2026-11-26 읽기 SQL: 영역 `out-consumer`, 미판정 14,268 = 품질 표시 5,055 + 소비재 태그 4,203 + 영역 파생 소비재 5,010. 허용 목록(`config/consumer-allow-ids.txt`)은 0건이다.
   바뀌는 것은 "확인 불가"가 "대상 0"이 되고, 로그의 품질·소비재 보류 건수가 늘어나는 것이다. 판정하려면 소비재 제외(남헌 v61)를 바꿔야 한다 — 이 PR 은 바꾸지 않는다.
2. 나눠 읽기는 두 번에 걸쳐 읽는다. 그 사이 판정된 행은 판정된 것으로 친다. 판정 저장은 그대로 insert-only 다.
3. 로그 문구: 번역 "판정 N행" → "2차 판정 있는 행 N", 입력 추출 로그에 `fetched` 추가, 후퇴 안내 줄 추가.
4. 원문 0건 프로젝트에 `pendingFor` 를 직접 부르면 반환에 0 짜리 칸이 더 있다(`rating` 이 null 아님). 스크립트는 미판정 > 0 일 때만 부르고, 어느 쪽이든 대상이 아니다.

## 가정 — 실 API 에서 확인해야 한다 (하네스는 이것을 증명하지 않는다)
- P1 `v:review_relevance_verdicts!left(input_id)` 가 1:1 임베드로 풀린다(SQL 2).
- P2 `v.project_id=eq.X` · `v.or=(…)` 가 임베드 행을 거른다.
- P3 `v=is.null` 이 그 필터를 적용한 뒤의 anti-join 이다(문서 v12 에 anti-join·별칭 필터가 있다. 같은 임베드 anti-join 이 이미 `consumer_material_tags` 로 쓰인다).
- P4 `imatch` = Postgres `~*`, `*` 치환 없음(PostgREST main 소스에서 like/ilike 만 치환. 배포 버전은 확인 안 함).
- P5 `count=exact` + `limit=1` 이 전체 수를 준다.
- P6 최대 응답 행 1,000(예전 코드와 같은 가정).
- P7 Postgres `~*` 결과가 JS `/i` 의 상위집합이다. 근거는 문법 분석(글자·`( | ) ?`·`\w+` 는 같은 뜻, `\s*` 는 더 넓은 `[^a-z0-9가-힣]{0,}` 로 바꿈)과 JS 해석 퍼징뿐이다. **실제 Postgres 로는 돌리지 못했다**(로컬 엔진 설치가 권한 거부됨). SQL 3·8.
- P8 새 질의가 8초 제한 안에 끝난다. 넘으면 자동 후퇴하지만 그 실행은 **전보다 더** 받는다.

### 머지 전 실측(앱 API 가 풀린 뒤, 읽기만)
```bash
node --env-file=<.env.local> reports/2026-11-25/v71ek/real-api-compare.mjs
```
통과 기준(스크립트 끝 코드 0 = 전부 통과, 1 = 불합격, 2 = 확인 불가):
1. 원본·절감·고정 해제 세 벌이 1차 `--dry` · 2차 `--dry` · 번역 `--dry` 를 끝까지 돌고, GET·HEAD 밖 요청이 없다.
2. 원본=절감: 1차·2차 로그가 같고 번역 대상 id·순서가 같다.
3. 절감→고정 해제: `55d574a2` 줄, 품질·소비재 보류 건수 줄, "미판정 전체" 줄 밖에는 차이가 없다. 번역 대상은 같다.
4. 새 코드 로그에 "나눠 읽기 불가" · "판정 수 서버 세기 불가" · "전부 받는 예전 방식" 이 없다.
5. 언급·새 출시 입력 출력 파일이 원본과 바이트까지 같다.

크론(19:03·02:03·06:03 UTC) 실행 중에는 돌리지 않는다. 판정이 중간에 늘어 차이가 나면 한 번 다시 돌린다. 원본 쪽 전송이 약 400MB 든다.
임시 폴더의 출력에는 원문이 있다 — 확인 뒤 지우고 커밋하지 않는다. 모의 DB 에서 22개 항목 전부 통과(2026-11-26, 실 API 증거 아님).
머지 뒤 첫 운영 실행 로그에도 4번 문구가 없어야 절감이 실제로 난 것이다.

## 확인 SQL (SELECT 만)

```sql
-- 1. 판정 행 project_id 가 원문과 다른 행(0 이 아니어도 새 코드는 예전 정의를 따른다 — P2·P3 가 맞다면)
SELECT count(*) FROM public.review_relevance_verdicts v
  JOIN public.analysis_inputs i ON i.id = v.input_id WHERE v.project_id <> i.project_id;

-- 2. input_id 가 PK 이자 analysis_inputs FK 하나
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.review_relevance_verdicts'::regclass AND contype IN ('p','f');

-- 3. 대소문자·특수 공백(전부 true 여야 한다)
SELECT current_setting('server_version') AS v,
       (SELECT datctype FROM pg_database WHERE datname = current_database()) AS ctype,
       'MIGRATION TRANSITION' ~* 'migrat' AS ascii_i,
       ('대신' || chr(160) || '쓸' || chr(12288) || '만한') ~* '대신[^a-z0-9가-힣]{0,}쓸[^a-z0-9가-힣]{0,}만한' AS nbsp,
       ('다른 앱' || chr(10) || '추천') ~* '다른[^a-z0-9가-힣]{0,}(앱|어플)[^a-z0-9가-힣]{0,}(추천|찾)' AS newline,
       'a cheap_one alternative' ~* 'looking|a (\w+ )?alternative' AS word;

-- 4. 프로젝트별 미판정 행·바이트
SELECT i.project_id, count(*) FILTER (WHERE v.input_id IS NULL) AS unjudged, count(*) AS total,
       sum(octet_length(i.raw_text)) FILTER (WHERE v.input_id IS NULL) AS unjudged_bytes, sum(octet_length(i.raw_text)) AS all_bytes
  FROM public.analysis_inputs i
  LEFT JOIN public.review_relevance_verdicts v ON v.input_id = i.id AND v.project_id = i.project_id
 WHERE i.purged_at IS NULL GROUP BY 1 ORDER BY 2 DESC;

-- 5. B 가 받게 될 행·바이트  (:sw = scripts/mention-input-fetch.mjs 의 SW 원문, :alt = 하네스가 출력한 "서버 ALT")
SELECT count(*), sum(octet_length(i.raw_text))
  FROM public.analysis_inputs i LEFT JOIN public.review_relevance_verdicts v ON v.input_id = i.id
 WHERE i.purged_at IS NULL AND i.raw_text ~* :'sw'
   AND (coalesce(v.human_verdict, v.verdict) = 'relevant' OR i.raw_text ~* :'alt');

-- 6. C 행 수
SELECT count(*) FILTER (WHERE second_verdict IS NOT NULL) AS with_second, count(*) AS total FROM public.review_relevance_verdicts;

-- 7. 시간 초과 프로젝트
SELECT count(*) AS inputs, count(*) FILTER (WHERE v.input_id IS NULL) AS unjudged
  FROM public.analysis_inputs i
  LEFT JOIN public.review_relevance_verdicts v ON v.input_id = i.id AND v.project_id = i.project_id
 WHERE i.purged_at IS NULL AND i.project_id = '55d574a2-60a2-444b-88b7-8a625b857175';

-- 8. B 상위집합 실측: 원본 스크립트 출력의 posts id 를 임시 목록으로 넣어 5번 조건에 전부 드는지 본다(또는 위 "머지 전 실측" cmp).
```

## 하지 않은 것 (동작이 바뀌거나 범위 밖)
- **대상 프로젝트의 판정된 원문 다시 읽기**: 사전필터의 "프로젝트 전체 요약"과 중복 검출이 판정된 원문까지 본다. 안 받으면 `agent_run_steps.detail.prefilter` 가 달라진다(enforce 모드면 대상도 달라진다). 최대 약 35 MB/회가 여기 남는다.
- **실행 사이 원문 디스크 캐시**: 러너가 매번 새로 뜬다. Actions 캐시는 공개 리포라 원문이 포크 PR 에 읽힐 수 있다.
- **언급 루프 ↔ 새 출시 입력 파일 공유**: 아티팩트는 공개라 원문을 올릴 수 없다. 한 job 으로 합치는 것은 워크플로·시점 변경이다. 합치면 B 가 절반이 된다.
- **2차 후보를 영역 안/밖 두 질의로 나누기**(영역 밖 4.1만 행은 3칸이면 된다, 약 6~7 MB/회): 대상 판정 함수를 두 벌로 만들어야 해서 뺐다.
- 수집 워크플로는 바꾸지 않았다. 새 셀프테스트 3개는 `build-check.yml` 에 한 줄씩 넣었다.
