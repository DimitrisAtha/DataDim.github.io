/* Synthetic merchant-level data for the Branch Performance demo.
   Deterministic (seeded), generated in the browser. It copies the SHAPE of the
   real report (same rules, same kinds of patterns), never its values or names. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DemoData = factory();
})(this, function () {
  "use strict";

  var P = {
    seed: 20261016,
    perBranch: 5.6,            // new merchants per branch per month (before factors)
    median25: 1500,            // typical monthly volume of a transacting merchant, 2025 cohort
    median26: 1900,            // 2026 cohort
    giantShare: 0.10,          // one 2026 client = this share of all 2026 new volume
    softPos25: 0.205, softPos25Gap: 0.015, softPos26: 0.425,
    k26: 1.0,                  // 2026 signing level against 2025
    d0: { 2025: 0.4, 2026: 0.18 },    // share that transact in their signing month
    ramp: { 2025: 0.6, 2026: 0.45 }   // monthly chance to start afterwards
  };

  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS = [];
  for (var i = 0; i < 20; i++) {
    var y = i < 12 ? 2025 : 2026, m = (i % 12) + 1;
    MONTHS.push({ i: i, y: y, m: m, label: MONTH_NAMES[m - 1] + " " + y, short: MONTH_NAMES[m - 1] });
  }
  var LAST = { 2025: 11, 2026: 19 }; // last observed month index per cohort (Dec 2025, Aug 2026)

  var REGIONS = [
    { name: "Metro", am: "Metro", n: 15, trend: 1.03 },
    { name: "North", am: "North", n: 10, trend: 0.95 },
    { name: "Central", am: "North", n: 8, trend: 0.94 },
    { name: "West", am: "South", n: 8, trend: 0.93 },
    { name: "South", am: "South", n: 8, trend: 0.95 },
    { name: "Islands", am: "South", n: 9, trend: 0.96 }
  ];
  var PROFILE25 = [0.95, 0.97, 1.05, 1.05, 1.08, 1.04, 1.12, 0.82, 0.95, 1.0, 1.02, 0.95];
  var F26 = [1.1, 1.14, 1.02, 0.94, 0.93, 0.92, 0.74, 0.9];
  var ISLAND_SIGN = [0.5, 0.6, 1.2, 1.6, 1.7, 1.5, 1.3, 0.8, 0.6, 0.5, 0.4, 0.4];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(opts) {
    var p = {};
    for (var k in P) p[k] = P[k];
    for (k in opts || {}) p[k] = opts[k];
    // One stream for the network and the counts (one draw per count), and a
    // separate seed per merchant, so changing one year never reshuffles the other.
    var rc = mulberry32(p.seed);
    function gaussOf(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function poisson(l) { var u = rc(), k = 0, q = Math.exp(-l), c = q; while (u > c && k < 200) { k++; q *= l / k; c += q; } return k; }

    // branches and reps
    var branches = [], reps = [];
    var repPlan = { Metro: 4, North: 4, South: 5, Enterprise: 1 };
    var repByAm = {};
    var letter = 0;
    ["Metro", "North", "South", "Enterprise"].forEach(function (am) {
      repByAm[am] = [];
      for (var r = 0; r < repPlan[am]; r++) {
        var rep = { id: reps.length, name: "Rep " + String.fromCharCode(65 + letter++), am: am };
        reps.push(rep);
        repByAm[am].push(rep.id);
      }
    });
    var rr = { Metro: 0, North: 0, South: 0, Enterprise: 0 };
    REGIONS.forEach(function (reg, ri) {
      for (var j = 0; j < reg.n; j++) {
        var enterprise = reg.name === "Metro" && j >= reg.n - 2;
        var am = enterprise ? "Enterprise" : reg.am;
        var code = (ri + 1) * 100 + j + 1;
        var b = {
          id: branches.length, code: code, name: "Branch " + code, region: reg.name, am: am,
          seasonal: reg.name === "Islands", enterprise: enterprise,
          size: enterprise ? 0.22 : Math.exp(0.5 * gaussOf(rc)), trend: reg.trend * Math.exp(0.06 * gaussOf(rc))
        };
        b.rep = repByAm[am][rr[am]++ % repByAm[am].length];
        branches.push(b);
      }
    });

    var merchants = [];
    function addMerchant(b, mi, force, salt) {
      var rnd = mulberry32((p.seed ^ (b.id * 7919 + mi * 104729 + salt * 15485863)) >>> 0);
      var gauss = function () { return gaussOf(rnd); };
      var mo = MONTHS[mi], y = mo.y, m = mo.m, last = LAST[y], n = last - mi + 1;
      var sp = y === 2025 ? rnd() < (m <= 8 ? p.softPos25 : p.softPos25Gap) : rnd() < p.softPos26;
      var pos = y === 2026 ? rnd() < (sp ? 0.96 : 0.975) : null;
      var ec = rnd() < 0.048;
      var offSeason = function (mm) { return b.seasonal && (mm >= 11 || mm <= 3); };
      var pEver = b.enterprise ? 0.9 : b.seasonal && (m >= 9 || m <= 2) ? 0.32 : 0.66;
      var vol = new Array(n);
      for (var t = 0; t < n; t++) vol[t] = 0;
      if (force || rnd() < pEver) {
        var d = rnd() < p.d0[y] ? 0 : 1 + Math.floor(Math.log(1 - rnd()) / Math.log(1 - p.ramp[y]));
        if (force) d = 0;
        var med = (y === 2025 ? p.median25 : p.median26) * Math.exp(0.35 * gauss()) * (b.enterprise ? 5 : 1);
        for (t = d; t < n; t++) {
          var mm = MONTHS[mi + t].m;
          var on = t === d ? true : rnd() < (offSeason(mm) ? 0.3 : 0.9);
          if (!on) continue;
          var amt = med * Math.exp(0.7 * gauss()) * (t === 0 ? 0.45 : 1) * (b.seasonal && !offSeason(mm) ? 1.35 : 1);
          vol[t] = Math.round(amt);
        }
      }
      var mer = { id: merchants.length, b: b.id, r: b.rep, mi: mi, y: y, m: m, n: n, sp: sp, pos: pos, ec: ec, vol: vol, tot: 0 };
      for (t = 0; t < n; t++) mer.tot += vol[t];
      merchants.push(mer);
      return mer;
    }

    branches.forEach(function (b) {
      for (var mi = 0; mi < 20; mi++) {
        var mo = MONTHS[mi];
        var lam = p.perBranch * b.size * PROFILE25[mo.m - 1] * (b.seasonal ? ISLAND_SIGN[mo.m - 1] : 1);
        if (mo.y === 2026) lam *= F26[mo.m - 1] * b.trend * p.k26;
        var k = poisson(lam);
        for (var j = 0; j < k; j++) addMerchant(b, mi, false, j);
      }
    });

    // a few small branches that live off one big client (concentration risk)
    var small = branches.filter(function (b) { return !b.enterprise && b.region !== "Metro"; })
      .sort(function (a, c) { return a.size - c.size; }).slice(0, 4);
    small.forEach(function (b, i) {
      var y = i % 2 ? 2026 : 2025;
      var others = merchants.filter(function (x) { return x.b === b.id && x.y === y; });
      var otherVol = others.reduce(function (s, x) { return s + x.tot; }, 0);
      var mer = addMerchant(b, y === 2025 ? 2 + i : 13, true, 900 + i);
      scaleTo(mer, otherVol * (1.3 + 0.5 * rc()));
    });

    // the one big 2026 client (about a tenth of the year's new volume)
    var host = branches.filter(function (b) { return b.region === "Metro" && !b.enterprise; })
      .sort(function (a, c) { return c.size - a.size; })[3];
    var v26 = merchants.filter(function (x) { return x.y === 2026; }).reduce(function (s, x) { return s + x.tot; }, 0);
    var giant = addMerchant(host, 13, true, 999);
    scaleTo(giant, v26 * p.giantShare / (1 - p.giantShare));
    giant.giant = true;

    function scaleTo(mer, total) {
      var cur = mer.tot || 1;
      mer.tot = 0;
      for (var t = 0; t < mer.n; t++) { mer.vol[t] = Math.round(mer.vol[t] * total / cur); mer.tot += mer.vol[t]; }
    }

    return { months: MONTHS, regions: REGIONS.map(function (r) { return r.name; }), ams: ["Metro", "North", "South", "Enterprise"],
      branches: branches, reps: reps, merchants: merchants, last: LAST, params: p };
  }

  return { generate: generate, MONTHS: MONTHS };
});
