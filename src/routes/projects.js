const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');

// Who can add whom:
// HR → project_lead, ql, intern
// project_lead → quality_lead, intern
// quality_lead → intern
const canAdd = {
  hr: ['project_lead', 'quality_lead', 'intern'],
  project_lead: ['quality_lead', 'intern'],
  quality_lead: ['intern']
};

// GET projects visible to logged-in user
router.get('/', auth, (req, res) => {
  const projects = db.prepare(`
    SELECT p.* FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = ?
  `).all(req.user.id);
  res.json(projects);
});

// CREATE project — HR only
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'hr')
    return res.status(403).json({ error: 'Only HR can create projects' });

  const { name, description, project_code } = req.body;
  if (!name || !project_code)
    return res.status(400).json({ error: 'Project name and project code are required' });

  const existing = db.prepare('SELECT id FROM projects WHERE project_code = ?').get(project_code);
  if (existing) return res.status(400).json({ error: 'Project code already exists' });

  const result = db.prepare(
    'INSERT INTO projects (name, description, project_code, owner_id) VALUES (?, ?, ?, ?)'
  ).run(name, description || '', project_code.toUpperCase(), req.user.id);

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, added_by) VALUES (?, ?, ?)'
  ).run(result.lastInsertRowid, req.user.id, req.user.id);

  res.json({ id: result.lastInsertRowid, name, project_code, description });
});

// GET project detail + members filtered by requester's role
router.get('/:id', auth, (req, res) => {
  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Access denied' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);

  // Filter members based on role hierarchy
  let members = [];
  const role = req.user.role;

  if (role === 'hr') {
    members = db.prepare(`
      SELECT u.id, u.name, u.email, u.role FROM users u
      JOIN project_members pm ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `).all(req.params.id);
  } else if (role === 'project_lead') {
    members = db.prepare(`
      SELECT u.id, u.name, u.email, u.role FROM users u
      JOIN project_members pm ON pm.user_id = u.id
      WHERE pm.project_id = ? AND u.role IN ('quality_lead','intern','project_lead')
    `).all(req.params.id);
  } else if (role === 'quality_lead') {
    members = db.prepare(`
      SELECT u.id, u.name, u.email, u.role FROM users u
      JOIN project_members pm ON pm.user_id = u.id
      WHERE pm.project_id = ? AND (u.role = 'intern' OR u.id = ?)
    `).all(req.params.id, req.user.id);
  } else {
    members = db.prepare(`
      SELECT u.id, u.name, u.email, u.role FROM users u
      WHERE u.id = ?
    `).all(req.user.id);
  }

  res.json({ ...project, members });
});

// ADD member — role-restricted
router.post('/:id/members', auth, (req, res) => {
  const isMember = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!isMember)
    return res.status(403).json({ error: 'You are not in this project' });

  const allowed = canAdd[req.user.role];
  if (!allowed)
    return res.status(403).json({ error: 'Interns cannot add members' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const userToAdd = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!userToAdd) return res.status(404).json({ error: 'No user found with that email' });

  if (!allowed.includes(userToAdd.role))
    return res.status(403).json({ error: `You cannot add a ${userToAdd.role} to this project` });

  try {
    db.prepare(
      'INSERT INTO project_members (project_id, user_id, added_by) VALUES (?, ?, ?)'
    ).run(req.params.id, userToAdd.id, req.user.id);
    res.json({ message: `${userToAdd.name} (${userToAdd.role}) added successfully` });
  } catch (e) {
    res.status(400).json({ error: 'User is already in this project' });
  }
});

// DELETE project — HR only
router.delete('/:id', auth, (req, res) => {
  if (req.user.role !== 'hr')
    return res.status(403).json({ error: 'Only HR can delete projects' });

  db.prepare('DELETE FROM task_logs WHERE project_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE project_id = ?').run(req.params.id);
  db.prepare('DELETE FROM project_members WHERE project_id = ?').run(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Project deleted' });
});

module.exports = router;