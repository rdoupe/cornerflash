// SM-2 spaced repetition algorithm
// rating: 0=blackout, 1=incorrect, 2=incorrect easy, 3=correct hard, 4=correct, 5=perfect

export function createCard(cornerId, trackId) {
  return {
    cornerId,
    trackId,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: new Date().toISOString(),
  };
}

export function reviewCard(card, rating) {
  let { interval, repetitions, easeFactor } = card;

  // Update ease factor
  const newEaseFactor = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  const clampedEaseFactor = Math.max(1.3, newEaseFactor);

  let newInterval;
  let newRepetitions;

  if (rating < 3) {
    // Failed — reset
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Passed
    newRepetitions = repetitions + 1;
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
  }

  // nextReview = now + interval days
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    ...card,
    interval: newInterval,
    repetitions: newRepetitions,
    easeFactor: clampedEaseFactor,
    nextReview: nextReview.toISOString(),
  };
}

export function isDue(card) {
  return new Date(card.nextReview) <= new Date();
}
