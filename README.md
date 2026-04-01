# Sha-Desk 🎀

Your personal digital study desk — homework tracker and exam prep tool, all in one pretty place.

---

## How to Run

There's no installation, no terminal, no complicated setup. You just need a browser (Chrome, Firefox, Safari, or Edge).

**Step 1 — Set up your credentials file**

1. Find the file called `config.example.js` in this folder
2. Make a copy of it
3. Rename the copy to exactly: `config.js`
4. Open `config.js` in any text editor (Notepad, TextEdit, etc.)
5. Replace `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_ANON_KEY` with your real values (see below)
6. Save the file

**Step 2 — Open the app**

Double-click `index.html` — it will open in your browser and you're good to go!

> If the page loads but shows a "could not connect" style error, it usually means the credentials in `config.js` aren't correct. Double-check them.

---

## How to Get Your Supabase Credentials

Supabase is the cloud database that saves all your notes and assignments. Here's how to find your keys:

1. Go to [https://supabase.com](https://supabase.com) and sign in to your account
2. Click on your project
3. In the left sidebar, click **Settings** (the gear icon at the bottom)
4. Click **API** under the Settings section
5. You'll see two things you need:
   - **Project URL** — looks like `https://xxxxxxxx.supabase.co` → copy this into `SB_URL`
   - **anon / public** key — a long string of letters and numbers → copy this into `SB_KEY`

> **Keep `config.js` private!** Don't share it, don't send it to friends, don't post it online. It's like a password to your data.

---

## Features

- **Homework Mode** — track assignments by subject with status, deadlines, tasks, file attachments, and notes
- **Exam Prep Mode** — organize exam folders (Quiz, UTS, UAS) with study materials, source links, and a live countdown timer
- **Exam Calendar** — see all upcoming exams in a monthly view
- **Dark Mode** — click the 🌙 button in the top-right corner
- **Auto-save** — your work saves automatically to Supabase as you type, with a local backup too
- **Pin important items** — right-click any assignment to pin it to the top of the sidebar

---

## File Overview

| File | What it does |
|------|-------------|
| `index.html` | The app's page structure (this is what you open) |
| `styles.css` | All the visual styling and colors |
| `app.js` | All the app logic |
| `config.js` | **Your private** Supabase credentials — don't share! |
| `config.example.js` | A blank template for `config.js` — safe to share |

---

## Troubleshooting

**The page opens but nothing loads / it stays on the loading screen**
- Check that `config.js` exists and has your real credentials in it (not the placeholder text)

**My data looks different / some things are missing**
- This can happen with **Supabase free tier**: your project gets "paused" if you haven't used it for 7 days. While it's waking up, the app falls back to a local backup — which might be slightly older. Your real data is safe in Supabase; it will show up correctly on the next page load once the project is fully awake.
- To prevent this: log into [supabase.com](https://supabase.com) occasionally and open your project to keep it active. Or upgrade to the Pro plan to disable pausing.

**My data disappeared**
- The app auto-saves as you work — wait until the "saving~ 🎀" indicator disappears before closing the tab
- Data is also backed up in your browser's local storage as a safety net

**I want to use it on a different computer**
- Copy the whole `sha_desk` folder to the other computer, including your `config.js`
- Open `index.html` there — your data loads from Supabase automatically

---

## More Info

See the [`docs/`](docs/) folder for a deeper look at how the app works:
- [`docs/architecture.md`](docs/architecture.md) — how the data and code are structured
- [`docs/style-guide.md`](docs/style-guide.md) — color palette, fonts, and CSS variable reference
