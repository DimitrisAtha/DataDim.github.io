/* Live dashboard: Branch Performance demo (synthetic data) + Tableau embeds.
   Filters are synced across pages, charts cross-filter on click, and the
   state lives in the URL hash so any view can be shared. */
(function () {
  "use strict";

  if (!window.echarts) {
    document.querySelectorAll(".viz-body").forEach(function (n) {
      n.textContent = "The chart library could not load. Check the connection and refresh.";
    });
    return;
  }

  // Branch Performance data is read from the Excel workbook (the generator is only a fallback)
  var data = null, md = null, B = [], R = [], MON = DemoData.MONTHS, LM = DemoModel.LAST_MONTH_NO;
  var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var PAGES = ["overview", "growth", "activation", "ranking", "products", "reps"];
  var DASHES = ["bp", "business", "covid"];
  var RISK = {
    good: { label: "Spread", long: "biggest client under 25%", symbol: "circle" },
    warn: { label: "Watch", long: "biggest client 25 to 50%", symbol: "diamond" },
    crit: { label: "One-client risk", long: "biggest client 50% or more", symbol: "triangle" }
  };

  var state = { dash: "bp", page: "overview", year: 0, region: "", am: "", branch: null, rep: null, month: null,
    trend: "vol", metric: "vol", compare: "same", sort: { key: "vol", dir: -1 } };

  /* ---------- formatting ---------- */
  var nf = new Intl.NumberFormat("en-US");
  function fInt(n) { return nf.format(Math.round(n)); }
  function fEur(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return "€" + (n / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return "€" + Math.round(n / 1e3) + "K";
    if (a >= 1e3) return "€" + (n / 1e3).toFixed(1) + "K";
    return "€" + Math.round(n);
  }
  function fPct(x, d) {
    if (x == null || !isFinite(x)) return "–";
    var t = Math.abs(x * 100).toFixed(d == null ? 1 : d);
    return (x < 0 && +t !== 0 ? "−" : "") + t + "%";
  }
  function sign(v) { return v > 0 ? "+" : v < 0 ? "−" : ""; }
  function fChg(x, d) { if (x == null || !isFinite(x)) return "–"; var v = x * 100; return sign(v) + Math.abs(v).toFixed(d == null ? 1 : d) + "%"; }
  function fPP(x) { if (x == null || !isFinite(x)) return "–"; var v = x * 100; return sign(v) + Math.abs(v).toFixed(1) + " pp"; }
  function chg(a, b) { return a ? b / a - 1 : null; }
  function dir(x) { return x == null || !isFinite(x) || Math.abs(x) < 0.0005 ? "" : x > 0 ? "up" : "down"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sum(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f(arr[i]); return s; }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; }
  function periodLabel() { return state.year === 2025 ? "Jan–Dec 2025" : state.year === 2026 ? "Jan–" + MN[LM - 1] + " 2026" : "Jan 2025 – " + MN[LM - 1] + " 2026"; }

  /* ---------- theme ---------- */
  var T;
  function theme() {
    var cs = getComputedStyle(document.documentElement);
    function g(n) { return cs.getPropertyValue(n).trim(); }
    return { ink: g("--ink"), ink2: g("--ink-2"), muted: g("--muted"), line: g("--line"), axis: g("--axis"), surface: g("--surface"),
      s2: g("--surface-2"), cThis: g("--s-this"), cLast: g("--s-last"), good: g("--good"), warn: g("--warn"), crit: g("--crit"),
      link: g("--link"), c3: g("--s-3"), dmid: g("--div-mid"), dneg: g("--div-neg"), dpos: g("--div-pos"),
      font: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif" };
  }
  function riskColor(k) { return k === "crit" ? T.crit : k === "warn" ? T.warn : T.good; }

  /* ---------- chart helpers ---------- */
  function baseOpt(extra) {
    var o = {
      animationDuration: 350, animationDurationUpdate: 300,
      textStyle: { fontFamily: T.font, color: T.ink2 },
      aria: { enabled: true },
      tooltip: { confine: true, backgroundColor: T.surface, borderColor: T.line, borderWidth: 1, padding: [8, 10],
        textStyle: { color: T.ink, fontSize: 12, fontFamily: T.font },
        extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(15,27,45,.18);" },
      grid: { left: 4, right: 16, top: 30, bottom: 2, containLabel: true }
    };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function legend(names, line) {
    return { top: 0, left: 0, data: names, icon: line ? "rect" : "roundRect", itemWidth: line ? 14 : 10, itemHeight: line ? 2 : 10, itemGap: 16,
      itemStyle: { borderWidth: 0 }, textStyle: { color: T.ink2, fontSize: 12, fontFamily: T.font } };
  }
  function narrow(id) { var el = document.getElementById(id); return el && el.clientWidth < 640; }
  function catAxis(cats, o) {
    var a = { type: "category", data: cats, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
      axisLabel: { color: T.muted, fontSize: 11, fontFamily: T.font } };
    for (var k in o || {}) a[k] = o[k];
    return a;
  }
  function valAxis(fmt, o) {
    var a = { type: "value", splitLine: { lineStyle: { color: T.line } }, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: T.muted, fontSize: 11, fontFamily: T.font, formatter: fmt } };
    for (var k in o || {}) a[k] = o[k];
    return a;
  }
  function axisCompactEur(v) { return v === 0 ? "0" : fEur(v); }
  function axisPct(v) { return Math.round(v * 100) + "%"; }
  function ttHead(s) { return '<div style="font-size:11px;color:' + T.muted + ';margin-bottom:4px">' + esc(s) + "</div>"; }
  function ttRow(color, value, label) {
    return '<div style="display:flex;align-items:center;gap:8px;line-height:1.6;white-space:nowrap">' +
      (color ? '<i style="display:inline-block;width:12px;height:2px;border-radius:1px;background:' + color + '"></i>' : "") +
      '<b style="font-weight:700">' + esc(value) + '</b><span style="color:' + T.ink2 + '">' + esc(label) + "</span></div>";
  }
  function bar(name, values, color, o) {
    var s = { name: name, type: "bar", data: values, barMaxWidth: 22, barGap: "12%", itemStyle: { color: color, borderRadius: [4, 4, 0, 0] },
      emphasis: { focus: "none", itemStyle: { opacity: 0.85 } } };
    for (var k in o || {}) s[k] = o[k];
    return s;
  }
  function emptyOpt() {
    return baseOpt({ title: { text: "No new merchants for this selection", left: "center", top: "middle",
      textStyle: { color: T.muted, fontSize: 13, fontWeight: 500, fontFamily: T.font } } });
  }

  var charts = {};
  var ro = "ResizeObserver" in window ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) { var c = charts[e.target.id]; if (c && e.contentRect.width) c.resize(); });
  }) : null;
  function mount(id, option, onClick) {
    var el = document.getElementById(id);
    var c = charts[id];
    if (!c) {
      c = echarts.init(el, null, { renderer: "svg" });
      charts[id] = c;
      if (ro) ro.observe(el); else window.addEventListener("resize", function () { c.resize(); });
    }
    c.off("click");
    if (onClick) c.on("click", onClick);
    c.setOption(option, true);
  }

  /* ---------- DOM helpers ---------- */
  function pageEl(p) { return document.querySelector('.page[data-page="' + p + '"]'); }
  function setInsight(p, text) { pageEl(p).querySelector("[data-insight]").textContent = text; }
  function setKpis(p, items) {
    var host = pageEl(p).querySelector("[data-kpis]");
    host.replaceChildren();
    items.forEach(function (k) {
      var d = document.createElement("div");
      d.className = "kpi-card";
      [["lbl", k.lbl], ["val" + (k.cls ? " " + k.cls : ""), k.val], ["sub" + (k.subCls ? " " + k.subCls : ""), k.sub || ""]].forEach(function (p2) {
        var s = document.createElement("span");
        s.className = p2[0];
        s.textContent = p2[1];
        d.appendChild(s);
      });
      host.appendChild(d);
    });
  }
  function shapeSvg(risk) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", risk === "good" ? "M6 1.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z" : risk === "warn" ? "M6 0.8L11.2 6L6 11.2L0.8 6z" : "M6 1L11.5 10.8H0.5z");
    p.setAttribute("fill", riskColor(risk));
    svg.appendChild(p);
    return svg;
  }
  // cols: {label, key (sort), get(row) -> {text, cls, node}}; opts: {onPick(row), isOn(row), foot, sortable}
  function table(hostId, cols, rows, opts) {
    opts = opts || {};
    var host = document.getElementById(hostId);
    var t = document.createElement("table");
    t.className = "dt";
    var hr = t.createTHead().insertRow();
    cols.forEach(function (c) {
      var th = document.createElement("th");
      th.scope = "col";
      if (opts.sortable && c.key) {
        var b = document.createElement("button");
        b.type = "button";
        var on = state.sort.key === c.key;
        b.textContent = c.label + (on ? (state.sort.dir < 0 ? " ↓" : " ↑") : "");
        if (on) th.setAttribute("aria-sort", state.sort.dir < 0 ? "descending" : "ascending");
        b.addEventListener("click", function () {
          state.sort = { key: c.key, dir: state.sort.key === c.key ? -state.sort.dir : -1 };
          render();
        });
        th.appendChild(b);
      } else th.textContent = c.label;
      hr.appendChild(th);
    });
    function fill(tr, row) {
      cols.forEach(function (c) {
        var cell = c.get(row), td = tr.insertCell();
        if (cell.node) td.appendChild(cell.node); else td.textContent = cell.text;
        if (cell.cls) td.className = cell.cls;
        if (cell.title) td.title = cell.title;
      });
    }
    var tb = t.createTBody();
    rows.forEach(function (row) {
      var tr = tb.insertRow();
      fill(tr, row);
      if (opts.onPick) {
        tr.className = "pick" + (opts.isOn && opts.isOn(row) ? " on" : "");
        tr.tabIndex = 0;
        tr.addEventListener("click", function () { opts.onPick(row); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onPick(row); } });
      }
    });
    if (opts.foot) fill(t.createTFoot().insertRow(), opts.foot);
    host.replaceChildren(t);
  }
  function txt(text, cls, title) { return { text: text, cls: cls, title: title }; }

  /* ---------- filtering ---------- */
  function F(o) {
    o = o || {};
    return { year: o.noYear ? 0 : state.year, region: o.noRegion ? "" : state.region, am: state.am,
      branch: o.noBranch ? null : state.branch, rep: o.noRep ? null : state.rep };
  }
  function sel(o) { return md.filter(F(o)); }
  function toggle(key, value) { state[key] = state[key] === value ? (key === "region" ? "" : null) : value; render(); }
  function groupStats(ms, keyFn) {
    var g = md.groupBy(ms, keyFn);
    return Object.keys(g).map(function (k) { var s = md.stats(g[k]); s.key = k; s.risk = md.riskOf(s.biggest); return s; });
  }
  // the biggest 2026 client in the selection, if it carries 5% or more of the 2026 volume
  function giantIn(ms) {
    var best = null, tot = 0;
    ms.forEach(function (x) { if (x.y !== 2026) return; tot += x.tot; if (!best || x.tot > best.tot) best = x; });
    return best && tot && best.tot / tot >= 0.05 ? best : null;
  }

  /* ---------- pages ---------- */
  var render$ = {};

  render$.overview = function () {
    var ms = sel(), s = md.stats(ms);
    setKpis("overview", [
      { lbl: "New merchants", val: fInt(s.n), sub: periodLabel() },
      { lbl: "Card volume", val: fEur(s.vol), sub: "in each merchant's signing year" },
      { lbl: "Branches signing", val: fInt(s.branches), sub: "with at least 1 new merchant" },
      { lbl: "Activation rate", val: fPct(s.tPct), sub: "transacted at least once" },
      { lbl: "Value per merchant", val: fEur(s.annual), sub: "yearly volume, on average" },
      { lbl: "Soft POS share", val: fPct(s.spPct), sub: "of new merchants" }
    ]);

    // share of volume by region (ignores the region filter so you can switch)
    var msR = sel({ noRegion: true }), totR = sum(msR, function (x) { return x.tot; });
    var regs = data.regions.map(function (r) {
      return { name: r, vol: sum(msR, function (x) { return B[x.b].region === r ? x.tot : 0; }) };
    }).filter(function (r) { return r.vol > 0; }).sort(function (a, b) { return b.vol - a.vol; });

    var text = s.n ? fInt(s.n) + " new merchants brought " + fEur(s.vol) + " of card volume (" + periodLabel() + "). " +
      fPct(s.tPct, 0) + " transacted at least once, and one new merchant is worth about " + fEur(s.annual) + " a year." : "No new merchants for this selection.";
    if (s.n && !state.region && !state.branch && regs.length > 1) text += " " + regs[0].name + " brings the largest share of volume (" + fPct(regs[0].vol / totR, 0) + ").";
    setInsight("overview", text);

    // monthly trend
    var from = state.year === 2026 ? 12 : 0, to = state.year === 2025 ? 11 : 19;
    var vol = [], cnt = [];
    for (var i = 0; i < 20; i++) { vol.push(0); cnt.push(0); }
    ms.forEach(function (x) { cnt[x.mi]++; for (var t = 0; t < x.n; t++) vol[x.mi + t] += x.vol[t]; });
    var cats = [], d25 = [], d26 = [], metric = state.trend === "vol" ? vol : cnt;
    for (i = from; i <= to; i++) {
      cats.push(MON[i].m === 1 || i === from ? MON[i].short + "\n" + MON[i].y : MON[i].short);
      d25.push(MON[i].y === 2025 ? metric[i] : null);
      d26.push(MON[i].y === 2026 ? metric[i] : null);
    }
    document.querySelector('[data-title="ov-trend"]').textContent = state.trend === "vol" ? "Monthly card volume of new merchants" : "New merchants signed per month";
    var fmt = state.trend === "vol" ? fEur : fInt;
    mount("ov-trend", s.n ? baseOpt({
      legend: legend(["2025", "2026"]),
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.08)" } },
        formatter: function (ps) {
          var p = ps.filter(function (q) { return q.value != null && q.value !== "-"; })[0];
          if (!p) return "";
          var idx = from + p.dataIndex;
          return ttHead(MON[idx].label) + ttRow(p.color, fmt(p.value), state.trend === "vol" ? "card volume" : "new merchants signed");
        } }),
      xAxis: catAxis(cats, { axisLabel: { color: T.muted, fontSize: 11, interval: narrow("ov-trend") ? "auto" : 0, lineHeight: 14, fontFamily: T.font } }),
      yAxis: valAxis(state.trend === "vol" ? axisCompactEur : null),
      series: [bar("2025", d25, T.cLast, { barGap: "-100%" }), bar("2026", d26, T.cThis, { barGap: "-100%" })]
    }) : emptyOpt());

    mount("ov-region", regs.length ? baseOpt({
      grid: { left: 14, right: 40, top: 4, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) {
        return ttHead(p.name) + ttRow(T.cThis, fPct(p.value), "of volume") + ttRow("", fEur(regs[p.dataIndex].vol), "card volume");
      } }),
      xAxis: valAxis(axisPct, { show: false, max: function (v) { return v.max * 1.15; } }),
      yAxis: catAxis(regs.map(function (r) { return r.name; }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12, fontFamily: T.font } }),
      series: [{ type: "bar", barMaxWidth: 20, data: regs.map(function (r) {
        return { value: r.vol / totR, itemStyle: { color: T.cThis, borderRadius: [0, 4, 4, 0], opacity: state.region && state.region !== r.name ? 0.3 : 1 } };
      }), label: { show: true, position: "right", color: T.ink2, fontSize: 11, formatter: function (p) { return fPct(p.value, 0); } }, cursor: "pointer" }]
    }) : emptyOpt(), function (p) { toggle("region", p.name); });

    // scorecard (ignores the year filter)
    var ms0 = sel({ noYear: true });
    var fy = md.stats(ms0.filter(function (x) { return x.y === 2025; }));
    var ly = md.sameMonths(ms0, 2025, LM), ty = md.sameMonths(ms0, 2026, LM);
    var fyRate = md.tRateMonthly(ms0, 2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    var rows = [
      { k: "New merchants signed", a: fInt(fy.n), b: fInt(ly.n), c: fInt(ty.n), d: chg(ly.n, ty.n), pp: false },
      { k: "Card volume", a: fEur(fy.vol), b: fEur(ly.vol), c: fEur(ty.vol), d: chg(ly.vol, ty.vol), pp: false },
      { k: "Monthly transacting rate", a: fPct(fyRate), b: fPct(ly.tRate), c: fPct(ty.tRate), d: ty.tRate - ly.tRate, pp: true },
      { k: "Soft POS share", a: fPct(fy.spPct), b: fPct(ly.n ? ly.sp / ly.n : null), c: fPct(ty.n ? ty.sp / ty.n : null), d: ly.n && ty.n ? ty.sp / ty.n - ly.sp / ly.n : null, pp: true },
      { k: "E-commerce share", a: fPct(fy.ecPct), b: fPct(ly.n ? ly.ec / ly.n : null), c: fPct(ty.n ? ty.ec / ty.n : null), d: ly.n && ty.n ? ty.ec / ty.n - ly.ec / ly.n : null, pp: true }
    ];
    table("ov-score", [
      { label: "KPI", get: function (r) { return txt(r.k); } },
      { label: "FY 2025", get: function (r) { return txt(r.a, "muted"); } },
      { label: "Jan–" + MN[LM - 1] + " 2025", get: function (r) { return txt(r.b); } },
      { label: "Jan–" + MN[LM - 1] + " 2026", get: function (r) { return txt(r.c); } },
      { label: "Change", get: function (r) { return txt(r.pp ? fPP(r.d) : fChg(r.d), dir(r.d)); } }
    ], rows);

    // top 10 branches by volume (ignores the branch filter)
    var bs = groupStats(sel({ noBranch: true }), function (x) { return x.b; }).sort(function (a, b) { return b.vol - a.vol; }).slice(0, 10);
    mount("ov-branches", bs.length ? baseOpt({
      grid: { left: 14, right: 52, top: 4, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) {
        var b = bs[p.dataIndex], br = B[+b.key];
        return ttHead(br.name + " · " + br.region) + ttRow(T.cThis, fEur(b.vol), "card volume") + ttRow("", fInt(b.n), "new merchants") + ttRow("", fEur(b.annual), "a year per merchant");
      } }),
      xAxis: valAxis(axisCompactEur, { show: false, max: function (v) { return v.max * 1.18; } }),
      yAxis: catAxis(bs.map(function (b) { return B[+b.key].name; }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, fontFamily: T.font } }),
      series: [{ type: "bar", barMaxWidth: 16, cursor: "pointer", data: bs.map(function (b) {
        return { value: b.vol, id: +b.key, itemStyle: { color: T.cThis, borderRadius: [0, 4, 4, 0], opacity: state.branch != null && state.branch !== +b.key ? 0.3 : 1 } };
      }), label: { show: true, position: "right", color: T.ink2, fontSize: 11, formatter: function (p) { return fEur(p.value); } } }]
    }) : emptyOpt(), function (p) { toggle("branch", p.data.id); });
  };

  render$.growth = function () {
    var ms = sel({ noYear: true }), mo = state.month;
    var ly = md.sameMonths(ms, 2025, LM, mo), ty = md.sameMonths(ms, 2026, LM, mo);
    var per = mo ? MN[mo - 1] + " 2026 vs " + MN[mo - 1] + " 2025" : "Jan–" + MN[LM - 1] + " 2026 vs Jan–" + MN[LM - 1] + " 2025";
    var dN = chg(ly.n, ty.n), dV = chg(ly.vol, ty.vol), dPM = ly.n && ty.n ? chg(ly.vol / ly.n, ty.vol / ty.n) : null, dR = ty.tRate != null && ly.tRate != null ? ty.tRate - ly.tRate : null;
    setKpis("growth", [
      { lbl: "New merchants vs last year", val: fChg(dN), cls: dir(dN), sub: fInt(ty.n) + " vs " + fInt(ly.n) },
      { lbl: "Card volume vs last year", val: fChg(dV), cls: dir(dV), sub: fEur(ty.vol) + " vs " + fEur(ly.vol) },
      { lbl: "Volume per new merchant", val: fChg(dPM), cls: dir(dPM), sub: ly.n && ty.n ? fEur(ty.vol / ty.n) + " vs " + fEur(ly.vol / ly.n) : "" },
      { lbl: "Monthly transacting rate", val: fPP(dR), cls: dir(dR), sub: fPct(ty.tRate) + " vs " + fPct(ly.tRate) }
    ]);
    var text = ly.n && ty.n ? per + ": new merchants " + fChg(dN, 0) + ", card volume " + fChg(dV, 0) + ", so volume per new merchant is " + fChg(dPM, 0) +
      ". Share transacting each month: " + fPct(ty.tRate) + " vs " + fPct(ly.tRate) + " (" + fPP(dR) + ")." : "Not enough new merchants in both years for this selection.";
    var g = giantIn(ms);
    if (g && !mo && ty.vol && g.tot / ty.vol >= 0.05) text += " Without the single biggest new client, volume growth is " + fChg(chg(ly.vol, ty.vol - md.volUpTo(g, LM)), 0) + ".";
    setInsight("growth", text);

    var months = [], sLY = [], sTY = [], vLY = [], vTY = [], rLY = [], rTY = [];
    for (var m = 1; m <= LM; m++) {
      months.push(MN[m - 1]);
      var a = 0, b = 0, va = 0, vb = 0;
      ms.forEach(function (x) {
        if (x.m === m) { if (x.y === 2025) a++; else b++; }
        var v = md.volInMonth(x, m);
        if (x.y === 2025) va += v; else vb += v;
      });
      sLY.push(a); sTY.push(b); vLY.push(va); vTY.push(vb);
      rLY.push(md.tRateMonthly(ms, 2025, [m])); rTY.push(md.tRateMonthly(ms, 2026, [m]));
    }
    function dimmed(arr, color) {
      return arr.map(function (v, i) { return { value: v, itemStyle: { color: color, borderRadius: [4, 4, 0, 0], opacity: mo && mo !== i + 1 ? 0.3 : 1 } }; });
    }
    function axisTip(fmt, what) {
      return Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.08)" } },
        formatter: function (ps) {
          var l = ps[0], t = ps[1];
          return ttHead(l.name + " · " + what) + ttRow(T.cThis, fmt(t.value), "2026") + ttRow(T.cLast, fmt(l.value), "2025") + ttRow("", fChg(chg(l.value, t.value)), "change");
        } });
    }
    function pickMonth(p) { state.month = state.month === p.dataIndex + 1 ? null : p.dataIndex + 1; render(); }
    mount("gr-sign", baseOpt({
      legend: legend(["2025", "2026"]), tooltip: axisTip(fInt, "new merchants"),
      xAxis: catAxis(months), yAxis: valAxis(null),
      series: [bar("2025", dimmed(sLY, T.cLast), T.cLast, { cursor: "pointer" }), bar("2026", dimmed(sTY, T.cThis), T.cThis, { cursor: "pointer" })]
    }), pickMonth);
    mount("gr-vol", baseOpt({
      legend: legend(["2025", "2026"]), tooltip: axisTip(fEur, "card volume"),
      xAxis: catAxis(months), yAxis: valAxis(axisCompactEur),
      series: [bar("2025", dimmed(vLY, T.cLast), T.cLast, { cursor: "pointer" }), bar("2026", dimmed(vTY, T.cThis), T.cThis, { cursor: "pointer" })]
    }), pickMonth);
    function line(name, vals, color) {
      return { name: name, type: "line", data: vals, smooth: false, showSymbol: false, symbol: "circle", symbolSize: 8,
        lineStyle: { width: 2, color: color }, itemStyle: { color: color, borderColor: T.surface, borderWidth: 2 } };
    }
    var rateSeries = [line("2025", rLY, T.cLast), line("2026", rTY, T.cThis)];
    if (mo) rateSeries[1].markLine = { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: T.axis, type: "solid", width: 1 }, data: [{ xAxis: MN[mo - 1] }] };
    mount("gr-rate", baseOpt({
      legend: legend(["2025", "2026"], true),
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "line", lineStyle: { color: T.axis } },
        formatter: function (ps) { var l = ps[0], t = ps[1]; return ttHead(l.name) + ttRow(T.cThis, fPct(t.value), "2026") + ttRow(T.cLast, fPct(l.value), "2025") + ttRow("", fPP(t.value - l.value), "gap"); } }),
      xAxis: catAxis(months, { boundaryGap: false }), yAxis: valAxis(axisPct, { min: 0 }),
      series: rateSeries
    }));

    // regions table (ignores the region filter)
    var msR = sel({ noYear: true, noRegion: true });
    var rows = data.regions.map(function (r) {
      var sub = msR.filter(function (x) { return B[x.b].region === r; });
      var a = md.sameMonths(sub, 2025, LM, mo), b = md.sameMonths(sub, 2026, LM, mo);
      return { name: r, n: b.n, dn: chg(a.n, b.n), dv: chg(a.vol, b.vol), dr: a.tRate != null && b.tRate != null ? b.tRate - a.tRate : null };
    }).filter(function (r) { return r.n > 0; });
    var ta = md.sameMonths(msR, 2025, LM, mo), tb = md.sameMonths(msR, 2026, LM, mo);
    table("gr-region", [
      { label: "Region", get: function (r) { return txt(r.name); } },
      { label: "New merchants 2026", get: function (r) { return txt(fInt(r.n)); } },
      { label: "vs 2025", get: function (r) { return txt(fChg(r.dn), dir(r.dn)); } },
      { label: "Volume vs 2025", get: function (r) { return txt(fChg(r.dv), dir(r.dv)); } },
      { label: "Transacting rate vs 2025", get: function (r) { return txt(fPP(r.dr), dir(r.dr)); } }
    ], rows, {
      onPick: function (r) { toggle("region", r.name); }, isOn: function (r) { return r.name === state.region; },
      foot: { name: "Total", n: tb.n, dn: chg(ta.n, tb.n), dv: chg(ta.vol, tb.vol), dr: tb.tRate != null && ta.tRate != null ? tb.tRate - ta.tRate : null }
    });
  };

  render$.activation = function () {
    var ms = sel(), s = md.stats(ms);
    setKpis("activation", [
      { lbl: "New merchants", val: fInt(s.n), sub: periodLabel() },
      { lbl: "Transacted at least once", val: fInt(s.active), sub: "more than €1 in a month" },
      { lbl: "Never transacted", val: fInt(s.n - s.active), sub: "signed, but no volume yet" },
      { lbl: "Activation rate", val: fPct(s.tPct), sub: "transacted / signed" }
    ]);
    var msR = sel({ noRegion: true }), avg = md.stats(msR).tPct;
    var regs = data.regions.map(function (r) {
      var st = md.stats(msR.filter(function (x) { return B[x.b].region === r; }));
      return { name: r, rate: st.tPct, n: st.n, nt: st.n - st.active };
    }).filter(function (r) { return r.n >= 100; });
    var best = regs.slice().sort(function (a, b) { return b.rate - a.rate; })[0];
    var worst = regs.slice().sort(function (a, b) { return a.rate - b.rate; })[0];
    var mostNT = regs.slice().sort(function (a, b) { return b.nt - a.nt; })[0];
    var text = s.n ? fPct(s.tPct, 0) + " of new merchants transacted at least once." : "No new merchants for this selection.";
    if (s.n && regs.length > 1 && !state.region) text += " Best region: " + best.name + " (" + fPct(best.rate, 0) + "), weakest: " + worst.name + " (" + fPct(worst.rate, 0) + "). Most merchants that never transacted: " + mostNT.name + " (" + fInt(mostNT.nt) + ").";
    if (state.year === 0) text += " To compare years, use the Growth page: 2026 merchants have had less time to start.";
    setInsight("activation", text);

    mount("ac-region", regs.length ? baseOpt({
      grid: { left: 4, right: 84, top: 24, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) {
        var r = regs[p.dataIndex];
        return ttHead(r.name) + ttRow(p.color, fPct(r.rate), r.rate >= avg ? "at or above average" : "below average") + ttRow("", fInt(r.n), "new merchants");
      } }),
      xAxis: catAxis(regs.map(function (r) { return r.name; })),
      yAxis: valAxis(axisPct, { min: 0, max: 1, interval: 0.25 }),
      series: [{ type: "bar", barMaxWidth: 34, cursor: "pointer", data: regs.map(function (r) {
        return { value: r.rate, itemStyle: { color: r.rate >= avg ? T.good : T.crit, borderRadius: [4, 4, 0, 0], opacity: state.region && state.region !== r.name ? 0.3 : 1 } };
      }), label: { show: true, position: "top", color: T.ink2, fontSize: 11, formatter: function (p) { return fPct(p.value, 0) + (p.value >= avg ? " ▲" : " ▼"); } },
      markLine: { symbol: "none", silent: true, lineStyle: { color: T.ink2, type: "solid", width: 1 }, label: { color: T.ink2, fontSize: 11, formatter: "average " + fPct(avg, 0), position: "end" }, data: [{ yAxis: avg }] } }]
    }) : emptyOpt(), function (p) { toggle("region", p.name); });

    var bs = groupStats(sel({ noBranch: true }), function (x) { return x.b; })
      .map(function (b) { b.nt = b.n - b.active; return b; }).sort(function (a, b) { return b.nt - a.nt; }).slice(0, 10);
    mount("ac-nt", bs.length ? baseOpt({
      grid: { left: 14, right: 36, top: 4, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) {
        var b = bs[p.dataIndex], br = B[+b.key];
        return ttHead(br.name + " · " + br.region) + ttRow(T.crit, fInt(b.nt), "never transacted") + ttRow("", fInt(b.n), "new merchants") + ttRow("", fPct(b.tPct), "activation rate");
      } }),
      xAxis: valAxis(null, { show: false, max: function (v) { return v.max * 1.15; } }),
      yAxis: catAxis(bs.map(function (b) { var br = B[+b.key]; return br.name + (br.seasonal ? " (seasonal)" : ""); }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, fontFamily: T.font } }),
      series: [{ type: "bar", barMaxWidth: 16, cursor: "pointer", data: bs.map(function (b) {
        return { value: b.nt, id: +b.key, itemStyle: { color: T.crit, borderRadius: [0, 4, 4, 0], opacity: state.branch != null && state.branch !== +b.key ? 0.3 : 1 } };
      }), label: { show: true, position: "right", color: T.ink2, fontSize: 11 } }]
    }) : emptyOpt(), function (p) { toggle("branch", p.data.id); });

    var from = state.year === 2026 ? 12 : 0, to = state.year === 2025 ? 11 : 19, cats = [], tA = [], nA = [];
    for (var i = from; i <= to; i++) {
      var mo = MON[i], tt = 0, nn = 0;
      ms.forEach(function (x) {
        if (x.y !== mo.y || x.mi > i) return;
        if (md.volInMonth(x, mo.m) > 1) tt++; else nn++;
      });
      cats.push(mo.m === 1 || i === from ? mo.short + "\n" + mo.y : mo.short);
      tA.push(tt); nA.push(nn);
    }
    mount("ac-monthly", s.n ? baseOpt({
      legend: legend(["Transacted that month", "Did not transact"]),
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.08)" } },
        formatter: function (ps) {
          var a = ps[0].value, b = ps[1].value, idx = from + ps[0].dataIndex;
          return ttHead(MON[idx].label + " · signed so far " + fInt(a + b)) + ttRow(T.good, fInt(a), "transacted") + ttRow(T.crit, fInt(b), "did not") + ttRow("", fPct(a + b ? a / (a + b) : null), "transacting rate");
        } }),
      xAxis: catAxis(cats, { axisLabel: { color: T.muted, fontSize: 11, interval: narrow("ac-monthly") ? "auto" : 0, lineHeight: 14, fontFamily: T.font } }),
      yAxis: valAxis(null),
      series: [
        { name: "Transacted that month", type: "bar", stack: "s", data: tA, barMaxWidth: 26, itemStyle: { color: T.good, borderColor: T.surface, borderWidth: 1 } },
        { name: "Did not transact", type: "bar", stack: "s", data: nA, barMaxWidth: 26, itemStyle: { color: T.crit, borderColor: T.surface, borderWidth: 1, borderRadius: [4, 4, 0, 0] } }
      ]
    }) : emptyOpt());
  };

  function nice125(v, up) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), c = [1, 2, 5, 10].map(function (k) { return k * p; });
    if (up) { for (var i = 0; i < c.length; i++) if (c[i] >= v) return c[i]; return c[3]; }
    for (var j = c.length - 1; j >= 0; j--) if (c[j] <= v) return c[j];
    return c[0];
  }
  function scatterOpt(rows, nameOf, isOn, extraTip, id) {
    var tight = narrow(id);
    var xs = rows.map(function (r) { return r.n; }), ys = rows.map(function (r) { return r.annual; });
    var maxVol = Math.max.apply(null, rows.map(function (r) { return r.vol; }).concat([1]));
    var medX = median(xs), medY = median(ys);
    var minX = nice125(Math.max(1, Math.min.apply(null, xs) / 1.15), false), maxX = nice125(Math.max.apply(null, xs) * 1.15, true);
    var minY = nice125(Math.max(100, Math.min.apply(null, ys) / 1.15), false), maxY = nice125(Math.max.apply(null, ys) * 1.15, true);
    var series = ["good", "warn", "crit"].map(function (k) {
      return {
        name: RISK[k].long.charAt(0).toUpperCase() + RISK[k].long.slice(1), type: "scatter", symbol: RISK[k].symbol, cursor: "pointer",
        itemStyle: { color: riskColor(k) },
        data: rows.filter(function (r) { return r.risk === k && r.annual > 0; }).map(function (r) {
          var on = isOn(r), any = isOn(null);
          return { value: [r.n, r.annual, r.vol], row: r, symbolSize: (k === "good" ? 8 : 11) + 16 * Math.sqrt(r.vol / maxVol) + (on ? 6 : 0),
            itemStyle: { color: riskColor(k), borderColor: T.surface, borderWidth: 1.5, opacity: any && !on ? 0.25 : 0.92 } };
        }),
        label: { show: k !== "good", position: "right", color: T.ink2, fontSize: 10, formatter: function (p) { return nameOf(p.data.row); } },
        emphasis: { scale: 1.2 }
      };
    });
    series[0].markLine = { symbol: "none", silent: true, lineStyle: { color: T.axis, type: "solid", width: 1 },
      label: { color: T.muted, fontSize: 10, formatter: "median", position: "insideEndTop" }, data: [{ xAxis: medX }, { yAxis: medY }] };
    return baseOpt({
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, itemGap: 14, itemStyle: { borderWidth: 0 }, textStyle: { color: T.ink2, fontSize: 11, fontFamily: T.font } },
      grid: { left: 6, right: 22, top: tight ? 58 : 34, bottom: 24, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) {
        var r = p.data.row;
        return ttHead(nameOf(r) + (extraTip ? " · " + extraTip(r) : "")) + ttRow("", fInt(r.n), "new merchants") + ttRow("", fEur(r.annual), "a year per merchant") +
          ttRow("", fEur(r.vol), "card volume") + ttRow(p.color, fPct(r.biggest, 0), "from the biggest client · " + RISK[r.risk].label);
      } }),
      xAxis: { type: "log", logBase: 10, min: minX, max: maxX, name: "New merchants signed (log scale)", nameLocation: "middle", nameGap: 26,
        nameTextStyle: { color: T.muted, fontSize: 11, fontFamily: T.font }, splitLine: { lineStyle: { color: T.line } },
        axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: { color: T.muted, fontSize: 11, formatter: function (v) { return fInt(v); } } },
      yAxis: { type: "log", logBase: 10, min: minY, max: maxY, splitLine: { lineStyle: { color: T.line } }, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: T.muted, fontSize: 11, formatter: function (v) { return fEur(v); } } },
      series: series
    });
  }

  render$.ranking = function () {
    var rows = groupStats(sel({ noBranch: true }), function (x) { return x.b; }).map(function (r) { r.id = +r.key; return r; });
    var mt = state.metric, label = { vol: "volume", n: "new merchants", t: "activation rate" }[mt];
    function val(r) { return mt === "vol" ? r.vol : mt === "n" ? r.n : r.tPct; }
    function fmt(v) { return mt === "vol" ? fEur(v) : mt === "n" ? fInt(v) : fPct(v, 0); }
    var top = rows.filter(function (r) { return mt !== "t" || r.n >= 10; }).sort(function (a, b) { return val(b) - val(a); }).slice(0, 10);
    var bottom = rows.filter(function (r) { return r.n >= 10; }).sort(function (a, b) { return val(a) - val(b); }).slice(0, 10);
    document.getElementById("rk-top-title").textContent = "Top 10 branches by " + label;
    document.getElementById("rk-bottom-title").textContent = "Bottom 10 branches by " + label;
    var totVol = sum(rows, function (r) { return r.vol; }), totN = sum(rows, function (r) { return r.n; });
    var nCrit = rows.filter(function (r) { return r.risk === "crit" && r.n >= 5; }).length;
    var text;
    if (!rows.length) text = "No new merchants for this selection.";
    else if (mt === "vol") text = (rows.length > 10 ? "The top 10 of " + rows.length + " branches deliver " + fPct(sum(top, function (r) { return r.vol; }) / totVol, 0) + " of new-merchant volume. "
        : rows.length + " branches in this selection; " + B[top[0].id].name + " leads with " + fPct(top[0].vol / totVol, 0) + " of the volume. ") +
      (nCrit ? nCrit + (nCrit === 1 ? " branch gets half or more of its volume" : " branches get half or more of their volume") + " from one merchant (red triangles)." : "No branch gets half or more of its volume from one merchant.");
    else if (mt === "n") text = (rows.length > 10 ? "The top 10 of " + rows.length + " branches" : "The " + rows.length + " branches in this selection") + " signed " + fPct(sum(top, function (r) { return r.n; }) / totN, 0) + " of all new merchants. Many merchants is not the same as valuable merchants: compare with the scatter.";
    else text = "Among branches with 10+ new merchants, activation ranges from " + fPct(bottom.length ? bottom[0].tPct : null, 0) + " to " + fPct(top.length ? top[0].tPct : null, 0) + ".";
    setInsight("ranking", text);

    function hbar(id, list, color) {
      mount(id, list.length ? baseOpt({
        grid: { left: 14, right: 48, top: 4, bottom: 2, containLabel: true },
        tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) {
          var r = list[p.dataIndex], br = B[r.id];
          return ttHead(br.name + " · " + br.region) + ttRow(color, fmt(val(r)), label) + ttRow("", fInt(r.n), "new merchants");
        } }),
        xAxis: valAxis(null, { show: false, max: function (v) { return v.max * 1.2; } }),
        yAxis: catAxis(list.map(function (r) { return B[r.id].name; }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, fontFamily: T.font } }),
        series: [{ type: "bar", barMaxWidth: 14, cursor: "pointer", data: list.map(function (r) {
          return { value: val(r), id: r.id, itemStyle: { color: color, borderRadius: [0, 4, 4, 0], opacity: state.branch != null && state.branch !== r.id ? 0.3 : 1 } };
        }), label: { show: true, position: "right", color: T.ink2, fontSize: 11, formatter: function (p) { return fmt(p.value); } } }]
      }) : emptyOpt(), function (p) { toggle("branch", p.data.id); });
    }
    hbar("rk-top", top, T.good);
    hbar("rk-bottom", bottom, T.crit);
    var sc = rows.filter(function (r) { return r.n >= 3; });
    mount("rk-scatter", sc.length ? scatterOpt(sc, function (r) { return B[r.id].name; },
      function (r) { return r ? r.id === state.branch : state.branch != null; }, function (r) { return B[r.id].region; }, "rk-scatter") : emptyOpt(),
      function (p) { if (p.data && p.data.row) toggle("branch", p.data.row.id); });
  };

  render$.products = function () {
    var ms = sel(), s = md.stats(ms);
    var ms0 = sel({ noYear: true });
    var c26 = ms0.filter(function (x) { return x.y === 2026; });
    var sp26 = c26.filter(function (x) { return x.sp; });
    var both = sp26.filter(function (x) { return x.pos; }).length;
    var posShare = c26.length ? c26.filter(function (x) { return x.pos; }).length / c26.length : null;
    setKpis("products", [
      { lbl: "Soft POS share", val: fPct(s.spPct), sub: fInt(s.sp) + " of " + fInt(s.n) + " new merchants" },
      { lbl: "E-commerce share", val: fPct(s.ecPct), sub: fInt(s.ec) + " merchants" },
      { lbl: "Physical POS, 2026", val: fPct(posShare), sub: "of 2026 new merchants" },
      { lbl: "Soft POS with a physical POS", val: fPct(sp26.length ? both / sp26.length : null), sub: "2026 Soft POS merchants" }
    ]);
    var same = state.compare === "same";
    function shares(list, sameMonths) {
      function cohort(y) { return list.filter(function (x) { return x.y === y && (!sameMonths || y === 2026 || x.m <= LM); }); }
      function share(arr, k) { return arr.length ? arr.filter(function (x) { return x[k]; }).length / arr.length : null; }
      var a = cohort(2025), b = cohort(2026);
      return { sp25: share(a, "sp"), sp26: share(b, "sp"), ec25: share(a, "ec"), ec26: share(b, "ec") };
    }
    var sh = shares(ms0, same), shSame = shares(ms0, true);
    var sub = document.getElementById("pr-share-sub");
    sub.textContent = same ? "Same months: Jan to " + MN[LM - 1] + " in both years" : "Full 2025 against Jan–" + MN[LM - 1] + " 2026: overstates growth, because Sep–Dec 2025 has almost no Soft POS recorded";
    sub.className = "viz-sub" + (same ? "" : " warn");
    var text = !c26.length ? "No 2026 merchants for this selection." : same
      ? "Soft POS share: " + fPct(sh.sp25) + " → " + fPct(sh.sp26) + " on the same months (" + (sh.sp26 / sh.sp25).toFixed(1) + "x). " + fPct(sp26.length ? both / sp26.length : null, 0) + " of 2026 Soft POS merchants also have a physical POS, so it sells as an add-on. E-commerce: " + fPct(sh.ec25) + " → " + fPct(sh.ec26) + "."
      : "On the full year Soft POS looks like " + (sh.sp26 / sh.sp25).toFixed(1) + "x (" + fPct(sh.sp25) + " → " + fPct(sh.sp26) + "), but Sep–Dec 2025 has almost no Soft POS recorded. The fair view is the same months: " + (shSame.sp26 / shSame.sp25).toFixed(1) + "x.";
    setInsight("products", text);

    var lbl25 = same ? "Jan–" + MN[LM - 1] + " 2025" : "FY 2025", lbl26 = "Jan–" + MN[LM - 1] + " 2026";
    var pctLabel = { show: true, position: "top", color: T.ink2, fontSize: 11, formatter: function (p) { return fPct(p.value); } };
    mount("pr-share", baseOpt({
      legend: legend([lbl25, lbl26]),
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.08)" } },
        formatter: function (ps) { return ttHead(ps[0].name + " share") + ttRow(T.cThis, fPct(ps[1].value), lbl26) + ttRow(T.cLast, fPct(ps[0].value), lbl25) + ttRow("", fPP(ps[1].value - ps[0].value), "change"); } }),
      xAxis: catAxis(["Soft POS", "E-commerce"]), yAxis: valAxis(axisPct, { min: 0 }),
      series: [bar(lbl25, [sh.sp25, sh.ec25], T.cLast, { barMaxWidth: 34, label: pctLabel }), bar(lbl26, [sh.sp26, sh.ec26], T.cThis, { barMaxWidth: 34, label: pctLabel })]
    }));

    var mix = [
      ["POS only", c26.filter(function (x) { return x.pos && !x.sp; }).length],
      ["POS + Soft POS", c26.filter(function (x) { return x.pos && x.sp; }).length],
      ["Soft POS only", c26.filter(function (x) { return !x.pos && x.sp; }).length],
      ["No terminal", c26.filter(function (x) { return !x.pos && !x.sp; }).length]
    ];
    mount("pr-mix", c26.length ? baseOpt({
      grid: { left: 14, right: 48, top: 4, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) { return ttHead(p.name) + ttRow(T.cThis, fPct(p.value), "of 2026 new merchants") + ttRow("", fInt(mix[p.dataIndex][1]), "merchants"); } }),
      xAxis: valAxis(axisPct, { show: false, max: 1 }),
      yAxis: catAxis(mix.map(function (r) { return r[0]; }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12, fontFamily: T.font } }),
      series: [{ type: "bar", barMaxWidth: 22, data: mix.map(function (r) { return { value: r[1] / c26.length, itemStyle: { color: T.cThis, borderRadius: [0, 4, 4, 0] } }; }),
        label: { show: true, position: "right", color: T.ink2, fontSize: 11, formatter: function (p) { return fPct(p.value, 0); } } }]
    }) : emptyOpt());

    var msR = sel({ noYear: true, noRegion: true });
    var regs = data.regions.map(function (r) { var x = shares(msR.filter(function (m) { return B[m.b].region === r; }), same); x.name = r; return x; });
    function regData(k, color) {
      return regs.map(function (r) { return { value: r[k], itemStyle: { color: color, borderRadius: [4, 4, 0, 0], opacity: state.region && state.region !== r.name ? 0.3 : 1 } }; });
    }
    mount("pr-region", baseOpt({
      legend: legend([lbl25, lbl26]),
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.08)" } },
        formatter: function (ps) { return ttHead(ps[0].name + " · Soft POS share") + ttRow(T.cThis, fPct(ps[1].value), lbl26) + ttRow(T.cLast, fPct(ps[0].value), lbl25); } }),
      xAxis: catAxis(regs.map(function (r) { return r.name; })), yAxis: valAxis(axisPct, { min: 0 }),
      series: [bar(lbl25, regData("sp25", T.cLast), T.cLast, { cursor: "pointer", label: { show: true, position: "top", color: T.muted, fontSize: 10, formatter: function (p) { return fPct(p.value, 0); } } }),
        bar(lbl26, regData("sp26", T.cThis), T.cThis, { cursor: "pointer", label: { show: true, position: "top", color: T.ink2, fontSize: 10, formatter: function (p) { return fPct(p.value, 0); } } })]
    }), function (p) { toggle("region", p.name); });
  };

  render$.reps = function () {
    var rows = groupStats(sel({ noRep: true }), function (x) { return x.r; })
      .map(function (r) { r.id = +r.key; r.name = R[r.id].name; r.team = R[r.id].am; return r; })
      .filter(function (r) { return r.n >= 10; });
    var k = state.sort.key, d = state.sort.dir;
    var keyOf = { name: function (r) { return r.name; }, team: function (r) { return r.team; }, n: function (r) { return r.n; }, vol: function (r) { return r.vol; },
      annual: function (r) { return r.annual; }, biggest: function (r) { return r.biggest; }, top2: function (r) { return r.top2; }, t: function (r) { return r.tPct; } };
    var kf = keyOf[k] || keyOf.vol;
    rows.sort(function (a, b) { var x = kf(a), y = kf(b); return (x > y ? 1 : x < y ? -1 : 0) * d; });
    var cnt = { good: 0, warn: 0, crit: 0 };
    rows.forEach(function (r) { cnt[r.risk]++; });
    setKpis("reps", [
      { lbl: "Reps with 10+ new merchants", val: fInt(rows.length), sub: periodLabel() },
      { lbl: "One-client risk", val: fInt(cnt.crit), cls: cnt.crit ? "down" : "", sub: "biggest client 50% or more" },
      { lbl: "Watch", val: fInt(cnt.warn), sub: "biggest client 25 to 50%" },
      { lbl: "Spread", val: fInt(cnt.good), cls: "up", sub: "biggest client under 25%" }
    ]);
    var red = rows.filter(function (r) { return r.risk === "crit"; }).sort(function (a, b) { return b.biggest - a.biggest; });
    var text = rows.length ? rows.length + " reps signed 10+ new merchants. " + cnt.crit + (cnt.crit === 1 ? " gets" : " get") + " half or more of their new-merchant volume from ONE merchant, " + cnt.warn + (cnt.warn === 1 ? " gets" : " get") + " 25–50%. The rest have their volume spread over many merchants." : "No rep with 10+ new merchants in this selection.";
    if (red.length) text += " " + red[0].name + ": " + fPct(red[0].biggest, 0) + " from one client. If it leaves, most of that volume goes with it.";
    setInsight("reps", text);

    function riskCell(r) {
      var span = document.createElement("span");
      span.className = "risk";
      span.appendChild(shapeSvg(r.risk));
      span.appendChild(document.createTextNode(fPct(r.biggest, 0)));
      var sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = " " + RISK[r.risk].label;
      span.appendChild(sr);
      return { node: span, title: RISK[r.risk].label + ": " + RISK[r.risk].long };
    }
    table("rp-table", [
      { label: "Rep", key: "name", get: function (r) { return txt(r.name); } },
      { label: "Team", key: "team", get: function (r) { return txt(r.team, "muted"); } },
      { label: "New merchants", key: "n", get: function (r) { return txt(fInt(r.n)); } },
      { label: "Volume", key: "vol", get: function (r) { return txt(fEur(r.vol)); } },
      { label: "Value per merchant", key: "annual", get: function (r) { return txt(fEur(r.annual)); } },
      { label: "Biggest client", key: "biggest", get: riskCell },
      { label: "Top 2 clients", key: "top2", get: function (r) { return txt(fPct(r.top2, 0)); } },
      { label: "Activation", key: "t", get: function (r) { return txt(fPct(r.tPct, 0)); } }
    ], rows, { sortable: true, onPick: function (r) { toggle("rep", r.id); }, isOn: function (r) { return r.id === state.rep; } });

    mount("rp-scatter", rows.length ? scatterOpt(rows, function (r) { return r.name; },
      function (r) { return r ? r.id === state.rep : state.rep != null; }, function (r) { return r.team; }, "rp-scatter") : emptyOpt(),
      function (p) { if (p.data && p.data.row) toggle("rep", p.data.row.id); });
  };

  /* ---------- filter bar ---------- */
  var elRegion = document.getElementById("f-region"), elAm = document.getElementById("f-am");
  function options(select, values, allLabel) {
    var o = document.createElement("option"); o.value = ""; o.textContent = allLabel; select.appendChild(o);
    values.forEach(function (v) { var x = document.createElement("option"); x.value = v; x.textContent = v; select.appendChild(x); });
  }
  function fillBPOptions() {
    elRegion.replaceChildren(); elAm.replaceChildren();
    options(elRegion, data.regions, "All");
    options(elAm, data.ams, "All");
  }
  elRegion.addEventListener("change", function () {
    state.region = elRegion.value;
    if (state.branch != null && state.region && B[state.branch].region !== state.region) state.branch = null;
    render();
  });
  elAm.addEventListener("change", function () {
    state.am = elAm.value;
    if (state.branch != null && state.am && B[state.branch].am !== state.am) state.branch = null;
    if (state.rep != null && state.am && R[state.rep].am !== state.am) state.rep = null;
    render();
  });
  document.querySelectorAll("#f-year button").forEach(function (b) {
    b.addEventListener("click", function () { state.year = +b.dataset.year; render(); });
  });
  document.getElementById("f-reset").addEventListener("click", function () {
    state.year = 0; state.region = ""; state.am = ""; state.branch = null; state.rep = null; state.month = null; render();
  });
  function bindSeg(id, key, attr) {
    document.querySelectorAll("#" + id + " button").forEach(function (b) {
      b.addEventListener("click", function () { state[key] = b.dataset[attr]; render(); });
    });
  }
  bindSeg("ov-toggle", "trend", "trend");
  bindSeg("rk-metric", "metric", "metric");
  bindSeg("pr-compare", "compare", "compare");

  function chip(label, onRemove) {
    var c = document.createElement("span");
    c.className = "fchip";
    c.appendChild(document.createTextNode(label));
    var x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "Remove filter " + label);
    x.textContent = "×";
    x.addEventListener("click", onRemove);
    c.appendChild(x);
    return c;
  }
  function syncFilters() {
    var growth = state.page === "growth";
    document.querySelectorAll("#f-year button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(+b.dataset.year === state.year));
      b.disabled = growth;
      b.title = growth ? "The Growth page always compares the same months of both years" : "";
    });
    elRegion.value = state.region;
    elAm.value = state.am;
    var chips = document.getElementById("f-chips");
    chips.replaceChildren();
    if (state.branch != null) chips.appendChild(chip(B[state.branch].name, function () { state.branch = null; render(); }));
    if (state.rep != null) chips.appendChild(chip(R[state.rep].name, function () { state.rep = null; render(); }));
    if (state.month && growth) chips.appendChild(chip("Month: " + MN[state.month - 1], function () { state.month = null; render(); }));
    document.getElementById("f-reset").disabled = !(state.year || state.region || state.am || state.branch != null || state.rep != null || state.month);
    [["ov-toggle", "trend"], ["rk-metric", "metric"], ["pr-compare", "compare"]].forEach(function (p) {
      document.querySelectorAll("#" + p[0] + " button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset[p[1]] === state[p[1]])); });
    });
  }

  /* ---------- tabs (pages and dashboards) ---------- */
  function tabKeys(buttons, onPick) {
    buttons.forEach(function (b, i) {
      b.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = buttons[(i + 1) % buttons.length];
        if (e.key === "ArrowLeft") n = buttons[(i - 1 + buttons.length) % buttons.length];
        if (n) { e.preventDefault(); onPick(n); n.focus(); }
      });
    });
  }
  var pageBtns = Array.prototype.slice.call(document.querySelectorAll("#dash-bp .page-tabs [role=tab]"));
  pageBtns.forEach(function (b) { b.addEventListener("click", function () { state.page = b.dataset.page; render(); }); });
  tabKeys(pageBtns, function (b) { state.page = b.dataset.page; render(); });
  var dashBtns = Array.prototype.slice.call(document.querySelectorAll(".dash-switch [role=tab]"));
  dashBtns.forEach(function (b) { b.addEventListener("click", function () { state.dash = b.dataset.dash; render(); }); });
  tabKeys(dashBtns, function (b) { state.dash = b.dataset.dash; render(); });

  function showEmbed(sec) {
    var frame = sec.querySelector(".embed-frame");
    if (frame.querySelector("iframe")) return;
    var f = document.createElement("iframe");
    f.title = sec.querySelector("h2").textContent + " (Tableau dashboard)";
    f.loading = "lazy";
    f.allowFullscreen = true;
    f.src = "https://public.tableau.com/views/" + sec.dataset.embed + "?:showVizHome=no&:embed=y&:toolbar=yes&:tabs=no&:display_count=no&:language=en-US";
    f.addEventListener("load", function () { var l = frame.querySelector(".loading"); if (l) l.remove(); });
    frame.appendChild(f);
  }

  /* ======================= Business Performance (rebuilt) ======================= */
  var biz = { rows: null, loading: false, error: null, years: [], segments: [], categories: [], regions: [], cities: [], subs: [] };
  var bs = { page: "overview", year: 0, seg: "", cat: "", reg: "", city: null, sub: null };
  var BANDS = ["No discount", "1–10%", "11–20%", "21–30%", "Over 30%"];
  function bandOf(d) { return d <= 0 ? 0 : d <= 0.1 ? 1 : d <= 0.2 ? 2 : d <= 0.3 ? 3 : 4; }
  function fUsd(n) {
    var a = Math.abs(n), s = n < 0 ? "−" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return s + "$" + Math.round(a / 1e3) + "K";
    if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(1) + "K";
    return s + "$" + Math.round(a);
  }
  function axisUsd(v) { return v === 0 ? "0" : fUsd(v); }
  function uniqSorted(rows, k, num) {
    var seen = {}, out = [];
    rows.forEach(function (r) { if (!seen[r[k]]) { seen[r[k]] = 1; out.push(r[k]); } });
    return out.sort(num ? function (a, b) { return a - b; } : undefined);
  }
  function listNames(arr) { return arr.length < 2 ? arr.join("") : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1]; }

  function loadBiz() {
    if (biz.loading || biz.rows) return;
    biz.loading = true;
    XlsxLite.read("data/Business_Performance_Synthetic.xlsx", { sheets: ["Orders"], dates: ["Order date", "Ship date"] }).then(function (wb) {
      biz.rows = wb.Orders.filter(function (r) { return r["Order date"] instanceof Date; }).map(function (r) {
        var od = r["Order date"], disc = +r.Discount || 0;
        return { oid: r["Order ID"], y: od.getUTCFullYear(), m: od.getUTCMonth() + 1, ship: r["Ship mode"], seg: r.Segment, city: r.City,
          reg: r.Region, cat: r.Category, sub: r["Sub-category"], sales: +r["Sales (USD)"] || 0, disc: disc, band: bandOf(disc), profit: +r["Profit (USD)"] || 0 };
      });
      biz.years = uniqSorted(biz.rows, "y", true);
      biz.segments = uniqSorted(biz.rows, "seg");
      biz.categories = uniqSorted(biz.rows, "cat");
      biz.regions = uniqSorted(biz.rows, "reg");
      biz.cities = uniqSorted(biz.rows, "city");
      biz.subs = uniqSorted(biz.rows, "sub");
      if (biz.years.indexOf(bs.year) < 0) bs.year = biz.years[biz.years.length - 1];
      if (biz.segments.indexOf(bs.seg) < 0) bs.seg = "";
      if (biz.categories.indexOf(bs.cat) < 0) bs.cat = "";
      if (biz.regions.indexOf(bs.reg) < 0) bs.reg = "";
      if (bs.city && biz.cities.indexOf(bs.city) < 0) bs.city = null;
      if (bs.sub && biz.subs.indexOf(bs.sub) < 0) bs.sub = null;
      fillBizFilters();
      render();
    }).catch(function (e) { biz.error = e.message; render(); });
  }

  function bFilter(o) {
    o = o || {};
    var y = o.year || bs.year;
    return biz.rows.filter(function (r) {
      if (r.y !== y) return false;
      if (bs.seg && !o.noSeg && r.seg !== bs.seg) return false;
      if (bs.cat && !o.noCat && r.cat !== bs.cat) return false;
      if (bs.reg && !o.noReg && r.reg !== bs.reg) return false;
      if (bs.city && !o.noCity && r.city !== bs.city) return false;
      if (bs.sub && !o.noSub && r.sub !== bs.sub) return false;
      return true;
    });
  }
  function bAgg(rows) {
    var s = { sales: 0, profit: 0, lines: rows.length, disc: 0, orders: 0 }, o = {};
    rows.forEach(function (r) { s.sales += r.sales; s.profit += r.profit; s.disc += r.disc; o[r.oid] = 1; });
    s.orders = Object.keys(o).length;
    s.margin = s.sales ? s.profit / s.sales : null;
    s.avgDisc = s.lines ? s.disc / s.lines : null;
    return s;
  }
  function bGroup(rows, k) {
    var g = {};
    rows.forEach(function (r) { (g[r[k]] = g[r[k]] || []).push(r); });
    return Object.keys(g).map(function (key) { var a = bAgg(g[key]); a.key = key; return a; });
  }
  function bToggle(key, v) { bs[key] = bs[key] === v ? (key === "city" || key === "sub" ? null : "") : v; render(); }
  function hbarOpt(list, fmtLabel, isOn, tip, rightPad) {
    return baseOpt({
      grid: { left: 14, right: rightPad || 96, top: 4, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) { return tip(list[p.dataIndex]); } }),
      xAxis: valAxis(null, { show: false, max: function (v) { return v.max * 1.05; } }),
      yAxis: catAxis(list.map(function (r) { return r.key; }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, fontFamily: T.font } }),
      series: [{ type: "bar", barMaxWidth: 18, cursor: "pointer", data: list.map(function (r) {
        return { value: r.sales, itemStyle: { color: T.cThis, borderRadius: [0, 4, 4, 0], opacity: isOn(r) === false ? 0.3 : 1 } };
      }), label: { show: true, position: "right", color: T.ink2, fontSize: 11, formatter: function (p) { return fmtLabel(list[p.dataIndex]); } } }]
    });
  }
  function tipSales(r) {
    return ttHead(r.key) + ttRow(T.cThis, fUsd(r.sales), "sales") + ttRow("", fUsd(r.profit), "profit") + ttRow("", fPct(r.margin), "margin") + ttRow("", fInt(r.orders), "orders");
  }

  var bRender = {};
  bRender.overview = function () {
    var Y = bs.year, PY = Y - 1, hasPY = biz.years.indexOf(PY) >= 0;
    var rowsC = bFilter(), rowsP = hasPY ? bFilter({ year: PY }) : [];
    var cur = bAgg(rowsC), prev = hasPY ? bAgg(rowsP) : null;
    function delta(a, b, pp, lowerIsGood) {
      if (!prev) return { sub: "first year in the data", cls: "" };
      var d = pp ? b - a : chg(a, b), c = dir(d);
      if (lowerIsGood && c) c = c === "up" ? "down" : "up";
      return { sub: (pp ? fPP(d) : fChg(d)) + " vs " + PY, cls: c };
    }
    var dS = delta(prev && prev.sales, cur.sales), dP = delta(prev && prev.profit, cur.profit), dM = delta(prev && prev.margin, cur.margin, true),
      dO = delta(prev && prev.orders, cur.orders), dD = delta(prev && prev.avgDisc, cur.avgDisc, true, true);
    setKpis("b-overview", [
      { lbl: "Sales", val: fUsd(cur.sales), sub: dS.sub, subCls: dS.cls },
      { lbl: "Profit", val: fUsd(cur.profit), sub: dP.sub, subCls: dP.cls },
      { lbl: "Profit margin", val: fPct(cur.margin), sub: dM.sub, subCls: dM.cls },
      { lbl: "Orders", val: fInt(cur.orders), sub: dO.sub, subCls: dO.cls },
      { lbl: "Average discount", val: fPct(cur.avgDisc), sub: dD.sub, subCls: dD.cls }
    ]);
    var cats = bGroup(bFilter({ noCat: true }), "cat").sort(function (a, b) { return b.sales - a.sales; });
    var cityRows = bFilter({ noCity: true });
    var cities = bGroup(cityRows, "city").sort(function (a, b) { return b.sales - a.sales; }).slice(0, 10);
    var segs = bGroup(bFilter({ noSeg: true }), "seg").sort(function (a, b) { return b.sales - a.sales; });
    var text;
    if (!cur.lines) text = "No orders for this selection.";
    else {
      text = Y + ": sales " + fUsd(cur.sales) + (prev ? " (" + fChg(chg(prev.sales, cur.sales), 0) + " vs " + PY + ")" : "") + ", profit " + fUsd(cur.profit) +
        (prev ? " (" + fChg(chg(prev.profit, cur.profit), 0) + ")" : "") + ", margin " + fPct(cur.margin) + ".";
      if (prev && cur.margin < prev.margin - 0.003 && cur.avgDisc > prev.avgDisc + 0.002) text += " The margin fell as the average discount rose to " + fPct(cur.avgDisc) + ".";
      else if (prev && cur.margin > prev.margin + 0.003) text += " The margin improved by " + fPP(cur.margin - prev.margin) + ".";
      var thin = cats.slice().sort(function (a, b) { return a.margin - b.margin; })[0];
      if (cats.length > 1 && !bs.cat) text += " " + thin.key + " has the thinnest margin (" + fPct(thin.margin) + ").";
      if (cities.length > 1 && !bs.city) text += " " + cities[0].key + " is the biggest city (" + fPct(cities[0].sales / bAgg(cityRows).sales, 0) + " of sales).";
    }
    setInsight("b-overview", text);

    document.getElementById("bz-trend-title").textContent = hasPY ? "Monthly sales, " + Y + " against " + PY : "Monthly sales, " + Y;
    var cy = [], py = [], cyP = [];
    for (var m = 1; m <= 12; m++) {
      cy.push(sum(rowsC, function (r) { return r.m === m ? r.sales : 0; }));
      cyP.push(sum(rowsC, function (r) { return r.m === m ? r.profit : 0; }));
      py.push(sum(rowsP, function (r) { return r.m === m ? r.sales : 0; }));
    }
    var series = [bar(String(Y), cy, T.cThis)];
    if (hasPY) series.unshift(bar(String(PY), py, T.cLast));
    mount("bz-trend", cur.lines ? baseOpt({
      legend: legend(hasPY ? [String(PY), String(Y)] : [String(Y)]),
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.08)" } },
        formatter: function (ps) {
          var i = ps[0].dataIndex, h = ttHead(MN[i] + " " + Y) + ttRow(T.cThis, fUsd(cy[i]), "sales " + Y);
          if (hasPY) h += ttRow(T.cLast, fUsd(py[i]), "sales " + PY) + ttRow("", fChg(chg(py[i], cy[i])), "change");
          return h + ttRow("", fUsd(cyP[i]), "profit " + Y);
        } }),
      xAxis: catAxis(MN), yAxis: valAxis(axisUsd), series: series
    }) : emptyOpt());
    mount("bz-cat", cats.length ? hbarOpt(cats, function (r) { return fUsd(r.sales) + " · " + fPct(r.margin, 0); },
      function (r) { return bs.cat ? r.key === bs.cat : null; }, tipSales) : emptyOpt(), function (p) { bToggle("cat", cats[p.dataIndex].key); });
    mount("bz-city", cities.length ? hbarOpt(cities, function (r) { return fUsd(r.sales); },
      function (r) { return bs.city ? r.key === bs.city : null; }, tipSales, 60) : emptyOpt(), function (p) { bToggle("city", cities[p.dataIndex].key); });
    mount("bz-seg", segs.length ? hbarOpt(segs, function (r) { return fUsd(r.sales) + " · " + fPct(r.margin, 0); },
      function (r) { return bs.seg ? r.key === bs.seg : null; }, tipSales) : emptyOpt(), function (p) { bToggle("seg", segs[p.dataIndex].key); });
  };

  bRender.profit = function () {
    var Y = bs.year, rows = bFilter();
    var subs = bGroup(bFilter({ noSub: true }), "sub").sort(function (x, y) { return x.profit - y.profit; });
    var losing = subs.filter(function (s) { return s.profit < 0; });
    var lossLines = rows.filter(function (r) { return r.profit < 0; });
    var lost = sum(lossLines, function (r) { return r.profit; });
    var none = bAgg(rows.filter(function (r) { return r.band === 0; })), deep = bAgg(rows.filter(function (r) { return r.disc > 0.2; }));
    setKpis("b-profit", [
      { lbl: "Sub-categories losing money", val: losing.length + " of " + subs.length, sub: losing.length ? listNames(losing.slice(0, 3).map(function (s) { return s.key; })) : "none in this selection" },
      { lbl: "Order lines sold at a loss", val: fPct(rows.length ? lossLines.length / rows.length : null), sub: fInt(lossLines.length) + " of " + fInt(rows.length) + " lines" },
      { lbl: "Profit lost on those lines", val: fUsd(lost), sub: "sum of negative profit", subCls: lost < 0 ? "down" : "" },
      { lbl: "Margin with no discount", val: fPct(none.margin), sub: deep.lines ? "vs " + fPct(deep.margin) + " above 20% off" : "no lines above 20% off", subCls: deep.margin < 0 ? "down" : "" }
    ]);
    var regs = bGroup(bFilter({ noReg: true }), "reg").sort(function (x, y) { return y.avgDisc - x.avgDisc; });
    var text = !rows.length ? "No orders for this selection." :
      (losing.length ? losing.length + " of " + subs.length + " sub-categories lose money in " + Y + ": " + listNames(losing.map(function (s) { return s.key; })) + ". " : "Every sub-category makes money in this selection. ") +
      (deep.lines && none.lines ? "Lines discounted more than 20% run at a margin of " + fPct(deep.margin, 0) + ", against " + fPct(none.margin, 0) + " with no discount." : "");
    if (rows.length && regs.length > 1 && !bs.reg) text += " " + regs[0].key + " discounts the most (average " + fPct(regs[0].avgDisc, 0) + ") and has a margin of " + fPct(regs[0].margin, 0) + ".";
    setInsight("b-profit", text);

    mount("bz-sub", subs.length ? baseOpt({
      grid: { left: 14, right: 64, top: 4, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) { var r = subs[p.dataIndex]; return ttHead(r.key) + ttRow(p.color, fUsd(r.profit), "profit") + ttRow("", fUsd(r.sales), "sales") + ttRow("", fPct(r.margin), "margin") + ttRow("", fPct(r.avgDisc), "average discount"); } }),
      xAxis: valAxis(axisUsd),
      yAxis: catAxis(subs.map(function (r) { return r.key; }), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, fontFamily: T.font } }),
      series: [{ type: "bar", barMaxWidth: 16, cursor: "pointer", data: subs.map(function (r) {
        return { value: r.profit, itemStyle: { color: r.profit < 0 ? T.dneg : T.dpos, borderRadius: r.profit < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0], opacity: bs.sub && bs.sub !== r.key ? 0.3 : 1 } };
      }), label: { show: true, position: "right", color: T.ink2, fontSize: 10, formatter: function (p) { return p.value < 0 ? "" : fUsd(p.value); } },
      markLine: { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: T.axis, type: "solid", width: 1 }, data: [{ xAxis: 0 }] } }]
    }) : emptyOpt(), function (p) { bToggle("sub", subs[p.dataIndex].key); });

    var bands = BANDS.map(function (name, i) { var x = bAgg(rows.filter(function (r) { return r.band === i; })); x.key = name; return x; });
    mount("bz-disc", rows.length ? baseOpt({
      grid: { left: 4, right: 16, top: 24, bottom: 2, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) { var r = bands[p.dataIndex]; return ttHead(r.key) + ttRow(p.color, fPct(r.margin), "margin") + ttRow("", fUsd(r.profit), "profit") + ttRow("", fUsd(r.sales), "sales") + ttRow("", fInt(r.lines), "order lines"); } }),
      xAxis: catAxis(BANDS), yAxis: valAxis(axisPct),
      series: [{ type: "bar", barMaxWidth: 48, data: bands.map(function (r) {
        return { value: r.margin, itemStyle: { color: r.margin < 0 ? T.dneg : T.dpos, borderRadius: r.margin < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0] } };
      }), label: { show: true, position: "top", color: T.ink2, fontSize: 11, formatter: function (p) { return p.value == null ? "" : fPct(p.value, 0); } },
      markLine: { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: T.axis, type: "solid", width: 1 }, data: [{ yAxis: 0 }] } }]
    }) : emptyOpt());

    var colors = {}, palette = [T.cThis, T.cLast, T.c3], catOf = {};
    biz.categories.forEach(function (c, i) { colors[c] = palette[i % 3]; });
    biz.rows.forEach(function (r) { catOf[r.sub] = r.cat; });
    var maxS = Math.max.apply(null, subs.map(function (s) { return s.sales; }).concat([1]));
    mount("bz-scatter", subs.length ? baseOpt({
      legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, itemGap: 10, itemStyle: { borderWidth: 0 }, textStyle: { color: T.ink2, fontSize: 11, fontFamily: T.font } },
      grid: { left: 4, right: 14, top: narrow("bz-scatter") ? 46 : 30, bottom: 20, containLabel: true },
      tooltip: Object.assign(baseOpt().tooltip, { trigger: "item", formatter: function (p) { var r = p.data.row; return ttHead(r.key + " · " + catOf[r.key]) + ttRow(p.color, fPct(r.margin), "margin") + ttRow("", fPct(r.avgDisc), "average discount") + ttRow("", fUsd(r.sales), "sales"); } }),
      xAxis: valAxis(axisPct, { name: "Average discount", nameLocation: "middle", nameGap: 22, nameTextStyle: { color: T.muted, fontSize: 11 } }),
      yAxis: valAxis(axisPct),
      series: biz.categories.map(function (c, i) {
        var s = { name: c, type: "scatter", cursor: "pointer", itemStyle: { color: colors[c], borderColor: T.surface, borderWidth: 1.5 },
          data: subs.filter(function (x) { return catOf[x.key] === c; }).map(function (x) {
            return { value: [x.avgDisc, x.margin], row: x, symbolSize: 8 + 22 * Math.sqrt(x.sales / maxS), itemStyle: { opacity: bs.sub && bs.sub !== x.key ? 0.25 : 0.92 } };
          }),
          label: { show: true, position: "right", color: T.ink2, fontSize: 10, formatter: function (p) { return p.data.row.margin < 0 ? p.data.row.key : ""; } },
          labelLayout: { hideOverlap: true } };
        if (i === 0) s.markLine = { symbol: "none", silent: true, label: { show: true, formatter: "break-even", color: T.muted, fontSize: 10, position: "insideEndTop" }, lineStyle: { color: T.axis, type: "solid", width: 1 }, data: [{ yAxis: 0 }] };
        return s;
      })
    }) : emptyOpt(), function (p) { if (p.data && p.data.row) bToggle("sub", p.data.row.key); });

    // region x category heatmap as a table, so the values stay readable
    var heatRows = bFilter({ noReg: true, noCat: true }), maxAbs = 0.01, grid = {};
    biz.regions.forEach(function (rg) {
      grid[rg] = {};
      biz.categories.forEach(function (c) {
        var x = bAgg(heatRows.filter(function (r) { return r.reg === rg && r.cat === c; }));
        grid[rg][c] = x;
        if (x.margin != null) maxAbs = Math.max(maxAbs, Math.abs(x.margin));
      });
    });
    var host = document.getElementById("bz-heat"), t = document.createElement("table");
    t.className = "dt heat";
    var hr = t.createTHead().insertRow();
    ["Region"].concat(biz.categories.map(function (c) { return c.replace("Office Supplies", "Office"); })).forEach(function (h) { var th = document.createElement("th"); th.textContent = h; hr.appendChild(th); });
    var tb = t.createTBody();
    biz.regions.forEach(function (rg) {
      var tr = tb.insertRow();
      tr.insertCell().textContent = rg;
      biz.categories.forEach(function (c) {
        var x = grid[rg][c], td = tr.insertCell();
        td.textContent = x.margin == null ? "–" : fPct(x.margin, 0);
        if (x.margin != null) {
          var k = Math.min(1, Math.abs(x.margin) / maxAbs), bg = mixHex(T.dmid, x.margin < 0 ? T.dneg : T.dpos, 0.15 + 0.85 * k);
          td.style.background = bg;
          td.style.color = luminance(bg) < 0.4 ? "#fff" : "#0b0b0b";
          td.title = rg + " · " + c + ": sales " + fUsd(x.sales) + ", profit " + fUsd(x.profit);
        }
        if ((bs.reg && bs.reg !== rg) || (bs.cat && bs.cat !== c)) td.style.opacity = "0.35";
      });
    });
    host.replaceChildren(t);
  };
  function hexRgb(h) {
    if (h.indexOf("rgb") === 0) return h.match(/\d+/g).slice(0, 3).map(Number);
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); });
  }
  function mixHex(a, b, t) { var p = hexRgb(a), q = hexRgb(b); return "rgb(" + p.map(function (v, i) { return Math.round(v + (q[i] - v) * t); }).join(",") + ")"; }
  function luminance(c) {
    var v = hexRgb(c).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  // business filter bar
  var bSeg = document.getElementById("b-seg"), bCat = document.getElementById("b-cat"), bReg = document.getElementById("b-reg");
  function fillBizFilters() {
    [[bSeg, biz.segments], [bCat, biz.categories], [bReg, biz.regions]].forEach(function (p) { p[0].replaceChildren(); options(p[0], p[1], "All"); });
    var yb = document.getElementById("b-year");
    yb.replaceChildren();
    biz.years.forEach(function (y) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = y; b.dataset.year = y;
      b.addEventListener("click", function () { bs.year = y; render(); });
      yb.appendChild(b);
    });
  }
  bSeg.addEventListener("change", function () { bs.seg = bSeg.value; render(); });
  bCat.addEventListener("change", function () { bs.cat = bCat.value; render(); });
  bReg.addEventListener("change", function () {
    bs.reg = bReg.value;
    if (bs.city && bs.reg && !biz.rows.some(function (r) { return r.city === bs.city && r.reg === bs.reg; })) bs.city = null;
    render();
  });
  document.getElementById("b-reset").addEventListener("click", function () {
    bs.seg = ""; bs.cat = ""; bs.reg = ""; bs.city = null; bs.sub = null; bs.year = biz.years[biz.years.length - 1]; render();
  });
  function syncBizFilters() {
    document.querySelectorAll("#b-year button").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.year === bs.year)); });
    bSeg.value = bs.seg; bCat.value = bs.cat; bReg.value = bs.reg;
    var chips = document.getElementById("b-chips");
    chips.replaceChildren();
    if (bs.city) chips.appendChild(chip(bs.city, function () { bs.city = null; render(); }));
    if (bs.sub) chips.appendChild(chip(bs.sub, function () { bs.sub = null; render(); }));
    document.getElementById("b-reset").disabled = !(bs.seg || bs.cat || bs.reg || bs.city || bs.sub || bs.year !== biz.years[biz.years.length - 1]);
  }
  var bPageBtns = Array.prototype.slice.call(document.querySelectorAll("#dash-business .page-tabs [role=tab]"));
  bPageBtns.forEach(function (b) { b.addEventListener("click", function () { bs.page = b.dataset.bpage; render(); }); });
  tabKeys(bPageBtns, function (b) { bs.page = b.dataset.bpage; render(); });
  function renderBiz() {
    var loading = document.getElementById("biz-loading");
    if (!biz.rows) {
      loading.hidden = false;
      loading.textContent = biz.error ? "Could not load the Excel data (" + biz.error + "). Please refresh the page." : "Loading the data from Excel…";
      if (!biz.error) loadBiz();
      return;
    }
    loading.hidden = true;
    bPageBtns.forEach(function (b) { var on = b.dataset.bpage === bs.page; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll("#dash-business .page").forEach(function (p) { p.hidden = p.dataset.page !== "b-" + bs.page; });
    syncBizFilters();
    bRender[bs.page]();
  }

  /* ---------- URL state ---------- */
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (DASHES.indexOf(h.get("dash")) >= 0) state.dash = h.get("dash");
    if (PAGES.indexOf(h.get("page")) >= 0) state.page = h.get("page");
    var y = +h.get("year"); state.year = y === 2025 || y === 2026 ? y : 0;
    state.region = h.get("region") || "";
    state.am = h.get("am") || "";
    state.branch = h.get("branch") !== null ? +h.get("branch") : null;
    state.rep = h.get("rep") !== null ? +h.get("rep") : null;
    if (h.get("bpage") === "profit" || h.get("bpage") === "overview") bs.page = h.get("bpage");
    bs.year = +h.get("byear") || bs.year;
    bs.seg = h.get("seg") || ""; bs.cat = h.get("cat") || ""; bs.reg = h.get("reg") || "";
    bs.city = h.get("city"); bs.sub = h.get("sub");
    if (data) validateBP();
  }
  function validateBP() {
    if (data.regions.indexOf(state.region) < 0) state.region = "";
    if (data.ams.indexOf(state.am) < 0) state.am = "";
    if (state.branch != null && !B[state.branch]) state.branch = null;
    if (state.rep != null && !R[state.rep]) state.rep = null;
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.dash === "business") {
      h.set("dash", "business");
      if (bs.page !== "overview") h.set("bpage", bs.page);
      if (biz.years.length && bs.year !== biz.years[biz.years.length - 1]) h.set("byear", bs.year);
      if (bs.seg) h.set("seg", bs.seg);
      if (bs.cat) h.set("cat", bs.cat);
      if (bs.reg) h.set("reg", bs.reg);
      if (bs.city) h.set("city", bs.city);
      if (bs.sub) h.set("sub", bs.sub);
    } else if (state.dash !== "bp") h.set("dash", state.dash);
    else {
      if (state.page !== "overview") h.set("page", state.page);
      if (state.year) h.set("year", state.year);
      if (state.region) h.set("region", state.region);
      if (state.am) h.set("am", state.am);
      if (state.branch != null) h.set("branch", state.branch);
      if (state.rep != null) h.set("rep", state.rep);
    }
    var s = h.toString();
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }

  /* ---------- render ---------- */
  function render() {
    T = theme();
    dashBtns.forEach(function (b) {
      var on = b.dataset.dash === state.dash;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
    });
    document.getElementById("dash-note").style.visibility = state.dash === "covid" ? "hidden" : "";
    if (state.dash === "covid") { showEmbed(document.getElementById("dash-covid")); writeHash(); return; }
    if (state.dash === "business") { renderBiz(); writeHash(); return; }
    document.getElementById("bp-loading").hidden = !!md;
    if (!md) return;
    if (state.page !== "growth") state.month = null;
    pageBtns.forEach(function (b) {
      var on = b.dataset.page === state.page;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll("#dash-bp .page").forEach(function (p) { p.hidden = p.dataset.page !== state.page; });
    syncFilters();
    render$[state.page]();
    writeHash();
  }

  function loadBP() {
    XlsxLite.read("data/Branch_Performance_Synthetic.xlsx", { sheets: ["Merchants", "Monthly_Volume", "Branches", "Reps"], dates: ["Signing date", "Month"] })
      .then(function (wb) { data = fromWorkbook(wb); })
      .catch(function (e) {
        if (window.console) console.warn("Excel data could not be read, using the built-in copy:", e);
        data = DemoData.generate();
        document.getElementById("dash-note-text").textContent = "Built-in copy of the Excel data";
      })
      .then(function () {
        md = DemoModel.create(data); B = data.branches; R = data.reps;
        fillBPOptions(); validateBP(); render();
      });
  }
  // rebuild the merchant records the measures expect from the four Excel tables
  function fromWorkbook(wb) {
    var regions = [], ams = [], bIdx = {}, rIdx = {}, byMid = {}, lastMi = 0;
    var branches = wb.Branches.map(function (r, i) {
      if (regions.indexOf(r.Region) < 0) regions.push(r.Region);
      bIdx[r["Branch code"]] = i;
      return { id: i, code: r["Branch code"], name: r.Branch, region: r.Region, am: r["Account manager"], seasonal: r.Seasonal === "Yes" };
    });
    var reps = wb.Reps.map(function (r, i) { if (ams.indexOf(r.Team) < 0) ams.push(r.Team); rIdx[r.Rep] = i; return { id: i, name: r.Rep, am: r.Team }; });
    function monthIndex(d) { return (d.getUTCFullYear() - 2025) * 12 + d.getUTCMonth(); }
    wb.Monthly_Volume.forEach(function (r) { if (r.Month instanceof Date) lastMi = Math.max(lastMi, monthIndex(r.Month)); });
    var merchants = wb.Merchants.filter(function (r) { return r["Signing date"] instanceof Date && bIdx[r["Branch code"]] != null; }).map(function (r, i) {
      var mi = monthIndex(r["Signing date"]), y = 2025 + Math.floor(mi / 12), n = (y === 2025 ? 11 : lastMi) - mi + 1, vol = [];
      for (var t = 0; t < n; t++) vol.push(0);
      var x = { id: i, mid: r.MID, b: bIdx[r["Branch code"]], r: rIdx[r.Rep], mi: mi, y: y, m: (mi % 12) + 1, n: n, sp: r["Soft POS"] === "Yes",
        pos: r["Physical POS"] === "Not recorded" ? null : r["Physical POS"] === "Yes", ec: r["E-commerce"] === "Yes", vol: vol, tot: 0 };
      byMid[r.MID] = x;
      return x;
    });
    wb.Monthly_Volume.forEach(function (r) {
      var x = byMid[r.MID];
      if (!x || !(r.Month instanceof Date)) return;
      var t = monthIndex(r.Month) - x.mi, v = +r["Volume (EUR)"] || 0;
      if (t >= 0 && t < x.n) { x.vol[t] += v; x.tot += v; }
    });
    return { months: MON, regions: regions, ams: ams, branches: branches, reps: reps, merchants: merchants, last: { 2025: 11, 2026: lastMi } };
  }

  readHash();
  render();
  loadBP();
  // re-measure labels once the web font is in (ECharts measures text when it draws)
  if (document.fonts) {
    var again = null;
    var redraw = function () { clearTimeout(again); again = setTimeout(render, 60); };
    if (document.fonts.ready) document.fonts.ready.then(redraw);
    if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", redraw);
  }
  window.addEventListener("hashchange", function () { readHash(); render(); });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", render);
  }
})();
