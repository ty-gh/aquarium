// pixel.html・paper.html・glow.html を 1 ファイルにまとめて aquarium.html と index.html を作る。
// 使い方: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const STYLES = [
  { id: 'pixel', label: 'ピクセル' },
  { id: 'paper', label: '切り絵' },
  { id: 'glow', label: '光' },
];

const sources = {};
for (const { id } of STYLES) {
  const html = readFileSync(join(dir, `${id}.html`), 'utf8');
  // 各案は ?speed= を location.search から読む。埋め込み先では親のクエリに差し替えるので、1 か所だけあることを確かめる。
  const count = html.split('location.search').length - 1;
  if (count !== 1) throw new Error(`${id}.html: location.search が ${count} か所ある（1 か所の想定）`);
  sources[id] = html;
}

// <script> の中に HTML を文字列で置くので、閉じタグとコメント開始を無害にする。
const embed = (value) => JSON.stringify(value).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>aquarium</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #061820; cursor: none; }
  body.ui { cursor: default; }
  iframe {
    position: fixed; inset: 0; width: 100%; height: 100%; border: 0;
    pointer-events: none; opacity: 0; transition: opacity .8s ease;
  }
  iframe.on { opacity: 1; }
  #bar {
    position: fixed; left: 50%; bottom: 4vh; transform: translateX(-50%); z-index: 10;
    display: flex; gap: .35em; padding: .35em; border-radius: 999px;
    background: rgba(8, 18, 26, .6);
    font: 500 clamp(14px, 1.4vw, 24px)/1 system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif;
    opacity: 0; pointer-events: none; transition: opacity .4s ease;
  }
  body.ui #bar { opacity: 1; pointer-events: auto; }
  #bar button {
    font: inherit; color: rgba(255, 255, 255, .86); background: transparent;
    border: 0; border-radius: 999px; padding: .7em 1.3em; cursor: pointer;
  }
  #bar button:hover { background: rgba(255, 255, 255, .14); }
  #bar button[aria-pressed="true"] { background: rgba(255, 255, 255, .9); color: #0b1a22; }
  #bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  #bar .sep { width: 1px; margin: .5em .25em; background: rgba(255, 255, 255, .28); }
  #bar [hidden] { display: none; }
</style>
</head>
<body>
<div id="bar">${STYLES.map((s) => `<button type="button" data-style="${s.id}" aria-pressed="false">${s.label}</button>`).join('')}<span class="sep" id="fs-sep"></span><button type="button" id="fs">全画面</button></div>
<script>
(function () {
  'use strict';
  var SOURCES = ${embed(sources)};
  var ORDER = ${JSON.stringify(STYLES.map((s) => s.id))};
  var KEY = 'aquarium-style';
  var HIDE_MS = 3000;
  var bar = document.getElementById('bar');
  var buttons = Array.prototype.slice.call(bar.querySelectorAll('button[data-style]'));
  var fsButton = document.getElementById('fs');
  var root = document.documentElement;
  var current = null, frame = null, hideTimer = 0, lastX = -1, lastY = -1;

  function initial() {
    var q = new URLSearchParams(location.search).get('style');
    if (ORDER.indexOf(q) >= 0) return q;
    try {
      var saved = localStorage.getItem(KEY);
      if (ORDER.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    return ORDER[0];
  }

  function show(id) {
    if (id === current || ORDER.indexOf(id) < 0) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) {}
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.style === id)); });

    // 動かすのは選んだ案だけ。新しい案を上に重ねて出し、出きったら前の案を捨てる。
    var old = frame;
    var next = document.createElement('iframe');
    next.title = id;
    next.srcdoc = SOURCES[id].replace('location.search', function () { return JSON.stringify(location.search); });
    next.addEventListener('load', function () {
      requestAnimationFrame(function () { next.classList.add('on'); });
      if (old) setTimeout(function () { old.remove(); }, 900);
    }, { once: true });
    document.body.insertBefore(next, bar);
    frame = next;
  }

  function wake() {
    document.body.classList.add('ui');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { document.body.classList.remove('ui'); }, HIDE_MS);
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.style); wake(); });
  });

  // 全画面。ブラウザの決まりで、ボタンかキーの操作からしか入れない（開いただけでは入れない）。
  var fsRequest = root.requestFullscreen || root.webkitRequestFullscreen;
  var fsExit = document.exitFullscreen || document.webkitExitFullscreen;
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function toggleFullscreen() {
    if (!fsRequest || !fsExit) return;
    try {
      var p = fsElement() ? fsExit.call(document) : fsRequest.call(root);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function syncFullscreen() { fsButton.textContent = fsElement() ? '全画面を終了' : '全画面'; }
  if (fsRequest && fsExit && document.fullscreenEnabled !== false) {
    fsButton.addEventListener('click', function () { toggleFullscreen(); wake(); });
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
  } else {
    fsButton.hidden = true;
    document.getElementById('fs-sep').hidden = true;
  }
  window.addEventListener('pointermove', function (e) {
    // 画面の描き替えで出る、動いていないポインタの通知は無視する。
    if (e.clientX === lastX && e.clientY === lastY) return;
    var first = lastX < 0;
    lastX = e.clientX; lastY = e.clientY;
    if (!first) wake();
  });
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', function (e) {
    var i = ORDER.indexOf(current);
    if (e.key === '1' || e.key === '2' || e.key === '3') show(ORDER[+e.key - 1]);
    else if (e.key === 'ArrowRight') show(ORDER[(i + 1) % ORDER.length]);
    else if (e.key === 'ArrowLeft') show(ORDER[(i + ORDER.length - 1) % ORDER.length]);
    else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) toggleFullscreen();
    else return;
    wake();
  });

  // 検証用。画面には何も出さない。
  window.__stats = function () {
    var w = frame && frame.contentWindow;
    var s = w && w.__stats ? w.__stats() : {};
    s.style = current;
    s.frames = document.querySelectorAll('iframe').length;
    s.fullscreen = !!fsElement();
    return s;
  };

  show(initial());
})();
</script>
</body>
</html>
`;

// index.html は GitHub Pages の入口。中身は aquarium.html と同じ。
for (const name of ['aquarium.html', 'index.html']) writeFileSync(join(dir, name), page);
console.log(`aquarium.html と index.html を書き出した（${(Buffer.byteLength(page) / 1024).toFixed(0)} KB）`);
