# Familiada 2

Domowa wersja teleturnieju „Familiada" na jeden wieczór: serwer Node.js +
przeglądarkowa tablica (projektor), reżyserka (panel sterowania grą),
widok sceny dla prowadzącego i buzzery na
telefonach/tabletach — wszystko połączone przez WebSocket w lokalnej sieci.

## Uruchomienie

```bash
npm install
npm start
```

Serwer wystartuje na porcie `3000` i wypisze w konsoli listę adresów, pod
którymi jest dostępny (m.in. `http://localhost:3000/` oraz adresy LAN
komputera). Otwórz `http://localhost:3000/` — to strona startowa z kaflami
i kodami QR do wszystkich widoków:

- **Tablica (projektor):** `/board` — podłącz do projektora/telewizora i
  włącz pełny ekran (**F11** w przeglądarce).
- **Reżyserka (sterowanie grą):** `/host` — panel operatora; otwórz
  z laptopa albo tabletu w tej samej sieci.
- **Scena (prowadzący):** `/stage` — widok na telefon prowadzącego
  występującego na scenie: aktualne pytanie, kto się wbił na buzzerze
  i która drużyna odpowiada (w finale — lista 5 pytań).
- **Buzzery:** `/buzzer/1` (drużyna lewa) i `/buzzer/2` (drużyna prawa) —
  najwygodniej otworzyć telefonem/tabletem, skanując kod QR ze strony
  startowej.

Zmienne środowiskowe (opcjonalne, z wartościami domyślnymi):

| Zmienna         | Domyślnie        | Znaczenie                          |
|-----------------|-------------------|-------------------------------------|
| `PORT`          | `3000`            | port HTTP/WS serwera                |
| `STATE_FILE`    | `state.json`      | plik z zapisanym stanem gry         |
| `QUESTIONS_PATH`| `questions`       | katalog z zestawami pytań albo pojedynczy plik (patrz niżej) |

**Uwaga o sieci:** wszystkie urządzenia (laptop z serwerem, projektor,
reżyserka, buzzery) muszą być w **tej samej sieci lokalnej** (np. ten sam
Wi-Fi). Jeśli buzzery/reżyserka nie mogą się połączyć z innego urządzenia niż
ten, na którym działa serwer, sprawdź **firewall** — port **3000/TCP** musi
być odblokowany dla połączeń przychodzących z sieci lokalnej.

## Sterowanie

### Skróty klawiszowe reżyserki (`/host`)

| Klawisz   | Akcja                                            |
|-----------|---------------------------------------------------|
| `1`–`6`   | odkryj odpowiedź o danym numerze (cofanie: ⟲ COFNIJ) |
| `Q`       | X dla drużyny lewej                                |
| `W`       | X dla drużyny prawej                               |
| `←`       | poprzednia runda                                   |
| `→`       | następna runda                                     |

Skróty są nieaktywne, gdy fokus jest w polu tekstowym (np. w sekcji
„Korekty").

### Przyciski reżyserki

- **Intro** — odpala wideo czołówki, po nim leci muzyka w tle na tablicy.
- **Stop muzykę** — ucina muzykę intra.
- **+ X** (na drużynę) — dodaje przewinienie (odpowiednik `Q`/`W`); w grze
  właściwej aktywny tylko dla drużyny grającej.
- **SUMA DLA NICH** (na drużynę) — ręczne przyznanie sumy rundy do banku.
- **⟲ COFNIJ / ⟳ PONÓW** — globalne cofnięcie ostatniej akcji (etykieta na
  przycisku mówi, co zostanie cofnięte); zastępuje dawne `− X`, chowanie
  odpowiedzi i „cofnij" w finale. Historia żyje w pamięci serwera — restart
  serwera ją czyści (gra trwa dalej).
- **GRA TA DRUŻYNA** — wybór drużyny grającej po naciśnięciu buzzera.
- **Uzbrój buzzery ponownie** — reset buzzerów w danej rundzie (np. po
  nieważnym starcie).
- **PRZEJĘCIE: PUDŁO** — drużyna przejmująca nie zgadła, suma zostaje przy
  drużynie grającej.
- **Odpowiedzi 1–6 na liście** — klik odkrywa (jak `1`–`6`).
- **◀ Poprzednia / Nowa runda / Następna ▶** — nawigacja po rundach.
- **Finał** — start rundy finałowej (aktywny tylko, gdy plik pytań ma
  dokładnie 5 pytań finałowych).
- **Koniec gry** — przechodzi do ekranu wyników na tablicy.
- **Nowa gra** — zeruje banki i cały postęp (z potwierdzeniem). Gdy w
  katalogu `questions/` jest więcej niż jeden zestaw pytań, obok przycisku
  pojawia się lista wyboru zestawu na nową grę (pokazuje aktywny zestaw).
- W sekcji finału: **Start 15 s / 20 s** uruchamia timer gracza, **Stop
  timera** go zatrzymuje, **POWTÓRZONA!** sygnalizuje odpowiedź do
  powtórzenia (dźwięk błędu, bez zmiany stanu).
  **ZAKRYJ/ODKRYJ TABLICĘ** chowa odpowiedzi gracza 1 na czas wejścia
  gracza 2 (SUMA zostaje widoczna).
- **Korekty** (rozwijana sekcja) — ręczna zmiana nazwy drużyny i wartości
  banku, na wypadek pomyłki.

### Buzzery (`/buzzer/1`, `/buzzer/2`)

Ekran dotykowy: szare „CZEKAJ" gdy runda nie jest aktywna, kolorowe
„NACIŚNIJ!" gdy buzzery są uzbrojone, „TY!" dla drużyny, która nacisnęła
pierwsza, „SPÓŹNIONY" dla drugiej. Ekran nie gaśnie w trakcie gry (Wake
Lock, jeśli przeglądarka wspiera).

## Pliki pytań (zestawy)

Domyślnie serwer czyta wszystkie pliki `*.json` z katalogu `questions/` —
każdy plik to jeden **zestaw pytań**. Zestawy są sortowane alfabetycznie po
nazwie pliku; pierwszy z listy jest aktywny po starcie od zera. Nazwa pliku
(bez `.json`) jest widoczna jako nazwa zestawu w reżyserce, więc kolejność
można wymusić prefiksem (`01-firma.json`, `02-rodzina.json`). Zestaw zmienia
się przy starcie **nowej gry** w reżyserce. Ścieżkę można zmienić zmienną
`QUESTIONS_PATH` (katalog albo pojedynczy plik — wtedy jest tylko jeden
zestaw, a lista wyboru w reżyserce się nie pokazuje). Struktura pliku:

```json
{
  "teams": ["Lewa", "Prawa"],
  "rounds": [
    {
      "question": "Najlepszy język programowania",
      "multiplier": 1,
      "answers": [
        { "text": "COBOL", "points": 34 },
        { "text": "Nim", "points": 26 },
        { "text": "Javascript", "points": 18 }
      ]
    }
  ],
  "final": [
    {
      "question": "Co panuje w kuchni?",
      "answers": [
        { "text": "Syf / burdel", "points": 40 },
        { "text": "Muchy", "points": 30 }
      ]
    }
  ]
}
```

Zasady walidacji (serwer odmówi startu z czytelnym komunikatem, jeśli plik
im nie odpowiada):

- `teams` — opcjonalne, tablica dokładnie dwóch niepustych nazw drużyn
  (domyślnie `["Lewa", "Prawa"]`).
- `rounds` — wymagana, co najmniej jedna runda. Każda runda ma `question`
  (niepusty tekst), `answers` (**od 1 do 6** odpowiedzi, każda z `text` i
  nieujemnymi całkowitymi `points`) oraz opcjonalny `multiplier` (dodatnia
  liczba całkowita, domyślnie `1` — mnoży punkty odpowiedzi w tej rundzie).
- `final` — opcjonalna; jeśli podana i niepusta, musi mieć **dokładnie 5**
  pytań (każde jak wyżej, bez `multiplier`). Pusta tablica lub brak pola
  oznacza brak finału — przycisk „Finał" w reżyserce będzie wtedy nieaktywny.

## Dźwięk

Tablica (`/board`) odtwarza dźwięki efektów i muzykę intra przez
`<audio>`/Web Audio. Przeglądarki blokują autoplay dźwięku, dopóki
użytkownik nie wejdzie w interakcję ze stroną — dlatego zaraz po otwarciu
`/board` na ekranie widać podpowiedź **„kliknij, aby aktywować dźwięk"**.
Wystarczy jedno kliknięcie/dotknięcie ekranu tablicy zaraz po załadowaniu
(podpowiedź znika automatycznie po 5 s albo po kliknięciu).

## Awarie

Stan gry jest zapisywany do `state.json` po każdej zmianie. Serwer można
bezpiecznie zabić (Ctrl+C) i uruchomić ponownie w dowolnym momencie —
`npm start` wczyta ostatni zapisany stan i gra wraca dokładnie w to samo
miejsce (pytania aktywnego zestawu są wtedy wczytywane na nowo z pliku w
`questions/`, reszta stanu z `state.json`; jeśli plik zestawu zniknął,
serwer bierze pierwszy z listy). Wszystkie podłączone widoki (tablica, reżyserka,
buzzery) same się przełączają w tryb łączenia i wracają po ponownym
starcie serwera — nic nie trzeba ręcznie odświeżać.

Aby zacząć zupełnie od zera (np. inna gra, inny zestaw pytań), użyj
przycisku **„Nowa gra"** w reżyserce (z wyborem zestawu), bez restartu
serwera. Ten sam efekt (ze startem od pierwszego zestawu) daje skasowanie
`state.json` przed uruchomieniem serwera — plik jest ignorowany przez git
(`.gitignore`), więc nie trzeba tego cofać w repo.

## Smoke test

Ręczna checklista do przejścia przed każdym większym wydarzeniem:

1. `npm test` — wszystko zielone.
2. `npm start`; otwórz `/board`, `/host`, `/buzzer/1`, `/buzzer/2` (4
   karty/urządzenia).
3. Intro → wideo, po nim plansza + muzyka w tle; „Stop muzykę" ucina.
4. Nowa runda → buzzery aktywne; tap na buzzerze → „TY!" na tym buzzerze i
   dźwięk dzwonków na tablicy.
5. Odkrycia (`1`–`6`), X-y (`Q`/`W`), przejęcie, przyznanie sumy do banku,
   ⟲ COFNIJ ostatniej akcji — dźwięki i tablica spójne ze stanem reżyserki.
6. Finał: timery (15 s / 20 s), „POWTÓRZONA!", wygrana przy sumie ≥ 200 →
   plansza „brawo", zakrycie i odkrycie tablicy przy wejściu gracza 2.
7. Zabij serwer (Ctrl+C), `npm start` — gra wraca w tym samym miejscu,
   klienci (tablica/reżyserka/buzzery) sami się łączą ponownie.
8. „Nowa gra" → wszystko wyzerowane (banki, rundy, finał).
