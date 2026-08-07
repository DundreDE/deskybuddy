# DeskyBuddy — Roadmap (v0.3 → v0.10)

Dieser Plan beschreibt, wie sich DeskyBuddy von der aktuellen v0.2.0 über die nächsten Versionen weiterentwickeln könnte. Er ist bewusst offen/kontinuierlich angelegt (kein festes „1.0"-Ziel) und verzichtet auf bezahlte Code-Signierung/Notarisierung — bleibt also ein kostenloses Hobbyprojekt. **Jedes neue Feature bekommt einen eigenen Settings-Toggle**, nach dem bestehenden Muster in `DEFAULT_SETTINGS` (`main.js`) / `renderer/settings.html` + `renderer/settings.js`.

Die Reihenfolge folgt einer klaren Logik: erst technische Basis (Refactoring/Tests/CI, solange die Codebasis noch klein ist), dann Sprache + Innenleben (Stats/Mood, weil viele spätere Features darauf aufbauen), dann Plattform-Parität (schließt die größte bestehende Lücke — Musikerkennung nur auf Windows), dann der Content-Bogen Kleiderschrank → Lebendige Welt → Bindung/Belohnung → Spiel/Übersicht, bei dem jede Stufe auf der vorigen aufbaut.

---

## v0.3 — Technische Basis I: Charakter-Fundament & CI

**Ziel:** Grundlage schaffen, bevor neue Charaktere/Wardrobe-Items die Boilerplate weiter aufblähen.

- **Charakter-Basis-Refaktorierung** — Gemeinsame Boilerplate (Palette-Anwendung, `inEllipse`/`set`-Grid-Helper, Canvas-Setup, Standard-Setter wie `setBlinking`/`setLook`) aus allen 10 Charakter-IIFEs (`renderer/avocado.js`, `bee.js`, `citrus.js`, `croissant.js`, `dragon.js`, `kaktus.js`, `monkey.js`, `pilz.js`, `toast.js`, `wolke.js`) in ein neues `renderer/character-base.js` extrahieren. Jede Charakter-Datei behält nur ihre eigenen `PALETTES` + `buildFrame()`-Extras.
  - Nebenbei: `dragon.js` → `crab.js` umbenennen, `PixelDragon`-Global → `PixelCrab` (Altlast-Naming, betrifft die `SPRITE_MODULES`-Map in `renderer.js` und die Script-Tag-Reihenfolge in `index.html`).
  - Kein User-Toggle nötig (reiner Refactor).
- **CI-Lint** — ESLint + Prettier (Flat Config), `npm run lint`-Script, neuer Job in `.github/workflows/` (push/PR-getriggert, unabhängig vom Release-Build-Matrix in `build.yml`).

---

## v0.4 — Technische Basis II: Tests & Update-Robustheit

- **Automatisierte Tests** — `@playwright/test` mit Electron-Support (`_electron.launch`) für kritische Pfade: Settings-Persistenz-Roundtrip (Toggle in `settings.html` → `buddy-settings.json`), Drag-and-Drop löst `DRAGGING`-State aus, Klick löst `pet`-Stat-Update aus, Charakterwechsel persistiert. Neuer `tests/`-Ordner, `npm test`-Script, in CI eingebunden.
- **Robusteres Auto-Update** — Handgestrickte `checkForUpdates()`/`httpsGetJson()`/`downloadFile()`-Logik in `main.js` durch `electron-updater` ersetzen (GitHub-Releases-Provider, `publish: null` → `publish: { provider: 'github' }` in `package.json`). Bestehende Dialog-UX bleibt, aber über `autoUpdater`-Events statt manuellem Versionsvergleich + Redirect-Following. macOS/Linux bleiben beim „Release-Seite öffnen"-Fallback (kein Silent-Update ohne Signierung), nur Windows-NSIS bekommt den vollen Silent-Download-Install-Pfad wie bisher.

---

## v0.5 — Sprache & Innenleben

**Ziel:** Mehrsprachigkeit *vor* den content-schweren Versionen (spart Nacharbeit bei neuen UI-Strings), Stats/Mood als Fundament für Level-System & Achievements später.

- **i18n (Englisch)** — Alle hartkodierten deutschen Strings (Tray-Menü in `buildMenu()`, `settings.html`-Labels, Onboarding-Tour-Text, Dialogmeldungen) in `renderer/i18n/de.json` + `en.json` extrahieren, simpler Key-Lookup-Helper (kein schweres Framework nötig). Neues `language`-Setting (`'auto' | 'de' | 'en'`) in `DEFAULT_SETTINGS`, Auto-Erkennung via `app.getLocale()`. Sprachauswahl-Dropdown in `settings.html`.
- **Stats-Verfall über Zeit** — Periodischer Decay-Tick (`main.js`, z.B. alle 5 Min) reduziert `happiness`/`fullness` Richtung Untergrenze, basierend auf den bereits vorhandenen `lastPetted`/`lastFed`-Timestamps in `state`. Neuer Toggle `statsDecay` in `DEFAULT_SETTINGS` (Default `true`, abschaltbar für altes Verhalten).
- **Mood-System** — `mood`-Stufe (`happy | neutral | grumpy | hungry`) aus `state.happiness`/`state.fullness`-Schwellen ableiten. `idle-pool.js`-Einträge bekommen optionales `minMood`/`moodWeight`-Feld; `idle-director.js`s Auswahllogik (aktuell nur `appliesTo`-Filter) bekommt einen zusätzlichen Mood-Filter. Toggle: `moodAffectsAnimations`.

---

## v0.6 — Plattform-Parität

**Ziel:** Größte bestehende Lücke schließen (Musikerkennung nur Windows), solange der Content-Umfang noch überschaubar ist.

- **macOS-Musikerkennung** — Kleiner nativer Helper (MediaRemote-Framework lässt sich nicht direkt per AppleScript ansprechen, braucht einen kompilierten Mini-Helper analog zu `native/get-media-status.ps1`). Neuer `process.platform === 'darwin'`-Zweig in `startMediaWatch()` (`main.js`), pollt alle ~6s wie der bestehende Windows-Pfad.
- **Linux-Musikerkennung** — MPRIS via D-Bus, bevorzugt über eine Node-D-Bus-Library (`dbus-next`) direkt gegen `org.mpris.MediaPlayer2.Player`, statt eine externe `playerctl`-Abhängigkeit vorauszusetzen. Neuer `process.platform === 'linux'`-Zweig in `startMediaWatch()`.
- **macOS-Menüleisten-Modus** — Alternative Anker-Geometrie zur bestehenden `getAnchorGeometryFor()` (die aktuell an die untere Arbeitsbereich-Kante dockt): neue Funktion, die stattdessen nahe der oberen Menüleiste andockt, wiederverwendet die bestehende Roam-/Physik-Logik. Neuer Toggle `menuBarMode` (nur macOS sichtbar in `settings.html`).
- **Wayland-Kompatibilität** — Untersuchung: Verhalten von `uiohook-napi` (Typing/AFK-Erkennung) und `active-win` (Fullscreen-Erkennung) unter Wayland prüfen (bekannte Ökosystem-Einschränkung ohne Portale). Wahrscheinliches Ergebnis: Wayland-Session erkennen (`XDG_SESSION_TYPE`), betroffene Features sauber deaktivieren/warnen statt still zu scheitern — analog zum bestehenden Try/Catch-Degradierungsmuster für native Module.
- **Feature-Paritäts-Doku** — Neue Matrix-Tabelle (README-Abschnitt oder `PLATFORM_SUPPORT.md`): Feature × Plattform, Stand nach den obigen vier Punkten.

---

## v0.7 — Kleiderschrank & Jahreszeiten

**Ziel:** Generisches Ausrüstungssystem einmal bauen, dann Saisonal-Kostüme und Wetter-Reaktion als reine Daten daran andocken.

- **Kleiderschrank-System (neu)** — Neuer persistierter State `state.wardrobe = { unlocked: [...], equipped: [...] }` in `buddy-state.json`. Items in neuem `renderer/wardrobe-items.js`-Registry (gleiches Muster wie `props.js`s Icon-Registry): id, Anzeigename, Pixel-Art-Overlay (mit denselben `grid`/`circle`/`rect`-Helpern wie in `props.js`), `appliesTo` (Charakter-Einschränkung), Unlock-Bedingung (`manual | date-range | achievement | level` — Achievement/Level-Haken kommen erst in v0.9 zum Tragen, `manual`/`date-range` funktionieren sofort). Neue „Kleiderschrank"-UI (Sektion in `settings.html` oder eigenes kleines Fenster, Grid-Ansicht wie der bestehende Charakter-Picker: gesperrt = ausgegraute Silhouette, entsperrt = klickbar zum An-/Ausziehen). Ausgerüstete Items werden als zusätzliche Overlay-Ebene in `buildFrame()` gerendert (analog zur bestehenden Prop/Partikel-Darstellung in der Idle-Animation). Toggle: `wardrobeEnabled`.
- **Saisonale Kostüme** — Wardrobe-Items mit `dateRange`-Tag (z.B. 1.–26. Dez → Weihnachtsmütze) schalten sich beim Start/Tageswechsel automatisch frei und werden vorgeschlagen (nicht erzwungen), mit kurzer Sprechblasen-Benachrichtigung („Neues Kostüm freigeschaltet!"). Toggle: `seasonalWardrobe`.
- **Wetter-Reaktion** — Nutzer trägt optional Stadt/PLZ in den Settings ein (keine Auto-Geolocation, datensparsam) → `main.js` pollt eine kostenlose, schlüssellose Wetter-API (z.B. Open-Meteo) alle ~30 Min. Wetterlage mappt auf ein Wardrobe-Item (Regen → Regenschirm, Schnee → Schal), automatisch aus-/angerüstet solange die Bedingung anhält. Toggle: `weatherReaction`, Default **aus** (erste Funktion, die eine Nutzereingabe + externen Netzwerkaufruf braucht).

---

## v0.8 — Lebendige Welt

- **Kleiner Begleiter** — Neue leichte Roaming-Entität (Schmetterling/Maus): einfachste Umsetzung ist ein zweites kleines transparentes `BrowserWindow`, das `main.js` gelegentlich spawnt und über einen randomisierten Flugpfad auf dem aktuellen Display bewegt. Wenn er nah an Buddy vorbeifliegt, löst `idle-director.js` eine spezielle Interrupt-Animation aus („Buddy jagt"). Toggle: `companionCreature`, Frequenz konfigurierbar (gleiches Slider-Muster wie das bestehende `idleIntervalSec`).
- **Wochentag-Verhalten** — `idle-director.js`s Auswahlfunktion bekommt eine Wochentag-Gewichtungstabelle (kleines Config-Objekt: Montag → mehr „müde"-Einträge, Freitag → mehr „übermütig"-Einträge), als optionales `weekdayWeight`-Feld auf relevanten `idle-pool.js`-Einträgen. Toggle: `weekdayMoods`.
- **Sammelkarten-System** — `rarity`-Stufe (`common | rare | epic`) auf `idle-pool.js`-Einträgen; seltene Einträge bekommen niedrigere Auswahlwahrscheinlichkeit in `idle-director.js`. Beim ersten Auftreten eines Eintrags wird seine id in `state.discoveredMoments` (`buddy-state.json`) persistiert + kurze „Neuer Moment entdeckt!"-Benachrichtigung. Wird später im v0.10-Statistik-Fenster als Sammel-Galerie angezeigt. Toggle: `momentCollection`.

---

## v0.9 — Bindung & Belohnung

- **Bindungs-/Levelsystem** — Neuer State `state.bond = { xp, level }`, XP aus Pet-/Feed-Aktionen (bestehender `updateStats()`-Hook) plus Bonus für tägliche Konsistenz (teilt sich Logik mit Achievements/Streaks unten). Level-Schwellen schalten exklusive `idle-pool.js`-Einträge frei (`minBondLevel`-Feld, gleiches Filterprinzip wie `appliesTo`) und exklusive Wardrobe-Items (`unlockCondition: 'level'` aus v0.7). Toggle: `bondSystem`.
- **Achievements/Streaks** — Neue Registry (`renderer/achievements.js` oder Main-Process-Modul): Definitionen mit id, Bedingungs-Check, Belohnung (häufig ein Wardrobe-Item-Unlock). Wird bei relevanten State-Änderungen geprüft (pet/feed/level-up/moment-entdeckt), Fortschritt in `state.achievements` persistiert. Neue kleine Benachrichtigungs-Komponente (`renderer/notification.js` — bewusst *nicht* `toast.js`, das ist bereits ein Charaktername) für „Achievement freigeschaltet"-Popups, im gleichen visuellen Stil wie die bestehende Sprechblase. Toggle: `achievementsEnabled`.

---

## v0.10 — Spiel & Übersicht

- **Mini-Spiel: Ball werfen & fangen** — Nutzt die bestehende Physik in `main.js` (`throwFly()`, Gravity/Velocity-Sampling, aktuell fürs Drag&Throw von Buddy selbst) für ein geworfenes Ball-Objekt, das Buddy jagt/fängt. Neuer Action-State `PLAYING` neben den bestehenden (`IDLE, PETTED, EATING, SLEEPING, WALKING, DRAGGING, FALLING`). Einstieg über Tray-Menü („Ball spielen"). Toggle: `ballGame`.
- **Mini-Statistik-Fenster** — Neues `BrowserWindow` (gleiches Muster wie das bestehende `settingsWin`: eigenes Preload, `stats.html`/`stats.js`), aufrufbar über Tray-Menü („Statistik anzeigen"). Dashboard: Bond-Level/XP-Fortschritt, Achievement-Galerie, Moment-Sammel-Galerie (aus v0.8), Wardrobe-Übersicht, Interaktions-Historie (Pet-/Feed-Zähler, `lastPetted`/`lastFed`). Reine Leseansicht über bereits vorhandenen persistierten State — keine neue Persistenz nötig. Kein eigener Toggle (On-Demand-Fenster), aber einzelne Sektionen blenden sich aus, wenn das zugehörige Feature (`bondSystem`/`achievementsEnabled`/`momentCollection`/`wardrobeEnabled`) deaktiviert ist.

---

## Danach

Offen/kontinuierlich weiterführen (kein fixes „1.0"-Kriterium) — z.B. weitere Charaktere, mehr Wardrobe-Items, mehr Achievements als reine Content-Erweiterungen ohne neue Systeme, jeweils in eigenen Versionen nach Bedarf.

## Verifikation (pro Version)

- `npm start` (bzw. `BUDDY_FORCE_NIGHT=1 npm start` für Nacht-Pfade) — Feature manuell im laufenden Dev-Build durchklicken, inkl. neuem Settings-Toggle.
- Persistenz prüfen: `buddy-settings.json` / `buddy-state.json` im `userData`-Verzeichnis nach Toggle-Änderung inspizieren.
- Ab v0.4: `npm test` (Playwright/Electron) muss grün sein; `npm run lint` (ab v0.3) ohne Fehler.
- Plattform-spezifische Punkte (v0.6): lassen sich nicht cross-kompilieren/testen — jede Musikerkennung/Menüleisten-Anpassung braucht einen manuellen Test auf dem echten Ziel-OS, zusätzlich zum bestehenden CI-Build-Matrix-Smoke-Test (`dist:win`/`dist:mac`/`dist:linux`).
- Toggle-Default-Verhalten: bei jedem neuen Feature sicherstellen, dass der Toggle in `settings.html` sofort greift (bestehendes Live-Update-Muster über `onSettingsUpdated`-IPC-Listener), ohne Neustart.
