/* Tabs, DAX highlighting and small page helpers */
(function () {
  "use strict";

  // Accessible tabs: [data-tabs] holds [role=tab] buttons whose aria-controls name a panel
  function initTabs(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll("[role='tab']"));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t, false); });
      t.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
  }

  // Minimal DAX highlighter for the static code samples on the case study page
  var DAX_RE = /("(?:[^"]|"")*")|(\b[A-Za-z_]\w*\[[^\]]+\])|(\[[^\]]+\])|\b(VAR|RETURN|TRUE|FALSE|NOT|DESC|ASC)\b|\b([A-Z][A-Z0-9]*)(?=\s*\()|\b(\d+(?:\.\d+)?)\b/g;
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function highlightDAX(src) {
    var nl = src.indexOf("\n");
    var first = src.slice(0, nl), rest = src.slice(nl);
    var out = "";
    var eq = first.lastIndexOf(" =");
    out += eq > 0 ? '<span class="tk-name">' + esc(first.slice(0, eq)) + "</span>" + esc(first.slice(eq)) : esc(first);
    var last = 0, m;
    DAX_RE.lastIndex = 0;
    while ((m = DAX_RE.exec(rest))) {
      out += esc(rest.slice(last, m.index));
      var cls = m[1] ? "tk-str" : m[2] ? "tk-col" : m[3] ? "tk-mea" : m[4] ? "tk-kw" : m[5] ? "tk-fn" : "tk-num";
      out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(rest.slice(last));
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-tabs]").forEach(initTabs);
    document.querySelectorAll("pre code.dax").forEach(function (c) {
      c.innerHTML = highlightDAX(c.textContent.replace(/^\n+|\s+$/g, ""));
    });
    document.querySelectorAll("[data-year]").forEach(function (n) { n.textContent = new Date().getFullYear(); });
  });
})();
