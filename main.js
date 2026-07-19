import { dialog as y, BrowserWindow as g, app as p, nativeTheme as x, nativeImage as $, ipcMain as b, screen as J, Menu as E } from "electron";
import { join as h, extname as _, dirname as R } from "path";
import { fileURLToPath as U } from "url";
import { existsSync as D, readFileSync as S, writeFileSync as z } from "fs";
import { readFile as M, writeFile as j, readdir as O, mkdir as A, rename as q, unlink as Y, access as K, constants as V, watch as G } from "fs/promises";
const w = /* @__PURE__ */ new Map();
function Q(t, a) {
  t.handle("file:read", async (o, e) => {
    try {
      return { success: !0, content: await M(e, "utf-8") };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("file:write", async (o, e, n) => {
    try {
      return await j(e, n, "utf-8"), { success: !0 };
    } catch (s) {
      return { success: !1, error: s.message };
    }
  }), t.handle("file:readdir", async (o, e) => {
    try {
      const n = await O(e, { withFileTypes: !0 });
      return { success: !0, tree: await H(n, e) };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("file:create", async (o, e) => {
    try {
      return await j(e, "", "utf-8"), { success: !0 };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("file:mkdir", async (o, e) => {
    try {
      return await A(e, { recursive: !0 }), { success: !0 };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("file:rename", async (o, e, n) => {
    try {
      return await q(e, n), { success: !0 };
    } catch (s) {
      return { success: !1, error: s.message };
    }
  }), t.handle("file:delete", async (o, e) => {
    try {
      return await Y(e), { success: !0 };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("file:exists", async (o, e) => {
    try {
      return await K(e, V.F_OK), !0;
    } catch {
      return !1;
    }
  }), t.handle("file:watch", async (o, e) => {
    try {
      w.has(e) && w.get(e).close();
      const n = G(e, { recursive: !0 }, (s, l) => {
        l && a && !a.isDestroyed() && a.webContents.send("file:changed", {
          type: s,
          path: h(e, l)
        });
      });
      return w.set(e, n), { success: !0 };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("file:unwatch", async (o, e) => (w.has(e) && (w.get(e).close(), w.delete(e)), { success: !0 }));
}
async function H(t, a) {
  const o = [], e = [];
  for (const n of t) {
    const s = h(a, n.name);
    n.name.startsWith(".") || n.name === "node_modules" || (n.isDirectory() ? o.push({
      name: n.name,
      path: s,
      type: "directory",
      isExpanded: !1,
      children: []
    }) : n.isFile() && X(n.name) && e.push({
      name: n.name,
      path: s,
      type: "file",
      ext: _(n.name).toLowerCase()
    }));
  }
  o.sort((n, s) => n.name.localeCompare(s.name)), e.sort((n, s) => n.name.localeCompare(s.name));
  for (const n of o)
    try {
      const s = await O(n.path, { withFileTypes: !0 });
      n.children = await H(s, n.path);
    } catch {
      n.children = [];
    }
  return [...o, ...e];
}
function X(t) {
  const a = [
    ".md",
    ".markdown",
    ".txt",
    ".json",
    ".js",
    ".ts",
    ".vue",
    ".html",
    ".css",
    ".scss",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".xml",
    ".svg",
    ".sql",
    ".sh",
    ".bat",
    ".ps1",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".rs",
    ".go",
    ".rb",
    ".php",
    ".swift",
    ".kt"
  ], o = _(t).toLowerCase();
  return a.includes(o);
}
function Z(t) {
  t.handle("search:project", async (a, o, e, n = {}) => {
    try {
      const s = [], { caseSensitive: l = !1, wholeWord: i = !1, regex: u = !1, includeExt: d = [".md", ".markdown"] } = n;
      let c;
      if (u)
        c = new RegExp(e, l ? "g" : "gi");
      else {
        const m = e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), f = i ? `\\b${m}\\b` : m;
        c = new RegExp(f, l ? "g" : "gi");
      }
      return await I(o, o, c, d, s), { success: !0, results: s };
    } catch (s) {
      return { success: !1, error: s.message, results: [] };
    }
  });
}
async function I(t, a, o, e, n) {
  try {
    const s = await O(a, { withFileTypes: !0 });
    for (const l of s) {
      const i = h(a, l.name);
      if (!(l.name.startsWith(".") || l.name === "node_modules")) {
        if (l.isDirectory())
          await I(t, i, o, e, n);
        else if (l.isFile()) {
          const u = _(l.name).toLowerCase();
          if (!e.includes(u)) continue;
          try {
            const c = (await M(i, "utf-8")).split(`
`);
            let m;
            for (let f = 0; f < c.length; f++) {
              o.lastIndex = 0;
              const v = [];
              for (; (m = o.exec(c[f])) !== null; )
                v.push({
                  index: m.index,
                  length: m[0].length,
                  text: m[0]
                });
              v.length > 0 && n.push({
                file: i,
                relativePath: i.startsWith(t) ? i.slice(t.length + 1) : i,
                fileName: l.name,
                line: f + 1,
                lineContent: c[f].trim(),
                matches: v
              });
            }
          } catch {
          }
        }
      }
    }
  } catch {
  }
}
const W = `
  .hljs { color: #24292e; }
  .hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: #d73a49; }
  .hljs-string, .hljs-doctag, .hljs-regexp { color: #032f62; }
  .hljs-number, .hljs-literal, .hljs-bullet, .hljs-symbol { color: #005cc5; }
  .hljs-title, .hljs-section, .hljs-name, .hljs-attribute { color: #6f42c1; }
  .hljs-type, .hljs-built_in, .hljs-builtin-name, .hljs-class .hljs-title { color: #005cc5; }
  .hljs-tag { color: #22863a; }
  .hljs-meta { color: #6a737d; }
  .hljs-deletion { color: #b31d28; background: #ffeef0; }
  .hljs-addition { color: #22863a; background: #f0fff4; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 700; }
  .hljs-variable, .hljs-template-variable { color: #e36209; }
  .hljs-link { color: #032f62; }
`, ee = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.6; color: #24292e; background: #ffffff; }
  .markdown-body { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
  .markdown-body h1 { font-size: 2em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e1e4e8; }
  .markdown-body h2 { font-size: 1.5em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e1e4e8; }
  .markdown-body h3 { font-size: 1.25em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h4 { font-size: 1em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h5 { font-size: 0.875em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h6 { font-size: 0.85em; font-weight: 600; margin: 24px 0 8px; color: #586069; }
  .markdown-body p { margin: 16px 0; }
  .markdown-body a { color: #0366d6; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body code { font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 0.875em; background: #f3f4f6; border-radius: 3px; padding: 0.2em 0.4em; }
  .markdown-body pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 16px; overflow: auto; margin: 16px 0; }
  .markdown-body pre code { background: transparent; padding: 0; font-size: 0.875em; line-height: 1.5; }
  .markdown-body blockquote { margin: 16px 0; padding: 0 16px; color: #586069; border-left: 4px solid #e1e4e8; }
  .markdown-body ul, .markdown-body ol { margin: 16px 0; padding-left: 24px; }
  .markdown-body li { margin: 4px 0; }
  .markdown-body table { border-collapse: collapse; margin: 16px 0; width: 100%; }
  .markdown-body th, .markdown-body td { border: 1px solid #e1e4e8; padding: 8px 12px; }
  .markdown-body th { background: #f6f8fa; font-weight: 600; }
  .markdown-body tr:nth-child(2n) { background: #f6f8fa; }
  .markdown-body img { max-width: 100%; display: block; margin: 16px auto; }
  .markdown-body hr { border: 0; border-top: 1px solid #e1e4e8; margin: 24px 0; }
  .markdown-body .task-list-item { list-style: none; }
  .markdown-body .task-list-item input { margin-right: 8px; }
  .markdown-body .mermaid { text-align: center; margin: 16px 0; }
  .katex { font-size: 1.1em !important; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 8px 0; }
  .hljs { background: #f6f8fa !important; }
  ${W}
`, te = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.6; color: #c9d1d9; background: #0d1117; }
  .markdown-body { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
  .markdown-body h1 { font-size: 2em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
  .markdown-body h2 { font-size: 1.5em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
  .markdown-body h3 { font-size: 1.25em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h4 { font-size: 1em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h5 { font-size: 0.875em; font-weight: 600; margin: 24px 0 8px; }
  .markdown-body h6 { font-size: 0.85em; font-weight: 600; margin: 24px 0 8px; color: #8b949e; }
  .markdown-body p { margin: 16px 0; }
  .markdown-body a { color: #58a6ff; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body code { font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 0.875em; background: #1c2128; border-radius: 3px; padding: 0.2em 0.4em; }
  .markdown-body pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow: auto; margin: 16px 0; }
  .markdown-body pre code { background: transparent; padding: 0; font-size: 0.875em; line-height: 1.5; }
  .markdown-body blockquote { margin: 16px 0; padding: 0 16px; color: #8b949e; border-left: 4px solid #30363d; }
  .markdown-body ul, .markdown-body ol { margin: 16px 0; padding-left: 24px; }
  .markdown-body li { margin: 4px 0; }
  .markdown-body table { border-collapse: collapse; margin: 16px 0; width: 100%; }
  .markdown-body th, .markdown-body td { border: 1px solid #30363d; padding: 8px 12px; }
  .markdown-body th { background: #1c2128; font-weight: 600; }
  .markdown-body tr:nth-child(2n) { background: #161b22; }
  .markdown-body img { max-width: 100%; display: block; margin: 16px auto; }
  .markdown-body hr { border: 0; border-top: 1px solid #30363d; margin: 24px 0; }
  .markdown-body .task-list-item { list-style: none; }
  .markdown-body .task-list-item input { margin-right: 8px; }
  .markdown-body .mermaid { text-align: center; margin: 16px 0; }
  .katex { font-size: 1.1em !important; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 8px 0; }
  .hljs { background: #161b22 !important; color: #c9d1d9; }
  .hljs-comment, .hljs-quote { color: #8b949e; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: #ff7b72; }
  .hljs-string, .hljs-doctag, .hljs-regexp { color: #a5d6ff; }
  .hljs-number, .hljs-literal, .hljs-bullet, .hljs-symbol { color: #79c0ff; }
  .hljs-title, .hljs-section, .hljs-name, .hljs-attribute { color: #d2a8ff; }
  .hljs-type, .hljs-built_in, .hljs-builtin-name { color: #79c0ff; }
  .hljs-tag { color: #7ee787; }
  .hljs-meta { color: #8b949e; }
  .hljs-deletion { color: #ffa198; background: #67060c; }
  .hljs-addition { color: #7ee787; background: #033a16; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 700; }
  .hljs-variable, .hljs-template-variable { color: #ffa657; }
  .hljs-link { color: #a5d6ff; }
`;
let k = null;
function re() {
  if (k !== null) return k;
  try {
    const t = h(p.getAppPath(), "dist-electron", "katex"), a = h(t, "katex.min.css"), o = h(t, "fonts");
    if (!D(a))
      return console.warn("[export] katex.min.css not found at", a), k = "", "";
    let e = S(a, "utf8");
    return e = e.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (n, s) => {
      const l = h(o, s);
      return D(l) ? `url(data:font/woff2;base64,${S(l).toString("base64")})` : n;
    }), e = e.replace(/,url\(fonts\/[^)]+\) format\("(?:woff|truetype)"\)/g, ""), k = e, e;
  } catch (t) {
    return console.error("[export] Failed to load katex CSS:", t), k = "", "";
  }
}
function T(t, a = {}) {
  const o = a.theme === "dark", e = re();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${o ? te : ee}</style>
  <style>${e}</style>
</head>
<body>
  <div class="markdown-body">${t}</div>
</body>
</html>`;
}
function oe(t, a) {
  let o = null;
  async function e(n, s = {}) {
    return new Promise((l, i) => {
      o = new g({
        show: !1,
        width: 1200,
        height: 1600,
        webPreferences: {
          nodeIntegration: !1,
          contextIsolation: !0,
          sandbox: !0
        }
      });
      let u = !1;
      const d = (c, m) => {
        if (!u) {
          u = !0;
          try {
            c(m);
          } catch (f) {
            i(f);
          }
          o && !o.isDestroyed() && o.close(), o = null;
        }
      };
      o.webContents.on("did-finish-load", async () => {
        try {
          await new Promise((m) => setTimeout(m, s.readyDelay || 400));
          const c = await o.webContents.printToPDF({
            printBackground: !0,
            landscape: !1,
            pageSize: s.pageSize || "A4",
            margins: {
              top: s.marginTop || 0.75,
              bottom: s.marginBottom || 0.75,
              left: s.marginLeft || 0.75,
              right: s.marginRight || 0.75
            }
          });
          d(l, c);
        } catch (c) {
          d(i, c);
        }
      }), o.webContents.on("did-fail-load", (c, m, f) => {
        d(i, new Error(`Failed to load: ${f}`));
      }), o.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(n)}`);
    });
  }
  t.handle("export:pdf", async (n, s = {}) => {
    try {
      const { defaultPath: l = "export.pdf", content: i, theme: u } = s;
      if (!i)
        return { success: !1, error: "No content to export" };
      const d = await y.showSaveDialog(a, {
        defaultPath: l,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      if (d.canceled) return { success: !1, canceled: !0 };
      const c = T(i, { pageSize: s.pageSize || "A4", theme: u }), m = await e(c, s);
      return await j(d.filePath, m), { success: !0, filePath: d.filePath };
    } catch (l) {
      return o && !o.isDestroyed() && (o.close(), o = null), { success: !1, error: l.message };
    }
  }), t.handle("export:html", async (n, s = {}) => {
    try {
      const { defaultPath: l = "export.html", content: i, theme: u } = s;
      if (!i)
        return { success: !1, error: "No content to export" };
      const d = await y.showSaveDialog(a, {
        defaultPath: l,
        filters: [{ name: "HTML", extensions: ["html", "htm"] }]
      });
      if (d.canceled) return { success: !1, canceled: !0 };
      const c = T(i, { theme: u });
      return await j(d.filePath, c, "utf8"), { success: !0, filePath: d.filePath };
    } catch (l) {
      return { success: !1, error: l.message };
    }
  });
}
let C = null;
async function L() {
  if (!C) {
    const t = (await import("./index-Bb0L6Vnl.js").then((a) => a.i)).default;
    C = new t({
      name: "mdev-settings",
      cwd: h(p.getPath("userData"), "config"),
      defaults: {
        settings: {
          theme: "system",
          editorFontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
          editorFontSize: 15,
          previewFontFamily: "-apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif",
          previewFontSize: 16,
          lineHeight: 1.6,
          tabSize: 4,
          wordWrap: !1,
          showLineNumbers: !0,
          highlightActiveLine: !0,
          matchBrackets: !0,
          codeFolding: !0,
          scrollSync: !0,
          autoSaveInterval: 3,
          defaultPanelFocus: "filetree",
          recentFilesMax: 20
        },
        recentFiles: [],
        recentFolders: []
      }
    });
  }
  return C;
}
function ne(t) {
  async function a() {
    return C = await L(), C;
  }
  t.handle("settings:get", async () => {
    try {
      const o = await a(), e = o.get("settings"), n = o.get("recentFiles"), s = o.get("recentFolders");
      return { success: !0, settings: e, recentFiles: n, recentFolders: s };
    } catch (o) {
      return { success: !1, error: o.message };
    }
  }), t.handle("settings:set", async (o, e) => {
    try {
      const n = await a();
      return e.settings && (n.set("settings", e.settings), e.settings.theme === "system" ? x.themeSource = "system" : x.themeSource = e.settings.theme), e.recentFiles !== void 0 && n.set("recentFiles", e.recentFiles), e.recentFolders !== void 0 && n.set("recentFolders", e.recentFolders), { success: !0 };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }), t.handle("theme:getNative", () => x.shouldUseDarkColors ? "dark" : "light"), x.on("updated", () => {
    const o = x.shouldUseDarkColors ? "dark" : "light";
    g.getAllWindows().forEach((n) => {
      n.isDestroyed() || n.webContents.send("theme:changed", o);
    });
  }), t.handle("window:minimize", (o) => {
    var e;
    (e = g.fromWebContents(o.sender)) == null || e.minimize();
  }), t.handle("window:maximize", (o) => {
    const e = g.fromWebContents(o.sender);
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), t.handle("window:close", (o) => {
    var e;
    (e = g.fromWebContents(o.sender)) == null || e.close();
  }), t.handle("window:isMaximized", (o) => {
    var e;
    return ((e = g.fromWebContents(o.sender)) == null ? void 0 : e.isMaximized()) || !1;
  });
}
const F = R(U(import.meta.url)), se = process.env.NODE_ENV === "development", P = h(p.getPath("userData"), "window-bounds.json");
let r = null;
function ae() {
  try {
    if (D(P)) {
      const t = JSON.parse(S(P, "utf-8"));
      if (t.width && t.height) return t;
    }
  } catch {
  }
  return null;
}
function B() {
  if (!(!r || r.isDestroyed()))
    try {
      const t = r.getBounds();
      z(P, JSON.stringify({ width: t.width, height: t.height, x: t.x, y: t.y }));
    } catch {
    }
}
function le() {
  const t = J.getPrimaryDisplay(), { width: a, height: o } = t.workAreaSize;
  return {
    width: Math.round(a * 3 / 5),
    height: Math.round(o * 3 / 5)
  };
}
async function N() {
  const t = ae(), a = le(), o = {
    width: (t == null ? void 0 : t.width) || a.width,
    height: (t == null ? void 0 : t.height) || a.height,
    minWidth: 900,
    minHeight: 600,
    title: "MdEv",
    icon: $.createFromPath(h(F, "..", "assets", "icons", "icon.png")),
    webPreferences: {
      preload: h(F, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    },
    frame: !1,
    titleBarStyle: "hidden",
    backgroundColor: "#ffffff"
  };
  (t == null ? void 0 : t.x) !== void 0 && (t == null ? void 0 : t.y) !== void 0 && (o.x = t.x, o.y = t.y), r = new g(o), se ? (r.loadURL("http://localhost:5173"), r.webContents.openDevTools()) : r.loadFile(h(F, "..", "dist", "index.html")), r.webContents.on("did-finish-load", () => {
    let n = 0;
    const s = setInterval(() => {
      if (n++, !r || r.isDestroyed()) {
        clearInterval(s);
        return;
      }
      r.webContents.executeJavaScript("window.__wwDebug || null").then((l) => {
        if (l) {
          try {
            z(h(p.getPath("userData"), "ww-debug.json"), JSON.stringify(l, null, 2));
          } catch {
          }
          clearInterval(s);
        }
      }).catch(() => {
      }), n > 60 && clearInterval(s);
    }, 1e3);
  });
  const e = setInterval(() => {
    if (!r || r.isDestroyed()) {
      clearInterval(e);
      return;
    }
    r.webContents.executeJavaScript("window.__tocDebug || null").then((n) => {
      if (n)
        try {
          z(h(p.getPath("userData"), "toc-debug.json"), JSON.stringify(n, null, 2));
        } catch {
        }
    }).catch(() => {
    });
  }, 1500);
  await ie(), r.on("resize", B), r.on("move", B), r.on("closed", () => {
    r = null;
  });
}
async function ie() {
  const t = await L(), a = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建文件",
          accelerator: "CmdOrCtrl+N",
          click: () => r == null ? void 0 : r.webContents.send("menu:new-file")
        },
        {
          label: "打开文件...",
          accelerator: "CmdOrCtrl+O",
          click: () => r == null ? void 0 : r.webContents.send("menu:open-file")
        },
        {
          label: "打开文件夹...",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => r == null ? void 0 : r.webContents.send("menu:open-folder")
        },
        { type: "separator" },
        {
          label: "保存",
          accelerator: "CmdOrCtrl+S",
          click: () => r == null ? void 0 : r.webContents.send("menu:save")
        },
        {
          label: "另存为...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => r == null ? void 0 : r.webContents.send("menu:save-as")
        },
        { type: "separator" },
        {
          label: "导出 PDF...",
          click: () => r == null ? void 0 : r.webContents.send("menu:export-pdf")
        },
        {
          label: "导出 HTML...",
          click: () => r == null ? void 0 : r.webContents.send("menu:export-html")
        },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { type: "separator" },
        {
          label: "查找",
          accelerator: "CmdOrCtrl+F",
          click: () => r == null ? void 0 : r.webContents.send("menu:find")
        },
        {
          label: "跨文件搜索",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => r == null ? void 0 : r.webContents.send("menu:find-global")
        },
        { type: "separator" },
        {
          label: "跳转到行...",
          accelerator: "CmdOrCtrl+G",
          click: () => r == null ? void 0 : r.webContents.send("menu:goto-line")
        }
      ]
    },
    {
      label: "视图",
      submenu: [
        {
          label: "双栏模式",
          type: "radio",
          checked: !0,
          click: () => r == null ? void 0 : r.webContents.send("menu:view-mode", "dual")
        },
        {
          label: "纯编辑模式",
          type: "radio",
          click: () => r == null ? void 0 : r.webContents.send("menu:view-mode", "edit")
        },
        {
          label: "纯预览模式",
          type: "radio",
          click: () => r == null ? void 0 : r.webContents.send("menu:view-mode", "preview")
        },
        { type: "separator" },
        {
          label: "切换侧栏",
          accelerator: "CmdOrCtrl+B",
          click: () => r == null ? void 0 : r.webContents.send("menu:toggle-sidebar")
        },
        { type: "separator" },
        {
          label: "设置...",
          accelerator: "CmdOrCtrl+,",
          click: () => r == null ? void 0 : r.webContents.send("menu:settings")
        },
        { type: "separator" },
        { role: "toggleDevTools", label: "开发者工具" },
        { role: "reload", label: "重新加载" }
      ]
    },
    {
      label: "显示",
      submenu: [
        {
          label: "自动换行",
          type: "checkbox",
          checked: t.get("settings.wordWrap", !1),
          click: (e) => r == null ? void 0 : r.webContents.send("menu:toggle-wordwrap", e.checked)
        }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于 MdEv",
          click: () => {
            y.showMessageBox(r, {
              type: "info",
              title: "关于 MdEv",
              message: "MdEv v0.1.0",
              detail: `Markdown Editor for Windows
基于 Electron + Vue 3 + CodeMirror 6`
            });
          }
        }
      ]
    }
  ], o = E.buildFromTemplate(a);
  E.setApplicationMenu(o);
}
function ce() {
  Q(b, r), Z(b), oe(b, r), ne(b), b.handle("dialog:openFile", async () => {
    const t = await y.showOpenDialog(r, {
      properties: ["openFile"],
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdown", "mdx"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    return t.canceled ? null : t.filePaths[0];
  }), b.handle("dialog:openFolder", async () => {
    const t = await y.showOpenDialog(r, {
      properties: ["openDirectory"]
    });
    return t.canceled ? null : t.filePaths[0];
  }), b.handle("dialog:saveFile", async (t, a) => {
    const o = await y.showSaveDialog(r, {
      defaultPath: a || "未命名.md",
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    return o.canceled ? null : o.filePath;
  });
}
p.whenReady().then(() => {
  N(), ce();
});
p.on("window-all-closed", () => {
  process.platform !== "darwin" && p.quit();
});
p.on("activate", () => {
  g.getAllWindows().length === 0 && N();
});
