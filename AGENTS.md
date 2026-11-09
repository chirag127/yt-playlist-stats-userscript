# AGENTS.md — YT Playlist Stats

Read the collection rules first: [`../AGENTS.md`](../AGENTS.md). Documentation lives once in
`c:\ws\docs\okf\` — do not create an `okf/` copy here.

## What this repo is

One userscript, one job: report the duration and composition of a playlist. Read-only.

## Non-negotiables

1. **Exactly one context-menu entry**, `Settings…`, calling `Ytk.openSettings`.
2. **No `innerHTML`.** Panel content uses `Ytk.kv`, `Ytk.note` and `Ytk.h`.
3. **Shared toolbar and shared panel only.** No custom bar or second panel.
4. **Reads only.** No playlist writes, no reordering, no removal. This script never calls a
   write endpoint.
5. **Core is required, pinned:** `@require …/yt-core-lib-1.3.0.js`. Duration parsing is
   `Ytk.parseDuration`; the API read is `Ytk.enumeratePlaylist`. Do not reimplement either.

## Why the code looks the way it does

- **Two row shapes.** Current playlists render `yt-lockup-view-model` with the data in
  `node.data.lockupViewModel`; older sessions render `ytd-playlist-video-renderer` /
  `ytd-playlist-panel-video-renderer`. Lockup durations appear in a bare badge anchor, so the
  reader scans anchor text for `/^\d{1,2}:\d{2}(:\d{2})?$/` before falling back to
  `#time-status #text`.
- **`enumeratePlaylist` deduplicates.** It keeps a `seen` set of video ids, so its result is
  *unique videos*. The panel says so out loud instead of calling the number a row count.
  Duplicate counting belongs to `yt-playlist-prune-userscript`.
- **A total can be a floor.** Rows with no duration are reported, not silently treated as
  zero-length.
- **Core 1.3.0 is the floor.** Each script has its own sandbox, so 1.2.0 drew one toolbar
  per script; 1.3.0 reuses the `.ytk2-bar` already in the DOM.
- **The AI grants stay.** The settings popup renders the shared AI section, which calls
  `GM_xmlhttpRequest`; without `@grant GM_xmlhttpRequest` + `@connect *` its test fails.
- **Settings survive because of `onSave`.** Core 1.3.0's `openSettings` rebuilds
  `ytk.settings` from its own defaults and drops keys it does not know
  (`statsChannelTop`, `statsFinishSpeed`, `statsAutoDeepScan`). The `onSave` merge restores
  them.
- **Deep scan failures are shown, not swallowed.** A missing SAPISID is explained; the
  loaded-rows stats above the button keep working.

## Verification before claiming a change works

```bash
node --check yt-playlist-stats.user.js
grep -c "GM_registerMenuCommand(" yt-playlist-stats.user.js   # must be 1
grep -c "innerHTML" yt-playlist-stats.user.js                 # must be 0
```

Then check the numbers against a real playlist: total seconds should match the sum of the
visible durations, and the deep scan count should match the playlist's own "N videos" label for
a playlist without duplicates. Static checks alone are not a live test.
