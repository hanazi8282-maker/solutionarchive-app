---
name: dothegy-works-design
description: Use this skill to generate well-branded interfaces and assets for 두더지웍스 운영 OS (Dothegy Works Operations OS), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping a Korean-first, shadcn-style B2B operations dashboard.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

This is the design system for **두더지웍스 운영 OS** — a Korean-first internal operations dashboard
(KPI · 매출 · 재고 다지점 · 공장 스케줄 · 진단 보고서 · 팀원 관리) built on Tailwind + shadcn/ui conventions,
with Pretendard typography, slate neutrals, a single blue action accent, and exact status/role/task colors.

Key files:
- `readme.md` — brand context, content fundamentals, visual foundations, iconography, and an index.
- `styles.css` — the single global entry point (link this). Imports all tokens + `@font-face`.
- `tokens/` — colors, typography, spacing, fonts, base. Reference the semantic aliases (`--text-strong`,
  `--surface-card`, `--primary`, `--danger`, `--task-production`, …), not raw ramps.
- `components/` — React primitives (Button, Badge, Card, ProgressBar, StatGauge, Input, Select, Switch,
  DataTable, RoleBadge, StatusBadge). Each has a `.prompt.md` with usage.
- `guidelines/` — foundation specimen cards (Type, Colors, Spacing).
- `ui_kits/operations_os/` — interactive recreation of the dashboard product.
- `ui_kits/marketing_site/` — Korean marketing homepage.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create
static HTML files for the user to view, linking `styles.css` for tokens + fonts. If working on production
code, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design,
ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code,
depending on the need.

House rules: Korean-first copy, terse operational tone; ration color (color = signal); hairline borders
do the separation work; no gradients/imagery/illustration in product chrome; Pretendard everywhere,
JetBrains Mono for figures/IDs/code.
