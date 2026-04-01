# Sha-Desk — Architecture Overview

This document explains how the app is built, for anyone curious about the code or wanting to make changes.

---

## Big Picture

Sha-Desk is a **static single-page application** — there's no server, no compilation step, and no framework. It's plain HTML, CSS, and JavaScript that runs entirely in your browser.

Data is saved to **Supabase**, a hosted database service, so your work syncs across devices and browsers automatically.

```
Browser
 ├── index.html   (page structure)
 ├── styles.css   (visual styling)
 ├── config.js    (your private Supabase credentials)
 └── app.js       (all logic)
       │
       └── Supabase REST API  (cloud database)
```

---

## Data Model

All app data is stored as a single JSON object in one Supabase row. Here's the shape:

```json
{
  "subjects": [
    {
      "id": "abc123",
      "name": "Calculus",
      "icon": "🧮",
      "open": true,
      "driveUrl": "https://...",
      "assignments": [
        {
          "id": "def456",
          "name": "Problem Set 3",
          "icon": "🎀",
          "status": "on-progress",
          "startDate": "2025-03-01T00:00",
          "deadline": "2025-03-07T23:59",
          "submitLink": "",
          "materialFiles": [],
          "materialLinks": [],
          "questionFiles": [],
          "questionLinks": [],
          "tasks": [],
          "notes": "",
          "folderFiles": [],
          "pinned": false
        }
      ],
      "examFolders": [
        {
          "id": "ghi789",
          "type": "uts",
          "name": "UTS Calculus",
          "icon": "📖",
          "examDate": "2025-04-10T08:00",
          "room": "Room B-201",
          "sources": { "book": "", "ppt": "", "collection": "" },
          "materials": [],
          "notes": ""
        }
      ]
    }
  ],
  "examEvents": [
    {
      "id": "jkl012",
      "folderId": "ghi789",
      "date": "2025-04-10",
      "time": "08:00",
      "room": "Room B-201"
    }
  ]
}
```

---

## State Management

State lives in global JavaScript variables at the top of `app.js`:

| Variable | What it holds |
|----------|-------------|
| `subjects` | Array of all subjects (the main data model) |
| `examEvents` | Array of calendar events |
| `mode` | Current mode: `'hw'` or `'exam'` |
| `activeSid` / `activeAid` | ID of the currently open homework subject / assignment |
| `activeESid` / `activeEFid` | ID of the currently open exam subject / folder |

When you interact with the app (click something, type in a field), the JavaScript:
1. Mutates the relevant global array/object
2. Calls `save()` to persist to Supabase (debounced by 400ms)
3. Calls the appropriate render function to update what you see

---

## Persistence

Two layers of saving:

1. **Supabase** (primary) — `save()` POSTs the full JSON to a single Supabase row with `id = 'main'`. It's debounced so it doesn't fire on every keystroke.
2. **localStorage** (backup) — after every successful Supabase save, a copy is written to `localStorage` under the key `sha-backup`.

On load, the app tries Supabase first. If that fails, it falls back to `localStorage`.

On page close, `navigator.sendBeacon()` fires a final save attempt even if the tab closes quickly.

---

## Rendering Approach

There is no virtual DOM or reactive framework. Every state change triggers a **full re-render** of the affected area:

- `renderSidebar()` — rebuilds the entire left sidebar
- `renderHW(sid, aid)` — rebuilds the main content area for a homework assignment
- `renderExam(sid, fid)` — rebuilds the main content area for an exam folder
- `renderCalContent()` — rebuilds the calendar grid inside the modal

After setting `innerHTML`, the corresponding `_bind*()` function wires up all event listeners.

---

## Mode Switching

The app has two modes, toggled at startup via a splash screen:

- **Homework mode** (`body` has no special class) — pink theme, assignment tracking
- **Exam mode** (`body.exam-mode`) — purple-tinted theme, exam folders and materials

Night mode is handled separately by toggling `body.night`. All four combinations are supported via CSS variables.

---

## Files at a Glance

| File | Role |
|------|------|
| `index.html` | Static HTML shell: modals, sidebar container, header, script tags |
| `styles.css` | All CSS — variables, layout, component styles, themes, responsive |
| `config.js` | Two constants: `SB_URL` and `SB_KEY` (loaded before `app.js`) |
| `app.js` | Everything else: data normalization, Supabase I/O, rendering, event handling |
