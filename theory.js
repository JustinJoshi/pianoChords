/**
 * Chord & Scale Theory Data
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Scale intervals (semitones from root)
const SCALES = {
  'Major (Ionian)':      [0, 2, 4, 5, 7, 9, 11],
  'Natural Minor (Aeolian)': [0, 2, 3, 5, 7, 8, 10],
  'Dorian':              [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian':          [0, 2, 4, 5, 7, 9, 10],
  'Locrian':             [0, 1, 3, 5, 6, 8, 10],
  'Lydian Dominant':     [0, 2, 4, 6, 7, 9, 10],
  'Altered':             [0, 1, 3, 4, 6, 8, 10],
  'Phrygian Dominant':   [0, 1, 4, 5, 7, 8, 10],
  'Whole-Half Diminished': [0, 2, 3, 5, 6, 8, 9, 11],
};

// Chord definitions: intervals, display symbol, matching scale
const CHORDS = {
  // Basic 7ths
  maj7:   { intervals: [0, 4, 7, 11], symbol: 'maj7', scale: 'Major (Ionian)' },
  '7':    { intervals: [0, 4, 7, 10], symbol: '7', scale: 'Mixolydian' },
  min7:   { intervals: [0, 3, 7, 10], symbol: 'm7', scale: 'Dorian' },
  min7b5: { intervals: [0, 3, 6, 10], symbol: 'm7♭5', scale: 'Locrian' },
  dim7:   { intervals: [0, 3, 6, 9],  symbol: 'dim7', scale: 'Whole-Half Diminished' },

  // Extensions
  maj9:   { intervals: [0, 4, 7, 11, 2], symbol: 'maj9', scale: 'Major (Ionian)' },
  '9':    { intervals: [0, 4, 7, 10, 2], symbol: '9', scale: 'Mixolydian' },
  min9:   { intervals: [0, 3, 7, 10, 2], symbol: 'm9', scale: 'Dorian' },
  '13':   { intervals: [0, 4, 7, 10, 2, 9], symbol: '13', scale: 'Mixolydian' },
  maj13:  { intervals: [0, 4, 7, 11, 2, 9], symbol: 'maj13', scale: 'Major (Ionian)' },

  // Altered
  '7b9':  { intervals: [0, 4, 7, 10, 1], symbol: '7♭9', scale: 'Phrygian Dominant' },
  '7#9':  { intervals: [0, 4, 7, 10, 3], symbol: '7♯9', scale: 'Altered' },
  '7#5':  { intervals: [0, 4, 8, 10],    symbol: '7♯5', scale: 'Lydian Dominant' },
  '7b5':  { intervals: [0, 4, 6, 10],    symbol: '7♭5', scale: 'Locrian' },
  '7alt': { intervals: [0, 4, 6, 10, 1, 3], symbol: '7alt', scale: 'Altered' },
};

// Pool definitions
const POOLS = {
  basic7:   ['maj7', '7', 'min7', 'min7b5', 'dim7'],
  extended: ['maj9', '9', 'min9', '13', 'maj13'],
  altered:  ['7b9', '7#9', '7#5', '7b5', '7alt'],
};

const KEYS_5 = [0, 5, 10, 3, 7]; // C, F, Bb, Eb, G
const KEYS_12 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function getNoteName(pitchClass) {
  return NOTE_NAMES[pitchClass % 12];
}

function getScaleNotes(rootPc, scaleName) {
  const intervals = SCALES[scaleName];
  if (!intervals) return [];
  return intervals.map(i => NOTE_NAMES[(rootPc + i) % 12]);
}

function getChordTones(rootPc, chordKey) {
  const chord = CHORDS[chordKey];
  if (!chord) return [];
  return chord.intervals.map(i => NOTE_NAMES[(rootPc + i) % 12]);
}

function formatChordSymbol(rootPc, chordKey) {
  const chord = CHORDS[chordKey];
  if (!chord) return '?';
  return getNoteName(rootPc) + chord.symbol;
}

function generateChord(keySet, activePools, forcedChordKey = null, forcedRootPc = null) {
  const rootPc = forcedRootPc !== null ? forcedRootPc : keySet[Math.floor(Math.random() * keySet.length)];

  let chordKey;
  if (forcedChordKey && CHORDS[forcedChordKey]) {
    chordKey = forcedChordKey;
  } else {
    const available = [];
    if (activePools.basic7) available.push(...POOLS.basic7);
    if (activePools.extended) available.push(...POOLS.extended);
    if (activePools.altered) available.push(...POOLS.altered);

    if (available.length === 0) available.push(...POOLS.basic7);

    chordKey = available[Math.floor(Math.random() * available.length)];
  }

  const chord = CHORDS[chordKey];

  return {
    rootPc,
    chordKey,
    symbol: formatChordSymbol(rootPc, chordKey),
    tones: getChordTones(rootPc, chordKey),
    scaleName: chord.scale,
    scaleNotes: getScaleNotes(rootPc, chord.scale),
    requiredPitchClasses: new Set(chord.intervals.map(i => (rootPc + i) % 12)),
  };
}
