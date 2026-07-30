!macro customInit
  ; Stop stale packaged service trees before replacing locked runtime files.
  nsExec::ExecToLog 'taskkill /F /T /IM "autocut-backend.exe"'
!macroend
