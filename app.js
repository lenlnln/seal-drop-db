(function () {
  'use strict';
  var D = window.SEAL_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var TYPE = { normal: '一般怪物', elite: '菁英怪物', boss: '頭目怪物' };
  var PAGE = 60;

  // ---------- 資料整理 ----------
  var MON = D.monsters.map(function (m) {
    return { id: m[0], name: m[1], lv: m[2], type: m[3], hp: m[4], exp: m[5], drop: m[6], maps: m[7], field: m[7].length > 0 };
  });
  var MON_BY_ID = {};
  MON.forEach(function (m) { MON_BY_ID[m.id] = m; });
  var ITEM = {};
  Object.keys(D.items).forEach(function (k) { var v = D.items[k]; ITEM[k] = { id: +k, name: v[0], kind: v[1], icon: v[2] }; });
  var MAPNAME = function (id) { return D.maps[id] || ('地圖 ' + id); };

  // 每隻怪物的掉落：同一物品在同一張表的機率相加；三張表各自獨立抽一次 → 合計 = 1 - Π(1 - p表)
  function dropsOf(m, rate) {
    var rows = D.tables[m.drop] || [];
    var byItem = {}, order = [];
    rows.forEach(function (r) {
      var it = r[0], p = r[1] / 1e6, t = r[2];
      if (!byItem[it]) { byItem[it] = { t: {} }; order.push(it); }
      byItem[it].t[t] = (byItem[it].t[t] || 0) + p;
    });
    return order.map(function (it) {
      var miss = 1, tabs = [];
      Object.keys(byItem[it].t).forEach(function (t) { var p = Math.min(1, byItem[it].t[t] * rate); miss *= 1 - p; tabs.push(t); });
      return { item: ITEM[it] || { id: it, name: '物品 ' + it, icon: -1 }, p: 1 - miss, tabs: tabs };
    }).sort(function (a, b) { return b.p - a.p; });
  }
  // 物品 → 掉落它的怪物（第一次用到才建立）
  var REV = null;
  function rev() {
    if (REV) return REV;
    REV = {};
    MON.forEach(function (m) {
      if (!m.drop) return;
      dropsOf(m, 1).forEach(function (d) { (REV[d.item.id] = REV[d.item.id] || []).push({ m: m, p: d.p }); });
    });
    return REV;
  }

  function rate() { return $('rateOn').checked ? (D.dropRate || 1) : 1; }
  function pct(p) {
    if (p <= 0) return '0%';
    var v = p * 100;
    if (v >= 10) return v.toFixed(1) + '%';
    if (v >= 1) return v.toFixed(2) + '%';
    if (v >= 0.01) return v.toFixed(3) + '%';
    return v.toPrecision(2) + '%';
  }
  function oneIn(p) {
    if (p <= 0) return '';
    if (p >= 0.5) return '';
    var n = 1 / p;
    return '約 1/' + (n >= 1000 ? Math.round(n).toLocaleString() : n >= 10 ? Math.round(n) : n.toFixed(1));
  }
  function icon(it, big) {
    var i = it && it.icon >= 0 ? it.icon : -1;
    if (i < 0) return '<div class="item-icon' + (big ? ' big' : '') + '">◇</div>';
    var c = D.iconCols || 64, x = (i % c) * 32, y = Math.floor(i / c) * 32;
    return '<div class="item-icon' + (big ? ' big' : '') + '"><i style="background-position:-' + x + 'px -' + y + 'px"></i></div>';
  }
  function glyph(name) { var s = name.replace(/^\[[^\]]*\]\s*/, ''); return esc(s.charAt(0) || '?'); }
  var MONIMG = D.monImg || {};
  // 怪物頭像：有模型圖就用圖，沒有就用名字第一個字
  function avatar(m, cls, style) {
    var k = MONIMG[m.id];
    return '<div class="' + (cls || 'mob-icon') + ' ' + m.type + (k ? ' has-img' : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' +
      (k ? '<img src="mon/' + k + '.webp" alt="" loading="lazy">' : glyph(m.name)) + '</div>';
  }
  function mapList(m) { return m.maps.map(function (x) { return MAPNAME(x[0]); }); }

  // ---------- 狀態 ----------
  var S = { mode: 'all', q: '', level: 'all', map: 'all', all: false, sort: 'lv', shown: PAGE, sel: null, selItem: null };

  function levelOk(m) {
    if (S.level === 'all') return true;
    var a = S.level.split('-'); return m.lv >= +a[0] && m.lv <= +a[1];
  }
  function mapOk(m) { return S.map === 'all' || m.maps.some(function (x) { return String(x[0]) === S.map; }); }
  function baseOk(m) { return levelOk(m) && mapOk(m); }

  var nameCache = {};
  function dropNames(m) {
    if (nameCache[m.id] !== undefined) return nameCache[m.id];
    var rows = D.tables[m.drop] || [], s = [];
    rows.forEach(function (r) { var it = ITEM[r[0]]; if (it) s.push(it.name.toLowerCase(), String(it.id)); });
    return (nameCache[m.id] = s.join(' '));
  }
  function sorter(a, b) {
    switch (S.sort) {
      case 'name': return a.name.localeCompare(b.name, 'zh-Hant') || a.lv - b.lv;
      case 'hp': return b.hp - a.hp;
      case 'exp': return b.exp - a.exp;
      case 'id': return a.id - b.id;
      default: return a.lv - b.lv || a.id - b.id;
    }
  }

  // ---------- 怪物列表 ----------
  function monsterMatches() {
    var q = S.q.toLowerCase();
    return MON.filter(function (m) {
      if (!baseOk(m)) return false;
      if (S.mode !== 'all' && m.type !== S.mode) return false;
      if (!q) return true;
      if (m.name.toLowerCase().indexOf(q) >= 0 || String(m.id) === q) return true;
      if (mapList(m).join(' ').toLowerCase().indexOf(q) >= 0) return true;
      return dropNames(m).indexOf(q) >= 0;
    }).sort(sorter);
  }
  function monCard(m, extra) {
    var where = m.maps.length ? MAPNAME(m.maps[0][0]) + (m.maps.length > 1 ? ' 等 ' + m.maps.length + ' 區' : '') : '野外不出現';
    return '<div class="monster' + (S.sel === m.id ? ' selected' : '') + '" data-m="' + m.id + '">' +
      avatar(m) +
      '<div class="txt"><b>' + esc(m.name) + '</b><small>ID：' + m.id + '｜' + TYPE[m.type] + '｜' + esc(where) + '</small></div>' +
      '<span class="level">Lv.' + m.lv + (extra ? '<span class="pc">' + extra + '</span>' : '') + '</span></div>';
  }

  // ---------- 物品列表 ----------
  function itemMatches() {
    var R = rev(), q = S.q.toLowerCase();
    var out = [];
    Object.keys(R).forEach(function (k) {
      var it = ITEM[k]; if (!it) return;
      if (q && it.name.toLowerCase().indexOf(q) < 0 && String(it.id) !== q) return;
      var list = R[k].filter(function (x) { return baseOk(x.m); });
      if (!list.length) return;
      var best = 0; list.forEach(function (x) { if (x.p > best) best = x.p; });
      out.push({ it: it, n: list.length, best: best });
    });
    out.sort(S.sort === 'id' ? function (a, b) { return a.it.id - b.it.id; } :
      S.sort === 'name' ? function (a, b) { return a.it.name.localeCompare(b.it.name, 'zh-Hant'); } :
      function (a, b) { return b.n - a.n || a.it.id - b.it.id; });
    return out;
  }
  function itemCard(x) {
    var r = rate(), best = Math.min(1, x.best * r);
    return '<div class="monster' + (S.selItem === x.it.id ? ' selected' : '') + '" data-i="' + x.it.id + '">' + icon(x.it) +
      '<div class="txt"><b>' + esc(x.it.name) + '</b><small>ITEM ID：' + x.it.id + '｜' + x.n + ' 種怪物會掉</small></div>' +
      '<span class="level">最高<span class="pc">' + pct(best) + '</span></span></div>';
  }

  // ---------- 繪製 ----------
  var current = [];
  function render(keepSel) {
    var cards = $('cards');
    if (S.mode === 'item') {
      current = itemMatches();
      $('listTitle').textContent = '物品反查';
      $('listSub').textContent = 'ITEM LOOKUP ／ 輸入物品名稱，查看哪些怪物會掉、機率多少';
      $('listHead').textContent = 'ITEM LIST / 物品列表';
      $('resultCount').textContent = '找到 ' + current.length.toLocaleString() + ' 種物品';
      cards.innerHTML = current.length ? current.slice(0, S.shown).map(itemCard).join('') + more() : empty();
      if (!keepSel || !current.some(function (x) { return x.it.id === S.selItem; })) {
        if (current.length) showItem(current[0].it.id, true); else $('detail').innerHTML = emptyDetail();
      }
    } else {
      current = monsterMatches();
      $('listTitle').textContent = '怪物索引';
      $('listSub').textContent = 'MONSTER INDEX ／ 點選怪物查看詳細掉落資訊';
      $('listHead').textContent = 'MONSTER LIST / 怪物列表';
      $('resultCount').textContent = '顯示 ' + Math.min(S.shown, current.length).toLocaleString() + ' / ' + current.length.toLocaleString() + ' 筆';
      cards.innerHTML = current.length ? current.slice(0, S.shown).map(function (m) { return monCard(m); }).join('') + more() : empty();
      if (!keepSel || !current.some(function (m) { return m.id === S.sel; })) {
        if (current.length) showMonster(current[0].id, true); else $('detail').innerHTML = emptyDetail();
      }
    }
  }
  function more() { return current.length > S.shown ? '<button class="more" id="more">再顯示 ' + Math.min(PAGE, current.length - S.shown) + ' 筆（共 ' + current.length.toLocaleString() + ' 筆）</button>' : ''; }
  function empty() { return '<div class="empty">找不到符合條件的資料，請嘗試其他關鍵字或放寬篩選。</div>'; }
  function emptyDetail() { return '<div class="section-title">DETAIL / 詳細資訊</div><div class="empty">沒有可顯示的資料。</div>'; }
  function markSel() {
    [].forEach.call(document.querySelectorAll('#cards .monster'), function (c) {
      c.classList.toggle('selected', (c.dataset.m && +c.dataset.m === S.sel && S.mode !== 'item') || (c.dataset.i && +c.dataset.i === S.selItem && S.mode === 'item'));
    });
  }

  // ---------- 地圖分布圖 ----------
  var MAPIMG = {}; (D.mapImg || []).forEach(function (x) { MAPIMG[x] = 1; });
  var mapSel = {};
  function dots(pts, r, fill, stroke) {
    var o = '';
    for (var i = 0; i + 1 < pts.length; i += 2) o += '<circle cx="' + pts[i] + '" cy="' + (511 - pts[i + 1]) + '" r="' + r + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="2"' : '') + '/>';
    return o;
  }
  function mapView(m, mp) {
    var others = '', n = 0;
    MON.forEach(function (o) {
      if (o.id === m.id) return;
      o.maps.forEach(function (x) { if (x[0] === mp && x[2]) { others += dots(x[2], 4, 'rgba(230,240,255,.55)'); n++; } });
    });
    var mine = m.maps.filter(function (x) { return x[0] === mp; })[0];
    return '<div class="mapbox">' + (MAPIMG[mp] ? '<img src="maps/' + mp + '.jpg" alt="">' : '') +
      '<svg viewBox="0 0 512 512" preserveAspectRatio="none">' + others + (mine && mine[2] ? dots(mine[2], 7, '#ff5a5a', '#fff') : '') + '</svg></div>' +
      '<div class="legend"><span><i style="background:#ff5a5a;border:1px solid #fff"></i>' + esc(m.name) + '（' + (mine ? mine[1] : 0) + ' 隻）</span><span><i style="background:rgba(230,240,255,.7)"></i>同地圖其他怪物（' + n + ' 種）</span></div>';
  }
  function mapSection(m) {
    if (!m.maps.length) return '';
    var cur = mapSel[m.id] || m.maps[0][0];
    return '<div class="drop-head"><b>地圖分布圖</b><small>紅點＝此怪物出生位置</small></div>' +
      (m.maps.length > 1 ? '<div class="map-tabs">' + m.maps.map(function (x) { return '<button data-mapview="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '">' + esc(MAPNAME(x[0])) + '</button>'; }).join('') + '</div>' : '') +
      '<div id="mapView">' + mapView(m, cur) + '</div>';
  }

  function showMonster(id, quiet) {
    var m = MON_BY_ID[id]; if (!m) return;
    S.sel = id; markSel();
    var r = rate(), drops = dropsOf(m, r);
    var maxP = drops.length ? drops[0].p : 1;
    var maps = m.maps.length ? '<div class="maps">' + m.maps.map(function (x) { return '<span data-map="' + x[0] + '" title="此區數量 ' + x[1] + '">' + esc(MAPNAME(x[0])) + ' ×' + x[1] + '</span>'; }).join('') + '</div>' : '<b>野外不出現（活動、副本或召喚）</b>';
    $('detail').innerHTML =
      '<div class="section-title">MONSTER PROFILE / 怪物資訊</div>' +
      '<div class="detail-top" style="margin-top:14px">' + avatar(m, 'detail-art mob-icon', 'width:84px;height:84px;flex-basis:84px;font-size:30px') + '<div style="min-width:0"><h3>' + esc(m.name) + '</h3><small>MONSTER ID：' + m.id + '</small>' +
      '<div class="tags"><span class="tag ' + m.type + '">' + TYPE[m.type] + '</span><span class="tag">LV. ' + m.lv + '</span></div></div></div>' +
      '<div class="attributes"><div class="attr"><small>生命值 / HP</small><b>' + m.hp.toLocaleString() + '</b></div><div class="attr"><small>經驗值 / EXP</small><b>' + m.exp.toLocaleString() + '</b></div>' +
      '<div class="attr" style="grid-column:1/-1"><small>出沒區域 / LOCATION（數字為該區數量）</small>' + maps + '</div></div>' +
      mapSection(m) +
      '<div class="drop-head"><b>掉落物品清單（' + drops.length + '）</b><small>每次擊殺的掉落機率' + (r > 1 ? '・已套用 ×' + r : '') + '</small></div>' +
      '<div class="drop-list">' + (drops.length ? drops.map(function (d) {
        return '<div class="drop" data-i="' + d.item.id + '" title="點一下查看還有哪些怪物會掉">' + icon(d.item) +
          '<div class="drop-info"><b>' + esc(d.item.name) + '</b><small>ITEM ID：' + d.item.id + '｜掉落表 ' + d.tabs.join('、') + '</small></div>' +
          '<span class="chance">' + pct(d.p) + '<small>' + oneIn(d.p) + '</small></span><span class="bar" style="width:' + Math.max(2, d.p / maxP * 100).toFixed(1) + '%"></span></div>';
      }).join('') : '<div class="empty">這隻怪物沒有掉落物。</div>') + '</div>' +
      '<div class="note">※ 機率取自伺服器 drop_1／drop_2／drop_3 掉落表，三張表每次擊殺各抽一次，同一物品的機率已合併。' +
      (D.dropRate > 1 ? '目前伺服器掉寶倍率為 ×' + D.dropRate + '，勾選左側「以伺服器掉寶倍率估算」時以基本機率 ×' + D.dropRate + ' 估算。' : '') + '下方色條為與本怪物最高掉落物的相對比例。</div>';
    if (!quiet) setHash('m=' + id);
  }

  function showItem(id, quiet) {
    var it = ITEM[id]; if (!it) return;
    S.selItem = id; markSel();
    var r = rate();
    var list = (rev()[id] || []).filter(function (x) { return baseOk(x.m); })
      .map(function (x) { return { m: x.m, p: x.p }; });
    // 套用倍率：各表機率 × 倍率（重新計算較準）
    list = list.map(function (x) {
      if (r === 1) return x;
      var d = dropsOf(x.m, r).filter(function (y) { return y.item.id === id; })[0];
      return { m: x.m, p: d ? d.p : x.p };
    }).sort(function (a, b) { return b.p - a.p || a.m.lv - b.m.lv; });
    var maxP = list.length ? list[0].p : 1;
    $('detail').innerHTML =
      '<div class="section-title">ITEM PROFILE / 物品資訊</div>' +
      '<div class="detail-top" style="margin-top:14px">' + icon(it, true) + '<div style="min-width:0"><h3>' + esc(it.name) + '</h3><small>ITEM ID：' + it.id + '</small>' +
      '<div class="tags"><span class="tag">' + list.length + ' 種怪物會掉</span>' + (list.length ? '<span class="tag boss">最高 ' + pct(maxP) + '</span>' : '') + '</div></div></div>' +
      '<div class="drop-head"><b>掉落來源（依機率排序）</b><small>每次擊殺的掉落機率' + (r > 1 ? '・已套用 ×' + r : '') + '</small></div>' +
      '<div class="drop-list">' + (list.length ? list.map(function (x) {
        var m = x.m, where = m.maps.length ? mapList(m).slice(0, 3).join('、') + (m.maps.length > 3 ? '…' : '') : '野外不出現';
        return '<div class="drop" data-m="' + m.id + '" title="點一下查看這隻怪物">' + avatar(m, 'item-icon mob-icon', 'font-size:15px') +
          '<div class="drop-info"><b>' + esc(m.name) + ' <span style="color:#58cfff;font-weight:400;font-size:10px">Lv.' + m.lv + '</span></b><small>' + esc(where) + '</small></div>' +
          '<span class="chance">' + pct(x.p) + '<small>' + oneIn(x.p) + '</small></span><span class="bar" style="width:' + Math.max(2, x.p / maxP * 100).toFixed(1) + '%"></span></div>';
      }).join('') : '<div class="empty">目前篩選條件下沒有怪物會掉這個物品。</div>') + '</div>' +
      '<div class="note">※ 已套用左側的等級、區域篩選。想看活動、副本怪物，請勾選「包含野外不出現的怪物」。</div>';
    if (!quiet) setHash('i=' + id);
  }

  // ---------- 網址（可分享） ----------
  var hashLock = false;
  function setHash(h) { hashLock = true; history.replaceState(null, '', '#' + h); setTimeout(function () { hashLock = false; }, 0); }
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1)), m;
    if ((m = /^m=(\d+)/.exec(h)) && MON_BY_ID[m[1]]) {
      var mon = MON_BY_ID[m[1]];
      setMode('all', true); S.q = mon.name; $('search').value = mon.name; S.shown = PAGE; render(); showMonster(+m[1], true);
      return true;
    }
    if ((m = /^i=(\d+)/.exec(h)) && ITEM[m[1]]) {
      setMode('item', true); S.q = ITEM[m[1]].name; $('search').value = S.q; S.shown = PAGE; render(); showItem(+m[1], true);
      return true;
    }
    if ((m = /^q=(.+)/.exec(h))) { S.q = m[1]; $('search').value = m[1]; render(); return true; }
    return false;
  }

  function setMode(mode, silent) {
    S.mode = mode; S.shown = PAGE;
    [].forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('active', b.dataset.filter === mode); });
    if (!silent) render();
  }

  // ---------- 初始化 ----------
  function counts() {
    var c = { all: 0, normal: 0, elite: 0, boss: 0 };
    MON.forEach(function (m) { c.all++; c[m.type]++; });
    Object.keys(c).forEach(function (k) { $('c-' + k).textContent = c[k].toLocaleString(); });
    $('c-item').textContent = Object.keys(D.items).length.toLocaleString();
    $('sMon').innerHTML = c.all.toLocaleString() + '<em>' + '隻怪物</em>';
  }
  function fillMaps() {
    var cnt = {};
    MON.forEach(function (m) { m.maps.forEach(function (x) { cnt[x[0]] = (cnt[x[0]] || 0) + 1; }); });
    var ids = Object.keys(cnt).sort(function (a, b) {
      var na = /^地圖 \d+$/.test(MAPNAME(a)), nb = /^地圖 \d+$/.test(MAPNAME(b));
      return na - nb || a - b;
    });
    $('map').innerHTML = '<option value="all">全部區域</option>' + ids.map(function (id) { return '<option value="' + id + '">' + esc(MAPNAME(id)) + '（' + cnt[id] + '）</option>'; }).join('');
  }

  function run() {
    S.q = $('search').value.trim(); S.shown = PAGE; render();
    if (S.q) setHash('q=' + encodeURIComponent(S.q)); else setHash('');
  }
  $('searchBtn').addEventListener('click', run);
  var t; $('search').addEventListener('input', function () { syncClear(); clearTimeout(t); t = setTimeout(run, 180); });
  $('search').addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  $('level').addEventListener('change', function () { S.level = this.value; syncClear(); S.shown = PAGE; render(true); });
  $('map').addEventListener('change', function () { S.map = this.value; syncClear(); S.shown = PAGE; render(true); });
  $('sort').addEventListener('change', function () { S.sort = this.value; S.shown = PAGE; render(true); });
  function resetAll() {
    S.q = ''; S.level = 'all'; S.map = 'all'; S.sort = 'lv'; S.shown = PAGE;
    $('search').value = ''; $('level').value = 'all'; $('map').value = 'all'; $('sort').value = 'lv';
    syncClear(); setMode('all', true); render(); setHash('');
  }
  function syncClear() { $('clearBtn').classList.toggle('show', !!$('search').value || S.level !== 'all' || S.map !== 'all'); }
  $('clearBtn').addEventListener('click', resetAll);
  $('resetBtn').addEventListener('click', resetAll);
  $('rateOn').addEventListener('change', function () { render(true); if (S.mode === 'item') showItem(S.selItem, true); else showMonster(S.sel, true); });
  $('nav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setMode(b.dataset.filter); });
  $('cards').addEventListener('click', function (e) {
    if (e.target.id === 'more') { S.shown += PAGE; render(true); return; }
    var c = e.target.closest('.monster'); if (!c) return;
    if (c.dataset.m) showMonster(+c.dataset.m); else if (c.dataset.i) showItem(+c.dataset.i);
    if (window.innerWidth <= 1100) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('detail').addEventListener('click', function (e) {
    var mv = e.target.closest('[data-mapview]');
    if (mv) { var mm = MON_BY_ID[S.sel]; mapSel[S.sel] = +mv.dataset.mapview; [].forEach.call(document.querySelectorAll('.map-tabs button'), function (b) { b.classList.toggle('on', b === mv); }); $('mapView').innerHTML = mapView(mm, +mv.dataset.mapview); return; }
    var mp = e.target.closest('[data-map]');
    if (mp) { S.map = mp.dataset.map; $('map').value = S.map; S.q = ''; $('search').value = ''; setMode('all'); window.scrollTo({ top: $('cards').getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); return; }
    var d = e.target.closest('.drop'); if (!d) return;
    if (d.dataset.i) { var it = ITEM[d.dataset.i]; setMode('item', true); S.q = it.name; $('search').value = it.name; render(); showItem(it.id); }
    else if (d.dataset.m) { var m = MON_BY_ID[d.dataset.m]; setMode('all', true); S.q = m.name; $('search').value = m.name; render(); showMonster(m.id); }
  });
  [].forEach.call(document.querySelectorAll('.hints a'), function (a) {
    a.addEventListener('click', function () { setMode(a.dataset.mode || 'all', true); $('search').value = a.dataset.q; run(); });
  });
  window.addEventListener('hashchange', function () { if (!hashLock) fromHash(); });

  $('rateTxt').textContent = '×' + (D.dropRate || 1);
  if ((D.dropRate || 1) <= 1) $('rateOn').closest('label').style.display = 'none';
  $('sItem').innerHTML = Object.keys(D.items).length.toLocaleString() + '<em>種掉落物</em>';
  $('sVer').innerHTML = esc(D.version) + '<em>正式服</em>';
  $('footVer').textContent = '資料更新：' + D.version + '・掉寶倍率 ×' + (D.dropRate || 1);
  $('status').textContent = '● 正式服資料';
  counts(); fillMaps();
  if (!fromHash()) render();
  syncClear();
})();
