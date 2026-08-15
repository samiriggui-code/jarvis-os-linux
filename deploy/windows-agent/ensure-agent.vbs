' Lance ensure-agent.ps1 SANS aucune fenêtre (Style 0).
' Point d'entrée tâche planifiée — ne jamais appeler powershell.exe directement au logon.
Option Explicit
Dim sh, fso, dir, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\ensure-agent.ps1"
If Not fso.FileExists(ps1) Then WScript.Quit 0
Set sh = CreateObject("WScript.Shell")
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
WScript.Quit 0
