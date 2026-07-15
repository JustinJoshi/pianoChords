/**
 * Chord Reader Drill — Main Logic & UI
 */

// ── State ──
let currentChord = null;
let timerStart = 0;
let timerId = null;
let isRunning = false;
let sessionCount = 0;
let totalTimeMs = 0;
let use12Keys = false;
let activePools = { basic7: true, extended: false, altered: false };
let timerEnabled = true;
let awaitingChord = false;
let usePopKeys = false;

// ── DOM refs ──
const elSymbol = document.getElementById('chord-symbol');
const elTimerRing = document.getElementById('timer-ring');
const elTimerText = document.getElementById('timer-text');
const elNext = document.getElementById('btn-next');
const elReveal = document.getElementById('btn-reveal');
const elRevealPanel = document.getElementById('reveal-panel');
const elRevealTones = document.getElementById('reveal-tones');
const elRevealScale = document.getElementById('reveal-scale');
const elRevealScaleNotes = document.getElementById('reveal-scale-notes');
const elMIDIStatus = document.getElementById('midi-status');
const elMIDIBtn = document.getElementById('btn-midi');
const elStats = document.getElementById('stats');
const elHeldNotes = document.getElementById('held-notes');

const elToggle12 = document.getElementById('toggle-12keys');
const elToggleBasic = document.getElementById('toggle-basic7');
const elToggleExt = document.getElementById('toggle-extended');
const elToggleAlt = document.getElementById('toggle-altered');
const elToggleTimer = document.getElementById('toggle-timer');
const elTogglePop = document.getElementById('toggle-popkeys');

// ── Constants ──
const TARGET_SECONDS = 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // r=90

// ── localStorage ──
function loadStats() {
  try {
    const raw = localStorage.getItem('chordDrillStats');
    if (raw) {
      const data = JSON.parse(raw);
      sessionCount = data.sessionCount || 0;
      totalTimeMs = data.totalTimeMs || 0;
    }
  } catch {}
  updateStatsDisplay();
}

function saveStats() {
  try {
    localStorage.setItem('chordDrillStats', JSON.stringify({ sessionCount, totalTimeMs }));
  } catch {}
}

function updateStatsDisplay() {
  const avg = sessionCount > 0 ? (totalTimeMs / sessionCount / 1000).toFixed(2) : '0.00';
  elStats.textContent = `Count: ${sessionCount}  ·  Avg: ${avg}s`;
}

// ── Timer ──
function startTimer() {
  stopTimer();
  elTimerRing.style.strokeDashoffset = RING_CIRCUMFERENCE;

  if (!timerEnabled) {
    elTimerRing.style.stroke = '#2a2d35';
    elTimerText.textContent = '--';
    return;
  }

  isRunning = true;
  timerStart = performance.now();
  elTimerRing.style.stroke = '#4a9eff';
  elTimerText.textContent = '0.0s';

  timerId = requestAnimationFrame(tick);
}

function stopTimer() {
  if (timerId) cancelAnimationFrame(timerId);
  timerId = null;
  isRunning = false;
}

function tick() {
  if (!isRunning) return;
  const elapsed = (performance.now() - timerStart) / 1000;
  elTimerText.textContent = elapsed.toFixed(1) + 's';

  const progress = Math.min(elapsed / TARGET_SECONDS, 1);
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  elTimerRing.style.strokeDashoffset = offset;

  if (elapsed >= TARGET_SECONDS) {
    elTimerRing.style.stroke = '#ff6b6b';
  }

  timerId = requestAnimationFrame(tick);
}

function recordTime() {
  if (!isRunning) return 0;
  const elapsed = performance.now() - timerStart;
  stopTimer();
  sessionCount++;
  totalTimeMs += elapsed;
  saveStats();
  updateStatsDisplay();
  return elapsed;
}

// ── SRS stats ──
function updateSRSStats() {
  if (!window.srs) return;
  try {
    const stats = window.srs.getStats(activePools);
    const el = document.getElementById('srs-stats');
    if (el) el.textContent = `Due: ${stats.due} · New: ${stats.new}`;
  } catch (e) {
    console.error('SRS stats error:', e);
  }
}

// ── Drill flow ──
function nextRound() {
  // If user skipped without revealing, record as Again
  if (awaitingChord && currentChord && window.srs) {
    try {
      window.srs.recordResult(currentChord.chordKey, 'Again');
      updateSRSStats();
    } catch (e) {
      console.error('SRS skip-record error:', e);
    }
  }

  const keySet = usePopKeys ? [0, 7, 2, 9, 4] : (use12Keys ? KEYS_12 : KEYS_5);

  let nextChordKey = null;
  if (window.srs) {
    try {
      nextChordKey = window.srs.getNextCard(activePools, currentChord?.chordKey);
    } catch (e) {
      console.error('SRS selection error:', e);
    }
  }

  currentChord = generateChord(keySet, activePools, nextChordKey);
  elSymbol.textContent = currentChord.symbol;
  elSymbol.classList.remove('success');
  elRevealPanel.classList.add('hidden');
  elHeldNotes.textContent = '';
  awaitingChord = true;

  const elRet = document.getElementById('reveal-retrievability');
  if (elRet) elRet.classList.add('hidden');

  setRequiredPitchClasses(Array.from(currentChord.requiredPitchClasses));
  startTimer();
  updateSRSStats();
}

function doReveal(auto = false) {
  if (!currentChord || !awaitingChord) return;
  awaitingChord = false;

  const elapsedMs = recordTime();
  const elapsedSec = elapsedMs / 1000;

  // Determine FSRS grade
  let grade;
  if (auto) {
    // Matched via MIDI before pressing Reveal
    if (elapsedSec < TARGET_SECONDS * 0.5) grade = 'Easy';
    else if (elapsedSec < TARGET_SECONDS) grade = 'Good';
    else grade = 'Hard';
  } else {
    const midiConnected = midiAccess && midiAccess.inputs && midiAccess.inputs.size > 0;
    if (midiConnected) {
      // MIDI is connected but user pressed Reveal manually → failed to match
      grade = 'Again';
    } else {
      // No MIDI — derive grade from reveal speed
      if (elapsedSec < TARGET_SECONDS * 0.5) grade = 'Easy';
      else if (elapsedSec < TARGET_SECONDS) grade = 'Good';
      else if (elapsedSec < TARGET_SECONDS * 2) grade = 'Hard';
      else grade = 'Again';
    }
  }

  if (window.srs && currentChord.chordKey) {
    try {
      window.srs.recordResult(currentChord.chordKey, grade);
      updateSRSStats();

      const ret = window.srs.getRetrievability(currentChord.chordKey);
      const elRet = document.getElementById('reveal-retrievability');
      if (elRet && ret !== null) {
        elRet.textContent = `Strength: ${(ret * 100).toFixed(0)}%`;
        elRet.classList.remove('hidden');
      }
    } catch (e) {
      console.error('SRS record error:', e);
    }
  }

  elRevealPanel.classList.remove('hidden');
  elRevealTones.textContent = currentChord.tones.join('  ');
  elRevealScale.textContent = currentChord.scaleName;
  elRevealScaleNotes.textContent = currentChord.scaleNotes.join('  ');

  if (auto) {
    elSymbol.classList.add('success');
  }
}

// ── MIDI integration ──
onChordMatched = () => {
  if (!awaitingChord) return;
  doReveal(true);
};

onStatusChange = (msg) => {
  elMIDIStatus.textContent = msg;
};

onNotesChanged = (pcs) => {
  if (!currentChord) return;
  const names = pcs.map(pc => NOTE_NAMES[pc]).join(' ');
  elHeldNotes.textContent = names ? `Held: ${names}` : '';
};

// ── Event listeners ──
elNext.addEventListener('click', nextRound);
elReveal.addEventListener('click', () => doReveal(false));
elMIDIBtn.addEventListener('click', connectMIDI);

elToggle12.addEventListener('change', (e) => { use12Keys = e.target.checked; });
elToggleBasic.addEventListener('change', (e) => { activePools.basic7 = e.target.checked; updateSRSStats(); });
elToggleExt.addEventListener('change', (e) => { activePools.extended = e.target.checked; updateSRSStats(); });
elToggleAlt.addEventListener('change', (e) => { activePools.altered = e.target.checked; updateSRSStats(); });
elToggleTimer.addEventListener('change', (e) => { timerEnabled = e.target.checked; });
elTogglePop.addEventListener('change', (e) => { usePopKeys = e.target.checked; });

// Keyboard shortcut: Space = next round, Enter = reveal
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); nextRound(); }
  if (e.code === 'Enter') { e.preventDefault(); doReveal(false); }
});

// ── Init ──
loadStats();
nextRound();
