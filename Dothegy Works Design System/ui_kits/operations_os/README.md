# UI Kit — 운영 OS (Operations OS)

An interactive, high-fidelity recreation of the Dothegy Works 운영 OS dashboard. Open `index.html`.

Built directly against the feature spec (`uploads/app-design-spec.md`) and §7 design-improvement brief:
density balance, **unified status colors**, **mobile responsiveness**, **empty-state design**, clearer
nav hierarchy, and **dark mode** — all on the shadcn/ui component foundation.

## What it covers (all 7 product surfaces)
- **App shell** — responsive: a fixed dark sidebar on desktop, a slide-in **drawer + topbar** with a
  hamburger on ≤880px. Grouped nav (운영 / 재고·생산 / 관리), the 재고 타임라인 sub-item drawn with a
  connector line to clarify hierarchy, a **light/dark theme toggle** (persisted to localStorage), and the
  version footer.
- **KPI 대시보드** — week dropdown, 전사 종합 달성률 gauge, 개인별 달성률 bars (achievement-coloured), 지연 항목 list.
- **매출 대시보드** — `지금 수집` CTA → result banner; period/unit segmented controls; channel cards; 메타 광고
  미연동 row; 총매출 추이 line chart that shows an **EmptyState** until 수집 is run.
- **진단 보고서** — `Claude 프롬프트 생성` (opens the paste-into-Claude modal with a mono textarea + 전체 복사 →
  복사됨 ✓) and `CSV 내보내기`; the 5-block fixed format (TL;DR emphasis card, 스코어보드, 🚩 병목 진단, 개선 방안,
  다음 주 선행지표) with guidance hints.
- **재고 현황** — 품절 위험 banner, location tabs, 세트 현황 cards (qty + target + status + progress), 낱개 현황
  table, and the **입출고 기록 modal** (구분-aware 도착지점 field).
- **재고 타임라인** — 지점/제품 selects + 31-day prediction calendar (충분 white / 주의 amber / 품절위험
  high-contrast cell, 🟢 생산예정 · 🔴 출고예정 badges) + 예측 품절일 summary.
- **공장 스케줄** — 캘린더/타임라인 + 월간/주간 toggles, month nav, month grid with multi-day **task bars
  coloured by type** (생산·공정·R&D·포장·휴지·기타), 50%-opacity strikethrough for 완료, red border for 충돌,
  and a type legend.
- **팀원 관리** — 8-member table with avatars + RoleBadge (슈퍼어드민/어드민/팀원), disabled 초대 button, and the
  yellow Auth-pending banner.

## Theme & responsiveness
Theme toggles via `document.documentElement[data-theme="dark"]`; all surfaces use semantic tokens so the
whole app re-themes from the design system's dark scope. The 880px breakpoint swaps the desktop sidebar
for the mobile topbar + drawer.

## Files
- `index.html` — entry; React 18 + Babel, `styles.css`, then the scripts below. Holds the responsive media queries.
- `icons.jsx` — Lucide-derived `Icon` component.
- `ui.jsx` — cosmetic primitives (Button, Badge, Card, ProgressBar, StatGauge, Select, RoleBadge, StatusBadge, IconButton, EmptyState).
- `shell.jsx` — `Sidebar` (desktop + mobile drawer), `MobileTopbar`, `PageHeader`, `ThemeToggle`.
- `screens.jsx` — `KpiScreen`, `SalesScreen`, `InventoryScreen`, `LogModal`.
- `screens2.jsx` — `ReportsScreen`, `TeamScreen`, `FactoryScreen`, `TimelineScreen`.
- `app.jsx` — routing + theme state + mobile drawer state.

## Note on primitives
For self-containment (so the kit runs and verifies standalone), `ui.jsx` re-declares cosmetic versions of
the design-system primitives. In a real product these are the same components consumed from
`window.DothegyWorksDesignSystem_cddc62` (see `components/`). Charts are lightweight inline SVG; the
production app uses Recharts.
