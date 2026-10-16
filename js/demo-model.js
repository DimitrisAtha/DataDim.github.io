/* Measures for the demo, written to mirror the Power BI model's DAX:
   - each merchant counted only in its signing year
   - year-on-year always on the same months (Jan to the last loaded month)
   - "transacting" month = volume above EUR 1
   - value per merchant = volume / months observed x 12, averaged (no volume = 0) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DemoModel = factory();
})(this, function () {
  "use strict";

  var LAST_MONTH_NO = 8; // Aug 2026 is the last loaded month

  function create(data) {
    var M = data.months;

    function filter(f) {
      return data.merchants.filter(function (x) {
        var b = data.branches[x.b];
        if (f.year && x.y !== f.year) return false;
        if (f.region && b.region !== f.region) return false;
        if (f.am && b.am !== f.am) return false;
        if (f.branch != null && x.b !== f.branch) return false;
        if (f.rep != null && x.r !== f.rep) return false;
        if (f.signedUpTo && x.m > f.signedUpTo) return false;
        if (f.signMonth && x.m !== f.signMonth) return false;
        return true;
      });
    }

    // volume of a merchant in calendar months <= upto (month number), or one month only
    function volUpTo(x, upto) {
      var s = 0;
      for (var t = 0; t < x.n; t++) if (M[x.mi + t].m <= upto) s += x.vol[t];
      return s;
    }
    function volInMonth(x, mno) {
      var t = mno - x.m;
      return t >= 0 && t < x.n ? x.vol[t] : 0;
    }

    function stats(ms) {
      var s = { n: ms.length, vol: 0, active: 0, annual: 0, sp: 0, ec: 0, pos: 0, posKnown: 0, maxVol: 0, top2: 0, branches: 0 };
      var br = {}, a = 0, b2 = 0;
      ms.forEach(function (x) {
        s.vol += x.tot;
        if (x.tot > 1) s.active++;
        s.annual += (x.tot / x.n) * 12;
        if (x.sp) s.sp++;
        if (x.ec) s.ec++;
        if (x.pos !== null) { s.posKnown++; if (x.pos) s.pos++; }
        if (x.tot > a) { b2 = a; a = x.tot; } else if (x.tot > b2) b2 = x.tot;
        br[x.b] = 1;
      });
      s.branches = Object.keys(br).length;
      s.annual = s.n ? s.annual / s.n : 0;
      s.tPct = s.n ? s.active / s.n : 0;
      s.spPct = s.n ? s.sp / s.n : 0;
      s.ecPct = s.n ? s.ec / s.n : 0;
      s.biggest = s.vol ? a / s.vol : 0;
      s.top2 = s.vol ? (a + b2) / s.vol : 0;
      return s;
    }

    // Monthly transacting rate: merchants that transacted in the month / all signed so far that year
    function tRateMonthly(ms, year, months) {
      var num = 0, den = 0;
      months.forEach(function (mno) {
        ms.forEach(function (x) {
          if (x.y !== year || x.m > mno) return;
          if (year === 2026 && mno > LAST_MONTH_NO) return;
          den++;
          if (volInMonth(x, mno) > 1) num++;
        });
      });
      return den ? num / den : null;
    }

    // Same-month comparison for one cohort: signed Jan..upto, volume Jan..upto
    function sameMonths(ms, year, upto, onlyMonth) {
      var sel = ms.filter(function (x) { return x.y === year && (onlyMonth ? x.m === onlyMonth : x.m <= upto); });
      var vol = 0;
      ms.forEach(function (x) {
        if (x.y !== year) return;
        vol += onlyMonth ? volInMonth(x, onlyMonth) : volUpTo(x, upto);
      });
      var months = [];
      for (var i = 1; i <= upto; i++) if (!onlyMonth || i === onlyMonth) months.push(i);
      return { n: sel.length, vol: vol, tRate: tRateMonthly(ms, year, months), sp: sel.filter(function (x) { return x.sp; }).length, ec: sel.filter(function (x) { return x.ec; }).length };
    }

    function riskOf(share) { return share >= 0.5 ? "crit" : share >= 0.25 ? "warn" : "good"; }

    function groupBy(ms, keyFn) {
      var g = {};
      ms.forEach(function (x) { var k = keyFn(x); (g[k] = g[k] || []).push(x); });
      return g;
    }

    return {
      data: data, LAST_MONTH_NO: LAST_MONTH_NO,
      filter: filter, stats: stats, sameMonths: sameMonths, tRateMonthly: tRateMonthly,
      volInMonth: volInMonth, volUpTo: volUpTo, riskOf: riskOf, groupBy: groupBy
    };
  }

  return { create: create, LAST_MONTH_NO: LAST_MONTH_NO };
});
