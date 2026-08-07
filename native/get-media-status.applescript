-- Reports whether Spotify or Music.app is currently playing, mirroring the PLAYING/PAUSED/NONE
-- contract of get-media-status.ps1 (Windows SMTC helper) so main.js's checkMedia() logic can
-- treat both platforms the same way (only the "is it PLAYING" comparison actually matters).
--
-- Unlike SMTC on Windows, there's no OS-wide "now playing" API this can hook into without a
-- compiled helper against the private MediaRemote framework (see PLATFORM_SUPPORT.md for the
-- tradeoff) — this covers the two most common desktop music players via their public AppleScript
-- dictionaries instead. Browser-played music (YouTube Music, etc.) is not detected.
--
-- `application "X" is running` is a non-launching check — unlike `tell application "X" to ...`,
-- it will not start the app just because we asked about it.
on getPlayerStatus(appName)
	if application appName is running then
		tell application appName
			if player state is playing then
				return "PLAYING"
			else
				return "PAUSED"
			end if
		end tell
	end if
	return ""
end getPlayerStatus

set spotifyStatus to ""
set musicStatus to ""

try
	set spotifyStatus to my getPlayerStatus("Spotify")
end try
if spotifyStatus is "PLAYING" then
	return "PLAYING"
end if

try
	set musicStatus to my getPlayerStatus("Music")
end try
if musicStatus is "PLAYING" then
	return "PLAYING"
end if

if spotifyStatus is "PAUSED" or musicStatus is "PAUSED" then
	return "PAUSED"
end if

return "NONE"
