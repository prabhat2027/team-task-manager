const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalTasks = db.prepare(`
    SELECT COUNT(*) as count FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE pm.user_id = ?
  `).get(req.user.id);

  const doneTasks = db.prepare(`
    SELECT COUNT(*) as count FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE pm.user_id = ? AND t.status = 'done'
  `).get(req.user.id);

  const overdueTasks = db.prepare(`
    SELECT COUNT(*) as count FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE pm.user_id = ? AND t.due_date < ? AND t.status != 'done'
  `).get(req.user.id, today);

  const myTasks = db.prepare(`
    SELECT t.*, p.name as project_name FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_id = ?
    ORDER BY t.due_date ASC
    LIMIT 10
  `).all(req.user.id);

  res.json({
    total: totalTasks.count,
    done: doneTasks.count,
    overdue: overdueTasks.count,
    inProgress: totalTasks.count - doneTasks.count - overdueTasks.count,
    myTasks
  });
});

module.exports = router;
