PAN / builder - Palo Alto Command Generator v1.0.0
================================================

HOW TO USE
Download the Windows ZIP or EXE using the links at:
https://github.com/AnsonYeong/paloalto_command_generator

1. If you received the ZIP, extract it to a folder first.
2. Double-click PaloAltoCommandGenerator.exe.
3. The tool opens in your default web browser. Keep the small launcher
   window open while working. Open app reopens the browser tab.
4. Use Exit or close the launcher window when you finish.

If you downloaded the whole repository with Code > Download ZIP, extract
it and find PaloAltoCommandGenerator.exe inside its release folder.

No installation, administrator access, Node.js or internet connection is
needed to use the tool. The font and spreadsheet reader are included.
Use Windows 10/11 with .NET Framework 4.6 or newer and a current version
of Edge, Chrome, Brave or Firefox. .NET Framework is included with Windows.

YOUR DATA
Each coworker starts with their own empty workspace. Customer matrices,
developer browser data and credentials are not bundled in this executable.
Matrix files are processed in your browser and are not uploaded.
Workspaces are saved in that browser's local storage on this computer.
Use Export workspace to back up or share your objects as a JSON file;
Import workspace restores one. Do not use a private/incognito browser
window if you want the workspace to survive after closing the browser.

The development website and this executable have separate workspaces.
To move your existing objects, export from the development website and
import the JSON file into the executable's browser page.

The local address is http://127.0.0.1:52473/ . The launcher only listens
on this computer, not your network. Opening the EXE again reopens the
already running app. If another application uses port 52473, close it or
launch this EXE with --port 52474. Always use the same port and browser
to return to the same saved workspace.

COMMANDS
Build address objects, TCP/UDP services and static groups; import XLSX,
XLS or CSV matrices; review and copy/download the PAN-OS CLI commands.
This tool does not connect to or configure your firewall automatically.
Review the target scope and generated commands before applying them.

DISTRIBUTION
The EXE is portable and contains the whole app. Keep a copy of this guide
and THIRD-PARTY-NOTICES.txt with it when distributing the package.
The executable is not code-signed. If your organization blocks unsigned
applications, ask your IT team to approve or sign this build.
An SHA256SUMS.txt file is provided to verify the delivered files.

Third-party notices are also embedded in the EXE and accessible at
http://127.0.0.1:52473/THIRD-PARTY-NOTICES.txt while the app is running.
