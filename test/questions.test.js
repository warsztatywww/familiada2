import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { validateQuestions, loadQuestionSets } from '../server/questions.js';

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

test('odrzuca > 7 odpowiedzi w rundzie', () => {
  const answers = 'ABCDEFGH'.split('').map((t) => ({ text: t, points: 1 }));
  assert.throws(() => validateQuestions({ rounds: [{ question: 'Q', answers }] }), /7/);
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

test('loadQuestionSets: katalog → zestawy posortowane po nazwie pliku, id z nazwy', () => {
  const dir = 'test-questions-loader';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const json = JSON.stringify({ rounds: [okRound] });
  writeFileSync(`${dir}/b-zestaw.json`, json);
  writeFileSync(`${dir}/a-zestaw.json`, json);
  writeFileSync(`${dir}/notatki.txt`, 'ignorowane');
  const sets = loadQuestionSets(dir);
  assert.deepEqual(sets.map((s) => s.id), ['a-zestaw', 'b-zestaw']);
  assert.equal(sets[0].rounds.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('loadQuestionSets: pojedynczy plik → jeden zestaw', () => {
  const file = 'test-questions-single.json';
  writeFileSync(file, JSON.stringify({ rounds: [okRound] }));
  const sets = loadQuestionSets(file);
  assert.deepEqual(sets.map((s) => s.id), ['test-questions-single']);
  rmSync(file, { force: true });
});

test('loadQuestionSets: pusty katalog i zepsuty plik dają czytelny błąd', () => {
  const dir = 'test-questions-empty';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  assert.throws(() => loadQuestionSets(dir), /nie zawiera/);
  writeFileSync(`${dir}/zly.json`, '{ zepsuty');
  assert.throws(() => loadQuestionSets(dir), /zly\.json/);
  rmSync(dir, { recursive: true, force: true });
});
