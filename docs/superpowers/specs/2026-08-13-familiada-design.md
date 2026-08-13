# Familiada 2 — design

Aplikacja do prowadzenia gry Familiada (polska wersja Family Feud) na evencie:
ekran tablicy na projektorze, panel prowadzącego na innym komputerze/tablecie
po sieci lokalnej (albo na tym samym kompie), opcjonalne buzzery na dwóch
tabletach. Pełne zasady gry z TV, łącznie z finałem. Wygląd tablicy: wierna
replika telewizyjnej tablicy Familiady, z użyciem assetów ze starej wersji
(`Familiada-src/`).

## Architektura

- **Autorytatywny serwer stanu**: Node.js (Express + `ws`), frontend w czystym
  JS bez build stepu (statyczne pliki). Start: `npm start`; serwer wypisuje
  w konsoli adresy LAN dla pozostałych urządzeń.
- Cały stan gry żyje w jednym obiekcie na serwerze. Klienci wysyłają komendy
  JSON po WebSocket (`revealAnswer`, `strike`, `chooseTeam`, `buzz`, ...);
  serwer waliduje, aktualizuje stan i rozgłasza **pełny snapshot** stanu do
  wszystkich klientów po każdej zmianie (stan jest mały, delty niepotrzebne).
- Logika gry (maszyna stanów rund i finału) to czysty moduł bez zależności od
  sieci i DOM — testowalny jednostkowo.
- **Persystencja**: po każdej zmianie stan zrzucany do `state.json`; restart
  serwera wznawia grę w tym samym miejscu. Klienci auto-reconnectują
  (retry w pętli) i po połączeniu dostają aktualny snapshot — odświeżenie
  dowolnej przeglądarki niczego nie psuje.

## Widoki (statyczne strony)

| URL | Rola |
|---|---|
| `/` | strona startowa: linki + QR-kody do pozostałych widoków |
| `/board` | tablica na projektor, fullscreen, replika TV |
| `/host` | panel prowadzącego: pełny podgląd (pytanie + wszystkie odpowiedzi z punktami widoczne od razu), sterowanie; duże dotykalne elementy (laptop i tablet) |
| `/buzzer/1`, `/buzzer/2` | jeden wielki przycisk na cały ekran w kolorze drużyny |

- Panel hosta ma też skróty klawiszowe w duchu starej wersji: `1`–`6`
  odkrycie odpowiedzi, `Q`/`W` błąd lewej/prawej drużyny, strzałki nawigacja
  między rundami. Na jednym kompie gra się klawiaturą z `/board` na drugim
  monitorze.
- Dźwięki odtwarza **tablica** (`/board`) — to ona jest pod nagłośnieniem.
- Kilka jednocześnie otwartych tablic/paneli jest dozwolone (wszystkie dostają
  ten sam stan).

## Przebieg gry

### Konfiguracja

Plik `questions.json` obok serwera, czytany przy starcie:

```json
{
  "teams": ["Lewa", "Prawa"],
  "rounds": [
    {
      "question": "Najlepszy język programowania",
      "multiplier": 1,
      "answers": [
        { "text": "COBOL", "points": 34 },
        { "text": "Nim", "points": 26 }
      ]
    }
  ],
  "final": [
    { "question": "...", "answers": [{ "text": "...", "points": 40 }] }
  ]
}
```

- Mnożnik na rundę; domyślny przykładowy zestaw jak w TV: rundy 1–3 ×1,
  runda 4 ×2, runda 5 ×3. Prowadzący może zakończyć grę po dowolnej rundzie.
- Nazwy drużyn z pliku to domyślne — host może je zmienić w panelu.
- Walidacja przy starcie serwera z czytelnym komunikatem: poprawny JSON,
  wymagane pola, maks. 6 odpowiedzi w rundzie, finał dokładnie 5 pytań
  (sekcja `final` może być pusta → przycisk finału nieaktywny).
- Przykładowy plik powstanie ze starych pytań WWW (`Familiada-src/js/questions.js`);
  stara wersja nie miała punktów, więc przykładowe punkty zostaną zmyślone.

### Pytanie startowe

1. Host klika „Nowa runda" → tablica pokazuje pustą planszę rundy, buzzery
   się uzbrajają.
2. Pierwsze naciśnięcie buzzera blokuje drugi; o kolejności decyduje kolejność
   dotarcia wiadomości na serwer. Tablica i panel pokazują, kto był pierwszy
   (+ dźwięk); tablet zwycięzcy świeci „TY!".
3. Rozstrzyganie ustne: host odkrywa padnięte odpowiedzi (wchodzą do SUMY)
   i **ręcznie klika, która drużyna gra rundę**. Tryb bez tabletów = po prostu
   nie używa się buzzerów.

### Runda właściwa

- Trafienie → host odkrywa odpowiedź; `punkty × mnożnik` wpadają do SUMA.
- Pudło → X (duży X na tablicy po stronie grającej drużyny + brzęczyk).
- **3 X-y → przejęcie**: druga drużyna ma jedną szansę. Host odkrywa trafioną
  odpowiedź (→ cała SUMA dla przejmujących) albo klika „pudło" (→ SUMA
  zostaje u grających).
- Wszystkie odpowiedzi odkryte przed 3 X → SUMA automatycznie dla grających.
- Po rozstrzygnięciu host odsłania pozostałe odpowiedzi „za darmo"
  (bez punktów, bez fanfar — inny dźwięk).
- Banki obu drużyn stale widoczne na tablicy. „Następna runda" → kolejne pytanie.

### Finał

- Po ostatniej rundzie host klika „Finał" → układ finałowy tablicy: 5 wierszy
  (pytań) × 2 kolumny (gracz 1 / gracz 2), na dole wielka SUMA finału.
  Punkty bez mnożników.
- Gracz 1: „Start 15 s" — duży timer na tablicy, dźwięk po dojściu do zera.
  Timer jest wyłącznie informacyjny — o niczym nie decyduje automatycznie.
- Wpisywanie wyników gracza 1: host przy każdym pytaniu klika trafioną
  odpowiedź z ankiety (wiersz odsłania tekst + punkty, dźwięk „correct")
  albo „0 pkt" (wiersz pokazuje `———`, dźwięk błędu). Wiersz po wierszu,
  w tempie prowadzącego.
- Gracz 2: „Start 20 s". Podczas odpowiadania host ma przycisk **„POWTÓRZONA"**
  grający brzęczyk (gracz podaje inną odpowiedź). Przy wpisywaniu odpowiedzi
  gracza 2 odpowiedzi użyte przez gracza 1 są w panelu wyszarzone.
- SUMA ≥ 200 → animacja wygranej + `brawo.wav`; poniżej — plansza końcowa
  z wynikiem.
- Świadome uproszczenie: nie wpisujemy dosłownego tekstu odpowiedzi gracza
  (jak robi operator w TV) — pokazujemy dopasowaną odpowiedź z ankiety albo
  kreski.

### Intro / ekran startowy

- Assety: `Familiada intro-WjaGpNT-Qbw.webm` = **samo audio** czołówki,
  `Familiada-src/Familiada - czoêówka.-48kEC0XJvIY.mp4` = **samo wideo**.
- Przed startem gry tablica pokazuje pierwszą klatkę czołówki (mp4 spauzowany
  na klatce 0).
- Host klika „Intro" → jednocześnie startuje wideo (mp4) i audio (webm).
- Koniec wideo → tablica przełącza się na pustą planszę gry; audio gra dalej.
- Audio zatrzymuje przycisk „Stop muzyka" oraz każda akcja rozpoczynająca grę.

### Korekty (ważne na żywym evencie)

Wszystko odwracalne z panelu hosta: cofnięcie X, ponowne schowanie odpowiedzi,
ręczna edycja banków drużyn, reset/ponowne uzbrojenie buzzerów, powrót
z finału do rund, cofnięcie odkrycia w finale, reset timera.
„Nowa gra" tylko z potwierdzeniem.

## Wygląd

Kierunek: **wierna replika telewizyjnej tablicy Familiady** — zielono-żółty
matrix LED na czarnym tle, układ jak w programie (numery, odpowiedzi, punkty,
SUMA, X-y po bokach), font `familiada.ttf` ze starej wersji. Szczegóły
(animacje odkrywania, efekt matrixa) do ustalenia na etapie implementacji
ze skillem frontend-design.

Dźwięki ze starej wersji: `correct.mp3` (odkrycie), `error.mp3` (X, powtórzona
odpowiedź w finale), `brawo.wav` (wygrana).

## Obsługa błędów

- Błędny `questions.json` → czytelny komunikat przy starcie serwera.
- Utrata WebSocket → klient pokazuje dyskretny wskaźnik „reconnecting"
  i łączy się ponownie w pętli; po połączeniu dostaje snapshot.
- Restart/crash serwera → stan wraca z `state.json`.
- Nieprawidłowe komendy (np. `strike` gdy nie trwa runda) serwer ignoruje.

## Testy

- Maszyna stanów gry: testy jednostkowe w `node:test` (przebieg rundy,
  przejęcie, mnożniki, banki, finał z powtórkami, korekty).
- Widoki: ręcznie + krótka checklista smoke-testu w README
  (board + host + 2 buzzery na jednym kompie).

## Poza zakresem

- Edytor pytań w UI (plik edytowany ręcznie).
- Tryb offline `file://` (zawsze mały serwer).
- Dosłowne wpisywanie odpowiedzi graczy w finale.
- Więcej niż 2 drużyny.
