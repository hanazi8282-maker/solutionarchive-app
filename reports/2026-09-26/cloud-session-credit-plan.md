# 클라우드 세션 크레딧($250, 11/4 PT 만료) 활용안 — 설계 (남헌 결정 1, 2026-09-26)

> 전제(재검증 안 함): 이 크레딧은 **Claude Code 클라우드 세션**에서만 빠진다. GitHub Actions·`claude -p`·Agent SDK 는 해당 없음. 루틴(Routines)·프로젝트(Projects)도 제외(런칭 크레딧 약관 해설). 남은 기간 약 40일.
> 근거 문서: code.claude.com/docs/en/claude-code-on-the-web · /cloud-environments (2026-09-26 열람).

## TL;DR

1. **옮길 수 있는 것은 "결과가 파일·PR 인 작업"뿐이다.** DB 서비스키가 필요한 야간 파이프라인(수집·판정·extract)은 옮기지 않는다 — 클라우드 환경에 서비스키를 넣지 않는 원칙(서브에이전트 DB 경계)을 그대로 지킨다. Pro/Max 의 "API credentials" 기능이 헤더 주입으로 Supabase 를 가릴 수 있는지는 **확인 불가**(첫 세션 실측 전).
2. **가장 실익이 큰 용도는 코딩·조사 백로그를 클라우드 세션에 던지는 것**이다. 지금 CEO-STAFF 세션이 하루 종일 하던 PR 작업(설계→구현→CI→자동머지)이 정확히 그 모양이고, 리포에 이미 자동머지·셀프테스트·봇 push 가 있어 세션이 PR 만 내면 나머지는 돌아간다.
3. **설계 비용은 작다(오늘 이 문서 + 명령 목록).** 남헌이 할 일은 터미널에서 `claude --cloud "<작업>"` 한 줄, 하루 1~3회. 세션당 $3~10 로 잡으면 40일에 30~60세션 — 백로그를 다 태우고도 남는다. 안 쓰면 11/4 에 사라진다. **포기할 이유는 없다.**

## 1. 클라우드 세션이 할 수 있는 것 / 없는 것 (문서 실측)

- 시작: `claude --cloud "작업"` (현재 디렉터리의 GitHub 원격을 현재 브랜치로 클론 — **push 먼저**), claude.ai/code, 데스크톱 앱. 진행 중 세션에 `claude -p "메시지" --cloud <id>` 로 추가 지시.
- 환경: 네트워크 접근 수준(기본 Trusted 허용목록)·환경변수(.env 형식)·셋업 스크립트. Pro/Max 는 "API credentials"(프록시가 나가는 요청에 붙여 주고 Claude 는 키를 못 봄) — **호스트 매칭 방식이라 Supabase REST 헤더(apikey/Authorization)에 되는지 미확인.**
- 산출: 브랜치 push·PR 생성(Claude GitHub App 설치 필요 — 이 리포는 `/web-setup` 또는 앱 설치 중 하나, **미확인**). 리포의 `.claude/commands`·`.claude/agents`·`CLAUDE.md` 를 그대로 읽는다.
- 한계: 레이트리밋은 계정 전체와 공유(병렬 세션은 비례해서 소모). 유휴 시 VM 회수(재개 시 이력 복원). 크레딧 소진 후엔 플랜 한도 사용.

## 2. 옮기지 않는 것 (지금 헤드리스 그대로)

daily-cmo-loop · nightly-review-collect · nightly-relevance · nightly-extract · nightly-discovery · nightly-insight-loop · column-review. 이유 둘: (a) 서비스키·발행 토큰이 필요하다. (b) 스케줄 실행은 루틴이라 크레딧 대상이 아니다. 옮겨도 크레딧이 안 빠진다.

## 3. 옮기거나 새로 만드는 것 — 파일·PR 로 끝나는 작업

리포의 자동머지(필수 체크 build+Vercel, strict)와 봇 push 가 있으니 세션은 **브랜치 + PR 까지만** 하면 된다. DB 반영이 필요한 것은 Actions 쪽 스크립트가 파일을 읽어 넣는다(export→세션→import).

| # | 작업 | 산출물 | 왜 클라우드 세션인가 | 준비물 |
|---|---|---|---|---|
| A | **코딩 백로그**(예: /columns 전/후 diff 뷰, /signals 신호·영향 필터 UI, 소스칩 후속, 즉시발행 첫 실클릭 후 버그) | PR | CI·자동머지·셀프테스트가 이미 있어 세션 산출물이 바로 흡수됨 | 없음 |
| B | **T2 2차 판정(불일치 로그)** — 900행 | `ops/state/relevance-second-opinion-<날짜>.json` + PR | LLM 판정 자체가 세션의 일. DB 는 export/import 로 분리 | export 스크립트(Actions, 30분) + import 스크립트(로그만, 덮어쓰기 없음) |
| C | **근거 재검증 제안서** — fact_check C/D 무브 14건 | `reports/<날짜>/fact-check-proposals.md` | 웹 검색이 필요한 조사. 등급 변경은 사람 몫이라 제안서만 | 무브·근거 export JSON |
| D | **경쟁사 기능 조사 갱신** — 09-23 이후 정지 | `reports/<날짜>/competitor-diff.md` | 웹 조사, 보고만(구현 금지 원칙 그대로) | 없음 |
| E | **VOC 후보 실측 후속** — disquiet 21건 T2 정밀도, Product Hunt(토큰 오면) | 보고서 | 조사 | 토큰(PH) |
| F | **칼럼 스레드 7편 검수·수정본** | `drafts/columns/_review/` | 이미 파일 기반 | 없음 |

권고 순서: **A(즉시 가능) → B → C → D**. E·F 는 남헌 판단.

## 4. 운영 방식 (남헌 손이 드는 것만)

1. 리포 루트에서 `git pull` 뒤 한 줄:
   ```
   claude --cloud "docs/cloud-session-tasks.md 의 작업 A-1 을 수행하라. 끝나면 PR 을 만들고 CI 를 확인하라."
   ```
2. 세션 링크가 출력된다. 결과 PR 은 자동머지 규칙대로 흘러간다(strict 라 update-branch 가 필요하면 세션에게 "브랜치 최신화" 한 줄).
3. 하루 1~3세션. 병렬은 레이트리밋을 나눠 쓰니 2개까지.
4. 크레딧 잔액은 claude.ai 사용량 페이지에서만 보인다 — 세션 3~4개마다 한 번 적어 두면 세션당 단가가 나온다(대장 `claude/agent-sdk-credit-2026-11-05.md`).

## 5. 첫 세션에서 확인할 것 (실측 전엔 모름)
- 이 리포에 Claude GitHub App 이 설치돼 있는지 / `/web-setup` 이 됐는지 → PR 생성 가능 여부.
- 기본 환경의 네트워크 허용목록에 npm·GitHub 가 있는지(있어야 `npm ci`·셀프테스트).
- API credentials 로 Supabase 헤더를 가릴 수 있는지 — 되면 B 의 export/import 없이 세션이 직접 읽기 전용 조회 가능(쓰기는 여전히 금지).

## 6. 결정 요청
1. 이 방식(파일·PR 작업만, 헤드리스는 그대로) 승인 여부.
2. 첫 세션으로 A-1(아래 목록 1번)을 오늘 돌려 볼지.
3. B 의 export/import 스크립트 2개를 만들지(30분, 승인 시 CEO-STAFF 가 PR).

작업 목록 정본: `docs/cloud-session-tasks.md`.
