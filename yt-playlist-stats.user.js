// ==UserScript==
// @name         YT Playlist Stats
// @namespace    https://github.com/chirag127
// @version      1.0.2
// @description  Playlist duration totals, watch time at 1.25x/1.5x/2x, a finish-by clock time, channel mix, and an optional API deep scan.
// @author       chirag127
// @license      MIT
// @match        https://www.youtube.com/*
// @require      https://raw.githubusercontent.com/chirag127/yt-core-lib/main/yt-core-lib-1.4.0.js
// @downloadURL  https://raw.githubusercontent.com/chirag127/yt-playlist-stats-userscript/main/yt-playlist-stats.user.js
// @updateURL    https://raw.githubusercontent.com/chirag127/yt-playlist-stats-userscript/main/yt-playlist-stats.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (typeof Ytk === 'undefined') { console.error('[yt-playlist-stats] core did not load'); return; }
  if (!Ytk.featureOn('stats', true)) return;

  const ROW_SEL = 'yt-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer';
  const DURATION_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
  const BTN = 'font:inherit;font-size:12px;padding:6px 11px;border-radius:8px;cursor:pointer;'
    + 'border:1px solid #3a3a3a;background:#262626;color:#eaeaea';

  function onPlaylistSurface() {
    return location.pathname === '/playlist' || !!document.querySelector('ytd-playlist-panel-renderer');
  }

  function raw() { return Ytk.storeGet('settings', {}) || {}; }

  function playlistId() {
    const fromUrl = new URLSearchParams(location.search).get('list');
    if (fromUrl) return fromUrl;
    const panel = document.querySelector('ytd-playlist-panel-renderer[playlist-id]');
    return panel ? panel.getAttribute('playlist-id') : null;
  }

  function rowRoot() {
    const root = location.pathname === '/playlist'
      ? document.querySelector('ytd-playlist-video-list-renderer') || document.querySelector('ytd-browse[page-subtype="playlist"]')
      : document.querySelector('ytd-playlist-panel-renderer');
    return root || null;
  }

  function rowInfo(node) {
    const vm = node.data && node.data.lockupViewModel ? Ytk.lockupToItem(node.data.lockupViewModel) : null;
    const titleEl = node.querySelector('yt-lockup-metadata-view-model h3 a, a#video-title, #video-title');
    const chanEl = node.querySelector('ytd-channel-name a, #channel-name a, a[href^="/@"], a[href^="/channel/"]');
    const durEl = node.querySelector('#time-status #text, ytd-thumbnail-overlay-time-status-renderer #text');
    let duration = (vm && vm.duration) || (durEl && durEl.textContent) || '';
    if (!duration) {
      const anchors = node.querySelectorAll('a');
      for (let i = 0; i < anchors.length; i++) {
        const text = (anchors[i].textContent || '').trim();
        if (DURATION_RE.test(text)) { duration = text; break; }
      }
    }
    return {
      title: String((vm && vm.title) || (titleEl && (titleEl.getAttribute('title') || titleEl.textContent)) || '').trim(),
      channel: String((vm && vm.channel) || (chanEl && chanEl.textContent) || '').trim(),
      duration: String(duration).trim()
    };
  }

  function readRows() {
    const root = rowRoot();
    return root ? Array.from(root.querySelectorAll(ROW_SEL)).map(rowInfo) : [];
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h
      ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
      : m + ':' + String(s).padStart(2, '0');
  }

  function fmtClock(sec) {
    return new Date(Date.now() + sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function summarize(rows) {
    const timed = rows.filter(function (r) { return Ytk.parseDuration(r.duration) > 0; });
    const total = timed.reduce(function (sum, r) { return sum + Ytk.parseDuration(r.duration); }, 0);
    const channels = {};
    rows.forEach(function (r) { if (r.channel) channels[r.channel] = (channels[r.channel] || 0) + 1; });
    return { rows: rows, timed: timed.length, total: total, channels: channels };
  }

  function stats() {
    if (!onPlaylistSurface()) { Ytk.toast('Open a playlist first.'); return; }
    const rows = readRows();
    const sum = summarize(rows);
    const topN = Math.max(1, Math.min(20, parseInt(raw().statsChannelTop, 10) || 6));
    const primary = Number(raw().statsFinishSpeed) || 1;
    const mix = Object.keys(sum.channels).sort(function (a, b) { return sum.channels[b] - sum.channels[a]; }).slice(0, topN);

    const panel = Ytk.panel('Playlist stats', function (body) {
      Ytk.kv(body, 'Rows loaded', rows.length);
      Ytk.kv(body, 'Rows with a duration', sum.timed);
      Ytk.kv(body, 'Total duration', fmtDuration(sum.total));
      Ytk.kv(body, 'Average per video', fmtDuration(sum.timed ? sum.total / sum.timed : 0));
      Ytk.note(body, 'Watch time at speed');
      [1.25, 1.5, 2].forEach(function (speed) { Ytk.kv(body, 'At ' + speed + '×', fmtDuration(sum.total / speed)); });
      Ytk.note(body, 'Finish by (wall clock, starting now)');
      Ytk.kv(body, 'At ' + primary + '×', sum.total ? fmtClock(sum.total / primary) : '—');
      Ytk.kv(body, 'At 1.5×', sum.total ? fmtClock(sum.total / 1.5) : '—');

      if (mix.length) {
        body.appendChild(Ytk.h('div', { style: 'height:8px' }));
        Ytk.note(body, 'Channel mix — most frequent first');
        mix.forEach(function (name) {
          const pct = Math.round((sum.channels[name] / rows.length) * 100);
          Ytk.kv(body, name + ' · ' + pct + '%', sum.channels[name]);
        });
      }

      if (rows.length && sum.timed < rows.length) {
        Ytk.note(body, (rows.length - sum.timed) + ' row(s) had no readable duration — usually still loading or unavailable. Deep scan counts those separately.', 'ytk2-warn');
      }
      Ytk.note(body, 'Loaded rows only. Scroll the playlist to load more, or run a deep scan for every video.');

      const btn = Ytk.h('button', { text: 'Deep scan (API)', style: BTN });
      const out = Ytk.h('div', { style: 'padding-top:8px' });
      body.appendChild(Ytk.h('div', { style: 'padding-top:10px' }, btn));
      body.appendChild(out);

      function scan() {
        const listId = playlistId();
        if (!listId) { out.textContent = 'No playlist id in the URL.'; return; }
        btn.disabled = true;
        let lastPaint = 0;
        Ytk.enumeratePlaylist(listId, function (count) {
          if (count - lastPaint < 25) return;
          lastPaint = count;
          btn.textContent = 'Scanning… ' + count;
        }).then(function (items) {
          const apiSum = summarize(items);
          const noDuration = items.length - apiSum.timed;
          out.textContent = '';
          Ytk.kv(out, 'Videos enumerated', items.length);
          Ytk.kv(out, 'Total duration', fmtDuration(apiSum.total));
          Ytk.kv(out, 'Average per video', fmtDuration(apiSum.timed ? apiSum.total / apiSum.timed : 0));
          Ytk.kv(out, 'Finish at ' + primary + '× by', apiSum.total ? fmtClock(apiSum.total / primary) : '—');
          if (noDuration) Ytk.note(out, noDuration + ' video(s) reported no duration, so the total is a floor, not a ceiling.', 'ytk2-warn');
          // enumeratePlaylist drops repeated video ids, so duplicates are not visible here.
          Ytk.note(out, 'Exact list via InnerTube. Repeated video IDs are collapsed to one, so a playlist with duplicates reports its unique video count.');
          btn.textContent = 'Deep scan (API)';
          btn.disabled = false;
        }).catch(function (err) {
          const message = String((err && err.message) || err);
          out.textContent = '';
          Ytk.note(out, 'Deep scan failed: ' + message, 'ytk2-err');
          if (/SAPISID|signed in/i.test(message)) Ytk.note(out, 'The API read needs the account that owns the playlist. The loaded-rows stats above still work.');
          btn.textContent = 'Deep scan (API)';
          btn.disabled = false;
        });
      }

      btn.addEventListener('click', scan);
      if (raw().statsAutoDeepScan) scan();
    });
    return panel;
  }

  const fields = [
    { key: 'statsChannelTop', label: 'Channels in the mix', type: 'number', def: parseInt(raw().statsChannelTop, 10) || 6, hint: '1–20, most frequent first.' },
    {
      key: 'statsFinishSpeed', label: 'Finish-by clock uses speed', type: 'select',
      options: ['1', '1.25', '1.5', '2'], def: String(raw().statsFinishSpeed || '1')
    },
    { key: 'statsAutoDeepScan', label: 'Run the API deep scan when the panel opens', type: 'checkbox', def: !!raw().statsAutoDeepScan, hint: 'Slower: reads every video through InnerTube. Needs you to be signed in.' }
  ];

  GM_registerMenuCommand('Settings…', function () {
    const before = raw();
    Ytk.openSettings({
      title: 'YT Playlist Stats',
      subtitle: 'Durations, speed-adjusted watch time, finish clock and channel mix.',
      sectionTitle: 'Display',
      fields: fields,
      // Core 1.3.0 keeps only its own settings keys on save; re-merge this script's keys.
      onSave: function (next) { Ytk.storeSet('settings', Object.assign({}, before, next)); }
    });
  });

  let mounted = false;
  function mount() {
    if (mounted || !onPlaylistSurface()) return;
    mounted = true;
    Ytk.mountToolbar([{ label: 'Stats', run: stats }]);
  }
  mount();
  // The sidebar panel often renders after document-idle, and an in-app navigation
  // never reloads the page, so both events retry the idempotent mount.
  document.addEventListener('yt-navigate-finish', mount);
  document.addEventListener('yt-page-data-updated', mount);
})();
