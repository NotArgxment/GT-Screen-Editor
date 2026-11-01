"use strict";
/* ===== State ===== */
const DEFAULT_PANEL = {
  w: 176,
  h: 110,
  bg: "#101820",
  bgA: 238,
  border: "#4a6fa5",
  borderOn: true,
  dim: true,
  pause: false,
  closeInvalid: false,
  title: "My screen",
  className: "MyScreen",
  pkg: "com.example.client",
  machine: "",
};
let state = {
  panel: { ...DEFAULT_PANEL },
  elements: [],
  sel: null,
  zoom: 4,
  nextId: 1,
};

const TYPES = {
  rect: { label: "Rectangle", fields: ["x", "y", "w", "h", "color", "alpha"] },
  gradient: {
    label: "Gradient",
    fields: ["x", "y", "w", "h", "color", "alpha", "color2", "alpha2"],
  },
  outline: { label: "Outline", fields: ["x", "y", "w", "h", "color", "alpha"] },
  progress: {
    label: "Progress bar",
    fields: ["x", "y", "w", "h", "color", "color2", "cur", "max", "dir", "pv"],
  },
  panel: { label: "Vanilla panel", fields: ["x", "y", "w", "h", "style"] },
  text: {
    label: "Text",
    fields: [
      "x",
      "y",
      "text",
      "dynamic",
      "expr",
      "sample",
      "color",
      "shadow",
      "align",
      "scale",
    ],
  },
  wraptext: { label: "Wrapped text", fields: ["x", "y", "w", "text", "color"] },
  texture: {
    label: "Texture",
    fields: ["x", "y", "w", "h", "path", "u", "v", "texW", "texH", "img"],
  },
  item: { label: "Item", fields: ["x", "y", "itemId", "count"] },
  slot: { label: "Slot", fields: ["x", "y", "itemId", "count"] },
  entity: { label: "Entity (player)", fields: ["x", "y", "scale"] },
  button: {
    label: "Button",
    fields: ["x", "y", "w", "h", "name", "label", "tooltip", "action"],
  },
  imagebutton: {
    label: "Image button",
    fields: [
      "x",
      "y",
      "w",
      "h",
      "path",
      "u",
      "v",
      "vh",
      "texW",
      "texH",
      "img",
      "action",
    ],
  },
  cycle: {
    label: "Cycle button",
    fields: ["x", "y", "w", "h", "name", "label", "opts", "action"],
  },
  slider: {
    label: "Slider",
    fields: [
      "x",
      "y",
      "w",
      "h",
      "name",
      "label",
      "suffix",
      "smin",
      "smax",
      "sval",
      "sstep",
    ],
  },
  editbox: {
    label: "Text field",
    fields: ["x", "y", "w", "h", "name", "hint", "maxLen"],
  },
  textarea: {
    label: "Text area",
    fields: ["x", "y", "w", "h", "name", "hint"],
  },
  checkbox: {
    label: "Checkbox",
    fields: ["x", "y", "w", "h", "name", "label", "selected"],
  },
  tooltip: { label: "Tooltip zone", fields: ["x", "y", "w", "h", "tooltip"] },
};
const GROUPS = [
  ["Shapes", ["rect", "gradient", "outline", "progress", "panel"]],
  ["Content", ["text", "wraptext", "texture", "item", "slot", "entity"]],
  [
    "Widgets",
    [
      "button",
      "imagebutton",
      "cycle",
      "slider",
      "editbox",
      "textarea",
      "checkbox",
    ],
  ],
  ["Utility", ["tooltip"]],
];
const WIDGETS = [
  "button",
  "editbox",
  "checkbox",
  "slider",
  "cycle",
  "imagebutton",
  "textarea",
];
const NO_HANDLE = ["text", "item", "slot", "entity"];
const FIELD = {
  x: ["X", "num"],
  y: ["Y", "num"],
  w: ["Width", "num"],
  h: ["Height", "num"],
  color: ["Color", "color"],
  alpha: ["Alpha 0-255", "num"],
  color2: ["Color 2", "color"],
  alpha2: ["Alpha 2", "num"],
  text: ["Text", "text"],
  dynamic: ["Dynamic", "bool"],
  expr: ["Java expression", "text"],
  sample: ["Preview", "text"],
  shadow: ["Shadow", "bool"],
  align: ["Alignment", "select", ["left", "center"]],
  scale: ["Scale", "num"],
  cur: ["Current value (Java)", "text"],
  max: ["Max value (Java)", "text"],
  dir: ["Direction", "select", ["horizontal", "vertical"]],
  pv: ["Preview %", "num"],
  path: ["ResourceLocation", "text"],
  u: ["u", "num"],
  v: ["v", "num"],
  vh: ["v on hover", "num"],
  texW: ["Texture width", "num"],
  texH: ["Texture height", "num"],
  img: ["Image (preview)", "file"],
  itemId: ["Item ID", "text"],
  count: ["Count", "num"],
  name: ["Field name", "text"],
  label: ["Label", "text"],
  tooltip: ["Tooltip", "text"],
  action: ["Action (Java)", "text"],
  hint: ["Hint", "text"],
  maxLen: ["Max length", "num"],
  selected: ["Checked", "bool"],
  style: ["Style", "select", ["container", "inset"]],
  opts: ["Options (comma)", "text"],
  suffix: ["Suffix", "text"],
  smin: ["Minimum", "num"],
  smax: ["Maximum", "num"],
  sval: ["Initial value", "num"],
  sstep: ["Step", "num"],
};

function makeEl(type) {
  const k = (state.nextId % 8) * 6;
  const base = { id: state.nextId++, type, x: 8 + k, y: 8 + k };
  const d = {
    rect: { w: 60, h: 20, color: "#2a3a55", alpha: 255 },
    gradient: {
      w: 60,
      h: 20,
      color: "#2a3a55",
      alpha: 255,
      color2: "#101820",
      alpha2: 255,
    },
    outline: { w: 60, h: 20, color: "#ffffff", alpha: 255 },
    progress: {
      w: 100,
      h: 8,
      color: "#4aa3ff",
      color2: "#000000",
      cur: "60",
      max: "100",
      dir: "horizontal",
      pv: 60,
    },
    panel: { w: 70, h: 40, style: "container" },
    text: {
      text: "Text",
      dynamic: false,
      expr: "String.valueOf(123)",
      sample: "123",
      color: "#ffffff",
      shadow: false,
      align: "left",
      scale: 1,
    },
    wraptext: {
      w: 80,
      text: "A long text that wraps across several lines.",
      color: "#ffffff",
    },
    texture: {
      w: 18,
      h: 18,
      path: "gtceu:textures/gui/widget/slot.png",
      u: 0,
      v: 0,
      texW: 18,
      texH: 18,
      imgData: "",
    },
    item: { itemId: "minecraft:diamond", count: 1 },
    slot: { itemId: "", count: 1 },
    entity: { scale: 30 },
    button: {
      w: 60,
      h: 20,
      name: "",
      label: "Button",
      tooltip: "",
      action: "// TODO",
    },
    imagebutton: {
      w: 20,
      h: 20,
      path: "minecraft:textures/gui/widgets.png",
      u: 0,
      v: 66,
      vh: 20,
      texW: 256,
      texH: 256,
      imgData: "",
      action: "// TODO",
    },
    cycle: {
      w: 80,
      h: 20,
      name: "",
      label: "Mode",
      opts: "Auto,Manual,Off",
      action: "// TODO",
    },
    slider: {
      w: 100,
      h: 20,
      name: "",
      label: "Value: ",
      suffix: "%",
      smin: 0,
      smax: 100,
      sval: 50,
      sstep: 1,
    },
    editbox: { w: 80, h: 16, name: "", hint: "Type here...", maxLen: 32 },
    textarea: { w: 100, h: 50, name: "", hint: "Notes..." },
    checkbox: { w: 20, h: 20, name: "", label: "Option", selected: false },
    tooltip: { w: 40, h: 20, tooltip: "Tooltip text" },
  }[type];
  return Object.assign(base, d);
}

/* ===== Utilities ===== */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "style") n.style.cssText = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => n.append(c));
  return n;
};
const IC = {
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5" fill="currentColor" fill-opacity=".85" stroke="none"/>',
  gradient:
    '<rect x="4" y="5" width="16" height="3.5" rx="1" fill="currentColor" stroke="none"/><rect x="4" y="10.2" width="16" height="3.5" rx="1" fill="currentColor" fill-opacity=".55" stroke="none"/><rect x="4" y="15.5" width="16" height="3.5" rx="1" fill="currentColor" fill-opacity=".22" stroke="none"/>',
  outline:
    '<rect x="4.5" y="6.5" width="15" height="11" rx="1.5" stroke-dasharray="3 2.2"/>',
  progress:
    '<rect x="3.5" y="9" width="17" height="6" rx="1.5"/><rect x="5.5" y="11" width="7" height="2" rx=".5" fill="currentColor" stroke="none"/>',
  panel:
    '<rect x="3.5" y="5.5" width="17" height="13" rx="1"/><rect x="7" y="9" width="10" height="6" rx=".5" stroke-opacity=".6"/>',
  text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  wraptext: '<path d="M4 6h16M4 11h16M4 16h9"/>',
  texture:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  item: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  slot: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><path d="M12 8.5l3 1.6v3.3l-3 1.6-3-1.6v-3.3z"/>',
  entity:
    '<circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  button:
    '<rect x="3.5" y="7" width="17" height="10" rx="2.5"/><path d="M8.5 12h7"/>',
  imagebutton:
    '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.5" r="1.4"/><path d="M5 17l4.5-4 3.5 3 2.5-2 3 3"/>',
  cycle:
    '<path d="M17 9a6 6 0 0 0-10-1.5M7 15a6 6 0 0 0 10 1.5M6.5 4v4h4M17.5 20v-4h-4"/>',
  slider:
    '<path d="M3 12h18"/><circle cx="14" cy="12" r="3" fill="currentColor"/>',
  editbox:
    '<rect x="3.5" y="7" width="17" height="10" rx="2"/><path d="M7.5 10v4"/>',
  textarea:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7 9h10M7 13h10M7 16h5"/>',
  checkbox:
    '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M8.5 12.2l2.5 2.5 4.5-5"/>',
  tooltip:
    '<rect x="3.5" y="4.5" width="17" height="11" rx="2"/><path d="M9 15.5l3 4 3-4"/>',
  /* UI */
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:
    '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  alL: '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>',
  alC: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  alR: '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>',
  alT: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>',
  alM: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  alB: '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>',
  none: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>',
};
const icon = (t, s = 18) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  n.setAttribute("viewBox", "0 0 24 24");
  n.setAttribute("width", s);
  n.setAttribute("height", s);
  n.setAttribute("fill", "none");
  n.setAttribute("stroke", "currentColor");
  n.setAttribute("stroke-width", "1.7");
  n.setAttribute("stroke-linecap", "round");
  n.setAttribute("stroke-linejoin", "round");
  n.innerHTML = IC[t] || "";
  return n;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexA = (hex, a) => {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16),
    g = parseInt(m.slice(2, 4), 16),
    b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(a, 0, 255) / 255})`;
};
const argb = (hex, a) =>
  "0x" +
  clamp(Math.round(a), 0, 255).toString(16).padStart(2, "0").toUpperCase() +
  hex.replace("#", "").toUpperCase();
const jstr = (s) =>
  '"' +
  String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") +
  '"';
const ident = (s, fb) => {
  s = (s || "").replace(/[^A-Za-z0-9_]/g, "_");
  return !s || /^\d/.test(s) ? fb : s;
};
const off = (base, n) =>
  n === 0 ? base : n > 0 ? `${base} + ${n}` : `${base} - ${-n}`;
const sel = () => state.elements.find((e) => e.id === state.sel);

/* ===== History (undo / redo) ===== */
const hist = { stack: [], i: -1, t: null };
const canEdit = (e, k) => !e.src || e.src.edit.includes(k);
const snap = () =>
  JSON.stringify({
    panel: state.panel,
    elements: state.elements,
    nextId: state.nextId,
    source: state.source || null,
  });
function commit() {
  clearTimeout(hist.t);
  hist.t = null;
  const s = snap();
  if (hist.stack[hist.i] === s) return;
  hist.stack = hist.stack.slice(0, hist.i + 1);
  hist.stack.push(s);
  if (hist.stack.length > 60) hist.stack.shift();
  hist.i = hist.stack.length - 1;
}
function save() {
  try {
    localStorage.setItem("screen-editor", JSON.stringify(state));
  } catch (e) {}
  clearTimeout(hist.t);
  hist.t = setTimeout(commit, 350);
}
function restore(s) {
  const o = JSON.parse(s);
  state.panel = o.panel;
  state.elements = o.elements;
  state.nextId = o.nextId;
  state.source = o.source || null;
  if (!sel()) state.sel = null;
  renderPanelTab();
  renderAll();
}
function undo() {
  if (hist.t) commit();
  if (hist.i > 0) {
    hist.i--;
    restore(hist.stack[hist.i]);
  }
}
function redo() {
  if (hist.t) commit();
  if (hist.i < hist.stack.length - 1) {
    hist.i++;
    restore(hist.stack[hist.i]);
  }
}

/* ===== Canvas rendering ===== */
const isWidget = (e) => WIDGETS.includes(e.type);
function bevel(n, style, bw, z) {
  const c =
    style === "inset"
      ? ["#8b8b8b", "#373737", "#ffffff"]
      : ["#c6c6c6", "#ffffff", "#555555"];
  n.style.background = c[0];
  n.style.boxShadow = `inset ${bw * z}px ${bw * z}px 0 ${c[1]}, inset -${bw * z}px -${bw * z}px 0 ${c[2]}`;
}
function texBG(n, e, z) {
  if (e.imgData) {
    n.style.backgroundImage = `url(${e.imgData})`;
    n.style.backgroundSize = `${e.texW * z}px ${e.texH * z}px`;
    n.style.backgroundPosition = `${-e.u * z}px ${-e.v * z}px`;
    n.style.imageRendering = "pixelated";
  } else {
    n.style.background =
      "repeating-conic-gradient(#555 0 25%,#333 0 50%) 0 0/16px 16px";
    n.append(
      el(
        "div",
        { style: "font-size:10px;color:#fff;padding:2px;overflow:hidden" },
        "no image",
      ),
    );
  }
}
function renderStage() {
  const st = $("#stage"),
    z = state.zoom,
    P = state.panel;
  st.className = "";
  st.style.width = P.w * z + "px";
  st.style.height = P.h * z + "px";
  st.innerHTML = "";
  const c = hexA(P.bg, P.bgA);
  const bg = el("div", {
    style: `position:absolute;inset:0;pointer-events:none;background:linear-gradient(${c},${c}),repeating-conic-gradient(#2c2c2c 0 25%,#3a3a3a 0 50%) 0 0/${8 * z}px ${8 * z}px;${P.borderOn ? `outline:${z}px solid ${P.border};outline-offset:-${z}px` : ""}`,
  });
  st.append(bg);
  const vis = state.elements.filter((e) => !e.hidden);
  [...vis.filter((e) => !isWidget(e)), ...vis.filter(isWidget)].forEach((e) =>
    st.append(buildEl(e, z)),
  );
  if ($("#grid").checked)
    st.append(
      el("div", {
        style: `position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff16 1px,transparent 1px),linear-gradient(90deg,#ffffff16 1px,transparent 1px);background-size:${8 * z}px ${8 * z}px`,
      }),
    );
  $("#dims").textContent = `${P.w} × ${P.h} px`;
  $("#zoompct").textContent = z * 100 + "%";
  $("#zoomv").textContent = z + "×";
  $("#doctitle").textContent =
    `${ident(P.className, "MyScreen")}.java @ ${z * 100}%`;
  drawRulers();
}

function buildEl(e, z) {
  const n = el("div", {
    class:
      "el" + (e.id === state.sel ? " sel" : "") + (e.locked ? " locked" : ""),
    "data-id": e.id,
  });
  n.style.left = e.x * z + "px";
  n.style.top = e.y * z + "px";
  const fs = 8 * z * 0.9;
  const size = () => {
    n.style.width = e.w * z + "px";
    n.style.height = e.h * z + "px";
  };
  switch (e.type) {
    case "rect":
      size();
      n.style.background = hexA(e.color, e.alpha);
      break;
    case "gradient":
      size();
      n.style.background = `linear-gradient(${hexA(e.color, e.alpha)},${hexA(e.color2, e.alpha2)})`;
      break;
    case "outline":
      size();
      n.style.boxShadow = `inset 0 0 0 ${z}px ${hexA(e.color, e.alpha)}`;
      break;
    case "panel":
      size();
      bevel(n, e.style, 2, z);
      break;
    case "text": {
      const t = el("div", { class: "mctext" }, e.dynamic ? e.sample : e.text);
      t.style.fontSize = fs * e.scale + "px";
      t.style.color = e.color;
      if (e.shadow || e.align === "center")
        t.style.textShadow = `${z}px ${z}px 0 #0008`;
      if (e.align === "center") t.style.transform = "translateX(-50%)";
      n.append(t);
      break;
    }
    case "wraptext": {
      n.style.width = e.w * z + "px";
      n.classList.add("mcwrap");
      n.style.fontSize = fs + "px";
      n.style.lineHeight = 9 * z + "px";
      n.style.color = e.color;
      n.textContent = e.text;
      break;
    }
    case "progress": {
      size();
      n.style.background = e.color2;
      n.append(
        el("div", {
          style:
            `position:absolute;background:${e.color};` +
            (e.dir === "horizontal"
              ? `left:0;top:0;bottom:0;width:${clamp(e.pv, 0, 100)}%`
              : `left:0;right:0;bottom:0;height:${clamp(e.pv, 0, 100)}%`),
        }),
      );
      break;
    }
    case "texture":
      size();
      texBG(n, e, z);
      break;
    case "imagebutton":
      size();
      texBG(n, e, z);
      break;
    case "item":
    case "slot": {
      const slot = e.type === "slot",
        s = slot ? 18 : 16;
      n.style.width = n.style.height = s * z + "px";
      if (slot) bevel(n, "inset", 1, z);
      else n.style.background = "#8b8b8b55";
      const nm = (e.itemId || "").split(":").pop();
      if (nm || !slot) {
        const it = el(
          "div",
          {
            class: "mcitem",
            style: `position:absolute;left:${slot ? z : 0}px;top:${slot ? z : 0}px;width:${16 * z}px;height:${16 * z}px;font-size:${Math.max(8, z * 2.5)}px;padding:1px`,
          },
          nm,
        );
        if (e.count > 1)
          it.append(
            el("u", { style: `font-size:${z * 2.4}px` }, String(e.count)),
          );
        n.append(it);
      }
      break;
    }
    case "entity": {
      const sc = e.scale,
        w = sc * 0.6,
        h = sc * 1.8;
      n.classList.add("mcent");
      n.style.width = w * z + "px";
      n.style.height = h * z + "px";
      n.style.left = (e.x - w / 2) * z + "px";
      n.style.top = (e.y - h) * z + "px";
      n.textContent = "Player";
      break;
    }
    case "button":
      size();
      n.classList.add("mcbtn");
      n.style.fontSize = fs + "px";
      n.textContent = e.label;
      break;
    case "cycle":
      size();
      n.classList.add("mcbtn");
      n.style.fontSize = fs + "px";
      n.textContent = `${e.label}: ${(e.opts || "").split(",")[0].trim()}`;
      break;
    case "slider": {
      size();
      n.classList.add("mcslider");
      n.style.fontSize = fs + "px";
      const f = clamp((e.sval - e.smin) / (e.smax - e.smin || 1), 0, 1);
      n.append(
        el("b", { style: `left:calc(${f * 100}% - ${f * 8}px)` }),
        el("span", {}, `${e.label}${e.sval}${e.suffix}`),
      );
      break;
    }
    case "editbox":
      size();
      n.classList.add("mcedit");
      n.style.fontSize = fs + "px";
      n.textContent = e.hint;
      break;
    case "textarea":
      size();
      n.classList.add("mcedit", "multi");
      n.style.fontSize = fs + "px";
      n.textContent = e.hint;
      break;
    case "tooltip":
      size();
      n.classList.add("mctip");
      n.style.fontSize = Math.max(8, z * 2) + "px";
      n.textContent = "tooltip";
      break;
    case "checkbox": {
      size();
      n.classList.add("mccheck");
      n.style.fontSize = fs + "px";
      const b = el("i");
      b.style.width = b.style.height = e.h * z + "px";
      if (e.selected) b.style.boxShadow = "inset 0 0 0 " + z * 4 + "px #5cff7a";
      n.style.width = "";
      n.append(b, e.label);
      break;
    }
  }
  if (!NO_HANDLE.includes(e.type)) n.append(el("div", { class: "rs" }));
  n.addEventListener("pointerdown", (ev) =>
    startDrag(ev, e, ev.target.classList.contains("rs")),
  );
  return n;
}

/* ===== Dragging ===== */
function startDrag(ev, e, resize) {
  ev.preventDefault();
  ev.stopPropagation();
  if (state.sel !== e.id) {
    state.sel = e.id;
    renderAll(false);
  }
  if (e.locked) return;
  const z = state.zoom,
    sx = ev.clientX,
    sy = ev.clientY,
    ox = e.x,
    oy = e.y,
    ow = e.w,
    oh = e.h;
  const mv = (m) => {
    const dx = Math.round((m.clientX - sx) / z),
      dy = Math.round((m.clientY - sy) / z);
    if (resize) {
      if (ow !== undefined && canEdit(e, "w")) e.w = Math.max(1, ow + dx);
      if (oh !== undefined && canEdit(e, "h")) e.h = Math.max(1, oh + dy);
    } else {
      if (canEdit(e, "x")) e.x = ox + dx;
      if (canEdit(e, "y")) e.y = oy + dy;
    }
    renderStage();
    renderProps();
    renderOptions();
    renderCode();
  };
  const up = () => {
    removeEventListener("pointermove", mv);
    removeEventListener("pointerup", up);
    save();
  };
  addEventListener("pointermove", mv);
  addEventListener("pointerup", up);
}

/* ===== Rulers ===== */
function drawRulers() {
  const area = $("#canvas-area");
  const on = $("#rulers").checked;
  area.classList.toggle("norulers", !on);
  if (!on) return;
  const wrap = $("#stage-wrap"),
    st = $("#stage"),
    dpr = window.devicePixelRatio || 1,
    z = state.zoom;
  const wr = wrap.getBoundingClientRect(),
    sr = st.getBoundingClientRect();
  const setup = (c, w, h) => {
    c.width = Math.max(1, w * dpr);
    c.height = Math.max(1, h * dpr);
    c.style.width = w + "px";
    c.style.height = h + "px";
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#2f2f2f";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#7a7a7a";
    g.fillStyle = "#a5a5a5";
    g.font = '9px "Segoe UI",system-ui,sans-serif';
    g.lineWidth = 1;
    return g;
  };
  const step = [1, 2, 5, 10, 20, 50, 100, 200].find((s) => s * z >= 44) || 200;
  const minor = step >= 10 ? step / 5 : step > 1 ? 1 : 0;
  const E = sel();
  let band = null;
  if (E && !E.hidden) {
    const nd = $(`.el[data-id="${E.id}"]`);
    if (nd) band = nd.getBoundingClientRect();
  }
  const W = wrap.clientWidth,
    H = wrap.clientHeight;
  // horizontal
  let g = setup($("#ruler-h"), W, 20);
  const x0 = sr.left - wr.left;
  if (band) {
    g.fillStyle = "rgba(45,140,235,.35)";
    g.fillRect(band.left - wr.left, 0, band.width, 20);
    g.fillStyle = "#a5a5a5";
  }
  for (
    let v = Math.floor(-x0 / z / (minor || step)) * (minor || step);
    x0 + v * z <= W;
    v += minor || step
  ) {
    const px = Math.round(x0 + v * z) + 0.5;
    if (px < 0) continue;
    const major = v % step === 0;
    g.beginPath();
    g.moveTo(px, major ? 4 : 15);
    g.lineTo(px, 20);
    g.stroke();
    if (major) g.fillText(v, px + 3, 11);
  }
  // vertical
  g = setup($("#ruler-v"), 20, H);
  const y0 = sr.top - wr.top;
  if (band) {
    g.fillStyle = "rgba(45,140,235,.35)";
    g.fillRect(0, band.top - wr.top, 20, band.height);
    g.fillStyle = "#a5a5a5";
  }
  for (
    let v = Math.floor(-y0 / z / (minor || step)) * (minor || step);
    y0 + v * z <= H;
    v += minor || step
  ) {
    const py = Math.round(y0 + v * z) + 0.5;
    if (py < 0) continue;
    const major = v % step === 0;
    g.beginPath();
    g.moveTo(major ? 4 : 15, py);
    g.lineTo(20, py);
    g.stroke();
    if (major) {
      g.save();
      g.translate(11, py + 3);
      g.rotate(-Math.PI / 2);
      g.fillText(v, 0, 0);
      g.restore();
    }
  }
}

/* ===== Toolbar / layers ===== */
function addType(t) {
  const e = makeEl(t);
  state.elements.push(e);
  state.sel = e.id;
  renderAll();
}
function renderToolbar() {
  const tb = $("#toolbar");
  tb.innerHTML = "";
  for (const [, types] of GROUPS)
    tb.append(
      el(
        "div",
        { class: "tgroup" },
        types.map((t) =>
          el(
            "button",
            {
              class: "tool",
              title: "Add · " + TYPES[t].label,
              "aria-label": TYPES[t].label,
              onclick: () => addType(t),
            },
            icon(t, 20),
          ),
        ),
      ),
    );
}
function renderLayers() {
  const ul = $("#layers");
  ul.innerHTML = "";
  $("#layer-count").textContent = state.elements.length;
  if (!state.elements.length)
    ul.append(
      el(
        "p",
        { class: "empty" },
        "No layers. Pick a tool from the left toolbar.",
      ),
    );
  [...state.elements].reverse().forEach((e) => {
    const lbl = `${TYPES[e.type].label}${e.name ? " · " + e.name : e.type === "text" ? " · " + (e.dynamic ? "{expr}" : e.text) : ""}`;
    ul.append(
      el(
        "li",
        {
          class: (e.id === state.sel ? "sel " : "") + (e.hidden ? "hid" : ""),
          onclick: () => {
            state.sel = e.id;
            renderAll();
          },
        },
        el(
          "button",
          {
            class: "vis" + (e.hidden ? " off" : ""),
            title: e.hidden ? "Show" : "Hide (editor only)",
            onclick: (ev) => {
              ev.stopPropagation();
              act(() => {
                e.hidden = !e.hidden;
                renderAll();
              })();
            },
          },
          icon(e.hidden ? "eyeoff" : "eye", 15),
        ),
        el("span", { class: "th" }, icon(e.type, 16)),
        el("span", { class: "nm" }, lbl),
        el(
          "button",
          {
            class: "vis" + (e.locked ? "" : " off"),
            title: e.locked ? "Unlock" : "Lock",
            style: e.locked ? "" : "opacity:.35",
            onclick: (ev) => {
              ev.stopPropagation();
              act(() => {
                e.locked = !e.locked;
                renderAll();
              })();
            },
          },
          icon("lock", 14),
        ),
      ),
    );
  });
}
function renderLayerTools() {
  const f = $("#layer-tools");
  f.innerHTML = "";
  const b = (ic, title, fn, cls = "") =>
    f.append(el("button", { class: cls, title, onclick: fn }, icon(ic, 15)));
  b("up", "Move layer up", () => reorder("up"));
  b("down", "Move layer down", () => reorder("down"));
  b("dup", "Duplicate (Ctrl+D)", dup);
  b(
    "trash",
    "Delete (Del)",
    () => {
      const e = sel();
      if (e) remove(e.id);
    },
    "x",
  );
}
function reorder(mode) {
  const a = state.elements,
    i = a.findIndex((e) => e.id === state.sel);
  if (i < 0) return;
  if (a[i].src) {
    alert(
      "Layer order follows your code order, so it cannot be changed for imported elements. Use File > Detach from source to rebuild the class from layers.",
    );
    return;
  }
  const [e] = a.splice(i, 1);
  const j =
    mode === "front"
      ? a.length
      : mode === "back"
        ? 0
        : clamp(i + (mode === "up" ? 1 : -1), 0, a.length);
  a.splice(j, 0, e);
  renderAll();
}
function toggle(k) {
  const e = sel();
  if (!e) return;
  e[k] = !e[k];
  renderAll();
}
function remove(id) {
  const d = state.elements.find((e) => e.id === id);
  if (d && d.src && state.source)
    state.source.removed.push({ src: d.src, name: d.name || "" });
  state.elements = state.elements.filter((e) => e.id !== id);
  if (state.sel === id) state.sel = null;
  renderAll();
}
function dup() {
  const e = sel();
  if (!e) return;
  const c = { ...e, id: state.nextId++, x: e.x + 4, y: e.y + 4, locked: false };
  delete c.src;
  delete c.orig;
  delete c.cond;
  if (c.name) c.name += "2";
  state.elements.push(c);
  state.sel = c.id;
  renderAll();
}

/* ===== Align relative to the screen ===== */
function align(mode) {
  const e = sel();
  if (!e || e.locked) return;
  const nd = $(`.el[data-id="${e.id}"]`);
  if (!nd) return;
  const z = state.zoom,
    sr = $("#stage").getBoundingClientRect(),
    r = nd.getBoundingClientRect(),
    P = state.panel;
  const bx = (r.left - sr.left) / z,
    by = (r.top - sr.top) / z,
    w = r.width / z,
    h = r.height / z;
  if (mode === "l") e.x += Math.round(0 - bx);
  if (mode === "c") e.x += Math.round((P.w - w) / 2 - bx);
  if (mode === "r") e.x += Math.round(P.w - w - bx);
  if (mode === "t") e.y += Math.round(0 - by);
  if (mode === "m") e.y += Math.round((P.h - h) / 2 - by);
  if (mode === "b") e.y += Math.round(P.h - h - by);
  renderAll();
}
function renderAligns() {
  const a = $("#aligns");
  a.innerHTML = "";
  [
    ["alL", "l", "Align left"],
    ["alC", "c", "Center horizontally"],
    ["alR", "r", "Align right"],
    ["alT", "t", "Align top"],
    ["alM", "m", "Center vertically"],
    ["alB", "b", "Align bottom"],
  ].forEach(([ic, m, t]) =>
    a.append(
      el(
        "button",
        { title: t, "data-al": m, onclick: () => align(m) },
        icon(ic, 16),
      ),
    ),
  );
}
function renderOptions() {
  const e = sel();
  const nm = $("#opt-name"),
    oi = $("#opt-ic");
  oi.innerHTML = "";
  oi.append(icon(e ? e.type : "none", 18));
  nm.textContent = e ? TYPES[e.type].label : "No selection";
  ["x", "y", "w", "h"].forEach((k) => {
    const i = $("#o-" + k);
    i.disabled =
      !e ||
      e[k] === undefined ||
      !canEdit(e, k) ||
      (e.type === "entity" && (k === "w" || k === "h"));
    if (i !== document.activeElement)
      i.value = e && e[k] !== undefined ? e[k] : "";
  });
  document.querySelectorAll("#aligns button").forEach((b) => (b.disabled = !e));
}

/* ===== Properties ===== */
function fieldRow(label, kind, value, onchange, opts) {
  let input;
  if (kind === "bool") {
    input = el("input", { type: "checkbox" });
    input.checked = !!value;
    input.onchange = () => onchange(input.checked);
  } else if (kind === "select") {
    input = el(
      "select",
      {},
      opts.map((o) => el("option", { value: o }, o)),
    );
    input.value = value;
    input.onchange = () => onchange(input.value);
  } else if (kind === "color") {
    const c = el("input", { type: "color" }),
      t = el("input", { type: "text", class: "hex", maxlength: 7 });
    c.value = t.value = value;
    c.oninput = () => {
      t.value = c.value;
      onchange(c.value);
    };
    t.oninput = () => {
      if (/^#[0-9a-f]{6}$/i.test(t.value)) {
        c.value = t.value.toLowerCase();
        onchange(c.value);
      }
    };
    input = el("div", { class: "colorrow" }, c, t);
  } else if (kind === "num") {
    input = el("input", { type: "number", step: "any" });
    input.value = value;
    input.oninput = () => onchange(parseFloat(input.value) || 0);
  } else if (kind === "file") {
    input = el("input", { type: "file", accept: "image/*" });
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        onchange(r.result);
      };
      r.readAsDataURL(f);
    };
  } else {
    input = el("input", { type: "text" });
    input.value = value ?? "";
    input.oninput = () => onchange(input.value);
  }
  return el("div", { class: "f" }, el("label", {}, label), input);
}

function renderProps() {
  const box = $("#tab-props");
  const e = sel();
  if (
    box.contains(document.activeElement) &&
    document.activeElement.tagName === "INPUT" &&
    box.dataset.id == (e && e.id) &&
    box.dataset.type === (e && e.type)
  ) {
    const names = e ? TYPES[e.type].fields : [];
    [...box.querySelectorAll(".f")].forEach((row, i) => {
      const inp = row.querySelector("input,select");
      const k = names[i];
      if (inp !== document.activeElement && inp && inp.type === "number")
        inp.value = e[k];
    });
    return;
  }
  box.innerHTML = "";
  box.dataset.id = e ? e.id : "";
  box.dataset.type = e ? e.type : "";
  if (!e) {
    box.append(
      el(
        "p",
        { class: "hint" },
        "Select a layer, or pick a tool from the left toolbar to add an element.",
      ),
    );
    return;
  }
  box.append(
    el(
      "div",
      { class: "elhead" },
      el("span", { class: "ic" }, icon(e.type, 18)),
      el(
        "div",
        {},
        TYPES[e.type].label,
        el("small", {}, `#${e.id} · ${e.type}`),
      ),
    ),
  );
  TYPES[e.type].fields.forEach((k) => {
    const [lab, kind, opts] = FIELD[k];
    const key = k === "img" ? "imgData" : k;
    const row = fieldRow(
      lab,
      kind,
      e[key],
      (v) => {
        e[key] = v;
        renderStage();
        renderLayers();
        renderOptions();
        renderCode();
        save();
      },
      opts,
    );
    if (!canEdit(e, k)) {
      row.classList.add("locked-src");
      row.querySelectorAll("input,select").forEach((i) => (i.disabled = true));
      row.title = "This value is computed in your code and is kept as is.";
    }
    box.append(row);
  });
  const hints = {
    text: 'Dynamic: uses the Java expression (returns a String or Component). With "center", X is the center of the text.',
    button:
      "The action runs on the client. To affect the machine you need a packet sent to the server.",
    imagebutton:
      'u/v = top-left corner of the normal texture; "v on hover" = vertical offset of the hover state. The loaded image is only a preview.',
    texture:
      "The loaded image is only a preview. The generated code uses the ResourceLocation.",
    cycle:
      "The action receives (btn, value). The first value in the list is the initial one.",
    slider: "Uses ForgeSlider (Forge). Read the value with field.getValue().",
    entity:
      "Draws the local player following the mouse. X/Y is the feet position.",
    tooltip:
      "In game, shows the text when the mouse hovers over the zone. In the editor it is only a guide.",
    wraptext: "Wraps into lines based on the width (drawWordWrap).",
    slot: "Only draws the slot background; it is not a real inventory slot (that requires an AbstractContainerScreen/Menu).",
    panel: "Reproduces the gray vanilla container background using rectangles.",
  };
  if (e.src && e.cond)
    box.append(
      el(
        "p",
        { class: "hint" },
        "Conditional in your code: if (" + e.cond + ")",
      ),
    );
  if (hints[e.type]) box.append(el("p", { class: "hint" }, hints[e.type]));
  box.append(
    el(
      "div",
      { class: "row" },
      el("button", { onclick: dup }, "Duplicate"),
      el("button", { onclick: () => remove(e.id) }, "Delete"),
    ),
  );
}

function renderPanelTab() {
  const box = $("#tab-panel");
  const P = state.panel;
  box.innerHTML = "";
  const add = (lab, key, kind, opts) => {
    const row = fieldRow(
      lab,
      kind,
      P[key],
      (v) => {
        P[key] = v;
        renderStage();
        renderCode();
        save();
      },
      opts,
    );
    if (state.source && !state.source.pedit.includes(key)) {
      row.classList.add("locked-src");
      row.querySelectorAll("input,select").forEach((i) => (i.disabled = true));
      row.title = "Defined in your code; kept as is.";
    }
    box.append(row);
  };
  box.append(el("h2", {}, "Size and background"));
  add("Width", "w", "num");
  add("Height", "h", "num");
  add("Background", "bg", "color");
  add("Background alpha", "bgA", "num");
  add("Border", "borderOn", "bool");
  add("Border color", "border", "color");
  box.append(el("h2", {}, "Behavior"));
  add("Dim background", "dim", "bool");
  add("Pause game", "pause", "bool");
  add("Close if machine invalid", "closeInvalid", "bool");
  box.append(el("h2", {}, "Class"));
  add("Title", "title", "text");
  add("Class name", "className", "text");
  add("Package", "pkg", "text");
  add("Machine (full class name)", "machine", "text");
  box.append(
    el(
      "p",
      { class: "hint" },
      'If you set the machine, the class receives an instance in its constructor and you can use "machine." in expressions.',
    ),
  );
}

/* ===== Code generator ===== */
/* Builds the Java snippets for a list of elements. o.L/o.T = origin helpers for render code, o.Li/o.Ti for init code, o.src = existing source (to avoid name clashes). */
function genParts(E, o = {}) {
  const imp = new Set();
  const consts = [],
    fields = [],
    init = [],
    rend = [],
    post = [];
  let ratio = false,
    texN = 0;
  const L0 = o.L || ((n) => off("left", n)),
    T0 = o.T || ((n) => off("top", n)),
    Li = o.Li || L0,
    Ti = o.Ti || T0;
  const taken = (n) => !!o.src && new RegExp("\\b" + n + "\\b").test(o.src);
  const used = new Set();
  const fname = (e, fb) => {
    let n = ident(e.name, fb);
    while (used.has(n) || taken(n)) n += "_";
    used.add(n);
    return n;
  };
  const tex = (e) => {
    let c;
    do {
      c = "TEX_" + ++texN;
    } while (taken(c));
    imp.add("net.minecraft.resources.ResourceLocation");
    consts.push(
      `private static final ResourceLocation ${c} = new ResourceLocation(${jstr(e.path)});`,
    );
    return c;
  };
  const bevelCode = (x, y, xr, yb, style, bw) => {
    const c =
      style === "inset"
        ? ["8B8B8B", "373737", "FFFFFF"]
        : ["C6C6C6", "FFFFFF", "555555"];
    rend.push(
      `g.fill(${x}, ${y}, ${xr}, ${yb}, 0xFF${c[0]});`,
      `g.fill(${x}, ${y}, ${off(xr, -bw)}, ${off(y, bw)}, 0xFF${c[1]});`,
      `g.fill(${x}, ${y}, ${off(x, bw)}, ${off(yb, -bw)}, 0xFF${c[1]});`,
      `g.fill(${off(x, bw)}, ${off(yb, -bw)}, ${xr}, ${yb}, 0xFF${c[2]});`,
      `g.fill(${off(xr, -bw)}, ${off(y, bw)}, ${xr}, ${yb}, 0xFF${c[2]});`,
    );
  };
  const itemCode = (x, y, id, count) => {
    [
      "net.minecraft.resources.ResourceLocation",
      "net.minecraft.world.item.ItemStack",
      "net.minecraftforge.registries.ForgeRegistries",
    ].forEach((s) => imp.add(s));
    const n = Math.max(1, Math.round(count) || 1);
    rend.push(
      "{",
      `    var item = ForgeRegistries.ITEMS.getValue(new ResourceLocation(${jstr(id)}));`,
      "    if (item != null) {",
      `        ItemStack stack = new ItemStack(item, ${n});`,
      `        g.renderItem(stack, ${x}, ${y});`,
      ...(n > 1
        ? [`        g.renderItemDecorations(font, stack, ${x}, ${y});`]
        : []),
      "    }",
      "}",
    );
  };

  E.forEach((e, i) => {
    const L = isWidget(e) ? Li : L0,
      T = isWidget(e) ? Ti : T0;
    const x = L(e.x),
      y = T(e.y),
      xr = L(e.x + e.w),
      yb = T(e.y + e.h);
    switch (e.type) {
      case "rect":
        rend.push(
          `g.fill(${x}, ${y}, ${xr}, ${yb}, ${argb(e.color, e.alpha)});`,
        );
        break;
      case "gradient":
        rend.push(
          `g.fillGradient(${x}, ${y}, ${xr}, ${yb}, ${argb(e.color, e.alpha)}, ${argb(e.color2, e.alpha2)});`,
        );
        break;
      case "outline":
        rend.push(
          `g.renderOutline(${x}, ${y}, ${e.w}, ${e.h}, ${argb(e.color, e.alpha)});`,
        );
        break;
      case "panel":
        bevelCode(x, y, xr, yb, e.style, 2);
        break;
      case "text": {
        const txt = e.dynamic ? e.expr : jstr(e.text),
          col = argb(e.color, 255);
        const draw = (px, py) =>
          e.align === "center"
            ? `g.drawCenteredString(font, ${txt}, ${px}, ${py}, ${col});`
            : `g.drawString(font, ${txt}, ${px}, ${py}, ${col}, ${!!e.shadow});`;
        if (e.scale !== 1) {
          rend.push(
            "g.pose().pushPose();",
            `g.pose().translate(${x}, ${y}, 0);`,
            `g.pose().scale(${e.scale}F, ${e.scale}F, 1F);`,
            draw("0", "0"),
            "g.pose().popPose();",
          );
        } else rend.push(draw(x, y));
        break;
      }
      case "wraptext":
        rend.push(
          `g.drawWordWrap(font, Component.literal(${jstr(e.text)}), ${x}, ${y}, ${e.w}, ${argb(e.color, 255)});`,
        );
        break;
      case "progress": {
        ratio = true;
        rend.push(
          `g.fill(${x}, ${y}, ${xr}, ${yb}, ${argb(e.color2, 255)});`,
          "{",
        );
        const r = `ratio(${e.cur}, ${e.max})`;
        if (e.dir === "horizontal")
          rend.push(
            `    int fw = (int) (${e.w} * ${r});`,
            `    if (fw > 0) g.fill(${x}, ${y}, ${off(x, 0)} + fw, ${yb}, ${argb(e.color, 255)});`,
          );
        else
          rend.push(
            `    int fh = (int) (${e.h} * ${r});`,
            `    if (fh > 0) g.fill(${x}, ${yb} - fh, ${xr}, ${yb}, ${argb(e.color, 255)});`,
          );
        rend.push("}");
        break;
      }
      case "texture": {
        const c = tex(e);
        rend.push(
          `g.blit(${c}, ${x}, ${y}, ${e.u}F, ${e.v}F, ${e.w}, ${e.h}, ${e.texW}, ${e.texH});`,
        );
        break;
      }
      case "item":
        itemCode(x, y, e.itemId, e.count);
        break;
      case "slot":
        bevelCode(x, y, L(e.x + 18), T(e.y + 18), "inset", 1);
        if ((e.itemId || "").trim())
          itemCode(L(e.x + 1), T(e.y + 1), e.itemId.trim(), e.count);
        break;
      case "entity":
        rend.push(
          "if (minecraft != null && minecraft.player != null) {",
          "    InventoryScreen.renderEntityInInventoryFollowsMouse(g, " +
            `${x}, ${y}, ${Math.round(e.scale)}, (float) (${x}) - mouseX, (float) (${y} - ${Math.round(e.scale * 1.67)}) - mouseY, minecraft.player);`,
          "}",
        );
        imp.add("net.minecraft.client.gui.screens.inventory.InventoryScreen");
        break;
      case "tooltip":
        post.push(
          `if (mouseX >= ${x} && mouseX < ${xr} && mouseY >= ${y} && mouseY < ${yb}) {`,
          `    g.renderTooltip(font, Component.literal(${jstr(e.tooltip)}), mouseX, mouseY);`,
          "}",
        );
        break;
      case "button": {
        imp.add("net.minecraft.client.gui.components.Button");
        let s = `addRenderableWidget(Button.builder(Component.literal(${jstr(e.label)}), b -> {\n            ${e.action || ""}\n        })\n                .bounds(${x}, ${y}, ${e.w}, ${e.h})`;
        if (e.tooltip) {
          imp.add("net.minecraft.client.gui.components.Tooltip");
          s += `\n                .tooltip(Tooltip.create(Component.literal(${jstr(e.tooltip)})))`;
        }
        init.push(s + "\n                .build());");
        break;
      }
      case "imagebutton": {
        imp.add("net.minecraft.client.gui.components.ImageButton");
        const c = tex(e);
        init.push(
          `addRenderableWidget(new ImageButton(${x}, ${y}, ${e.w}, ${e.h}, ${e.u}, ${e.v}, ${e.vh}, ${c}, ${e.texW}, ${e.texH}, b -> {`,
          `    ${e.action || ""}`,
          "}));",
        );
        break;
      }
      case "cycle": {
        imp.add("net.minecraft.client.gui.components.CycleButton");
        imp.add("java.util.List");
        const n = fname(e, "cycle" + (i + 1));
        const o = (e.opts || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!o.length) o.push("A");
        fields.push(`private CycleButton<String> ${n};`);
        init.push(
          `${n} = CycleButton.<String>builder(Component::literal)`,
          `        .withValues(List.of(${o.map(jstr).join(", ")}))`,
          `        .withInitialValue(${jstr(o[0])})`,
          `        .create(${x}, ${y}, ${e.w}, ${e.h}, Component.literal(${jstr(e.label)}), (btn, value) -> {`,
          `            ${e.action || ""}`,
          "        });",
          `addRenderableWidget(${n});`,
        );
        break;
      }
      case "slider": {
        imp.add("net.minecraftforge.client.gui.widget.ForgeSlider");
        const n = fname(e, "slider" + (i + 1));
        fields.push(`private ForgeSlider ${n};`);
        init.push(
          `${n} = new ForgeSlider(${x}, ${y}, ${e.w}, ${e.h}, Component.literal(${jstr(e.label)}), Component.literal(${jstr(e.suffix)}), ${e.smin}, ${e.smax}, ${e.sval}, ${e.sstep}, 0, true);`,
          `addRenderableWidget(${n});`,
        );
        break;
      }
      case "editbox": {
        imp.add("net.minecraft.client.gui.components.EditBox");
        const n = fname(e, "editBox" + (i + 1));
        fields.push(`private EditBox ${n};`);
        init.push(
          `${n} = new EditBox(font, ${x}, ${y}, ${e.w}, ${e.h}, Component.literal(${jstr(e.hint)}));`,
          `${n}.setMaxLength(${e.maxLen});`,
          `${n}.setHint(Component.literal(${jstr(e.hint)}));`,
          `addRenderableWidget(${n});`,
        );
        break;
      }
      case "textarea": {
        imp.add("net.minecraft.client.gui.components.MultiLineEditBox");
        const n = fname(e, "textArea" + (i + 1));
        fields.push(`private MultiLineEditBox ${n};`);
        init.push(
          `${n} = new MultiLineEditBox(font, ${x}, ${y}, ${e.w}, ${e.h}, Component.literal(${jstr(e.hint)}), Component.empty());`,
          `addRenderableWidget(${n});`,
        );
        break;
      }
      case "checkbox": {
        imp.add("net.minecraft.client.gui.components.Checkbox");
        const n = fname(e, "checkbox" + (i + 1));
        fields.push(`private Checkbox ${n};`);
        init.push(
          `${n} = new Checkbox(${x}, ${y}, ${e.w}, ${e.h}, Component.literal(${jstr(e.label)}), ${!!e.selected});`,
          `addRenderableWidget(${n});`,
        );
        break;
      }
    }
  });
  return { imp, consts, fields, init, rend, post, ratio };
}

function generateScratch() {
  const P = state.panel,
    E = state.elements;
  const { imp, consts, fields, init, rend, post, ratio } = genParts(E);
  [
    "net.minecraft.client.gui.GuiGraphics",
    "net.minecraft.client.gui.screens.Screen",
    "net.minecraft.network.chat.Component",
    "net.minecraftforge.api.distmarker.Dist",
    "net.minecraftforge.api.distmarker.OnlyIn",
  ].forEach((x) => imp.add(x));
  const cls = ident(P.className, "MyScreen");
  const mFull = (P.machine || "").trim(),
    mSimple = mFull ? mFull.split(".").pop() : "";
  if (mFull.includes(".")) imp.add(mFull);
  const o = [];
  o.push(`package ${P.pkg};`, "");
  [...imp].sort().forEach((s) => o.push(`import ${s};`));
  o.push(
    "",
    `/** Open on the client: Minecraft.getInstance().setScreen(new ${cls}(${mSimple ? "machine" : ""})); */`,
    "@OnlyIn(Dist.CLIENT)",
    `public class ${cls} extends Screen {`,
    "",
    `    private static final int W = ${P.w};`,
    `    private static final int H = ${P.h};`,
  );
  consts.forEach((c) => o.push("    " + c));
  o.push("");
  if (mSimple) o.push(`    private final ${mSimple} machine;`);
  fields.forEach((f) => o.push("    " + f));
  o.push("    private int left, top;", "");
  o.push(
    `    public ${cls}(${mSimple ? mSimple + " machine" : ""}) {`,
    `        super(Component.literal(${jstr(P.title)}));`,
  );
  if (mSimple) o.push("        this.machine = machine;");
  o.push("    }", "");
  o.push(
    "    @Override",
    "    public boolean isPauseScreen() {",
    `        return ${!!P.pause};`,
    "    }",
    "",
  );
  o.push(
    "    @Override",
    "    protected void init() {",
    "        left = (width - W) / 2;",
    "        top = (height - H) / 2;",
  );
  init.forEach((l) => o.push("        " + l));
  o.push("    }", "");
  if (mSimple && P.closeInvalid)
    o.push(
      "    @Override",
      "    public void tick() {",
      "        if (machine.isInValid()) onClose();",
      "    }",
      "",
    );
  o.push(
    "    @Override",
    "    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {",
  );
  if (P.dim) o.push("        renderBackground(g);");
  o.push(`        g.fill(left, top, left + W, top + H, ${argb(P.bg, P.bgA)});`);
  if (P.borderOn)
    o.push(`        g.renderOutline(left, top, W, H, ${argb(P.border, 255)});`);
  o.push("");
  rend.forEach((l) => o.push("        " + l));
  o.push(
    "",
    "        super.render(g, mouseX, mouseY, partialTick); // buttons, fields and tooltips",
  );
  if (post.length) {
    o.push("");
    post.forEach((l) => o.push("        " + l));
  }
  o.push("    }");
  if (ratio)
    o.push(
      "",
      "    private static float ratio(double cur, double max) {",
      "        return max <= 0 ? 0F : (float) Math.max(0, Math.min(1, cur / max));",
      "    }",
    );
  o.push("}", "");
  return o.join("\n");
}
const generate = () =>
  state.source ? generateFromSource() : generateScratch();
function detachSource() {
  if (!state.source) return;
  if (
    !confirm(
      "Rebuild the class from the layers? Code the editor does not model (variables, conditions, logic) will be lost.",
    )
  )
    return;
  commit();
  state.elements.forEach((e) => {
    delete e.src;
    delete e.orig;
    delete e.cond;
  });
  state.source = null;
  renderPanelTab();
  renderAll();
  commit();
}
function renderCode() {
  $("#code").value = generate();
  let n = $("#gen-note");
  if (!n) {
    n = el("p", { class: "hint", id: "gen-note" });
    $("#code").before(n);
  }
  n.textContent = state.source
    ? lastGenWarn.length
      ? lastGenWarn.join(" ")
      : "Editing your class in place: only the parts you changed are rewritten."
    : "";
}

/* ===== Global ===== */
function renderAll(props = true) {
  renderStage();
  renderLayers();
  renderOptions();
  if (props) renderProps();
  renderCode();
  save();
}

function newDoc() {
  if (confirm("Delete everything and start over?")) {
    state = {
      panel: { ...DEFAULT_PANEL },
      elements: [],
      sel: null,
      zoom: state.zoom,
      nextId: 1,
    };
    renderPanelTab();
    renderAll();
  }
}
const P_NAME = () => ident(state.panel.className, "screen");
function download(name, text, type) {
  const a = el("a", {
    href: URL.createObjectURL(new Blob([text], { type })),
    download: name,
  });
  document.body.append(a);
  a.click();
  a.remove();
}
const exportJson = () =>
  download(
    P_NAME() + ".json",
    JSON.stringify(state, null, 1),
    "application/json",
  );
const downloadJava = () =>
  download(
    ident(state.panel.className, "MyScreen") + ".java",
    $("#code").value,
    "text/x-java-source",
  );
async function copyCode() {
  const t = $("#code").value;
  try {
    await navigator.clipboard.writeText(t);
  } catch (e) {
    $("#code").select();
    document.execCommand("copy");
  }
  const b = $("#btn-copy");
  b.textContent = "Copied!";
  setTimeout(() => (b.textContent = "Copy code"), 1200);
}
function setZoom(v) {
  state.zoom = clamp(Math.round(v), 2, 8);
  $("#zoom").value = state.zoom;
  renderStage();
  save();
}

/* Discrete actions: each one is its own history step */
const act =
  (fn) =>
  (...a) => {
    commit();
    const r = fn(...a);
    commit();
    return r;
  };
addType = act(addType);
remove = act(remove);
dup = act(dup);
reorder = act(reorder);
toggle = act(toggle);
align = act(align);
newDoc = act(newDoc);
applyImport = act(applyImport);

/* ===== Menus ===== */
const MENUS = [
  [
    "File",
    [
      ["New…", newDoc],
      ["Import JSON…", () => $("#file-json").click()],
      ["Import Java…", () => openImport(), "Ctrl+V"],
      ["Export JSON", exportJson],
      ["Detach from source", detachSource],
      "-",
      ["Copy code", copyCode],
      ["Download .java", downloadJava],
    ],
  ],
  [
    "Edit",
    [
      ["Undo", undo, "Ctrl+Z"],
      ["Redo", redo, "Ctrl+Y"],
      "-",
      ["Duplicate", dup, "Ctrl+D"],
      [
        "Delete",
        () => {
          const e = sel();
          if (e) remove(e.id);
        },
        "Del",
      ],
      [
        "Deselect",
        () => {
          state.sel = null;
          renderAll();
        },
        "Esc",
      ],
    ],
  ],
  [
    "Layer",
    [
      ["Bring to front", () => reorder("front")],
      ["Move up", () => reorder("up")],
      ["Move down", () => reorder("down")],
      ["Send to back", () => reorder("back")],
      "-",
      ["Show / hide", () => toggle("hidden")],
      ["Lock / unlock", () => toggle("locked")],
    ],
  ],
  [
    "View",
    [
      ["Zoom in", () => setZoom(state.zoom + 1), "Ctrl+Wheel"],
      ["Zoom out", () => setZoom(state.zoom - 1)],
      "-",
      ["Grid", () => $("#grid").click(), "", () => $("#grid").checked],
      ["Rulers", () => $("#rulers").click(), "", () => $("#rulers").checked],
    ],
  ],
];
function renderMenus() {
  const host = $("#menus");
  host.innerHTML = "";
  const closeAll = () =>
    host.querySelectorAll(".menu").forEach((m) => m.classList.remove("open"));
  MENUS.forEach(([name, items]) => {
    const drop = el("div", { class: "mdrop" });
    const menu = el(
      "div",
      { class: "menu" },
      el("button", { class: "mtop" }, name),
      drop,
    );
    items.forEach((it) => {
      if (it === "-") return drop.append(el("div", { class: "msep" }));
      const [lab, fn, key, chk] = it;
      const b = el(
        "button",
        {
          class: "mitem",
          onclick: () => {
            closeAll();
            fn();
          },
        },
        el(
          "span",
          { class: "mlab" },
          chk ? el("span", { class: "chk" }, chk() ? "✓" : "") : "",
          lab,
        ),
        el("kbd", {}, key || ""),
      );
      drop.append(b);
    });
    menu.firstChild.onclick = (ev) => {
      ev.stopPropagation();
      const was = menu.classList.contains("open");
      closeAll();
      menu.querySelectorAll(".chk").forEach((c, i) => {
        const f = items.filter((x) => x !== "-" && x[3])[i];
        if (f) c.textContent = f[3]() ? "✓" : "";
      });
      if (!was) menu.classList.add("open");
    };
    menu.firstChild.onmouseenter = () => {
      if (host.querySelector(".menu.open") && !menu.classList.contains("open"))
        menu.firstChild.click();
    };
    host.append(menu);
  });
  document.addEventListener("pointerdown", (ev) => {
    if (!ev.target.closest(".menu")) closeAll();
  });
}

function init() {
  try {
    const s = JSON.parse(localStorage.getItem("screen-editor"));
    if (s && s.panel)
      state = { ...state, ...s, panel: { ...DEFAULT_PANEL, ...s.panel } };
  } catch (e) {}
  $("#zoom").value = state.zoom;
  $("#zoom").oninput = (ev) => setZoom(+ev.target.value);
  $("#grid").onchange = renderStage;
  $("#rulers").onchange = renderStage;
  ["x", "y", "w", "h"].forEach((k) => {
    const i = $("#o-" + k);
    i.oninput = () => {
      const e = sel();
      if (!e || e.locked || e[k] === undefined) return;
      let v = parseFloat(i.value);
      if (isNaN(v)) return;
      if (k === "w" || k === "h") v = Math.max(1, v);
      e[k] = v;
      renderStage();
      renderProps();
      renderCode();
      save();
    };
  });
  $("#btn-copy").onclick = copyCode;
  $("#btn-java").onclick = downloadJava;
  $("#file-json").onchange = (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        commit();
        state = { ...state, ...s, panel: { ...DEFAULT_PANEL, ...s.panel } };
        renderPanelTab();
        renderAll();
        commit();
      } catch (e) {
        alert("Invalid JSON");
      }
    };
    r.readAsText(f);
    ev.target.value = "";
  };
  document.querySelectorAll("#tabs button").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("#tabs button")
          .forEach((x) => x.classList.toggle("on", x === b));
        document
          .querySelectorAll(".tab")
          .forEach((t) =>
            t.classList.toggle("on", t.id === "tab-" + b.dataset.tab),
          );
      }),
  );
  const wrap = $("#stage-wrap");
  wrap.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".el")) return;
    state.sel = null;
    renderAll();
  });
  wrap.addEventListener("scroll", drawRulers);
  wrap.addEventListener("pointermove", (ev) => {
    const r = $("#stage").getBoundingClientRect(),
      z = state.zoom;
    const x = Math.floor((ev.clientX - r.left) / z),
      y = Math.floor((ev.clientY - r.top) / z);
    $("#pos").textContent =
      x >= 0 && y >= 0 && x < state.panel.w && y < state.panel.h
        ? `${x}, ${y} px`
        : "";
  });
  wrap.addEventListener("pointerleave", () => ($("#pos").textContent = ""));
  wrap.addEventListener(
    "wheel",
    (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      setZoom(state.zoom + (ev.deltaY < 0 ? 1 : -1));
    },
    { passive: false },
  );
  addEventListener("resize", drawRulers);
  addEventListener("keydown", (ev) => {
    if (!$("#modal").hidden) {
      if (ev.key === "Escape") closeImport();
      return;
    }
    const mod = ev.ctrlKey || ev.metaKey,
      k = ev.key.toLowerCase();
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (mod && k === "z") {
      ev.preventDefault();
      ev.shiftKey ? redo() : undo();
      return;
    }
    if (mod && k === "y") {
      ev.preventDefault();
      redo();
      return;
    }
    const e = sel();
    if (!e) return;
    if (k === "escape") {
      state.sel = null;
      renderAll();
      return;
    }
    if (mod && k === "d") {
      ev.preventDefault();
      dup();
      return;
    }
    if (e.locked) return;
    const s = ev.shiftKey ? 8 : 1;
    if (ev.key === "Delete" || ev.key === "Backspace") remove(e.id);
    else if (ev.key.startsWith("Arrow")) {
      ev.preventDefault();
      if (ev.key === "ArrowLeft") e.x -= s;
      if (ev.key === "ArrowRight") e.x += s;
      if (ev.key === "ArrowUp") e.y -= s;
      if (ev.key === "ArrowDown") e.y += s;
      renderAll();
    }
  });
  setupImport();
  renderMenus();
  renderToolbar();
  renderAligns();
  renderLayerTools();
  renderPanelTab();
  renderAll();
  commit();
}
init();
