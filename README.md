# Wallapop Relist

Chrome extension that adds a **"Resubir"** (relist) button to your own Wallapop
items. Relisting recreates the item so it jumps back to the top of search
results — the same effect as a paid bump, done by deleting and re-creating the
listing with its original data and photos.

The button appears both on the item detail page and on your items in the catalog
grid.

## How it works

When you click **Resubir**, the extension:


1. Fetches the item's full details and downloads its images.
4. Creates the new item first
5. Deletes the original

## Install (unpacked)

1. Clone or download this repo.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Open Wallapop (logged in) and use the **Resubir** button.

After editing any file, reload the extension from `chrome://extensions`. Changes
to `manifest.json` require removing and re-adding the extension.

## Permissions

- `cookies` + host access to `*.wallapop.com` — to read the auth token and call
  the API on your behalf.
- `cdn.wallapop.com` — to download the item images (cross-origin) for re-upload.

## Languages

The button and messages follow the browser's language. English (default),
Spanish, Italian, Portuguese and French are bundled under `_locales/`; add a
folder there to support more.

## Disclaimer

Unofficial tool, not affiliated with Wallapop. It uses Wallapop's private API,
which can change or break at any time, and automated relisting may go against
Wallapop's Terms of Service. Use it on your own account and at your own risk.
