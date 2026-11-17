Option Explicit
' Chay script dieu phoi giong doc (an cua so)
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\5 caucavancan"
sh.Run """D:\5 caucavancan\CauCaOnline\_internal\app\runtime\node.exe"" ""D:\5 caucavancan\live-coordinator.js""", 0, False
