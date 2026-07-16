/**
 * SRS Module — ts-fsrs spaced repetition for chord drill
 *
 * One card per (chord type, root note) combination = up to 180 cards.
 * Root notes are now scheduled, not randomized.
 */
import { createEmptyCard, fsrs, Rating, State } from 'https://esm.sh/ts-fsrs';

const STORAGE_KEY = 'chordDrillSRSv2';
const NEW_CARD_INTERVAL = 3;

const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

let cards = {};
let roundCount = 0;
let lastNewCardRound = -NEW_CARD_INTERVAL;

/* ── Helpers ── */

function getCardId(chordKey, rootPc) {
  return `${chordKey}:${rootPc}`;
}

/* ── Persistence ── */

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(parsed)) {
        cards[key] = deserializeCard(parsed[key]);
      }
    }
  } catch (e) {
    console.error('SRS load error:', e);
  }

  // Ensure every (chord, root) combination has a card
  for (const chordKey of Object.keys(CHORDS)) {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const id = getCardId(chordKey, rootPc);
      if (!cards[id]) {
        cards[id] = createEmptyCard();
      }
    }
  }
}

function saveCards() {
  try {
    const toSave = {};
    for (const key of Object.keys(cards)) {
      toSave[key] = serializeCard(cards[key]);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('SRS save error:', e);
  }
}

function serializeCard(card) {
  return {
    ...card,
    due: card.due.getTime(),
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

function deserializeCard(data) {
  return {
    ...data,
    due: new Date(data.due),
    last_review: data.last_review ? new Date(data.last_review) : null,
  };
}

/* ── Selection ── */

function getEligibleChords(activePools) {
  let eligible = [];
  if (activePools.basic7) eligible.push(...POOLS.basic7);
  if (activePools.extended) eligible.push(...POOLS.extended);
  if (activePools.altered) eligible.push(...POOLS.altered);
  if (eligible.length === 0) eligible = [...POOLS.basic7];
  return eligible;
}

function getNextCard(activePools, keySet, lastCardId) {
  roundCount++;
  const now = new Date();
  const eligibleChords = getEligibleChords(activePools);

  // Build pool of (chordKey, rootPc) combinations
  let pool = [];
  for (const chordKey of eligibleChords) {
    for (const rootPc of keySet) {
      const id = getCardId(chordKey, rootPc);
      pool.push({ chordKey, rootPc, card: cards[id], id });
    }
  }

  // Avoid back-to-back same card
  if (lastCardId) {
    pool = pool.filter(c => c.id !== lastCardId);
  }
  if (pool.length === 0 && eligibleChords.length > 0 && keySet.length > 0) {
    const fallbackRoot = keySet[0];
    const fallbackChord = eligibleChords[0];
    return { chordKey: fallbackChord, rootPc: fallbackRoot };
  }

  // Due cards (non-new)
  const dueCards = pool.filter(({ card }) => card.due <= now && card.state !== State.New);
  const dueReview = dueCards.filter(({ card }) =>
    card.state === State.Review || card.state === State.Relearning
  );
  const dueLearning = dueCards.filter(({ card }) => card.state === State.Learning);

  if (dueReview.length > 0) {
    return pickRandom(dueReview);
  }
  if (dueLearning.length > 0) {
    return pickRandom(dueLearning);
  }

  // Introduce new cards at a capped rate
  const newCards = pool.filter(({ card }) => card.state === State.New);
  if (newCards.length > 0 && (roundCount - lastNewCardRound) >= NEW_CARD_INTERVAL) {
    lastNewCardRound = roundCount;
    return pickRandom(newCards);
  }

  // Fallback: earliest due date among eligible
  if (pool.length > 0) {
    pool.sort((a, b) => a.card.due - b.card.due);
    return pool[0];
  }

  return { chordKey: eligibleChords[0], rootPc: keySet[0] };
}

function pickRandom(arr) {
  const item = arr[Math.floor(Math.random() * arr.length)];
  return { chordKey: item.chordKey, rootPc: item.rootPc };
}

/* ── Grading ── */

function recordResult(chordKey, rootPc, grade) {
  const id = getCardId(chordKey, rootPc);
  const card = cards[id];
  if (!card) return;

  const now = new Date();
  let rating;
  switch (grade) {
    case 'Again': rating = Rating.Again; break;
    case 'Hard':  rating = Rating.Hard;  break;
    case 'Good':  rating = Rating.Good;  break;
    case 'Easy':  rating = Rating.Easy;  break;
    default:      rating = Rating.Good;
  }

  const result = scheduler.next(card, now, rating);
  cards[id] = result.card;
  saveCards();
}

/* ── Stats & Meta ── */

function getStats(activePools, keySet) {
  const now = new Date();
  const eligibleChords = getEligibleChords(activePools);
  let due = 0;
  let newCount = 0;

  for (const chordKey of eligibleChords) {
    for (const rootPc of keySet) {
      const id = getCardId(chordKey, rootPc);
      const card = cards[id];
      if (!card) continue;
      if (card.state === State.New) {
        newCount++;
      } else if (card.due <= now) {
        due++;
      }
    }
  }
  return { due, new: newCount };
}

function getRetrievability(chordKey, rootPc) {
  const id = getCardId(chordKey, rootPc);
  const card = cards[id];
  if (!card) return null;
  try {
    return scheduler.get_retrievability(card, new Date(), false);
  } catch {
    return null;
  }
}

function getCardMeta(chordKey, rootPc) {
  const id = getCardId(chordKey, rootPc);
  const card = cards[id];
  if (!card) return null;

  const stateNames = ['New', 'Learning', 'Review', 'Relearning'];
  let ret = null;
  try {
    ret = scheduler.get_retrievability(card, new Date(), false);
  } catch {}

  return {
    state: stateNames[card.state] || 'Unknown',
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    retrievability: ret,
  };
}

/* ── Init ── */
loadCards();

/* ── Expose ── */
window.srs = {
  getNextCard,
  recordResult,
  getStats,
  getRetrievability,
  getCardMeta,
};
