# YT Playlist Stats

How long is this playlist, really? And when would you be done with it?

The **Stats** button on the shared toolbar opens a panel with:

- rows loaded, rows with a readable duration
- total and average duration
- watch time at **1.25×**, **1.5×** and **2×**
- a **finish-by clock time** — at your chosen speed and at 1.5×
- **channel mix** — the most frequent channels with their share of the playlist
- **Deep scan (API)** — reads every video through InnerTube, including rows YouTube has not
  rendered yet

## Where it runs

- `youtube.com/playlist?list=…`
- the playlist panel on a watch page

## Settings

One entry — **Settings…** — opens the shared settings popup.

| Field | Default | Purpose |
|---|---|---|
| Channels in the mix | 6 | how many channels to list (1–20) |
| Finish-by clock uses speed | 1 | `1`, `1.25`, `1.5`, `2` |
| Run the API deep scan when the panel opens | off | convenience for long playlists; slower and needs sign-in |

## Deep scan

Uses `Ytk.enumeratePlaylist` from the core: a same-origin `browse` request with SAPISIDHASH auth
and continuation paging. Two things it does not hide:

- It needs the signed-in account that can read the playlist.
- It **collapses repeated video IDs to one entry**, so the count is the number of *unique*
  videos, not rows. Duplicate rows are `yt-playlist-prune-userscript`'s job.

Rows with no duration (private, deleted, still loading) are counted separately; the total is a
floor, not a ceiling.

## Install

Follow the [install guide](https://github.com/chirag127/userscript-install-guide). The script
`@require`s [yt-core-lib](https://github.com/chirag127/yt-core-lib), which is never installed
on its own.

## Docs

Collection documentation is single-sourced in the workspace bundle: `c:\ws\docs\okf\`.
