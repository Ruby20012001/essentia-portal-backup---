' Starts db\watch-stage-tracker.mjs with no window — what the
' "Essentia Stage Tracker Watch" task runs at sign-in.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """C:\Program Files\nodejs\node.exe"" """ & here & "\watch-stage-tracker.mjs""", 0, False
