Option Explicit
' Khoi dong lai server Ho Ca (an cua so, tach khoi tien trinh cha)
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\5 caucavancan\CauCaOnline\_internal\app"
sh.Run """D:\5 caucavancan\CauCaOnline\_internal\app\runtime\node.exe"" ""D:\5 caucavancan\CauCaOnline\_internal\app\server.js""", 0, False
