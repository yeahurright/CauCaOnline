Option Explicit
' Tu dong thu ket noi lai TikTok khi bi rate-limit (an cua so)
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\5 caucavancan"
sh.Run """D:\5 caucavancan\CauCaOnline\_internal\app\runtime\node.exe"" ""D:\5 caucavancan\reconnect-loop.js""", 0, False
