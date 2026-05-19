; Jira Worklog Agent Installation Script
; Requires Inno Setup 6 (free: https://jrsoftware.org/isinfo.php)

[Setup]
AppId={{8A5E2D7F-9B3C-4A1E-8F6D-5C9E7A3B2D1F}
AppName=Jira Worklog Agent
AppVersion=1.0.0
AppPublisher=Jiaxiang Xi
AppPublisherURL=https://github.com/jxi/jira-worklog-agent
AppSupportURL=https://github.com/jxi/jira-worklog-agent
AppUpdatesURL=https://github.com/jxi/jira-worklog-agent
; Install to APPDATA directory (matches program's expected paths)
DefaultDirName={userappdata}\jira-worklog-agent
DefaultGroupName=Jira Worklog Agent
AllowNoIcons=yes
LicenseFile=..\LICENSE
InfoBeforeFile=README.txt
OutputDir=..\dist
OutputBaseFilename=jira-worklog-agent-setup
SetupIconFile=..\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Installation pages
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; Chinese messages (custom - no external file needed)
[Messages]

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "开机自动启动"; GroupDescription: "启动选项:"; Flags: unchecked

[Files]
; Main executable (includes embedded SQLite wasm)
Source: "..\dist\jira-worklog-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

; Config files
Source: "..\dist\config.yaml"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist
Source: "..\dist\.env.example"; DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion
Source: "..\dist\.env.example"; DestDir: "{app}"; DestName: ".env"; Flags: ignoreversion onlyifdoesntexist

; Notifier (desktop notifications)
Source: "..\dist\notifier\*"; DestDir: "{app}\notifier"; Flags: ignoreversion recursesubdirs createallsubdirs

; UI (web interface)
Source: "..\dist\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs createallsubdirs

; Documentation
Source: "..\README.md"; DestDir: "{app}"; DestName: "README.txt"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Create data directory for SQLite database
Name: "{app}\data"; Permissions: users-modify

[Icons]
Name: "{group}\Jira Worklog Agent"; Filename: "{app}\jira-worklog-agent.exe"
Name: "{group}\配置文件"; Filename: "{app}\.env"
Name: "{group}\数据目录"; Filename: "{app}\data"
Name: "{group}\{cm:UninstallProgram,Jira Worklog Agent}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Jira Worklog Agent"; Filename: "{app}\jira-worklog-agent.exe"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\Jira Worklog Agent"; Filename: "{app}\jira-worklog-agent.exe"; Tasks: quicklaunchicon
Name: "{userstartup}\Jira Worklog Agent"; Filename: "{app}\jira-worklog-agent.exe"; Tasks: startupicon

[Run]
Filename: "{app}\jira-worklog-agent.exe"; Description: "立即运行 Jira Worklog Agent"; Flags: nowait postinstall skipifsilent
Filename: "https://localhost:7301"; Description: "打开 Web 界面 (启动后)"; Flags: postinstall skipifsilent unchecked

[Registry]
; Add to PATH (optional)
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Check: NeedsAddPath('{app}')

[UninstallDelete]
Type: filesandordirs; Name: "{app}\ui"
Type: filesandordirs; Name: "{app}\notifier"
Type: files; Name: "{app}\jira-worklog-agent.exe"
Type: files; Name: "{app}\config.yaml"
Type: files; Name: "{app}\.env"
Type: files; Name: "{app}\.env.example"
Type: files; Name: "{app}\README.txt"
Type: files; Name: "{app}\LICENSE"
; Keep data directory (user may want to preserve database)
; Type: filesandordirs; Name: "{app}\data"

[UninstallRun]
; Ask user if they want to delete data
Filename: "{cmd}"; Parameters: "/c choice /C YN /M ""是否删除数据目录？"" && if errorlevel 2 exit && rd /s /q ""{app}\data"""; Flags: runhidden

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    Result := True
  else
    Result := Pos(LowerCase(ExpandConstant(Param)), LowerCase(OrigPath)) = 0;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DataDir: string;
begin
  if CurStep = ssPostInstall then
  begin
    DataDir := ExpandConstant('{app}\data');
    if not DirExists(DataDir) then
      ForceDirectories(DataDir);

    Log('Created data directory: ' + DataDir);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    // Uninstall complete - data directory kept by default
    Log('Uninstall complete. Data directory preserved.');
  end;
end;