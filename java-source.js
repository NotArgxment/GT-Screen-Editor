'use strict';
/* ===== Source-preserving generator =====
   state.source.text is the user's original class. We only patch the exact ranges the editor recognized
   (coordinates, colors, strings, lambdas...) and insert snippets for NEW elements. Everything else stays byte-for-byte. */

let lastGenWarn = [];

/* add `d` to an integer expression, keeping it readable */
function foldDelta(text, d) {
  if (!d) return text;
  const t = text.trim();
  if (/^-?\d+$/.test(t)) return String(parseInt(t, 10) + d);
  const m = /^([\s\S]*?)\s*([+-])\s*(\d+)$/.exec(t);
  if (m && m[1]) {
    const k = (m[2] === '-' ? -1 : 1) * parseInt(m[3], 10) + d;
    return k === 0 ? m[1] : m[1] + (k > 0 ? ' + ' : ' - ') + Math.abs(k);
  }
  const base = /[?:&|<>=]/.test(t) ? '(' + t + ')' : t;
  return base + (d > 0 ? ' + ' : ' - ') + Math.abs(d);
}

function generateFromSource() {
  const S = state.source, text = S.text, M = S.meta, P = state.panel, O = S.panelOrig;
  const warn = []; const patches = [];
  const put = (s, e, t) => patches.push({ s, e, t });
  const code = stripJava(text);

  /* ---------- existing elements ---------- */
  const eq = (a, b) => a === b || (a == null && b == null);
  for (const e of state.elements) {
    if (!e.src) continue;
    const R = e.src.roles, o = e.orig, d = {};
    const addD = (list, v) => { if (!v || !list) return; list.forEach(r => { const k = r.s + ':' + r.e; (d[k] = d[k] || { r, v: 0 }).v += v; }); };
    const dx = (e.x | 0) - (o.x | 0), dy = (e.y | 0) - (o.y | 0), dw = (e.w | 0) - (o.w | 0), dh = (e.h | 0) - (o.h | 0);
    if (e.x !== undefined && o.x !== undefined) { addD(R.x, dx); addD(R.y, dy); }
    if (o.w !== undefined) { addD(R.w, dw); }
    if (o.h !== undefined) { addD(R.h, dh); }
    for (const k in d) { const { r, v } = d[k]; put(r.s, r.e, foldDelta(text.slice(r.s, r.e), v)); }

    const lit = (k, v) => { if (R[k] && !eq(v, o[k])) R[k].forEach(r => put(r.s, r.e, v)); };
    const num = (k, role) => { const rr = R[role || k]; if (rr && e[k] !== o[k]) rr.forEach(r => { const suf = (/[fFdDlL]$/.exec(text.slice(r.s, r.e)) || [''])[0]; put(r.s, r.e, String(e[k]) + suf); }); };
    const colorOf = (key, akey) => {
      const rr = R[key]; if (!rr) return;
      const ak = akey || (key === 'color' ? 'alpha' : 'alpha2');
      const hasA = ['rect', 'gradient', 'outline'].includes(e.type) && o[ak] !== undefined;
      const changed = e[key] !== o[key] || (hasA && e[ak] !== o[ak]);
      if (changed) rr.forEach(r => put(r.s, r.e, argb(e[key], hasA ? e[ak] : (r.a == null ? 255 : r.a))));
    };
    colorOf('color'); colorOf('color2');
    ['u', 'v', 'vh', 'texW', 'texH', 'smin', 'smax', 'sval', 'sstep', 'maxLen', 'scale'].forEach(k => {
      if (R[k] && e[k] !== o[k]) R[k].forEach(r => { const suf = k === 'scale' ? 'F' : (/[fFdDlL]$/.exec(text.slice(r.s, r.e)) || [''])[0]; put(r.s, r.e, String(e[k]) + suf); });
    });
    ['label', 'hint', 'tooltip', 'suffix'].forEach(k => { if (R[k] && e[k] !== o[k]) R[k].forEach(r => put(r.s, r.e, jstr(e[k]))); });
    if (R.text && e.text !== o.text) R.text.forEach(r => put(r.s, r.e, jstr(e.text)));
    if (R.textarg && (e.dynamic !== o.dynamic || e.text !== o.text || e.expr !== o.expr)) {
      const v = e.dynamic ? e.expr : jstr(e.text); R.textarg.forEach(r => put(r.s, r.e, v));
    }
    if (R.selected && e.selected !== o.selected) R.selected.forEach(r => put(r.s, r.e, String(!!e.selected)));
    if (R.shadow && e.shadow !== o.shadow) R.shadow.forEach(r => put(r.s, r.e, String(!!e.shadow)));
    if (R.action && e.action !== o.action) R.action.forEach(r => put(r.s, r.e, `${r.head} {\n            ${e.action || ''}\n        }`));
    if (e.type === 'progress') {
      if (R.cur && e.cur !== o.cur) R.cur.forEach(r => put(r.s, r.e, e.cur));
      if (R.max && e.max !== o.max) R.max.forEach(r => put(r.s, r.e, e.max));
      const horiz = e.dir === 'horizontal', mul = R[horiz ? '_wmul' : '_hmul'], sz = horiz ? 'w' : 'h';
      if (mul && e[sz] !== o[sz]) mul.forEach(r => put(r.s, r.e, (t => /^-?\d+$/.test(t.trim()) ? foldDelta(t, e[sz] - o[sz]) : '(' + foldDelta(t, e[sz] - o[sz]) + ')')(text.slice(r.s, r.e))));
    }
  }

  /* ---------- deleted elements ---------- */
  const deleted = new Set();
  const delStmt = (st) => {
    if (deleted.has(st.s)) return; deleted.add(st.s);
    let end = st.e; while (end < code.length && /\s/.test(code[end])) end++;
    const hasSemi = code[end] === ';'; let after = hasSemi ? end + 1 : st.e;
    let tail = after; while (tail < code.length && /\s/.test(code[tail])) tail++;
    if (/^else\b/.test(code.slice(tail, tail + 5))) { put(st.pre, st.e, ''); return; } /* leave a lone ';' so an `else` still has an `if` */
    let a = st.pre; while (a > 0 && (code[a - 1] === ' ' || code[a - 1] === '\t')) a--;
    let b = after; while (b < code.length && (code[b] === ' ' || code[b] === '\t')) b++;
    if ((a === 0 || code[a - 1] === '\n') && (code[b] === '\n' || code[b] === '\r')) { if (code[b] === '\r') b++; b++; put(a, b, ''); }
    else put(st.pre, after, '');
  };
  for (const r of S.removed || []) {
    const own = r.src.stmts;
    let keepCreate = false;
    if (r.name) {
      const re = new RegExp('\\b' + r.name + '\\b', 'g'); let n = 0, inOwn = 0;
      for (const m of code.matchAll(re)) { n++; if (own.some(s => m.index >= s.s && m.index < s.e + 1)) inOwn++; }
      keepCreate = n > inOwn && !/^(?:private|protected|public)\b/.test(code.slice(Math.max(0, code.lastIndexOf('\n', own[0].s)), own[0].s).trim());
    }
    if (keepCreate) {
      /* the variable is used elsewhere: keep the object, only stop adding it to the screen */
      own.filter(s => new RegExp('^(?:this\\.)?addRenderableWidget\\s*\\(\\s*' + r.name + '\\s*\\)$').test(code.slice(s.s, s.e).trim())).forEach(delStmt);
    } else own.forEach(delStmt);
  }

  /* ---------- new elements ---------- */
  const fresh = state.elements.filter(e => !e.src);
  const ins = []; /* {at, text} */
  if (fresh.length) {
    const wName = M.wName || null, hName = M.hName || null;
    const fallbackX = `((width - ${wName || P.w}) / 2)`, fallbackY = `((height - ${hName || P.h}) / 2)`;
    const isField = n => { if (!n) return false; const re = new RegExp('\\bint\\s+[^;(){}]*\\b' + n + '\\b[^;(){}]*;', 'g'); for (const m of code.matchAll(re)) { const i = m.index; const inM = [M.render, M.init].some(r => r && i >= r.s && i < r.e); if (!inM) return true; } return false; };
    const ox = M.originX, oy = M.originY;
    const Lr = ox ? (n => off(ox, n)) : (n => off(fallbackX, n)), Tr = oy ? (n => off(oy, n)) : (n => off(fallbackY, n));
    const Li = ox && isField(ox) ? Lr : (n => off(fallbackX, n)), Ti = oy && isField(oy) ? Tr : (n => off(fallbackY, n));
    const parts = genParts(fresh, { L: Lr, T: Tr, Li, Ti, src: code });
    const indent = (at, lines, extra) => { const ls = code.lastIndexOf('\n', at - 1) + 1; const ws = /^[ \t]*/.exec(code.slice(ls))[0] || '        '; return lines.map(l => ws + (extra || '') + l).join('\n') + '\n'; };
    const bodyIndent = '        ';
    const lineStart = i => code.lastIndexOf('\n', i - 1) + 1;
    const block = lines => lines.map(l => bodyIndent + l).join('\n') + '\n';

    /* imports */
    const need = [...parts.imp].filter(i => !M.imports.includes(i) && !M.imports.some(x => x.endsWith('.*') && i.startsWith(x.slice(0, -1)) && !i.slice(x.length - 1).includes('.')));
    if (parts.ratio === false && !need.length) { /* nothing */ }
    if (need.length) {
      const at = M.importEnd != null ? M.importEnd : (M.pkgEnd != null ? M.pkgEnd : 0);
      ins.push({ at, text: (M.importEnd != null ? '\n' : '\n\n') + need.sort().map(i => `import ${i};`).join('\n') });
    }
    /* fields / consts */
    const top = [...parts.consts, ...parts.fields];
    if (top.length && M.classOpen != null) ins.push({ at: M.classOpen, text: '\n' + top.map(l => '    ' + l).join('\n') + '\n' });
    /* render snippets */
    if (M.render) {
      if (parts.rend.length) {
        if (M.superRender != null) { const at = lineStart(M.superRender); ins.push({ at, text: block(parts.rend) + '\n' }); }
        else ins.push({ at: lineStart(M.render.e) , text: block(parts.rend) });
      }
      if (parts.post.length) ins.push({ at: lineStart(M.render.e), text: '\n' + block(parts.post) });
    } else if ((parts.rend.length || parts.post.length) && M.classEnd != null) {
      const body = ['', '    @Override', '    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {', ...parts.rend.map(l => '    ' + l), '        super.render(g, mouseX, mouseY, partialTick);', ...parts.post.map(l => '    ' + l), '    }'];
      ins.push({ at: M.classEnd, text: body.join('\n') + '\n' });
      ['net.minecraft.client.gui.GuiGraphics'].forEach(i => { if (!M.imports.includes(i)) ins.push({ at: M.importEnd != null ? M.importEnd : 0, text: `\nimport ${i};` }); });
    }
    /* init snippets */
    if (parts.init.length) {
      if (M.init) ins.push({ at: lineStart(M.init.e), text: block(parts.init) });
      else if (M.classEnd != null) ins.push({ at: M.classEnd, text: ['', '    @Override', '    protected void init() {', '        super.init();', ...parts.init.map(l => '        ' + l), '    }'].join('\n') + '\n' });
    }
    /* helper */
    if (parts.ratio && !M.hasRatio && M.classEnd != null)
      ins.push({ at: M.classEnd, text: '\n    private static float ratio(double cur, double max) {\n        return max <= 0 ? 0F : (float) Math.max(0, Math.min(1, cur / max));\n    }\n' });
  }

  /* ---------- screen / class level ---------- */
  const pe = new Set(S.pedit || []);
  if (pe.has('bg') && M.bgColor && (P.bg !== O.bg || P.bgA !== O.bgA)) M.bgColor.forEach(r => put(r.s, r.e, argb(P.bg, P.bgA)));
  if (pe.has('border') && M.borderColor && P.border !== O.border) M.borderColor.forEach(r => put(r.s, r.e, argb(P.border, r.a == null ? 255 : r.a)));
  if (pe.has('w') && M.wLit && P.w !== O.w) put(M.wLit.s, M.wLit.e, String(P.w));
  if (pe.has('h') && M.hLit && P.h !== O.h) put(M.hLit.s, M.hLit.e, String(P.h));
  if (pe.has('title') && M.titleLit && P.title !== O.title) put(M.titleLit.s, M.titleLit.e, jstr(P.title));
  if (pe.has('pause') && M.pauseLit && !!P.pause !== !!O.pause) put(M.pauseLit.s, M.pauseLit.e, String(!!P.pause));
  if (pe.has('pkg') && M.pkg && P.pkg !== O.pkg) put(M.pkg.s, M.pkg.e, P.pkg);
  const newName = ident(P.className, M.className || 'MyScreen');
  if (M.className && newName !== M.className) {
    const re = new RegExp('\\b' + M.className + '\\b', 'g');
    for (const m of code.matchAll(re)) {
      const ls = code.lastIndexOf('\n', m.index) + 1, q = (code.slice(ls, m.index).match(/(?<!\\)"/g) || []).length;
      if (q % 2 === 0) put(m.index, m.index + M.className.length, newName);
    }
  }

  /* ---------- apply ---------- */
  const all = patches.filter((p, i, a) => a.findIndex(q => q.s === p.s && q.e === p.e) === i).sort((a, b) => a.s - b.s || a.e - b.e);
  const good = []; let last = 0;
  for (const p of all) { if (p.s < last) { warn.push('Skipped an overlapping edit.'); continue; } good.push(p); last = p.e; }
  const ops = [...good.map(p => ({ s: p.s, e: p.e, t: p.t, k: 1 })), ...ins.map(i => ({ s: i.at, e: i.at, t: i.text, k: 0 }))].sort((a, b) => b.s - a.s || a.k - b.k);
  let outText = text;
  for (const p of ops) outText = outText.slice(0, p.s) + p.t + outText.slice(p.e);

  /* ---------- safety net: braces / parens must still balance ---------- */
  const bal = s => { const c = stripJava(s).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, ''); const n = ch => (c.match(new RegExp('\\' + ch, 'g')) || []).length; return [n('{') - n('}'), n('(') - n(')'), n('[') - n(']')]; };
  const b0 = bal(text), b1 = bal(outText);
  if (b0.join() !== b1.join()) { warn.push('The edit would unbalance the code; showing the original class instead.'); lastGenWarn = warn; return text; }
  lastGenWarn = warn; return outText;
}
