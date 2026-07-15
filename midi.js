/**
 * Web MIDI Input Handling
 */

let midiAccess = null;
let heldPitchClasses = new Set();
let requiredPitchClasses = new Set();
let onChordMatched = null;
let onStatusChange = null;
let onNotesChanged = null;

function getMIDIErrorMessage() {
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  const isFileUrl = window.location.protocol === 'file:';
  if (isFirefox && isFileUrl) {
    return 'Firefox blocks MIDI on file://. Run: python3 -m http.server 8080, then open http://localhost:8080';
  }
  return 'No MIDI support in this browser. Use Chrome, Edge, or Firefox 108+ over localhost/HTTPS.';
}

async function connectMIDI() {
  if (!navigator.requestMIDIAccess) {
    updateStatus(getMIDIErrorMessage());
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess();
    attachInputs(midiAccess);
    midiAccess.onstatechange = () => attachInputs(midiAccess);
    const names = Array.from(midiAccess.inputs.values()).map(i => i.name).join(', ');
    updateStatus(names ? `Connected: ${names}` : 'MIDI connected (no inputs found)');
  } catch (err) {
    updateStatus(`MIDI Error: ${err.message}`);
  }
}

function attachInputs(access) {
  for (const input of access.inputs.values()) {
    input.onmidimessage = handleMIDIMessage;
  }
}

function handleMIDIMessage(e) {
  const [status, note, velocity] = e.data;
  const isNoteOn = (status & 0xf0) === 0x90 && velocity > 0;
  const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && velocity === 0);

  if (isNoteOn) {
    registerNotePressed(note);
  } else if (isNoteOff) {
    registerNoteReleased(note);
  }
}

function registerNotePressed(note) {
  const pc = note % 12;
  heldPitchClasses.add(pc);
  notifyNotesChanged();
  checkMatch();
}

function registerNoteReleased(note) {
  const pc = note % 12;
  heldPitchClasses.delete(pc);
  notifyNotesChanged();
}

function checkMatch() {
  if (!onChordMatched || requiredPitchClasses.size === 0) return;

  // Check if held notes contain all required pitch classes (superset, not exact match)
  for (const pc of requiredPitchClasses) {
    if (!heldPitchClasses.has(pc)) return;
  }

  // Success! All required notes are held.
  requiredPitchClasses.clear(); // prevent re-triggering
  onChordMatched();
}

function setRequiredPitchClasses(pitchClasses) {
  requiredPitchClasses = new Set(pitchClasses);
  heldPitchClasses.clear();
}

function resetHeldNotes() {
  heldPitchClasses.clear();
}

function updateStatus(msg) {
  if (onStatusChange) onStatusChange(msg);
}

function notifyNotesChanged() {
  if (onNotesChanged) onNotesChanged(Array.from(heldPitchClasses));
}

function getHeldPitchClasses() {
  return Array.from(heldPitchClasses);
}
