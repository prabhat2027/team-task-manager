const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const VALID_ROLES = ['intern', 'quality_lead', 'project_lead', 'hr'];

router.post('/signup', (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'All fields including role are required' });

  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'Invalid role selected' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing)
    return res.status(400).json({ error: 'Email already registered' });

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, hashedPassword, role);

  const token = jwt.sign(
    { id: result.lastInsertRowid, email, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: result.lastInsertRowid, name, email, role } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ error: 'Invalid email or password' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Invalid email or password' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;