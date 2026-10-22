!include "nsProcess.nsh"

# The default builder check interpolates $INSTDIR into PowerShell and looks
# for every executable below that directory. Paths containing an apostrophe
# break that command; the installer and native helpers can also match it.
# Check the exact application executable using the bundled native plugin.
!macro customCheckAppRunning
  Push $R0
  Push $R1
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  StrCmp $R0 603 mn_app_stopped
  StrCmp $R0 0 0 mn_cannot_close

  ${IfNot} ${isUpdated}
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK mn_close_app
    SetErrorLevel 2
    Quit
  ${EndIf}

  mn_close_app:
    DetailPrint "$(appClosing)"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    StrCpy $R1 0
    ${Do}
      Sleep 250
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      StrCmp $R0 603 mn_app_stopped
      IntOp $R1 $R1 + 1
    ${LoopUntil} $R1 >= 8

    # Older versions hide in the tray when sent WM_CLOSE. Only after the
    # installation was approved, terminate the remaining MN Trono processes.
    ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    StrCpy $R1 0
    ${Do}
      Sleep 250
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      StrCmp $R0 603 mn_app_stopped
      IntOp $R1 $R1 + 1
    ${LoopUntil} $R1 >= 12

  mn_cannot_close:
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY mn_close_app
    SetErrorLevel 2
    Quit

  mn_app_stopped:
    ${nsProcess::Unload}
    Pop $R1
    Pop $R0
!macroend
