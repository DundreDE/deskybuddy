# Plattform-Unterstützung

Stand nach v0.6. Diese Tabelle beschreibt, was auf welcher Plattform tatsächlich funktioniert (bzw. bekanntermaßen nicht funktioniert) — nicht, was theoretisch möglich wäre. Alle Windows/Linux-X11-Zeilen basieren auf gelaufenem Code; die macOS-Zeilen sind bestmöglich umgesetzt, aber **nicht auf echter Hardware getestet** (diese Codebasis wird in einer Linux-Sandbox ohne Zugriff auf ein Mac entwickelt) — siehe Hinweise pro Zeile.

| Feature | Windows | macOS | Linux (X11) | Linux (Wayland) |
|---|---|---|---|---|
| Herumlaufen auf Taskbar/Dock/Panel | ✅ | ✅ (ungetestet) | ✅ | ✅ |
| Streicheln / Füttern / Ziehen / Werfen | ✅ | ✅ (ungetestet) | ✅ | ✅ |
| Augen folgen der Maus | ✅ | ✅ (ungetestet) | ✅ | ✅ |
| Mehreren Bildschirmen folgen | ✅ | ✅ (ungetestet) | ✅ | ✅ |
| Tipp-Erkennung | ✅ | ✅ (ungetestet) | ✅ | ❌ (siehe unten) |
| Abwesenheits-Erkennung (AFK) | ✅ | ✅ (ungetestet) | ✅ | ❌ (siehe unten) |
| Bei Vollbild-Spielen ausblenden | ✅ | ✅ (ungetestet) | ✅ | ❌ (siehe unten) |
| Musik-Erkennung | ✅ SMTC, jede App | ⚠️ nur Spotify + Music.app | ✅ MPRIS, die meisten Player | ✅ MPRIS, die meisten Player |
| Automatisch starten | ✅ | ⚠️ sollte funktionieren, ungetestet | ⚠️ sollte funktionieren, ungetestet | ⚠️ sollte funktionieren, ungetestet |
| Auto-Update (Silent-Install) | ✅ | ❌ (Release-Seite-Fallback) | ❌ (Release-Seite-Fallback) | ❌ (Release-Seite-Fallback) |
| Menüleisten-Modus | – (kein Konzept) | ✅ (ungetestet) | – (kein Konzept) | – (kein Konzept) |
| Energiesparmodus, Stats-Verfall, Mood-System, i18n | ✅ | ✅ | ✅ | ✅ |

## Details

### Tipp-/AFK-/Vollbild-Erkennung unter Wayland

Diese drei Features hängen an `uiohook-napi` (globaler Input-Hook) bzw. `active-win` (aktives Fenster ermitteln). Beide basieren auf X11-APIs und funktionieren unter einer reinen Wayland-Sitzung aus Sicherheitsgründen grundsätzlich nicht — `active-win` sagt das explizit im eigenen README ("Wayland is not supported"), `uiohook-napi`/libuiohook haben schlicht kein Wayland-Backend.

Ab v0.6 wird das nicht mehr stillschweigend falsch laufen gelassen: `main.js` erkennt eine Wayland-Sitzung über `XDG_SESSION_TYPE=wayland` und startet die betroffenen Watcher gar nicht erst — die Einstellungen zeigen stattdessen einen Hinweisbanner. Vorher wäre insbesondere die AFK-Erkennung dauerhaft auf "abwesend" hängengeblieben, da nie neue Input-Events ankommen, die den Timer zurücksetzen.

Betroffen sind nur reine Wayland-Sitzungen. Läuft die App unter XWayland (X11-Kompatibilitätsschicht, je nach Compositor teils Standard für nicht-Wayland-natives Electron), greift keine der beiden Einschränkungen.

### Musik-Erkennung im Detail

- **Windows** (`native/get-media-status.ps1`): fragt die Windows-SMTC-API ab (`GlobalSystemMediaTransportControlsSessionManager`) — erkennt jede App, die "jetzt läuft"-Infos meldet (Spotify, Browser, VLC, ...), ohne app-spezifisches Setup.
- **Linux** (`dbus-next` gegen den D-Bus-Session-Bus): fragt alle `org.mpris.MediaPlayer2.*`-Dienste nach `PlaybackStatus`. Die meisten Player (Spotify, Firefox, Chrome, VLC, Rhythmbox, ...) registrieren das automatisch — kein app-spezifisches Setup nötig. Getestet: Verbindung zu einem echten Session-Bus, Auflisten der Dienste, sauberes Verhalten ganz ohne Session-Bus (kein Crash, Feature bleibt einfach aus). **Nicht** mit einem echten laufenden MPRIS-Player getestet (keiner in der Entwicklungsumgebung verfügbar).
- **macOS** (`native/get-media-status.applescript`): AppleScript-Helfer statt kompiliertem Mini-Helper gegen das private `MediaRemote`-Framework — dafür fehlt in dieser Sandbox ein Swift-Compiler, ein unkompilierbares Binary zu verschicken wäre riskanter als der (funktional eingeschränktere, aber verifizierbar syntaktisch saubere) AppleScript-Weg. Deckt nur Spotify und Music.app ab, keine Browser-Wiedergabe. **Komplett ungetestet** (kein Mac verfügbar).

### Auto-Update

Nur Windows bekommt den vollen Silent-Download-Install-Flow über `electron-updater` (NSIS-Installer, kein Code-Signing nötig). macOS/Linux zeigen stattdessen einen Dialog mit Link zur GitHub-Releases-Seite — `electron-updater`s Silent-Updater für macOS (Squirrel.Mac) verlangt eine gültige Code-Signatur zur Versions-Validierung, die dieses Projekt bewusst nicht hat (siehe README, kein Apple-Developer-Zertifikat). Linux AppImage könnte technisch auch ohne Signatur silent-updaten, das wurde hier aber bewusst nicht zusätzlich umgesetzt, um bei allen Nicht-Windows-Plattformen dieselbe, einfache Fallback-UX zu haben.

### Autostart

Nutzt Electrons plattformübergreifendes `app.setLoginItemSettings` — sollte auf allen drei Plattformen funktionieren (macOS: Login-Item, Linux: Autostart-Desktop-Datei), der Blockiert-Warnhinweis in den Einstellungen ist aber Windows-spezifisch formuliert und das `executableWillLaunchAtLogin`-Gegenchecken (erkennt, ob der Nutzer Autostart über die OS-Einstellungen deaktiviert hat) ist ebenfalls nur für Windows implementiert.

## Bekannte Lücken / mögliche Folgeschritte

- macOS-Zeilen sind ausnahmslos ungetestet — jemand mit echtem Mac-Zugriff sollte vor einem macOS-Release einmal grundlegend durchklicken.
- macOS-Musikerkennung deckt nur zwei Apps ab; ein kompilierter `MediaRemote`-Helfer (wie ursprünglich geplant) würde wie unter Windows jede App erfassen, braucht aber einen Mac zum Bauen und Testen.
- Autostart-Blockiert-Erkennung fehlt für macOS/Linux.
