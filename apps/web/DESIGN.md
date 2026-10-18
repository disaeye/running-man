# Running Man Frontend Design System

> Source of truth: `apps/web/app/globals.css`. Every colour, size, spacing, motion value in this document is a CSS variable defined there, and `scripts/check_design_tokens.py` fails the contract gate when a table row here disagrees with the stylesheet. Never introduce a raw hex in a component — add the token to `globals.css` first.
>
> Canvas is dusk paper `#f4f6f8`, accent is Winter Sky Indigo `#5a6f9a`, content column is `64rem`. Atmosphere is low-alpha indigo and amber washes on `.shell-atmosphere`; chrome is the only surface that uses `backdrop-filter`.

---

## 0. Design Research & Layout Constraints

### 0.1 Sources

- **Linear / Vercel / Notion**: cool-neutral canvas, one saturated accent reserved for interactive chrome, hairline borders instead of shadows, type at editorial density.
- **Apple HIG web surfaces**: hairline elevation, weight ladder 300/400/600 (no 500), tabular figures for metrics.
- **Strava / COROS / Training Peaks**: activity traces, PMC curves, zone ladders, fitness/freshness/form triplets, intensity heatmaps — all on a cool-neutral canvas with a tight typographic grid.
- **Okabe-Ito qualitative palette** (`chart-tokens.ts`): colour-vision-deficiency-safe categorical encoding, layered over the data-semantic PMC colours.
- **Geist via `next/font`**: tight-tracked sans at 15px body and fluid display numerals.

### 0.2 Layout Constraints That Hold

These were each discovered by getting them wrong, and each has a gate or a token behind it now:

- The mobile tab bar covers the last content row unless `--mobile-nav-height` is reserved; pages never hard-code `pb-24`.
- Chart tooltips clip at viewport edges; they stay inside `bg-surface-raised` with `--shadow-elevated`.
- The collapsed sidebar is 68px; icons need that much padding to stay legible.
- The login form shifts on mobile focus when the card has no fixed vertical rhythm.
- `--color-accent` fails AA as text on the dark panel; accent text uses `--color-accent-strong`.

---

## 1. Product Character

Running Man is a **calm dusk cockpit** — soft paper, twilight indigo chrome, quiet sakura and amber sky light. Colour climate: indigo dusk, cherry-blossom pink, golden-hour amber — as atmosphere and one accent, never as illustration.

Three principles:

1. **Comfortable density** — Content `max-w-5xl`. Compact 15px body. Tabular metrics.
2. **One accent, sky-indigo** — Winter Sky Indigo (`#5a6f9a` light / `#8a9bb8` dark) for CTAs, active nav, focus. Sakura (`--color-sakura`) and golden-hour (`--color-golden-hour`) only in atmosphere and rare chips — never second chrome.
3. **Cinematic shell** — `.shell-atmosphere` multi-layer dusk sky, `.shell-orbs` floating bokeh, `.shell-horizon` golden haze, `.shell-grain` film texture; chrome uses sky-rim liquid glass (`.glass-surface`). Content in `.shell-chrome` above atmosphere.



Chinese copy must be direct and athlete-specific. Write what an athlete would say to a coach ("本周 TSS 412，昨夜 HRV 48"), not generic SaaS prose.

---

## 2. Product Questions & Page Hierarchy

Every page answers a primary question. Layout, density, and chart choices serve that question first.

### 2.1 Page-Question Hierarchy

| Page | Primary Question | Density Mode |
|---|---|---|
| Today (今天) | "What should I do right now?" | Decision |
| Training (训练) | "How is my fitness trending?" | Analysis |
| Calendar | "What is planned and when?" | Browse |
| Activity Detail | "How did this specific session go?" | Showcase |
| Analysis | "What patterns explain my performance?" | Analysis |
| Goals | "Am I on track for my targets?" | Decision |
| Settings | "How is the system configured?" | Configuration |
| Strength | "What did I lift and how does it connect?" | Browse |
| Data Sources | "Is my data pipeline healthy?" | Configuration |

### 2.2 Density Modes

| Mode | Purpose | Layout Behavior |
|---|---|---|
| **Showcase** | Single artifact in focus (activity detail, PR card) | Large hero, generous whitespace, one-up chart |
| **Decision** | Action-oriented dashboard (Today, Goals) | One answer block with its evidence inside it, then the panels needed to act |
| **Browse** | Scannable list (calendar, activity list, strength log) | Compact rows, pagination/infinite scroll, filter bar |
| **Analysis** | Multi-metric comparison (PMC, trends, intensity) | Dense chart grid, linked tooltips, range selector |
| **Configuration** | Settings and data management | Form-heavy, sectioned cards, inline validation |

---

## 3. Color Palette

All tokens live in `app/globals.css` under `:root` (light, default) and `.dark` (toggle). Tailwind reads them via `@theme inline`. Light is the default; the dark theme is opt-in via `next-themes`. **Never introduce a raw hex in a component** — add the token to `globals.css` first.

### 3.1 Core Palette

Every row is verified against `app/globals.css` by `scripts/check_design_tokens.py`; a token that is documented here and absent there, or a value that disagrees, fails the contract gate.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-surface-base` | `#f4f6f8` | `#080a0f` | Page canvas |
| `--color-surface-card` | `#ffffff` | `#10151e` | Panel fill |
| `--color-surface-raised` | `#ffffff` | `#0f131b` | Sticky chrome |
| `--color-surface-overlay` | `#eaeff4` | `#151b25` | Ghost fill, hover |
| `--color-surface-sunken` | `#e9eef3` | `#05070a` | Inset wells |
| `--color-text-primary` | `#141c24` | `#edf3f8` | Body ink |
| `--color-text-secondary` | `#4b5b6d` | `#a5b1bd` | Secondary copy |
| `--color-text-muted` | `#55667a` | `#8595a5` | Captions, provenance |
| `--color-accent` | `#5a6f9a` | `#5a6f9a` | Accent fill |
| `--color-accent-strong` | `#405072` | `#9aaecf` | Accent text (AA) |
| `--color-primary` | `#5a6f9a` | `#5a6f9a` | Primary CTA |
| `--color-ring` | `#5a6f9a` | `#7a8fb5` | Focus ring |
| `--color-border-subtle` | `rgba(45, 62, 80, 0.18)` | `rgba(171, 198, 214, 0.12)` | Hairline edge |
| `--color-border-default` | `rgba(45, 62, 80, 0.26)` | `rgba(171, 198, 214, 0.2)` | Control border |
| `--glass-bg` | `rgba(255, 255, 255, 0.85)` | `rgba(16, 21, 30, 0.78)` | Chrome glass fill |
| `--glass-border` | `rgba(45, 62, 80, 0.12)` | `rgba(171, 198, 214, 0.16)` | Chrome glass rim |

**Single-accent rule**: Winter Sky Indigo carries every interactive element. `--color-accent` is a fill; text that sits on the canvas uses `--color-accent-strong`, which is the value tuned to pass AA against `--color-surface-base`. There is no second chrome colour.

**Glass belongs to chrome only.** `--glass-bg` and its blur are applied to the sidebar, the sticky header and the mobile tab bar. Panels use `--color-surface-card` with a hairline edge: stacking `backdrop-filter` on six panels blurs the dusk atmosphere into flat white and costs compositing on every scroll.

### 3.2 Data-Semantic Colours

These encode training meaning and are **chart series and category labels only** — never chrome, buttons or links. Verified by the same gate as §3.1.

Status colours are also the text colour for their state. `--color-success`, `--color-warning`, `--color-error`, `--color-info` and `--color-calendar-today` may set status copy ("恢复良好", "数据已过期") as long as they reach 4.5:1 against every surface, which `scripts/check_contrast.py` enforces. `--color-ctl`, `--color-atl`, `--color-tsb` and the `recovery-*` family stay series colours: a number that carries meaning in its value uses `--color-text-primary`, and the colour moves to the dot or bar beside it.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--color-ctl` | `#0284c7` | `#59e1ff` | 体能 (CTL) |
| `--color-atl` | `#7c3aed` | `#b88cff` | 疲劳 (ATL) |
| `--color-tsb` | `#d97706` | `#ffc857` | 状态 (TSB) |
| `--color-hr-rest` | `#e11d48` | `#ff788f` | 静息心率 |
| `--color-sleep` | `#0284c7` | `#59e1ff` | 睡眠 |
| `--color-weight` | `#16a34a` | `#82d69d` | 体重 |
| `--color-zone-1` | `#64748b` | `#71808c` | Z1 恢复 |
| `--color-zone-2` | `#0284c7` | `#59e1ff` | Z2 耐力 |
| `--color-zone-3` | `#16a34a` | `#52a86d` | Z3 节奏 |
| `--color-zone-4` | `#d97706` | `#ffc857` | Z4 阈值 |
| `--color-zone-5` | `#dc2626` | `#ff667d` | Z5 无氧 |
| `--color-recovery-good` | `#16a34a` | `#52a86d` | 恢复良好 |
| `--color-recovery-moderate` | `#d97706` | `#ffc857` | 恢复一般 |
| `--color-recovery-poor` | `#dc2626` | `#ff667d` | 恢复不足 |
| `--color-goal-on-track` | `#16a34a` | `#52a86d` | 目标在轨 |
| `--color-goal-behind` | `#d97706` | `#ffc857` | 目标滞后 |
| `--color-goal-at-risk` | `#dc2626` | `#ff667d` | 目标有风险 |
| `--color-sport-run` | `#e11d48` | `#ff788f` | 跑步 |
| `--color-sport-ride` | `#0284c7` | `#59e1ff` | 骑行 |
| `--color-sport-workout` | `#d97706` | `#ffc857` | 健身 |

Sport colours are read through `getSportConfig(sport).color`; never map a sport to a colour anywhere else.

### 3.3 Decorative Tint Group

Six decorative tints for chips, badges, insight cards, empty states: `decor-rose`, `decor-mint`, `decor-butter`, `decor-lavender`, `decor-peach`, `decor-sky`. Each has `/10`, `/20`, and `/60` opacity variants via `color-mix()`. Tints stay calm and blue-anchored — no coral, no cream, no warm-dark palette.

### 3.4 Scoped Accent Roles

Purpose-specific slots: `--color-data-emphasis`, `--color-load-heatmap`, `--color-calendar-today`, `--color-active-phase`. These are for specific dashboard contexts, not general decoration.

### 3.5 Gradient Policy

**No decorative gradients.** Atmospheric depth comes from imagery or surface-color change, never from a CSS gradient overlay.

**Information-bearing gradients ARE permitted** when they encode data:
- Training load heatmaps (calendar cells colored by TSS intensity)
- GPS route traces (colored by pace/HR/power zones)
- Intensity distribution bands (zone-colored fills in area charts)
- Progress gradient fills (e.g., weekly TSS bar with zone stacking)

The test: if removing the gradient removes information the user needs, it is permitted. If removing it removes only aesthetics, it is banned.

---

## 4. Typography

### 4.1 Font Stacks

| Stack | Fonts | Usage |
|---|---|---|
| Sans display/body | Geist (via `next/font`) → Inter fallback, PingFang SC / Microsoft YaHei / Noto Sans CJK SC for CJK, system-ui | Everything — headlines, body, UI, metrics |
| Mono | `ui-monospace`, SF Mono, Geist Mono, Roboto Mono | Tables, code, aligned numeric columns |

**No serif anywhere.** `font-serif` is repointed to the sans stack. Geist weight 600 approximates SF Pro Display for headlines. Geist at 500 is dropped entirely — the weight ladder is 300/400/600/700.

### 4.2 CJK/Latin Rules

- **Latin headlines**: Negative letter-spacing at display sizes (-0.010em to -0.024em). Never at 12px or below.
- **CJK text**: Tracking tighten does NOT apply to CJK glyphs. CJK headlines use the same font-size scale but without letter-spacing adjustment. Suppressed via `:where(:lang(zh)) { letter-spacing: normal; }`.
- **Mixed CJK/Latin body**: `lang` attribute scopes tracking suppression. Latin words embedded in CJK inherit surrounding CJK metrics.
- **Terminology**: Use established Chinese endurance terms — 训练负荷 (training load), 最大摄氧量 (VO2max), 乳酸阈 (lactate threshold / LTHR), 静息心率 (resting HR), 心率变异 (HRV). Do not translate metric abbreviations (TSS, CTL, ATL, TSB remain Latin).

### 4.3 Type Scale

Each row names the CSS variable that `@theme inline` exposes, so the size in this table and the size the browser renders are the same number. `scripts/check_design_tokens.py` compares them.

| Token | Size | Line-height | Usage |
|---|---|---|---|
| `--text-display-xl` | `clamp(2.5rem, 5vw, 3rem)` | 1.15 | Hero headline |
| `--text-display-lg` | `clamp(2rem, 4vw, 2.5rem)` | 1.2 | Tile / page title |
| `--text-display-md` | `clamp(1.75rem, 3vw, 2rem)` | 1.25 | Section head |
| `--text-display-sm` | `28px` | 1.3 | Lead / answer headline |
| `--text-largeTitle` | `28px` | 1.4 | Large title |
| `--text-title1` | `24px` | 1.4 | Major section header |
| `--text-title2` | `22px` | 1.4 | Card title, sheet header |
| `--text-title3` | `20px` | 1.4 | Sub-section header, metric value |
| `--text-headline` | `15px` | 1.5 | Emphasised body (semibold) |
| `--text-body` | `15px` | 1.5 | Default body copy |
| `--text-callout` | `14px` | 1.5 | Secondary body, control label |
| `--text-subheadline` | `13px` | 1.5 | List row title, supporting copy |
| `--text-footnote` | `13px` | 1.5 | Helper text |
| `--text-caption1` | `12px` | 1.5 | Metadata, badges, provenance |
| `--text-caption2` | `11px` | 1.5 | Latin-only labels — never Chinese |

### 4.4 Principles

- **Body at 15px.** Compact body lets data and advice share the same column width without horizontal scroll.
- **Chinese never below 12px.** CJK glyphs carry far more strokes per em than Latin, and below 12px they smear. `text-caption2` (11px) is therefore Latin-only; Chinese labels start at `text-caption1`. Enforced by `scripts/type-scale.test.ts`.
- **Use the tokens, not arbitrary sizes.** `text-[13px]` bypasses the scale, so a global change silently misses that element. The gate rejects arbitrary sizes except where a `type-scale-allow` comment records why.
- **The mono stack names CJK faces.** `font-mono` is for tabular figures and Latin labels; Chinese inside it still resolves to PingFang/YaHei rather than a generic monospace face.
- **Weight 600 for headlines, 700 for numerals.** Weight 500 is deliberately absent.
- **Weight 300 is real and rare.** Reserved for airy moments.
- **Line-height**: display 1.15–1.3 (tight), body 1.5 (never tighter).

### 4.5 Number Rendering

All metric values use **tabular figures** (`font-feature-settings: "tnum" 1`, set globally on `body`). For numeric tables, use `font-mono` to align columns at the decimal.

---

## 5. Spacing & Layout

### 5.1 Spacing Scale (8px base grid)

| Token | Value | Usage |
|---|---|---|
| `1` | 4px | Tight gaps |
| `2` | 8px | Icon-text gaps |
| `3` | 12px | List row internal |
| `4` | 16px | Compact card padding |
| `5` | 20px | Default card padding |
| `6` | 24px | Section spacing, card grid gutters |
| `8` | 32px | Card padding (editorial default) |
| `10` | 40px | Intermediate rhythm |
| `12` | 48px | Hero spacing |
| `16` | 64px | Page breathing room |
| `section` | 80px | Major section breaks |

### 5.2 Page Container

```
/* Owned by AppShell — do not re-declare on pages */
.shell-main { padding via --shell-pad-y + --mobile-nav-height }
.page-stack { gap: var(--shell-gap) }
```

| Token | Value | Role |
|---|---|---|
| `--shell-content-max` | `64rem` | Content column width |
| `--shell-pad-x` | `clamp(1rem, 3vw, 3.5rem)` | Horizontal page padding |
| `--shell-pad-y` | `clamp(1.25rem, 4vw, 3.25rem)` | Vertical page padding |
| `--shell-gap` | `clamp(1rem, 2vw, 2rem)` | Gap between stacked sections |
| `--shell-header-h` | `4.75rem` | Sticky header height |
| `--mobile-nav-height` | `4.5rem` | Bottom tab bar clearance |

### 5.3 Grid

- Dashboard: `grid grid-cols-1 lg:grid-cols-2 gap-4`
- Stat strips: `grid grid-cols-2 lg:grid-cols-4 gap-3`
- Calendar: `grid grid-cols-7`

### 5.4 Viewport Stability

Use `min-h-[100dvh]`, never `h-screen`.

### 5.5 Density Ladder（密度阶梯，v9）

Three density modes; every page/component picks one and stays in it. The
modes are the only sanctioned densities — never mix `table` and `card`
rhythms inside one surface.

| Mode | Use for | Rhythm | Numerals | Interaction |
|---|---|---|---|---|
| `table` | 训练日志、活动列表、设置明细 | 行高 44px（`min-h-[44px]`），分隔线 `border-border-subtle`，hover `bg-surface-active` | `tabular-nums` 强制 | 行点击进入详情；筛选/排序在表头或上方 chips |
| `card` | 首页、目标、健康摘要 | 卡片间距 `gap-4`，卡内 `padding="md"`，值 + 趋势 + 一词释义（见 KpiCard/SessionCard） | `tabular-nums` 强制 | 主行动在卡片内或卡片底部 |
| `chart` | 洞察、趋势、活动分析 | 统一走 `ChartShell`（title/subtitle/legend/provenance/空态），禁手写标题壳；图表高度 `h-64`–`h-80` | 轴标签 `text-caption1` | tooltip 统一"值 + Δ + 基线"三行 |

Rules:
- 一个页面一个主模式；`chart` 模式内的卡片 chrome 必须用 `ChartShell`，不手写 `h2` + 描述 + `Card` 三件套。
- 空态统一：`EmptyState`（title 用共享常量 `EMPTY_LABEL`）+ 指向"同步 Intervals.icu"的引导文案。
- 数值列一律 `tabular-nums`；百分比/配速等格式走 `shared/lib/format.ts`，不内联拼字符串。

---

## 6. Primitives & State Inventory

Every interactive primitive must implement all seven states. Non-interactive primitives implement the first three.

### 6.1 State Inventory

| State | Token / Class | Behavior |
|---|---|---|
| **Rest** | Default token values | Baseline appearance |
| **Hover** | `hover:bg-surface-overlay` (or equivalent) | Subtle surface shift |
| **Focus** | `focus-ring` utility (2px `ring` color + glow) | Keyboard-visible outline |
| **Pressed/Active** | `transform: scale(0.95)` | Physical press feedback |
| **Disabled** | `opacity-50 cursor-not-allowed` | Visually muted, non-interactive |
| **Loading** | Spinner or skeleton placeholder | Indicates async operation |
| **Error** | `border-error text-error` | Red hairline + text |

### 6.2 Card

```
glass-surface rounded-xl p-8
```

- Flat — no shadow. 1px hairline provides the edge.
- Border radius: `rounded-2xl` (~16px) for glass cards.
- Default padding: `p-6` (24px, Card `md`). Hero / editorial: `p-8` (Card `lg`). Compact grids: `p-4` (Card `sm`).
- Cards never nest. Page roots use `.page-stack` (`gap: var(--shell-gap)` = 32px).
- States: rest, hover (no change — cards are non-interactive by default), focus (if focusable), error border.

### 6.3 Button

| Variant | Classes | States |
|---|---|---|
| Primary pill | `bg-primary text-on-accent rounded-full px-[22px] py-[11px]` | rest, hover (scale 0.98), focus, pressed (scale 0.95), disabled, loading |
| Secondary pill | `border border-primary text-primary rounded-full` | rest, hover, focus, pressed, disabled |
| Dark utility | `bg-ink text-on-dark rounded-sm` | rest, hover, focus, pressed, disabled |
| Pearl capsule | `bg-surface-overlay text-text-secondary rounded-md border-[3px] border-border-subtle` | rest, hover, focus, pressed, disabled |
| Link | `text-accent-strong hover:underline` | rest, hover, focus |

### 6.4 Badge

- Accent: `bg-accent/10 text-accent-strong rounded-full text-caption1`
- Neutral: `bg-surface-overlay text-text-secondary rounded-full text-caption1`

### 6.5 List Row

Full-width button pattern for drill-in navigation with chevron indicator. States: rest, hover (`bg-surface-overlay`), focus, pressed.

### 6.6 Sidebar, Tab Bar, Activity Ring, PMC Chart

See component sections in `shared/layout/` and `features/pmc/`. All implement the full state inventory.

---

## 7. Charts

### 7.1 Chart Question-to-Type Grammar

Every chart answers a specific data question. Choose the type by the question, not by visual preference.

| Question | Chart Type | Example |
|---|---|---|
| "How has X changed over time?" | Line / area | PMC trend, HRV trend |
| "How does X compare across categories?" | Bar / column | Weekly TSS by sport, zone distribution |
| "What is the distribution of X?" | Histogram / heatmap | Intensity distribution, training load calendar |
| "What proportion does X represent?" | Donut / stacked bar | Sport mix, energy system contribution |
| "How do two metrics relate?" | Scatter / bubble | HR vs pace, power vs cadence |
| "What is the current value vs target?" | Gauge / bullet | Goal progress, CTL vs target |
| "What path did I take?" | Route trace (GPS) | Activity map with zone coloring |
| "What is the multi-metric profile?" | Radar / spider | Ability analysis, fitness fingerprint |

### 7.2 Chart Anatomy

Every chart container follows this structure:

1. **Shell**: `glass-surface rounded-xl p-5` (or `p-8` for showcase)
2. **Header**: Title (`text-title3 text-text-primary`) + optional subtitle (`text-footnote text-text-muted`)
3. **Chart area**: ECharts / uPlot instance, min-height 200px, responsive width
4. **Legend**: Below chart for ≤5 series, right-side for >5. Uses semantic tokens, not raw hex.
5. **Tooltip**: `bg-surface-raised border border-border-default rounded-lg shadow-elevated p-3`. Tabular numbers. Shows date + all series values.
6. **Provenance**: Data source + date range in `text-caption1 text-text-muted` below the chart (`caption1`, not `caption2` — the line is Chinese). Format: "数据来源: Intervals.icu · 2026-01-01 至 2026-07-17"
7. **Empty state**: Centered icon + message (`text-body text-text-muted`). No chart rendered. Message explains why (no data, no selection, loading error).

### 7.3 Chart Colour Rules

- Chart series use semantic tokens: `ctl`, `atl`, `tsb`, `zone-1`..`zone-5`, `sport-run`, etc.
- Chart accent (`chart-accent`) for emphasis lines, current-value markers, selection highlights.
- **Okabe-Ito qualitative palette** (via `chart-tokens.ts`) for series that aren't semantically coded (e.g., distribution across many categories).
- Chart colors auto-brighten in dark mode via CSS variable resolution.
- Dual-theme ECharts: a single-point re-init via `useECharts` swaps themes without re-mounting the chart.
- Never use raw hex in chart configuration — use `chart-tokens.ts` to read CSS variables.

---

## 8. Motion

### 8.1 Motion Tokens

| Token | Value | Usage |
|---|---|---|
| `duration-instant` | 100ms | Press feedback, toggle |
| `duration-fast` | 200ms | Hover transitions, theme switch |
| `duration-normal` | 300ms | Sheet open, dialog enter |
| `duration-slow` | 500ms | Page transitions, chart data update |

### 8.2 Easing

| Token | Value | Usage |
|---|---|---|
| `ease-default` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | General transitions |
| `ease-enter` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering view |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving view |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful overshoot (rare — activity ring sweep) |

### 8.3 Rules

- GPU-composited only: `transform`, `opacity`, `filter`. Never animate `width`, `height`, `top`, `left`.
- Honor `prefers-reduced-motion: reduce` — collapse all durations to 0.01ms.
- Button press: `transform: scale(0.95)` on active — not a hex change.
- Theme transition: `background-color 200ms ease, color 200ms ease` on `body`.

---

## 9. Responsive Behavior

### 9.0 AppShell is the only layout framework

`AppShell` owns PC + mobile chrome for every dashboard route:

| Concern | Owner | Pages must NOT |
|---|---|---|
| Sidebar (md+) / bottom tabs (<md) | `Sidebar` + `MobileTabBar` | Re-implement dual nav |
| Content max-width | `--shell-content-max` / `.shell-main-inner` | Local `max-w-*` wrappers |
| Horizontal padding + safe-area | `--shell-pad-x*` | Local `px-4` / safe-area hacks |
| Bottom clearance for tab bar | `--mobile-nav-height` set by `MobileTabBar` | Hardcoded `pb-24` |
| Scroll region | `.shell-main` | Nested full-viewport scroll shells |

Route pages render **content only**, ideally:

```tsx
export default function Page() {
  return (
    <div className="page-stack">
      {/* feature sections */}
    </div>
  );
}
```

## 9.1 Breakpoints


### 9.1 Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px (375px reference) | Single column, bottom tab bar, full-width cards |
| Tablet | 768px – 1279px | Sidebar collapsed (68px), 2-column grids |
| Desktop | >= 1280px | Sidebar expanded (240px), max-w-5xl content, 2–4 column grids |

### 9.2 Composition Rules

- **Mobile (375px)**: Single column, cards full-width, tab bar fixed bottom, content `pb-24` for tab clearance. No hover states (touch-only). Charts: single-up, full-width, simplified tooltips.
- **Tablet (768px)**: Sidebar collapsed to icon-only. Content area uses 2-column grids. Touch interactions preserved.
- **Desktop (1280px)**: Sidebar expanded. Content `max-w-5xl` centered. Multi-column chart grids. Full hover/focus interactions.

### 9.3 Safe-Area Rules

- Bottom: `padding-bottom: max(env(safe-area-inset-bottom), 96px)` on mobile main content (96px = 64px tab bar + 32px breathing room).
- Top: `padding-top: env(safe-area-inset-top)` on sticky headers.
- Left/Right: `padding-left: env(safe-area-inset-left)` and `padding-right: env(safe-area-inset-right)` on full-bleed containers.

---

## 10. Accessibility Constraints

### 10.1 Touch Targets

- **Minimum 44x44px** for all interactive elements at mobile (< 768px). This includes buttons, icon buttons, list rows, tab bar items, sidebar entries.
- Visual size may be smaller (e.g., 24px icon) but the hit area must be >= 44x44 via padding or min-width/min-height.
- Desktop does not have this constraint but should maintain >= 32x32 for usability.

### 10.2 Colour & Contrast

- All text passes WCAG AA: 4.5:1 for body, 3:1 for large text (>= 18px, or >= 14px bold).
- `--color-accent` fill with `--color-on-accent` white: passes for button text.
- Accent text uses `--color-accent-strong`, never `--color-accent`. Measured: 7.5:1 on the light canvas `#f4f6f8`, 8.1:1 on the dark panel `#10151e`. `--color-accent` on the dark panel is 3.7:1 and fails body text; `scripts/check_web_tokens.py` rejects it.
- Data-semantic colours are for charts and category labels, not for text that carries critical information without a second encoding (shape, label, pattern).

### 10.3 Keyboard Navigation

- All interactive elements are focusable via Tab.
- Focus ring: 2px `ring` color + 4px glow (`focus-ring` utility).
- Skip link: first focusable element on page, hidden until focused.
- Dialog/sheet: focus trapped, Escape closes, focus returns to trigger.

### 10.4 Screen Reader

- All icons have `aria-label` or are wrapped with `aria-hidden="true"` when decorative.
- Charts: `aria-label` with summary, data table alternative for critical data.
- Live regions for async updates (sync status, import progress).

### 10.5 Reduced Motion

- `prefers-reduced-motion: reduce`: all animations collapse to 0.01ms.
- No auto-playing animations without user interaction.

---

## 11. Icons

### 11.1 Icon System

- **Library**: Lucide React (`lucide-react`).
- **Sizes**: 16px (inline with caption), 20px (default — list rows, nav), 24px (hero/emphasis), 32px (empty state).
- **Stroke width**: 1.5px default, 2px for emphasis/active, 2.4px for tab bar active state.
- **Color**: Inherit from parent text color (`currentColor`). Never hardcode icon fill.
- **No emojis** in visible UI. Lucide only.

---

## 12. Action Hierarchy

### 12.1 Levels

| Level | Visual | Usage |
|---|---|---|
| **Primary** | Winter Sky Indigo pill (`bg-primary text-on-accent rounded-full`) | One per view. The main action (save, start, confirm). |
| **Secondary** | Border pill or pearl capsule | Supporting actions (cancel, edit, filter). |
| **Tertiary** | Link style (`text-accent-strong hover:underline`) | Low-emphasis actions (learn more, view details). |
| **Destructive** | `text-error` or `bg-error text-white` | Irreversible actions (delete, disconnect). Always requires confirmation dialog. |

### 12.2 Rules

- One primary action per view. If you need two, one is actually secondary.
- Destructive actions always require explicit confirmation (dialog with typed action name).
- Disabled states must explain why (tooltip or inline message).

---

## 13. Depth & Elevation

| Level | Treatment | Usage |
|---|---|---|
| Flat | 1px hairline, no shadow | Every panel (`Card`), buttons, text |
| Chrome glass | `.glass-surface` / `.glass-surface-strong` | Sidebar, sticky header, mobile tab bar — never panels |
| Overlay shadow | `--shadow-elevated` | Popovers, dialogs, sheets |

`--shadow-card` and `--shadow-sheet` exist for overlays. Panels carry no shadow: a page of six shadowed cards reads as six competing layers, and the hairline is enough to separate a panel from the canvas.

### Border Radius

Tailwind's default scale, used as written. There is no `--radius-*` token layer; a second scale that nothing read was how the previous table drifted away from the rendered result.

| Class | Value | Usage |
|---|---|---|
| `rounded-lg` | 8px | Buttons, chips, inputs |
| `rounded-xl` | 12px | Every panel (`Card`) |
| `rounded-2xl` | 16px | Dialogs, sheets |
| `rounded-full` | 9999px | Pills, dots, avatars |

---

## 14. Dual Mode (Light + Dark)

Light mode: dusk paper `--color-surface-base` `#f4f6f8`, Winter Sky Indigo chrome, sakura/amber atmosphere. Dark mode: night sky `#080a0f`, `--color-accent-strong` `#9aaecf` for accent text. Data-semantic palette unchanged in meaning; both modes read the same tokens.

Theme transitions: `transition: background-color 200ms ease, color 200ms ease` on `body`. ECharts re-init via a single `useECharts` swap point keeps dual-mode charts in lockstep with the toggle.

---

## 15. Accepted Debt

| Debt | Reason |
|---|---|
| Playwright E2E uses storage-state auth | The suite boots against a real backend; a scripted login would add a second auth path that production does not use. `npm run qa:auth-bootstrap` mints the state from the app's own JWT secret. |
| React dev tooling (react-scan, react-grab) not wired | react-scan@0.5.7 fails to import under Node 24. |

`--color-accent` is a fill token. In dark mode it measures 3.7:1 against `--color-surface-card`, so accent-coloured *text* uses `--color-accent-strong` (8.1:1 dark, 7.5:1 light). `scripts/check_web_tokens.py` enforces the panel, palette and type rules that the rest of this document describes.

---

## Do's and Don'ts

### Do
- Reference tokens (`bg-surface-card`, `text-text-primary`) — never raw hex.
- Use Winter Sky Indigo for **every** interactive element.
- Build panels with `Card`. One radius (`rounded-xl`), one hairline edge, no shadow.
- Reserve `.glass-surface` for chrome: sidebar, sticky header, mobile tab bar.
- Use `text-accent-strong` for accent-coloured text; `--color-accent` is a fill.
- Resolve every banded metric through `zoneFor()` / `metricZones()` so the number, its band and the band's explanation come from `contracts/v1/metrics.yaml`.
- Set headlines in sans with negative letter-spacing.
- Run body copy at 15px.
- Use `rounded-full` for primary CTAs.
- Use `chart-accent` for chart emphasis.
- Apply `transform: scale(0.95)` as the active/press state on buttons.
- Use Lucide icons — never emojis.
- Preserve data-semantic colours (PMC, zones, sport, health, recovery, goals).
- Test both light and dark mode for every component.
- Ensure >= 44px touch targets on mobile.
- Include chart provenance (data source + date range) at `text-caption1`.
- Use information-bearing gradients for heatmaps, route traces, intensity bands.

### Don't
- Don't introduce a second accent colour.
- Don't add shadows to panels, buttons, or text.
- Don't nest panels. A group inside one panel is a `border-t` separator.
- Don't use decorative gradients.
- Don't set body copy at weight 500.
- Don't round full-bleed sections.
- Don't tighten body line-height below 1.5.
- Don't use raw hex codes — add tokens to `globals.css` first.
- Don't use `h-screen` — use `min-h-[100dvh]`.
- Don't animate `width`, `height`, `top`, `left`.
- Don't mix serif and sans.
- Don't write generic SaaS copy — be athlete-specific.
- Don't make touch targets < 44px on mobile.
- Don't render charts without provenance and empty states.
- Don't put Chinese at `text-caption2`; that step is 11px and Latin-only.
- Don't widen the content column past `--shell-content-max` (`64rem`).
- Don't hard-code a band boundary or a band label in a component; the contract owns them.
- Don't flood the UI with secondary colours; indigo is the only chrome accent — sakura and amber are atmosphere only.
