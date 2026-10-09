# Running Man Frontend Design System (v8.5 — 5cm Quiet Winter)

> Source of truth: `apps/web/app/globals.css`. Every color, font size, radius, shadow, and motion token maps to a CSS variable that lives there. Never introduce a raw hex in a component — add the token to `globals.css` first.
>
> **v8.5 — 5cm Quiet Winter**: Content `max-w-5xl`. Accent is Winter Sky Indigo (`#5a6f9a`) — dusk sky from Makoto Shinkai films (*5cm Per Second* / *5cm Per Second*). Canvas soft dusk-paper (`#eef2f6`). Atmosphere: low-alpha indigo + sakura + golden-hour washes. Clear liquid glass. Chart data colors unchanged. Not film assets or cel-shading.

---

## 0. Research Log & Runtime Audit

### 0.1 Design Research

- **Linear / Vercel / Notion**: Cool-neutral canvases, single saturated accent reserved for interactive chrome, hairline borders over shadows, type at editorial density.
- **Apple HIG web surfaces**: Hairline elevation, weight ladder 300/400/600 (no 500), tabular figures for metrics, Action Blue as the single interactive color.
- **Strava / COROS / Training Peaks**: Activity traces, PMC curves, zone ladders, fitness/freshness/form triplets, intensity heatmaps. Endures the cool-neutral canvas and tight typographic grid.
- **Okabe-Ito qualitative palette** (via `chart-tokens.ts`): Color-vision-deficiency-safe categorical encoding for chart series, layered on top of the data-semantic PMC colors that survive unchanged from v6.
- **Geist via `next/font`**: Tight-tracked sans (Vercel voice) at 15px body and 32–48px fluid display numerals.

### 0.2 Runtime Audit (16 screenshots, 2026-07-17)

10 desktop (1440px) + 6 mobile (375px) screenshots captured in `.omo/evidence/frontend-product-experience-redesign/`. Key findings rolled into v7:

- Mobile tab bar overlaps last content row → safe-area + `pb-24` rule preserved.
- Chart tooltips clip viewport edges → tooltips kept inside `bg-surface-raised border rounded-lg shadow-elevated`.
- Sidebar collapsed width tight for icons → 68px collapsed padding preserved.
- Login form layout shift on mobile focus → unchanged from v6.
- Dark mode chart contrast → improved via cyan-300 (`#22d3ee`) accent-strong on dark for AA text.

---

## 1. Product Character

Running Man is a **calm dusk cockpit** — soft paper, twilight indigo chrome, quiet sakura/amber sky light. Inspired by Makoto Shinkai's color climate (5cm Per Second / 5cm Per Second): indigo dusk, cherry blossom pink, golden-hour amber — as *atmosphere and one accent*, not illustration.

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
| **Decision** | Action-oriented dashboard (Today, Goals) | KPI strip + recommendation + 2-up detail |
| **Browse** | Scannable list (calendar, activity list, strength log) | Compact rows, pagination/infinite scroll, filter bar |
| **Analysis** | Multi-metric comparison (PMC, trends, intensity) | Dense chart grid, linked tooltips, range selector |
| **Configuration** | Settings and data management | Form-heavy, sectioned cards, inline validation |

---

## 3. Color Palette

All tokens live in `app/globals.css` under `:root` (light, default) and `.dark` (toggle). Tailwind reads them via `@theme inline`. Light is the default; the dark theme is opt-in via `next-themes`. **Never introduce a raw hex in a component** — add the token to `globals.css` first.

### 3.1 Core Palette (v8.1 Winter Sky Indigo — dusk paper + energy orange)

| Role | Light | Dark | Token |
|---|---|---|---|
| Page background (dusk paper) | `#eef2f6` | `#0d0d0d` | `surface-base` |
| Raised surface (sidebar, sticky bars) | `#ffffff` | `#1d1d1f` | `surface-raised` |
| Card surface | `#ffffff` | `#1a1a1a` | `surface-card` |
| Overlay / pearl (ghost button fill) | `#f0f0ee` | `#272729` | `surface-overlay` |
| Primary text (near-black ink) | `#1d1d1f` | `#ffffff` | `text-primary` / `ink` |
| Secondary text | `#333333` | `#cccccc` | `text-secondary` |
| Muted text | `#6e6e73` | `#8e8e93` | `text-muted` |
| Accent fill (Winter Sky Indigo) | `#5a6f9a` | `#5a6f9a` | `accent` / `primary` |
| Accent text (AA on canvas) | `#3f4d99` | `#b4bdf0` | `accent-strong` |
| Chart accent | `#5a6f9a` | `#9aa6e0` | `chart-accent` |
| Focus ring | `#9aa6e0` | `#9aa6e0` | `ring` |
| Near-black ink panel (utility surface) | `#1d1d1f` | `#000000` | `surface-dark` |
| Glass fill | `white 78%` | `card 72%` | `--glass-bg` |
| Glass rim | warm white/peach | orange 18% | `--glass-border` |

**Single-accent rule**: Winter Sky Indigo (`#5a6f9a`) carries every interactive element. In dark mode, fills stay orange-500 but accent *text* switches to orange-300 (`#b4bdf0`) for AA contrast. There is no second chrome color.

**Restrained reference (not a brand copy)**: warmth + 14px radii + quiet linen field inspired by modern anime UI / mobile game HUD energy, while staying a real training dashboard. PMC/zone/sport tokens remain data semantics only.

### 3.2 Data-Semantic Colors (preserved from v6)

These encode training meaning and are **chart series and category labels only** — never used for chrome, buttons, or links.

- **PMC**, preserved: `ctl` light `#0066cc` / dark `#2997ff` (Action Blue / Sky Blue family), `atl` light `#8742AF` / dark `#BF7EE8` (violet), `tsb` light `#946018` / dark `#E8B454` (gold).
- **Health**: `hr-rest`, `sleep`, `weight` brightened on dark for AA contrast.
- **Zones**: `zone-1` through `zone-5`, brightened on dark.
- **Recovery**: `recovery-good` (green), `recovery-moderate` (gold), `recovery-poor` (red).
- **Goals**: `goal-on-track`, `goal-behind`, `goal-at-risk` — same green/gold/red ladder.
- **Sport identity**: `sport-run`, `sport-ride`, `sport-workout`, etc. — read via `getSportConfig(sport).color`.

### 3.3 Decorative Tint Group

Six decorative tints for chips, badges, insight cards, empty states: `decor-rose`, `decor-mint`, `decor-butter`, `decor-lavender`, `decor-peach`, `decor-sky`. Each has `/10`, `/20`, and `/60` opacity variants via `color-mix()`. Tints stay calm and blue-anchored — no coral, no cream, no warm-dark palette.

### 3.4 Scoped Accent Roles

Purpose-specific slots: `data-emphasis`, `load-heatmap`, `calendar-today`, `active-phase`. Light values stay `#0066cc`; dark values brightened to `#2997ff`. These are for specific dashboard contexts, not general decoration.

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

### 4.3 Type Scale (v7 — compact body 15px)

**Display tokens** (headlines, heroes — tight-tracked sans, fluid on phones):

| Class | Size (clamp) | Line-height | Tracking | Usage |
|---|---|---|---|---|
| `text-display-xl` | 40–48px | 1.07 | -0.024em | Hero headline |
| `text-display-lg` | 32–40px | 1.10 | -0.018em | Tile / page-title |
| `text-display-md` | 32px | 1.47 | -0.018em | Section heads |
| `text-display-sm` | 28px | 1.14 | -0.010em | Lead / subcopy |

**SF Pro Text / iOS scale** — tuned to v7 compact body 15px:

| Class | Size | Usage |
|---|---|---|
| `text-largeTitle` | 28px | Large titles |
| `text-title1` | 24px | Major section headers |
| `text-title2` | 22px | Card titles, sheet headers |
| `text-title3` | 20px | Sub-section headers |
| `text-headline` | 15px | Emphasized body (semibold) |
| `text-body` | 15px | Default body copy (v7 compact — was 17px in v6) |
| `text-callout` | 14px | Secondary body, control labels |
| `text-subheadline` | 13px | List row titles |
| `text-footnote` | 13px | Captions, helper text |
| `text-caption1` | 12px | Metadata, small badges |
| `text-caption2` | 11px | Ultra-compact **Latin-only** labels — never Chinese |

### 4.4 Principles

- **Body at 15px, not 17px.** v7's compact body lets data and advice share the same column width without horizontal scroll.
- **Chinese never below 12px.** CJK glyphs carry far more strokes per em than Latin, and below 12px they smear — a rendered comparison puts the crossover exactly there. `text-caption2` (11px) is therefore Latin-only; Chinese labels start at `text-caption1`. Enforced by `scripts/type-scale.test.ts`.
- **Use the tokens, not arbitrary sizes.** The scale above is the contract. `text-[13px]` bypasses it and means a global scale change silently misses that element; the gate rejects arbitrary sizes except where a `type-scale-allow` comment records why (currently only the sidebar wordmark, which is sized to its container).
- **The mono stack names CJK faces.** `font-mono` is for tabular figures and Latin labels; Chinese inside it still resolves to PingFang/YaHei rather than a generic monospace face.
- **Weight 600, not 700, for headlines.** Weight 500 is deliberately absent.
- **Weight 300 is real and rare.** Reserved for airy moments.
- **Line-height**: Display 1.07–1.14 (tight). Body 1.50 (editorial — never tighten below).

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
| `10` | 40px | v7 — intermediate rhythm |
| `12` | 48px | Hero spacing |
| `16` | 64px | Page breathing room |
| `section` | 80px | Major section breaks |

### 5.2 Page Container

```
/* Owned by AppShell — do not re-declare on pages */
.shell-main { padding via --shell-pad-y (2.25rem) + --mobile-nav-height }
.page-stack { gap: var(--shell-gap) /* 2rem / 32px */ }
```

Content width `max-w-5xl` (`--shell-content-max`). Mobile bottom clearance via `--mobile-nav-height` (not hard-coded `pb-24` on pages).

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

### 7.3 Chart Color Rules (v7)

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

### 10.2 Color & Contrast

- All text must pass WCAG AA (4.5:1 for body, 3:1 for large text >= 18px or >= 14px bold).
- Winter Sky Indigo (`#5a6f9a`) fill with white text: passes AA large/button text.
- Accent-strong light (`#3f4d99`) on dusk paper (`#eef2f6`): passes AA body text.
- Accent-strong dark (`#b4bdf0`) on near-black (`#0d0d0d`): passes AA.
- Data-semantic colors are for charts/categories, not for text conveying critical information without additional encoding (shape, label, pattern).

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
| Flat | No shadow, hairline border | All cards, buttons, text |
| Soft hairline | 1px `border-border-default` | Utility cards, list rows |
| Backdrop blur / liquid glass | `.glass-surface` / `.glass-surface-strong` | Cards, sticky header, sidebar, mobile tab bar |
| Product shadow | `rgba(0, 0, 0, 0.04) 1px 3px + 0.06 4px 12px` (light) / denser (dark) | Popovers, sheets only |

**`shadow-card` is a soft dual-layer depth under glass.** Prefer `.glass-surface` over raw `bg-surface-card` for panels.

### Border Radius Scale (v7)

| Token | Value | Usage |
|---|---|---|
| `radius-xs` | 5px | Inline link chips (rare) |
| `radius-sm` | 8px | Dark utility buttons, inline imagery |
| `radius-md` | 11px | Pearl capsule buttons |
| `radius-lg` | 20px | Restrained glass cards |
| `radius-xl` | 20px | Pills / large shells |
| `radius-xl` | 22px | Config panels |
| `radius-2xl` | 28px | Large panels |
| `radius-3xl` | 36px | Sheet top corners |
| (pill) | `rounded-full` | Primary CTAs, configurator chips |

---

## 14. Dual Mode (Light + Dark — v7)

Light mode: dusk paper (`#eef2f6`), liquid glass, Winter Sky Indigo (`#5a6f9a`), soft sakura/amber atmosphere. Dark mode: night sky (`#0a0c12`), indigo `#8a9bb8` chrome, accent text `#b4bdf0`. Data-semantic palette unchanged in meaning.

Theme transitions: `transition: background-color 200ms ease, color 200ms ease` on `body`. ECharts re-init via a single `useECharts` swap point keeps dual-mode charts in lockstep with the toggle.

---

## 15. Accepted Debt

| Debt | Reason | Owner | Resolution Target |
|---|---|---|---|
| Legacy `font-serif` class resolves to sans | Backward compatibility with pre-v7 heading markup | Next migration wave | Remove after all pages migrated |
| Some chart files still use raw hex (see `hex-ban.test.ts` allowlist) | Incremental migration to `chart-tokens.ts` | W10 cleanup sweep | Zero raw hex after chart migration |
| `text-accent` / `text-primary` bare classes in legacy pages | Pre-v7 aliasing before `bg-primary` migrations landed | W10 cleanup sweep | Zero bare classes after migration |
| React dev tooling (react-scan, react-grab) not yet wired | react-scan@0.5.7 Node import fails under Node 24 (missing JSON import attribute) | Todo 4 | After compatibility verification or runtime fix |
| Playwright E2E uses storage-state auth | Pre-v7 auth setup | Todo 4 | After bootstrap script integration |

---

## Do's and Don'ts

### Do
- Reference tokens (`bg-surface-card`, `text-text-primary`) — never raw hex.
- Use Winter Sky Indigo for **every** interactive element.
- Prefer `.glass-surface` for cards/chrome; content shell `max-w-5xl`.
- Restrained = 14px radii + warm atmosphere only — not mascot clutter or rainbow gradients.
- Use `text-accent-strong` for accent-colored text.
- Set headlines in sans with negative letter-spacing.
- Run body copy at 15px — compact v7 voice.
- Apply `rounded-lg` (12px) to cards; `rounded-full` to primary CTAs.
- Use `chart-accent` for chart emphasis.
- Apply `transform: scale(0.95)` as the active/press state on buttons.
- Use Lucide icons — never emojis.
- Preserve data-semantic colors (PMC, zones, sport, health, recovery, goals).
- Test both light and dark mode for every component.
- Ensure >= 44px touch targets on mobile.
- Include chart provenance (data source + date range).
- Use information-bearing gradients for heatmaps, route traces, intensity bands.

### Don't
- Don't introduce a second accent color.
- Don't add shadows to cards, buttons, or text.
- Don't use decorative gradients.
- Don't set body copy at weight 500.
- Don't round full-bleed sections.
- Don't tighten body line-height below 1.50.
- Don't use raw hex codes — add tokens to `globals.css` first.
- Don't use `h-screen` — use `min-h-[100dvh]`.
- Don't animate `width`, `height`, `top`, `left`.
- Don't mix serif and sans.
- Don't write generic SaaS copy — be athlete-specific.
- Don't make touch targets < 44px on mobile.
- Don't render charts without provenance and empty states.
- Don't reintroduce v6's parchment canvas, 17px body, SF Pro, or 18px radius.
- Don't use Cormorant / serif display — keep Geist.
- Don't reintroduce full-bleed sparse layouts without product decision; default content width is `max-w-5xl`.
- Don't flood the UI with secondary neon colors; indigo is the only chrome accent — sakura/amber are atmosphere-only.
