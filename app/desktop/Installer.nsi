; -*- coding: utf-8 -*-
Unicode true
!include "MUI2.nsh"

!ifndef PROJECT_ROOT
  !error "PROJECT_ROOT must point to the repository."
!endif
!define APP_ROOT "${PROJECT_ROOT}\app"
!ifndef SETUP_OUT
  !define SETUP_OUT "${PROJECT_ROOT}\Install-PAN-Builder.exe"
!endif
!ifdef QA_ROOT
  !define UNINSTALL_KEY "Software\PANBuilderInstallerTests\Shortcuts"
!else
  !define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PANBuilder"
!endif

Name "PAN Builder"
OutFile "${SETUP_OUT}"
InstallDir "$LOCALAPPDATA\Programs\PANBuilder"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.1.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "PAN Builder"
VIAddVersionKey /LANG=1033 "FileDescription" "PAN Builder installer"
VIAddVersionKey /LANG=1033 "FileVersion" "1.1.0"
VIAddVersionKey /LANG=1033 "ProductVersion" "1.1.0"
VIAddVersionKey /LANG=1033 "LegalCopyright" "PAN Builder contributors"

!define MUI_ICON "${APP_ROOT}\.desktop-build\app.ico"
!define MUI_UNICON "${APP_ROOT}\.desktop-build\app.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install PAN Builder"
!define MUI_WELCOMEPAGE_TEXT "Install the Palo Alto Command Generator for your Windows account.$\r$\n$\r$\nSetup creates PAN Builder shortcuts on your desktop and in the Start menu.$\r$\n$\r$\nClose any running PAN Builder launcher before installing an update. Your saved browser workspace will be kept."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "PAN Builder is ready"
!define MUI_FINISHPAGE_TEXT "Use the PAN Builder shortcut on your desktop or search for PAN Builder in the Start menu.$\r$\n$\r$\nYou can delete the downloaded ZIP after installation. Your shortcuts use the installed copy."
!define MUI_FINISHPAGE_RUN "$INSTDIR\PaloAltoCommandGenerator.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open PAN Builder now"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var DesktopFolder
Var MenuFolder

!macro SetUserFolders
  SetShellVarContext current
  !ifdef QA_ROOT
    ; The test build uses workspace folders instead of the real desktop and menu.
    StrCpy $DesktopFolder "${QA_ROOT}\Desktop"
    StrCpy $MenuFolder "${QA_ROOT}\Start Menu\PAN Builder"
  !else
    StrCpy $DesktopFolder "$DESKTOP"
    StrCpy $MenuFolder "$SMPROGRAMS\PAN Builder"
  !endif
!macroend

Function .onInit
  !insertmacro SetUserFolders
  !ifdef QA_ROOT
    StrCpy $INSTDIR "${QA_ROOT}\Installed App"
  !endif
FunctionEnd

Function un.onInit
  !insertmacro SetUserFolders
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File "${APP_ROOT}\.desktop-build\PaloAltoCommandGenerator.exe"
  File "${PROJECT_ROOT}\START_HERE.txt"
  File "${PROJECT_ROOT}\release\THIRD-PARTY-NOTICES.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ClearErrors
  CreateDirectory "$DesktopFolder"
  CreateDirectory "$MenuFolder"
  CreateShortcut "$DesktopFolder\PAN Builder.lnk" "$INSTDIR\PaloAltoCommandGenerator.exe" "" "$INSTDIR\PaloAltoCommandGenerator.exe" 0 SW_SHOWNORMAL "" "Palo Alto Command Generator"
  CreateShortcut "$MenuFolder\PAN Builder.lnk" "$INSTDIR\PaloAltoCommandGenerator.exe" "" "$INSTDIR\PaloAltoCommandGenerator.exe" 0 SW_SHOWNORMAL "" "Palo Alto Command Generator"
  CreateShortcut "$MenuFolder\Uninstall PAN Builder.lnk" "$INSTDIR\Uninstall.exe"
  IfErrors shortcut_failed

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "PAN Builder - Palo Alto Command Generator"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "1.1.0"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "PAN / builder"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" '$\"$INSTDIR\PaloAltoCommandGenerator.exe$\",0'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  Goto finished

  shortcut_failed:
    MessageBox MB_OK|MB_ICONEXCLAMATION "Setup could not create the shortcuts. Check that your Desktop and Start menu folders are writable, then run Setup again." /SD IDOK
    SetErrorLevel 1
    Abort
  finished:
SectionEnd

Section "Uninstall"
  ; Delete only files installed by this product. Browser workspaces are untouched.
  retry_remove:
    ClearErrors
    Delete "$INSTDIR\PaloAltoCommandGenerator.exe"
    IfErrors app_running files_removed
  app_running:
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close the PAN Builder launcher, then click Retry to uninstall." /SD IDCANCEL IDRETRY retry_remove
    SetErrorLevel 1
    Abort
  files_removed:
    Delete "$DesktopFolder\PAN Builder.lnk"
    Delete "$MenuFolder\PAN Builder.lnk"
    Delete "$MenuFolder\Uninstall PAN Builder.lnk"
    RMDir "$MenuFolder"
    Delete "$INSTDIR\START_HERE.txt"
    Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
