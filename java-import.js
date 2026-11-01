"use strict";
/* ===== Java import: paste a Screen class and turn it into editable layers ===== */

/* ---- tiny Java helpers ---- */
const unq = (s) =>
  s.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));

function stripJava(src) {
  let out = "",
    i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i],
      d = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      const j = src.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
function matchClose(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'") {
      j++;
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") j++;
        j++;
      }
      continue;
    }
    if (c === "(" || c === "{" || c === "[") d++;
    else if (c === ")" || c === "}" || c === "]") {
      d--;
      if (d === 0) return j;
    }
  }
  return -1;
}
function splitArgs(s) {
  const out = [];
  let cur = "",
    d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") j++;
        j++;
      }
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") d++;
    else if (c === ")" || c === "}" || c === "]") d--;
    if (c === "," && d === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function methodBody(code, name) {
  const m = new RegExp(
    "\\b(?:void|boolean)\\s+" + name + "\\s*\\([^)]*\\)\\s*(?:throws[^{]+)?\\{",
  ).exec(code);
  if (!m) return null;
  const open = m.index + m[0].length - 1,
    close = matchClose(code, open);
  return close < 0 ? null : code.slice(open + 1, close);
}
/* Split a method body into statements; flattens blocks and if-bodies, remembering the if-condition. */
function statements(body, cond = "", blk = "") {
  const out = [];
  let cur = "",
    i = 0;
  const n = body.length;
  const flush = () => {
    let t = cur.trim();
    cur = "";
    if (!t) return;
    const im = /^(?:else\s+)?if\s*\(/.exec(t);
    if (im) {
      const o = im[0].length - 1,
        c = matchClose(t, o);
      if (c > 0) {
        const cc = t.slice(o + 1, c).trim();
        cond = cond ? cond + " && " + cc : cc;
        t = t.slice(c + 1).trim();
      }
    }
    if (t) out.push({ t, cond, blk });
  };
  while (i < n) {
    const c = body[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && body[j] !== c) {
        if (body[j] === "\\") j++;
        j++;
      }
      cur += body.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[") {
      const j = matchClose(body, i);
      if (j < 0) {
        cur += body.slice(i);
        break;
      }
      cur += body.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      flush();
      i++;
      continue;
    }
    if (c === "{") {
      const j = matchClose(body, i);
      if (j < 0) break;
      const inner = body.slice(i + 1, j),
        head = cur.trim();
      if (
        head === "" ||
        /^(?:else\s+)?(?:if|for|while)\b|^(?:else|try|do)$/.test(head)
      ) {
        let nc = cond;
        const im = /^(?:else\s+)?if\s*\(/.exec(head);
        if (im) {
          const o = im[0].length - 1,
            cl = matchClose(head, o);
          if (cl > 0) {
            const cc = head.slice(o + 1, cl).trim();
            nc = cond ? cond + " && " + cc : cc;
          }
        }
        cur = "";
        out.push(...statements(inner, nc, blk + "\n" + inner));
        i = j + 1;
        continue;
      }
      cur += body.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    cur += c;
    i++;
  }
  flush();
  return out;
}

/* ---- value parsers ---- */
function jeval(expr, ctx) {
  let s = String(expr == null ? "" : expr)
    .trim()
    .replace(/\bthis\./g, "")
    .replace(/\(\s*(?:int|float|double|long)\s*\)/g, "");
  s = s.replace(/\b(left|top|leftPos|topPos|guiLeft|guiTop)\b/g, "0");
  s = s.replace(/\b([A-Za-z_]\w*)\b/g, (m) =>
    m in ctx.consts ? ctx.consts[m] : m,
  );
  s = s.replace(/(\d)[fFdDlL]\b/g, "$1");
  if (!/^[\d\s+\-*/().]+$/.test(s)) return NaN;
  try {
    const v = Function('"use strict";return (' + s + ")")();
    if (typeof v !== "number" || !isFinite(v)) return NaN;
    return /\d\.\d|\d[fFdD]\b/.test(String(expr)) ? v : Math.trunc(v);
  } catch (e) {
    return NaN;
  }
}
function jcolor(expr, ctx) {
  let e = String(expr || "").trim();
  if (ctx && /^\w+$/.test(e) && e in ctx.consts) e = String(ctx.consts[e]);
  const m = e.match(/^(-?)(0[xX][0-9a-fA-F]+|\d+)[lL]?$/);
  if (!m) return null;
  const isHex = /^0[xX]/.test(m[2]);
  let v = isHex ? parseInt(m[2], 16) : parseInt(m[2], 10);
  if (m[1]) v = -v;
  v = ((v % 4294967296) + 4294967296) % 4294967296;
  const hex = v.toString(16).padStart(8, "0"),
    hasA = isHex ? m[2].length > 8 : v > 0xffffff;
  return {
    hex: "#" + hex.slice(2),
    a: hasA ? parseInt(hex.slice(0, 2), 16) : 255,
  };
}
function textOf(a) {
  a = String(a || "").trim();
  let m = a.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (m) return unq(m[1]);
  m = a.match(
    /^(?:Component\.literal|FormattedText\.of|Component\.nullToEmpty)\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)$/,
  );
  if (m) return unq(m[1]);
  if (/^Component\.empty\s*\(\s*\)$/.test(a)) return "";
  return null;
}
function lambdaOf(a) {
  if (!a) return "// TODO";
  a = a.trim();
  const k = a.indexOf("->");
  if (k < 0) return "// TODO (" + a + ")";
  let body = a.slice(k + 2).trim();
  if (body[0] === "{")
    body = body
      .slice(1, matchClose(body, 0) < 0 ? undefined : matchClose(body, 0))
      .replace(/\s*\n\s*/g, " ")
      .trim();
  else body = body + ";";
  return body || "// TODO";
}
const lit = (a, fb) => {
  const t = textOf(a);
  return t === null ? fb : t;
};

/* ---- main parser ---- */
function parseJava(src) {
  const code = stripJava(src);
  const res = { panel: {}, elements: [], skipped: [], bg: false };
  const ctx = { consts: {}, tex: {}, locals: new Set() };
  const VAL = "-?(?:0[xX][0-9a-fA-F]+|\\d+)[lL]?";
  for (const m of code.matchAll(
    new RegExp(
      "\\bint\\s+(\\w+\\s*=\\s*" +
        VAL +
        "(?:\\s*,\\s*\\w+\\s*=\\s*" +
        VAL +
        ")*)\\s*;",
      "g",
    ),
  ))
    m[1].split(",").forEach((p) => {
      const kv = p.split("=");
      const v = kv[1].trim().replace(/[lL]$/, "");
      ctx.consts[kv[0].trim()] =
        Number(v.replace(/^-0x/i, "-0x")) ||
        (/^-?0x/i.test(v) ? parseInt(v, 16) : 0);
    });
  for (const m of code.matchAll(
    /\bResourceLocation\s+(\w+)\s*=\s*new\s+ResourceLocation\s*\(([^;]*?)\)\s*;/g,
  )) {
    const a = splitArgs(m[2]).map(textOf);
    if (a[0] != null)
      ctx.tex[m[1]] = a.length > 1 && a[1] != null ? a[0] + ":" + a[1] : a[0];
  }
  const imports = {};
  for (const m of code.matchAll(/import\s+([\w.]+)\s*;/g))
    imports[m[1].split(".").pop()] = m[1];
  const P = res.panel;
  const pk = code.match(/package\s+([\w.]+)\s*;/);
  if (pk) P.pkg = pk[1];
  const cm = code.match(/class\s+(\w+)\s+extends\s+[\w<>.]+/);
  if (cm) P.className = cm[1];
  if (cm) {
    const ct = new RegExp("\\b" + cm[1] + "\\s*\\(([^)]*)\\)\\s*\\{").exec(
      code,
    );
    if (ct && ct[1].trim()) {
      const w = splitArgs(ct[1])[0].trim().split(/\s+/),
        type = w[w.length - 2];
      if (
        type &&
        /^[A-Z]/.test(type) &&
        !/^(Component|Inventory|String|Integer|Boolean)$|Menu$/.test(type)
      )
        P.machine = imports[type] || type;
    }
  }
  const tt = code.match(
    /super\s*\(\s*Component\.(?:literal|translatable)\s*\(\s*"((?:[^"\\]|\\.)*)"/,
  );
  if (tt) P.title = unq(tt[1]);
  const ps = code.match(/isPauseScreen\s*\(\s*\)\s*\{\s*return\s+(true|false)/);
  if (ps) P.pause = ps[1] === "true";
  if (/void\s+tick\s*\(\s*\)\s*\{[^}]*onClose/.test(code))
    P.closeInvalid = true;
  const cw = ["W", "WIDTH", "imageWidth"].find((k) => k in ctx.consts),
    ch = ["H", "HEIGHT", "imageHeight"].find((k) => k in ctx.consts);
  if (cw) P.w = ctx.consts[cw];
  if (ch) P.h = ctx.consts[ch];

  const renderBody = methodBody(code, "render"),
    initBody = methodBody(code, "init");
  if (renderBody == null && initBody == null) {
    res.skipped.push("No render() or init() method found.");
    return res;
  }
  const out = [],
    skip = (t) => res.skipped.push(t.replace(/\s+/g, " ").slice(0, 90));
  const ev = (a) => jeval(a, ctx),
    ok = (...v) => v.every((x) => !isNaN(x));
  const tern = (a) => {
    const m = String(a || "")
      .trim()
      .match(/^[\s\S]+?\?\s*([\w.]+)\s*:\s*([\w.]+)$/);
    return m ? (jcolor(m[1], ctx) ? m[1] : m[2]) : a;
  };
  const col = (a, def = "#ffffff") =>
    jcolor(tern(a), ctx) || { hex: def, a: 255 };
  const sampleOf = (a) => {
    const ls = [...String(a).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => unq(m[1]))
      .sort((p, q) => q.length - p.length);
    return ls.length
      ? ls[0]
          .replace(/%%/g, "\u0001")
          .replace(/%[-+0-9.]*[a-zA-Z]/g, "0")
          .replace(/\u0001/g, "%")
      : "123";
  };
  const setVar = (n, init) => {
    ctx.locals.add(n);
    if (init == null) {
      delete ctx.consts[n];
      return;
    }
    if (/^\(\s*(?:this\.)?(?:width|height)\s*-/.test(init.trim())) {
      ctx.consts[n] = 0;
      return;
    }
    const v = jeval(init, ctx);
    if (isNaN(v)) delete ctx.consts[n];
    else ctx.consts[n] = v;
  };
  const texPath = (a) => {
    a = String(a || "").trim();
    if (a in ctx.tex) return ctx.tex[a];
    const m = a.match(/^new\s+ResourceLocation\s*\(([^)]*)\)$/);
    if (m) {
      const p = splitArgs(m[1]).map(textOf);
      if (p[0] != null)
        return p.length > 1 && p[1] != null ? p[0] + ":" + p[1] : p[0];
    }
    return null;
  };

  /* ---- render() ---- */
  let pT = null,
    pS = 1,
    sawDim = false,
    prog = null;
  const IGN =
    /^(?:(?:final\s+)?(?:var|int|float|double|long|boolean|String|Item|ItemStack|ResourceLocation|Component)\s+\w+\s*=|RenderSystem\.|super\.|return\b|(?:this\.)?renderBackground\b)/;
  for (const s of renderBody ? statements(renderBody) : []) {
    const t = s.t;
    if (/^(?:this\.)?renderBackground\s*\(/.test(t)) {
      sawDim = true;
      continue;
    }
    const pm = t.match(/\.pose\(\)\.(\w+)\s*\(/);
    if (pm) {
      const o = t.indexOf("(", pm.index + pm[0].length - 1),
        a = splitArgs(t.slice(o + 1, matchClose(t, o)));
      if (pm[1] === "translate") {
        const x = ev(a[0]),
          y = ev(a[1]);
        if (ok(x, y)) pT = [x, y];
      } else if (pm[1] === "scale") {
        const sc = ev(a[0]);
        if (ok(sc)) pS = sc;
      } else if (pm[1] === "popPose") {
        pT = null;
        pS = 1;
      }
      continue;
    }
    const pg = t.match(
      /^int\s+(\w+)\s*=\s*\(int\)\s*\(\s*[\w.]+\s*\*\s*(?:\w+\.)?ratio\s*\(([\s\S]*)\)\s*\)$/,
    );
    if (pg) {
      const ra = splitArgs(pg[2]);
      prog = { name: pg[1], cur: ra[0], max: ra[1] };
      continue;
    }
    const dm = t.match(/^(?:final\s+)?int\s+([\s\S]+)$/);
    if (dm) {
      splitArgs(dm[1]).forEach((p) => {
        const kv = p.match(/^(\w+)\s*(?:=\s*([\s\S]+))?$/);
        if (kv) setVar(kv[1], kv[2]);
      });
      continue;
    }
    const am = t.match(/^(\w+)\s*(\+=|-=|\*=|\/=|=)\s*([\s\S]+)$/);
    if (am && (am[1] in ctx.consts || ctx.locals.has(am[1]))) {
      if (am[2] === "=") setVar(am[1], am[3]);
      else {
        const v =
          am[1] in ctx.consts
            ? jeval(am[1] + " " + am[2][0] + " (" + am[3] + ")", ctx)
            : NaN;
        if (isNaN(v)) delete ctx.consts[am[1]];
        else ctx.consts[am[1]] = v;
      }
      continue;
    }
    if (prog && /^(?:[\w.]+\.)?fill\s*\(/.test(t)) {
      const o = t.indexOf("("),
        fa = splitArgs(t.slice(o + 1, matchClose(t, o)));
      if (
        new RegExp("\\b" + prog.name + "\\b").test(fa.slice(0, 4).join(" ")) &&
        out.length &&
        out[out.length - 1].type === "rect"
      ) {
        const bgr = out.pop(),
          c = col(fa[4]);
        out.push({
          type: "progress",
          x: bgr.x,
          y: bgr.y,
          w: bgr.w,
          h: bgr.h,
          color: c.hex,
          color2: bgr.color,
          cur: prog.cur,
          max: prog.max,
          dir: prog.name === "fh" ? "vertical" : "horizontal",
          pv: 60,
        });
        prog = null;
        continue;
      }
    }
    if (IGN.test(t)) continue;
    const m = t.match(
      /^(?:[\w.]+\.)?(fill|fillGradient|renderOutline|drawString|drawCenteredString|drawWordWrap|blit|renderItem|renderItemDecorations|renderTooltip|renderEntityInInventoryFollowsMouse|hLine|vLine)\s*\(/,
    );
    if (!m) {
      skip(t);
      continue;
    }
    const open = m[0].length - 1,
      close = matchClose(t, open),
      a = splitArgs(t.slice(open + 1, close));
    switch (m[1]) {
      case "fill": {
        const [x1, y1, x2, y2] = a.slice(0, 4).map(ev),
          c = col(a[4]);
        const pv = out[out.length - 1];
        if (
          a.length >= 5 &&
          pv &&
          pv.type === "rect" &&
          ok(x1, y1, y2) &&
          isNaN(x2) &&
          x1 === pv.x &&
          y1 === pv.y &&
          y2 === pv.y + pv.h
        ) {
          const rm = a[2].match(
            /\(\s*int\s*\)\s*\(\s*\w+\s*\*\s*\(?\s*([\s\S]+?)\s*\/\s*\(\s*float\s*\)\s*([\w.]+(?:\(\))?)\s*\)?\s*\)/,
          );
          out.pop();
          out.push({
            type: "progress",
            x: pv.x,
            y: pv.y,
            w: pv.w,
            h: pv.h,
            color: c.hex,
            color2: pv.color,
            cur: rm ? rm[1] : "machine.getProgress()",
            max: rm ? rm[2] : "machine.getMaxProgress()",
            dir: "horizontal",
            pv: 60,
          });
          break;
        }
        if (!ok(x1, y1, x2, y2) || a.length < 5) {
          skip(t);
          break;
        }
        const w = Math.abs(x2 - x1),
          h = Math.abs(y2 - y1),
          x = Math.min(x1, x2),
          y = Math.min(y1, y2);
        const isBg =
          !res.bg &&
          x === 0 &&
          y === 0 &&
          (cw && ch ? w === P.w && h === P.h : true);
        if (isBg) {
          res.bg = true;
          P.bg = c.hex;
          P.bgA = c.a;
          if (!(cw && ch)) {
            P.w = w;
            P.h = h;
          }
          break;
        }
        out.push({ type: "rect", x, y, w, h, color: c.hex, alpha: c.a });
        break;
      }
      case "fillGradient": {
        const [x1, y1, x2, y2] = a.slice(0, 4).map(ev),
          c1 = col(a[4]),
          c2 = col(a[5]);
        if (!ok(x1, y1, x2, y2)) {
          skip(t);
          break;
        }
        out.push({
          type: "gradient",
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
          color: c1.hex,
          alpha: c1.a,
          color2: c2.hex,
          alpha2: c2.a,
        });
        break;
      }
      case "hLine":
      case "vLine": {
        const v = a.slice(0, 3).map(ev),
          c = col(a[3]);
        if (!ok(...v)) {
          skip(t);
          break;
        }
        out.push(
          m[1] === "hLine"
            ? {
                type: "rect",
                x: Math.min(v[0], v[1]),
                y: v[2],
                w: Math.abs(v[1] - v[0]) + 1,
                h: 1,
                color: c.hex,
                alpha: c.a,
              }
            : {
                type: "rect",
                x: v[0],
                y: Math.min(v[1], v[2]),
                w: 1,
                h: Math.abs(v[2] - v[1]) + 1,
                color: c.hex,
                alpha: c.a,
              },
        );
        break;
      }
      case "renderOutline": {
        const [x, y, w, h] = a.slice(0, 4).map(ev),
          c = col(a[4]);
        if (!ok(x, y, w, h)) {
          skip(t);
          break;
        }
        if (x === 0 && y === 0 && w === P.w && h === P.h) {
          P.borderOn = true;
          P.border = c.hex;
        } else
          out.push({ type: "outline", x, y, w, h, color: c.hex, alpha: c.a });
        break;
      }
      case "drawString":
      case "drawCenteredString": {
        let x = ev(a[2]),
          y = ev(a[3]);
        const center = m[1] === "drawCenteredString",
          c = col(a[4]),
          sc = pT ? pS : 1;
        if (pT) {
          x = pT[0];
          y = pT[1];
        }
        if (!ok(x, y) || a.length < 5) {
          skip(t);
          break;
        }
        const txt = textOf(a[1]);
        out.push({
          type: "text",
          x,
          y,
          text: txt === null ? "Text" : txt,
          dynamic: txt === null,
          expr: txt === null ? a[1] : "machine.getSomething()",
          sample: txt === null ? sampleOf(a[1]) : "123",
          color: c.hex,
          shadow: !center && String(a[5]).trim() === "true",
          align: center ? "center" : "left",
          scale: sc,
        });
        break;
      }
      case "drawWordWrap": {
        const x = ev(a[2]),
          y = ev(a[3]),
          w = ev(a[4]),
          c = col(a[5]);
        if (!ok(x, y, w)) {
          skip(t);
          break;
        }
        out.push({
          type: "wraptext",
          x,
          y,
          w,
          text: lit(a[1], "Text"),
          color: c.hex,
        });
        break;
      }
      case "blit": {
        const path = texPath(a[0]);
        const n = a.slice(1).map(ev);
        if (!path || n.length < 6 || !ok(...n.slice(0, 6))) {
          skip(t);
          break;
        }
        out.push({
          type: "texture",
          x: n[0],
          y: n[1],
          u: n[2],
          v: n[3],
          w: n[4],
          h: n[5],
          texW: ok(n[6]) ? n[6] : 256,
          texH: ok(n[7]) ? n[7] : 256,
          path,
          imgData: "",
        });
        break;
      }
      case "renderItem": {
        const x = ev(a[1]),
          y = ev(a[2]);
        if (!ok(x, y)) {
          skip(t);
          break;
        }
        const whole = t + "\n" + s.blk;
        let id = null;
        const rl = whole.match(/new\s+ResourceLocation\s*\(\s*"([^"]+)"/),
          it = whole.match(/\bItems\.(\w+)/);
        if (rl) id = rl[1];
        else if (it) id = "minecraft:" + it[1].toLowerCase();
        const cn = /new\s+ItemStack\s*\(/.exec(whole);
        let count = 1;
        if (cn) {
          const o = cn.index + cn[0].length - 1,
            c2 = matchClose(whole, o);
          if (c2 > 0) {
            const ia = splitArgs(whole.slice(o + 1, c2));
            if (ia[1] != null) {
              const k = ev(ia[1]);
              if (ok(k)) count = k;
            }
          }
        }
        if (!id) {
          skip(t);
          break;
        }
        out.push({ type: "item", x, y, itemId: id, count });
        break;
      }
      case "renderItemDecorations":
        break;
      case "renderEntityInInventoryFollowsMouse": {
        const x = ev(a[1]),
          y = ev(a[2]),
          sc = ev(a[3]);
        if (!ok(x, y, sc)) {
          skip(t);
          break;
        }
        out.push({ type: "entity", x, y, scale: sc });
        break;
      }
      case "renderTooltip": {
        const bnd = { X: [], Y: [] };
        (s.cond || "").split("&&").forEach((p) => {
          const mm = p.trim().match(/^mouse([XY])\s*(>=|>|<=|<)\s*(.+)$/);
          if (mm) {
            const v = ev(mm[3]);
            if (ok(v)) bnd[mm[1]].push(v);
          }
        });
        if (bnd.X.length < 2 || bnd.Y.length < 2) {
          skip(t);
          break;
        }
        const x = Math.min(...bnd.X),
          y = Math.min(...bnd.Y);
        out.push({
          type: "tooltip",
          x,
          y,
          w: Math.max(...bnd.X) - x,
          h: Math.max(...bnd.Y) - y,
          tooltip: lit(a[1], "Tooltip"),
        });
        break;
      }
    }
  }

  /* Recognize the vanilla bevel (5 fills) as Panel / Slot */
  const STY = {
    container: ["#c6c6c6", "#ffffff", "#555555"],
    inset: ["#8b8b8b", "#373737", "#ffffff"],
  };
  for (let i = 0; i + 4 < out.length; i++) {
    const b = out[i];
    if (b.type !== "rect" || b.alpha !== 255) continue;
    const sty = Object.keys(STY).find((k) => STY[k][0] === b.color);
    if (!sty) continue;
    const [, hi, lo] = STY[sty],
      q = out.slice(i + 1, i + 5),
      bw = q[0].h;
    if (q.some((r) => r.type !== "rect" || r.alpha !== 255)) continue;
    if (!(
      q[0].color === hi &&
      q[1].color === hi &&
      q[2].color === lo &&
      q[3].color === lo
    ))
      continue;
    if (!(
      q[0].x === b.x &&
      q[0].y === b.y &&
      q[0].w === b.w - bw &&
      q[1].x === b.x &&
      q[1].y === b.y &&
      q[1].w === bw &&
      q[1].h === b.h - bw &&
      q[2].x === b.x + bw &&
      q[2].y === b.y + b.h - bw &&
      q[2].w === b.w - bw &&
      q[2].h === bw &&
      q[3].x === b.x + b.w - bw &&
      q[3].y === b.y + bw &&
      q[3].w === bw &&
      q[3].h === b.h - bw
    ))
      continue;
    if (sty === "inset" && b.w === 18 && b.h === 18 && bw === 1) {
      const nx = out[i + 5],
        slot = { type: "slot", x: b.x, y: b.y, itemId: "", count: 1 };
      let drop = 5;
      if (nx && nx.type === "item" && nx.x === b.x + 1 && nx.y === b.y + 1) {
        slot.itemId = nx.itemId;
        slot.count = nx.count;
        drop = 6;
      }
      out.splice(i, drop, slot);
    } else if (bw === 2)
      out.splice(i, 5, {
        type: "panel",
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        style: sty,
      });
  }
  res.elements.push(...out);

  /* ---- init(): widgets ---- */
  const vars = {},
    wd = [];
  const IGN2 =
    /^(?:(?:this\.)?(?:left|top|leftPos|topPos|guiLeft|guiTop)\s*=|(?:this\.)?addRenderableWidget\s*\(\s*\w+\s*\)$|super\.|(?:this\.)?(?:clearWidgets|setInitialFocus|addWidget)\b|(?:final\s+)?(?:int|var)\s+\w+\s*=)/;
  for (const s of initBody ? statements(initBody) : []) {
    const t = s.t,
      vn = (t.match(
        /^(?:this\.)?(?:[\w<>,.\s]+\s+)?(\w+)\s*=\s*(?:new\s|CycleButton\b)/,
      ) || [])[1];
    const setter = t.match(
      /^(?:this\.)?(\w+)\.(setMaxLength|setHint)\s*\(([\s\S]*)\)$/,
    );
    if (setter && vars[setter[1]]) {
      const e = vars[setter[1]];
      if (setter[2] === "setMaxLength") {
        const k = ev(setter[3]);
        if (ok(k)) e.maxLen = k;
      } else e.hint = lit(setter[3], e.hint);
      continue;
    }
    if (IGN2.test(t)) continue;
    const argsAfter = (re) => {
      const m = re.exec(t);
      if (!m) return null;
      const o = m.index + m[0].length - 1,
        c = matchClose(t, o);
      return c < 0 ? null : splitArgs(t.slice(o + 1, c));
    };
    const num = (arr, k) => arr.slice(0, k).map(ev);
    let a,
      e = null;
    if (
      /\bCycleButton\s*\.\s*(?:<[^>]*>\s*)?(?:builder|onOffBuilder)\b/.test(t)
    ) {
      const cr = [...t.matchAll(/\.create\s*\(/g)].pop();
      a = cr
        ? (() => {
            const o = cr.index + cr[0].length - 1,
              c = matchClose(t, o);
            return splitArgs(t.slice(o + 1, c));
          })()
        : null;
      const n = a && num(a, 4);
      if (!a || !ok(...n)) {
        skip(t);
        continue;
      }
      let opts = [];
      const lo = t.match(/(?:List\.of|Arrays\.asList|Set\.of)\s*\(/);
      if (lo) {
        const o = lo.index + lo[0].length - 1;
        opts = splitArgs(t.slice(o + 1, matchClose(t, o)))
          .map(textOf)
          .filter((x) => x != null);
      }
      if (/onOffBuilder/.test(t)) opts = ["ON", "OFF"];
      e = {
        type: "cycle",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        label: lit(a[4], "Mode"),
        opts: opts.join(",") || "A,B",
        action: lambdaOf(a[5]),
      };
    } else if (/\bButton\s*\.\s*builder\s*\(/.test(t)) {
      a = argsAfter(/\bButton\s*\.\s*builder\s*\(/);
      const bd = argsAfter(/\.bounds\s*\(/);
      const n = bd && num(bd, 4);
      if (!a || !bd || !ok(...n)) {
        skip(t);
        continue;
      }
      const tip = t.match(
        /\.tooltip\s*\(\s*Tooltip\.create\s*\(\s*(Component\.literal\s*\(\s*"(?:[^"\\]|\\.)*"\s*\))/,
      );
      e = {
        type: "button",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        label: lit(a[0], "Button"),
        tooltip: tip ? textOf(tip[1]) : "",
        action: lambdaOf(a[1]),
      };
    } else if (/\bnew\s+(?:ExtendedButton|Button)\s*\(/.test(t)) {
      a = argsAfter(/\bnew\s+(?:ExtendedButton|Button)\s*\(/);
      const n = a && num(a, 4);
      if (!a || !ok(...n)) {
        skip(t);
        continue;
      }
      e = {
        type: "button",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        label: lit(a[4], "Button"),
        tooltip: "",
        action: lambdaOf(a[5]),
      };
    } else if (/\bnew\s+EditBox\s*\(/.test(t)) {
      a = argsAfter(/\bnew\s+EditBox\s*\(/);
      const n = a && num(a.slice(1), 4);
      if (!a || !ok(...n)) {
        skip(t);
        continue;
      }
      e = {
        type: "editbox",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        hint: lit(a[a.length - 1], "Type here..."),
        maxLen: 32,
      };
    } else if (/\bnew\s+MultiLineEditBox\s*\(/.test(t)) {
      a = argsAfter(/\bnew\s+MultiLineEditBox\s*\(/);
      const n = a && num(a.slice(1), 4);
      if (!a || !ok(...n)) {
        skip(t);
        continue;
      }
      e = {
        type: "textarea",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        hint: lit(a[5], "Notes..."),
      };
    } else if (/\bnew\s+Checkbox\s*\(/.test(t)) {
      a = argsAfter(/\bnew\s+Checkbox\s*\(/);
      const n = a && num(a, 4);
      if (!a || !ok(...n)) {
        skip(t);
        continue;
      }
      e = {
        type: "checkbox",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        label: lit(a[4], "Option"),
        selected: String(a[5]).trim() === "true",
      };
    } else if (/\bnew\s+ForgeSlider\s*\(/.test(t)) {
      a = argsAfter(/\bnew\s+ForgeSlider\s*\(/);
      const n = a && num(a, 4),
        v = a && a.slice(6, 10).map(ev);
      if (!a || !ok(...n) || !ok(...v)) {
        skip(t);
        continue;
      }
      e = {
        type: "slider",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        name: "",
        label: lit(a[4], "Value: "),
        suffix: lit(a[5], ""),
        smin: v[0],
        smax: v[1],
        sval: v[2],
        sstep: v[3],
      };
    } else if (/\bnew\s+ImageButton\s*\(/.test(t)) {
      a = argsAfter(/\bnew\s+ImageButton\s*\(/);
      const n = a && num(a, 7),
        path = a && texPath(a[7]);
      if (!a || !ok(...n) || !path) {
        skip(t);
        continue;
      }
      const long = a.length >= 11,
        tw = long ? ev(a[8]) : 256,
        th = long ? ev(a[9]) : 256;
      e = {
        type: "imagebutton",
        x: n[0],
        y: n[1],
        w: n[2],
        h: n[3],
        u: n[4],
        v: n[5],
        vh: n[6],
        path,
        texW: ok(tw) ? tw : 256,
        texH: ok(th) ? th : 256,
        imgData: "",
        action: lambdaOf(a[long ? 10 : 8]),
      };
    } else {
      skip(t);
      continue;
    }
    if (vn) {
      vars[vn] = e;
      if ("name" in e) e.name = vn;
    }
    wd.push(e);
  }
  res.elements.push(...wd);
  P.dim = sawDim;
  if (!res.bg) {
    P.bgA = 0;
    P.borderOn = !!P.borderOn;
  }
  return res;
}

/* ---- apply to the editor ---- */
function applyImport(res, mode) {
  if (mode === "replace") {
    state.elements = [];
    state.panel = { ...DEFAULT_PANEL, ...res.panel };
    state.sel = null;
  }
  res.elements.forEach((o) => {
    const { type, ...p } = o;
    const e = makeEl(type);
    Object.assign(e, p);
    state.elements.push(e);
  });
  if (res.elements.length)
    state.sel = state.elements[state.elements.length - 1].id;
  renderPanelTab();
  renderAll();
  if (mode === "replace") {
    const w = $("#stage-wrap"),
      P = state.panel;
    setZoom(
      Math.floor(
        Math.min((w.clientWidth - 96) / P.w, (w.clientHeight - 96) / P.h),
      ) || 2,
    );
  }
}

/* ---- dialog ---- */
let importRes = null;
function openImport(text) {
  $("#modal").hidden = false;
  $("#java-in").value = text || "";
  updateImportLog();
  $("#java-in").focus();
}
function closeImport() {
  $("#modal").hidden = true;
  importRes = null;
}
function updateImportLog() {
  const src = $("#java-in").value,
    log = $("#java-log"),
    ok = $("#dlg-ok");
  log.innerHTML = "";
  importRes = null;
  ok.disabled = true;
  if (!src.trim()) {
    log.append(
      el(
        "p",
        { class: "dlg-note" },
        "Paste the source of a Screen class (or drop a .java file). Its render() and init() methods are converted into layers.",
      ),
    );
    return;
  }
  const r = (importRes = parseJava(src)),
    counts = {};
  r.elements.forEach((e) => (counts[e.type] = (counts[e.type] || 0) + 1));
  const summary = Object.entries(counts)
    .map(([t, n]) => `${n} × ${TYPES[t].label}`)
    .join(", ");
  log.append(
    el(
      "p",
      { class: "dlg-ok" },
      r.elements.length
        ? `Found ${r.elements.length} element${r.elements.length > 1 ? "s" : ""}: ${summary}.`
        : "No supported elements found.",
    ),
  );
  if (r.bg)
    log.append(
      el(
        "p",
        { class: "dlg-note" },
        `Screen: ${r.panel.w} × ${r.panel.h} px${r.panel.className ? " · class " + r.panel.className : ""}.`,
      ),
    );
  if (r.skipped.length)
    log.append(
      el(
        "details",
        {},
        el(
          "summary",
          {},
          `${r.skipped.length} statement${r.skipped.length > 1 ? "s" : ""} not imported`,
        ),
        el("pre", {}, r.skipped.join("\n")),
      ),
    );
  ok.disabled = !r.elements.length && !r.bg;
}
function readJavaFile(f) {
  const rd = new FileReader();
  rd.onload = () => openImport(String(rd.result));
  rd.readAsText(f);
}
function setupImport() {
  $("#java-in").oninput = updateImportLog;
  $("#dlg-x").onclick = $("#dlg-cancel").onclick = closeImport;
  $("#modal").addEventListener("pointerdown", (ev) => {
    if (ev.target.id === "modal") closeImport();
  });
  $("#dlg-ok").onclick = () => {
    if (!importRes) return;
    const mode = document.querySelector("input[name=imode]:checked").value;
    const r = importRes;
    closeImport();
    applyImport(r, mode);
  };
  $("#java-file").onclick = () => $("#file-java").click();
  $("#file-java").onchange = (ev) => {
    const f = ev.target.files[0];
    if (f) readJavaFile(f);
    ev.target.value = "";
  };
  $("#btn-paste-java").onclick = () => openImport();
  document.addEventListener("paste", (ev) => {
    if (
      !$("#modal").hidden ||
      /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)
    )
      return;
    const t = ev.clipboardData && ev.clipboardData.getData("text");
    if (
      t &&
      /\bclass\s+\w+\s+extends\b|\bvoid\s+(?:render|init)\s*\(/.test(t)
    ) {
      ev.preventDefault();
      openImport(t);
    }
  });
  addEventListener("dragover", (ev) => ev.preventDefault());
  addEventListener("drop", (ev) => {
    const f = ev.dataTransfer && ev.dataTransfer.files[0];
    ev.preventDefault();
    if (
      f &&
      /\.java$|^text\//.test(f.name.endsWith(".java") ? ".java" : f.type)
    )
      readJavaFile(f);
  });
}
