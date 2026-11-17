Option Explicit
' Mo OBS Studio dung thu muc lam viec (bat buoc, neu khong OBS bao loi)
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Program Files\obs-studio\bin\64bit"
sh.Run """C:\Program Files\obs-studio\bin\64bit\obs64.exe""", 1, False
