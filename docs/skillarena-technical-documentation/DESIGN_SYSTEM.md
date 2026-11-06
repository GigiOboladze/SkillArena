# Design System

Documented as it exists. No redesign proposed.

Everything lives in **`src/app/globals.css` (359 lines)** — Tailwind v4 CSS-first, so there is
**no `tailwind.config.js`**. Tokens are CSS custom properties exposed to Tailwind via `@theme inline`.

## Theming

Dark is the **unqualified `:root`** default; light is an explicit `[data-theme="light"]` override. That
ordering is deliberate: a first paint with no stored preference, or with JS disabled, renders dark rather
than flashing the wrong scheme.

```css
:root                    { --background:#09090f; --rahoot-red:#7c5cff; … color-scheme: dark;  }
:root[data-theme="light"]{ --background:#f6f6fb; --rahoot-red:#7c5cff; … color-scheme: light; }
```

### Token reference

| Token | Dark | Light | Role |
|---|---|---|---|
| `--background` | `#09090f` | `#f6f6fb` | page ground |
| `--foreground` | `#f4f3fa` | `#171833` | body text |
| `--rahoot-red` | `#7c5cff` | `#7c5cff` | **primary** (violet, despite the name) |
| `--rahoot-red-dark` | `#5b3df0` | `#5b3df0` | primary hover |
| `--rahoot-red-light` | violet @ 16% | violet @ 10% | tinted fills |
| `--rahoot-red-glow` | violet @ 35% | violet @ 25% | button glow shadow |
| `--rahoot-ink` | `#f4f3fa` | `#171833` | headings |
| `--rahoot-muted` | `#9797ab` | `#64647d` | secondary text |
| `--rahoot-border` | `#26263a` | `#e5e5f0` | borders |
| `--rahoot-surface` | `#131320` | `#ffffff` | cards, inputs |
| `--on-primary` | `#fbfaff` | `#fbfaff` | text on a primary fill |
| `--skillarena-accent` | `#f97316` | `#f97316` | **secondary** — medals, streaks, warnings |
| `--skillarena-accent-light` | orange @ 16% | orange @ 12% | accent tint |
| `--badge-{success,danger,neutral}-{bg,text}` | green/red/white tints | darker equivalents | status, independent of brand |
| `--card-shadow`, `--card-shadow-hover` | heavier blacks | subtle navy | elevation |

**Two-accent system.** Violet is the primary (buttons, links, focus, borders); orange is reserved for
competitive/gamified highlights so a medal never looks like a button. The orange is inherited from the
original Rahoot palette ("matches the owl logo") rather than being newly invented.

**Status colours are intentionally brand-independent**, so "failed" reads red whatever the primary is.

> Note: the comment block at `globals.css:10-16` says the light theme's accent is the orange
> `#f97316`/`#ea580c` pair. In the actual `[data-theme="light"]` block, `--rahoot-red` stays **violet** and
> only `--skillarena-accent` is orange. The comment describes an earlier intent; the code is the truth.

### Theme persistence, without a flash

1. `ThemeInitScript` (`src/components/ThemeInitScript.tsx`) renders an inline
   `<Script strategy="beforeInteractive">` that Next hoists into `<head>`. It reads
   `localStorage["skillarena-theme"]`, falls back to `"dark"` for any unrecognised value, and sets
   `html[data-theme]` **before first paint**. Wrapped in `try{}catch{}` for private browsing.
2. `<html suppressHydrationWarning>` (`layout.tsx:26`) is required because that script mutates the DOM
   before React hydrates.
3. `ThemeToggle` reads the **actual** attribute from the DOM on mount rather than assuming dark, then flips
   the attribute and writes `localStorage` (also in `try/catch`). It renders `disabled` with `opacity: 0`
   until mounted, so there is no wrong-icon flash either.

ESLint warns about `beforeInteractive` outside `pages/_document.js`. It is a deliberate trade — that
strategy is precisely what prevents the flash.

**Coverage gap:** `ThemeToggle` appears on the homepage, both logins, `/dashboard`, `/quiz`, `/admin` and
`/inco/status` — and on **none** of `/join`, `/play/*`, `/homeworks/*`, `/my-homeworks`, or any
`/hootarena/*` route (verified by import scan). Those pages still render correctly in dark; they simply
offer no switch.

## Component classes

Reusable classes in `globals.css`, so pages don't repeat long utility strings:

- **`.btn`** — inline-flex, `rounded-xl`, `font-weight:700`, `0.75rem 1.5rem`, `2px` transparent border,
  `:active { scale(0.97) }`, `:disabled { opacity:.5; cursor:not-allowed }`.
  - `.btn-primary` — violet fill, `--on-primary` text, violet glow on hover.
  - `.btn-outline` — surface fill, violet text and border, tinted hover.
- **`.card`** — surface, 1px border, `rounded-2xl`, token shadow. `a.card:hover` and
  `.card.card-interactive:hover` lift by 2px and switch the border to violet. Note the hover is opt-in:
  a plain `.card` is static, so non-clickable cards don't pretend to be interactive.
- **`.input`** — full-width, surface, 2px border, `rounded-xl`, violet border on focus. Used for text
  inputs, textareas **and** selects, so form controls stay visually identical.
- **`.badge`** — pill, uppercase, `0.75rem`, 700 weight, with `-success` / `-danger` / `-neutral` /
  `-warning` variants.
- **`.group-pill`** — a compact radio pill: a real `<input type="radio">` positioned `inset:0` with
  `opacity:0` over a styled label, with `:has(input:checked)` driving the selected look and
  `:has(input:focus-visible)` restoring a focus ring. Keyboard navigation and screen-reader semantics come
  free because the native input is still there.
- **`.theme-toggle`** — 2.5rem circle; the sun/moon SVGs cross-fade, slide and rotate purely from
  `data-state`, no JS animation loop.
- **`.question-form:has(…)`** — hides `[data-mc-only]` when the PARAGRAPH radio is checked. Conditional UI
  with zero JavaScript.

### React components
`OptionTile` / `OptionGrid` (`src/components/AnswerTiles.tsx`) are the answer-tile primitives shared by all
three answering UIs. `OptionTile` takes `state: "idle" | "selected" | "dimmed"` — one prop, three mutually
exclusive looks, plus `aria-pressed` and a `✓` marker when selected. `OptionGrid` is **always
`grid-cols-2`**, even on mobile, with a comment explaining the choice: it keeps the familiar 2×2 layout for
the common four-option case at every width.

## Motion

Restrained and reduced-motion-aware throughout:
- `main { animation: page-enter 0.25s ease-out }` — a 4px rise and fade, wrapped in
  `@media (prefers-reduced-motion: no-preference)`.
- `.tile-pop` — a 0.4s bouncy `cubic-bezier(0.34, 1.56, 0.64, 1)` scale/rotate when an answer is picked.
- A global `@media (prefers-reduced-motion: reduce)` block collapses every animation and transition to
  `0.001ms !important`.
- `CountUp` checks `matchMedia("(prefers-reduced-motion: reduce)")` in JS and jumps straight to the final
  value.
- `QuizTimer` has three urgency tiers — normal (100–31s), `--skillarena-accent` + `scale(1.05)` (30–11s),
  and `--rahoot-red` + `animate-pulse scale(1.10)` (≤10s) — deliberately so the countdown doesn't pulse
  for the whole last third of every question.

## Typography
`Geist` and `Geist_Mono` via `next/font/google`, exposed as `--font-geist-sans` / `--font-geist-mono` and
mapped to Tailwind's `--font-sans` / `--font-mono`. Scores, timers and codes use `font-mono` with
`tabular-nums` so digits don't shift width as they change. Headings are `font-black`, often
`uppercase tracking-tight`; the `Logo` wordmark is real text at `fontSize: size * 0.62`, not an image, so it
adopts the theme colour and stays sharp (the source asset is white-on-black only and would be invisible in
light mode).

## Responsive design

Mobile-first with Tailwind's default breakpoints; in practice only **`sm:` (640px)** is used, plus a handful
of `max-w-*` containers. There is no `md:`/`lg:`/`xl:` usage of consequence.

Recurring patterns:
- Containers: `max-w-5xl` (admin/dashboard shells), `max-w-2xl` (detail pages), `max-w-lg`/`max-w-sm`
  (forms, play screens), always with `px-6` gutters.
- `grid-cols-1 sm:grid-cols-2` / `sm:grid-cols-3` / `sm:grid-cols-4` for cards and stat tiles.
- `flex-wrap` on every header and nav row, so the admin nav's nine links wrap rather than overflow.
- `flex-col sm:flex-row` for label/control rows.
- Wide tables get `overflow-x-auto` + `min-w-[640px]` (quiz results, attempt answers) — a horizontal scroll
  is accepted for genuinely tabular data rather than reflowing it.
- `OptionGrid` stays 2 columns at all widths, as noted above.

`e2e/privacy-and-responsive.mjs` asserts **no horizontal page overflow at a 390px viewport** for the key
routes, and that no uncaught client errors occur during that pass. That is the only automated responsive
check.

## Accessibility — what's present and what isn't

**Present:** semantic `<main>`/`<header>`/`<nav>`/`<section>`/`<ol>`/`<fieldset>`/`<legend>`; real
`<label>`-wrapped inputs throughout; `aria-pressed` on answer tiles; `role="radiogroup"` +
`aria-label` on the group-pill rows; `aria-label` on the theme toggle that describes the *action*;
`aria-hidden` on decorative SVGs and the percentage bars; `:focus-visible` rings preserved on the visually
hidden radios; full `prefers-reduced-motion` support; `color-scheme` set so native controls and scrollbars
match the theme.

**Gaps (none verified with an audit tool — this is from reading):**
- Medals are bare emoji (`🥇🥈🥉`) with no text alternative, so rank 1–3 may be announced as "trophy".
- Status is often colour-plus-text, but the reveal bars convey distribution by width and colour only.
- No skip-link, and no visible focus management after client-side navigation.
- No `aria-live` region for the countdown or the "X/Y answered" counter, so neither is announced.
- Several `!important`-style Tailwind overrides (`!py-2`, `!px-4`) shrink buttons below the 44px touch
  target in dense admin rows.
- Contrast was not measured. `--rahoot-muted` on `--rahoot-surface` in dark mode (`#9797ab` on `#131320`)
  is the pair most worth checking.

## Conventions to follow when extending

1. Add a token to **both** `:root` and `:root[data-theme="light"]`, then surface it under `@theme inline`.
   Never hardcode a hex in a component — the one existing violation is `AnswerTiles.tsx:37`, which uses
   `text-[#fbfaff]` where every other call site uses `text-[color:var(--on-primary)]`.
2. Reuse `.btn` / `.card` / `.input` / `.badge` rather than re-deriving the look.
3. Keep violet for actions and orange for achievement.
4. Prefer a CSS `:has()` solution over client state for simple conditional UI — there is precedent
   (`.question-form`, `.group-pill`).
5. Wrap any new motion in `prefers-reduced-motion`.
6. Keep `ThemeToggle` in new route trees — and consider adding it to the legacy/HootArena ones.
