import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function fail(msg) {
  throw new Error(`Błąd w pliku pytań: ${msg}`);
}

function validateAnswers(answers, where) {
  if (!Array.isArray(answers) || answers.length < 1) fail(`${where}: brak odpowiedzi`);
  if (answers.length > 7) fail(`${where}: maksymalnie 7 odpowiedzi (jest ${answers.length})`);
  return answers.map((a, i) => {
    if (typeof a?.text !== 'string' || !a.text.trim()) fail(`${where}, odpowiedź ${i + 1}: brak pola "text"`);
    if (!Number.isInteger(a.points) || a.points < 0) fail(`${where}, odpowiedź ${i + 1}: brak pola "points" (nieujemna liczba całkowita)`);
    return { text: a.text.trim(), points: a.points };
  });
}

function validateQuestion(q, where) {
  if (typeof q?.question !== 'string' || !q.question.trim()) fail(`${where}: brak pola "question"`);
  return { question: q.question.trim(), answers: validateAnswers(q.answers, where) };
}

export function validateQuestions(data) {
  if (typeof data !== 'object' || data === null) fail('oczekiwano obiektu JSON');
  const teams = data.teams ?? ['Lewa', 'Prawa'];
  if (!Array.isArray(teams) || teams.length !== 2 || teams.some((t) => typeof t !== 'string' || !t.trim())) {
    fail('"teams" musi być tablicą dwóch nazw drużyn');
  }
  if (!Array.isArray(data.rounds) || data.rounds.length === 0) fail('brak sekcji "rounds" — potrzebna co najmniej jedna runda (rundy)');
  const rounds = data.rounds.map((r, i) => {
    const q = validateQuestion(r, `runda ${i + 1}`);
    const multiplier = r.multiplier ?? 1;
    if (!Number.isInteger(multiplier) || multiplier < 1) fail(`runda ${i + 1}: "multiplier" musi być dodatnią liczbą całkowitą`);
    return { ...q, multiplier };
  });
  const finalData = data.final ?? [];
  if (!Array.isArray(finalData)) fail('"final" musi być tablicą');
  if (finalData.length !== 0 && finalData.length !== 5) fail(`finał musi mieć dokładnie 5 pytań (jest ${finalData.length})`);
  const final = finalData.map((q, i) => validateQuestion(q, `finał, pytanie ${i + 1}`));
  return { teams: teams.map((t) => t.trim()), rounds, final };
}

export function loadQuestions(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`nie mogę odczytać pliku ${path}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`niepoprawny JSON (${e.message})`);
  }
  return validateQuestions(data);
}

// Ładuje zestawy pytań: katalog → każdy plik *.json to jeden zestaw
// (kolejność alfabetyczna po nazwie pliku), pojedynczy plik → jeden zestaw.
// id zestawu = nazwa pliku bez rozszerzenia; siedzi w config.id, więc trafia
// do stanu gry i identyfikuje aktywny zestaw po restarcie/undo.
export function loadQuestionSets(questionsPath) {
  let isDir;
  try {
    isDir = statSync(questionsPath).isDirectory();
  } catch {
    fail(`nie mogę odczytać ${questionsPath}`);
  }
  const files = isDir
    ? readdirSync(questionsPath).filter((f) => f.endsWith('.json')).sort()
        .map((f) => path.join(questionsPath, f))
    : [questionsPath];
  if (files.length === 0) fail(`katalog ${questionsPath} nie zawiera żadnego pliku *.json z pytaniami`);
  return files.map((file) => {
    try {
      return { id: path.basename(file, '.json'), ...loadQuestions(file) };
    } catch (e) {
      throw new Error(`${path.basename(file)}: ${e.message}`);
    }
  });
}
