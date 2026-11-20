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
  Object.keys(D.items).forEach(function (k) { var v = D.items[k]; ITEM[k] = { id: +k, name: v[0], kind: v[1], icon: v[2], mask: v[3] || 0 }; });

  // ---------- 物品分類 ----------
  // 職業：item.scr 職業位元（一轉、二轉兩種都算）
  var JOBS = [['劍士', 2 | 512 | 1024], ['騎士', 4 | 2048 | 4096], ['小丑', 8 | 8192 | 16384], ['法師', 16 | 32768 | 65536],
    ['祭司', 32 | 131072 | 262144], ['鐵匠', 64 | 524288 | 1048576], ['射手', 2097152 | 4194304 | 8388608], ['美食家', 16777216 | 33554432 | 67108864]];
  var KIND = { 0: '材料', 1: '補品', 3: '道具', 4: '單手劍', 6: '雙手劍', 7: '匕首', 8: '榔頭', 9: '鎚', 11: '法杖', 14: '盾牌', 15: '盔甲（上）', 16: '上衣',
    17: '頭盔', 18: '帽子', 19: '長靴', 20: '鞋子', 21: '飾品', 22: '寵物', 23: '寶石', 24: '委託書信', 25: '盔甲（下）', 26: '下褲', 27: '鍛造書',
    41: '寶箱', 42: '鑰匙', 46: '彈弓', 47: '弓', 48: '槍', 50: '套裝', 51: '湯匙', 52: '湯杓', 53: '麵包', 54: '損壞的裝備' };
  for (var k29 = 29; k29 <= 40; k29++) KIND[k29] = '轉職武器';
  var WEAPON = { 4: 1, 6: 1, 7: 1, 8: 1, 9: 1, 11: 1, 46: 1, 47: 1, 48: 1, 51: 1, 52: 1, 53: 1 };
  for (var w = 29; w <= 40; w++) WEAPON[w] = 1;
  var ARMOR = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 25: 1, 26: 1, 50: 1 };
  var TOOL = { 3: 1, 23: 1, 27: 1, 41: 1, 42: 1 };
  var CAT = { weapon: '武器', armor: '防具', tool: '道具', misc: '物品', quest: '委託', potion: '補品', pet: '寵物', evo: '寵物進化物品' };
  var QUEST = D.quest || {}, SHOP = {}, BOXREV = {}, EVOTO = {}, EVOFROM = {}, EVOMAT = {};
  (D.shop || []).forEach(function (i) { SHOP[i] = 1; });
  Object.keys(D.boxes || {}).forEach(function (b) { D.boxes[b].forEach(function (r) { (BOXREV[r[0]] = BOXREV[r[0]] || []).push({ box: +b, p: r[1] / 1e6 }); }); });
  (D.evo || []).forEach(function (r) {
    var e = { from: r[0], to: r[1], grow: r[2], mats: r[3], ok: r[4] };
    (EVOTO[r[1]] = EVOTO[r[1]] || []).push(e); (EVOFROM[r[0]] = EVOFROM[r[0]] || []).push(e);
    r[3].forEach(function (m) { (EVOMAT[m] = EVOMAT[m] || []).push(e); });
  });
  function isWeapon(it) { return !!WEAPON[it.kind]; }
  function isArmor(it) { return !!ARMOR[it.kind]; }
  function hasCat(it, c) {
    switch (c) {
      case 'weapon': return isWeapon(it);
      case 'armor': return isArmor(it);
      case 'tool': return !!TOOL[it.kind];
      case 'potion': return it.kind === 1;
      case 'pet': return it.kind === 22;
      case 'quest': return it.kind === 24 || !!QUEST[it.id];
      case 'evo': return !!EVOMAT[it.id];
      case 'misc': return !isWeapon(it) && !isArmor(it) && !TOOL[it.kind] && it.kind !== 1 && it.kind !== 22 && it.kind !== 24;
    }
    return true;
  }
  function jobsOf(it) {
    if (!isWeapon(it) && !isArmor(it)) return null;
    var m = it.mask;
    if (m >= 0 && m <= 4) return JOBS.map(function (j) { return j[0]; });      // 套裝編號，全職業
    return JOBS.filter(function (j) { return m & j[1]; }).map(function (j) { return j[0]; });
  }
  function jobOk(it, job) { var j = jobsOf(it); return !!j && j.indexOf(job) >= 0; }
  function itemObj(id) { return ITEM[id] || { id: id, name: '物品 ' + id, icon: -1, kind: -1, mask: 0 }; }
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
    var c = D.iconCols || 64, z = big ? 56 : 32, x = (i % c) * z, y = Math.floor(i / c) * z;
    return '<div class="item-icon' + (big ? ' big' : '') + '"><i style="width:' + z + 'px;height:' + z + 'px;background-size:' + (c * z) + 'px auto;background-position:-' + x + 'px -' + y + 'px"></i></div>';
  }
  function glyph(name) { var s = name.replace(/^\[[^\]]*\]\s*/, ''); return esc(s.charAt(0) || '?'); }
  var MONIMG = D.monImg || {};
  // 怪物頭像：有模型圖就用圖，沒有就用名字第一個字
  function avatar(m, cls, style) {
    var k = MONIMG[m.id];
    return '<div class="' + (cls || 'mob-icon') + ' ' + m.type + (k ? ' has-img' : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' +
      (k ? '<img src="mon_hd/' + k + '.webp" alt="" loading="lazy">' : glyph(m.name)) + '</div>';
  }
  function mapList(m) { return m.maps.map(function (x) { return MAPNAME(x[0]); }); }

  // ---------- 狀態 ----------
  var S = { mode: 'all', q: '', level: 'all', map: 'all', all: false, sort: 'lv', shown: PAGE, sel: null, selItem: null, cat: 'all', job: 'all', src: 'all' };

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
  function srcOf(it, list) {
    return { drop: list.length, box: (BOXREV[it.id] || []).length, shop: !!SHOP[it.id], evo: (EVOTO[it.id] || []).length };
  }
  function itemMatches() {
    var R = rev(), q = S.q.toLowerCase(), area = S.level !== 'all' || S.map !== 'all';
    var out = [];
    Object.keys(ITEM).forEach(function (k) {
      var it = ITEM[k];
      if (q && it.name.toLowerCase().indexOf(q) < 0 && String(it.id) !== q) return;
      if (S.cat !== 'all' && !hasCat(it, S.cat)) return;
      if (S.job !== 'all' && !jobOk(it, S.job)) return;
      var list = (R[k] || []).filter(function (x) { return baseOk(x.m); });
      if (area && !list.length) return;
      var src = srcOf(it, list);
      if (S.src !== 'all' && !src[S.src]) return;
      if (S.cat === 'all' && !src.drop && !src.box && !src.shop && !src.evo) return;
      var best = 0; list.forEach(function (x) { if (x.p > best) best = x.p; });
      out.push({ it: it, n: list.length, best: best, src: src });
    });
    out.sort(S.sort === 'id' ? function (a, b) { return a.it.id - b.it.id; } :
      S.sort === 'name' ? function (a, b) { return a.it.name.localeCompare(b.it.name, 'zh-Hant'); } :
      function (a, b) { return b.n - a.n || b.src.box - a.src.box || a.it.id - b.it.id; });
    return out;
  }
  function srcText(x) {
    var t = [];
    if (x.n) t.push(x.n + ' 種怪物會掉');
    if (x.src.box) t.push('寶箱開出');
    if (x.src.shop) t.push('NPC 商店');
    if (x.src.evo) t.push('寵物進化');
    return t.length ? t.join('・') : '無取得來源';
  }
  function itemCard(x) {
    var r = rate(), best = Math.min(1, x.best * r);
    var right = x.n ? '最高<span class="pc">' + pct(best) + '</span>' : '<span class="pc" style="color:#8fa9c5">' + (x.src.shop ? '商店' : x.src.box ? '寶箱' : x.src.evo ? '進化' : '—') + '</span>';
    return '<div class="monster' + (S.selItem === x.it.id ? ' selected' : '') + '" data-i="' + x.it.id + '">' + icon(x.it) +
      '<div class="txt"><b>' + esc(x.it.name) + '</b><small>' + esc(KIND[x.it.kind] || '其他') + '｜' + srcText(x) + '</small></div>' +
      '<span class="level">' + right + '</span></div>';
  }

  // ---------- 繪製 ----------
  var current = [];
  function render(keepSel) {
    var cards = $('cards');
    if (S.mode === 'item') {
      current = itemMatches();
      $('listTitle').textContent = S.cat === 'all' ? '物品反查' : '物品分類：' + CAT[S.cat] + (S.job !== 'all' ? '（' + S.job + '）' : '');
      $('listSub').textContent = 'ITEM LOOKUP ／ 輸入物品名稱，查看取得方式：怪物掉落、寶箱、商店、寵物進化';
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
    return '<div class="mapbox">' + (MAPIMG[mp] ? '<img src="maps/' + mp + '.webp" alt="">' : '') +
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
    var jobs = jobsOf(it), tags = '<span class="tag">' + esc(KIND[it.kind] || '其他') + '</span>';
    if (jobs) tags += '<span class="tag">' + (jobs.length === JOBS.length ? '全職業' : jobs.length ? jobs.join('、') : '無職業限制資料') + '</span>';
    if (list.length) tags += '<span class="tag">' + list.length + ' 種怪物會掉</span><span class="tag boss">最高 ' + pct(maxP) + '</span>';
    if (SHOP[id]) tags += '<span class="tag elite">NPC 商店有賣</span>';
    if (hasCat(it, 'quest')) tags += '<span class="tag">委託</span>';
    if (EVOMAT[id]) tags += '<span class="tag">寵物進化物品</span>';
    var html = '<div class="section-title">ITEM PROFILE / 物品資訊</div>' +
      '<div class="detail-top" style="margin-top:14px">' + icon(it, true) + '<div style="min-width:0"><h3>' + esc(it.name) + '</h3><small>ITEM ID：' + it.id + '</small>' +
      '<div class="tags">' + tags + '</div></div></div>';
    var other = (BOXREV[id] || []).length || SHOP[id] || EVOTO[id] || EVOFROM[id] || EVOMAT[id] || QUEST[id] || D.boxes && D.boxes[id];
    if (list.length || !other) {
      html += '<div class="drop-head"><b>怪物掉落（依機率排序）</b><small>每次擊殺的掉落機率' + (r > 1 ? '・已套用 ×' + r : '') + '</small></div>' +
      '<div class="drop-list">' + (list.length ? list.map(function (x) {
        var m = x.m, where = m.maps.length ? mapList(m).slice(0, 3).join('、') + (m.maps.length > 3 ? '…' : '') : '野外不出現';
        return '<div class="drop" data-m="' + m.id + '" title="點一下查看這隻怪物">' + avatar(m, 'item-icon mob-icon', 'font-size:15px') +
          '<div class="drop-info"><b>' + esc(m.name) + ' <span style="color:#58cfff;font-weight:400;font-size:10px">Lv.' + m.lv + '</span></b><small>' + esc(where) + '</small></div>' +
          '<span class="chance">' + pct(x.p) + '<small>' + oneIn(x.p) + '</small></span><span class="bar" style="width:' + Math.max(2, x.p / maxP * 100).toFixed(1) + '%"></span></div>';
      }).join('') : '<div class="empty">目前篩選條件下沒有怪物會掉這個物品。</div>') + '</div>';
    }
    var bx = (BOXREV[id] || []).slice().sort(function (a, b) { return b.p - a.p; });
    if (bx.length) html += '<div class="drop-head"><b>寶箱開出（' + bx.length + '）</b><small>開一次箱子的機率</small></div><div class="drop-list">' +
      bx.map(function (x) { return itemRow(itemObj(x.box), pct(x.p), oneIn(x.p)); }).join('') + '</div>';
    if (D.boxes && D.boxes[id]) {
      var inside = D.boxes[id].slice().sort(function (a, b) { return b[1] - a[1]; });
      html += '<div class="drop-head"><b>寶箱內容（' + inside.length + '）</b><small>開一次箱子的機率</small></div><div class="drop-list">' +
        inside.map(function (x) { return itemRow(itemObj(x[0]), pct(x[1] / 1e6), oneIn(x[1] / 1e6)); }).join('') + '</div>';
    }
    if (SHOP[id]) html += '<div class="drop-head"><b>NPC 商店</b><small>可直接向 NPC 購買</small></div><div class="note" style="margin-top:6px">這個物品在 NPC 商店有販售。</div>';
    if (QUEST[id]) html += '<div class="drop-head"><b>委託（' + QUEST[id].length + '）</b><small>交這個物品的委託</small></div><div class="drop-list">' +
      QUEST[id].map(function (q) { return '<div class="drop"><div class="drop-info"><b>' + (q[0] === 13 ? '低級委託' : q[0] === 521 ? '高級委託' : '委託 #' + q[0]) + '</b><small>需要交 ' + q[1] + ' 個</small></div></div>'; }).join('') + '</div>';
    if (EVOTO[id]) html += '<div class="drop-head"><b>由寵物進化取得（' + EVOTO[id].length + '）</b><small>原寵物＋材料</small></div><div class="drop-list">' + EVOTO[id].map(function (e) { return evoRow(e, e.from, '由'); }).join('') + '</div>';
    if (EVOFROM[id]) html += '<div class="drop-head"><b>可進化成（' + EVOFROM[id].length + '）</b><small>進化後的寵物＋材料</small></div><div class="drop-list">' + EVOFROM[id].map(function (e) { return evoRow(e, e.to, '成'); }).join('') + '</div>';
    if (EVOMAT[id]) {
      var em = EVOMAT[id].slice(0, 60);
      html += '<div class="drop-head"><b>可用於寵物進化（' + EVOMAT[id].length + '）</b><small>原寵物 → 進化後</small></div><div class="drop-list">' +
        em.map(function (e) { var a = itemObj(e.from), b = itemObj(e.to); return '<div class="drop" data-i="' + b.id + '">' + icon(a) + '<div class="drop-info"><b>' + esc(a.name) + ' → ' + esc(b.name) + '</b><small>成長值 ' + e.grow + '・成功率 ' + e.ok + '%</small></div>' + icon(b) + '</div>'; }).join('') +
        (EVOMAT[id].length > em.length ? '<div class="note">還有 ' + (EVOMAT[id].length - em.length) + ' 種進化也能用，請改搜尋寵物名稱查看。</div>' : '') + '</div>';
    }
    html += '<div class="note">※ 怪物掉落已套用左側的等級、區域篩選。寶箱內容取自伺服器 drop_1 掉落表；寵物進化取自伺服器進化配方（p_change）。</div>';
    $('detail').innerHTML = html;
    if (!quiet) setHash('i=' + id);
  }

  function itemRow(it, a, b) {
    return '<div class="drop" data-i="' + it.id + '" title="點一下查看這個物品">' + icon(it) +
      '<div class="drop-info"><b>' + esc(it.name) + '</b><small>' + esc(KIND[it.kind] || '其他') + '</small></div>' +
      '<span class="chance">' + a + '<small>' + (b || '') + '</small></span></div>';
  }
  function evoRow(e, pid, dir) {
    var p = itemObj(pid);
    return '<div class="drop evo" data-i="' + p.id + '" title="點一下查看這隻寵物">' + icon(p) +
      '<div class="drop-info"><b>' + (dir === '由' ? '由 ' : '進化成 ') + esc(p.name) + '</b><small>需要成長值 ' + e.grow + '・成功率 ' + e.ok + '%・可用材料：</small>' +
      '<div class="mats">' + e.mats.map(function (m) { var it = itemObj(m); return '<span data-i="' + m + '" title="' + esc(it.name) + '">' + icon(it) + '<em>' + esc(it.name) + '</em></span>'; }).join('') + '</div></div></div>';
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

  function setMode(mode, silent, cat) {
    S.mode = mode; S.shown = PAGE;
    if (cat !== undefined) S.cat = cat;
    if (mode !== 'item') S.cat = 'all';
    [].forEach.call(document.querySelectorAll('#nav button,#nav2 button'), function (b) { b.classList.toggle('active', b.dataset.filter === mode && (mode !== 'item' || (b.dataset.cat || 'all') === S.cat)); });
    $('itemFilters').style.display = mode === 'item' ? '' : 'none';
    if (!silent) render();
  }

  // ---------- 初始化 ----------
  function counts() {
    var c = { all: 0, normal: 0, elite: 0, boss: 0 };
    MON.forEach(function (m) { c.all++; c[m.type]++; });
    Object.keys(c).forEach(function (k) { $('c-' + k).textContent = c[k].toLocaleString(); });
    var cc = { all: 0 }; Object.keys(CAT).forEach(function (k) { cc[k] = 0; });
    var R = rev();
    Object.keys(ITEM).forEach(function (k) {
      var it = ITEM[k], src = srcOf(it, R[k] || []);
      if (src.drop || src.box || src.shop || src.evo) cc.all++;
      Object.keys(CAT).forEach(function (c) { if (hasCat(it, c)) cc[c]++; });
    });
    Object.keys(cc).forEach(function (k) { var el = $('c-cat-' + k); if (el) el.textContent = cc[k].toLocaleString(); });
    $('job').innerHTML = '<option value="all">全部職業</option>' + JOBS.map(function (j) { return '<option value="' + j[0] + '">' + j[0] + '</option>'; }).join('');
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
    S.q = ''; S.level = 'all'; S.map = 'all'; S.sort = 'lv'; S.shown = PAGE; S.cat = 'all'; S.job = 'all'; S.src = 'all';
    $('search').value = ''; $('level').value = 'all'; $('map').value = 'all'; $('sort').value = 'lv'; $('job').value = 'all'; $('src').value = 'all';
    syncClear(); setMode('all', true); render(); setHash('');
  }
  function syncClear() { $('clearBtn').classList.toggle('show', !!$('search').value || S.level !== 'all' || S.map !== 'all' || S.job !== 'all' || S.src !== 'all' || S.cat !== 'all'); }
  $('clearBtn').addEventListener('click', resetAll);
  $('resetBtn').addEventListener('click', resetAll);
  $('rateOn').addEventListener('change', function () { render(true); if (S.mode === 'item') showItem(S.selItem, true); else showMonster(S.sel, true); });
  $('nav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setMode(b.dataset.filter); });
  $('nav2').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { setMode('item', false, b.dataset.cat || 'all'); syncClear(); } });
  $('job').addEventListener('change', function () { S.job = this.value; syncClear(); S.shown = PAGE; render(); });
  $('src').addEventListener('change', function () { S.src = this.value; syncClear(); S.shown = PAGE; render(); });
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
    var d = e.target.closest('.mats [data-i]') || e.target.closest('.drop'); if (!d) return;
    if (d.dataset.i) { var it = ITEM[d.dataset.i]; setMode('item', true); S.q = it.name; $('search').value = it.name; render(); showItem(it.id); }
    else if (d.dataset.m) { var m = MON_BY_ID[d.dataset.m]; setMode('all', true); S.q = m.name; $('search').value = m.name; render(); showMonster(m.id); }
  });
  [].forEach.call(document.querySelectorAll('.hints a'), function (a) {
    a.addEventListener('click', function () { setMode(a.dataset.mode || 'all', true); $('search').value = a.dataset.q; run(); });
  });
  window.addEventListener('hashchange', function () { if (!hashLock) fromHash(); });

  $('rateTxt').textContent = '×' + (D.dropRate || 1);
  if ((D.dropRate || 1) <= 1) $('rateOn').closest('label').style.display = 'none';
  $('sItem').innerHTML = Object.keys(D.items).length.toLocaleString() + '<em>種物品</em>';
  $('sVer').innerHTML = esc(D.version) + '<em>正式服</em>';
  $('footVer').textContent = '資料更新：' + D.version + '・掉寶倍率 ×' + (D.dropRate || 1);
  $('status').textContent = '● 正式服資料';
  counts(); fillMaps(); $('itemFilters').style.display = 'none';
  if (!fromHash()) render();
  syncClear();
})();
