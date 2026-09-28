# Claude Code 킥오프 가이드 — 두더지웍스 운영 OS (Antigravity 환경)

> 너는 이미 `CLAUDE.md`를 만들었다. 이 문서는 *그 다음부터* 무엇을, 어떤 순서로 할지의 실행 대본이다.
> 원칙: **한 번에 다 만들지 말고, '돌아가는 작은 조각'을 하나씩 완성 → 검증 → 커밋 → 다음.** (수직 슬라이스)

---

## 0. 프로젝트에 들어갈 문서 4개 (먼저 배치)

```
프로젝트루트/
├── CLAUDE.md                      ← 루트에 둬야 Claude Code가 자동 인식
└── docs/
    ├── PRD-phase1-sales-kpi.md
    ├── seed-strategy-kpi.md
    └── report-diagnostic-format.md
```

---

## 1. 선행 준비물 (코딩 전, 약 30분) — 이게 없으면 Claude Code가 헛돈다

| 준비물 | 어디서 | 비고 |
|---|---|---|
| Node.js 20 LTS | nodejs.org | `node -v`로 확인 |
| 비공개 GitHub 레포 | github.com | 코드 외부 노출 방지 |
| Supabase 프로젝트 | supabase.com | Project URL · anon key · **service_role key**(비밀) 복사 |
| Anthropic API Key | console.anthropic.com | 진단 보고서 AI 레이어용 |
| Vercel 계정 | vercel.com | GitHub 연결(배포는 나중) |
| Google OAuth | Google Cloud Console | Workspace SSO용. **Phase 0에선 생략 가능**, 인증 붙일 때 설정 |

**환경변수** — 프로젝트 루트에 `.env.local` 생성(절대 커밋 금지, `.gitignore`에 포함):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # 서버 전용, 클라이언트 노출 금지
ANTHROPIC_API_KEY=...
```

---

## 2. Antigravity에서 Claude Code 켜기

1. Antigravity에서 프로젝트 폴더 열기 (`File > Open Folder`).
2. **Claude Code 확장팩** 설치(미설치 시) → 통합 터미널 실행.
3. 터미널에서 프로젝트 루트인지 확인 후 `claude` 실행 → Claude Max 또는 API Key로 인증.
4. Claude Code는 루트의 `CLAUDE.md`를 자동으로 읽는다. (별도 /init 불필요 — 이미 있음)
5. **터미널 실행 정책은 처음엔 '승인 필요' 모드 권장** — 무슨 명령을 도는지 보면서 진행. 익숙해지면 완화.
6. 코드 검토는 Antigravity **Editor**의 diff로, 앱 미리보기는 **Browser**로.

---

## 3. 복붙용 프롬프트 시퀀스 (순서대로 하나씩)

### ▶ 프롬프트 1 — 스캐폴드 (돌아가는 빈 껍데기)
```
docs/의 CLAUDE.md, PRD-phase1-sales-kpi.md, seed-strategy-kpi.md, report-diagnostic-format.md를 먼저 모두 읽어라.
그 다음, 모듈 구현은 하지 말고 프로젝트 뼈대만 세워라:
- Next.js(App Router) + TypeScript + Tailwind + shadcn/ui 초기화
- CLAUDE.md §6 폴더 구조 생성 (/lib/adapters, /lib/engine, /lib/ai, /components/charts 등 빈 디렉토리 + README 주석)
- Supabase 클라이언트 설정(/lib/auth, /lib/supabase), .env.example 생성
- 좌측 네비 + 빈 대시보드 레이아웃(KPI / 매출 / 보고서 메뉴 placeholder)
- 비밀키 하드코딩 금지, 환경변수만 사용
끝나면 `npm run dev`로 로컬 실행되는지 확인하는 방법을 알려주고 멈춰라. 모듈은 아직.
```
**→ 체크포인트:** `npm run dev` → 브라우저에서 빈 대시보드가 뜨면 성공. → **커밋.**

### ▶ 프롬프트 2 — Supabase 스키마 + 시드
```
PRD §1.1·§2.2와 seed-strategy-kpi.md를 기준으로 Supabase 마이그레이션을 작성하라:
- 테이블: strategy_map, weekly_kpi, sales_fact, ad_performance
- 모든 분석 테이블에 sensitivity 컬럼(public/internal/confidential) 포함 (CLAUDE.md §3.3)
- sales_fact에는 자동 gross_revenue 외에 operating_profit(수동 입력) 컬럼 추가
- seed-strategy-kpi.md의 전략맵·주간KPI 데이터를 시드로 삽입(미정 슬롯은 빈칸 유지)
- 달성률 계산: 정량 clamp(현재/목표,0,1.5), 정성 0/25/75/100 + is_delayed 플래그
마이그레이션 적용 후, Supabase 대시보드에서 데이터가 들어갔는지 확인하는 방법을 알려줘라.
```
**→ 체크포인트:** Supabase 테이블에 네 KPI/전략 데이터가 보이면 성공. → **커밋.**

### ▶ 프롬프트 3 — KPI 모듈 (첫 진짜 기능)
```
PRD §1을 구현하라:
- 공통 분석 엔진(/lib/engine)에 KPI 달성률 집계 로직(개인별/브랜드별/주차별/전사)
- KPI 대시보드: 전사 게이지 + 개인별 막대 + 지연 플래그 리스트 (Recharts)
- 정량/정성 분기 표시, 달성률 < 70% 또는 지연 항목 자동 하이라이트
- 입력은 일단 Supabase 시드 데이터를 사용. (노션/마크다운 import는 다음 단계)
shadcn/ui로 간결·세련된 UI. 끝나면 Antigravity Browser로 확인할 경로를 알려줘라.
```
**→ 체크포인트:** Browser에서 달성률 차트가 실제 데이터로 뜨면 성공. → **커밋.**

### ▶ 프롬프트 4 — 진단 보고서 + 입출력
```
report-diagnostic-format.md를 출력 템플릿으로 삼아 진단 보고서 기능을 구현하라:
- /lib/ai에 Anthropic API 래퍼. C섹션 3단계 로직(규칙 후보추출→brand+channel 인과연결→AI 서술)
- 보고서 뷰: B섹션 5블록(TL;DR/스코어보드/병목진단/개선방안/선행지표) 카드형
- 입력(import): 마크다운 시드 업로드 + 노션 API 읽기 어댑터(/lib/adapters/notion.ts)
- 출력(export): 보고서 화면 + 'CSV 내보내기' 버튼(집계 데이터 CSV 다운로드)
ANTHROPIC_API_KEY는 서버 라우트에서만 사용, 클라이언트 노출 금지.
```
**→ 체크포인트:** 보고서가 5블록으로 생성되고 CSV 다운로드가 되면 성공. → **커밋.**

### ▶ 프롬프트 5 — 배포 (팀 공유)
```
Vercel 배포를 준비하라:
- 환경변수를 Vercel 프로젝트 설정에 등록하는 절차 안내
- 빌드 에러 점검 후 프로덕션 빌드 통과 확인
- (다음) Google Workspace SSO(@dothegy.org 도메인 화이트리스트)와 Supabase RLS 권한 적용 계획
```
**→ 체크포인트:** Vercel URL로 팀원이 접속 가능. (SSO/권한은 그 다음 라운드)

---

## 4. 매 단계 공통 리듬

1. 프롬프트 1개 실행 → 2. Antigravity Editor에서 diff 검토 → 3. Browser/터미널로 동작 확인 →
4. 안 되면 에러를 그대로 Claude Code에 붙여넣어 수정(핑퐁) → 5. 되면 `git commit` →
6. (선택) 왜 이렇게 짰는지 ADR 1장 요청(`/docs/decisions/`) → 7. 다음 프롬프트.

**중요:** 한 프롬프트가 너무 많은 걸 하려 하면 끊어라. "이번엔 KPI 화면만." 작게 갈수록 디버깅이 쉽다.

---

## 5. Antigravity 특이사항 팁

- **이도류 가능하나 일관성 우선:** Gemini로 기획, Claude Code로 구현하는 방식이 있지만, 우리는 CLAUDE.md 기반이라 **구현은 Claude Code로 일관**하는 게 컨텍스트가 안 깨진다.
- **승인 모드:** 초반엔 터미널 명령마다 승인하며 무엇을 도는지 학습. `rm`·`db push` 같은 파괴적 명령은 항상 직접 확인.
- **비밀키:** Claude Code가 .env를 만들거나 키를 코드에 넣으려 하면 막아라. 키는 네 손으로 .env.local과 Vercel에만.
- **컨텍스트 관리:** 세션이 길어지면 Claude Code에 "지금까지 한 일 요약하고 CLAUDE.md 기준 점검"을 주기적으로 시켜 드리프트 방지.
```
