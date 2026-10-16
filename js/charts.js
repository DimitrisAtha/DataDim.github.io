/* Charts for the portfolio. Every number here is SYNTHETIC: it follows the
   patterns of the real (confidential) report, not its values. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  // Same synthetic dataset as the live dashboard (js/demo-data.js), so every page agrees
  var DEMO = window.DemoData ? DemoData.generate() : null;
  var MODEL = DEMO ? DemoModel.create(DEMO) : null;
  var DATA = { signLast: [], signThis: [], rateLast: [], rateThis: [] };
  if (MODEL) {
    for (var mo = 1; mo <= MODEL.LAST_MONTH_NO; mo++) {
      DATA.signLast.push(DEMO.merchants.filter(function (x) { return x.y === 2025 && x.m === mo; }).length);
      DATA.signThis.push(DEMO.merchants.filter(function (x) { return x.y === 2026 && x.m === mo; }).length);
      DATA.rateLast.push(Math.round(MODEL.tRateMonthly(DEMO.merchants, 2025, [mo]) * 100));
      DATA.rateThis.push(Math.round(MODEL.tRateMonthly(DEMO.merchants, 2026, [mo]) * 100));
    }
  }
  function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(function (k) { return k * p; }).filter(function (c) { return c >= v; })[0]; }
  function nice125(v, up) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), c = [1, 2, 5, 10].map(function (k) { return k * p; });
    if (up) { for (var i = 0; i < c.length; i++) if (c[i] >= v) return c[i]; return c[3]; }
    for (var j = c.length - 1; j >= 0; j--) if (c[j] <= v) return c[j];
    return c[0];
  }
  function ticks125(lo, hi) {
    var out = [];
    for (var e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) [1, 2, 5].forEach(function (k) { var v = k * Math.pow(10, e); if (v > lo * 1.01 && v < hi / 1.01) out.push(v); });
    return out;
  }
  var RISK = {
    good: { cls: "r-good", label: "Spread", long: "Biggest client under 25%" },
    warn: { cls: "r-warn", label: "Watch", long: "Biggest client 25 to 50%" },
    crit: { cls: "r-crit", label: "One-client risk", long: "Biggest client 50% or more" }
  };

  /* ---------- helpers ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(attrs, text, parent) {
    var e = el("text", attrs, parent);
    e.textContent = text;
    return e;
  }
  function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }
  function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n); }
  function fmtEur(n) { return "€" + Math.round(n / 1000) + "K"; }
  function fmtPct(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)) + "%"; }
  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Column with a 4px rounded data-end, square at the baseline
  function barPath(x, y, w, h) {
    var r = Math.min(4, h, w / 2);
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }
  function shapePath(risk, x, y, big) {
    var s = big ? 1.45 : 1;
    if (risk === "good") { var r = 4.5 * s; return "M" + (x - r) + "," + y + "a" + r + "," + r + " 0 1,0 " + 2 * r + ",0a" + r + "," + r + " 0 1,0 " + -2 * r + ",0Z"; }
    if (risk === "warn") { var d = 5.8 * s; return "M" + x + "," + (y - d) + "L" + (x + d) + "," + y + "L" + x + "," + (y + d) + "L" + (x - d) + "," + y + "Z"; }
    var t = 6.4 * s; return "M" + x + "," + (y - t) + "L" + (x + t * 0.92) + "," + (y + t * 0.62) + "L" + (x - t * 0.92) + "," + (y + t * 0.62) + "Z";
  }
  function shapeIcon(risk) {
    var svg = el("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
    el("path", { d: shapePath(risk, 8, risk === "crit" ? 9 : 8, true), class: RISK[risk].cls }, svg);
    return svg;
  }

  function makeTip(container) {
    var tip = document.createElement("div");
    tip.className = "tooltip";
    tip.setAttribute("aria-hidden", "true");
    container.appendChild(tip);
    return {
      show: function (x, y, title, rows) {
        tip.replaceChildren();
        if (title) {
          var t = document.createElement("div");
          t.className = "tt-title";
          t.textContent = title;
          tip.appendChild(t);
        }
        rows.forEach(function (r) {
          var row = document.createElement("div");
          row.className = "tt-row";
          if (r.key) {
            var k = document.createElement("i");
            k.className = "tt-key";
            k.style.background = r.key;
            row.appendChild(k);
          }
          var b = document.createElement("b");
          b.textContent = r.value;
          row.appendChild(b);
          if (r.label) {
            var s = document.createElement("span");
            s.textContent = r.label;
            row.appendChild(s);
          }
          tip.appendChild(row);
        });
        tip.classList.add("show");
        tip.classList.toggle("below", y < tip.offsetHeight + 20);
        var half = tip.offsetWidth / 2;
        var cw = container.clientWidth;
        tip.style.left = Math.min(Math.max(x, half + 2), cw - half - 2) + "px";
        tip.style.top = y + "px";
      },
      hide: function () { tip.classList.remove("show"); }
    };
  }

  // Re-render on width change only (height is set by the chart itself)
  function responsive(node, render) {
    var lastW = 0;
    function go() {
      var w = Math.floor(node.clientWidth);
      if (w && w !== lastW) { lastW = w; render(w); }
    }
    go();
    if ("ResizeObserver" in window) new ResizeObserver(go).observe(node);
    else window.addEventListener("resize", go);
  }

  function dataTable(host, head, rows) {
    var det = document.createElement("details");
    det.className = "data-table";
    var sum = document.createElement("summary");
    sum.textContent = "Show the data";
    det.appendChild(sum);
    var wrap = document.createElement("div");
    wrap.className = "tbl-scroll";
    var table = document.createElement("table");
    var thead = table.createTHead().insertRow();
    head.forEach(function (h) { var th = document.createElement("th"); th.textContent = h; thead.appendChild(th); });
    var tb = table.createTBody();
    rows.forEach(function (r) {
      var tr = tb.insertRow();
      r.forEach(function (c) { tr.insertCell().textContent = c; });
    });
    wrap.appendChild(table);
    det.appendChild(wrap);
    host.appendChild(det);
  }

  /* ---------- 1. New merchants per month: clustered columns ---------- */
  function signingsChart(host) {
    var plot = host.querySelector(".chart");
    var tip = makeTip(plot);
    responsive(plot, function (W) {
      plot.querySelectorAll("svg").forEach(function (s) { s.remove(); });
      var H = 250, m = { t: 22, r: 4, b: 26, l: 38 };
      var iw = W - m.l - m.r, ih = H - m.t - m.b;
      var max = niceMax(Math.max.apply(null, DATA.signLast.concat(DATA.signThis)) * 1.05);
      var svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "New merchants signed per month, this year against last year, January to August. Synthetic data." }, plot);
      function y(v) { return m.t + ih - (v / max) * ih; }
      [0, 0.2, 0.4, 0.6, 0.8, 1].map(function (k) { return Math.round(k * max); }).forEach(function (t) {
        el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "axis-line" : "grid-line" }, svg);
        txt({ x: m.l - 8, y: y(t) + 4, "text-anchor": "end", class: "tick" }, fmtK(t), svg);
      });
      var band = iw / MONTHS.length;
      var bw = Math.max(4, Math.min(22, (band - 10) / 2));
      var groups = el("g", {}, svg);
      var worst = 0, worstI = 0;
      MONTHS.forEach(function (mo, i) {
        var chg = (DATA.signThis[i] - DATA.signLast[i]) / DATA.signLast[i] * 100;
        if (chg < worst) { worst = chg; worstI = i; }
      });
      MONTHS.forEach(function (mo, i) {
        var cx = m.l + band * i + band / 2;
        var g = el("g", { class: "grp" }, groups);
        var vals = [["last", DATA.signLast[i], cx - bw - 1], ["this", DATA.signThis[i], cx + 1]];
        vals.forEach(function (v) {
          el("path", { d: barPath(v[2], y(v[1]), bw, ih + m.t - y(v[1])), class: "bar f-" + v[0] }, g);
        });
        txt({ x: cx, y: H - 6, "text-anchor": "middle", class: "tick" }, mo, svg);
        var chg = (DATA.signThis[i] - DATA.signLast[i]) / DATA.signLast[i] * 100;
        if (i === worstI) {
          txt({ x: cx, y: y(Math.max(DATA.signThis[i], DATA.signLast[i])) - 8, "text-anchor": "middle", class: "anno" }, fmtPct(chg), svg);
        }
        var hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: ih, class: "hit", tabindex: "0",
          "aria-label": mo + ": this year " + fmtInt(DATA.signThis[i]) + ", last year " + fmtInt(DATA.signLast[i]) + ", change " + fmtPct(chg) }, svg);
        function on() {
          groups.classList.add("dim");
          groups.querySelectorAll(".bar").forEach(function (b) { b.classList.remove("on"); });
          g.querySelectorAll(".bar").forEach(function (b) { b.classList.add("on"); });
          tip.show(cx, y(Math.max(DATA.signThis[i], DATA.signLast[i])), mo + " (synthetic)", [
            { key: "var(--s-this)", value: fmtInt(DATA.signThis[i]), label: "this year" },
            { key: "var(--s-last)", value: fmtInt(DATA.signLast[i]), label: "last year" },
            { value: fmtPct(chg), label: "change" }
          ]);
        }
        function off() { groups.classList.remove("dim"); tip.hide(); }
        hit.addEventListener("pointerenter", on);
        hit.addEventListener("pointerleave", off);
        hit.addEventListener("focus", on);
        hit.addEventListener("blur", off);
      });
    });
    dataTable(host, ["Month", "This year", "Last year", "Change"], MONTHS.map(function (mo, i) {
      return [mo, fmtInt(DATA.signThis[i]), fmtInt(DATA.signLast[i]), fmtPct((DATA.signThis[i] - DATA.signLast[i]) / DATA.signLast[i] * 100)];
    }));
  }

  /* ---------- 2. Monthly transacting rate: two lines ---------- */
  function rateChart(host) {
    var plot = host.querySelector(".chart");
    var tip = makeTip(plot);
    responsive(plot, function (W) {
      plot.querySelectorAll("svg").forEach(function (s) { s.remove(); });
      var H = 240, m = { t: 16, r: 14, b: 26, l: 38 };
      var iw = W - m.l - m.r, ih = H - m.t - m.b, max = 60;
      var svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Share of new merchants transacting each month, this year against last year. The gap narrows from 7 to 2 points. Synthetic data." }, plot);
      function x(i) { return m.l + (iw * i) / (MONTHS.length - 1); }
      function y(v) { return m.t + ih - (v / max) * ih; }
      [0, 20, 40, 60].forEach(function (t) {
        el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "axis-line" : "grid-line" }, svg);
        txt({ x: m.l - 8, y: y(t) + 4, "text-anchor": "end", class: "tick" }, t + "%", svg);
      });
      MONTHS.forEach(function (mo, i) {
        txt({ x: x(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === MONTHS.length - 1 ? "end" : "middle", class: "tick" }, mo, svg);
      });
      var cross = el("line", { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: "crosshair", opacity: 0 }, svg);
      [["last", DATA.rateLast], ["this", DATA.rateThis]].forEach(function (s) {
        var d = s[1].map(function (v, i) { return (i ? "L" : "M") + x(i) + "," + y(v); }).join("");
        el("path", { d: d, class: "line s-" + s[0] }, svg);
        var n = s[1].length - 1;
        el("circle", { cx: x(n), cy: y(s[1][n]), r: 4, class: "ring f-" + s[0] }, svg);
      });
      // the gap, annotated at both ends
      var g0 = DATA.rateLast[0] - DATA.rateThis[0], gN = DATA.rateLast[7] - DATA.rateThis[7];
      txt({ x: x(0) + 6, y: y(DATA.rateThis[0]) + 18, class: "anno" }, "gap " + g0 + " pp", svg);
      txt({ x: x(7) - 6, y: y(DATA.rateThis[7]) + 22, "text-anchor": "end", class: "anno" }, "gap " + gN + " pp", svg);
      var dots = [el("circle", { r: 4, class: "ring f-this", opacity: 0 }, svg), el("circle", { r: 4, class: "ring f-last", opacity: 0 }, svg)];
      var hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "hit", tabindex: "0",
        "aria-label": "Transacting rate by month. Use the left and right arrow keys to read each month." }, svg);
      var cur = -1;
      function show(i) {
        cur = i;
        cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
        dots[0].setAttribute("cx", x(i)); dots[0].setAttribute("cy", y(DATA.rateThis[i])); dots[0].setAttribute("opacity", 1);
        dots[1].setAttribute("cx", x(i)); dots[1].setAttribute("cy", y(DATA.rateLast[i])); dots[1].setAttribute("opacity", 1);
        tip.show(x(i), y(Math.max(DATA.rateThis[i], DATA.rateLast[i])), MONTHS[i] + " (synthetic)", [
          { key: "var(--s-this)", value: DATA.rateThis[i] + "%", label: "this year" },
          { key: "var(--s-last)", value: DATA.rateLast[i] + "%", label: "last year" },
          { value: "−" + (DATA.rateLast[i] - DATA.rateThis[i]) + " pp", label: "gap" }
        ]);
      }
      function hide() {
        cur = -1; cross.setAttribute("opacity", 0); dots[0].setAttribute("opacity", 0); dots[1].setAttribute("opacity", 0); tip.hide();
      }
      hit.addEventListener("pointermove", function (e) {
        var r = svg.getBoundingClientRect();
        var px = e.clientX - r.left;
        show(Math.max(0, Math.min(MONTHS.length - 1, Math.round(((px - m.l) / iw) * (MONTHS.length - 1)))));
      });
      hit.addEventListener("pointerleave", hide);
      hit.addEventListener("focus", function () { show(cur < 0 ? 0 : cur); });
      hit.addEventListener("blur", hide);
      hit.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { show(Math.min(MONTHS.length - 1, cur + 1)); e.preventDefault(); }
        if (e.key === "ArrowLeft") { show(Math.max(0, cur - 1)); e.preventDefault(); }
      });
    });
    dataTable(host, ["Month", "This year", "Last year", "Gap"], MONTHS.map(function (mo, i) {
      return [mo, DATA.rateThis[i] + "%", DATA.rateLast[i] + "%", "−" + (DATA.rateLast[i] - DATA.rateThis[i]) + " pp"];
    }));
  }

  /* ---------- 3. Quantity vs quality: branch scatter ---------- */
  function makeBranches() {
    var rnd = mulberry32(20261013);
    function gauss() { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    var out = [];
    for (var i = 0; i < 118; i++) {
      var n = Math.round(Math.exp(Math.log(62) + 0.85 * gauss()));
      n = Math.max(7, Math.min(480, n));
      var value = Math.exp(Math.log(36000) + 0.16 * Math.log(n / 62) + 0.33 * gauss());
      var pCrit = n < 35 ? 0.16 : n < 90 ? 0.03 : 0;
      var pWarn = n < 60 ? 0.2 : n < 160 ? 0.1 : 0.04;
      var u = rnd();
      var risk = u < pCrit ? "crit" : u < pCrit + pWarn ? "warn" : "good";
      var share = risk === "crit" ? 0.5 + 0.42 * rnd() : risk === "warn" ? 0.25 + 0.24 * rnd() : 0.03 + 0.2 * rnd();
      if (risk === "crit") value *= 3 + 1.8 * rnd();
      if (risk === "warn") value *= 1.35 + 0.5 * rnd();
      value = Math.max(15000, Math.min(270000, value));
      out.push({ name: "Branch " + String(i + 1).padStart(3, "0"), n: n, value: value, share: share, risk: risk });
    }
    return out;
  }
  var BRANCHES = MODEL ? (function () {
    var g = MODEL.groupBy(DEMO.merchants, function (x) { return x.b; });
    return Object.keys(g).map(function (k) {
      var st = MODEL.stats(g[k]);
      return { name: DEMO.branches[+k].name, n: st.n, value: st.annual, share: st.biggest, risk: MODEL.riskOf(st.biggest) };
    });
  })() : makeBranches();

  function scatter(host, opts) {
    opts = opts || {};
    var plot = host.querySelector(".chart") || host;
    var mini = !!opts.mini;
    var tip = mini ? null : makeTip(plot);
    var medN = median(BRANCHES.map(function (b) { return b.n; }));
    var medV = median(BRANCHES.map(function (b) { return b.value; }));
    var order = { good: 0, warn: 1, crit: 2 };
    var pts = BRANCHES.slice().sort(function (a, b) { return order[a.risk] - order[b.risk]; });

    responsive(plot, function (W) {
      plot.querySelectorAll("svg").forEach(function (s) { s.remove(); });
      var H = mini ? 180 : Math.round(Math.max(320, Math.min(430, W * 0.6)));
      var m = mini ? { t: 8, r: 8, b: 8, l: 8 } : { t: 14, r: 14, b: 44, l: 50 };
      var iw = W - m.l - m.r, ih = H - m.t - m.b;
      var xs = BRANCHES.map(function (b) { return b.n; }), ys = BRANCHES.map(function (b) { return b.value; });
      var xd = [nice125(Math.min.apply(null, xs) / 1.15, false), nice125(Math.max.apply(null, xs) * 1.15, true)];
      var yd = [nice125(Math.min.apply(null, ys) / 1.15, false), nice125(Math.max.apply(null, ys) * 1.15, true)];
      function x(v) { return m.l + (Math.log(v / xd[0]) / Math.log(xd[1] / xd[0])) * iw; }
      function y(v) { return m.t + ih - (Math.log(v / yd[0]) / Math.log(yd[1] / yd[0])) * ih; }
      var svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H }, plot);
      if (mini) svg.setAttribute("aria-hidden", "true");
      else {
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Scatter of branches: new merchants signed against yearly volume per merchant, shaped by how much volume comes from the biggest client. Synthetic data.");
      }
      if (!mini) {
        ticks125(xd[0], xd[1]).forEach(function (t) {
          el("line", { x1: x(t), x2: x(t), y1: m.t, y2: m.t + ih, class: "grid-line" }, svg);
          txt({ x: x(t), y: m.t + ih + 16, "text-anchor": "middle", class: "tick" }, String(t), svg);
        });
        ticks125(yd[0], yd[1]).forEach(function (t) {
          el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: "grid-line" }, svg);
          txt({ x: m.l - 8, y: y(t) + 4, "text-anchor": "end", class: "tick" }, fmtEur(t), svg);
        });
        el("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, class: "axis-line" }, svg);
        txt({ x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", class: "axis-title" }, "New merchants signed (log scale)", svg);
      }
      // median lines: half the branches on each side
      el("line", { x1: x(medN), x2: x(medN), y1: m.t, y2: m.t + ih, class: "median" }, svg);
      el("line", { x1: m.l, x2: W - m.r, y1: y(medV), y2: y(medV), class: "median" }, svg);
      if (!mini) {
        txt({ x: x(medN) + 5, y: m.t + ih - 6, class: "anno-muted" }, "median", svg);
        txt({ x: W - m.r - 2, y: y(medV) - 6, "text-anchor": "end", class: "anno-muted" }, "median", svg);
        txt({ x: W - m.r - 2, y: m.t + 12, "text-anchor": "end", class: "anno" }, "Target: many merchants, high value", svg);
        if (W > 520) txt({ x: m.l + 6, y: m.t + 12, class: "anno" }, "High average, check the biggest client", svg);
      }
      var layer = el("g", {}, svg);
      var nodes = pts.map(function (b) {
        var px = x(b.n), py = y(b.value);
        var p = el("path", { d: shapePath(b.risk, px, py, false), class: "pt ring " + RISK[b.risk].cls }, layer);
        return { b: b, x: px, y: py, el: p };
      });
      if (mini) return;
      var active = null;
      function activate(nd) {
        if (active === nd) return;
        if (active) active.el.setAttribute("d", shapePath(active.b.risk, active.x, active.y, false));
        active = nd;
        if (!nd) { tip.hide(); return; }
        nd.el.setAttribute("d", shapePath(nd.b.risk, nd.x, nd.y, true));
        layer.appendChild(nd.el);
        tip.show(nd.x, nd.y - 6, nd.b.name + " (synthetic)", [
          { value: fmtInt(nd.b.n), label: "new merchants" },
          { value: fmtEur(nd.b.value), label: "a year per merchant" },
          { value: Math.round(nd.b.share * 100) + "%", label: "from the biggest client" },
          { value: RISK[nd.b.risk].label, label: "" }
        ]);
      }
      // nearest point within 24px, so the pointer only has to be close
      svg.addEventListener("pointermove", function (e) {
        var r = svg.getBoundingClientRect();
        var px = e.clientX - r.left, py = e.clientY - r.top, best = null, bd = 24 * 24;
        nodes.forEach(function (nd) {
          var d = (nd.x - px) * (nd.x - px) + (nd.y - py) * (nd.y - py);
          if (d < bd) { bd = d; best = nd; }
        });
        activate(best);
      });
      svg.addEventListener("pointerleave", function () { activate(null); });
    });

    if (!mini && host.querySelector(".risk-row")) {
      var row = host.querySelector(".risk-row");
      ["good", "warn", "crit"].forEach(function (k) {
        var count = BRANCHES.filter(function (b) { return b.risk === k; }).length;
        var d = document.createElement("div");
        d.appendChild(shapeIcon(k));
        var t = document.createElement("p");
        var b = document.createElement("b");
        b.textContent = count + " branches";
        var s = document.createElement("span");
        s.textContent = RISK[k].label + ": " + RISK[k].long.toLowerCase();
        t.appendChild(b); t.appendChild(s);
        d.appendChild(t);
        row.appendChild(d);
      });
    }
  }

  function legendShapes(node) {
    ["good", "warn", "crit"].forEach(function (k) {
      var key = document.createElement("span");
      key.className = "key";
      key.appendChild(shapeIcon(k));
      key.appendChild(document.createTextNode(RISK[k].long));
      node.appendChild(key);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var a = document.getElementById("chart-signings");
    if (a) signingsChart(a);
    var b = document.getElementById("chart-rate");
    if (b) rateChart(b);
    var c = document.getElementById("chart-scatter");
    if (c) scatter(c);
    document.querySelectorAll("[data-legend='risk']").forEach(legendShapes);
    var h = document.getElementById("hero-scatter");
    if (h) scatter(h, { mini: true });
  });
})();
