// server/history.js
// Stosy undo/redo pełnych kopii stanu gry + polskie etykiety akcji dla panelu
// hosta. Wpis na stosie undo trzyma stan SPRZED akcji `label`; undo() oddaje
// go i odkłada stan bieżący na stos redo. Kopie robi wołający (index.js).

export function createHistory(cap = 100) {
  const undoStack = []; // { label, state }
  const redoStack = [];
  return {
    push(label, stateBefore) {
      undoStack.push({ label, state: stateBefore });
      if (undoStack.length > cap) undoStack.shift();
      redoStack.length = 0;
    },
    undo(current) {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push({ label: entry.label, state: current });
      return entry.state;
    },
    redo(current) {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push({ label: entry.label, state: current });
      return entry.state;
    },
    undoLabel: () => undoStack.at(-1)?.label ?? null,
    redoLabel: () => redoStack.at(-1)?.label ?? null,
  };
}

export function describeCommand(cmd, state) {
  const team = () => state.teams?.[cmd.team]?.name ?? `drużyna ${cmd.team + 1}`;
  switch (cmd.type) {
    case 'newRound': return `nowa runda ${cmd.roundIndex + 1}`;
    case 'buzz': return `buzzer: ${team()}`;
    case 'resetBuzzers': return 'uzbrojenie buzzerów';
    case 'choosePlayingTeam': return `gra: ${team()}`;
    case 'reveal': return `odkrycie: ${state.round?.answers?.[cmd.index]?.text ?? `#${cmd.index + 1}`}`;
    case 'strike': return `X dla: ${team()}`;
    case 'stealFail': return 'przejęcie: pudło';
    case 'awardSum': return `suma dla: ${team()}`;
    case 'setBank': return `bank ${team()} = ${cmd.value}`;
    case 'setTeamName': return 'zmiana nazwy drużyny';
    case 'startFinal': return 'start finału';
    case 'finalSet': return `finał: gracz ${cmd.player + 1}, pyt. ${cmd.qIndex + 1}`;
    case 'finalCover': return cmd.covered ? 'zakrycie tablicy' : 'odkrycie tablicy';
    case 'timerStart': return `timer ${cmd.seconds} s`;
    case 'timerStop': return 'stop timera';
    case 'repeatBuzzer': return 'powtórzona';
    case 'introStart': return 'intro';
    case 'stopMusic': return 'stop muzyki';
    case 'endGame': return 'koniec gry';
    case 'newGame': return 'nowa gra';
    default: return cmd.type;
  }
}
