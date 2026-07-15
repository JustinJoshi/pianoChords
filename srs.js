/**
 * SRS Module — ts-fsrs spaced repetition for chord drill
 *
 * One card per chord type (15 total). Root notes stay randomized;
 * only the chord *type* is scheduled.
 */
import { createEmptyCard, fsrs, Rating, State } from 'https://esm.sh/ts-fsrs';

const STORAGE_KEY = 'chordDrillSRS';
const NEW_CARD_INTERVAL = 3; // minimum rounds between introducing new cards

const scheduler = fsrs({
  request_retention: 0.9,   // Anki's "most important setting" — target 90% retention
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

let cards = {};
let roundCount = 0;
let lastNewCardRound = -NEW_CARD_INTERVAL;

/* ── Persistence ── */

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(CHORDS)) {
        if (parsed[key]) {
          cards[key] = deserializeCard(parsed[key]);
        }
      }
    }
  } catch (e) {
    console.error('SRS load error:', e);
  }

  // Create empty cards for any missing chord types
  for (const key of Object.keys(CHORDS)) {
    if (!cards[key]) {
      cards[key] = createEmptyCard();
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

function getEligibleKeys(activePools) {
  let eligible = [];
  if (activePools.basic7) eligible.push(...POOLS.basic7);
  if (activePools.extended) eligible.push(...POOLS.extended);
  if (activePools.altered) eligible.push(...POOLS.altered);
  if (eligible.length === 0) eligible = [...POOLS.basic7];
  return eligible;
}

function getNextCard(activePools, lastChordKey) {
  roundCount++;
  const now = new Date();
  const eligible = getEligibleKeys(activePools);
  const withCards = eligible.map(key => ({ key, card: cards[key] }));

  // Avoid back-to-back same chord
  const pool = lastChordKey
    ? withCards.filter(c => c.key !== lastChordKey)
    : withCards;
  if (pool.length === 0 && withCards.length > 0) {
    pool.push(...withCards);
  }

  // Due cards (non-new)
  const dueCards = pool.filter(({ card }) => card.due <= now && card.state !== State.New);
  const dueReview = dueCards.filter(({ card }) =>
    card.state === State.Review || card.state === State.Relearning
  );
  const dueLearning = dueCards.filter(({ card }) => card.state === State.Learning);

  if (dueReview.length > 0) {
    return pickRandom(dueReview).key;
  }
  if (dueLearning.length > 0) {
    return pickRandom(dueLearning).key;
  }

  // Introduce new cards at a capped rate
  const newCards = pool.filter(({ card }) => card.state === State.New);
  if (newCards.length > 0 && (roundCount - lastNewCardRound) >= NEW_CARD_INTERVAL) {
    lastNewCardRound = roundCount;
    return pickRandom(newCards).key;
  }

  // Fallback: earliest due date among eligible
  if (pool.length > 0) {
    pool.sort((a, b) => a.card.due - b.card.due);
    return pool[0].key;
  }

  return eligible[0];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── Grading ── */

function recordResult(chordKey, grade) {
  const card = cards[chordKey];
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
  cards[chordKey] = result.card;
  saveCards();
}

/* ── Stats & Retrievability ── */

function getStats(activePools) {
  const now = new Date();
  const eligible = getEligibleKeys(activePools);
  let due = 0;
  let newCount = 0;

  for (const key of eligible) {
    const card = cards[key];
    if (!card) continue;
    if (card.state === State.New) {
      newCount++;
    } else if (card.due <= now) {
      due++;
    }
  }
  return { due, new: newCount };
}

function getRetrievability(chordKey) {
  const card = cards[chordKey];
  if (!card) return null;
  try {
    return scheduler.get_retrievability(card, new Date(), false);
  } catch {
    return null;
  }
}

/* ── Init ── */
loadCards();

/* ── Expose ── */
window.srs = {
  getNextCard,
  recordResult,
  getStats,
  getRetrievability,
};
