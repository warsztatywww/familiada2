import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestions } from '../server/questions.js';

const okRound = {
  question: 'Pytanie?',
  answers: [{ text: 'A', points: 30 }, { text: 'B', points: 10 }],
};

test('akceptuje poprawny config i uzupełnia domyślne', () => {
  const c = validateQuestions({ rounds: [okRound] });
  assert.deepEqual(c.teams, ['Lewa', 'Prawa']);
  assert.equal(c.rounds[0].multiplier, 1);
  assert.deepEqual(c.final, []);
});

test('odrzuca brak rund', () => {
  assert.throws(() => validateQuestions({ rounds: [] }), /rundy/i);
});

test('odrzuca > 6 odpowiedzi w rundzie', () => {
  const answers = 'ABCDEFG'.split('').map((t) => ({ text: t, points: 1 }));
  assert.throws(() => validateQuestions({ rounds: [{ question: 'Q', answers }] }), /6/);
});

test('odrzuca finał inny niż 5 pytań', () => {
  assert.throws(
    () => validateQuestions({ rounds: [okRound], final: [okRound] }),
    /5 pytań/i
  );
});

test('odrzuca odpowiedź bez punktów', () => {
  assert.throws(
    () => validateQuestions({ rounds: [{ question: 'Q', answers: [{ text: 'A' }] }] }),
    /points/i
  );
});
