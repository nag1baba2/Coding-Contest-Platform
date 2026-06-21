// ============================================================
// Shared utilities - time/status formatting used across pages.
// Mirrors the exact logic in the backend's getContestStatus()
// (src/middleware/contestTime.js) so the UI's notion of
// upcoming/active/ended always matches what the server will
// actually enforce. If you change the backend's boundary rule
// (e.g. end_time inclusive vs exclusive), update it here too.
// ============================================================

function getContestStatus(startTime, endTime, now = new Date()) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}

function statusPillHtml(status) {
  const labels = { upcoming: 'Upcoming', active: 'Live', ended: 'Ended' };
  return `<span class="status-pill ${status}">${labels[status]}</span>`;
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Formats a millisecond duration as HH:MM:SS for the countdown timer.
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Starts a live countdown inside the given element, ticking every
// second. Calls onTick(status) each update so the caller can react
// when the contest flips from upcoming -> active -> ended (e.g. to
// reload the problem list right when it unlocks). Returns a cleanup
// function to stop the interval - callers should invoke this if they
// navigate away, to avoid leaking a running timer.
function startCountdown(element, startTime, endTime, onStatusChange) {
  let lastStatus = null;

  function tick() {
    const now = new Date();
    const status = getContestStatus(startTime, endTime, now);
    const start = new Date(startTime);
    const end = new Date(endTime);

    let targetLabel, targetTime;
    if (status === 'upcoming') {
      targetLabel = 'Starts in';
      targetTime = start;
    } else if (status === 'active') {
      targetLabel = 'Ends in';
      targetTime = end;
    } else {
      targetLabel = 'Contest ended';
      targetTime = null;
    }

    const labelEl = element.querySelector('.timer-label');
    const displayEl = element.querySelector('.timer-display');

    if (labelEl) labelEl.textContent = targetLabel;

    if (targetTime) {
      const remainingMs = targetTime - now;
      const display = formatDuration(remainingMs);
      if (displayEl) {
        displayEl.textContent = display;
        displayEl.classList.toggle('urgent', status === 'active' && remainingMs < 5 * 60 * 1000);
      }
    } else if (displayEl) {
      displayEl.textContent = '--:--:--';
    }

    if (status !== lastStatus) {
      lastStatus = status;
      if (onStatusChange) onStatusChange(status);
    }
  }

  tick();
  const intervalId = setInterval(tick, 1000);
  return () => clearInterval(intervalId);
}

// Escapes user-provided text before inserting into innerHTML, to
// avoid basic HTML/script injection via contest names, question
// titles, submitted answers, etc. rendered back into the page.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function showAlert(container, message, type = 'error') {
  container.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}

function clearAlert(container) {
  container.innerHTML = '';
}
