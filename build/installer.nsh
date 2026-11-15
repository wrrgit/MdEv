; 安装向导的最后一项（安装进度开始前的最后一个选项页）提供
; “设为 .md 默认打开程序”勾选框，默认勾选，用户可以取消。
; 关联写入 HKCU，无需管理员权限；同时注册到“打开方式”列表。
;
; 另外：选择“为所有人安装”时安装程序会被提权重启（新进程新窗口），
; 这里在提权前记录窗口位置，提权后的新窗口沿用同样的位置。
; 勾选状态写入 INI 而不是只放变量，便于跨进程恢复与静默安装读取。

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!define MDEV_WNDPOS_INI "$TEMP\MdEv-Setup-Window.ini"

!ifndef BUILD_UNINSTALLER
Var mdEvPosLastX
Var mdEvPosLastY
Var mdEvAssocCheckbox
Var mdEvAssocDialog

; 新窗口创建完成后按上次记录的位置摆放
!define MUI_CUSTOMFUNCTION_GUIINIT MdEvRestoreWindowPos
; 安装模式页 SHOW 时启动窗口位置记录。勾选项已移到最后的选项页，
; 因此这里不再创建勾选框，也不再提前写入关联状态。
!define MUI_PAGE_CUSTOMFUNCTION_SHOW MdEvPageShow

Function MdEvRestoreWindowPos
  ${If} ${FileExists} "${MDEV_WNDPOS_INI}"
    ReadINIStr $0 "${MDEV_WNDPOS_INI}" "pos" "x"
    ReadINIStr $1 "${MDEV_WNDPOS_INI}" "pos" "y"
    ${If} $0 != ""
    ${AndIf} $1 != ""
      System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i $0, i $1, i 0, i 0, i 0x15)'
    ${EndIf}
  ${EndIf}
FunctionEnd

Function MdEvPageShow
  !insertmacro _NSD_CreateTimer MdEvSaveWindowPos 200
FunctionEnd

Function MdEvSaveWindowPos
  System::Store S
  ; @r0 会把 GetWindowRect 写出的缓冲区地址放到 $0
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, @r0) i .r5'
  ${If} $5 = 1
    System::Call '*$0(i .r1, i .r2)'
    ${If} $1 != $mdEvPosLastX
    ${OrIf} $2 != $mdEvPosLastY
      WriteINIStr "${MDEV_WNDPOS_INI}" "pos" "x" "$1"
      WriteINIStr "${MDEV_WNDPOS_INI}" "pos" "y" "$2"
      StrCpy $mdEvPosLastX $1
      StrCpy $mdEvPosLastY $2
    ${EndIf}
  ${EndIf}
  System::Store L
FunctionEnd

; electron-builder 在“更换安装目录页之后、安装进度页之前”展开这个宏，
; 因此该页就是安装向导里最后一个可交互的选项页。
; Tauri 安装包的 custom 页面同样插在 MUI_PAGE_INSTFILES 之前，两侧位置一致。
!macro customPageAfterChangeDir
  Page custom MdEvAssocPageCreate MdEvAssocPageLeave
!macroend

Function MdEvAssocPageCreate
  ; 静默安装不弹页面，也不擅自把 MdEv 设为默认
  IfSilent MdEvAssocPageSkip
  nsDialogs::Create 1018
  Pop $mdEvAssocDialog
  ${If} $mdEvAssocDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 26u "安装向导的最后一项：是否让 MdEv 成为 Markdown 文件的默认打开程序。"
  Pop $0
  ${NSD_CreateCheckbox} 0 34u 100% 18u "将 MdEv 设为 .md 文件的默认打开程序（推荐，可稍后在 Windows 设置中更改）"
  Pop $mdEvAssocCheckbox

  ; 默认勾选；若为提权重启后的内层进程，沿用上一次的选择
  StrCpy $0 "1"
  ReadINIStr $1 "${MDEV_WNDPOS_INI}" "assoc" "set_default"
  ${If} $1 == "0"
    StrCpy $0 "0"
  ${EndIf}
  ${If} $0 == "1"
    ${NSD_SetState} $mdEvAssocCheckbox ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $mdEvAssocCheckbox ${BST_UNCHECKED}
  ${EndIf}
  WriteINIStr "${MDEV_WNDPOS_INI}" "assoc" "set_default" "$0"
  nsDialogs::Show
  Return

  MdEvAssocPageSkip:
    Abort
FunctionEnd

Function MdEvAssocPageLeave
  ${NSD_GetState} $mdEvAssocCheckbox $0
  WriteINIStr "${MDEV_WNDPOS_INI}" "assoc" "set_default" "$0"
FunctionEnd
!endif

!macro customInit
  ; 外层进程启动时清掉上次的旧位置记录，避免新安装窗口被旧坐标挪走
  ${IfNot} ${UAC_IsInnerInstance}
    Delete "${MDEV_WNDPOS_INI}"
  ${EndIf}
!macroend

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

  ; 静默安装不弹窗；是否设为默认打开程序取自最后选项页的勾选框
  IfSilent mdSkipDefault
  ReadINIStr $0 "${MDEV_WNDPOS_INI}" "assoc" "set_default"
  StrCmp $0 "1" 0 mdSkipDefault

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
  Delete "${MDEV_WNDPOS_INI}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
