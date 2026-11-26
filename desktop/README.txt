PAN / builder - Palo Alto Command Generator v1.1.0
================================================

INSTALL ONCE, THEN USE THE SHORTCUT
Download the Windows ZIP or installer using the links at:
https://github.com/AnsonYeong/paloalto_command_generator

1. If you downloaded a ZIP, extract it. Double-click Install-PAN-Builder.exe.
2. Follow Setup. It installs the app for your Windows account and creates
   PAN Builder shortcuts on your desktop and in your Start menu.
3. Next time, double-click the PAN Builder desktop shortcut, or press the
   Windows key, type PAN Builder, and open it.
4. The tool opens in your default browser. Keep the small launcher open
   while working. Use Exit or close the launcher when you finish.

The installed copy is kept in %LOCALAPPDATA%\Programs\PANBuilder.
You can delete the downloaded ZIP and extracted files after installing;
the shortcuts point to the installed copy. Administrator access is not
required. To update, close the launcher and run the newer installer.
To remove it, use Windows Settings > Apps > Installed apps > PAN Builder,
or the Uninstall PAN Builder shortcut in its Start menu folder.

If you downloaded the whole repository with Code > Download ZIP, extract
it and open the extracted project folder. Install-PAN-Builder.exe is
right there beside this START_HERE.txt and contains the complete app.
You do not need to open the source or release folders to use the app.

No Node.js or internet connection is needed to use the tool. The font and
spreadsheet reader are included in the installed app.
Use Windows 10/11 with .NET Framework 4.6 or newer and a current version
of Edge, Chrome, Brave or Firefox. .NET Framework is included with Windows.

YOUR DATA
Each coworker starts with their own empty workspace. Customer matrices,
developer browser data and credentials are not bundled in this executable.
Matrix files are processed in your browser and are not uploaded.
Workspaces are saved in that browser's local storage on this computer.
Installing, updating or uninstalling the app does not erase that storage.
Use Export workspace to back up or share your objects as a JSON file;
Import workspace restores one. Do not use a private/incognito browser
window if you want the workspace to survive after closing the browser.

The development website and this executable have separate workspaces.
To move your existing objects, export from the development website and
import the JSON file into the executable's browser page.

The local address is http://127.0.0.1:52473/ . The launcher only listens
on this computer, not your network. Opening the shortcut again reopens the
already running app. If another application uses port 52473, close it or
add --port 52474 to the app shortcut's Target after the quoted EXE path.
Always use the same port and browser
to return to the same saved workspace.

COMMANDS
Build address objects, TCP/UDP services and static groups; import XLSX,
XLS or CSV matrices; review and copy/download the PAN-OS CLI commands.
This tool does not connect to or configure your firewall automatically.
Review the target scope and generated commands before applying them.

DISTRIBUTION
Install-PAN-Builder.exe contains the whole app. Keep this START_HERE.txt
guide and the third-party notices when distributing the package. Notices
are beside the installer in the Windows ZIP, or in release/ in the repository.
The executable is not code-signed. If your organization blocks unsigned
applications, ask your IT team to approve or sign this build.
SHA256SUMS.txt in the Windows ZIP verifies its flat files. The repository's
release/SHA256SUMS.txt lists paths relative to the project folder.

Third-party notices are also embedded in the EXE and accessible at
http://127.0.0.1:52473/THIRD-PARTY-NOTICES.txt while the app is running.
