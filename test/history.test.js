import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, describeCommand } from '../server/history.js';

test('undo/redo: przywraca stany i etykiety', () => {
  const h = createHistory();
  assert.equal(h.undo({ v: 9 }), null); // pusty stos
  assert.equal(h.undoLabel(), null);
  h.push('akcja A', { v: 0 });
  h.push('akcja B', { v: 1 });
  assert.equal(h.undoLabel(), 'akcja B');
  const restored = h.undo({ v: 2 });
  assert.deepEqual(restored, { v: 1 });
  assert.equal(h.redoLabel(), 'akcja B');
  const redone = h.redo(restored);
  assert.deepEqual(redone, { v: 2 });
  assert.equal(h.undoLabel(), 'akcja B');
  assert.equal(h.redoLabel(), null);
});

test('nowa akcja czyści stos redo', () => {
  const h = createHistory();
  h.push('A', { v: 0 });
  h.undo({ v: 1 });
  h.push('B', { v: 5 });
  assert.equal(h.redoLabel(), null);
  assert.equal(h.redo({ v: 9 }), null);
});

test('cap: najstarsze wpisy wypadają', () => {
  const h = createHistory(2);
  h.push('A', { v: 0 });
  h.push('B', { v: 1 });
  h.push('C', { v: 2 });
  assert.deepEqual(h.undo({}), { v: 2 });
  assert.deepEqual(h.undo({}), { v: 1 });
  assert.equal(h.undo({}), null); // wpis 'A' wypadł przez cap
});

test('describeCommand: polskie etykiety akcji', () => {
  const state = {
    teams: [{ name: 'Lewa' }, { name: 'Prawa' }],
    round: { answers: [{ text: 'COBOL' }] },
  };
  assert.equal(describeCommand({ type: 'strike', team: 0 }, state), 'X dla: Lewa');
  assert.equal(describeCommand({ type: 'reveal', index: 0 }, state), 'odkrycie: COBOL');
  assert.equal(describeCommand({ type: 'reveal', index: 5 }, state), 'odkrycie: #6');
  assert.equal(describeCommand({ type: 'newRound', roundIndex: 2 }, state), 'nowa runda 3');
  assert.equal(describeCommand({ type: 'buzz', team: 1 }, state), 'buzzer: Prawa');
  assert.equal(describeCommand({ type: 'finalCover', covered: true }, state), 'zakrycie tablicy');
  assert.equal(describeCommand({ type: 'finalSet', qIndex: 0, player: 1 }, state), 'finał: gracz 2, pyt. 1');
  assert.equal(describeCommand({ type: 'newGame' }, state), 'nowa gra');
  assert.equal(describeCommand({ type: 'cosNieznanego' }, state), 'cosNieznanego');
});
