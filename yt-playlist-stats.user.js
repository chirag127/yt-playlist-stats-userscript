// ==UserScript==
// @name         YT Playlist Stats
// @namespace    https://github.com/chirag127
// @version      1.0.0
// @description  Total and average duration of a playlist, watch time at 1.25x/1.5x/2x, a finish-by clock and the channel mix. Read-only.
// @author       chirag127
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @homepageURL  https://github.com/chirag127/yt-playlist-stats-userscript
// @supportURL   https://github.com/chirag127/yt-playlist-stats-userscript/issues
// @downloadURL  https://github.com/chirag127/yt-playlist-stats-userscript/raw/main/yt-playlist-stats.user.js
// @updateURL    https://github.com/chirag127/yt-playlist-stats-userscript/raw/main/yt-playlist-stats.user.js
// @require      https://raw.githubusercontent.com/chirag127/yt-core-lib/main/yt-core-lib-1.2.0.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (typeof Ytk === 'undefined') { console.error('[playlist-stats] core did not load'); return; }
  if (!Ytk.featureOn('stats', true)) return;

  var ROW_SELECTORS = ['yt-lockup-view-model', 'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer'];
  var DURATION_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

  function playlistId() {
    var q = new URLSearchParams(location.search).get('list');
    if (q) return q;
    var panel = document.querySelector('ytd-playlist-panel-renderer[playlist-id]');
    return panel ? panel.getAttribute('playlist-id') : null;
  }

  function rows() {
    for (var i = 0; i < ROW_SELECTORS.length; i++) {
      var found = Array.prototype.slice.call(document.querySelectorAll(ROW_SELECTORS[i]));
      if (found.length) return found;
    }
    return [];
  }

  function readRow(node) {
    var texts = [];
    (function walk(o, d) {
      if (!o || typeof o !== 'object' || d > 12) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, d + 1); }); return; }
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
        var v = o[k];
        if ((k === 'content' || k === 'text' || k === 'simpleText') && typeof v === 'string') texts.push(v);
        else if (v && typeof v === 'object') walk(v, d + 1);
      }
    })(node, 0);

    var duration = '';
    for (var i = 0; i < texts.length; i++) if (DURATION_RE.test(texts[i])) { duration = texts[i]; break; }
    var chanA = node.querySelector('a[href^="/channel/"], a[href^="/@"]');
    var channel = chanA ? (chanA.textContent || '').trim() : '';
    return { duration: duration, channel: channel };
  }

  function fmtClock(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function show() {
    var all = rows();
    var total = 0;
    var timed = 0;
    var channels = {};
    for (var i = 0; i < all.length; i++) {
      var r = readRow(all[i]);
      var sec = Ytk.parseDuration(r.duration);
      if (sec) { total += sec; timed += 1; }
      if (r.channel) channels[r.channel] = (channels[r.channel] || 0) + 1;
    }
    var mix = Object.keys(channels).sort(function (a, b) { return channels[b] - channels[a]; }).slice(0, 6);

    Ytk.panel('Playlist stats', function (body) {
      Ytk.kv(body, 'Rows on screen', all.length);
      Ytk.kv(body, 'With a readable duration', timed);
      Ytk.kv(body, 'Total duration', Ytk.fmtDuration ? Ytk.fmtDuration(total) : Math.round(total / 60) + ' min');
      Ytk.kv(body, 'Average', timed ? Math.round(total / timed / 60) + ' min' : '—');
      body.appendChild(Ytk.h('div', { style: 'height:8px' }));
      Ytk.kv(body, 'Watch @1.25×', Math.round(total / 1.25 / 60) + ' min');
      Ytk.kv(body, 'Watch @1.5×', Math.round(total / 1.5 / 60) + ' min');
      Ytk.kv(body, 'Watch @2×', Math.round(total / 2 / 60) + ' min');
      body.appendChild(Ytk.h('div', { style: 'height:8px' }));
      Ytk.kv(body, 'Finish @1× by', fmtClock(new Date(Date.now() + total * 1000)));
      Ytk.kv(body, 'Finish @1.5× by', fmtClock(new Date(Date.now() + (total / 1.5) * 1000)));

      if (mix.length) {
        body.appendChild(Ytk.h('div', { style: 'height:10px' }));
        Ytk.note(body, 'Channel mix');
        mix.forEach(function (c) { Ytk.kv(body, c, channels[c]); });
      }

      if (timed < all.length) {
        Ytk.note(body, (all.length - timed) + ' row(s) had no readable duration. Use Deep scan for an exact total.', 'ytk2-warn');
      }

      body.appendChild(Ytk.h('div', { style: 'padding-top:10px' },
        Ytk.h('button', {
          class: 'yts-btn',
          text: 'Deep scan (API)',
          onclick: function (e) {
            var btn = e.currentTarget;
            var id = playlistId();
            if (!id) { Ytk.toast('Open a playlist page first'); return; }
            btn.disabled = true;
            btn.textContent = 'Scanning…';
            Ytk.enumeratePlaylist(id, function (n) { btn.textContent = n + ' videos…'; })
              .then(function (items) {
                var sec2 = items.reduce(function (a, v) { return a + Ytk.parseDuration(v.duration); }, 0);
                Ytk.kv(body, 'Full playlist', items.length + ' videos · ' + Math.round(sec2 / 3600) + 'h ' + Math.round((sec2 % 3600) / 60) + 'm');
                btn.textContent = 'Deep scan (API)';
                btn.disabled = false;
              })
              .catch(function (err) {
                btn.textContent = 'Scan failed: ' + err.message;
              });
          }
        })
      ));
    });
  }

  function settingsPopup() {
    if (typeof Ytk.openSettings !== 'function') {
      alert('The shared core is out of date (v' + Ytk.VERSION + '). Reinstall this script.');
      return;
    }
    Ytk.openSettings({
      title: 'YT Playlist Stats',
      subtitle: 'Durations come from the rows currently rendered. Deep scan asks the API for every video.',
      sectionTitle: 'Stats',
      fields: [
        { key: 'statsShowChannels', label: 'Show the channel mix', type: 'checkbox', def: true },
        { key: 'statsSpeeds', label: 'Speeds to calculate, comma separated', type: 'text', def: '1.25,1.5,2' },
        { key: 'statsAutoScan', label: 'Run a deep API scan as soon as the panel opens', type: 'checkbox', def: false }
      ],
      actions: [{ label: 'Show stats now', run: show }]
    });
  }

  if (!playlistId() && !rows().length) return;

  Ytk.mountToolbar([{ label: 'Stats', run: show }]);
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Settings…', settingsPopup);
})();
