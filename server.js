require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const assessmentRoutes = require('./routes/assessments');
const questionRoutes = require('./routes/questions');
const submissionRoutes = require('./routes/submissions');
const evaluateRoutes = require('./routes/evaluate');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/assessments', assessmentRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/evaluate', evaluateRoutes);

// Page routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/take/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assessment.html'));
});

app.get('/results/:submissionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Assessment Tool running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
