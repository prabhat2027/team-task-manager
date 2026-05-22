const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');

// GET tasks for a project — filtered by role
router.get('/project/:projectId', auth, (req, res) => {
  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Access denied' });

  const role = req.user.role;
  let tasks;

  if (role === 'hr') {
    tasks = db.prepare(`
      SELECT t.*, u.name as assignee_name, u.role as assignee_role
      FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ? ORDER BY t.created_at DESC
    `).all(req.params.projectId);
  } else if (role === 'project_lead') {
    tasks = db.prepare(`
      SELECT t.*, u.name as assignee_name, u.role as assignee_role
      FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ? AND (u.role IN ('quality_lead','intern') OR t.assignee_id IS NULL OR t.created_by = ?)
      ORDER BY t.created_at DESC
    `).all(req.params.projectId, req.user.id);
  } else if (role === 'quality_lead') {
    tasks = db.prepare(`
      SELECT t.*, u.name as assignee_name, u.role as assignee_role
      FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ? AND (u.role = 'intern' OR t.assignee_id = ?)
      ORDER BY t.created_at DESC
    `).all(req.params.projectId, req.user.id);
  } else {
    tasks = db.prepare(`
      SELECT t.*, u.name as assignee_name FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ? AND t.assignee_id = ?
      ORDER BY t.created_at DESC
    `).all(req.params.projectId, req.user.id);
  }

  res.json(tasks);
});

// CREATE task
router.post('/project/:projectId', auth, (req, res) => {
  if (req.user.role === 'intern')
    return res.status(403).json({ error: 'Interns cannot create tasks' });

  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Access denied' });

  const { title, description, priority, due_date, assignee_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title is required' });

  const result = db.prepare(`
    INSERT INTO tasks (title, description, priority, due_date, assignee_id, project_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', priority || 'medium', due_date || null, assignee_id || null, req.params.projectId, req.user.id);

  res.json({ id: result.lastInsertRowid, title, status: 'todo' });
});

// UPDATE task
router.put('/:id', auth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(task.project_id, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Access denied' });

  const { title, description, status, priority, due_date, assignee_id } = req.body;
  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      due_date = COALESCE(?, due_date),
      assignee_id = COALESCE(?, assignee_id)
    WHERE id = ?
  `).run(title, description, status, priority, due_date, assignee_id, req.params.id);

  res.json({ message: 'Task updated' });
});

// DELETE task
router.delete('/:id', auth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role === 'intern')
    return res.status(403).json({ error: 'Interns cannot delete tasks' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// ── TASK LOGS ──

// Start a task log (existing task OR custom)
router.post('/log/start', auth, (req, res) => {
  const { task_id, project_id, custom_task_title } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });
  if (!task_id && !custom_task_title)
    return res.status(400).json({ error: 'Provide either a task_id or a custom task title' });

  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(project_id, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'You are not in that project' });

  // Check if already has an active log
  const active = db.prepare(
    "SELECT * FROM task_logs WHERE user_id = ? AND status = 'active'"
  ).get(req.user.id);
  if (active) return res.status(400).json({ error: 'You already have an active task running. Finish it first.' });

  const result = db.prepare(`
    INSERT INTO task_logs (task_id, user_id, project_id, custom_task_title, started_at, status)
    VALUES (?, ?, ?, ?, datetime('now'), 'active')
  `).run(task_id || null, req.user.id, project_id, custom_task_title || null);

  // Update task status to in_progress if linked
  if (task_id) {
    db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(task_id);
  }

  res.json({ log_id: result.lastInsertRowid, message: 'Task started' });
});

// Finish a task log
router.post('/log/finish/:logId', auth, (req, res) => {
  const log = db.prepare('SELECT * FROM task_logs WHERE id = ? AND user_id = ?')
    .get(req.params.logId, req.user.id);
  if (!log) return res.status(404).json({ error: 'Log not found' });
  if (log.status === 'finished') return res.status(400).json({ error: 'Already finished' });

  db.prepare(`
    UPDATE task_logs SET finished_at = datetime('now'), status = 'finished' WHERE id = ?
  `).run(req.params.logId);

  // Mark linked task as done
  if (log.task_id) {
    db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(log.task_id);
  }

  res.json({ message: 'Task finished and logged' });
});

// GET my logs (active + today's finished)
router.get('/log/mine', auth, (req, res) => {
  const active = db.prepare(`
    SELECT tl.*, p.name as project_name, p.project_code, t.title as task_title
    FROM task_logs tl
    JOIN projects p ON p.id = tl.project_id
    LEFT JOIN tasks t ON t.id = tl.task_id
    WHERE tl.user_id = ? AND tl.status = 'active'
  `).get(req.user.id);

  const finished = db.prepare(`
    SELECT tl.*, p.name as project_name, p.project_code, t.title as task_title
    FROM task_logs tl
    JOIN projects p ON p.id = tl.project_id
    LEFT JOIN tasks t ON t.id = tl.task_id
    WHERE tl.user_id = ? AND tl.status = 'finished'
    AND date(tl.finished_at) = date('now')
    ORDER BY tl.finished_at DESC
  `).all(req.user.id);

  res.json({ active, finished });
});

// GET all logs for a project (for managers)
router.get('/log/project/:projectId', auth, (req, res) => {
  if (req.user.role === 'intern')
    return res.status(403).json({ error: 'Access denied' });

  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Access denied' });

  const logs = db.prepare(`
    SELECT tl.*, u.name as user_name, u.role as user_role,
           t.title as task_title, p.project_code
    FROM task_logs tl
    JOIN users u ON u.id = tl.user_id
    JOIN projects p ON p.id = tl.project_id
    LEFT JOIN tasks t ON t.id = tl.task_id
    WHERE tl.project_id = ?
    ORDER BY tl.started_at DESC
    LIMIT 50
  `).all(req.params.projectId);

  res.json(logs);
});

module.exports = router;