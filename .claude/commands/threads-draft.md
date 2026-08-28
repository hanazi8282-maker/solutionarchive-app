---
description: Threads 초안 4~5편을 생성해 posts(draft)와 drafts/YYYY-MM-DD.md 에 저장한다.
argument-hint: [편수, 기본 5] [--dry-run]
---

Threads 초안을 생성한다. 대상: $ARGUMENTS (비었으면 5편)

⛔ 발행하지 않는다(CLAUDE.md §10). 초안을 만들어 DB 와 파일에 남길 뿐이고,
   발행은 사람이 Threads 앱에서 직접 한다. Threads API 를 부르지 마라.

## 1. 재료 로드

먼저 가이드 3종을 **전부** 읽는다. 요약본이나 기억으로 대신하지 마라 —
문체 지문과 플랫폼 규칙은 세부가 전부다.

- `content/guides/voice-guide.md` — 화자의 문체 지문
- `content/guides/viral-patterns-linkedin.md` — 구조적 통찰(LinkedIn 기준)
- `content/guides/seo-guide.md` — Threads 플랫폼 규칙

그다음 DB 에서 읽는다(읽기 전용):

```bash
node --env-file=.env.local -e '
const b=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:k,Authorization:"Bearer "+k};
const get=async q=>(await fetch(b+"/rest/v1/"+q,{headers:H})).json();
console.log("=== hypotheses (testing) ===");
for(const h of await get("hypotheses?select=code,statement,variable,controls&status=eq.testing&order=code"))
  console.log(h.code,"|",h.variable,"|",h.statement,"| controls:",h.controls??"-");
console.log("\n=== content_items (available) ===");
for(const c of await get("content_items?select=code,tier,title,twist_line,source_case&status=eq.available&order=code"))
  console.log(c.code,"| T"+c.tier,"|",c.title,"|",c.twist_line??"-","|",c.source_case??"-");
console.log("\n=== learnings ===");
const l=await get("learnings?select=statement,status,sample_size,hypothesis_code");
console.log(l.length?JSON.stringify(l,null,2):"(없음 — 정상. 성과가 쌓이면 채워진다)");
'
```

`learnings` 가 비어 있는 것은 정상이다. 아직 발행 이력이 없어서다.
비었으면 가설만 보고 쓰고, 채워져 있으면 **확정된 학습을 가이드보다 우선**한다 —
실측이 문서를 이긴다.

## 2. 톤 결정 — 가이드가 충돌하는 지점

`voice-guide.md` 는 합쇼체(`~습니다`) 1인칭 '저/제' 를 지시하고
"일반적인 인플루언서 톤으로 덮어쓰지 말 것"이라고 못박는다.
`seo-guide.md` 는 "한국 Threads 는 반말·카톡체 문화"라며 반말을 권한다.

**기본값은 합쇼체다.** voice-guide 가 이 계정의 정체성을 규정하는 문서이고
"반드시 보존"을 명시하는 반면, seo-guide 의 반말 권장은 🟡 관찰된 문화 경향이지
플랫폼 규칙이 아니다. 정체성을 문화 평균에 맞춰 지우면 남는 차별점이 없다.

seo-guide 에서 가져오는 것은 톤이 아니라 **구조**다: 첫 줄 후킹, 500자 제한,
열린 질문 마무리, 링크는 본문 아닌 자답, 주제 태그 1개.

사용자가 "반말로" 라고 명시하면 그때 바꾼다.

## 3. 글쓰기 규칙 (셋을 결합)

**voice-guide 에서 (문체 — 절대 훼손 금지)**
- 1인칭 '저/제'. 합쇼체 기본, `~죠 / ~까요? / ~더군요 / ~버렸습니다` 를 섞는다.
- 서사 아크: 과거의 나(무지·실패) → 전환 사건 → 깨달음 → 일반화된 통찰.
- 실패를 먼저 고백하고 신뢰를 산다. 가르치지 않는다. 자랑하지 않는다.
- 한 문장 = 한 단락으로 핵심을 독립시킨다. 단락은 2~4문장, 사이에 빈 줄.
- 장단 교차: 긴 설명 뒤 한 줄 단정.
- ❌ 평어체로 전체를 끌지 말 것. 느낌표 남발 금지. 정의·배경으로 시작 금지.

**seo-guide 에서 (플랫폼 — 어기면 도달이 깎인다)**
- **500자 이내.** 넘으면 Threads 가 자동으로 쪼개고, 그러면 게시물이 둘이 되어
  매처가 어느 쪽에 붙일지 모호해진다. 넘칠 것 같으면 자답으로 뺀다.
- 첫 1~2줄에 후킹. 숫자·역발상·취약성 고백·미해결 질문 중 하나.
- 열린 질문으로 끝낸다. ❌ "좋아요 눌러주세요" 같은 인게이지먼트 베이트 금지.
- 본문에 외부 링크 금지 — 필요하면 `self_reply` 에 넣는다.
- 주제 태그(`topic_tag`)는 1개만.
- 좋아요가 아니라 **답글**을 노린다. 의견 없는 중립 글은 답글이 안 달린다.

**viral-patterns 에서 (구조)**
- perspective gap: 독자가 느끼지만 아무도 말 안 한 것을 언어화한다. 이게 가장 강한 레버다.
- 한 글 = 하나의 의도. 곁가지는 잘라 다음 글로.
- 구체성: 실제 카테고리명·수치·장면을 박는다. 모호하면 죽는다.

## 4. 소재 × 가설 배정

가설 7개는 각각 실험 변수가 다르다. 초안마다 **무엇을 테스트하는지**가
분명해야 하고, 그게 `hypothesis_code` 와 `hook_type`/`pattern`/`closing_type` 에
일관되게 반영돼야 한다. 태그가 본문과 어긋나면 리포트 집계가 통째로 거짓이 된다.

배정 원칙:
- **소재 하나로 여러 가설을 테스트해도 된다.** 같은 소재를 훅만 바꿔 두 편 쓰면
  H1(훅 유형)의 깨끗한 A/B 가 된다 — 소재가 고정돼 교란 변수가 준다.
- A/B 를 만들 때는 **비교하려는 변수 하나만 바꾼다.** 훅을 테스트하는데 마무리까지
  같이 바꾸면 어느 쪽이 효과를 냈는지 영영 못 가른다. 가설의 `controls` 를 지켜라.
- 매처는 A/B 를 지원한다(완전일치를 모호성 판정에서 제외). 텍스트가 충분히 다르면
  자동 연결되고, 너무 비슷하면 보류돼 대시보드에서 수동 연결하면 된다.
- 티어를 섞는다. T1(반전 강함)만 5편 쓰면 소재은행이 금방 마른다.
- H6(발행 시각)은 본문으로 통제할 수 없다. 발행 시각이 변수이므로 이 가설은
  다른 가설과 겹쳐 태깅하지 말고, 시간대 실험을 할 때만 쓴다.

각 초안에 붙일 값:
- `content_code` — 쓴 소재. `content_items.code` 에 실재해야 한다.
- `hypothesis_code` — 이 글이 테스트하는 것. `hypotheses.code` 에 실재해야 한다.
- `pattern` — 정수. 1=반전 데이터, 2=자기 결함 공개 (H2 가 이 둘을 비교한다).
- `hook_type` — 예: `반전형` / `선언형` / `숫자충격` / `고백형`. H1 이 이걸 비교한다.
- `closing_type` — 예: `열린질문` / `선언형` / `미해결예고`. H5 가 이걸 비교한다.
- `topic_tag` — 주제 태그 1개.
- `self_reply` — 자답 초안(선택). 본문에서 잘라낸 상세나 링크를 여기 둔다.
- `notes` — 이 글로 무엇을 보려는지 한 줄.

⚠️ `hook_type` / `closing_type` 값은 **한번 정한 문자열을 계속 재사용**해야 한다.
   `반전형` 과 `반전` 을 섞어 쓰면 리포트에서 다른 차원으로 갈려 표본이 쪼개진다.
   기존 값을 먼저 확인하라:
   `posts?select=hook_type,closing_type&status=neq.discarded`

## 5. 저장

초안 배열을 JSON 파일로 쓴 뒤 저장 스크립트에 넘긴다.
스크립트가 검증(500자·FK·타입)을 하고, 하나라도 틀리면 **한 건도 저장하지 않는다.**

```bash
# 1) 검증만 — DB·파일 안 건드린다
node --env-file=.env.local scripts/threads-drafts-save.mjs /tmp/drafts.json --dry-run

# 2) 실제 저장
node --env-file=.env.local scripts/threads-drafts-save.mjs /tmp/drafts.json
```

스크립트가 하는 일:
- `posts` 에 `status='draft'` 로 insert (`channel_id` 는 자사 채널 자동 참조)
- 쓴 `content_items` 를 `status='used'` 로 갱신
- `drafts/YYYY-MM-DD.md` 생성 — **이게 초안 아카이브다**

`$ARGUMENTS` 에 `--dry-run` 이 있으면 1)까지만 하고 멈춘다.

## 6. 보고

- 생성 편수, 각 편의 소재·가설·훅·글자수
- 어떤 A/B 쌍을 만들었고 무슨 변수를 고정했는지
- `drafts/YYYY-MM-DD.md` 경로
- 남은 `available` 소재 수 — 바닥나면 소재은행을 채워야 한다고 알린다

마지막에 반드시 덧붙인다: **발행은 사람이 직접 한다.** 발행하면 매시 정각
매처가 자동으로 연결하고, 매시 30분 수집기가 성과를 쌓기 시작한다.
