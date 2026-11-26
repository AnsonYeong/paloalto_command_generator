# PAN / builder

A local Palo Alto PAN-OS command generator. Create address and service objects, organize groups, import firewall matrices, and copy the CLI commands.

## Install and use

**[Download installer](https://github.com/AnsonYeong/paloalto_command_generator/raw/refs/heads/main/Install-PAN-Builder.exe)** | **[Download Windows ZIP](https://github.com/AnsonYeong/paloalto_command_generator/raw/refs/heads/main/release/PaloAltoCommandGenerator-1.1.0-Windows.zip)**

1. Download the installer, or extract the ZIP.
2. Double-click **Install-PAN-Builder.exe** and follow Setup.
3. Open **PAN Builder** using the desktop or Start menu shortcut.
4. Keep the small launcher window open while using the tool in your browser.

The installer contains the complete app and installs it for your Windows account. No administrator access, Node.js, or internet connection is needed for normal use. You can delete the downloaded files after installation. To update, close the launcher and run the new installer. To uninstall, use **Windows Settings > Apps > Installed apps > PAN Builder**.

If you download the whole repository using **Code > Download ZIP**, the installer is at the top level of the extracted folder. This repository is private; sign into a GitHub account with access before downloading.

Read [START_HERE.txt](START_HERE.txt) for requirements, workspace backups, and troubleshooting. The app runs locally in your browser and generates commands for you to review and apply to the firewall.

## Folder layout

```text
paloalto_command_generator/
|-- Install-PAN-Builder.exe   Run this to install the app
|-- START_HERE.txt            Quick-start guide
|-- README.md                Project overview
|-- release/                 Windows ZIP, notices and checksums
`-- app/                     Source code, configuration, build scripts and tests
```

For development, see [app/README.md](app/README.md). From the repository root, run `cd app` before using the npm commands. Build output and development dependencies stay inside `app/`; published downloads remain at the top level and in `release/`.
