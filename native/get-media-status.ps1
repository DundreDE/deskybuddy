# Queries the Windows System Media Transport Controls (SMTC) for the current
# system-wide media session's playback status. Works with Spotify, browser
# media (YouTube Music etc.), and any other app that reports "now playing" to
# Windows - no per-app API keys or auth needed.
# Prints exactly one line: PLAYING, PAUSED, or NONE.

$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

    function Await($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
    }

    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

    $managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $manager = Await $managerOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    $session = $manager.GetCurrentSession()
    if ($null -eq $session) {
        Write-Output 'NONE'
    } else {
        $info = $session.GetPlaybackInfo()
        if ($info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
            Write-Output 'PLAYING'
        } else {
            Write-Output 'PAUSED'
        }
    }
} catch {
    Write-Output 'NONE'
}
