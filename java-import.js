"use strict";
/* ===== Java import: parse a Screen class keeping the exact position of every recognized expression =====
   Offsets always refer to the ORIGINAL source text (comments are blanked, never removed), so the editor can
   later patch only those ranges and leave the rest of the class byte-for-byte untouched. */

const unq = (s) =>
  s.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));

/* ---- lexical helpers ---- */
function stripJava(src) {
  const n = src.length;
  let out = "",
    i = 0;
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
      while (i < n && src[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && d === "*") {
      const j = src.indexOf("*/", i + 2),
        end = j < 0 ? n : j + 2;
      out += src.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
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
/* split on top-level commas; returns trimmed pieces with absolute ranges */
function splitArgsPos(s, base = 0) {
  const out = [];
  let st = 0,
    d = 0;
  const push = (a, b) => {
    let x = a,
      y = b;
    while (x < y && /\s/.test(s[x])) x++;
    while (y > x && /\s/.test(s[y - 1])) y--;
    if (y > x) out.push({ t: s.slice(x, y), s: base + x, e: base + y });
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") j++;
        j++;
      }
      i = j;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") d++;
    else if (c === ")" || c === "}" || c === "]") d--;
    else if (c === "," && d === 0) {
      push(st, i);
      st = i + 1;
    }
  }
  push(st, s.length);
  return out;
}
const splitArgs = (s) => splitArgsPos(s).map((a) => a.t);
function methodRange(code, name) {
  const m = new RegExp(
    "\\b(?:void|boolean)\\s+" + name + "\\s*\\([^)]*\\)\\s*(?:throws[^{]+)?\\{",
  ).exec(code);
  if (!m) return null;
  const o = m.index + m[0].length - 1,
    c = matchClose(code, o);
  return c < 0 ? null : { s: o + 1, e: c, sig: m.index };
}

/* Flatten code[from,to) into statements. Each: {s,e,pre,t,cond,conds,blk}
   s/e = exact range of the statement text, pre = start incl. a braceless if/else header, conds = ranges of enclosing if-conditions. */
function statements(code, from, to, cond = "", conds = [], blk = "") {
  const out = [];
  let i = from,
    cs = -1;
  const flush = (end) => {
    if (cs < 0) return;
    const pre = cs;
    let s = cs,
      c = cond,
      cr = conds;
    const em = /^else\b\s*/.exec(code.slice(s, end));
    if (em && !/^else\s+if\b/.test(code.slice(s, end))) {
      s += em[0].length;
      c = cond ? cond + " && else" : "else";
    }
    const im = /^(?:else\s+)?if\s*\(/.exec(code.slice(s, end));
    if (im) {
      const o = s + im[0].length - 1,
        cl = matchClose(code, o);
      if (cl > 0 && cl < end) {
        const ct = code.slice(o + 1, cl).trim();
        c = c ? c + " && " + ct : ct;
        cr = [...cr, { s: o + 1, e: cl }];
        s = cl + 1;
        while (s < end && /\s/.test(code[s])) s++;
      }
    }
    let e = end;
    while (e > s && /\s/.test(code[e - 1])) e--;
    cs = -1;
    if (e > s)
      out.push({ s, e, pre, t: code.slice(s, e), cond: c, conds: cr, blk });
  };
  while (i < to) {
    const c = code[i];
    if (cs < 0 && !/\s/.test(c) && c !== ";" && c !== "{" && c !== "}") cs = i;
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < to && code[j] !== c) {
        if (code[j] === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[") {
      const j = matchClose(code, i);
      if (j < 0 || j >= to) {
        i = to;
        break;
      }
      i = j + 1;
      continue;
    }
    if (c === ";") {
      flush(i);
      i++;
      continue;
    }
    if (c === "{") {
      const j = matchClose(code, i);
      if (j < 0 || j >= to) break;
      const head = cs < 0 ? "" : code.slice(cs, i).trim();
      if (
        head === "" ||
        /^(?:else\s+)?(?:if|for|while)\b|^(?:else|try|do|synchronized)\b/.test(
          head,
        )
      ) {
        let nc = cond,
          ncr = conds;
        const hm = /^(?:else\s+)?if\s*\(/.exec(head);
        if (hm) {
          const o = cs + hm[0].length - 1,
            cl = matchClose(code, o);
          if (cl > 0) {
            const ct = code.slice(o + 1, cl).trim();
            nc = cond ? cond + " && " + ct : ct;
            ncr = [...conds, { s: o + 1, e: cl }];
          }
        } else if (/^else$/.test(head)) nc = cond ? cond + " && else" : "else";
        cs = -1;
        out.push(
          ...statements(
            code,
            i + 1,
            j,
            nc,
            ncr,
            blk + "\n" + code.slice(i + 1, j),
          ),
        );
        i = j + 1;
        continue;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  flush(to);
  return out;
}
function condParts(code, r) {
  const out = [];
  let st = r.s,
    d = 0;
  for (let i = r.s; i < r.e; i++) {
    const c = code[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < r.e && code[i] !== c) {
        if (code[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    else if (c === "&" && code[i + 1] === "&" && d === 0) {
      out.push({ s: st, e: i });
      st = i + 2;
      i++;
    }
  }
  out.push({ s: st, e: r.e });
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
const lit = (a, fb) => {
  const t = textOf(a);
  return t === null ? fb : t;
};
/* range of the string literal inside a plain "..." or Component.literal("...") argument */
function strRange(arg) {
  if (!arg || textOf(arg.t) === null || /^Component\.empty/.test(arg.t))
    return null;
  const a = arg.t.indexOf('"'),
    b = arg.t.lastIndexOf('"');
  return a < 0 ? null : { s: arg.s + a, e: arg.s + b + 1 };
}
function lambdaOf(a) {
  if (!a) return "// TODO";
  a = a.trim();
  const k = a.indexOf("->");
  if (k < 0) return "// TODO (" + a + ")";
  let body = a.slice(k + 2).trim();
  if (body[0] === "{") {
    const c = matchClose(body, 0);
    body = body
      .slice(1, c < 0 ? undefined : c)
      .replace(/\s*\n\s*/g, " ")
      .trim();
  } else body = body + ";";
  return body || "// TODO";
}
const lambdaRole = (arg) =>
  arg && arg.t.includes("->")
    ? [{ s: arg.s, e: arg.e, head: arg.t.slice(0, arg.t.indexOf("->") + 2) }]
    : null;
const rg = (arg) => ({ s: arg.s, e: arg.e });
const rgs = (...args) => args.filter(Boolean).map(rg);

/* Edge classification for multi-fill shapes: which coordinate args move with position / size. */
function edgeRoles(items, box) {
  const roles = { x: [], y: [], w: [], h: [] },
    bws = [0, 1, 2, 3, 4];
  items.forEach((it) =>
    it.args.forEach((arg, k) => {
      if (!arg) return;
      const v = it.vals[k],
        isX = k % 2 === 0;
      const o = isX ? box.x : box.y,
        size = isX ? box.w : box.h;
      (isX ? roles.x : roles.y).push(rg(arg));
      if (
        !isNaN(v) &&
        bws.some((b) => v === o + size - b) &&
        !bws.some((b) => v === o + b && !(v === o + size - b))
      )
        (isX ? roles.w : roles.h).push(rg(arg));
    }),
  );
  return roles;
}

/* ---- main parser ---- */
function parseJava(src) {
  const code = stripJava(src);
  const res = {
    text: src,
    panel: {},
    elements: [],
    skipped: [],
    bg: false,
    meta: {},
    pedit: [],
  };
  const M = res.meta,
    P = res.panel;
  const ctx = { consts: {}, tex: {}, locals: new Set(), lit: {} };
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
  )) {
    const base = m.index + m[0].indexOf(m[1]);
    for (const k of m[1].matchAll(
      new RegExp("(\\w+)\\s*=\\s*(" + VAL + ")", "g"),
    )) {
      ctx.consts[k[1]] = Number(k[2].replace(/[lL]$/, "")) || 0;
      const e = base + k.index + k[0].length;
      ctx.lit[k[1]] = { s: e - k[2].length, e };
    }
  }
  for (const m of code.matchAll(
    /\bResourceLocation\s+(\w+)\s*=\s*new\s+ResourceLocation\s*\(([^;]*?)\)\s*;/g,
  )) {
    const a = splitArgs(m[2]).map((x) => textOf(x));
    if (a[0] != null)
      ctx.tex[m[1]] = a.length > 1 && a[1] != null ? a[0] + ":" + a[1] : a[0];
  }
  const imports = {};
  M.imports = [];
  for (const m of code.matchAll(/import\s+(static\s+)?([\w.*]+)\s*;/g)) {
    imports[m[2].split(".").pop()] = m[2];
    M.imports.push(m[2]);
    M.importEnd = m.index + m[0].length;
  }
  const pk = /package\s+([\w.]+)\s*;/.exec(code);
  if (pk) {
    P.pkg = pk[1];
    M.pkg = {
      s: pk.index + pk[0].indexOf(pk[1]),
      e: pk.index + pk[0].indexOf(pk[1]) + pk[1].length,
    };
    M.pkgEnd = pk.index + pk[0].length;
  }
  const cm = /\bclass\s+(\w+)\s+extends\s+[\w<>.]+[^{]*\{/.exec(code);
  if (cm) {
    P.className = cm[1];
    M.className = cm[1];
    M.classOpen = cm.index + cm[0].length;
    M.classEnd = code.lastIndexOf("}");
  }
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
  const tt =
    /super\s*\(\s*Component\.(?:literal|translatable)\s*\(\s*("(?:[^"\\]|\\.)*")/.exec(
      code,
    );
  if (tt) {
    P.title = unq(tt[1].slice(1, -1));
    const s = tt.index + tt[0].length - tt[1].length;
    M.titleLit = { s, e: s + tt[1].length };
  }
  const ps = /isPauseScreen\s*\(\s*\)\s*\{\s*return\s+(true|false)/.exec(code);
  if (ps) {
    P.pause = ps[1] === "true";
    const e = ps.index + ps[0].length;
    M.pauseLit = { s: e - ps[1].length, e };
  }
  if (/void\s+tick\s*\(\s*\)\s*\{[^}]*onClose/.test(code))
    P.closeInvalid = true;
  const cw = ["W", "WIDTH", "imageWidth"].find((k) => k in ctx.consts),
    ch = ["H", "HEIGHT", "imageHeight"].find((k) => k in ctx.consts);
  if (cw) {
    P.w = ctx.consts[cw];
    M.wName = cw;
    M.wLit = ctx.lit[cw];
  }
  if (ch) {
    P.h = ctx.consts[ch];
    M.hName = ch;
    M.hLit = ctx.lit[ch];
  }
  M.hasRatio = /\b(?:float|double|int)\s+ratio\s*\(/.test(code);
  M.usedWords = null;

  const bodies = {
    render: methodRange(code, "render"),
    renderBg: methodRange(code, "renderBg"),
    renderLabels: methodRange(code, "renderLabels"),
  };
  const initR = methodRange(code, "init");
  M.render = bodies.render
    ? { s: bodies.render.s, e: bodies.render.e, sig: bodies.render.sig }
    : bodies.renderBg
      ? { s: bodies.renderBg.s, e: bodies.renderBg.e, sig: bodies.renderBg.sig }
      : null;
  M.init = initR ? { s: initR.s, e: initR.e } : null;
  if (!bodies.render && !bodies.renderBg && !bodies.renderLabels && !initR) {
    res.skipped.push("No render() or init() method found.");
    return res;
  }

  const skip = (t) => res.skipped.push(t.replace(/\s+/g, " ").slice(0, 90));
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
  const colRole = (arg) => {
    const c = arg && jcolor(arg.t, ctx);
    return c ? [{ s: arg.s, e: arg.e, a: c.a }] : null;
  };
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
      if (/width/.test(init)) M.originX = M.originX || n;
      else M.originY = M.originY || n;
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
      const p = splitArgs(m[1]).map((x) => textOf(x));
      if (p[0] != null)
        return p.length > 1 && p[1] != null ? p[0] + ":" + p[1] : p[0];
    }
    return null;
  };

  /* build an element with its source info */
  const mk = (type, props, stmts, roles, st, method) => {
    const el = { type, ...props };
    el.orig = JSON.parse(JSON.stringify(props));
    const clean = {};
    for (const k in roles) if (roles[k] && roles[k].length) clean[k] = roles[k];
    const edit = Object.keys(clean).filter((k) => k[0] !== "_");
    if (clean.color && ["rect", "gradient", "outline"].includes(type))
      edit.push("alpha");
    if (clean.color2 && type === "gradient") edit.push("alpha2");
    if (clean.textarg) edit.push("text", "dynamic", "expr");
    edit.push("img", "pv", "sample");
    el.src = {
      stmts: stmts.map((x) => ({ s: x.s, e: x.e, pre: x.pre })),
      roles: clean,
      edit,
      method,
    };
    el.cond = (st && st.cond) || "";
    return el;
  };

  /* ---- render-type methods ---- */
  const out = [];
  let sawDim = false;
  const IGN =
    /^(?:(?:final\s+)?(?:var|float|double|long|boolean|String|Item|ItemStack|ResourceLocation|Component)\s+\w+\s*=|RenderSystem\.|super\.|return\b|(?:this\.)?renderBackground\b)/;
  const callArgs = (st, open) => {
    const close = matchClose(st.t, open);
    return splitArgsPos(st.t.slice(open + 1, close), st.s + open + 1);
  };
  for (const [method, r] of Object.entries(bodies)) {
    if (!r) continue;
    let pT = null,
      pS = 1,
      group = null,
      prog = null,
      lastItem = null;
    for (const st of statements(code, r.s, r.e)) {
      const t = st.t;
      if (/^(?:this\.)?renderBackground\s*\(/.test(t)) {
        sawDim = true;
        continue;
      }
      const pm = t.match(/\.pose\(\)\.(\w+)\s*\(/);
      if (pm) {
        const A = callArgs(st, t.indexOf("(", pm.index + pm[0].length - 1));
        if (pm[1] === "pushPose")
          group = { stmts: [st], tr: null, sc: null, el: null };
        else if (group && pm[1] === "translate") {
          group.stmts.push(st);
          const x = ev(A[0].t),
            y = ev(A[1].t);
          if (ok(x, y)) {
            pT = [x, y];
            group.tr = [rg(A[0]), rg(A[1])];
          }
        } else if (group && pm[1] === "scale") {
          group.stmts.push(st);
          const sc = ev(A[0].t);
          if (ok(sc)) {
            pS = sc;
            group.sc = [rg(A[0]), rg(A[1])];
          }
        } else if (pm[1] === "popPose") {
          if (group) {
            group.stmts.push(st);
            if (group.el)
              group.el.src.stmts.push({ s: st.s, e: st.e, pre: st.pre });
          }
          group = null;
          pT = null;
          pS = 1;
        }
        continue;
      }
      const pg = t.match(
        /^int\s+(\w+)\s*=\s*\(int\)\s*\(\s*([\w.]+)\s*\*\s*(?:\w+\.)?ratio\s*\(([\s\S]*)\)\s*\)$/d,
      );
      if (pg) {
        const o = pg.indices[3][0],
          ra = splitArgsPos(
            code.slice(st.s + o, st.s + pg.indices[3][1]),
            st.s + o,
          );
        prog = {
          name: pg[1],
          cur: ra[0].t,
          max: ra[1].t,
          curR: rg(ra[0]),
          maxR: rg(ra[1]),
          mulR: { s: st.s + pg.indices[2][0], e: st.s + pg.indices[2][1] },
          decl: st,
        };
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
      const m = t.match(
        /^(?:[\w.]+\.)?(fill|fillGradient|renderOutline|drawString|drawCenteredString|drawWordWrap|blit|renderItem|renderItemDecorations|renderTooltip|renderEntityInInventoryFollowsMouse|hLine|vLine)\s*\(/,
      );
      if (!m) {
        if (!IGN.test(t)) skip(t);
        continue;
      }
      const A = callArgs(st, m[0].length - 1),
        a = A.map((x) => x.t);
      switch (m[1]) {
        case "fill": {
          if (a.length < 5) {
            skip(t);
            break;
          }
          const v = a.slice(0, 4).map(ev),
            c = col(a[4]),
            prev = out[out.length - 1];
          /* ratio bar: second fill whose width is a runtime ratio */
          const wantsBar =
            prev &&
            prev.type === "rect" &&
            prev._A &&
            ok(v[0], v[1], v[3]) &&
            isNaN(v[2]) &&
            v[0] === prev.x &&
            v[1] === prev.y &&
            v[3] === prev.y + prev.h;
          const wantsBarV =
            prev &&
            prev.type === "rect" &&
            prev._A &&
            ok(v[0], v[2], v[3]) &&
            isNaN(v[1]) &&
            v[0] === prev.x &&
            v[2] === prev.x + prev.w &&
            v[3] === prev.y + prev.h;
          const usesProg =
            prog &&
            new RegExp("\\b" + prog.name + "\\b").test(a.slice(0, 4).join(" "));
          if (
            (wantsBar || wantsBarV || usesProg) &&
            prev &&
            prev.type === "rect" &&
            prev._A
          ) {
            const horiz = usesProg ? prog.name !== "fh" : wantsBar;
            const rm =
              !usesProg &&
              a[horiz ? 2 : 1].match(
                /\(\s*int\s*\)\s*\(\s*([\w.]+)\s*\*\s*\(?\s*([\s\S]+?)\s*\/\s*\(\s*float\s*\)\s*([\w.]+(?:\(\))?)\s*\)?\s*\)/d,
              );
            const box = { x: prev.x, y: prev.y, w: prev.w, h: prev.h };
            const er = edgeRoles(
              [
                { args: prev._A.slice(0, 4), vals: prev._v },
                { args: A.slice(0, 4), vals: v },
              ],
              box,
            );
            const roles = {
              ...er,
              color: colRole(A[4]),
              color2: prev._roles.color,
            };
            if (usesProg) {
              roles.cur = [prog.curR];
              roles.max = [prog.maxR];
              roles[horiz ? "_wmul" : "_hmul"] = [prog.mulR];
            } else if (rm) {
              const base = A[horiz ? 2 : 1].s;
              roles._cur = null;
              roles.cur = [
                { s: base + rm.indices[2][0], e: base + rm.indices[2][1] },
              ];
              roles.max = [
                { s: base + rm.indices[3][0], e: base + rm.indices[3][1] },
              ];
              roles[horiz ? "_wmul" : "_hmul"] = [
                { s: base + rm.indices[1][0], e: base + rm.indices[1][1] },
              ];
            }
            const stm = [...prev._stmts, ...(usesProg ? [prog.decl] : []), st];
            const props = {
              x: prev.x,
              y: prev.y,
              w: prev.w,
              h: prev.h,
              color: c.hex,
              color2: prev.color,
              cur: usesProg ? prog.cur : rm ? rm[2] : "60",
              max: usesProg ? prog.max : rm ? rm[3] : "100",
              dir: horiz ? "horizontal" : "vertical",
              pv: 60,
            };
            out.pop();
            out.push(mk("progress", props, stm, roles, st, method));
            prog = null;
            break;
          }
          if (!ok(...v)) {
            skip(t);
            break;
          }
          const w = Math.abs(v[2] - v[0]),
            h = Math.abs(v[3] - v[1]),
            x = Math.min(v[0], v[2]),
            y = Math.min(v[1], v[3]);
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
            const cr = colRole(A[4]);
            if (cr) {
              M.bgColor = cr;
              res.pedit.push("bg", "bgA");
            }
            break;
          }
          const roles = {
            ...edgeRoles([{ args: A.slice(0, 4), vals: v }], { x, y, w, h }),
            color: colRole(A[4]),
          };
          const el = mk(
            "rect",
            { x, y, w, h, color: c.hex, alpha: c.a },
            [st],
            roles,
            st,
            method,
          );
          el._A = A;
          el._v = v;
          el._roles = roles;
          el._stmts = [st];
          out.push(el);
          break;
        }
        case "fillGradient": {
          const v = a.slice(0, 4).map(ev),
            c1 = col(a[4]),
            c2 = col(a[5]);
          if (!ok(...v)) {
            skip(t);
            break;
          }
          const x = Math.min(v[0], v[2]),
            y = Math.min(v[1], v[3]),
            w = Math.abs(v[2] - v[0]),
            h = Math.abs(v[3] - v[1]);
          out.push(
            mk(
              "gradient",
              {
                x,
                y,
                w,
                h,
                color: c1.hex,
                alpha: c1.a,
                color2: c2.hex,
                alpha2: c2.a,
              },
              [st],
              {
                ...edgeRoles([{ args: A.slice(0, 4), vals: v }], {
                  x,
                  y,
                  w,
                  h,
                }),
                color: colRole(A[4]),
                color2: colRole(A[5]),
              },
              st,
              method,
            ),
          );
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
              ? mk(
                  "rect",
                  {
                    x: Math.min(v[0], v[1]),
                    y: v[2],
                    w: Math.abs(v[1] - v[0]) + 1,
                    h: 1,
                    color: c.hex,
                    alpha: c.a,
                  },
                  [st],
                  {
                    x: rgs(A[0], A[1]),
                    y: rgs(A[2]),
                    w: rgs(A[1]),
                    color: colRole(A[3]),
                  },
                  st,
                  method,
                )
              : mk(
                  "rect",
                  {
                    x: v[0],
                    y: Math.min(v[1], v[2]),
                    w: 1,
                    h: Math.abs(v[2] - v[1]) + 1,
                    color: c.hex,
                    alpha: c.a,
                  },
                  [st],
                  {
                    x: rgs(A[0]),
                    y: rgs(A[1], A[2]),
                    h: rgs(A[2]),
                    color: colRole(A[3]),
                  },
                  st,
                  method,
                ),
          );
          break;
        }
        case "renderOutline": {
          const v = a.slice(0, 4).map(ev),
            c = col(a[4]);
          if (!ok(...v)) {
            skip(t);
            break;
          }
          if (v[0] === 0 && v[1] === 0 && v[2] === P.w && v[3] === P.h) {
            P.borderOn = true;
            P.border = c.hex;
            const cr = colRole(A[4]);
            if (cr) {
              M.borderColor = cr;
              res.pedit.push("border");
            }
            break;
          }
          out.push(
            mk(
              "outline",
              { x: v[0], y: v[1], w: v[2], h: v[3], color: c.hex, alpha: c.a },
              [st],
              {
                x: rgs(A[0]),
                y: rgs(A[1]),
                w: rgs(A[2]),
                h: rgs(A[3]),
                color: colRole(A[4]),
              },
              st,
              method,
            ),
          );
          break;
        }
        case "drawString":
        case "drawCenteredString": {
          const center = m[1] === "drawCenteredString",
            c = col(a[4]);
          let x = ev(a[2]),
            y = ev(a[3]),
            sc = 1,
            xr = rgs(A[2]),
            yr = rgs(A[3]),
            scr = null,
            stm = [st];
          if (group && group.tr) {
            x = pT[0];
            y = pT[1];
            sc = pS;
            xr = [group.tr[0]];
            yr = [group.tr[1]];
            scr = group.sc;
            stm = [...group.stmts, st];
          }
          if (!ok(x, y) || a.length < 5) {
            skip(t);
            break;
          }
          const txt = textOf(a[1]);
          const roles = {
            x: xr,
            y: yr,
            color: colRole(A[4]),
            textarg: [rg(A[1])],
          };
          if (scr) roles.scale = scr;
          if (!center && A[5] && /^(true|false)$/.test(A[5].t))
            roles.shadow = [rg(A[5])];
          const el = mk(
            "text",
            {
              x,
              y,
              text: txt === null ? "Text" : txt,
              dynamic: txt === null,
              expr: txt === null ? a[1] : "String.valueOf(123)",
              sample: txt === null ? sampleOf(a[1]) : "123",
              color: c.hex,
              shadow: !center && String(a[5]).trim() === "true",
              align: center ? "center" : "left",
              scale: sc,
            },
            stm,
            roles,
            st,
            method,
          );
          if (group && group.tr) group.el = el;
          out.push(el);
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
          out.push(
            mk(
              "wraptext",
              { x, y, w, text: lit(a[1], "Text"), color: c.hex },
              [st],
              {
                x: rgs(A[2]),
                y: rgs(A[3]),
                w: rgs(A[4]),
                color: colRole(A[5]),
                text: strRange(A[1]) ? [strRange(A[1])] : null,
              },
              st,
              method,
            ),
          );
          break;
        }
        case "blit": {
          const path = texPath(a[0]);
          const n = a.slice(1).map(ev);
          if (!path || n.length < 6 || !ok(...n.slice(0, 6))) {
            skip(t);
            break;
          }
          const K = ["x", "y", "u", "v", "w", "h", "texW", "texH"],
            roles = {};
          K.forEach((k, i) => {
            if (A[i + 1] && (i < 6 || ok(n[i]))) roles[k] = rgs(A[i + 1]);
          });
          out.push(
            mk(
              "texture",
              {
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
              },
              [st],
              roles,
              st,
              method,
            ),
          );
          break;
        }
        case "renderItem": {
          const x = ev(a[1]),
            y = ev(a[2]);
          if (!ok(x, y)) {
            skip(t);
            break;
          }
          const whole = t + "\n" + st.blk;
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
          lastItem = mk(
            "item",
            { x, y, itemId: id, count },
            [st],
            { x: rgs(A[1]), y: rgs(A[2]) },
            st,
            method,
          );
          lastItem._x = x;
          lastItem._y = y;
          out.push(lastItem);
          break;
        }
        case "renderItemDecorations": {
          const x = ev(a[2]),
            y = ev(a[3]);
          if (lastItem && x === lastItem._x && y === lastItem._y) {
            lastItem.src.stmts.push({ s: st.s, e: st.e, pre: st.pre });
            lastItem.src.roles.x.push(rg(A[2]));
            lastItem.src.roles.y.push(rg(A[3]));
          }
          break;
        }
        case "renderEntityInInventoryFollowsMouse": {
          const x = ev(a[1]),
            y = ev(a[2]),
            sc = ev(a[3]);
          if (!ok(x, y, sc)) {
            skip(t);
            break;
          }
          out.push(
            mk(
              "entity",
              { x, y, scale: sc },
              [st],
              { x: rgs(A[1]), y: rgs(A[2]), scale: rgs(A[3]) },
              st,
              method,
            ),
          );
          break;
        }
        case "renderTooltip": {
          const bnd = { X: [], Y: [] },
            roles = { x: [], y: [], w: [], h: [] };
          for (const r of st.conds)
            for (const part of condParts(code, r)) {
              const mm = /^\s*mouse([XY])\s*(>=|>|<=|<)\s*/.exec(
                code.slice(part.s, part.e),
              );
              if (!mm) continue;
              const s0 = part.s + mm[0].length;
              let e0 = part.e;
              while (e0 > s0 && /\s/.test(code[e0 - 1])) e0--;
              const v = ev(code.slice(s0, e0));
              if (!ok(v)) continue;
              bnd[mm[1]].push(v);
              const rr = { s: s0, e: e0 };
              (mm[1] === "X" ? roles.x : roles.y).push(rr);
              if (mm[2][0] === "<")
                (mm[1] === "X" ? roles.w : roles.h).push(rr);
            }
          if (bnd.X.length < 2 || bnd.Y.length < 2) {
            skip(t);
            break;
          }
          const x = Math.min(...bnd.X),
            y = Math.min(...bnd.Y);
          out.push(
            mk(
              "tooltip",
              {
                x,
                y,
                w: Math.max(...bnd.X) - x,
                h: Math.max(...bnd.Y) - y,
                tooltip: lit(a[1], "Tooltip"),
              },
              [st],
              { ...roles, tooltip: strRange(A[1]) ? [strRange(A[1])] : null },
              st,
              method,
            ),
          );
          break;
        }
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
    if (b.type !== "rect" || b.alpha !== 255 || !b._A) continue;
    const sty = Object.keys(STY).find((k) => STY[k][0] === b.color);
    if (!sty) continue;
    const [, hi, lo] = STY[sty],
      q = out.slice(i + 1, i + 5),
      bw = q[0].h;
    if (q.some((r) => r.type !== "rect" || r.alpha !== 255 || !r._A)) continue;
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
    const five = [b, ...q],
      stm = five.flatMap((r) => r._stmts);
    const items = five.map((r) => ({ args: r._A.slice(0, 4), vals: r._v })),
      box = { x: b.x, y: b.y, w: b.w, h: b.h };
    const roles = edgeRoles(items, box),
      st0 = { cond: b.cond };
    if (sty === "inset" && b.w === 18 && b.h === 18 && bw === 1) {
      const nx = out[i + 5];
      let drop = 5,
        itemId = "",
        count = 1,
        extra = [];
      if (nx && nx.type === "item" && nx.x === b.x + 1 && nx.y === b.y + 1) {
        itemId = nx.itemId;
        count = nx.count;
        drop = 6;
        extra = nx.src.stmts;
        roles.x.push(...nx.src.roles.x);
        roles.y.push(...nx.src.roles.y);
      }
      delete roles.w;
      delete roles.h;
      out.splice(
        i,
        drop,
        mk(
          "slot",
          { x: b.x, y: b.y, itemId, count },
          [...stm, ...extra],
          roles,
          st0,
          b.src.method,
        ),
      );
    } else if (bw === 2)
      out.splice(
        i,
        5,
        mk(
          "panel",
          { x: b.x, y: b.y, w: b.w, h: b.h, style: sty },
          stm,
          roles,
          st0,
          b.src.method,
        ),
      );
  }
  out.forEach((e) => {
    delete e._A;
    delete e._v;
    delete e._roles;
    delete e._stmts;
    delete e._x;
    delete e._y;
  });
  res.elements.push(...out);
  const supers = bodies.render
    ? statements(code, bodies.render.s, bodies.render.e).filter(
        (s) => /^super\.render\s*\(/.test(s.t) && !s.cond && !s.blk,
      )
    : [];
  M.superRender = supers.length ? supers[supers.length - 1].pre : null;

  /* ---- init(): widgets ---- */
  const vars = {},
    wd = [];
  const IGN2 =
    /^(?:(?:this\.)?(?:left|top|leftPos|topPos|guiLeft|guiTop)\s*=|super\.|(?:this\.)?(?:clearWidgets|setInitialFocus|addWidget)\b|(?:final\s+)?(?:int|var)\s+\w+\s*=)/;
  for (const st of initR ? statements(code, initR.s, initR.e) : []) {
    const t = st.t,
      vn = (t.match(
        /^(?:this\.)?(?:[\w<>,.\s]+\s+)?(\w+)\s*=\s*(?:new\s|CycleButton\b)/,
      ) || [])[1];
    const setter = t.match(/^(?:this\.)?(\w+)\.(setMaxLength|setHint)\s*\(/);
    if (setter && vars[setter[1]]) {
      const e = vars[setter[1]],
        A = callArgs(st, t.indexOf("("));
      e.src.stmts.push({ s: st.s, e: st.e, pre: st.pre });
      if (setter[2] === "setMaxLength") {
        const k = ev(A[0].t);
        if (ok(k)) {
          e.maxLen = k;
          e.orig.maxLen = k;
          e.src.roles.maxLen = rgs(A[0]);
          e.src.edit.push("maxLen");
        }
      } else {
        e.hint = lit(A[0].t, e.hint);
        e.orig.hint = e.hint;
        const sr = strRange(A[0]);
        if (sr) {
          (e.src.roles.hint = e.src.roles.hint || []).push(sr);
          if (!e.src.edit.includes("hint")) e.src.edit.push("hint");
        }
      }
      continue;
    }
    const addv = t.match(/^(?:this\.)?addRenderableWidget\s*\(\s*(\w+)\s*\)$/);
    if (addv) {
      if (vars[addv[1]])
        vars[addv[1]].src.stmts.push({ s: st.s, e: st.e, pre: st.pre });
      continue;
    }
    if (IGN2.test(t)) continue;
    const argsAfter = (re) => {
      const m = re.exec(t);
      if (!m) return null;
      const o = m.index + m[0].length - 1,
        c = matchClose(t, o);
      return c < 0 ? null : splitArgsPos(t.slice(o + 1, c), st.s + o + 1);
    };
    const num = (arr, k) => arr.slice(0, k).map((x) => ev(x.t));
    const box4 = (A, o = 0) => ({
      x: rgs(A[o]),
      y: rgs(A[o + 1]),
      w: rgs(A[o + 2]),
      h: rgs(A[o + 3]),
    });
    let a,
      e = null;
    if (
      /\bCycleButton\s*\.\s*(?:<[^>]*>\s*)?(?:builder|onOffBuilder)\b/.test(t)
    ) {
      const cr = [...t.matchAll(/\.create\s*\(/g)].pop();
      let A = null;
      if (cr) {
        const o = cr.index + cr[0].length - 1,
          c = matchClose(t, o);
        A = splitArgsPos(t.slice(o + 1, c), st.s + o + 1);
      }
      const n = A && num(A, 4);
      if (!A || !ok(...n)) {
        skip(t);
        continue;
      }
      let opts = [];
      const lo = t.match(/(?:List\.of|Arrays\.asList|Set\.of)\s*\(/);
      if (lo) {
        const o = lo.index + lo[0].length - 1;
        opts = splitArgs(t.slice(o + 1, matchClose(t, o)))
          .map((x) => textOf(x))
          .filter((x) => x != null);
      }
      if (/onOffBuilder/.test(t)) opts = ["ON", "OFF"];
      e = mk(
        "cycle",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          label: lit(A[4].t, "Mode"),
          opts: opts.join(",") || "A,B",
          action: lambdaOf(A[5] && A[5].t),
        },
        [st],
        {
          ...box4(A),
          label: strRange(A[4]) ? [strRange(A[4])] : null,
          action: lambdaRole(A[5]),
        },
        st,
        "init",
      );
    } else if (/\bButton\s*\.\s*builder\s*\(/.test(t)) {
      const A = argsAfter(/\bButton\s*\.\s*builder\s*\(/),
        B = argsAfter(/\.bounds\s*\(/);
      const n = B && num(B, 4);
      if (!A || !B || !ok(...n)) {
        skip(t);
        continue;
      }
      const tip =
        /\.tooltip\s*\(\s*Tooltip\.create\s*\(\s*Component\.literal\s*\(\s*("(?:[^"\\]|\\.)*")/.exec(
          t,
        );
      const tr = tip
        ? {
            s: st.s + tip.index + tip[0].length - tip[1].length,
            e: st.s + tip.index + tip[0].length,
          }
        : null;
      e = mk(
        "button",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          label: lit(A[0].t, "Button"),
          tooltip: tip ? unq(tip[1].slice(1, -1)) : "",
          action: lambdaOf(A[1] && A[1].t),
        },
        [st],
        {
          ...box4(B),
          label: strRange(A[0]) ? [strRange(A[0])] : null,
          action: lambdaRole(A[1]),
          tooltip: tr ? [tr] : null,
        },
        st,
        "init",
      );
    } else if (/\bnew\s+(?:ExtendedButton|Button)\s*\(/.test(t)) {
      const A = argsAfter(/\bnew\s+(?:ExtendedButton|Button)\s*\(/);
      const n = A && num(A, 4);
      if (!A || !ok(...n)) {
        skip(t);
        continue;
      }
      e = mk(
        "button",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          label: lit(A[4].t, "Button"),
          tooltip: "",
          action: lambdaOf(A[5] && A[5].t),
        },
        [st],
        {
          ...box4(A),
          label: strRange(A[4]) ? [strRange(A[4])] : null,
          action: lambdaRole(A[5]),
        },
        st,
        "init",
      );
    } else if (/\bnew\s+EditBox\s*\(/.test(t)) {
      const A = argsAfter(/\bnew\s+EditBox\s*\(/);
      const n = A && num(A.slice(1), 4);
      if (!A || !ok(...n)) {
        skip(t);
        continue;
      }
      const hr = strRange(A[A.length - 1]);
      e = mk(
        "editbox",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          hint: lit(A[A.length - 1].t, "Type here..."),
          maxLen: 32,
        },
        [st],
        { ...box4(A, 1), hint: hr ? [hr] : null },
        st,
        "init",
      );
    } else if (/\bnew\s+MultiLineEditBox\s*\(/.test(t)) {
      const A = argsAfter(/\bnew\s+MultiLineEditBox\s*\(/);
      const n = A && num(A.slice(1), 4);
      if (!A || !ok(...n)) {
        skip(t);
        continue;
      }
      e = mk(
        "textarea",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          hint: lit(A[5] && A[5].t, "Notes..."),
        },
        [st],
        {
          ...box4(A, 1),
          hint: A[5] && strRange(A[5]) ? [strRange(A[5])] : null,
        },
        st,
        "init",
      );
    } else if (/\bnew\s+Checkbox\s*\(/.test(t)) {
      const A = argsAfter(/\bnew\s+Checkbox\s*\(/);
      const n = A && num(A, 4);
      if (!A || !ok(...n)) {
        skip(t);
        continue;
      }
      e = mk(
        "checkbox",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          label: lit(A[4].t, "Option"),
          selected: String(A[5] && A[5].t).trim() === "true",
        },
        [st],
        {
          ...box4(A),
          label: strRange(A[4]) ? [strRange(A[4])] : null,
          selected: A[5] && /^(true|false)$/.test(A[5].t) ? [rg(A[5])] : null,
        },
        st,
        "init",
      );
    } else if (/\bnew\s+ForgeSlider\s*\(/.test(t)) {
      const A = argsAfter(/\bnew\s+ForgeSlider\s*\(/);
      const n = A && num(A, 4),
        v = A && A.slice(6, 10).map((x) => ev(x.t));
      if (!A || !ok(...n) || !ok(...v)) {
        skip(t);
        continue;
      }
      e = mk(
        "slider",
        {
          x: n[0],
          y: n[1],
          w: n[2],
          h: n[3],
          name: "",
          label: lit(A[4].t, "Value: "),
          suffix: lit(A[5].t, ""),
          smin: v[0],
          smax: v[1],
          sval: v[2],
          sstep: v[3],
        },
        [st],
        {
          ...box4(A),
          label: strRange(A[4]) ? [strRange(A[4])] : null,
          suffix: strRange(A[5]) ? [strRange(A[5])] : null,
          smin: rgs(A[6]),
          smax: rgs(A[7]),
          sval: rgs(A[8]),
          sstep: rgs(A[9]),
        },
        st,
        "init",
      );
    } else if (/\bnew\s+ImageButton\s*\(/.test(t)) {
      const A = argsAfter(/\bnew\s+ImageButton\s*\(/);
      const n = A && num(A, 7),
        path = A && texPath(A[7].t);
      if (!A || !ok(...n) || !path) {
        skip(t);
        continue;
      }
      const long = A.length >= 11,
        tw = long ? ev(A[8].t) : 256,
        th = long ? ev(A[9].t) : 256;
      e = mk(
        "imagebutton",
        {
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
          action: lambdaOf(A[long ? 10 : 8] && A[long ? 10 : 8].t),
        },
        [st],
        {
          ...box4(A),
          u: rgs(A[4]),
          v: rgs(A[5]),
          vh: rgs(A[6]),
          ...(long ? { texW: rgs(A[8]), texH: rgs(A[9]) } : {}),
          action: lambdaRole(A[long ? 10 : 8]),
        },
        st,
        "init",
      );
    } else {
      skip(t);
      continue;
    }
    if (vn) {
      vars[vn] = e;
      if ("name" in e) {
        e.name = vn;
        e.orig.name = vn;
      }
    }
    wd.push(e);
  }
  res.elements.push(...wd);
  P.dim = sawDim;
  if (!res.bg) {
    P.bgA = 0;
    P.borderOn = !!P.borderOn;
  }
  res.pedit.push("className", "pkg");
  if (M.wLit) res.pedit.push("w");
  if (M.hLit) res.pedit.push("h");
  if (M.titleLit) res.pedit.push("title");
  if (M.pauseLit) res.pedit.push("pause");
  if (!M.originX && /\b(?:leftPos|left|guiLeft)\b/.test(code))
    M.originX = (code.match(/\b(leftPos|left|guiLeft)\b/) || [])[1];
  if (!M.originY && /\b(?:topPos|top|guiTop)\b/.test(code))
    M.originY = (code.match(/\b(topPos|top|guiTop)\b/) || [])[1];
  return res;
}

/* ---- apply to the editor ---- */
function applyImport(res, mode) {
  const src = mode === "source";
  if (src || mode === "replace") {
    state.panel = { ...DEFAULT_PANEL, ...res.panel };
    state.elements = [];
    state.sel = null;
    state.source = null;
  }
  if (src) {
    state.source = {
      text: res.text,
      meta: res.meta,
      removed: [],
      panelOrig: { ...state.panel },
      pedit: res.pedit,
      name: res.panel.className || "Screen",
    };
  }
  res.elements.forEach((o) => {
    const { type, src: sr, orig, cond, ...p } = o;
    const e = makeEl(type);
    Object.assign(e, p);
    if (src) {
      e.src = sr;
      e.orig = orig;
      e.cond = cond;
    }
    state.elements.push(e);
  });
  if (res.elements.length)
    state.sel = state.elements[state.elements.length - 1].id;
  renderPanelTab();
  renderAll();
  if (src) {
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
        "Paste the source of a Screen class (or drop a .java file). It is edited in place: everything the editor does not touch stays exactly as you wrote it.",
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
          `${r.skipped.length} statement${r.skipped.length > 1 ? "s" : ""} stay untouched in your code (not shown on the canvas)`,
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
    if (f && /\.java$/i.test(f.name)) readJavaFile(f);
  });
}
