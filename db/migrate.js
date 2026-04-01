/**
 * Sha-Desk — One-time migration script
 *
 * Reads the old single-JSONB-blob `data` table and writes all records
 * into the new relational tables created by schema.sql.
 *
 * HOW TO RUN:
 *   1. Run db/schema.sql in Supabase SQL Editor first.
 *   2. Open sha_desk/index.html in your browser (so SB_URL and SB_KEY are available).
 *   3. Open DevTools → Console.
 *   4. Copy and paste the entire contents of this file into the console.
 *   5. Press Enter and wait for "Migration complete ✅" (or an error message).
 *   6. Reload the page — the app will now load from the new tables.
 *
 * SAFE TO RE-RUN: Uses INSERT … ON CONFLICT DO NOTHING so duplicate rows are skipped.
 */

(async function migrate() {

  const _uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ── HTTP helpers ──────────────────────────────────────────────────────────
  async function _get(path) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
    });
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async function _insert(table, record) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        // ignore duplicates so the script is safe to re-run
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(record),
    });
    if (!r.ok) {
      const msg = await r.text();
      console.error(`INSERT into ${table} failed:`, msg, record);
      throw new Error(`INSERT ${table} → ${r.status}: ${msg}`);
    }
  }

  // ── Load old blob ─────────────────────────────────────────────────────────
  console.log('📦 Reading old data table…');
  const rows = await _get('data?id=eq.main&select=content');
  if (!rows.length || !rows[0].content) {
    console.warn('⚠️  Old data table is empty or missing. Nothing to migrate.');
    return;
  }

  const blob = rows[0].content;
  const subjects = Array.isArray(blob) ? blob : (blob.subjects || []);
  const examEventBlob = blob.examEvents || [];

  let counts = {
    subjects: 0, assignments: 0, tasks: 0,
    aFiles: 0, aLinks: 0, tLinks: 0, tPhotos: 0,
    examFolders: 0, examMaterials: 0, mLinks: 0, mFiles: 0, examEvents: 0
  };

  // ── Migrate subjects ──────────────────────────────────────────────────────
  for (let si = 0; si < subjects.length; si++) {
    const s = subjects[si];
    if (!s || !s.id) { console.warn('Skipping subject with no id:', s); continue; }

    await _insert('subjects', {
      id:         s.id,
      name:       s.name       || 'Untitled',
      icon:       s.icon       || '📚',
      drive_link: s.driveLink  || null,
      position:   si,
    });
    counts.subjects++;

    // ── Assignments ────────────────────────────────────────────────────────
    const assignments = s.assignments || [];
    for (let ai = 0; ai < assignments.length; ai++) {
      const a = assignments[ai];
      if (!a || !a.id) continue;

      await _insert('assignments', {
        id:          a.id,
        subject_id:  s.id,
        name:        a.name        || '',
        icon:        a.icon        || '🎀',
        status:      a.status      || 'untouched',
        start_date:  a.startDate   || null,
        due_date:    a.dueDate     || null,
        due_time:    a.dueTime     || null,
        submit_link: a.submitLink  || '',
        submitted:   !!a.submitted,
        notes:       a.notes       || '',
        pinned:      !!a.pinned,
        position:    ai,
      });
      counts.assignments++;

      // material files
      for (const f of (a.materialFiles || [])) {
        if (!f || !f.data) continue;
        await _insert('assignment_files', { id: _uid(), assignment_id: a.id, category: 'material', name: f.name || '', data: f.data, type: f.type || '' });
        counts.aFiles++;
      }
      // material links (plain strings in old format)
      for (const l of (a.materialLinks || [])) {
        const url = typeof l === 'string' ? l : l.url;
        if (!url) continue;
        await _insert('assignment_links', { id: _uid(), assignment_id: a.id, category: 'material', url });
        counts.aLinks++;
      }
      // question files
      for (const f of (a.questionFiles || [])) {
        if (!f || !f.data) continue;
        await _insert('assignment_files', { id: _uid(), assignment_id: a.id, category: 'question', name: f.name || '', data: f.data, type: f.type || '' });
        counts.aFiles++;
      }
      // question links
      for (const l of (a.questionLinks || [])) {
        const url = typeof l === 'string' ? l : l.url;
        if (!url) continue;
        await _insert('assignment_links', { id: _uid(), assignment_id: a.id, category: 'question', url });
        counts.aLinks++;
      }
      // folder attachments
      for (const f of (a.folderAttachments || [])) {
        if (!f || !f.data) continue;
        await _insert('assignment_files', { id: _uid(), assignment_id: a.id, category: 'folder', name: f.name || '', data: f.data, type: f.type || '' });
        counts.aFiles++;
      }
      // folder links
      for (const l of (a.folderLinks || [])) {
        const url = typeof l === 'string' ? l : l.url;
        if (!url) continue;
        await _insert('assignment_links', { id: _uid(), assignment_id: a.id, category: 'folder', url });
        counts.aLinks++;
      }

      // tasks
      const tasks = a.tasks || [];
      for (let ti = 0; ti < tasks.length; ti++) {
        const t = tasks[ti];
        if (!t) continue;
        const tid = t.id || _uid();
        await _insert('tasks', { id: tid, assignment_id: a.id, label: t.label || '', done: !!t.done, position: ti });
        counts.tasks++;

        for (const l of (t.links || [])) {
          const url = typeof l === 'string' ? l : l.url;
          if (!url) continue;
          await _insert('task_links', { id: _uid(), task_id: tid, url });
          counts.tLinks++;
        }
        for (const p of (t.photos || [])) {
          const data = typeof p === 'string' ? p : p.data;
          if (!data) continue;
          await _insert('task_photos', { id: _uid(), task_id: tid, data });
          counts.tPhotos++;
        }
      }
    }

    // ── Exam folders ───────────────────────────────────────────────────────
    const exams = s.exams || [];
    for (let fi = 0; fi < exams.length; fi++) {
      const f = exams[fi];
      if (!f || !f.id) continue;

      await _insert('exam_folders', {
        id:               f.id,
        subject_id:       s.id,
        exam_type:        f.examType        || 'quiz1',
        name:             f.name            || '',
        icon:             f.icon            || '📖',
        exam_date:        f.examDate        || null,
        exam_time:        f.examTime        || null,
        exam_room:        f.examRoom        || '',
        main_source:      f.mainSource      || '',
        ppt_link:         f.pptLink         || '',
        exam_collections: f.examCollections || '',
        notes:            f.notes           || '',
        position:         fi,
      });
      counts.examFolders++;

      // exam materials
      const materiList = f.materiList || [];
      for (let mi = 0; mi < materiList.length; mi++) {
        const m = materiList[mi];
        if (!m) continue;
        const mid = m.id || _uid();
        await _insert('exam_materials', { id: mid, folder_id: f.id, name: m.name || '', done: !!m.done, position: mi });
        counts.examMaterials++;

        for (const l of (m.links || [])) {
          const url = typeof l === 'string' ? l : l.url;
          if (!url) continue;
          await _insert('exam_material_links', { id: _uid(), material_id: mid, url });
          counts.mLinks++;
        }
        for (const file of (m.files || [])) {
          if (!file || !file.data) continue;
          await _insert('exam_material_files', { id: _uid(), material_id: mid, name: file.name || '', data: file.data, type: file.type || '' });
          counts.mFiles++;
        }
      }

      // exam event linked to this folder
      const ev = examEventBlob.find(e => e && e.folderId === f.id);
      if (ev && ev.date) {
        await _insert('exam_events', { id: ev.id || _uid(), folder_id: f.id, date: ev.date, time: ev.time || null, room: ev.room || '' });
        counts.examEvents++;
      }
    }
  }

  console.log('');
  console.log('Migration complete ✅');
  console.log('Records inserted:');
  console.table(counts);
  console.log('');
  console.log('Next step: reload the page. The app will now load from the new tables.');

})().catch(err => {
  console.error('❌ Migration failed:', err);
});
