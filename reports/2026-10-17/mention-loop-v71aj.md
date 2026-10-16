# 언급 루프 발전 5안 + HN 글 단위 영역 재판정 (v71aj §6 D-36 · §5-3 D-37/45)

- 작성: CTO 서브에이전트. **DB 를 한 번도 안 봤다**(지시: DB 접근 금지). 수량은 전부 지시서·이전 보고의 숫자에서 낸 [추정]이다.
- 앞 문서: `reports/2026-10-17/mention-loop-design.md`(D-36 1차). 이 문서는 그 위에 얹은 것만 적는다.
- 코드 PR(머지 가능): `lib/discovery/mention-loop.ts` · `scripts/mention-loop.mjs` · `lib/analysis/area-reclass.ts` · `scripts/hn-area-reclass.mjs` ·
  `scripts/appstore-same-developer.mjs` · 셀프테스트 2개 · CI 한 줄. **무인 루프·워크플로 배선 없음.**
- 마이그 PR(미적용·머지 금지): `20261017000090_review_area_verdicts.sql` + 롤백.
- 원문은 리포에 넣지 않는다. 표본·라벨 시트는 원문 조각이 들어가므로 scratchpad 에만 둔다.

## 1. 다섯 갈래 — 무엇을 했나

| 안 | 손잡이 | 동작 |
|---|---|---|
| (가) 입력 풀 확대 | `--pool=approved\|relevant\|wide`(기본 wide) | 입력 글에 `verdict_kind`(approved·relevant·alt_seek). 종류 없는 옛 입력은 legacy 로 늘 남는다. 종류별 글·이름 나온 글 수를 둘째 줄에 찍는다 |
| (나) 기준 변형 | `--criterion=3\|2+2` · `--compare=3,2+2` · `--sample-out` · `--sample-labels` | 기준별 후보 수·영역 적합 수·오탐률. 표본은 기준마다 20건(키 해시 순 — 재현됨), 오탐률은 **그 기준용으로 뽑힌 표본만**으로 잰다 |
| (다) 같은 개발사 고리 | `--similar=<json>` · `scripts/appstore-same-developer.mjs` | 이름이 같은 언급 후보에 앱 ID 를 붙인다(링크 ID 와 같은 자리 → 검증을 탄다, **검증 없이 anchored 로 안 올림**). `--write` 면 `candidate-input.json`(언급 등록분 + 같은 개발사 후보)을 후보 생성기 입력으로 낸다 |
| (라) HN 재분류 어댑터 | `--area-verdicts=<json\|jsonl>` | 재판정 결과로 글 영역을 덮는다(메모리 안). 우선순위는 §6-3 뷰와 같은 함수 한 벌 |
| (마) 등록 모드 | `--register --review=<csv> [--migrations-dir]` | 채점 ≥30 ∧ 적합 ≥90% 일 때만 `mention-approved.json` → `candidate-register-draft` 로 마이그 초안+롤백. 사람이 N 준 키는 뺀다. DB 쓰기 없음 |

(나) 해석: "2글 + 서로 다른 소스 1곳 이상"을 **2글이 서로 다른 소스 2곳에서 나옴**(`2+2`)으로 읽었다 — 글 2개면 소스 1곳은 늘 참이라 기준이 안 된다.
다르게 뜻했다면 `--criterion=2+1`(= 2글만)로 같은 표를 낸다.

시험 기준은 **보고만** 한다. 3글 미만은 등록 계획에서 빠지고 `trial_only` 로 센다 — #561 CHECK(`post_count >= 3`)·`toApproved` 하한과 맞춘다.
(덤: 1차 코드는 `--min-posts=2` 로 돌리면 2글 anchored 후보에서 `toApproved` 가 던져 실행이 죽었다. 이번에 고쳤다.)

## 2. 읽기 SQL (CEO-staff 가 돌려 파일로 준다)

`supabase db query --linked -f q.sql --output json > x.json`. 래핑(`[{"input": …}]`)은 스크립트가 벗긴다.

```sql
-- (A') 언급 루프 넓은 입력 — 승인 + 1차 relevant 전체 + 판정 무관 대안 탐색 글. 영역 필터 없음(HN out-founder 포함 — (라) 어댑터가 영역을 고친다)
select json_build_object(
  'posts', (select coalesce(json_agg(p), '[]'::json) from (
      select i.id, i.project_id, i.source_key, ap.area_code, i.raw_text,
             case when v.human_verdict = 'relevant' or v.auto_approved_at is not null then 'approved'
                  when coalesce(v.human_verdict, v.verdict) = 'relevant' then 'relevant'
                  else 'alt_seek' end as verdict_kind
        from public.analysis_inputs i
        join public.analysis_projects ap on ap.id = i.project_id
        left join public.review_relevance_verdicts v on v.input_id = i.id
       where i.purged_at is null and i.raw_text is not null
         and coalesce(ap.area_code, '') <> 'hold'
         and i.raw_text ~* '(switch|moved|moving|migrat|transition|came over|jump|alternative|instead of|rather than|better than|worse than|compared (to|with)|replac|갈아|넘어|옮겨|옮김|옮겼|바꿨|바꿈|바꿔|바꾸|이사|대신|대안|대체|보다|쓰다가|사용하다가|이용하다가|만한)'
         and ( coalesce(v.human_verdict, v.verdict) = 'relevant'
            or i.raw_text ~* '(looking for (an? )?(\w+ )?alternative|(any|good|better) alternatives?|alternatives? (to|for)|recommend(ed)? (an? )?(alternative|replacement)|갈아\s*탈\s*만한|대신\s*쓸\s*만한|대안\s*(앱|어플|을|이|찾|추천|없)|대체\s*(앱|어플)|다른\s*(앱|어플)\s*(추천|찾))' )
  ) p),
  'projects', (select coalesce(json_agg(x), '[]'::json) from (
      select id, product_elevator_pitch, competitor_url, area_code from public.analysis_projects) x),
  'targets', (select coalesce(json_agg(x), '[]'::json) from (
      select t.project_id, t.source_key, t.label, t.product_ref, t.status, t.total_collected, s.enabled as source_enabled
        from public.review_targets t left join public.review_sources s on s.key = t.source_key) x),
  'discovery', (select coalesce(json_agg(x), '[]'::json) from (
      select name, homepage_url, verdict, verdict_reason from public.discovery_candidates) x)
) as input;
```

```sql
-- (B') 풀 크기 실측 — (A') 와 같은 조건, 종류별 개수만(원문 안 나옴). 먼저 이걸로 크기를 보고 (A') 를 돈다
select case when v.human_verdict = 'relevant' or v.auto_approved_at is not null then 'approved'
            when coalesce(v.human_verdict, v.verdict) = 'relevant' then 'relevant' else 'alt_seek' end as kind,
       i.source_key = 'hackernews' as is_hn, count(*)
  from public.analysis_inputs i
  join public.analysis_projects ap on ap.id = i.project_id
  left join public.review_relevance_verdicts v on v.input_id = i.id
 where i.purged_at is null and i.raw_text is not null and coalesce(ap.area_code, '') <> 'hold'
   and i.raw_text ~* '(switch|moved|migrat|alternative|instead of|better than|갈아|넘어|대신|대안|쓰다가)'
 group by 1, 2 order by 1, 2;
```

```sql
-- (C) HN 재판정 입력 — 1차 relevant · 프로젝트 영역이 ①~⑤/design/hold 가 아닌 HN 글. 표본 100 은 md5 순(재현됨). 전체는 limit 을 지운다.
--     마이그 000090 적용 뒤에는 주석 줄을 풀어 이미 판정한 글을 뺀다.
select coalesce(json_agg(x), '[]'::json) as input from (
  select i.id as input_id, left(i.raw_text, 600) as text, ap.area_code as project_area
    from public.review_relevance_verdicts v
    join public.analysis_inputs i on i.id = v.input_id
    join public.analysis_projects ap on ap.id = i.project_id
   where i.source_key = 'hackernews' and v.verdict = 'relevant'
     and i.purged_at is null and i.raw_text is not null
     and coalesce(ap.area_code, '') not in ('1','2','3','4','5','design','hold')
     -- and not exists (select 1 from public.review_area_verdicts r where r.input_id = i.id and r.prompt_version = 'arv-1')
   order by md5(i.id::text)
   limit 100
) x;
```

```sql
-- (D) 같은 개발사 앵커 — appstore-same-developer.mjs --targets 입력(영역 ①~⑤ 라벨 앱스토어 타깃)
select coalesce(json_agg(x), '[]'::json) from (
  select source_key, product_ref, label from public.review_targets
   where source_key = 'appstore' and label ~ '^[1-5]:' order by total_collected desc nulls last) x;
```

```sql
-- (E) 재판정 결과를 언급 루프로 — 마이그 000090 적용·INSERT 뒤. mention-loop.mjs --area-verdicts 입력
select coalesce(json_agg(x), '[]'::json) from (
  select input_id, area_code, fit::float as fit, prompt_version, judged_at from public.review_area_verdicts) x;
```

## 3. 돌리는 순서 (CEO-staff)

```
# 언급 루프 (가)(나)
node scripts/mention-loop.mjs --input=A.json --pool=wide --compare=3,2+2 --sample-out=<scratch>/sample.csv
#   → sample.csv 의 human_ok 칸을 Y/N 으로 채운 뒤
node scripts/mention-loop.mjs --input=A.json --pool=wide --compare=3,2+2 --sample-labels=<scratch>/sample.csv
# (다) 같은 개발사(네트워크 — itunes 루트 lookup, robots 재확인, 최대 40요청)
node scripts/appstore-same-developer.mjs --targets=D.json --out=<scratch>/similar.json
node scripts/mention-loop.mjs --input=A.json --similar=<scratch>/similar.json --lookup --write
# (마) 등록: 표본 30건 채점 → 통과일 때만 초안
node scripts/mention-loop.mjs --input=A.json --sample-out=<scratch>/review.csv --sample-n=30
node scripts/mention-loop.mjs --input=A.json --similar=… --lookup --register --review=<scratch>/review.csv
#   → supabase/migrations/<stamp>_candidate_register_<날짜>.sql + _rollback.sql → PR → CEO-staff 적용
```

지표 한 줄(픽스처로 실측한 출력, 꼴만):

```
[언급 루프 2026-10-17] 추출 이름 11 · 새 이름 6 · 후보 3 · 영역 적합 통과 3 · 등록 1 · 등록 앱당 평균 수확 확인 불가(0개) · 영역 ①0 ②0 ③0 ④1 ⑤2 · 30% 게이트 차단 1 · 대안 탐색 글 3
풀 wide · 종류별 글(이름 나온 글) legacy 21(19) · 글 단위 영역으로 올린 글 - · 같은 개발사 고리 일치 - · 기준 3글 · 시험 기준 전용(등록 안 함) 0
기준 비교 3글: 후보 3 · 영역 적합 3 · 표본 채점 0 · 오탐 0 · 오탐률 채점 전
기준 비교 2글+2소스: 후보 2 · 영역 적합 2 · 표본 채점 0 · 오탐 0 · 오탐률 채점 전
```

## 4. (마) 등록 모드 — 헌법 안에서 되는 것 / 문구가 필요한 것

**지금 헌법 안(구현함).** 후보 대장 accepted 에 해당하는 행(area_fit ∧ anchored ∧ 게이트 안 ∧ 사람 표본 N 아님) → `candidate-register-draft` 가
마이그 초안+롤백을 **파일로** 만든다 → PR → CEO-staff(§10.2 자체 판단 주체)가 적용. 기계는 DB 에 아무것도 쓰지 않는다.
문턱: CEO-staff 가 dry-run 표본 30건을 읽고 적합 ≥90%(27/30) 일 때만 초안이 나온다. 미달·채점 부족이면 초안 0 + 사유.

**무인 직접 INSERT(구현 안 함 — 문구 필요).** §10.1 "발굴 적재"는 `analysis_projects`(collecting INSERT) · `review_targets` INSERT 를 허용하지만,
같은 절 "창문 자동 등재"가 "새 소스·새 제품은 이 경로로 못 만든다(후보 승인 경로)"라고 적는다. 언급 루프는 **새 제품**을 만든다 → 문구가 필요하다.

- 전(§10.1 창문 자동 등재 끝 문장): "새 소스·새 제품은 이 경로로 못 만든다(후보 승인 경로)."
- 후(제안): "새 소스·새 제품은 이 경로로 못 만든다(후보 승인 경로). **예외 — 언급 앱 자동 등재**(남헌 승인 뒤): `scripts/mention-loop.mjs` 가 고른 후보만
  `analysis_projects`(collecting) + `review_targets` INSERT, 근거 글 ≥3 ∧ 영역 적합 ≥0.9 ∧ 앱 anchored(판매자 단일·평가 ≥50) ∧ 소스 enabled·소유자 예외 ∧
  30%·구글 플레이 80 게이트 안 ∧ 기존 (source_key, product_ref) 중복 불가 ∧ 최근 30일 안 사람 표본 채점(≥30건) 적합 ≥90%, UPDATE·DELETE 0,
  롤백 SQL 을 INSERT 전에 `reports/` 에 쓰고 push-pending 커밋. 표본 적합이 90% 아래로 떨어지면 다음 실행부터 등록 0(초안 경로로 되돌아간다)."

## 5. 예상 수량 [추정]

- (가) 풀: 1차 설계 표본에서 승인 ①~⑤ 9,370건 중 대안 표현 2.9%. HN 1차 relevant 9,412건을 더하고 대안 탐색 글을 더하면 대안 표현 글은 약 270 → **550~700글** [추정](HN 글은 대안 표현 비중이 더 높을 수 있다 — (B') 로 잰다).
- 후보(3글): 1차 추정 0~5개 → 풀 확대로 **3~10개** [추정]. 2+2 기준은 소스 2곳 조건이 앱스토어 단독 이름을 많이 떨어뜨려 3글과 비슷하거나 적을 것 [추정].
- 등록: 여전히 "이름 → 앱 ID" 에서 막힌다. (다) 같은 개발사 고리가 이름을 맞추는 경우만 ID 가 생긴다 — 앵커 20개 × 개발사 앱 1~3개 중 언급 이름과 겹침 **0~3개** [추정].
  그 위에 30% 게이트. **등록 = 첫 실행 0~3, 그 뒤 주 0~1** [추정].
- HN 재판정: 대상 ≈ 9,253글(9,412 − 자동승인 159 [추정 — 자동승인이 영역 안 프로젝트라 가정]). 20글/호출 → **≈ 463호출**, 하루 상한 2,000글이면 **5일**. 명목 비용
  호출당 ≈ 3.3k 입력 토큰 → 전체 ≈ $0.8(budget.ts 단가 기준, Gemini 무료 쿼터 안이면 실비 0) [추정]. ①~⑤ 로 올라올 글 = out-founder 대부분이 창업 일반론이라 **5~15%**(≈ 450~1,400글) [추정].

## 6. HN 글 단위 영역 재판정 설계 (D-37/45)

### 6-1. 지금 영역이 어떻게 붙나 (읽은 코드)

- `v_input_area`(마이그 20261009000020): 글 영역 = **프로젝트 영역**(`analysis_projects.area_code`) 그대로. 글 단위 칸은 없다.
- 프로젝트 영역 규칙 v37-1: 타깃 라벨 `N:` → 영역 지도 slug → 소개문 이름 → 근거 없으면 출처로 `out-founder`(HN·indiehackers…)/`out-consumer`.
  그래서 HN 글은 내용과 무관하게 `out-founder` 또는 NULL(갈림·미부여)이다.
- 소비자: T2 순서(`area-priority.ts` — 프로젝트 단위, NULL 이면 라벨 `areaOf` 폴백), 승인 범위(`approval-scope.ts` — `out-` 접두면 자동 승인 밖), 언급 루프 읽기 SQL.

### 6-2. 구조 (insert-only)

- 표 `review_area_verdicts(id, input_id → analysis_inputs, area_code ∈ 1~5|none, fit 0~1, model, prompt_version, judged_at, label, created_at)`,
  UNIQUE(input_id, prompt_version), **UPDATE 트리거로 금지**, DELETE 는 CASCADE·롤백용으로 열어 둠, RLS 정책 0(service_role 전용).
- 기존 판정(`review_relevance_verdicts`)·프로젝트 영역·`v_input_area` 는 건드리지 않는다. 프롬프트를 바꾸면 `arv-2` 로 새 행.
- 재판정: `scripts/hn-area-reclass.mjs judge` — 기존 2차 판정과 같은 `callGeminiRotating`(모델 순환·백오프·`budget.ts` 일일 달러 예산), 20글/호출,
  `--max`(기본 100) · 하루 상한 `HN_RECLASS_DAILY_MAX`(기본 2,000, out 파일의 오늘 행으로 셈), 이어 돌리기, 예산·402/403·전 모델 429 즉시 정지,
  검증 실패 행은 기록 안 함(다음 실행이 다시). 파일만 쓴다.
- 정밀도: `sheet`(눈가림 라벨 시트 — 모델 답 안 실음) → 사람이 `human_area` 채움 → `precision`(정밀도·Wilson 95%·재현율 참고).
  **적용 중단 규칙(코드):** 채점된 영역 예측 <30 → 확인 불가 / 정밀도 <0.6 → stop / 버전 섞임 → 확인 불가. `sql` 은 pass 일 때만 INSERT 파일을 만든다(ON CONFLICT DO NOTHING).

### 6-3. 병합 — 뷰 우선순위

새 뷰 `v_input_area_effective`(기존 뷰는 그대로, 소비자를 옮기기 전까지 영향 0):

1. 프로젝트 영역이 ①~⑤·design → 그대로(라벨·사람 근거가 정본 — 글 판정이 덮지 않는다)
2. 아니면(out-*·NULL; **hold 제외** — 남헌이 정한 신규 금지 영역) 그 글의 최신 판정이 ①~⑤ ∧ fit ≥ 0.7 → 그 영역(`area_via='input'`)
3. 아니면 프로젝트 영역

JS 쪽 같은 규칙: `lib/analysis/area-reclass.ts effectiveArea` — 언급 루프 (라) 어댑터가 쓰고, 셀프테스트가 마이그 파일의 0.7·hold 규칙과 대조한다(마이그가 main 에 들어온 뒤부터).
소비자 이전(T2 순서·승인 범위)은 이번 범위 밖 — 정밀도 통과 뒤 별도 PR. 특히 `approval-scope` 를 옮기면 HN 글이 rr-v2 자동 승인 대상으로 들어오므로 그때 판단한다.

## 7. 사람 판단 필요

1. (마) 무인 직접 INSERT 문구(§4 전/후) — 헌법 개정(남헌). 그 전에는 초안+CEO-staff 적용만.
2. (다) 같은 개발사 실행기는 itunes 루트 `/lookup` 을 부른다 — 문자상 robots 허용이지만 국가 경로 lookup 금지의 취지와 가깝다는 기존 판단 항목(#565 보고) 그대로. 돌릴지 CEO-staff 결정.
3. (나) "서로 다른 소스 1곳 이상"의 뜻 — `2+2` 로 읽었다. 다르면 손잡이만 바꾼다.
4. HN 재판정 표본 100건 사람 라벨(눈가림 시트) — 정밀도 게이트의 입력. 사람(또는 CEO-staff 가 지정한 채점자)만 줄 수 있다.
5. 재판정 결과를 T2 순서·자동 승인 범위에 연결할지(§6-3 마지막 줄) — 정밀도 통과 뒤.

## 8. 되돌리기

- 코드 PR: revert 한 번. 워크플로 배선·DB 쓰기 경로 없음(CI 셀프테스트 한 줄 추가뿐).
- 마이그 PR: 미적용이면 닫기. 적용 뒤에는 `20261017000090_review_area_verdicts_rollback.sql`(새 표·뷰·트리거만 DROP — 행이 있으면 먼저 COPY 로 남긴다).
- 등록 초안을 적용한 뒤: 같이 생긴 `_candidate_register_<날짜>_rollback.sql`.
