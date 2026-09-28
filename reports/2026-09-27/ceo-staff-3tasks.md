# CEO-STAFF 세션 — 남헌 확정 지시 3건 처리 (2026-09-27)

> 표기 규약: **[직접 실행 확인]** = 이 세션이 실제로 돌려 결과를 읽었다. **[코드만 확인]** = 파일을 읽어 판단했고 실행은 안 했다.
> **[막힘]** = 실행하려 했으나 자동모드 분류기가 거부해 남헌이 직접 해야 한다.

## TL;DR

1. 크론 실패 2건은 **같은 원인 하나** — 09-25 만든 main 룰셋이 봇의 `git push` 를 막는다. 수집·풀백 자체는 성공했고 커밋만 못 했다. 자격증명·토큰 문제 아님. 고치는 패치(3 워크플로에 "Mint bot token" 스텝 복사)는 **분류기가 워크플로 편집을 거부해 남헌 몫**.
2. Gemini→Claude 전환 확대는 **할 일이 없다** — 칼럼·스레드 작성 엔진은 이미 전부 claude-cli 다. Gemini 는 분석층(extract·remedy·angle)에만 남아 있고 이건 이번 지시 범위 밖. 카드 이미지 생성은 코드에 아직 없다(09-25 설계 리포트만).
3. 미연결 Threads 게시물 4건은 **등록 완료** — `published_via='external'` 로 posts 4행 적재, 매처 즉시 재실행 결과 미연결 4 → 0.

## 1. 크론 실패 2건 — 원인·조치

**원인 [직접 실행 확인]** — Actions 로그 두 건 모두 마지막 `git push` 에서 동일 거부:
`GH013: Repository rule violations … 2 of 2 required status checks are expected` (main-protection 룰셋, 필수 체크 build·Vercel).

- hn-failure-signal 09-26 16:11 UTC: 스윕 정상(구문 9개·hit 2건·신규 1건 HN 49838329) → 커밋 생성 → push 거부.
- nightly-notion-feedback 09-26 12:07 UTC: 풀백 정상("편집됨 2 · 확인불가 0 · DB갱신실패 0") → `reports/2026-09-26/notion-feedback-log.md` 커밋 → push 거부.
- 09-25 실패도 같은 시각대·같은 단계. 룰셋이 09-25 생성됐으니 2일 연속은 당연하다.
- Cron Watchdog 의 09-26 "failure" 2건은 **설계된 종료코드 1**(이상 감지 시)이라 세 번째 장애가 아니다. Notion 행 `2026-09-27-CTO-2` 도 정상 기록됐다.

**왜 daily-cmo-loop 는 멀쩡한가 [코드만 확인]** — 09-25 B안으로 넣은 `Mint bot token`(전용 GitHub App, `BOT_APP_ID`/`BOT_APP_PRIVATE_KEY` 시크릿 존재 확인)이 daily-cmo-loop·transferability-digest·column-review 세 곳에만 들어갔고, **hn-failure-signal·nightly-notion-feedback·hn-firebase-c-probe 세 곳은 빠졌다.** 09-25·26 daily-cmo-loop 는 success.

**조치 [막힘]** — 위 3개 파일의 `- uses: actions/checkout@v4` 를 daily-cmo-loop.yml 61~73행 블록(Mint bot token + `token: ${{ steps.bot.outputs.token || github.token }}` 붙인 checkout)으로 바꾸면 끝이다. 분류기가 워크플로 파일 쓰기를 거부해 이 세션은 적용하지 못했다. 재실행은 패치 머지 뒤에 해야 의미가 있다(지금 재실행하면 똑같이 push 에서 죽는다). 유실된 산출물은 재실행이 다시 만든다(HN 후보는 파일 대조로 재추가, Notion 풀백 로그는 날짜 파일 재생성).

**자격증명 점검 [직접 실행 확인]**
- Notion API: 풀백이 "확인불가 0" 으로 완주했으니 토큰 정상.
- Threads 토큰: `api_tokens` 만료 **2026-10-25 13:42 UTC**(28일 남음, 마지막 갱신 08-26). 자동 갱신선(7일)까지 3주 여유. Watchdog 도 토큰 이상 0건.

## 2. Gemini→Claude 전환 범위 확대 — 인벤토리 결과

**결론: 전환할 것이 없다 [코드만 확인, 전 워크플로 18개 grep]**

- Threads 초안 작성: `daily-cmo-loop.yml` → `scripts/cmo-daily.mjs` → `lib/insight/claude-cli.ts` (`claude -p`, OAuth). Gemini import 0.
- 칼럼 초안·전수검수: `column-review.yml` `LLM_PROVIDER: claude-cli`, `nightly-insight-loop.yml` `INSIGHT_LLM_PROVIDER` 기본 claude-cli. Gemini 는 `ANTHROPIC_API_KEY` 폴백조차 아니다.
- T2 관련성 판정: 지시대로 변경 없음(PR #289, `RELEVANCE_LLM_PROVIDER` 되돌리기 변수 유지). 09-29 비교 리포트 뒤 보고.
- **Gemini 가 실제로 남은 곳** — `nightly-extract.yml`(속성 추출, `GEMINI_API_KEY`) · `scripts/remedy-judge.mjs`(수동) · `/api/analyze/angle`·`/api/analyze/extract`(대시보드 호출). 전부 `lib/analysis/llm.ts` 의 `LLM_PROVIDER` 스위치를 이미 타므로 전환하려면 워크플로 env 2줄이면 된다. 다만 이번 지시 범위(관련성·칼럼·스레드) 밖이라 손대지 않았다.
- 카드 이미지 생성(Gemini 유지 예외): 코드에 이미지 생성 호출 없음. `reports/2026-09-25/design-ai-card-art-and-instant-publish.md` 설계 단계. 예외 조항은 구현 때 적용하면 된다.
- 따라서 품질 자체검증(길이 비율·톤)은 대상이 없어 하지 않았다.

## 3. Threads 미연결 게시물 4건 — 등록 완료

**대상 [직접 실행 확인, GET /me/threads]** — 09-23 16:37 / 09-24 11:45 / 09-25 00:00 / 09-25 09:18 UTC, 전부 "AI 로 SaaS 만들기" 빌드인퍼블릭 글. 매처 기록도 4건 모두 `manual_link`(유사도 0.08~0.10, 초안과 무관).

**구현 [직접 실행 확인]** — 새 컬럼 대신 **이미 있던 `posts.published_via`** 에 값 하나를 더했다.
- `20260930000021` — CHECK 를 `instant·manual` → `+external` 로 넓힘(DROP→ADD, 비파괴, 롤백 파일).
- `20260930000022` — 4행 INSERT(`status=published`, `external_id`·`permalink`·`published_at` 발행본 그대로, `topic_tag='빌드인퍼블릭'`, `ON CONFLICT DO NOTHING`). 롤백 = 그 4행만 DELETE.
- 4조건: 드라이런(트랜잭션 ROLLBACK 으로 4행/46행 확인 뒤 잔존 0) ✅ · 롤백 파일 ✅ · 무중단(INSERT 만) ✅ · Notion 로그 → §11 행에 함께 기록(아래 리스크 참조).
- 양성: 4행 적재, channel 귀속 O. 매처 1회 즉시 실행 → `threads_unlinked` **unlinked 4 → 0**, threads_checked 6.
- 음성 **[막힘]**: 잘못된 값('auto') 삽입 거부 테스트는 분류기가 프로덕션 쓰기로 거부. 제약 정의 텍스트로만 확인.
- 되돌리기: 000022 롤백 → 000021 롤백 순서(역순 필수, 파일 머리에 적어 둠).

**통계 반영 [코드만 확인]**
- 성과 수집(`collect-metrics`·`collect-replies`)은 `status=published` + `external_id` 로 고르므로 이 4건도 다음 시각부터 조회수·답글이 쌓인다.
- 인사이트 루프 `ingest_edits` 는 `content_code` 없는 행을 조용히 건너뛴다(에러 아님).
- **정정** — 지시문의 "랜딩 소스칩"은 `/signals` 의 VOC 소스 칩이라 posts 와 무관하다. "빌드인퍼블릭 카운트"도 현재 코드에 topic_tag 를 세는 화면이 없다. 즉 이 4건이 들어가서 바뀌는 숫자는 대시보드 발행 목록·성과 수집·미연결 경고뿐이다.

## 결정 필요 (남헌)

- **Q1. 워크플로 패치 적용** — 위 3개 파일 편집·머지를 남헌이 직접 하거나, 이 세션에 워크플로 편집 권한 규칙을 열어 주거나. 권고: 직접 적용(5분). 머지 후 두 워크플로 `workflow_dispatch` 재실행.
- **Q2. 분석층 Gemini 잔존(extract·remedy·angle) 도 claude-cli 로 갈지** — A) 지금 전환(env 2줄, 09-29 T2 리포트 전에 데이터가 섞임) / B) 09-29 T2 비교 리포트 보고 한꺼번에 결정. 권고 B.
- **Q3. 대시보드 "사후 기록" 폼(`createPost`)에 external_id·permalink·published_via 입력 추가** — 다음에 또 밖에서 쓴 글이 생기면 마이그레이션 없이 화면에서 등록되게. 권고: CTO 에 위임, 30분짜리.

## 개선안

- 룰셋 bypass 가 필요한 워크플로가 6개인데 블록을 각자 복사해 쓰니 빠뜨렸다. `cron-watchdog` 에 "`git push` 하는 워크플로 중 `create-github-app-token` 없는 파일" 정적 검사 한 줄을 넣으면 같은 구멍이 다시 안 생긴다.
- `published_via='external'` 행은 `content_code` 가 없어 학습 루프(edit-pairs)에서 빠진다. 외부 글도 배우고 싶으면 초안 없이 발행본만으로 쓰는 별도 경로가 필요하다 — 지금은 안 만들었다(YAGNI).

## 리스크·확인 못 한 것

- Notion "일일 상태 로그" 행: 로컬에 `NOTION_API_TOKEN` 없고 Notion MCP 는 OAuth 미인증이라 이 세션에서 못 쓴다. `ops/state/status-log-pending/2026-09-27-기타.md` 에 남겼다 — **다음 세션이 올려야 한다.**
- 워크플로 패치 전까지 hn-failure-signal·nightly-notion-feedback 은 매일 같은 실패를 낸다(수집은 되고 커밋만 유실).
