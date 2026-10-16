# 리뷰 속 언급 앱 → 새 앱 후보 → 등록 → 수집 루프 설계 (v71ad §1, D-36)

- 지시: 남헌 v43·v48·v71aa·v71ac 반복, v71ad §1 최우선 (CEO-staff 전달, 2026-10-17)
- 작성: CTO 서브에이전트. **DB 는 한 번도 안 봤다.** 입력은 CEO-staff 의 읽기 전용 표본(규모·예시·오탐 패턴)과 리포 코드뿐이다.
- 상태: 순수 함수 모듈 + 셀프테스트 + dry-run 스크립트(코드 PR), discovery_candidates 칼럼 추가 마이그(별도 PR, 미적용).
  **무인 루프에 연결하지 않았다**(워크플로 추가 없음). 등록은 기존 마이그 초안 경로로만 한다.
- 표본 원문은 이 문서·픽스처에 옮기지 않았다. 예시는 전부 합성 문장이다.

## 0. 한 줄 요약

규칙 추출은 돈다. 하지만 **등록 수는 "이름 → 앱 ID" 단계에서 막힌다.** 이름으로 앱을 찾는 공식 경로(`itunes.apple.com/search`)는
robots 가 `Disallow: /search*` 로 막고 있다(2026-10-17 실측). 이 결정이 나기 전에는 하루 등록이 **0~1건 [추정]**이다. §10 사람 판단 1번이 이것이다.

## 1. 이미 있는 부품과 이번에 더한 것

| 단계 | 재사용 | 이번에 더한 것 |
|---|---|---|
| ① 추출 | `stripHeader`(수집기 머리 표식) | `lib/discovery/mention-loop.ts` extractMentions — **전환·대안 문맥 안의 이름만**(영 4규칙·한 6규칙), `[SRC: …]` 머리글 제거, 대안 탐색 글 판정 isAltSeek |
| ② 정리·대조 | `normKey`·`buildRegistry`(제품 사전·영역 지도·프로젝트 소개문·타깃 라벨/앱 ID·발굴 채택분) — product-name-candidates.mjs 와 **같은 키** | 자기 이름 제외: 그 리뷰가 달린 프로젝트 하나로 buildRegistry 를 한 번 더 돌려 그 키를 뺀다 |
| ③ 대장 | discovery_candidates(verdict 3상태·이름 유일) | 칼럼 10개(§5) · 대장 파일 `reports/mention-ledger.json` · 대장 INSERT SQL 생성 |
| ④ 오탐 | config `product-name-discovery.json` exclude(회사명 단독·사람·약어·하드웨어…) | STOP(대명사·관사·일반명사·수식어), OS 기본 앱(Pages·Notes·Calendar…), 한국어 님/씨, "비교만" 보류 |
| ⑤ 검증 | `lib/review/anchor.ts` verifyAnchor(이름 일치·판매자 단일·평가 ≥50·도메인 앵커) | 근거 글 속 앱스토어 링크 ID → 루트 `/lookup?id=` 조회(옵트인 `--lookup`, robots 먼저) |
| ⑥ 등록 | `scripts/candidate-register-draft.mjs --approved`(프로젝트+타깃 마이그 초안+롤백) | 그 입력 꼴(`mention-approved.json`)을 그대로 낸다 — 셀프테스트가 planRows 경계를 직접 통과시킨다 |
| ⑦ 게이트 | `lib/review/target-supply.ts` gateHeadroom(30%·구글 플레이 80) | planGate: 앱스토어 자리 → 넘치면 구글 플레이(패키지를 알 때만) → 둘 다 안 되면 차단 + 사유 |
| ⑨ 지표 | — | metricsLine 한 줄, `reports/<날짜>/mention-loop.json` |

기존 `product-name-candidates.mjs` 는 문장 중간 대문자 단어까지 넓게 잡고 사람이 승인 시트로 거른다. 이 루프는 사람 없이 가는 경로라
**넓이보다 정밀도**를 택했다. 두 스크립트는 같은 normKey 를 써서 같은 앱이 두 이름으로 갈라지지 않는다.

## 2. 추출 규칙 (① · ④)

**영문(이름이 트리거 뒤)** — 이름 = 대문자 단어 최대 3개 묶음, 또는 소문자 한 단어("from pages to …"). 앞 관사 the 만 건너뛴다.

| 역할 | 트리거 |
|---|---|
| from(떠난 앱) | switch(ed/ing)·moved·migrated·transitioned·came·jumped (over) **from** |
| to(옮겨 간 앱) | switch·move·migrate·go back·jump ship (over/back) **to**, 그리고 "from X **to** Y" 의 Y |
| alt | alternative(s) **to/for** |
| compare | instead of · rather than · better/worse than · compared to/with · replaced |

**한국어(이름이 트리거 앞, 같은 문장 안)** — 수식어(유료·무료·계속·그냥·원래…)는 건너뛰고 그 앞 토큰을 본다. 대명사(이거·이걸·다른 앱…)면 이름 없음.

| 역할 | 트리거 |
|---|---|
| from | X(을/를) 쓰다가·사용하다가·이용하다가 + 30자 안에 갈아/넘어/바꿨/옮/이사 |
| from | X**에서** + 25자 안에 (으)로 갈아/넘어/… |
| to | X(으)로 갈아/넘어/옮겨/바꿨/이사 (붙여쓰기 `[X로갈아탐]` 포함) |
| alt | 영문 X 대안 · 한글은 **X의 대안**만("좋은 대안" 형용사 배제) |
| compare | X 대신 + 20자 안에 쓸/써/사용/이용/설치 ("대신 아쉬운 점은"·"웹 대신" 배제) |
| compare | X보다 (훨씬/더) 낫/좋/편/빠르/가볍 |

**표본 오탐 5종 → 규칙** (셀프테스트에 합성 문장으로 고정)

1. '대신' 접속어 → 뒤에 사용 동사가 와야 하고, 이름 자리가 일반명사(웹)면 버린다
2. better than web version / no mobile app → STOP 에 web·no·version
3. 일반명사 앱 이름(Pages·Notes·Calendar) → `builtin_generic` 기각(사유 남김). Google 단독 → `company_only`
4. 자기 이름 → 리뷰가 달린 프로젝트의 소개문 이름·라벨 slug·앱 ID 와 같으면 집계에서 뺀다
5. `[SRC: https://play.google.com/…]` 머리글 → 추출 전에 지운다

**비교만** 나온 이름(from/to/alt 0)은 등록 안 함(`hold: compare_only`). "Evernote 보다 낫다"는 Evernote 가 대안이라는 근거가 약하다.

**선택적 모델(구현 안 함)** — 한국어 자유문 고유명(트리거 밖)·여러 단어 한글 이름을 놓친다. 붙인다면: 규칙이 이름 0개를 낸 "대안 탐색 글"만
claude-cli(구독 세션)로 보내 이름만 뽑게 하고, 채택은 여전히 ③~⑤ 를 통과해야 한다. 규모는 하루 수십 글 [추정] — 비용보다
세션 한도 가드(session-guard)가 제약이다. 붙일 때 safetyAlerts 에 호출 수·비용 상한을 더한다.

## 3. 판정 단계 (③ · ④)

순서 고정(`judge`): 지난 기각(대장·discovery_candidates rejected) → 이름 기각 사유 → 비교만 → 글 수 하한 → 영역 적합.

- `prior_rejected` — 재제안 안 함. 사유는 원래 사유를 그대로 잇는다
- `rejected` — 이름 사유(stopword·builtin_generic·company_only·person_name·config exclude 갈래·3자 이하 소문자)
- `hold` — compare_only · below_min_posts(n/k)
- `candidate` — 글 수 통과, 영역 적합 미달(대표 영역 비중 < 0.9 또는 영역 ①~⑤ 밖)
- `area_fit` — 영역 적합 통과. 영역 = 근거 글이 달린 프로젝트의 area_code 다수결, 적합 = 그 비중

점수(정렬·게이트 순서): 글 수 + 0.5×(소스 수−1) + 1×대안 탐색 글 수.

### 3-1. 통과 기준을 데이터로 조정하는 법

글 수는 **하루치가 아니라 누적**으로 센다(대장이 날마다 이어진다). 그래서 하루 유입이 적어도 이름이 쌓이면 언젠가 3글을 넘는다.

`thresholdTable` 이 k=1~5 마다 "후보 수 · 검증 anchored · no_match/ambiguous · 확인 불가 · 정밀도(anchored ÷ 검증된 것)"를 낸다.

규칙: **정밀도 ≥ 0.8 이고 검증된 표본 ≥ 10 인 가장 작은 k** 로 낮춘다. 표본이 10 미만이면 3 을 유지한다(확인 불가를 통과로 접지 않는다).
바꾸는 손잡이는 `--min-posts` 하나다. 지금은 이름 검색이 막혀 검증 표본이 거의 안 생기므로, **당분간 k 를 데이터로 낮출 근거가 안 생긴다.**

## 4. 검증 (⑤)

- **근거 글 속 앱스토어 링크 ID** 가 있으면 루트 `itunes.apple.com/lookup?id=<ID>` 로 조회해 verifyAnchor(이름 일치·판매자 단일·평가 ≥50).
  링크 앱 이름이 후보와 안 맞으면 no_match 로 접지 않는다 — 링크가 리뷰 대상 앱 자신일 수 있다(→ 확인 불가).
- **이름만 있는 후보(대부분)** 는 `/search?term=` 이 필요하다. **robots `Disallow: /search*`** 라 요청하지 않는다 → `lookup_failed`(확인 불가, 등록 안 함).
  사람 판단이 나면 `--searched=<json>` 으로 검색 결과를 먹이면 코드 변경 없이 같은 판정을 탄다.
- robots 실측(2026-10-17, 리포 파서 `robotsVerdict`): `/lookup?id=1` **allowed**(일치 규칙 없음) · `/us/lookup?id=1` disallowed(`/*/lookup?`) ·
  `/search?term=` disallowed · `/us/rss/…` disallowed(앱스토어 수집은 소유자 예외 `owner_2026-10-05` 로 돈다).
  루트 lookup 은 **문자 그대로는 허용**이지만 `/*/lookup?` 의 취지와 가깝다. 그래서 `--lookup` 은 기본 꺼짐·옵트인이고 사람 판단 항목에 올린다.
- `--lookup` 동작: robots.txt 를 먼저 읽어 '허용'일 때만, ID 당 1회·3초 간격·하루 30회, 200 아닌 응답·빈 본문이면 그 즉시 **이 경로만** 그날 중단(403/429/빈 응답 = 차단 → 등록 0 + 경보).
- 구글 플레이: 공식 API 없음. **이름 매칭만** — 근거 글 속 `play.google.com/…id=` 패키지나 제품 사전의 패키지를 알 때만 구글 플레이 쪽으로 보낸다(구현은 play_pkg 칸만, 지금 채우는 경로 없음).
  유사 앱·검색으로 넓히는 것은 소유자 예외(리뷰 수집용) 밖의 새 법적 판단이라 하지 않았다.
- 동명 앱: 판매자가 다른 같은 이름 앱이 둘 이상이면 ambiguous → 등록 안 함. 후보 도메인을 알면 판매자 도메인과 맞아야 한다(anchor.ts 기존 규칙).

⚠️ 덧붙임: `scripts/anchor-verify.mjs`(v70) 머리 주석이 `/search` 를 "robots 대상 아님"이라 적고 실제로 부른다. 위 실측과 어긋난다. 이번 PR 은 그 파일을 고치지 않았다(§10).

## 5. 마이그 칼럼안 (별도 PR, `20261017000020_discovery_candidates_mention.sql`, 미적용)

discovery_candidates 에 nullable 10칸 + CHECK 3 + 부분 인덱스 1. 비파괴, 백필 없음.

| 칸 | 뜻 |
|---|---|
| origin | NULL=HN 발굴(레거시) · 'mention' |
| mention_count · post_count · source_count | 언급 수 · 서로 다른 글 수 · 서로 다른 소스 수 |
| alt_seek_posts | 근거 글 중 대안 탐색 글 수 |
| evidence_input_ids uuid[] | 근거 글 id 최대 10(FK 없음) |
| area_code · area_fit | 대표 영역 · 비중 |
| gate_blocked | appstore_30pct · googleplay_80 |
| last_seen_at | 마지막 집계일 |

CHECK `discovery_candidates_mention_accept_check`: origin='mention' 인 행이 accepted 이려면 글 ≥3 · 근거 id ≥3 · 영역 적합 ≥0.9 · 영역 ①~⑤.
기각·확인불가는 기존 verdict(rejected/unverified)+verdict_reason 으로 남긴다 — 기존 이름 유일 인덱스(kind, lower(name))가 재제안을 막는다.
대장 SQL(`mention-ledger.sql`)은 `ON CONFLICT … WHERE origin='mention' AND verdict<>'accepted'` 라 HN 행과 채택된 행을 덮지 않는다.

코드는 이 칼럼 없이도 돈다(dry-run 은 파일만 쓴다). 칼럼은 "대장을 DB 로 옮기는" 다음 단계용이다.

## 6. 등록 (⑥) · 게이트 (⑦) · 램프 (⑧)

**등록 경로(지금):** `mention-loop.mjs --write` → `reports/<날짜>/mention-approved.json` → `node scripts/candidate-register-draft.mjs --approved=…`
→ 마이그 초안+롤백 → PR → CEO-staff/역할 세션 적용. **CC 가 운영 DB 에 SQL 을 직접 실행하는 경로는 만들지 않았다.** 영역 적합 ≥0.9 + anchored 는 하루 한도 없이 다 올린다(게이트만 막는다).

**무인 직접 등록(나중):** CLAUDE.md §10.1 "창문 자동 등재"는 "새 제품은 이 경로로 못 만든다"고 적고 있다. 야간 작업이 직접 넣으려면 §10.1 에 한 줄이 필요하다(제안, 수정 안 함):

> - **언급 앱 자동 등재**(남헌 v71ad 승인 뒤) — `scripts/mention-loop.mjs` 가 고른 후보만 `analysis_projects`(collecting) + `review_targets` INSERT,
>   근거 글 ≥3 ∧ 영역 적합 ≥0.9 ∧ 앱 anchored(판매자 단일·평가 ≥50) ∧ 소스 enabled·소유자 예외 ∧ 30%·구글 플레이 80 게이트 안 ∧ 기존 (source_key, product_ref) 중복 불가,
>   UPDATE·DELETE 0, 롤백 SQL 을 INSERT 전에 `reports/` 에 쓰고 push-pending 커밋. 새 소스는 이 경로로 못 만든다.

**30% 게이트:** 앱스토어 남은 자리 = gateHeadroom('appstore', 활성, 전체 활성)(enabled 소스 기준, target-supply 와 같은 식). 자리 안에서 점수 순 →
넘치면 구글 플레이 패키지를 알 때만 구글 플레이(활성 80 동결 안) → 둘 다 안 되면 `blocked` + 사유. **매일 막힌 수 = `metrics.gate_blocked`**(mention-loop.json),
행별로는 대장 SQL 의 `gate_blocked` 칸. 남은 자리는 하루 한 번만 계산한다(보수 쪽 — 같은 날 다른 소스가 늘면 실제 자리는 더 크다).
현재 앱스토어 비중이 이미 30% 근처라면(창문 106건 대기 PR #554 가 같은 자리를 쓴다) 이 루프의 등록은 대부분 차단으로 끝난다 [추정].

**3일 램프:** 새 타깃은 수집 러너 정렬 `last_run_at ASC NULLS FIRST` 덕에 **다음 실행에서 이미 맨 앞**이다(첫 방문 = 앱스토어 RSS 최근 리뷰 묶음이 수확의 대부분).
2~3일차 우선 재방문은 구현하지 않았다 — 앱스토어 새 리뷰 도착이 하루 0.3~0.5건 [실측, target-supply.ts 주석 10-12]이라 2~3일차 재방문의 추가 수확이 작다.
등록 뒤 첫 방문이 실제로 일어났는지는 `harvestPerApp`(등록 ref 의 total_collected)으로 지표에 나온다. 첫 방문이 3일 안에 안 일어나면 그때 정렬에 넣는다.

## 7. 일일 지표 한 줄 (⑨) · 안전 (⑩)

```
[언급 루프 2026-10-17] 추출 이름 N · 새 이름 N · 후보 N · 영역 적합 통과 N · 등록 N · 등록 앱당 평균 수확 X(n개) · 영역 ①a ②b ③c ④d ⑤e · 30% 게이트 차단 N · 대안 탐색 글 N
```

- 추출 이름 = 전환 문맥에서 나온 서로 다른 키 · 새 이름 = 등록·자기·지난 기각·이름 사유 제외 · 후보 = 글 수 통과(candidate+area_fit) · 등록 = 게이트 통과 계획 수(dry-run)
- 평균 수확 = 대장에 등록 ref 가 있는 타깃의 total_collected 평균. 없으면 "확인 불가"(0 으로 접지 않는다)
- 경보: 앱 조회 차단(403/429/빈 응답 → 그 경로만 중단·등록 0) · 조회 수 > 30 · 영역 쏠림(등록 가능 5건 이상에서 한 영역 > 60%)
- 비용: 지금 모델 호출 0, 외부 요청 = 옵트인 lookup ≤30/일. 모델을 붙이면 같은 함수에 상한을 더한다

## 8. 와일드카드 — 대안 탐색 글

- 신호: 이름이 없어도 "looking for an alternative · any alternatives · alternative to/for · 갈아탈 만한 · 대신 쓸 만한 · 대안 앱/찾/추천 · 대체 앱 · 다른 앱 추천"이 든 글(isAltSeek)
- 쓰는 곳: (1) 지표에 하루 대안 탐색 글 수 (2) 그 글에서 같이 나온 이름에 점수 +1 (3) 효과 측정 `altSeekEffect`
- 효과 측정: 후보를 "대안 탐색 글 ≥1" / "0" 두 묶음으로 나눠 ① 검증 통과율(anchored ÷ 검증됨) ② 등록 뒤 14일 수확(harvestPerApp 을 같은 두 묶음으로)을 비교.
  묶음마다 검증 ≥10 이 모이기 전에는 결론 내지 않는다. 30일 뒤에도 차이가 없으면 가중을 0 으로 내린다(scoreOf altSeekWeight).
- 덤: 이름 없는 대안 탐색 글 자체가 "그 영역에서 사람들이 갈아탈 곳을 찾는다"는 수요 신호다 — 영역별로 세면 어느 영역 공급을 늘릴지 정하는 입력이 된다(이번 범위 밖).

## 9. 읽기 SQL (CEO-staff 가 돌려 `--input` 으로 넘길 파일)

한 번에 한 JSON 객체. `supabase db query --linked -f q.sql --output json > input.json` 꼴 출력(`[{"input": {...}}]`)을 스크립트가 그대로 벗긴다.
본문 정규식은 **좁히기용 상위집합**일 뿐이다 — 실제 판정은 JS 규칙이 한다. 원문은 리포에 커밋하지 말고 로컬·scratchpad 에만 둔다.

```sql
-- (A) 언급 루프 입력 — 승인(최종 라벨 relevant) 리뷰 본문 + 등록 프로젝트·타깃·발굴 대장
select json_build_object(
  'posts', (select coalesce(json_agg(p), '[]'::json) from (
      select i.id, i.project_id, i.source_key, ap.area_code, i.raw_text
        from public.review_relevance_verdicts v
        join public.analysis_inputs i   on i.id = v.input_id
        join public.analysis_projects ap on ap.id = i.project_id
       where coalesce(v.human_verdict, v.verdict) = 'relevant'
         and i.purged_at is null and i.raw_text is not null
         and ap.area_code in ('1','2','3','4','5')
         and i.raw_text ~* '(switch|moved|moving|migrat|transition|came over|jump|alternative|instead of|rather than|better than|worse than|compared (to|with)|replac|갈아|넘어|옮겨|옮김|옮겼|바꿨|바꿈|바꿔|바꾸|이사|대신|대안|대체|보다|쓰다가|사용하다가|이용하다가|만한)'
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
-- (B) 하루 유입 실측 — 예상 후보 수(§10)를 추정에서 실측으로 바꾸는 데 쓴다. 최근 14일, 승인 리뷰 · 대안 표현 일치 수
select (i.created_at at time zone 'Asia/Seoul')::date as day,
       count(*) as approved,
       count(*) filter (where i.raw_text ~* '(switch|moved|migrat|alternative|instead of|better than|갈아|넘어|대신|대안|쓰다가)') as alt_expr
  from public.review_relevance_verdicts v
  join public.analysis_inputs i on i.id = v.input_id
  join public.analysis_projects ap on ap.id = i.project_id
 where coalesce(v.human_verdict, v.verdict) = 'relevant'
   and ap.area_code in ('1','2','3','4','5')
   and i.created_at >= now() - interval '14 days'
 group by 1 order by 1;
```

```sql
-- (C) 게이트 현황 — 앱스토어·구글 플레이 활성 비중(enabled 소스 기준, target-supply 와 같은 분모)
select t.source_key, count(*) as active,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
  from public.review_targets t join public.review_sources s on s.key = t.source_key
 where t.status = 'active' and s.enabled
 group by 1 order by 2 desc;
```

돌리는 법: `node scripts/mention-loop.mjs --input=<A 결과>` (지표만) → 괜찮으면 `--write --ledger=reports/mention-ledger.json`.
첫 실행은 대장 파일이 없어 빈 대장으로 시작한다(기본 경로일 때만 — 경로를 지정했는데 없으면 멈춘다).

## 10. 예상 하루 후보 수 — 정직하게

표본(10-17 CEO-staff): 승인 리뷰 ①~⑤ 약 9,370건 중 대안 표현 정규식 일치 약 270건(2.9%), 표본 36건 중 다른 앱 이름이 실제로 나온 것 약 11건(≈30%).

- 전체 누적에서 이름이 나온 글: 270 × 0.3 ≈ **80글 [추정]**. 이 중 자기 이름·등록분·일반명사(Pages·Notion 류)를 빼면 절반 안팎 ≈ **40글 [추정]**.
- 이름 분포는 긴 꼬리다(표본 예시 11건에 같은 이름 반복이 없다). 누적 40글에서 **서로 다른 글 3개 이상인 새 이름 = 0~5개 [추정]**. 첫 실행(누적 전체)이 가장 많이 내고, 그 뒤로는 줄어든다.
- 하루 유입: 승인 리뷰 하루 유입은 모른다(9,370건이 며칠에 걸쳐 쌓였는지 확인 안 함 — (B) 쿼리로 잰다). 하루 300~800건이면 [추정] 대안 표현 9~23 → 이름 3~7 → 새 이름 1~3글/일.
  같은 새 이름이 3글을 채우려면 몇 주가 걸린다 → **새로 문턱을 넘는 후보 = 주 0~2개 [추정]**.
- 등록: 그 후보 중 앱 ID 를 아는 것(근거 글에 앱스토어 링크) 은 드물다 → 이름 검색이 막힌 지금 **등록 = 하루 0, 주 0~1 [추정]**.
  게이트까지 겹치면 그마저 차단될 수 있다(§6).

이 루프 하나로 "하루 수십 개 새 앱"은 나오지 않는다. 공급 효과를 내려면 (1) 이름 검색 허용(§11-1) (2) 기준 k 를 데이터로 2 까지 낮춤 (3) 모델 보강으로 한국어 자유문 이름 회수 — 이 셋이 다 필요하고, 그래도 **주 단위 한 자릿수 [추정]**다.

## 11. 약점

- **이름 → 앱 ID 막힘**(가장 큼): §4. 검색 허용 전에는 검증이 거의 안 된다.
- **오탐**: 소문자 한 단어 허용("from pages")이 일반어를 잡는다 → STOP·기본 앱·config exclude 로 막지만 사전은 늘 모자란다. 기각은 사유와 함께 대장에 남아 재제안은 안 된다.
  가상의 대안("If X made an alternative to notion")·부정 문맥("would never switch to X")은 못 가른다 — 검증·글 수 하한이 2차 그물이다.
- **한국어 재현율**: 트리거 밖 자유문 이름·띄어 쓴 여러 단어 한글 이름은 놓친다. 한↔영 표기("노션"↔"Notion")는 제품 사전에 있을 때만 합쳐진다 — 새 앱은 두 키로 갈라질 수 있다.
- **영역 쏠림**: 표본 대안 표현의 절반이 ⑤ appstore(133/270). 후보도 ⑤ 로 쏠릴 것이다 [추정] → 쏠림 경보(60%)만 걸고 막지는 않는다.
- **30% 게이트**: 앱스토어 비중이 이미 높아 이 루프 등록이 차단으로 끝나기 쉽다. 구글 플레이 우회는 패키지를 알 때만이다.
- **모델 비용**: 지금 0. 붙이면 세션 한도와 경합한다.
- **판정 근거가 "승인 리뷰"뿐**: 무관 판정된 리뷰 속 언급은 안 본다(의도) — 대신 유입이 적다.

## 12. 롤백

- 코드 PR: revert 한 번. 워크플로·DB 쓰기 경로가 없어 되돌릴 운영 상태가 없다(CI 에 셀프테스트 한 줄 추가뿐).
- 마이그 PR: 미적용 상태면 PR 닫기. 적용 뒤에는 `20261017000020_discovery_candidates_mention_rollback.sql`(칼럼·CHECK·인덱스 DROP — 파괴적, 먼저 origin='mention' 행을 SELECT 로 남긴다).
- 등록이 일어난 뒤(마이그 초안 적용 뒤): candidate-register-draft 가 같이 만든 `_rollback.sql` — 그 마이그가 만든 프로젝트·타깃만 지운다.
