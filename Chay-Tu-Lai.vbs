Option Explicit
' Chay tu lai phong live (an cua so)
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\5 caucavancan"
sh.Run """D:\5 caucavancan\CauCaOnline\_internal\app\runtime\node.exe"" ""D:\5 caucavancan\live-autopilot.js""", 0, False
