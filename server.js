require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves your HTML files

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/tasks', require('./src/routes/tasks'));
app.use('/api/dashboard', require('./src/routes/dashboard'));

// Serve frontend for all other routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
