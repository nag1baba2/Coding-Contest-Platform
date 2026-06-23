// ============================================================
// API client - single source of truth for talking to the backend.
// Every page includes this file before its own page-specific script.
// ============================================================

const API_BASE = 'http://localhost:5000/api';

const Auth = {
  getToken() {
    return sessionStorage.getItem('contest_platform_token');
  },
  getUser() {
    const raw = sessionStorage.getItem('contest_platform_user');
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    sessionStorage.setItem('contest_platform_token', token);
    sessionStorage.setItem('contest_platform_user', JSON.stringify(user));
  },
  clearSession() {
    sessionStorage.removeItem('contest_platform_token');
    sessionStorage.removeItem('contest_platform_user');
  },
  isLoggedIn() {
    return !!this.getToken();
  },
  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },
  // Call at the top of every protected page. Redirects to login if
  // there's no session, or to the student dashboard if an admin-only
  // page is hit by a non-admin.
  requireAuth({ adminOnly = false } = {}) {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    if (adminOnly && !this.isAdmin()) {
      window.location.href = 'contests.html';
      return false;
    }
    return true;
  },
};

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const Api = {
  async request(path, { method = 'GET', body = null, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && Auth.getToken()) {
      headers.Authorization = `Bearer ${Auth.getToken()}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      // Server unreachable (not running, wrong port, CORS, etc.) -
      // distinguish this from a normal API error response so the UI
      // can show a clearer message than "undefined error".
      throw new ApiError(
        'Could not reach the server. Is the backend running on port 5000?',
        0
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch (parseErr) {
      // Empty or non-JSON body - fine for some responses, but if the
      // request also failed, we still need *a* message to show.
    }

    if (!response.ok) {
      throw new ApiError(
        (data && data.error) || `Request failed (${response.status})`,
        response.status,
        data
      );
    }

    return data;
  },

  // Auth
  register(name, email, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: false,
    });
  },
  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
  },

  // Contests
  listContests() {
    return this.request('/contests');
  },
  getContest(id) {
    return this.request(`/contests/${id}`);
  },
  createContest(payload) {
    return this.request('/contests', { method: 'POST', body: payload });
  },
  updateContest(id, payload) {
    return this.request(`/contests/${id}`, { method: 'PUT', body: payload });
  },
  deleteContest(id) {
    return this.request(`/contests/${id}`, { method: 'DELETE' });
  },

  // Questions
  listQuestionsForStudent(contestId) {
    return this.request(`/questions/contest/${contestId}`);
  },
  listQuestionsForAdmin(contestId) {
    return this.request(`/questions/admin/${contestId}`);
  },
  createQuestion(payload) {
    return this.request('/questions', { method: 'POST', body: payload });
  },
  updateQuestion(id, payload) {
    return this.request(`/questions/${id}`, { method: 'PUT', body: payload });
  },
  deleteQuestion(id) {
    return this.request(`/questions/${id}`, { method: 'DELETE' });
  },

  // Submissions
  submitAnswer(contestId, questionId, submittedAnswer) {
    return this.request(`/submissions/contest/${contestId}`, {
      method: 'POST',
      body: { question_id: questionId, submitted_answer: submittedAnswer },
    });
  },
  getMySubmissions(contestId) {
    return this.request(`/submissions/contest/${contestId}/mine`);
  },
  getAllSubmissions(contestId) {
    return this.request(`/submissions/contest/${contestId}/all`);
  },

  // Leaderboard / stats
  getLeaderboard(contestId) {
    return this.request(`/leaderboard/contest/${contestId}/leaderboard`);
  },
  getStats(contestId) {
    return this.request(`/leaderboard/contest/${contestId}/stats`);
  },

  // Registrations
  getMyRegistrations() {
    return this.request('/registrations/mine');
  },
  getRegistrationStatus(contestId) {
    return this.request(`/registrations/contest/${contestId}`);
  },
  registerForContest(contestId) {
    return this.request(`/registrations/contest/${contestId}`, { method: 'POST' });
  },
  unregisterFromContest(contestId) {
    return this.request(`/registrations/contest/${contestId}`, { method: 'DELETE' });
  },

  // Submission limit
  getSubmissionLimit(contestId) {
    return this.request(`/submissions/contest/${contestId}/limit`);
  },

  // User management (admin)
  listUsers() {
    return this.request('/users');
  },
  deleteUser(id) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  },
  blockUser(id) {
    return this.request(`/users/${id}/block`, { method: 'PATCH' });
  },
  unblockUser(id) {
    return this.request(`/users/${id}/unblock`, { method: 'PATCH' });
  },
};
