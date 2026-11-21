; IN-FORM installer for Windows (Inno Setup 6). Built by .github/workflows/release.yml:
;
;   ISCC.exe /DAppVersion=0.2.0 /DSourceDir=<extracted full package> /DLauncherExe=<IN-FORM.exe> /O<output dir> installer\inform.iss
;
; It installs for the current user only (no administrator prompt) into
; %LOCALAPPDATA%\Programs\IN-FORM, adds Start menu and optional desktop icons that
; run IN-FORM.exe (no black window), and registers an uninstaller. Your setup and
; history live in %APPDATA%\IN-FORM and survive updating; uninstalling asks whether
; to delete them too.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #error SourceDir must point at the extracted full package folder
#endif
#ifndef LauncherExe
  #error LauncherExe must point at the compiled IN-FORM.exe
#endif

[Setup]
; Never change AppId: it is how Windows knows a new setup is an update of this app.
AppId={{252D07AA-CEE5-4CA8-9BD8-0128C0E43581}
AppName=IN-FORM
AppVersion={#AppVersion}
AppVerName=IN-FORM {#AppVersion}
AppPublisher=JV7T9 - GlyphTek Project
AppPublisherURL=https://github.com/GlyphTek/in-form
AppSupportURL=https://github.com/GlyphTek/in-form/issues
AppUpdatesURL=https://github.com/GlyphTek/in-form/releases
DefaultDirName={autopf}\IN-FORM
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=IN-FORM-Setup-{#AppVersion}
SetupIconFile=inform.ico
UninstallDisplayIcon={app}\IN-FORM.exe
UninstallDisplayName=IN-FORM
LicenseFile={#SourceDir}\LICENSE
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
VersionInfoVersion={#AppVersion}
VersionInfoCompany=JV7T9 - GlyphTek Project
VersionInfoDescription=IN-FORM setup

[Tasks]
Name: "desktopicon"; Description: "Put an IN-FORM icon on the desktop"; GroupDescription: "Icons:"

[Files]
; The portable package, minus its start.bat and README.txt (the launcher replaces them).
Source: "{#SourceDir}\*"; DestDir: "{app}"; Excludes: "start.bat,README.txt"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#LauncherExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\IN-FORM"; Filename: "{app}\IN-FORM.exe"; Comment: "Open IN-FORM"
Name: "{autoprograms}\Stop IN-FORM"; Filename: "{app}\IN-FORM.exe"; Parameters: "--stop"; Comment: "Stop IN-FORM running in the background"
Name: "{autodesktop}\IN-FORM"; Filename: "{app}\IN-FORM.exe"; Comment: "Open IN-FORM"; Tasks: desktopicon

[Run]
Filename: "{app}\IN-FORM.exe"; Description: "Open IN-FORM now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\IN-FORM.exe"; Parameters: "--stop --quiet"; Flags: runhidden; RunOnceId: "StopInForm"

[Code]
// An update must not try to replace files a running IN-FORM is holding.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  Launcher: String;
begin
  Launcher := ExpandConstant('{app}\IN-FORM.exe');
  if FileExists(Launcher) then
    Exec(Launcher, '--stop --quiet', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent() then
    if MsgBox('IN-FORM is uninstalled.' + #13#10 + #13#10 +
              'Also delete your setup and history? They are kept in ' +
              ExpandConstant('{userappdata}\IN-FORM') + '. Choose No to keep them for a later reinstall.',
              mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{userappdata}\IN-FORM'), True, True, True);
end;
