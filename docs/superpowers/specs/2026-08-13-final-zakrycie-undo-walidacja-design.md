# Zakrycie tablicy w finale, globalne UNDO, uszczelnienie reguł — design

Trzy powiązane usprawnienia panelu prowadzącego i maszyny stanów:

1. Zakrywanie odpowiedzi gracza 1 na tablicy na czas wejścia gracza 2 w finale.
2. Globalne UNDO/REDO zamiast punktowych cofnięć (−X, chowanie odpowiedzi,
   „cofnij" w finale).
3. Uszczelnienie strażników komend w `server/game.js` + przycisk ręcznego
   przyznania sumy.

## 1. Zakrycie tablicy w finale

Przebieg na evencie: host wpisuje odpowiedzi gracza 1 → klika **ZAKRYJ
TABLICĘ** → gracz 2 wchodzi i staje tyłem do tablicy → host klika **ODKRYJ
TABLICĘ** → start 20 s i wpisywanie odpowiedzi gracza 2 przy odkrytej tablicy
(widownia widzi, gracz 2 nie).

- **Stan:** nowe pole `final.covered` (boolean, początkowo `false`).
- **Komenda:** `finalCover { covered: boolean }`, dozwolona tylko w fazie
  `final`. Komenda „cicha" (event `null`, dopisana do zbioru `SILENT`
  w `server/index.js`) — zero dźwięków na tablicy.
- **Tablica (`board.js`):** gdy `covered`, wszystkie wiersze finału renderują
  się jak niewpisane (kreski + `--`), niezależnie od `entries`. SUMA finału
  pozostaje widoczna (nie zdradza odpowiedzi, widownia nie traci kontekstu).
- **Panel hosta:** jeden przycisk-przełącznik w karcie finału obok timerów:
  „ZAKRYJ TABLICĘ" ↔ „ODKRYJ TABLICĘ" (etykieta wg bieżącego `covered`).
- **Walidacja:** gdy `covered === true`, komenda `finalSet` jest odrzucana
  (wpis przy zakrytej tablicy odpaliłby dźwięk odkrycia bez efektu na
  ekranie — to zawsze pomyłka). Przyciski odpowiedzi finału w panelu
  wyszarzone. „POWTÓRZONA!" i timery działają normalnie.
- Zakrycie żyje w stanie serwera, więc przetrwa odświeżenie tablicy,
  drugą tablicę i restart serwera (`state.json`).

Odrzucona alternatywa: automatyczne zakrycie przy starcie timera gracza 2 —
wybrano jawną, ręczną kontrolę momentu zakrycia i odkrycia.

## 2. Globalne UNDO/REDO

Architektura (mały stan + pełne snapshoty) czyni undo niemal darmowym:
serwer odkłada kopię stanu przed każdą zmianą i przywraca ją na żądanie.

### Serwer (`server/index.js`)

- Stos `history` **w pamięci** (nie w `state.json`): po restarcie serwera
  historia jest pusta, gra trwa dalej. Cap 100 wpisów — najstarsze wypadają.
- Wpis stosu: `{ label, state }`, gdzie `state` to głęboka kopia
  (`structuredClone` lub round-trip JSON) sprzed wykonania komendy,
  a `label` to czytelny polski opis akcji (np. „X dla Lewej",
  „odkrycie: COBOL", „nowa runda 3", „buzz: Prawa", „nowa gra").
- Wpis powstaje dla każdej komendy, która faktycznie zmieniła stan
  (`stateChanged`), **z wyjątkiem** `introVideoEnded` (automat z tablicy,
  zaśmiecałby wierzch stosu) oraz samych `undo`/`redo`.
- Komenda `undo`: pop z `history` → bieżący stan idzie na stos `redo` →
  przywrócony stan rozgłaszany snapshotem z `event: null` (bez dźwięków).
  Komenda `redo` odwrotnie. Każdy nowy wpis do `history` czyści stos `redo`.
- Undo/redo obsługiwane w `index.js` (to operacja na historii, nie reguła
  gry) — `apply()` w `game.js` ich nie zna.
- Snapshot rozszerzony o `undoLabel` i `redoLabel` (`null`, gdy stos pusty),
  żeby panel mógł pokazać, co zostanie cofnięte.
- Po undo/redo stan jest normalnie zapisywany do `state.json`.

### Panel hosta (`host.js` / `host.html`)

- Dwa stale widoczne przyciski w stopce: „⟲ COFNIJ: \<undoLabel\>"
  i „⟳ PONÓW" — wyszarzone, gdy odpowiedni stos pusty. Etykieta na
  przycisku jest istotna: na wierzchu stosu może leżeć buzz z tabletu,
  host musi widzieć, co cofa.

### Usunięcie cofnięć punktowych

- Z `game.js` znikają komendy `hide`, `unstrike`, `finalClear`
  (i ich wpisy w `SILENT`).
- Z panelu znikają przyciski „− X" i „— cofnij" przy wpisie finału
  (wpisany wybór gracza staje się zwykłą etykietą tekstową).
- Klik w odkrytą odpowiedź oraz skróty 1–6 na odkrytej odpowiedzi — no-op.
- Powrót ze `steal` do `play` po pomyłkowym trzecim X dzieje się naturalnie
  przez undo (przywrócenie snapshotu) — specjalna logika z `unstrike` zbędna.
- Undo działa też na „Nową grę" (dodatkowa siatka bezpieczeństwa obok
  `confirm()`).
- Zostają narzędzia operacyjne, które nie są undo: „Uzbrój buzzery
  ponownie", „Stop timera", „Stop muzykę", ręczna edycja nazw i banków.

## 3. Uszczelnienie maszyny stanów + przycisk sumy

Zostajemy przy obecnym stylu (strażniki per komenda w `apply()`), bez
przepisywania na deklaracyjną tabelę — przy tej skali to przerost formy.

1. **`choosePlayingTeam` zeruje `strikes` obu drużyn.** X na pytaniu
   startowym to tylko sygnał „pudło" (dźwięk + wielki X + znaczek przy
   drużynie); gra właściwa startuje od czystego licznika, jak w TV.
2. **`strike` w stage `play` tylko dla `playingTeam`.** Strażnik w `game.js`
   (łapie też skróty Q/W) + wyszarzony przycisk „+ X" drużyny niegrającej.
   W stage `buzzers` X nadal dla obu drużyn (pytanie startowe).
3. **`awardSum` zostaje i dostaje przycisk.** W każdym boxie drużyny
   przycisk „SUMA DLA NICH", aktywny tylko w stage `play` i `steal`
   (strażnik zawężony — dziś dozwolony też w `buzzers`, gdzie przyznanie
   sumy kończyłoby rundę bez drużyny grającej). Pomyłkę ratuje undo.
4. **`introStart` tylko w fazie `idle`.** Dziś kliknięcie „Intro" w trakcie
   rundy po cichu brudzi stan (`intro='video'`), choć tablica to ignoruje.
5. **`repeatBuzzer` tylko w fazie `final`.** To dźwięk finałowy — poza
   finałem zawsze pomyłka.
6. **`finalSet` odrzucane przy `final.covered`** (sekcja 1).

Bez zmian (świadomie):

- Wybór drużyny grającej nieodwracalny punktowo (ratuje undo).
- `setBank` / `setTeamName` działają zawsze (korekty ręczne).
- `startFinal` / `endGame` / `newRound` dostępne zawsze (meta-kontrola
  hosta).
- Na pytaniu startowym dozwolone pozostają: odkrycie odpowiedzi, X,
  buzz/reset buzzerów, wybór drużyny — nic ponadto (po usunięciu
  `hide`/`unstrike` to wynika wprost z pozostałych strażników).

## Testy (`node:test`)

- Zerowanie X-ów obu drużyn przy `choosePlayingTeam`.
- `strike` w `play` odrzucany dla drużyny niegrającej; w `buzzers`
  dozwolony dla obu.
- `finalCover` przełącza `covered`; `finalSet` odrzucany przy zakryciu;
  `finalCover` poza fazą `final` odrzucany.
- `covered` przeżywa round-trip przez JSON (persystencja).
- `introStart` poza `idle` i `repeatBuzzer` poza `final` odrzucane.
- Undo/redo na poziomie serwera: cofnięcie odkrycia przywraca sumę
  i `revealed`, redo powtarza, nowa akcja czyści redo, etykiety
  w snapshocie, cap stosu, `introVideoEnded` nie tworzy wpisu.
- Usunięte komendy (`hide`, `unstrike`, `finalClear`) są odrzucane
  (zwracają `null`, stan bez zmian) — stare testy do aktualizacji.

## Poza zakresem

- Persystencja historii undo w `state.json`.
- Nieliniowe/selektywne cofanie (błąd zauważony N akcji później →
  N × undo i ponowne wyklikanie albo ręczna korekta banków).
- Zakrywanie SUMY finału.
