# Sha-Desk — Style Guide

This document covers the visual design system: colors, typography, CSS variables, and common class patterns.

---

## Color Palette

The app uses **CSS custom properties** (variables) so the whole color scheme can change with a single class on `<body>`.

### Homework Mode (Light — default)

| Variable | Value | Usage |
|----------|-------|-------|
| `--pk` | `#f4a0bc` | Primary pink (borders, highlights) |
| `--pkm` | `#f7bdd0` | Pink medium (hover states) |
| `--pkp` | `#fff5f9` | Pink pale (background fills) |
| `--pkd` | `#fde8f0` | Pink dim (card backgrounds) |
| `--cream` | `#fffaf9` | Page background base |
| `--td` | `#5a2d3e` | Text dark |
| `--tm` | `#9b5c72` | Text medium |
| `--tl` | `#c4899d` | Text light (labels, placeholders) |
| `--bdr` | `#f9d0df` | Border color |
| `--shd` | `rgba(244,160,188,0.18)` | Box shadow color |
| `--bg` | `#fff5f9` | Page background |
| `--bgc` | `#ffffffdd` | Card/panel background |

### Exam Mode Variables (purple overlay)

| Variable | Value | Usage |
|----------|-------|-------|
| `--ex` | `#9b6fd4` | Exam primary purple |
| `--exm` | `#b899e0` | Exam purple medium |
| `--exp` | `#f5eeff` | Exam pale (backgrounds) |
| `--exd` | `#ecdcf8` | Exam dim (hover fills) |
| `--exb` | `#d6b8f5` | Exam border |
| `--exs` | `rgba(155,111,212,0.18)` | Exam shadow |
| `--ext` | `#9a7ac8` | Exam text secondary |
| `--exdark` | `#4a2080` | Exam dark purple |
| `--exlight` | `#d0b8f8` | Exam light purple (text on dark) |
| `--exstrong` | `#6a4aad` | Exam strong purple |

### Night Mode

Night mode re-declares all the same variables with darker values. Key differences:
- `--bg` becomes `#160810` (very dark pink-black)
- `--bgc` becomes `rgba(35,12,22,0.9)`
- `--td` becomes `#f5d0e0` (light pink for readability)
- `--pk` shifts slightly darker: `#e8789a`

### Exam + Night Mode

Both `.exam-mode` and `.night` classes on body — uses dark purple tones:
- `--bg`: `#120a1e`
- `--ex`: `#b899e0`, `--exm`: `#9b6fd4`

---

## Typography

| Font | Usage |
|------|-------|
| **Playfair Display** (serif, italic) | Headings, logo, modal titles, assignment/exam names |
| **DM Sans** | All body text, buttons, inputs, labels |
| **Fragment Mono** | Not currently used but imported |

Fonts are loaded from Google Fonts via the `<link>` tag in `index.html`.

---

## Common CSS Class Patterns

### Shared Base Classes

These classes can be added to any element to apply consistent base styles:

| Class | What it does |
|-------|-------------|
| `.pill-btn` | Pill-shaped button base (border-radius: 99px, cursor, transition) |
| `.label-text` | Uppercase label text (tiny font, letter-spacing, font-weight: 700) |

### Buttons

| Class | Appearance |
|-------|-----------|
| `.btn-ok` | Pink gradient, white text — primary action |
| `.btn-ok.exam` | Purple gradient — primary action in exam mode |
| `.btn-cancel` | White with border — secondary/cancel |
| `.btn-del` | Pink gradient — destructive delete |
| `.icon-btn` | Small square with border — header icon buttons |
| `.add-chip-btn` | Small pill — add file/link chips |
| `.today-btn` | Small pink pill — "today" shortcut |

### Cards

| Class | Usage |
|-------|-------|
| `.card` | Homework page sections (materials, questions, links) |
| `.exam-card` | Exam page sections |
| `.task-card` | Individual task items in a checklist |

### Chips (small inline tags)

| Class | Usage |
|-------|-------|
| `.file-chip` | Attached files (pink gradient) |
| `.link-chip` | Attached links (blue gradient) |
| `.photo-chip` | Attached photo thumbnails |

### Status Dots

Status colors are defined in `STATUSES` in `app.js`:

| Status | Color |
|--------|-------|
| `untouched` | Red `#e05555` |
| `on-progress` | Yellow `#f4c23a` |
| `done` | Blue `#5a9fe0` |
| `submitted` | Green `#5ec47e` |

### Exam Type Badges

| Type | Colors |
|------|--------|
| Quiz | Yellow background `#fff3cd`, text `#856404` |
| UTS | Cyan background `#cff4fc`, text `#0c5460` |
| UAS | Green background `#d1e7dd`, text `#0f5132` |

---

## Adding a New Theme

To add a new color theme:

1. Add a new class override block in `styles.css` under the Variables section, e.g.:
   ```css
   body.my-theme {
     --pk: #your-color;
     --pkm: #your-color;
     /* ... all variables ... */
   }
   ```
2. In `app.js`, add a toggle button that adds/removes `my-theme` from `document.body.classList`
3. Persist the preference to `localStorage` like the existing night mode does

---

## Animations

All `@keyframes` are defined in the Animations section of `styles.css`:

| Name | Used for |
|------|---------|
| `float` | Floating ribbon decorations |
| `fadeIn` | Page content appearing |
| `slideIn` | Sidebar items appearing |
| `popIn` | Modal/picker appearing |
| `msFadeIn` | Mode selector overlay fade |
| `msLogoIn` | Mode selector logo entrance |
| `msFadeUp` | Mode selector cards entrance |
| `bowSway` | Mode selector bow animation |
| `bowSwayR` | Mode selector bow animation (reversed) |
| `floatDot` | Mode selector logo bow floating |
| `msPetal` | Falling petal animation |
| `lr1–lr4` | Loading screen ribbon animations |
| `ldot` | Loading screen dot pulse |
