# PAN / builder

A local Palo Alto PAN-OS command generator built with React, TypeScript, and Vite. Enter addresses and ports, create groups, then copy or download the CLI configuration.

## Run locally

From this project directory:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Dependencies are already installed in the current workspace. Node 22.14 or newer is required for the included TypeScript tests; use a Node version supported by the installed Vite release.

```powershell
npm run build
npm run preview
```

The production build is written to `dist/`. No backend, credentials, or runtime API calls are used. The interface loads the Oswald font (weights 200–700) from Google Fonts, with a sans-serif fallback when unavailable. The CLI reference link opens Palo Alto's documentation when clicked.

## Workflow

1. Choose the configuration scope: current firewall virtual system, a specific virtual system, shared objects, or a Panorama device group.
2. Add IPv4/IPv6 hosts, CIDR subnets, IP ranges, or FQDN address objects. Names can be entered or generated automatically.
3. Add TCP/UDP services. Destination ports accept single ports, lists (`80,443`), and ranges (`8000-8100`). Source ports and descriptions are optional. Presets fill common services for review before adding.
4. Create static address groups or service groups by selecting objects already in the workspace.
5. Review the live preview, then copy the commands or download `pan-os-config.txt`.
6. Paste in the appropriate firewall or Panorama CLI context. `configure` is included by default. `commit` is disabled by default; review candidate changes before committing. Panorama changes additionally need to be pushed to managed firewalls.

Use **Load example** for a sample workspace. Your workspace is saved in this browser's local storage. Use **Export workspace** to keep a JSON backup or **Import workspace** to restore it. The import replaces the workspace after confirmation; deletion and replacement support one-step undo. Unsaved form drafts are not persisted.

Choose **Light** or **Dark** in the top bar to change the appearance. The preference is saved separately from your workspace and restored before the page renders. Switching themes preserves your objects and form drafts.

### Bulk address input

Paste one entry per line. Use an IP alone, or two columns separated by a comma or tab. Excel columns work without a header row. Quoted CSV fields and additional columns are not supported.

```text
192.168.10.10
WEB-SERVER-02,192.168.10.11
OFFICE-NET,10.20.0.0/24
APP-RANGE,10.0.0.10-10.0.0.20
APP-DNS,app.example.com
IPV6-SERVER,2001:db8::10
```

The entire batch must pass validation before any addresses are added. Hosts without a prefix receive `/32` for IPv4 or `/128` for IPv6.

## Command behavior

- Objects are emitted before groups. Each group membership uses its own command to keep lines short for large batches.
- Address groups use `static`; service groups use `members`.
- Existing objects with the same name can be updated when you paste these commands. The tool does not inspect your firewall for existing objects or conflicts.
- Group commands add members and preserve members already configured on the firewall. Removing or renaming items in the workspace changes future generated output; it does not generate deletions or rename existing firewall objects.
- This version creates address/service objects and static groups. It does not create security rules, connect to firewalls, support dynamic/nested groups, or reference objects outside the workspace.
- Names use a conservative character set: letters, numbers, spaces, hyphens, and underscores, with a maximum of 63 characters. Descriptions are limited to 255 characters and reject CLI quotation/control characters.
- Invalid values, duplicate names within an object namespace, reserved service names, and missing/empty group members block output. A commit applies the candidate changes covered by that operation, including other pending changes.

Syntax references: [PAN-OS 11.2 CLI hierarchy](https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/cli-command-hierarchy/pan-os-11-2-configure-cli-command-hierarchy), [address objects and groups](https://knowledgebase.paloaltonetworks.com/kcsArticleDetail?id=kA10g000000ClcL), [service settings](https://docs.paloaltonetworks.com/ngfw/help/11-1/objects/objects-services), and [Panorama object scope](https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA14u0000004NDRCA2). Commands have not been executed against a live firewall; review against your PAN-OS version and configuration.

## Verification

```powershell
npm test
npm run build
node scripts/browser-smoke.mjs
```

The 20 unit tests cover IP parsing, IPv6, ranges, ports, CLI injection rejection, scopes, dependency order, groups, bulk input, and workspace imports. The browser smoke test uses installed Google Chrome and the DevTools protocol, without extra packages. Set `CHROME_PATH` if Chrome is installed elsewhere. It starts temporary processes on ports 5178 and 9237, uses an isolated `.browser-qa/` profile, writes screenshots and sample exports to ignored `.qa/`, and shuts its processes down afterward. Copy behavior is verified with an isolated clipboard stub so the user's system clipboard is preserved.

## Source

- `src/CommandBuilder.tsx`: workspace state, preview, import/export, and application layout.
- `src/components/ObjectEditor.tsx`: address, service, and group forms.
- `src/lib/generator.ts`: validation, bulk parsing, and pure command generation.
- `src/App.css`: responsive interface styles.
- `tests/generator.test.mjs`: command-generation tests.
