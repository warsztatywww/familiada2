# Nowe efekty dźwiękowe — design

Podmiana trzech starych dźwięków (`correct.mp3`, `error.mp3`, `brawo.wav`) na
osiem nazwanych, tematycznych efektów Familiady i poprawne wpięcie ich w
zdarzenia gry. Dźwięk gra wyłącznie tablica (`/board`), jak dotychczas.

Nowe pliki (w `public/assets/sounds/`, długości poglądowe):

| Plik | Długość | Rola |
|---|---|---|
| `dobra-odpowiedz-familiada.mp3` | ~1,9 s | „coś się odsłoniło" |
| `bledna-familiada.mp3` | ~1,8 s | „pojawił się X" |
| `dzwonki-familiada.mp3` | ~1,9 s | buzzer wciśnięty |
| `powtorzenie-w-finale-familiada.mp3` | ~1,7 s | powtórzona odpowiedź w finale |
| `czas-final-familiada.mp3` | ~1,6 s | koniec czasu w finale |
| `przerywnik-przed-i-po-familiada.mp3` | ~5,5 s | jingiel na start każdej rundy |
| `przed-finalem-familiada.mp3` | ~8,0 s | jingiel wejścia w finał |
| `po-1-rundzie-finalu-familiada.mp3` | ~4,5 s | jingiel przejścia do gracza 2 w finale |

Stare `correct.mp3`, `error.mp3`, `brawo.wav` są usunięte z repo.

## Mapa dźwięków

Sterowana zdarzeniami serwera (`msg.event`) na tablicy. Dwie semantyczne
kategorie krótkich efektów: **odsłonięcie** i **X (zła odpowiedź)**.

| Zdarzenie | Plik | Kanał |
|---|---|---|
| `reveal` | `dobra-odpowiedz` | SFX |
| `round-won` (ostatnie odsłonięcie kończące rundę) | `dobra-odpowiedz` | SFX |
| `steal-success` (odsłonięcie przy przejęciu) | `dobra-odpowiedz` | SFX |
| `final-reveal` (odsłonięcie w finale) | `dobra-odpowiedz` | SFX |
| `cheap-reveal` (odsłanianie „za darmo" po rundzie) | `dobra-odpowiedz` | SFX |
| `strike` (X) | `bledna` | SFX |
| `strike-out` (trzeci X) | `bledna` | SFX |
| `steal-fail` (jeden duży X — nieudane przejęcie) | `bledna` | SFX |
| `final-miss` (zła/pusta odpowiedź w finale) | `bledna` | SFX |
| `buzz` (wciśnięcie buzzera) | `dzwonki` | SFX |
| `repeat` (POWTÓRZONA w finale) | `powtorzenie-w-finale` | SFX |
| koniec czasu w finale (timer dochodzi do 0) | `czas-final` | SFX |
| `new-round` (start każdej rundy, także pierwszej) | `przerywnik-przed-i-po` | jingiel |
| `final-start` (wejście w finał) | `przed-finalem` | jingiel |
| `timer-start` gdy `player === 2` | `po-1-rundzie-finalu` | jingiel |

**Nieme zdarzenia** (ani odsłonięcie, ani X, ani przejście): `sum-awarded`
(ręczne przyznanie punktów), `play-start` (wybór grającej drużyny),
`buzzers-reset`, `new-game`, `final-win`, `game-over`, `timer-start` dla
gracza 1. Świadomie bez dźwięku wygranej — stary `brawo.wav` znika bez
zastępnika.

Uwagi do mapy:
- `game.js` zwraca dokładnie jedno zdarzenie na komendę, więc odsłonięcie
  kończące rundę emituje `round-won` **zamiast** `reveal` — jeden dźwięk, bez
  podwojenia. Analogicznie `steal-success`.
- `final-miss` gra `bledna` mimo że na tablicy finału pokazują się `———`, a
  nie ikona X (zgodnie z telewizyjną Familiadą — to ogólny dźwięk złej
  odpowiedzi). Wizualnie finał bez zmian.
- Znikają wszystkie beepy WebAudio: buzzer to `dzwonki`, koniec czasu to
  `czas-final`.

## Kanały i nakładanie

Dwa logiczne kanały audio na tablicy (plus istniejące intro):

- **SFX** — `dobra-odpowiedz`, `bledna`, `dzwonki`, `powtorzenie`,
  `czas-final`. Każdy jako osobny, preładowany element `<audio>`. Odtwarzany
  od zera przy zdarzeniu; kanał pozwala na nakładanie — SFX mogą grać jeden
  na drugim i **na tle jingla** (np. buzzer w trakcie przerywnika startu
  rundy). Zero opóźnienia startu.
- **Jingiel** — `przerywnik`, `przed-finalem`, `po-1-rundzie`. Jeden logiczny
  kanał: odpalenie nowego jingla **zatrzymuje** aktualnie grający, więc dwa
  długie stingi nigdy się nie zderzą. W praktyce grają w różnych fazach gry;
  ucinanie jest zabezpieczeniem.
- **Intro** (`intro.webm`) — osobny, istniejący kanał, bez zmian.

Krótkie SFX **nie** ucinają jingla — ding odsłonięcia w trakcie przerywnika
brzmi na jego tle (naturalne, jak w TV).

## Zmiany w kodzie

- **`public/board.html`**: elementy `<audio>` — 5 SFX + 3 jingle + istniejące
  intro. Usunięcie `snd-correct`, `snd-error`, `snd-brawo`.
- **`public/board.js`**:
  - `handleEvent(event)` przepisany wg mapy powyżej.
  - Helpery `playSfx(id)` (odtwórz od zera, nakładanie dozwolone) i
    `playJingle(id)` (zatrzymaj poprzedni jingiel, odtwórz nowy).
  - Usunięcie funkcji `beep` i wywołań WebAudio (`buzz`, `cheap-reveal`,
    timer=0 przechodzą na pliki).
  - Wielki X (overlay) bez zmian: nadal miga na `strike`, `strike-out`,
    `steal-fail`.
- **`server/game.js`**: komenda `timerStart` przyjmuje pole `player`
  (`1` lub `2`); zdarzenie zwracane rozszerzone do
  `{ type: 'timer-start', player }`. Walidacja: `player` opcjonalny, gdy
  podany musi być `1` lub `2` (inaczej pomijany / traktowany jak brak).
  Reszta zachowania timera bez zmian.
- **`public/host.js`**: przycisk „Start 15 s (gracz 1)" wysyła
  `timerStart{ seconds: 15, player: 1 }`, „Start 20 s (gracz 2)" →
  `timerStart{ seconds: 20, player: 2 }`.

## Przypadki brzegowe

- **Autoplay / gest użytkownika**: bramka startowa „Pełny ekran" już
  odblokowuje audio przy pierwszym kliknięciu — bez zmian.
- **Reconnect / refresh**: istniejący strażnik `lastSeq` plus `event: null`
  w snapshotcie wysyłanym na połączenie sprawiają, że żaden dźwięk nie
  odtworzy się ponownie po reconnekcie. Jingiel grający w chwili odświeżenia
  tablicy nie jest wznawiany (akceptowalne — to moment przejściowy).
- **Nawigacja rundami strzałkami**: każde `new-round` gra przerywnik
  (zgodnie z „start każdej rundy"); szybkie przeskoki restartują jingiel —
  świadomie dopuszczalne.
- **Brak pliku / błąd odtwarzania**: `play()` opakowany w `.catch(() => {})`,
  pojedynczy niezaładowany dźwięk nie wywala reszty.

## Testy

- **`server/game.js`**: test jednostkowy `timerStart{ player }` — zdarzenie
  `timer-start` echuje `player`; `player` spoza `{1,2}` nie psuje komendy
  (timer nadal ustawiony, `player` pominięty). Istniejące testy timera
  zostają zielone.
- **Warstwa DOM tablicy**: weryfikacja ręczna w przeglądarce (Playwright) —
  dla reprezentatywnych zdarzeń sprawdzenie, że właściwy element `<audio>`
  dostaje `.play()` (przez podmianę/monkeypatch `play` i zliczanie wywołań),
  oraz że `playJingle` zatrzymuje poprzedni jingiel.

## Poza zakresem

- Dźwięk wygranej / końca gry (świadomie cisza).
- Zmiany wizualne (ikona X w finale, animacje) — bez zmian.
- Regulacja głośności / ducking / mikser WebAudio (YAGNI).
- Odtwarzanie dźwięku na panelu hosta lub buzzerach (nadal tylko tablica).
