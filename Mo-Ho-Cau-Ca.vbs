Option Explicit

Dim shell, fso, root, batPath, chromePath, chromeProfile, appUrl, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(root, "CauCaOnline\Chay-Ho-Cau-Chinh.bat")
chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
chromeProfile = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CauCaOnlineChrome"
appUrl = "http://localhost:3001/"

result = shell.Run(Chr(34) & batPath & Chr(34), 0, True)
If result = 0 Then
  If Not fso.FileExists(fso.BuildPath(root, "NO-BROWSER.txt")) Then
    If fso.FileExists(chromePath) Then
      shell.Run Chr(34) & chromePath & Chr(34) & " --user-data-dir=" & Chr(34) & chromeProfile & Chr(34) & " --no-first-run --new-window " & appUrl, 1, False
    Else
      shell.Run appUrl, 1, False
    End If
  End If
ElseIf result = 2 Then
  MsgBox "Cong 3001 dang duoc dung. Hay dong ban Ho Cau cu truoc khi mo ban chinh.", 48, "Ho Ca Online"
Else
  MsgBox "Ban chinh chua san sang. Kiem tra cua so HoCauChinh.", 48, "Ho Ca Online"
End If
