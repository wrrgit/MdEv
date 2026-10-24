; 安装时询问是否把 MdEv 关联为 .md 文件的默认打开程序
; 关联写入 HKCU，无需管理员权限；同时注册到“打开方式”列表

!macro customInstall
  ; 无论是否选“是”，都注册 ProgId 与应用条目，保证右键“打开方式”里能看到 MdEv
  WriteRegStr HKCU "Software\Classes\MdEv.md" "" "Markdown 文档"
  WriteRegStr HKCU "Software\Classes\MdEv.md" "FriendlyTypeName" "Markdown 文档"
  WriteRegStr HKCU "Software\Classes\MdEv.md\DefaultIcon" "" "$INSTDIR\MdEv.exe,0"
  WriteRegStr HKCU "Software\Classes\MdEv.md\shell\open\command" "" '"$INSTDIR\MdEv.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "MdEv.md" ""
  WriteRegStr HKCU "Software\Classes\Applications\MdEv.exe" "FriendlyAppName" "MdEv"
  WriteRegStr HKCU "Software\Classes\Applications\MdEv.exe\shell\open\command" "" '"$INSTDIR\MdEv.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\MdEv.exe\SupportedTypes" ".md" ""

  ; 静默安装不弹窗，也不擅自修改默认打开方式
  IfSilent mdSkipDefault
  MessageBox MB_YESNO|MB_ICONQUESTION "是否将 MdEv 设为 .md 文件的默认打开程序？$\r$\n$\r$\n选择“否”也不会影响使用：以后可随时右键 .md 文件 → 打开方式 → 选择 MdEv。" IDNO mdSkipDefault

  WriteRegStr HKCU "Software\Classes\.md" "" "MdEv.md"

  mdSkipDefault:

  ; 通知资源管理器刷新关联信息
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\.md" ""
  StrCmp $0 "MdEv.md" 0 +2
    DeleteRegValue HKCU "Software\Classes\.md" ""
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "MdEv.md"
  DeleteRegKey HKCU "Software\Classes\MdEv.md"
  DeleteRegKey HKCU "Software\Classes\Applications\MdEv.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
