# Installation

Three ways to install — pick one. **Desktop only** (Windows / macOS / Linux).
The plugin relies on Node file access and the `obsidian://` protocol, so it does
not work on mobile.

> **Can't find it in the directory yet?**
> While a new release is under review, the plugin can be temporarily hidden from
> the community directory. If it doesn't show up under **Browse**, use
> **Method 2 (manual)** or **Method 3 (BRAT)** — both work right away.

---

## Method 1: Community plugins (recommended)

1. Settings → Community plugins → turn off **Restricted mode**
2. Click **Browse** → search for **Vault Workbench**
3. **Install** → **Enable**

> You have to turn off Restricted mode once per vault. That is Obsidian's
> security design — one click, permanent. After that, the workbench's
> "Switch to this vault" feature installs the plugin into the target vault and
> registers it as enabled on its own; you only click that switch the first time
> you open a given vault.

---

## Method 2: Manual install

1. Download these three files from [Releases](../releases): `main.js`,
   `manifest.json`, `styles.css`
2. In your vault, create the folder: `.obsidian/plugins/vault-workbench/`
3. Put the three files in it
4. In Obsidian, press `Ctrl + R` to reload → Settings → Community plugins →
   enable Vault Workbench

> This plugin is **build-free**: `main.js` is the complete, ready-to-run code.
> No `npm install` needed.

---

## Method 3: BRAT (bleeding edge)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) and enable it
2. BRAT settings → **Add Beta Plugin** → paste this repo's URL
3. BRAT keeps it updated straight from the repo

Good if you want new features early. The trade-off is you may hit a version that
has not been fully tested.

---

## Opening the workbench

Any of these:

- Click the **layout grid** icon in the left ribbon
- Command palette (`Ctrl + P`) → search **Open Vault Workbench**
- To rebuild the index on demand: command palette → **Refresh vault index**

---

## FAQ

**Q: One of my vaults is missing from the left sidebar.**

Auto-discovery reads Obsidian's own vault list (`obsidian.json`). Only vaults
that have been **opened at least once** are registered — open it in Obsidian
once, or add the path manually under Settings → Vault management.

**Q: A vault shows as "not installed" — what does that mean?**

That vault does not have the workbench files yet. Right-click it → **Switch to
this vault**; the workbench installs itself there first, then jumps. After that
it shows normally.

**Q: What do I need to do after switching to another vault?**

The first time you enter a vault, turn off **Restricted mode** once under
Settings → Community plugins. That is Obsidian's security design (the setting
does not live in the vault files, so no plugin can preset it for you).

**Q: Will it touch files in my other vaults?**

Browsing is read-only. Files are written **only when you actively edit and save
inside the workbench**, and every write is atomic (temp file first, then rename —
if it crashes halfway, the original is untouched).

Creating, renaming and deleting work across vaults too: renaming **repairs that
vault's `[[wikilinks]]` automatically**, and deleting moves the file into that
vault's `.trash`, where it can be undone.

For the complete list of files this plugin touches outside your current vault,
see the **Files outside your vaults** section in the [README](../README.md).
Deeper design notes: **[Multi-vault architecture (zh)](多库架构设计思考.md)**.
