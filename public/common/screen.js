/* global NoSleep */
// Wspólne dla ekranów na telefonach (scena, buzzery): przycisk pełnego ekranu
// i blokada wygaszania. Natywny Wake Lock działa tylko w secure context
// (HTTPS/localhost), a serwer chodzi po HTTP w LAN — wtedy NoSleep.js gra
// w pętli ukryte mini-wideo. Wideo wymaga gestu użytkownika, więc fallback
// uzbraja się przy pierwszym dotknięciu ekranu.

function keepAwake() { navigator.wakeLock?.request('screen').catch(() => {}); }
keepAwake();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

if (!navigator.wakeLock) {
  const noSleep = new NoSleep();
  document.addEventListener('pointerdown', () => noSleep.enable(), { capture: true, once: true });
}

const style = document.createElement('style');
style.textContent = `
  #fullscreen-btn {
    position: fixed; top: 10px; right: 10px; z-index: 10;
    width: 44px; height: 44px; font-size: 24px; line-height: 1; padding: 0;
    color: var(--muted); background: var(--panel);
    border: 1px solid var(--line); border-radius: 10px;
  }
`;
document.head.append(style);

const btn = document.createElement('button');
btn.id = 'fullscreen-btn';
btn.textContent = '⛶';
btn.title = 'Pełny ekran';
// na buzzerze cały ekran jest przyciskiem — dotknięcie ⛶ nie może buzzować
btn.addEventListener('pointerdown', (e) => e.stopPropagation());
btn.addEventListener('click', () => document.documentElement.requestFullscreen().catch(() => {}));
// w pełnym ekranie chowamy przycisk — wyjście systemowym gestem/Esc
document.addEventListener('fullscreenchange', () => { btn.hidden = !!document.fullscreenElement; });
document.body.append(btn);
