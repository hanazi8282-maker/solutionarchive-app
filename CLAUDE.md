# CLAUDE.md — 솔루션아카이브 운영 OS (SOLUTION ARCHIVE Internal OS)

> 이 문서는 Claude Code가 이 프로젝트에서 일관되게 작업하기 위한 **프로젝트 헌법**이다.
> 모든 코드 작성·구조 결정·네이밍은 이 문서를 우선 기준으로 삼는다.
> 상태: **v0.1 (기획 확정 단계)** — `## 미확정/확인 필요` 섹션은 작업 전 사용자 확인 필수.

---

## 1. 프로젝트 개요 (Mission)

솔루션아카이브(SOLUTION ARCHIVE)는 여러 크리에이터와 함께 다수 브랜드·상품을 만들어 파는 회사다.
이 프로젝트는 흩어진 사내 운영 업무를 한곳에서 보고·분석·자동화하는 **내부 전용 웹 애플리케이션**이다.

**핵심 목표(이 앱의 진짜 KPI):** "데이터를 본다"가 아니라 **"운영 의사결정에 드는 시간을 줄인다."**
대시보드는 수단일 뿐, 최종 지향점은 *인사이트가 사람을 찾아오게 만드는 것*이다.

---

## 2. 기술 스택 (Tech Stack) — 확정

| 레이어 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | **Next.js (App Router) + TypeScript** | |
| 스타일 | **Tailwind CSS + shadcn/ui** | "간결·세련·고가독성" UI의 기본값 |
| 차트 | **Recharts** | shadcn 차트와 호환 |
| DB / 인증 / 권한 | **Supabase** (Postgres + Auth + RLS) | RBAC를 DB 레벨에서 강제 |
| 로그인 | **Google Workspace SSO** | |
| AI 인사이트/콘텐츠 | **Anthropic API (Claude)** | 데이터 해석·용어 풀이·SNS 초안 생성 |
| 배포 | **Vercel** | 비공개 GitHub 레포 → git push 자동 배포 |
| 정기 작업 | **Vercel Cron / Supabase Edge Functions** | 매일 새벽 데이터 수집, 주간 자동 브리핑 |

**금지/주의:**
- 비밀키(API key, secret)는 절대 클라이언트 코드/레포에 하드코딩하지 않는다. 환경변수 + Supabase Vault.
- 외부 데이터 수집은 **실시간 금지**. 기본 **매일 새벽 1회 배치**. (실시간이 꼭 필요한 모듈만 예외 명시)

---

## 3. 아키텍처 원칙 (Architecture Principles)

### 3.1 공통 분석 파이프라인 (가장 중요한 추상화)
KPI·매출·Unit Economics·크리에이터 세일즈·퍼포먼스 마케팅 모듈은 **모두 같은 5단계 파이프라인**을 공유한다.
모듈마다 따로 만들지 말고, 이 엔진 1개에 **데이터 소스 어댑터 + 시각화 설정**만 다르게 꽂는다.

```
[수집(Adapter)] → [정규화/저장(DB)] → [시각화(Chart)] → [AI 인사이트] → [보고서 추출]
```

- "어려운 용어를 쉽게 풀어주고 개선안을 제시"하는 기능은 이 파이프라인의 **AI 인사이트 레이어**다. 모듈별 중복 구현 금지.
- 새 분석 모듈 추가 비용 = 어댑터 1개 + 시각화 설정. (엔진 재사용)

### 3.2 데이터 소스 연동 = Plan A (직접 연동)
각 플랫폼 공식 API를 **직접** 연동한다. (이지어드민 단일 허브 경유 안 함)
각 소스는 동일한 `SourceAdapter` 인터페이스를 구현한다: `fetch() → normalize() → upsert()`.

### 3.3 민감도(Sensitivity) 모델 — 인앱 제어
- 모든 분석 테이블/주요 필드는 `sensitivity` 등급 컬럼을 가진다: `public | internal | confidential | local_only`.
- 어드민 전용 **`민감도 관리` 패널**에서 등급을 인앱으로 수정 가능.
- 등급이 제어하는 것: (1) 역할별 접근(RLS) (2) 자동 마스킹(예: 원가→원가율 % 변환) (3) 내보내기 허용 여부.
- `local_only`는 v0.1에서 미사용. 향후 "클라우드 절대 불가" 데이터가 확정되면 그 필드만 별도 라우팅(스키마 자리 미리 확보).

### 3.4 인사이트 → 행동 강제
AI 인사이트는 "그렇구나"로 끝나면 안 된다. 인사이트는 **액션 아이템 카드**(담당자·마감)로 전환 가능해야 하고, KPI 모듈과 연결된다.

---

## 4. 데이터 소스 맵 (Data Source Map)

| 소스 | 코드 키 | 수집 방식 | 비고 |
|---|---|---|---|

**원칙:** 자동 소스는 매일 새벽 배치. 수동 소스는 드래그앤드롭 업로드 UI(CSV/XLSX 파서) 제공.

---

## 5. 권한 모델 (RBAC) — 역할 × 브랜드 2차원

| 역할 | 코드 | 매출·원가(민감) | 재고·물류 | KPI·콘텐츠 | 브랜드 범위 |
|---|---|---|---|---|---|
| 슈퍼어드민 | `super_admin` | ✅ 전체 + 민감도 설정 변경 | ✅ | ✅ | 4개 전체 |
| 어드민 | `admin` | ✅ 전체 | ✅ | ✅ | 4개 전체 |
| 팀원(내부) | `member` | 🟡 담당 브랜드만 | ✅ | ✅ | 배정 브랜드 |

- 권한은 **Supabase RLS(행 단위 보안)**로 DB 레벨에서 강제. 화면 숨김 수준이 아니라 데이터 접근 자체를 차단.
- 사용자별 `brand_access[]` 배열로 브랜드 범위 제어.
- 민감 재무(원가 배합비, 순이익 원장)는 `member` 역할에 원천 비노출.

---

## 6. 폴더 구조 (제안)

```
/app                  # Next.js App Router (라우트/페이지)
  /(auth)             # 로그인, SSO 콜백
  /dashboard          # 모듈별 페이지
/lib
  /adapters           # SourceAdapter 구현체 (smartstore.ts, coupang.ts ...)
  /engine             # 공통 분석 파이프라인 (collect/normalize/insight/report)
  /ai                 # Anthropic 호출 래퍼 (insight, content)
  /auth               # SSO, 권한 헬퍼
/components
  /ui                 # shadcn/ui
  /charts             # Recharts 래퍼
/supabase
  /migrations         # 스키마 (sensitivity 컬럼 포함)
  /functions          # Edge Functions (배치 수집, 주간 브리핑)
/docs
  CLAUDE.md           # 이 문서
  /prd                # 모듈별 PRD (phase1-sales.md ...)
```

---

## 7. 코딩 컨벤션

- 언어: TypeScript (strict). 함수형 React 컴포넌트 + Hooks.
- 데이터 페칭: Server Components / Route Handlers 우선. 클라이언트 상태는 최소화.
- 모든 외부 API 호출은 `/lib/adapters`에 격리. 페이지 컴포넌트가 직접 외부 API 호출 금지.
- 에러: 사용자 노출 메시지는 한국어, 로그는 영어. try/catch + 폴백 UI 필수.
- 커밋: Conventional Commits (`feat:`, `fix:`, `chore:`).
- 한 번에 한 모듈씩 **수직 슬라이스**로 완성(수집→DB→차트→AI까지 끝까지) 후 다음으로.

---

## 8. 도메인 용어집 (Glossary)

- **시딩(seeding):** 크리에이터에게 제품을 제공해 콘텐츠/판매를 유도하는 활동.
- **Unit Economics:** 제품 1단위의 원가율·비용 비중 구조.
- **ROAS:** 광고비 대비 매출. 퍼포먼스 마케팅 핵심 지표.
- **찐팬 / 영향력:** 크리에이터 이코노미 맥락의 충성 팬층·도달 영향력.
- **writing-protocol:** 브랜드별 콘텐츠 톤·문체 규칙 문서. SNS 엔진의 품질 연료. (Agent Skill로 재사용 가능)

---

## 9. 로드맵 (Phase)

- **Phase 0 — 뼈대:** SSO 로그인 + RBAC + 좌측 네비 + 빈 대시보드 레이아웃 + 민감도 스키마.
- **Phase 1 — 매출 + KPI:** 공통 분석 엔진을 여기서 완성. KPI는 Notion/Sheets 읽기 연동.
- **Phase 2 — Unit Eco + 크리에이터 ROI + 퍼포먼스 마케팅:** 엔진에 어댑터 추가(저비용).
- **Phase 3 — 재고 통합 + 물류 양식 변환:** 운영 도메인.
- **Phase 4 — SNS 콘텐츠 엔진:** 발행 직전 완성본까지 + 인앱 편집기 + 복사/내보내기. (자동발행 안 함)

---

## 10. SNS 콘텐츠 엔진 규칙 (Phase 4)

- 입력: 키워드 + 브랜드 + 채널(블로그/스레드/인스타).
- 처리: 브랜드별 `writing-protocol` 기반 AI 초안 생성 → **누구나 인앱 편집 가능**.
- 출력: "복사" 또는 "이미지 내보내기" → 사람이 각 플랫폼에 직접 발행.
- **자동 발행 API 사용 안 함** (계정 제재 리스크 회피). 사람 최종 검수 필수.

---

## 12. 미확정 / 확인 필요 (작업 전 사용자 확인)

- [ ] "외부 절대 불가" 데이터의 구체 목록 (정해지면 `local_only` 라우팅 설계).
- [ ] KPI/운영 자료가 Notion인지 Google Sheets인지, 각 위치·구조.
- [ ] "보고서 추출"의 수신자/포맷 (투자자용 PDF? 내부 회고용?).
