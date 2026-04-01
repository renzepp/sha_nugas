-- ═══════════════════════════════════════════════════════════════
--  Sha-Desk — Relational Schema
--  Run this entire file in Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- Subjects (courses / matkul)
CREATE TABLE IF NOT EXISTS subjects (
  id         text PRIMARY KEY,
  name       text NOT NULL DEFAULT '',
  icon       text NOT NULL DEFAULT '📚',
  drive_link text,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Homework assignments
CREATE TABLE IF NOT EXISTS assignments (
  id          text PRIMARY KEY,
  subject_id  text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  icon        text NOT NULL DEFAULT '🎀',
  status      text NOT NULL DEFAULT 'untouched',
  start_date  text,             -- stored as 'YYYY-MM-DD' string
  due_date    text,
  due_time    text,             -- stored as 'HH:MM' string
  submit_link text NOT NULL DEFAULT '',
  submitted   boolean NOT NULL DEFAULT false,
  notes       text NOT NULL DEFAULT '',
  pinned      boolean NOT NULL DEFAULT false,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Files attached to assignments (material files, question files, folder files)
CREATE TABLE IF NOT EXISTS assignment_files (
  id            text PRIMARY KEY,
  assignment_id text NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  category      text NOT NULL,  -- 'material' | 'question' | 'folder'
  name          text NOT NULL DEFAULT '',
  data          text NOT NULL DEFAULT '',  -- base64 data URL
  type          text NOT NULL DEFAULT '',  -- MIME type e.g. 'image/jpeg'
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Links attached to assignments
CREATE TABLE IF NOT EXISTS assignment_links (
  id            text PRIMARY KEY,
  assignment_id text NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  category      text NOT NULL,  -- 'material' | 'question' | 'folder'
  url           text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Task checklist items inside an assignment
CREATE TABLE IF NOT EXISTS tasks (
  id            text PRIMARY KEY,
  assignment_id text NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  label         text NOT NULL DEFAULT '',
  done          boolean NOT NULL DEFAULT false,
  position      int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Links attached to tasks (answer/reference links)
CREATE TABLE IF NOT EXISTS task_links (
  id         text PRIMARY KEY,
  task_id    text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url        text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Photos attached to tasks (base64)
CREATE TABLE IF NOT EXISTS task_photos (
  id         text PRIMARY KEY,
  task_id    text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  data       text NOT NULL DEFAULT '',  -- base64 data URL
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Exam preparation folders (Quiz / UTS / UAS per subject)
CREATE TABLE IF NOT EXISTS exam_folders (
  id               text PRIMARY KEY,
  subject_id       text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_type        text NOT NULL DEFAULT 'quiz1',
  name             text NOT NULL DEFAULT '',
  icon             text NOT NULL DEFAULT '📖',
  exam_date        text,
  exam_time        text,
  exam_room        text NOT NULL DEFAULT '',
  main_source      text NOT NULL DEFAULT '',
  ppt_link         text NOT NULL DEFAULT '',
  exam_collections text NOT NULL DEFAULT '',
  notes            text NOT NULL DEFAULT '',
  position         int  NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Study materials checklist inside an exam folder
CREATE TABLE IF NOT EXISTS exam_materials (
  id         text PRIMARY KEY,
  folder_id  text NOT NULL REFERENCES exam_folders(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  done       boolean NOT NULL DEFAULT false,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Links attached to exam materials
CREATE TABLE IF NOT EXISTS exam_material_links (
  id          text PRIMARY KEY,
  material_id text NOT NULL REFERENCES exam_materials(id) ON DELETE CASCADE,
  url         text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Files attached to exam materials
CREATE TABLE IF NOT EXISTS exam_material_files (
  id          text PRIMARY KEY,
  material_id text NOT NULL REFERENCES exam_materials(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  data        text NOT NULL DEFAULT '',  -- base64 data URL
  type        text NOT NULL DEFAULT '',  -- MIME type
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Calendar exam events (one per exam folder, links folder to a date)
CREATE TABLE IF NOT EXISTS exam_events (
  id         text PRIMARY KEY,
  folder_id  text NOT NULL REFERENCES exam_folders(id) ON DELETE CASCADE,
  date       text,   -- 'YYYY-MM-DD'
  time       text,   -- 'HH:MM'
  room       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ─── Row Level Security ───────────────────────────────────────
-- This is a single-user app using the anon key directly.
-- We enable RLS then grant full access to the anon role.
-- If you add auth later, tighten these policies.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'subjects', 'assignments', 'assignment_files', 'assignment_links',
    'tasks', 'task_links', 'task_photos',
    'exam_folders', 'exam_materials', 'exam_material_links', 'exam_material_files',
    'exam_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    -- Drop existing policy if re-running this script
    EXECUTE format(
      'DROP POLICY IF EXISTS allow_anon ON %I', tbl
    );
    EXECUTE format(
      'CREATE POLICY allow_anon ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;
