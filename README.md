# Wallapop Relist

Chrome extension that adds a **"Resubir"** (relist) button to your own Wallapop
items. Relisting recreates the item so it jumps back to the top of search
results — the same effect as a paid bump, done by deleting and re-creating the
listing with its original data and photos.

The button appears both on the item detail page and on your items in the catalog
grid.

## How it works

When you click **Resubir**, the extension:

1. Reads your auth token from the page and finds the item's real id.
2. Fetches the item's full details and downloads its images.
3. **Creates the new item first** (with its original data and photos).
4. **Only then deletes the original** — so a failure never loses your listing;
   at worst you get a temporary duplicate.

## Install

1. Download the latest `wallapop-relist-vX.Y.Z.zip` from the
   [**Releases**](https://github.com/danielhuici/wallapop-relist/releases/latest)
   page and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder.
5. Open Wallapop (logged in) and click the **Resubir** button on any of your
   items.

To update later, download the newer release and repeat. To remove it, use the
**Remove** button on its card in `chrome://extensions`.

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
