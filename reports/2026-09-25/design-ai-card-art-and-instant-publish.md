# 설계안 2건 — 로고 없는 카드용 AI 이미지 · Threads "즉시발행" 트랙 (남헌 승인 대기)

> 2026-09-25 CEO-STAFF(Fable). 남헌이 "진행"으로 확정한 2건의 **구체안**이다. 둘 다 아직 코드 0줄이고,
> 이 문서의 "승인 필요" 항목에 남헌이 답하기 전에는 착수하지 않는다.
> 붙임: 7번(소스칩 필터) 착수 판단에 필요한 T2 라벨 진행률 실측.

---

## 0. 붙임 — T2 라벨 진행률 (7번 소스칩 필터 착수 판단용)

2026-09-25 08:40 UTC, `review_relevance_verdicts` PostgREST 실측. "공개 대상" = 사람 채점 relevant 또는 (사람 채점 없음 + LLM relevant).

- 공개 대상 629행 중 라벨(impact) 채워짐 **548행 = 87%**. 라벨 4개 전부 NULL 68행, 일부만 채워진 13행.
- 사업모델별: 소비재(business_model NULL) 492/540 = 91% · **SaaS 56/89 = 63%**(프로젝트 `40512422…` 32/65, `156e6610…` 24/24).
- `/signals` 기본값이 SaaS 라 실제로 화면에 영향을 주는 숫자는 63% 쪽이다.
- 남은 미라벨 65행은 드라이런 기준 프로젝트 5개·LLM 호출 6회. `node --env-file=.env.local scripts/relevance-labels-backfill.mjs --run` 한 번이면 끝난다(PR #269 부터 멈춤 사유가 `ops/state/`에 남는다).

**판단:** 지시대로 착수 보류. "비율이 낮다"고 볼 정도는 아니지만(87%), SaaS 63% 는 3열 기본 화면의 필터 결과가 실제 분포와 다르게 보일 수준이라 소급 완주 뒤 착수가 맞다. 소급이 끝나면 이 항목을 다시 받는다.

---

## 1. 로고 없는 케이스 카드용 AI 이미지 생성 — 모델 비교와 추천안

### 1.1 대상이 몇 건인가 (실측)

`case_studies` 승인 33건(SaaS 11) 실측(2026-09-25):

- `logo_url` 은 33건 전부 NULL (사람이 확정한 이미지 0건).
- `brand_domain` NULL **12건**. 이 12건이 지금 이니셜 듀오톤으로 나오는 카드다.
  - 폐업·도메인 소멸이라 로고를 못 가져오는 것: Homejoy · Fab.com · Zenefits(현 TriNet) · Shyp · Pets.com · Zume · Cydoc — **7건**
  - 살아 있는데 도메인만 안 적힌 것: ConvertKit(kit.com) · Everlane · Fathom Analytics · Plausible · Testimonial.to — **5건** → 이건 AI 이미지가 아니라 `brand_domain` 기재로 푼다(Brandfetch 경로). 이미지 생성 대상에서 뺀다.

즉 **AI 이미지 실수요는 지금 7장**, 이후 폐업 스타트업 케이스가 늘 때마다 1장씩이다. 어느 모델을 골라도 비용은 1달러 미만이다. 결정축은 비용이 아니라 ① 브랜드 리스크 ② 스타일 일관성 ③ 운영 부담(키·과금·코드) ④ 이미지를 어디 둘 것인가다.

### 1.2 유지하는 원칙

- **브랜드 로고를 흉내내지 않는다.** 프롬프트에 브랜드명·로고·상표를 넣지 않는다. 넣는 것은 "제품 카테고리 + 병목"뿐이다(예: "가정 청소 서비스", "반짝세일 커머스", "피자 자동조리 트럭").
- 텍스트 없음(no text, no letters, no logo, no watermark-like marks). 글자가 생기면 폐기하고 재생성.
- 스타일 고정: 병목별 듀오톤(`lib/cases/logo.ts` BOTTLENECK_HUE 그대로) + 단순 도형 일러스트, 정사각 512px. 카드 그리드에서 로고 카드와 나란히 놓여도 튀지 않아야 한다.
- 화면에 "AI 생성 카테고리 일러스트" 고지 한 줄(`LOGO_NOTICE` 옆). 사용자가 실제 로고로 오해하지 않게.

### 1.3 후보 3개 비교

가격은 2026-09-25 웹 확인값. 공식 페이지에서 직접 읽은 것은 ✅, 2차 사이트 인용은 △.

**A. Google Gemini 3.1 Flash Lite Image ("Nano Banana 2 Lite") — 기존 `GEMINI_API_KEY` 그대로**
- 가격 ✅ 1K 이미지 1장 ≈ **$0.0336** (출력 $30/1M 토큰, 배치 $15). 무료 티어 없음. 참고로 지금 코드가 쓰는 `gemini-2.5-flash-image` 계열은 **2026-10-02 종료** 예정이라 이 모델로 시작하는 게 맞다. 상위 3.1 Flash Image 는 512px $0.045 / 1K $0.067.
- 품질: 단순 일러스트·색 지정·스타일 유지에 충분. 글자를 잘 그리는 모델이라 "no text" 를 프롬프트에 반드시 박는다. SynthID 워터마크 자동 삽입(투명 표기에 유리).
- 브랜드 리스크: Google 이용정책이 실존 상표 재현을 금지 방향으로 필터링 — 카테고리 프롬프트와 방향이 같다.
- 운영: **새 벤더·새 키·새 과금 0**. 예산 가드(`lib/analysis/budget.ts`, 일 $5)와 429/503 처리를 그대로 쓴다. 단 **이미지 모델은 무료 티어가 없어서, 지금 키가 유료(결제 연결) 프로젝트인지 확인이 필요하다** — 9월에 Gemini 429 쿼터 이슈가 있었던 키라 무료 티어일 가능성이 있다. 확인은 AI Studio → 프로젝트 결제 상태.

**B. OpenAI `gpt-image-1-mini`**
- 가격 △ 1024² low **$0.005** / medium $0.011 / high $0.036 (공식 가격 페이지가 403 이라 2차 사이트 2곳 교차). `gpt-image-1` 본판은 2026-10-23 은퇴 예정이라 mini 또는 1.5 만 후보.
- 품질: 프롬프트 준수·구도 안정성이 가장 좋다. C2PA 출처 메타데이터 자동.
- 브랜드 리스크: 상표 필터 강함. 우리 프롬프트엔 브랜드명이 없으니 차이 없음.
- 운영: **벤더 추가** — platform.openai.com 계정·선불 크레딧(최소 $5)·`OPENAI_API_KEY` 신규, `lib/analysis/llm.ts` 프로바이더 분기 추가. 7장 때문에 두 번째 LLM 벤더를 유지하는 비용이 이득보다 크다.

**C. FLUX (schnell / dev) — fal.ai 또는 Replicate**
- 가격 △ 장당 **$0.003~0.06** (schnell 최저, pro $0.04~0.06). 선불 크레딧.
- 품질: 사진풍은 최강이지만 우리는 평면 일러스트라 이점이 작다. seed 고정으로 일관성 확보 가능.
- 브랜드 리스크: 오픈 가중치 계열이라 상표 필터가 약하다(프롬프트에 브랜드명을 안 넣으면 실무상 문제 없음). **라이선스 주의**: FLUX.1 [dev] 는 비상업 라이선스, 상업 사용은 schnell(Apache-2.0) 또는 호스팅사 상업 플랜을 써야 한다.
- 운영: 벤더 추가 + 새 계정·키. 7장에 과하다.

### 1.4 추천안 — **A (Gemini 3.1 Flash Lite Image)**, 품질이 안 나오면 같은 키로 3.1 Flash Image 로 한 단계 올린다

이유 한 줄: 세 후보 모두 비용은 1달러 미만이라 차이가 없고, **새 벤더·새 키·새 과금·새 예산 코드가 0** 인 것은 A 뿐이다. 브랜드 리스크는 모델이 아니라 "프롬프트에 브랜드명을 넣지 않는다"는 규칙이 막는다.

**이미지를 어디에 둘 것인가** — Supabase Storage 버킷은 지금 0개다(실측). 두 안:
- (권고) 리포 `public/case-art/<slug>.png` 에 커밋. `lib/cases/logo.ts::safeImageUrl` 이 이미 `/`로 시작하는 사이트 내부 경로를 통과시키므로 `logo_url='/case-art/<slug>.png'` 로 끝난다. 코드 0줄, Vercel CDN 자동. 리포가 공개인 건 AI 카테고리 일러스트라 문제 없다.
- (대안) Supabase Storage 공개 버킷 신설. 업로드 코드·버킷 정책이 생긴다. 100장을 넘기 전까지는 불필요.

**사람 승인 루프** — 생성 스크립트는 `drafts/case-art/<slug>.png` 에만 쓴다(무인 루프 커밋 허용 경로 밖이라 사람이 옮긴다). 남헌이 보고 통과시키면 `public/case-art/` 로 옮기고 `case_studies.logo_url` 을 채운다. `logo_url` 은 "사람이 확정한 이미지"(logo.ts 1단계)라 이 순서가 원칙과 맞는다.

**API 키·과금 정리**
- Gemini: AI Studio 키(현재 `GEMINI_API_KEY`), Google Cloud 프로젝트에 결제 연결 시 pay-as-you-go 후불. 이미지 모델은 무료 티어 없음. 일 예산은 `LLM_DAILY_BUDGET_USD`(기본 $5)에 같이 잡힌다.
- OpenAI: 선불 크레딧(최소 $5), 별도 키.
- fal.ai/Replicate: 선불 크레딧, 별도 키. Replicate 는 GPU 초 단위 과금이라 콜드스타트 비용이 붙는다.

**남헌 승인 필요 (3개)**
1. 모델 A 채택 여부 (대안 B/C 중 선호가 있으면 그쪽으로).
2. 저장 위치: 리포 `public/case-art/` (권고) vs Supabase Storage.
3. `GEMINI_API_KEY` 프로젝트가 유료(결제 연결)인지 확인 → 아니면 결제 연결 또는 새 키.

승인 뒤 작업량: 생성 스크립트 + 7장 생성·검수 ≈ 2h. 7건 `logo_url` UPDATE 는 사람 확정값이라 남헌 또는 CEO-STAFF 가 건별 SQL 로.

---

## 2. Threads "즉시발행" 트랙 — 게이트 통과 초안을 승인 1클릭으로 발행

### 2.1 지금 경로 (실측)

- CMO 루프(05:17 KST)가 초안을 `posts.status='pending_review'` 로 스테이징 → `notion-push-digest.mjs` 가 "CMO 발행 대기함" 에 페이지(속성: content_code·케이스명·상태=검토중·생성일·등급·병목, 본문+자기답글 블록) 생성.
- 남헌이 Notion 에서 읽고 **다듬고** Threads 앱에서 **직접 발행** → 21:00 KST `notion-pull-feedback.mjs` 가 채택/보류/수정 여부만 로그 → 매처 크론(`/api/threads/match-posts`)이 발행글을 초안에 붙여 `status='published'` 로 올린다.
- `/dashboard` "발행 전 검수" 의 승인은 `reviewed_at` 만 찍고 상태를 안 바꾼다(발행은 여전히 사람이 앱에서).
- **발행 API 호출 코드는 리포에 0줄**(`threads_publish` 0건). Vercel 의 Threads 토큰은 읽기(매칭·답글·인사이트)에만 쓰인다.
- 정체: `posts` pending_review **26건** · draft 6건 · published **4건**(2026-09-25). 다듬기 단계가 병목이라는 남헌 판단과 숫자가 맞는다.

### 2.2 확인 못 한 것 — 게이트 BP-1~3

지시에 적힌 `claude/07-build-in-public-logic.md` 는 **리포·Cowork 폴더·Notion 어디에도 없다**(파일명·"build in public"·"BP-1" 세 가지로 검색). 리포에 있는 게이트는 다음뿐이다:
- 문체 점검 `checkThreadPost`(대시보드, errors/warns 3그룹)
- 케이스 근거 게이트 CG-1/CG-2(`lib/cases/publish-gate.ts`, 스테이징 시)
- 작가의 `gate_note` 자유 텍스트 + 판정 로그 `log_code`(stage.json)

그래서 아래 설계는 게이트를 **함수 하나(`eligibleForInstantPublish(post)`)로 격리**해 두고, BP-1~3 문서가 나오면 그 안만 바꾸게 한다. 문서가 나올 때까지의 대리 조건 = 문체 점검 errors 0·warns 0 **그리고** CG 통과 **그리고** 등급 A/B. 남헌이 문서 위치를 알려주면 그걸로 교체한다.

### 2.3 원칙과의 충돌 — 먼저 결정해야 한다

`CLAUDE.md §10` 은 "자동 발행 API 사용 안 함(계정 제재 리스크). 사람이 각 플랫폼에 직접 발행" 이고, `§10.2` 사람 판단 예외에 "자동 발행 API" 가 명시돼 있다. 이 트랙은 **사람이 앱에서 버튼을 누를 때만** API 를 부르므로 "무인 자동 발행"은 아니지만, "발행 API 를 부른다"는 점에서 §10 문구와 충돌한다. 따라서 **남헌이 §10 을 아래처럼 개정하는 결정을 먼저 내려야 한다**:

> 자동 발행 금지 = 무인 루프(Actions·크론·서브에이전트)는 발행 API 를 호출하지 않는다(토큰이 그 환경에 없다). **로그인한 사람이 앱에서 누르는 발행 버튼**은 허용한다. 승인 버튼은 항상 사람이 누른다.

구조적 보장은 유지된다: 발행 토큰은 Vercel 런타임(`api_tokens` 테이블, 서버 전용)에만 있고 Actions 환경에는 여전히 없다.

### 2.4 접근안 3개

**A. `/dashboard` "발행 전 검수" 에 "그대로 발행" 버튼 (권고)**
- 게이트 통과(`eligibleForInstantPublish`) 초안에만 버튼이 뜬다. 나머지는 지금처럼 승인/반려만.
- 클릭 → 확인 모달(발행될 본문 원문 그대로 표시 + "수정 없이 이 텍스트가 발행됩니다") → 서버 액션.
- 서버 액션 순서: `requireAllowedUser` → `posts` 행에 `publishing_at` 선점(중복 클릭·이중 발행 방지, 5분 만료) → Threads `POST /{user_id}/threads`(media_type=TEXT, 본문) → 권장 대기 후 `POST /{user_id}/threads_publish` → 응답 id 로 `posts` UPDATE(`status='published'`, `external_id`, `published_at`, `permalink`, `reviewed_*`, `published_via='api'`). 매처가 채우는 필드 세트와 같게 맞춰 성과 수집이 끊기지 않게 한다(교훈: posts.status 를 손으로 바꾸면 성과 수집이 끊긴다).
- 자기답글은 2단계로(같은 액션에서 reply 발행) — 1차 범위는 본문만, 답글은 옵션.
- 실패 처리: 권한 오류 → "토큰에 threads_content_publish 없음, 재인증 필요" 안내. 컨테이너 생성 뒤 publish 실패 → `publishing_at` 해제 + 오류 표시, 상태는 pending_review 유지.
- 파일: `lib/threads/publish.ts`(신규, API 호출 2개) · `app/dashboard/actions.ts`(+publishNow) · 대시보드 버튼/모달 · 마이그 1건(`posts.publishing_at timestamptz`, `posts.published_via text` — 순수 추가, 비파괴) · `lib/cases/instant-gate.ts`(신규, 게이트 격리).
- 장점: 사람이 로그인 세션에서 누른다(§10 구조 보장 유지), 발행 즉시 DB 가 맞는다(매처 대기 없음), 기존 검수 화면 확장이라 새 화면 0.
- 단점: Notion 에서 읽던 남헌이 대시보드로 한 번 넘어와야 한다 → Notion 페이지에 "즉시발행 가능 ✅" 속성 + 대시보드 딥링크를 push-digest 가 같이 써 준다(속성 1개 추가).

**B. Notion 대기함 상태를 "즉시발행" 으로 바꾸면 크론이 발행**
- 사람이 상태만 바꾸고 실제 호출은 크론(Actions)이 한다 → 발행 토큰이 Actions 환경에 들어가야 해서 §10 의 구조적 보장이 깨진다. 실수로 상태를 바꾸면 발행되고, 취소 창이 없다. 반영도 다음 크론까지 지연. **기각.**

**C. Notion 페이지 버튼 → 웹훅 → Vercel 라우트가 즉시 발행**
- 사람이 누르는 건 맞고 즉시성도 있다. 그러나 확인 모달 없이 한 번에 나가고, Notion 웹훅·시크릿 관리가 생기며, 어느 텍스트(Notion 본문 vs DB 본문)를 발행하는지 정의가 필요하다. Notion 자동화 버튼은 플랜 제약도 있다. A 가 안정된 뒤 "Notion 에서도 누르고 싶다" 가 나오면 그때 얹는다. **보류.**

### 2.5 승인 전 확인 사항 (남헌)

1. **§10 정책 개정 승인** — 2.3 의 문구. 이게 없으면 착수 안 한다(§10.2 사람 판단 예외 "자동 발행 API").
2. **토큰 권한** — `api_tokens.scope` 가 NULL 이라 지금 토큰에 `threads_content_publish` 가 있는지 **확인 불가**. 확인 방법: Meta 앱 대시보드(앱 2049792452595674) 권한 탭, 또는 그 스코프를 넣어 재인증. 본인 계정에만 발행하므로 **앱 리뷰(Advanced Access)는 필요 없다** — 외부 계정 발행이 아니다. 자기답글까지 API 로 하려면 `threads_manage_replies` 도 필요.
3. **BP-1~3 문서 위치** — 없으면 2.2 의 대리 조건으로 시작할지.
4. 마이그 2컬럼(`publishing_at`, `published_via`) 추가 — 순수 추가라 §10.2 자체 판단 범위이지만 이 트랙과 같이 승인받는다.

### 2.6 리스크와 상한

- 계정 제재: Threads 공식 상한은 24시간 250건. 이 트랙은 하루 1~2건이고 사람이 누른다. 상한 자체보다 "같은 본문 두 번" 이 위험 → `publishing_at` 선점 + `external_id` UNIQUE 로 막는다.
- 본문 500자 제한(Threads API): `checkThreadPost` 가 길이를 보는지 확인해 게이트에 포함.
- 토큰 만료: 2026-10-25, cron-watchdog 이 이미 감시한다.
- 되돌리기: 발행 자체는 되돌릴 수 없다(삭제는 앱에서 사람이). 그래서 확인 모달에 원문을 그대로 보여 준다.

작업량(승인 뒤): 4~6h(게이트 격리 1h · publish 모듈 1h · 액션·UI 2h · 마이그·셀프테스트 1h).

---

## 3. 이 문서의 승인 요청 요약

- 1번: 모델 A(Gemini 3.1 Flash Lite Image) · 저장은 리포 `public/case-art/` · `GEMINI_API_KEY` 유료 여부 확인.
- 2번: §10 개정 문구 승인 · 토큰 스코프 확인(또는 재인증) · BP-1~3 문서 위치 · 접근안 A.
- 7번(소스칩 필터): 소급 완주 뒤 재위임(현재 87%, SaaS 63%).

출처(가격): [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [GPT Image pricing 2차](https://pricepertoken.com/gpt-image-pricing) · [eesel gpt-image-1-mini](https://www.eesel.ai/blog/gpt-image-1-mini-pricing) · [FLUX 가격 비교](https://pricepertoken.com/image/author/flux) · [Threads posts API](https://developers.facebook.com/docs/threads/posts) · [Threads 앱 리뷰·권한](https://singhamandeep.com/threads-api-app-review-permissions/)
