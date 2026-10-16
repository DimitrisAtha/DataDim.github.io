/* Minimal .xlsx reader for the dashboards. It unzips the workbook with the
   browser's own DecompressionStream and turns each sheet into an array of
   objects keyed by the header row. Handles inline and shared strings, numbers
   and dates (for the columns named in opts.dates). No external library. */
(function (root) {
  "use strict";

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function zipIndex(buf) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not an .xlsx (zip) file");
    var count = u16(b, eocd + 10), off = u32(b, eocd + 16), files = {}, dec = new TextDecoder();
    for (var k = 0; k < count; k++) {
      if (u32(b, off) !== 0x02014b50) throw new Error("Damaged zip directory");
      var nameLen = u16(b, off + 28), extraLen = u16(b, off + 30), commentLen = u16(b, off + 32);
      files[dec.decode(b.subarray(off + 46, off + 46 + nameLen))] = { method: u16(b, off + 10), size: u32(b, off + 20), local: u32(b, off + 42) };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return { bytes: b, files: files };
  }

  function entry(zip, name) {
    var f = zip.files[name];
    if (!f) return Promise.resolve(null);
    var b = zip.bytes, start = f.local + 30 + u16(b, f.local + 26) + u16(b, f.local + 28);
    var data = b.subarray(start, start + f.size);
    if (f.method === 0) return Promise.resolve(new TextDecoder().decode(data));
    if (f.method !== 8) return Promise.reject(new Error("Unsupported compression in " + name));
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }

  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  function unescapeXml(s) {
    return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, function (m, e) {
      if (e.charAt(0) === "#") return String.fromCodePoint(e.charAt(1) === "x" ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENT[e];
    });
  }
  function textOf(xml) {
    var out = "", re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(xml))) out += m[1];
    return unescapeXml(out);
  }
  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  function parseSheet(xml, shared) {
    var rows = [], rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, rm, cm;
    while ((rm = rowRe.exec(xml))) {
      var row = [], body = rm[1];
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(body))) {
        var attrs = cm[1], inner = cm[2] || "";
        var ref = /\br="([A-Z]+)\d+"/.exec(attrs), typ = /\bt="([^"]+)"/.exec(attrs);
        var t = typ ? typ[1] : "n", v = null;
        if (t === "inlineStr") v = textOf(inner);
        else {
          var vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
          if (vm) v = t === "s" ? shared[+vm[1]] : t === "str" ? unescapeXml(vm[1]) : t === "b" ? vm[1] === "1" : +vm[1];
        }
        row[ref ? colIndex(ref[1]) : row.length] = v;
      }
      rows.push(row);
    }
    return rows;
  }

  function serialToDate(n) { return new Date(Math.round((n - 25569) * 86400000)); } // read with getUTC*

  function read(url, opts) {
    opts = opts || {};
    var zip;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Could not load " + url + " (HTTP " + res.status + ")");
      return res.arrayBuffer();
    }).then(function (buf) {
      zip = zipIndex(buf);
      return Promise.all([entry(zip, "xl/workbook.xml"), entry(zip, "xl/_rels/workbook.xml.rels"), entry(zip, "xl/sharedStrings.xml")]);
    }).then(function (parts) {
      var target = {};
      (parts[1].match(/<Relationship\b[^>]*>/g) || []).forEach(function (r) {
        var id = /\bId="([^"]+)"/.exec(r)[1], tg = /\bTarget="([^"]+)"/.exec(r)[1];
        target[id] = tg.charAt(0) === "/" ? tg.slice(1) : "xl/" + tg.replace(/^\.\//, "");
      });
      var shared = [];
      if (parts[2]) (parts[2].match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) { shared.push(textOf(si)); });
      var wanted = (parts[0].match(/<sheet\b[^>]*>/g) || []).map(function (s) {
        return { name: unescapeXml(/\bname="([^"]+)"/.exec(s)[1]), rid: /\br:id="([^"]+)"/.exec(s)[1] };
      }).filter(function (s) { return !opts.sheets || opts.sheets.indexOf(s.name) >= 0; });
      return Promise.all(wanted.map(function (s) { return entry(zip, target[s.rid]); })).then(function (xmls) {
        var out = {}, dates = opts.dates || [];
        wanted.forEach(function (s, i) {
          var rows = parseSheet(xmls[i] || "", shared), head = rows.shift() || [];
          out[s.name] = rows.filter(function (r) { return r.length; }).map(function (r) {
            var o = {};
            head.forEach(function (h, j) {
              var v = r[j] === undefined ? null : r[j];
              if (v !== null && typeof v === "number" && dates.indexOf(h) >= 0) v = serialToDate(v);
              o[h] = v;
            });
            return o;
          });
        });
        return out;
      });
    });
  }

  root.XlsxLite = { read: read };
})(this);
