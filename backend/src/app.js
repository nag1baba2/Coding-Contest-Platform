const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const contestRoutes = require('./routes/contestRoutes');
const questionRoutes = require('./routes/questionRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const userRoutes = require('./routes/userRoutes');
const registrationRoutes = require('./routes/registrationRoutes');
const errorHandler = require('./middleware/errorHandler');

// App is built separately from server.js (which calls app.listen) so
// Supertest can import this file directly in tests without binding
// a real port.
const app = express();

app.use(cors());
app.use(express.json());

// Serve the frontend static files from the /frontend folder
app.use(express.static(path.join(__dirname, '../../frontend')));

// Root redirect → login page
app.get('/', (req, res) => res.redirect('/pages/login.html'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/registrations', registrationRoutes);

// Must be registered last - Express error middleware only catches
// errors from routes defined before it.
app.use(errorHandler);

module.exports = app;
