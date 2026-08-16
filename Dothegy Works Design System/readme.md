# 두더지웍스 운영 OS — Design System

A design system for **Dothegy Works (두더지웍스)** — the internal **운영 OS (Operations OS)**: a single
control plane a small bakery/food-manufacturing company uses to run KPIs, sales, inventory across
multiple locations, a factory production calendar, diagnostic reports, and team administration.

It is a data-dense, no-nonsense **B2B operational dashboard**, not a marketing site. Every screen exists
to answer "how are we doing, and what's about to break?" — achievement gauges, stock-out predictions,
production-conflict warnings, channel revenue.

---

## Sources

This system was built from a **detailed written feature spec** (the 전체 기능 명세서) describing every
screen, control, and interaction, plus a set of **reference dashboard screenshots** used only to
establish the genre's visual conventions.

| Source | What it is | Access notes |
|---|---|---|
| Live product | `https://dothegy-os.vercel.app` | Public deploy. Not directly imported. |
| Tech stack | Next.js · Tailwind · **shadcn/ui** · Supabase · Recharts | The system mirrors shadcn/Tailwind conventions because that is the real build. |
| Feature spec | `두더지웍스 운영 OS — 전체 기능 명세서` + `uploads/app-design-spec.md` (v1.0) | Pasted/attached in full; the canonical source of truth for screens/flows. The v1.0 doc adds an explicit §7 design-improvement brief. |
| Reference shots | `uploads/*.webp` (Baremetrics, monday.com, Toggl, tray.io, time-trackers) | **Inspiration only** — generic dashboard layouts, *not* the Dothegy product itself. |

> ⚠️ No codebase or Figma file was attached. Components are recreated faithfully from the spec and
> shadcn/ui conventions, not imported from source. If the real repo or a Figma becomes available,
> re-attach it and these can be tightened to pixel-match.

### The company & its brands
Dothegy Works manufactures and sells baked goods. Four brands run through the OS:
**리틀도르 (Little Dore)**, **퍼스트라이트 (First Light)**, **스틸인프로그레스 (Still in Progress)**, **역전비결**.
Products are bakery SKUs — **티그레 (Tigré)**, **쿠키 (cookies)**, **파운드케이크 (pound cake)** — sold as
loose units and as gift **세트** (e.g. 티그레 6구 세트), stocked across four locations
(3PL창고 · 공장 · 여의도 · 대구).

### Surfaces in the product
KPI 대시보드 · 매출 대시보드 · 진단 보고서 · 팀원 관리 · 재고 현황 · 재고 타임라인 · 공장 스케줄 캘린더.

### Design brief (spec §7 — addressed in this system)
The v1.0 spec flags concrete problems we designed against: (1) **density imbalance** — KPI airy vs. tables
cramped; (2) **status-color inconsistency** — solved by one semantic token set used everywhere; (3) **no
mobile responsiveness** — solved with a drawer + topbar shell at ≤880px; (4) **no empty-state design** —
solved with the `EmptyState` component; (5) **unclear nav hierarchy** — solved with grouped nav + a
connector-lined 재고 타임라인 sub-item. The requested **dark mode** ships as a `[data-theme="dark"]` token scope.

---

## Content Fundamentals

**Language.** Korean-first. All UI copy, labels, nav, and headings are in Korean; English appears only
for the wordmark (`DOTHEGY WORKS`), technical nouns (KPI, CSV, API, Supabase, Slack), and brand names.

**Voice — terse, operational, declarative.** Labels are nouns or short noun-phrases (`재고 현황`,
`지연 항목`, `전사 종합 달성률`). It states facts and counts, never markets. No exclamation marks except in
celebratory empty-states. No "you/we" — the product addresses *data*, not a person. Korean register is
the plain/formal hybrid typical of internal tools: `~하세요`, `~됩니다`, `~필요` rather than casual speech.

**Page headers** are a two-line pattern everywhere: a bold title + a thin gray subtitle that scopes it.
- `KPI 대시보드` / `전사 KPI 달성률 현황`
- `매출 대시보드` / `전 채널 × 브랜드 통합 매출 현황`
- `진단 보고서` / `문제 → 병목 → 개선안 · 5블록 고정 포맷`
- `팀원 관리` / `super_admin 전용 — 역할 배정 및 브랜드 접근 제어`

**Empty & status states are written, not blank.** They tell you what to do or confirm all-clear:
- `데이터 없음 — Supabase 환경변수를 설정하고 시드를 실행하세요.`
- `이번 주 지연 항목 없음 ✓`
- `31일 내 품절 없음 ✓`
- `수집 후 차트가 표시됩니다`

**Buttons** are bracketed verb/icon phrases in the spec and short imperatives in UI:
`지금 수집`, `Claude 프롬프트 생성`, `전체 복사` → on success flips to `복사됨 ✓`, `+ 입출고 기록`,
`+ 일정 추가`, `적용`, `저장`, `삭제`. Disabled actions name their unblock condition inline:
`수정 (Auth 연결 후)`, `+ 팀원 초대 (Supabase Auth 연결 후)`.

**Emoji** are used sparingly and only as **functional status glyphs**, never decoration:
🚩 (지연/병목), 🚨 (품절 위험 알림), 🟡/🔴/🟢 (상태 신호), ✓ (all-clear), ⚠️ (충돌 경고),
📋📅📊📈📦🏭👥 (nav/section markers). They read as iconography, not personality.

**Numbers** are the hero content. Korean number formatting: thousands separators + `원` suffix
(`2,724,585원`), `만원` axis units, percentages (`38%`), counts (`N개`, `N건`), dates as `YYYY-MM-DD`,
`MM/DD`, or `YYYY년 M월`. Tabular figures throughout.

---

## Visual Foundations

**Overall vibe.** Clean, dense, neutral, trustworthy — a shadcn/Tailwind dashboard. White cards float on
a near-white slate canvas, separated by hairline borders and the faintest shadow. Color is *rationed*:
the UI is 95% slate-and-white, and saturated color appears **only to carry meaning** (status, role, task
type, the one blue CTA). This restraint is the brand's whole personality — color = signal.

**Color.**
- **Neutrals:** Tailwind *slate* ramp (`--slate-50…950`). Canvas `--slate-50`, cards white, text
  `--slate-900/700/500`, borders `--slate-200`.
- **Action:** a single **blue** (`--blue-600`) for prominent CTAs (`지금 수집`, `프롬프트 생성`). The default
  shadcn neutral button is near-black (`--slate-900`).
- **Status semantics (exact spec values):** red `#EF4444` (지연·품절위험·0–69%), amber `#F59E0B`
  (주의·70–99%), emerald `#10B981` (정상·완료·100%+), blue `#3B82F6` (info·생산). Used as solid fills on
  bars/gauges and as soft tint backgrounds (`-bg`/`-border` aliases) on badges & banners.
- **Domain palettes:** roles → 슈퍼어드민 violet / 어드민 blue / 팀원 gray. Factory tasks → 생산 blue ·
  공정 gray · R&D violet · 포장 emerald · 휴지 amber · 기타 orange.

**Type.** **Pretendard** for all UI (Korean + Latin + numerals — clean neutral grotesque, the Korean
product-font standard). **JetBrains Mono** for IDs/code (e.g. the Claude prompt textarea). Hierarchy:
page title 24/bold → section 20/semibold → body 14/regular → label 12/medium → sidebar caps 11/semibold
tracked. Big KPI numbers go to 32/bold tabular. Letter-spacing is tight on display numbers, wide on
uppercase section labels.

**Spacing & layout.** 4px base grid. Fixed **236px dark sidebar**, fluid light content with 32px gutters
and a ~1440px max. Cards pad 20px. Rows are ≥44px. Generous whitespace *between* cards, tight density
*within* tables.

**Backgrounds.** Flat solid fills only — **no gradients, no imagery, no textures, no patterns**. The
canvas is `--slate-50`; cards are pure white; the sidebar is `--slate-900`. Color blocks (banners,
badges) are flat soft tints. This is deliberately image-free product chrome.

**Dark mode.** Ships as a `[data-theme="dark"]` scope in `tokens/colors.css` that re-points only the
semantic aliases — raw ramps and brand/status/role/task hues stay identical so signal colors read
consistently. Canvas drops to `#0a0f1d`, cards to `--slate-900`, the sidebar one step darker; hairline
borders become low-alpha white; status tints become translucent overlays (not the light `-50` washes,
which glow on dark); the neutral button inverts to light-on-dark. Toggle by setting the attribute on
`<html>` (the 운영 OS kit does this from its sidebar toggle and persists to localStorage).

**Corner radii.** Moderate, consistent: inputs/buttons 6px, cards/panels 8px, modals 12px, badges 4px,
pills/avatars/progress tracks fully round. Nothing sharp, nothing bubbly.

**Cards.** White fill + `1px solid --slate-200` border + `--shadow-sm` (a near-invisible lift). The
border does the separation work; the shadow only hints at elevation. Modals step up to `--shadow-lg`.
No colored left-border accent cards. No heavy drop shadows.

**Borders & dividers.** Hairline `--slate-200` everywhere — table row separators, card outlines, input
outlines, section rules. `--slate-300` for slightly stronger emphasis (e.g. input hover).

**Shadows.** A tight 4-step scale, all cool/neutral (slate-tinted, never warm). `xs`→`sm` for cards,
`md` for popovers/dropdowns, `lg` for dialogs. Focus is a 3px blue ring (`--shadow-focus`), never a
glow.

**Hover / press.**
- Neutral buttons darken one slate step on hover (`900→800`); blue CTAs `600→700`.
- Ghost/menu items get a faint wash (`--sidebar-hover-bg` on dark, `--slate-100` on light).
- Rows highlight to `--slate-50` on hover.
- Press = slightly darker fill (no scale/bounce). Links underline on hover.

**Motion.** Functional and quick — 120–260ms, `ease-standard`/`ease-out`. Fades and small slides for
popovers/modals/banners; progress bars animate width; **no bounces, no decorative looping animation**.
The dashboard should feel instant, not playful.

**Transparency & blur.** Minimal. Sidebar hover uses a low-alpha white wash; modal scrims are a
semi-transparent slate. No glassmorphism / backdrop-blur as a primary style.

**Charts (Recharts).** Donut, horizontal-bar, and line charts. Bars/segments are colored by the same
status logic (red/amber/emerald by achievement). Gridlines are faint slate, axis labels are
`--text-muted` 12px, tooltips are white cards with `--shadow-md`.

---

## Iconography

The product uses **two complementary icon registers**:

1. **Outline line-icons (primary, structural).** The real app is shadcn/ui + Tailwind, whose canonical
   icon set is **[Lucide](https://lucide.dev)** — 1.5–2px stroke, 24px grid, rounded joints. This
   system loads Lucide from CDN and uses it for all structural UI: nav, buttons, table actions, form
   field affordances, chevrons, arrows, settings gear, search, calendar, package, factory, users, etc.
   *Substitution flag:* the spec illustrates nav with **emoji** (📊📈📋📦🏭👥). We render those nav slots
   with the matching **Lucide** glyphs (`bar-chart-3`, `trending-up`, `clipboard-list`, `package`,
   `factory`, `users`, `calendar`) for a production-grade look, and keep emoji only where the spec uses
   them as *status* signals. If you'd rather keep literal emoji nav, that's a one-line swap.

2. **Emoji status glyphs (semantic, sparingly).** 🚩 🚨 ⚠️ ✓ 🟡🔴🟢 are used exactly as the spec
   prescribes — to flag delays, stock-out risk, conflicts, all-clear, and traffic-light states. These
   are content, not chrome.

No custom SVG illustration, no icon font of our own, no 3D/raster icons. Charts come from Recharts.
Avatars are circular initials or photos.

---

## Index — what's in this system

**Foundations / global**
- `styles.css` — the entry point consumers link (import-only).
- `tokens/colors.css` · `typography.css` · `spacing.css` · `fonts.css` · `base.css` — all design tokens.
- `guidelines/*.html` — specimen cards (Type, Colors, Spacing) shown in the Design System tab.

**Components** (`components/<group>/` — `window.DothegyWorksDesignSystem_cddc62.<Name>`)
- `core/` — Button, Badge, Card, ProgressBar, StatGauge
- `forms/` — Input, Select, Switch
- `data/` — DataTable, RoleBadge, StatusBadge
- `feedback/` — EmptyState (no-data surfaces with guidance)
- (see each directory's `.prompt.md` for usage)

**UI Kits** (`ui_kits/<surface>/index.html`)
- `operations_os/` — interactive, **responsive, light/dark** recreation of all 7 운영 OS surfaces: shell
  (desktop sidebar + mobile drawer/topbar), KPI · 매출 · 진단 보고서 (Claude prompt modal) · 재고 현황 (입출고
  modal) · 재고 타임라인 (31-day prediction) · 공장 스케줄 (task-bar calendar) · 팀원 관리, with empty states.
- `marketing_site/` — Korean marketing homepage for the product (hero with live dashboard mock, feature
  grid, 31-day stock-prediction spotlight, automation, CTA).

**Skill**
- `SKILL.md` — makes this folder usable as a downloadable Claude Agent Skill.

---

*This document is the source of truth for tone, color, and visual rules. When in doubt: less color, more
hairline borders, real Korean operational copy.*
