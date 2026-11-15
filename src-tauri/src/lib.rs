//! MdEv Tauri P1 — 真实前端后端契约层。
//!
//! 目标：用 Tauri commands 复刻 electron/preload.cjs + 各 ipc handler 的 45 个 API，
//! 返回结构逐字节对齐，使渲染端 136 处 `window.api?.x` 调用无需改动即可在 Tauri 构建运行。
//! 命令命名与 Electron channel 对应（`file:read` → `read_file`），映射表在 src/api/tauriApi.js。

use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

// ── 大文件读取守卫阈值：与 Electron fileHandlers.js 语义 1:1（评估文档 §4.6）──
const LARGE_FILE_THRESHOLD: u64 = 20 * 1024 * 1024;
const FULL_READ_CAP: u64 = 150 * 1024 * 1024;
const PARTIAL_READ: u64 = 20 * 1024 * 1024;

// ── 文本文件扩展名（决定文件树是否展示该文件），与 Electron isTextFile 一致 ──
const TEXT_EXTS: &[&str] = &[
    ".md", ".markdown", ".txt", ".json", ".js", ".ts", ".vue", ".html", ".css", ".scss",
    ".yaml", ".yml", ".toml", ".ini", ".cfg", ".xml", ".svg", ".sql", ".sh", ".bat", ".ps1",
    ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".rs", ".go", ".rb", ".php", ".swift", ".kt",
];

// ── 导出 HTML 用精简样式（spike 版，覆盖 markdown-body 核心排版）──
const EXPORT_LIGHT_CSS: &str = r#"
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.6; color: #24292e; background: #fff; }
.markdown-body { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e1e4e8; }
.markdown-body h1 { font-size: 2em; } .markdown-body h2 { font-size: 1.5em; } .markdown-body h3 { font-size: 1.25em; }
.markdown-body p { margin: 16px 0; }
.markdown-body a { color: #0366d6; text-decoration: none; }
.markdown-body code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.875em; background: #f3f4f6; border-radius: 3px; padding: 0.2em 0.4em; }
.markdown-body pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 16px; overflow: auto; margin: 16px 0; }
.markdown-body pre code { background: transparent; padding: 0; }
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
.katex { font-size: 1.1em !important; }
"#;

const EXPORT_DARK_CSS: &str = r#"
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.6; color: #c9d1d9; background: #0d1117; }
.markdown-body { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
.markdown-body h1 { font-size: 2em; } .markdown-body h2 { font-size: 1.5em; } .markdown-body h3 { font-size: 1.25em; }
.markdown-body p { margin: 16px 0; }
.markdown-body a { color: #58a6ff; text-decoration: none; }
.markdown-body code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.875em; background: #1c2128; border-radius: 3px; padding: 0.2em 0.4em; }
.markdown-body pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow: auto; margin: 16px 0; }
.markdown-body pre code { background: transparent; padding: 0; }
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
.katex { font-size: 1.1em !important; }
"#;

// ── 通用辅助 ──

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn read_limited(path: &Path, max_bytes: u64) -> std::io::Result<String> {
    let f = fs::File::open(path)?;
    let mut buf = Vec::with_capacity(max_bytes as usize);
    f.take(max_bytes).read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// 词法规范化（不访问文件系统）：折叠 `.` / `..`，统一分隔符
fn normalize_path(path: &Path) -> String {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out.to_string_lossy().into_owned()
}

fn is_text_file(name: &str) -> bool {
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s.to_lowercase()))
        .unwrap_or_default();
    TEXT_EXTS.contains(&ext.as_str())
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn timestamp_name(ext: &str) -> String {
    format!("image-{}.{}", now_ms(), ext)
}

/// 图片保存子目录归一化（拒绝 .. 防越权），与 Electron sanitizeFolder 一致
fn sanitize_folder(folder: &str) -> String {
    let f = folder.replace('\\', "/").trim_matches('/').to_string();
    if f.is_empty()
        || f
            .split('/')
            .any(|p| p == ".." || p == "." || p.contains(|c| "<>:\"|?*".contains(c)))
    {
        "assets".into()
    } else {
        f
    }
}

// ── settings ──

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("mdev-settings.json"))
}

fn default_settings() -> Value {
    json!({
        "settings": {
            "theme": "system",
            "statusBarFontFamily": "-apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif",
            "statusBarFontSize": 16,
            "editorFontFamily": "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
            "editorFontSize": 15,
            "previewFontFamily": "-apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif",
            "previewFontSize": 16,
            "lineHeight": 1.6,
            "tabSize": 4,
            "wordWrap": false,
            "showLineNumbers": true,
            "highlightActiveLine": true,
            "matchBrackets": true,
            "codeFolding": true,
            "scrollSync": true,
            "autoSaveEnabled": true,
            "autoSaveInterval": 3,
            "defaultPanelFocus": "filetree",
            "recentFilesMax": 20
        },
        "recentFiles": [],
        "recentFolders": [],
        "session": null
    })
}

fn read_settings(app: &AppHandle) -> Result<Value, String> {
    let p = settings_path(app)?;
    if !p.exists() {
        let d = default_settings();
        write_settings_file(&p, &d)?;
        return Ok(d);
    }
    let s = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn write_settings_file(p: &Path, v: &Value) -> Result<(), String> {
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, serde_json::to_string_pretty(v).unwrap()).map_err(|e| e.to_string())
}

// ── commands ──

/// 对应 Electron `settings:get`
#[tauri::command]
fn get_settings(app: AppHandle) -> Value {
    match read_settings(&app) {
        Ok(v) => json!({
            "success": true,
            "settings": v["settings"],
            "recentFiles": v["recentFiles"],
            "recentFolders": v["recentFolders"],
            "session": v["session"]
        }),
        Err(_) => {
            let d = default_settings();
            json!({
                "success": true,
                "settings": d["settings"],
                "recentFiles": d["recentFiles"],
                "recentFolders": d["recentFolders"],
                "session": d["session"]
            })
        }
    }
}

/// 对应 Electron `settings:set`（合并顶层键，与 Electron 行为一致）
#[tauri::command]
fn set_settings(app: AppHandle, new_settings: Value) -> Value {
    let mut cur = read_settings(&app).unwrap_or_else(|_| default_settings());
    if new_settings.get("settings").is_some() {
        cur["settings"] = new_settings["settings"].clone();
    }
    if new_settings.get("recentFiles").is_some() {
        cur["recentFiles"] = new_settings["recentFiles"].clone();
    }
    if new_settings.get("recentFolders").is_some() {
        cur["recentFolders"] = new_settings["recentFolders"].clone();
    }
    if new_settings.get("session").is_some() {
        cur["session"] = new_settings["session"].clone();
    }
    match write_settings_file(&settings_path(&app).unwrap_or_default(), &cur) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// 对应 Electron `theme:getNative`
#[tauri::command]
fn get_native_theme() -> String {
    if dark_light::detect() == dark_light::Mode::Dark {
        "dark".into()
    } else {
        "light".into()
    }
}

/// 对应 Electron `file:read`（含 P1 大文件守卫语义）
#[tauri::command]
fn read_file(path: String) -> Value {
    let p = Path::new(&path);
    let size = match fs::metadata(p) {
        Ok(m) => m.len(),
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    let is_large = size > LARGE_FILE_THRESHOLD;
    if size > FULL_READ_CAP {
        match read_limited(p, PARTIAL_READ) {
            Ok(content) => json!({
                "success": true, "content": content, "size": size,
                "isLarge": true, "truncated": true, "truncatedBytes": PARTIAL_READ
            }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        }
    } else {
        match fs::read(p) {
            Ok(bytes) => json!({
                "success": true,
                "content": String::from_utf8_lossy(&bytes).into_owned(),
                "size": size, "isLarge": is_large, "truncated": false, "truncatedBytes": size
            }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        }
    }
}

/// 对应 Electron `file:write`
#[tauri::command]
fn write_file(path: String, contents: String) -> Value {
    match fs::write(Path::new(&path), contents.as_bytes()) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `file:readdir`（嵌套树，返回 `{ success, tree }`）
/// build_tree 是无限递归遍历（与 Electron buildFileTree 同规则），大目录下可能耗时数秒；
/// 必须移出主线程，否则选完文件夹后窗口会「未响应」。
#[tauri::command]
async fn read_directory(path: String) -> Value {
    tauri::async_runtime::spawn_blocking(move || match build_tree(Path::new(&path)) {
        Ok(tree) => json!({ "success": true, "tree": tree }),
        Err(e) => json!({ "success": false, "error": e }),
    })
    .await
    .unwrap_or_else(|e| json!({ "success": false, "error": e.to_string() }))
}

fn build_tree(dir: &Path) -> Result<Value, String> {
    let mut entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut dirs: Vec<Value> = Vec::new();
    let mut files: Vec<Value> = Vec::new();
    while let Some(entry) = entries.next().transpose().map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let full = entry.path();
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if ft.is_dir() {
            let children = build_tree(&full).unwrap_or(json!([]));
            dirs.push(json!({
                "name": name,
                "path": full.to_string_lossy().into_owned(),
                "type": "directory",
                "isExpanded": false,
                "children": children
            }));
        } else if ft.is_file() && is_text_file(&name) {
            let ext = Path::new(&name)
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();
            files.push(json!({
                "name": name,
                "path": full.to_string_lossy().into_owned(),
                "type": "file",
                "ext": ext
            }));
        }
    }
    dirs.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or("")
            .cmp(b["name"].as_str().unwrap_or(""))
    });
    files.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or("")
            .cmp(b["name"].as_str().unwrap_or(""))
    });
    let mut all = dirs;
    all.extend(files);
    Ok(Value::Array(all))
}

/// 对应 Electron `file:create`
#[tauri::command]
fn create_file(path: String) -> Value {
    match fs::write(Path::new(&path), b"") {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `file:mkdir`
#[tauri::command]
fn create_directory(path: String) -> Value {
    match fs::create_dir_all(Path::new(&path)) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `file:rename`
#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Value {
    match fs::rename(Path::new(&old_path), Path::new(&new_path)) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `file:delete`（目录递归删，文件直接删）
#[tauri::command]
fn delete_path(target_path: String) -> Value {
    let p = Path::new(&target_path);
    let res = if p.is_dir() {
        fs::remove_dir_all(p)
    } else {
        fs::remove_file(p)
    };
    match res {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `file:exists`（裸 boolean）
#[tauri::command]
fn file_exists(target_path: String) -> bool {
    Path::new(&target_path).exists()
}

/// 对应 Electron `file:resolvePath`（不存在返 null）
#[tauri::command]
fn resolve_path(relative_path: String, base_path: String) -> Option<String> {
    if relative_path.is_empty() || base_path.is_empty() {
        return None;
    }
    let rel = Path::new(&relative_path);
    let joined = if rel.is_absolute() {
        rel.to_path_buf()
    } else {
        Path::new(&base_path).join(rel)
    };
    let abs = normalize_path(&joined);
    if Path::new(&abs).exists() {
        Some(abs)
    } else {
        None
    }
}

// ── 草稿（未命名文档自动保存）──

fn drafts_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("drafts"))
}

/// 对应 Electron `draft:save`
#[tauri::command]
fn save_draft(app: AppHandle, draft_id: String, content: String) -> Value {
    if draft_id.is_empty() {
        return json!({ "success": false, "error": "no-draft-id" });
    }
    let dir = match drafts_dir(&app) {
        Ok(d) => d,
        Err(e) => return json!({ "success": false, "error": e }),
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        return json!({ "success": false, "error": e.to_string() });
    }
    let p = dir.join(format!("{}.md", draft_id));
    match fs::write(&p, content.as_bytes()) {
        Ok(_) => json!({ "success": true, "path": p.to_string_lossy().into_owned() }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `draft:read`
#[tauri::command]
fn read_draft(app: AppHandle, draft_id: String) -> Value {
    if draft_id.is_empty() {
        return json!({ "success": false, "error": "no-draft-id" });
    }
    let p = match drafts_dir(&app) {
        Ok(d) => d.join(format!("{}.md", draft_id)),
        Err(e) => return json!({ "success": false, "error": e }),
    };
    if !p.exists() {
        return json!({ "success": false, "error": "draft-not-found" });
    }
    match fs::read_to_string(&p) {
        Ok(c) => json!({ "success": true, "content": c }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `draft:delete`
#[tauri::command]
fn delete_draft(app: AppHandle, draft_id: String) -> Value {
    if draft_id.is_empty() {
        return json!({ "success": true });
    }
    let p = match drafts_dir(&app) {
        Ok(d) => d.join(format!("{}.md", draft_id)),
        Err(_) => return json!({ "success": true }),
    };
    let _ = fs::remove_file(&p);
    json!({ "success": true })
}

// ── 对话框 ──
// 关键（卡死根因）：tauri-plugin-dialog 的 blocking_* 内部是
//   「run_on_main_thread 投递任务 + rx.recv() 阻塞等结果」。
// 若命令写成同步 fn（默认跑主线程），主线程会等待自己投递的任务 → 死锁，窗口「未响应」。
// 因此命令声明为 async，并把 blocking_* 放进 spawn_blocking（线程池线程），
// 主线程保持消息循环畅通；返回形态不变（Option<String>），垫片无需改动。

#[tauri::command]
async fn open_file_dialog(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        let mut b = app.dialog().file();
        for (title, exts) in [
            ("Markdown", vec!["md", "markdown", "mdown", "mdx"]),
            ("JSON", vec!["json", "jsonc"]),
            ("图片", vec!["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "avif"]),
            ("所有文件", vec!["*"]),
        ] {
            b = b.add_filter(title, &exts);
        }
        b.blocking_pick_file().map(|p| p.to_string())
    })
    .await
    .unwrap_or(None)
}

#[tauri::command]
async fn open_folder_dialog(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        app.dialog().file().blocking_pick_folder().map(|p| p.to_string())
    })
    .await
    .unwrap_or(None)
}

#[tauri::command]
async fn save_file_dialog(app: AppHandle, default_name: Option<String>) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        let mut b = app
            .dialog()
            .file()
            .set_file_name(default_name.unwrap_or_else(|| "未命名.md".into()));
        b = b.add_filter("Markdown", &["md", "markdown"]);
        b = b.add_filter("所有文件", &["*"]);
        b.blocking_save_file().map(|p| p.to_string())
    })
    .await
    .unwrap_or(None)
}

#[tauri::command]
async fn open_image_dialog(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        let mut b = app.dialog().file();
        for (title, exts) in [
            ("图片", vec!["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "avif"]),
            ("所有文件", vec!["*"]),
        ] {
            b = b.add_filter(title, &exts);
        }
        b.blocking_pick_file().map(|p| p.to_string())
    })
    .await
    .unwrap_or(None)
}

// ── Shell / 路径 ──

/// 对应 Electron `shell:openPath`（成功返空串，失败返错误信息）
#[tauri::command]
fn open_path(file_path: String) -> String {
    if file_path.is_empty() {
        return String::new();
    }
    match open::that(&file_path) {
        Ok(_) => String::new(),
        Err(e) => e.to_string(),
    }
}

/// 对应 Electron `shell:showItemInFolder`（返 true）
#[tauri::command]
fn show_item_in_folder(file_path: String) -> bool {
    if file_path.is_empty() {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let arg = format!("/select,\"{}\"", file_path);
        match Command::new("explorer").arg(arg).spawn() {
            Ok(_) => true,
            Err(_) => open::that(&file_path).is_ok(),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&file_path).is_ok()
    }
}

/// 对应 Electron `shell:openExternal`（成功返 null）
#[tauri::command]
fn open_external(url: String) -> Option<String> {
    if url.is_empty() {
        return None;
    }
    match open::that(&url) {
        Ok(_) => None,
        Err(e) => Some(e.to_string()),
    }
}

// ── 窗口控制 ──

#[tauri::command]
fn minimize_window(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn maximize_window(app: AppHandle, window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
    if let Ok(m) = window.is_maximized() {
        let _ = app.emit("window:maximize-changed", m);
    }
}

#[tauri::command]
fn close_window(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
fn is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

// ── 本地文件历史（快照）──

fn history_dir(app: &AppHandle, file_path: &str) -> Result<PathBuf, String> {
    let d = md5::compute(file_path.to_lowercase().as_bytes());
    let hash: String = d.iter().map(|b| format!("{:02x}", b)).collect();
    Ok(app_data_dir(app)?.join("file-history").join(&hash[..16]))
}

/// 对应 Electron `history:list`
#[tauri::command]
fn list_history(app: AppHandle, file_path: String) -> Value {
    if file_path.is_empty() {
        return json!({ "success": false, "error": "no-path" });
    }
    let dir = match history_dir(&app, &file_path) {
        Ok(d) => d,
        Err(e) => return json!({ "success": false, "error": e }),
    };
    if !dir.exists() {
        return json!({ "success": true, "snapshots": [] });
    }
    let mut snaps: Vec<Value> = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if let Some(ts_str) = name.strip_suffix(".md") {
                if let Ok(ts) = ts_str.parse::<i64>() {
                    snaps.push(json!({ "ts": ts, "name": name }));
                }
            }
        }
    }
    snaps.sort_by(|a, b| b["ts"].as_i64().cmp(&a["ts"].as_i64()));
    json!({ "success": true, "snapshots": snaps })
}

/// 对应 Electron `history:read`
#[tauri::command]
fn read_history(app: AppHandle, file_path: String, ts: i64) -> Value {
    if file_path.is_empty() || ts == 0 {
        return json!({ "success": false, "error": "bad-args" });
    }
    let p = match history_dir(&app, &file_path) {
        Ok(d) => d.join(format!("{}.md", ts)),
        Err(e) => return json!({ "success": false, "error": e }),
    };
    match fs::read_to_string(&p) {
        Ok(c) => json!({ "success": true, "content": c, "ts": ts }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 Electron `history:restore`
#[tauri::command]
fn restore_history(app: AppHandle, file_path: String, ts: i64) -> Value {
    if file_path.is_empty() || ts == 0 {
        return json!({ "success": false, "error": "bad-args" });
    }
    let p = match history_dir(&app, &file_path) {
        Ok(d) => d.join(format!("{}.md", ts)),
        Err(e) => return json!({ "success": false, "error": e }),
    };
    match fs::read_to_string(&p) {
        Ok(c) => match fs::write(Path::new(&file_path), c.as_bytes()) {
            Ok(_) => json!({ "success": true, "content": c }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        },
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

// ── 图片 ──

/// 对应 Electron `image:copyImageFile`（磁盘图片复制到 basePath/<folder>/）
#[tauri::command]
fn copy_image_file(_app: AppHandle, src_path: String, base_path: String, folder: String) -> Value {
    if src_path.is_empty() || base_path.is_empty() {
        return json!({ "success": false, "error": "no-path" });
    }
    if !Path::new(&src_path).exists() {
        return json!({ "success": false, "error": "file-not-found" });
    }
    let sub = sanitize_folder(&folder);
    let dir = Path::new(&base_path).join(&sub);
    if let Err(e) = fs::create_dir_all(&dir) {
        return json!({ "success": false, "error": e.to_string() });
    }
    let ext = Path::new(&src_path)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "png".into());
    let name = timestamp_name(&ext);
    let abs = dir.join(&name);
    match fs::copy(&src_path, &abs) {
        Ok(_) => json!({
            "success": true,
            "path": abs.to_string_lossy().into_owned(),
            "relativePath": format!("{}/{}", sub, name)
        }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// 对应 `image:saveClipboardImage` 的落盘后半段：渲染端读剪贴板图片→Uint8Array→此命令写盘
#[tauri::command]
fn save_image_bytes(_app: AppHandle, base_path: String, folder: String, data: Vec<u8>) -> Value {
    if base_path.is_empty() {
        return json!({ "success": false, "error": "no-base-path" });
    }
    if data.is_empty() {
        return json!({ "success": false, "error": "empty-data" });
    }
    let sub = sanitize_folder(&folder);
    let dir = Path::new(&base_path).join(&sub);
    if let Err(e) = fs::create_dir_all(&dir) {
        return json!({ "success": false, "error": e.to_string() });
    }
    let name = timestamp_name("png");
    let abs = dir.join(&name);
    match fs::write(&abs, &data) {
        Ok(_) => json!({
            "success": true,
            "path": abs.to_string_lossy().into_owned(),
            "relativePath": format!("{}/{}", sub, name)
        }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

// ── 搜索 ──

/// 对应 Electron `search:project`
#[tauri::command]
fn search_in_project(root_path: String, query: String, options: Option<Value>) -> Value {
    let opts = options.unwrap_or(json!({}));
    let case_sensitive = opts
        .get("caseSensitive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let whole_word = opts
        .get("wholeWord")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let is_regex = opts
        .get("regex")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let include_ext = opts
        .get("includeExt")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_lowercase()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec![".md".into(), ".markdown".into()]);

    let re = build_search_regex(&query, is_regex, case_sensitive, whole_word);
    let re = match re {
        Ok(r) => r,
        Err(e) => return json!({ "success": false, "error": e, "results": [] }),
    };
    let mut results: Vec<Value> = Vec::new();
    let base = PathBuf::from(&root_path);
    search_dir(&base, &base, &re, &include_ext, &mut results);
    json!({ "success": true, "results": results })
}

fn build_search_regex(
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<regex::Regex, String> {
    let pattern = if is_regex {
        query.to_string()
    } else {
        let esc = regex::escape(query);
        if whole_word {
            format!(r"\b{}\b", esc)
        } else {
            esc
        }
    };
    let mut builder = regex::RegexBuilder::new(&pattern);
    if !case_sensitive {
        builder.case_insensitive(true);
    }
    builder.build().map_err(|e| e.to_string())
}

fn search_dir(base: &Path, dir: &Path, re: &regex::Regex, include_ext: &[String], results: &mut Vec<Value>) {
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let full = entry.path();
        let ft = match entry.file_type() {
            Ok(f) => f,
            Err(_) => continue,
        };
        if ft.is_dir() {
            search_dir(base, &full, re, include_ext, results);
        } else if ft.is_file() {
            let ext = full
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| format!(".{}", s.to_lowercase()))
                .unwrap_or_default();
            if !include_ext.iter().any(|e| e == &ext) {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&full) {
                for (i, line) in content.lines().enumerate() {
                    let mut line_matches: Vec<Value> = Vec::new();
                    for m in re.find_iter(line) {
                        line_matches.push(json!({
                            "index": m.start(),
                            "length": m.end() - m.start(),
                            "text": m.as_str()
                        }));
                    }
                    if !line_matches.is_empty() {
                        let rel = full
                            .strip_prefix(base)
                            .map(|p| {
                                p.to_string_lossy()
                                    .trim_start_matches('/')
                                    .to_string()
                            })
                            .unwrap_or_else(|_| full.to_string_lossy().into_owned());
                        results.push(json!({
                            "file": full.to_string_lossy().into_owned(),
                            "relativePath": rel,
                            "fileName": name,
                            "line": i + 1,
                            "lineContent": line.trim(),
                            "matches": line_matches
                        }));
                    }
                }
            }
        }
    }
}

// ── 导出 ──

/// 对应 Electron `export:html`（Rust 写文件；PDF/PNG 走 shim 客户端导出）
#[tauri::command]
fn export_html(app: AppHandle, options: Value) -> Value {
    let default_path = options
        .get("defaultPath")
        .and_then(|v| v.as_str())
        .unwrap_or("export.html")
        .to_string();
    let content = options
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let theme = options
        .get("theme")
        .and_then(|v| v.as_str())
        .unwrap_or("light")
        .to_string();
    if content.is_empty() {
        return json!({ "success": false, "error": "No content to export" });
    }
    use tauri_plugin_dialog::DialogExt;
    let mut b = app.dialog().file().set_file_name(&default_path);
    b = b.add_filter("HTML", &["html", "htm"]);
    b = b.add_filter("所有文件", &["*"]);
    let out = match b.blocking_save_file() {
        Some(p) => p.to_string(),
        None => return json!({ "success": false, "canceled": true }),
    };
    let html = build_export_html(&content, &theme);
    match fs::write(&out, html) {
        Ok(_) => json!({ "success": true, "filePath": out }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn build_export_html(content: &str, theme: &str) -> String {
    let css = if theme == "dark" {
        EXPORT_DARK_CSS
    } else {
        EXPORT_LIGHT_CSS
    };
    format!(
        "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<style>{}</style>\n</head>\n<body>\n<div class=\"markdown-body\">{}</div>\n</body>\n</html>",
        css, content
    )
}

/// 落盘命令：渲染端生成的二进制（PDF/PNG）经此写盘（客户端导出方案 E 的写盘环节）
#[tauri::command]
fn save_blob(app: AppHandle, default_path: String, data: Vec<u8>) -> Value {
    use tauri_plugin_dialog::DialogExt;
    let mut b = app.dialog().file().set_file_name(&default_path);
    b = b.add_filter("所有文件", &["*"]);
    let out = match b.blocking_save_file() {
        Some(p) => p.to_string(),
        None => return json!({ "success": false, "canceled": true }),
    };
    match fs::write(&out, &data) {
        Ok(_) => json!({ "success": true, "filePath": out }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

// ── 文件监听（spike：watcher 常驻 forget，unwatch 仅返回成功）──

#[tauri::command]
fn watch_directory(app: AppHandle, dir_path: String) -> Value {
    use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
    let path = PathBuf::from(&dir_path);
    let app_clone = app.clone();
    let handler = move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            for p in ev.paths {
                let _ = app_clone.emit(
                    "file:changed",
                    json!({
                        "type": format!("{:?}", ev.kind),
                        "path": p.to_string_lossy().into_owned()
                    }),
                );
            }
        }
    };
    let mut watcher = match RecommendedWatcher::new(handler, Config::default()) {
        Ok(w) => w,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    match watcher.watch(&path, RecursiveMode::Recursive) {
        Ok(_) => {
            std::mem::forget(watcher);
            json!({ "success": true })
        }
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn unwatch_directory(dir_path: String) -> Value {
    let _ = dir_path;
    json!({ "success": true })
}

// ── 菜单（复刻 Electron 原生菜单；点击 emit `menu:<id>` 供渲染端 onMenuEvent 监听）──

fn build_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let menu = Menu::new(app)?;

    let file = Submenu::with_id(app, "file", "文件", true)?;
    file.append(&MenuItem::with_id(app, "new-file", "新建文件", true, Some("Ctrl+N"))?)?;
    file.append(&MenuItem::with_id(app, "open-file", "打开文件...", true, Some("Ctrl+O"))?)?;
    file.append(&MenuItem::with_id(app, "open-folder", "打开文件夹...", true, Some("Ctrl+Shift+O"))?)?;
    file.append(&PredefinedMenuItem::separator(app)?)?;
    file.append(&MenuItem::with_id(app, "save", "保存", true, Some("Ctrl+S"))?)?;
    file.append(&MenuItem::with_id(app, "save-as", "另存为...", true, Some("Ctrl+Shift+S"))?)?;
    file.append(&PredefinedMenuItem::separator(app)?)?;
    file.append(&MenuItem::with_id(app, "export-pdf", "导出 PDF...", true, None::<&str>)?)?;
    file.append(&MenuItem::with_id(app, "export-html", "导出 HTML...", true, None::<&str>)?)?;
    menu.append(&file)?;

    let edit = Submenu::with_id(app, "edit", "编辑", true)?;
    edit.append(&MenuItem::with_id(app, "undo", "撤销", true, Some("Ctrl+Z"))?)?;
    edit.append(&MenuItem::with_id(app, "redo", "重做", true, Some("Ctrl+Y"))?)?;
    edit.append(&PredefinedMenuItem::separator(app)?)?;
    edit.append(&MenuItem::with_id(app, "find", "查找", true, Some("Ctrl+F"))?)?;
    edit.append(&MenuItem::with_id(app, "find-global", "跨文件搜索", true, Some("Ctrl+Shift+F"))?)?;
    edit.append(&MenuItem::with_id(app, "goto-line", "跳转到行...", true, Some("Ctrl+G"))?)?;
    menu.append(&edit)?;

    let view = Submenu::with_id(app, "view", "视图", true)?;
    view.append(&MenuItem::with_id(app, "toggle-sidebar", "切换侧栏", true, Some("Ctrl+Shift+B"))?)?;
    view.append(&MenuItem::with_id(app, "toggle-wordwrap", "自动换行", true, None::<&str>)?)?;
    view.append(&MenuItem::with_id(app, "settings", "设置...", true, Some("Ctrl+,"))?)?;
    menu.append(&view)?;

    Ok(menu)
}

// ── 入口 ──

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 第二实例：把待打开的文档路径转发给主窗口（对应 Electron second-instance）
            let re = regex::Regex::new(r"(?i)\.(md|markdown|txt|json)$").unwrap();
            if let Some(p) = argv
                .iter()
                .skip(1)
                .find(|a| re.is_match(a) && Path::new(a).exists())
            {
                let _ = app.emit("app:open-file", p.clone());
            }
        }))
        .setup(|app| {
            // 应用自带 TitleBar/MenuBar（Electron `frame:false` 同款），因此隐藏 Tauri 原生
            // 菜单栏，避免「上下两个菜单栏」；但保留菜单对象以维持 Ctrl+S/Ctrl+O 等加速键
            // 与 menu:<id> 事件链。hide_menu() 在 Windows 支持（仅 macOS 不支持）。
            let app_handle = app.app_handle();
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(menu) = build_menu(&app_handle) {
                    let _ = win.set_menu(menu);
                }
                let _ = win.hide_menu();
            }
            // 启动即广播一次系统主题（渲染端 onThemeChanged 监听；OS 实时变化暂不追踪）
            let theme = if dark_light::detect() == dark_light::Mode::Dark {
                "dark"
            } else {
                "light"
            };
            let _ = app.app_handle().emit("theme:changed", theme);

            // 首实例文件关联：从启动参数提取 .md 路径，延迟广播给已就绪的前端
            let re = regex::Regex::new(r"(?i)\.(md|markdown|txt|json)$").unwrap();
            if let Some(p) = std::env::args()
                .skip(1)
                .find(|a| re.is_match(a) && Path::new(a).exists())
            {
                let handle = app.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    let _ = handle.emit("app:open-file", p);
                });
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.clone();
            let _ = app.emit(&format!("menu:{}", id), ());
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            get_native_theme,
            read_file,
            write_file,
            read_directory,
            create_file,
            create_directory,
            rename_file,
            delete_path,
            file_exists,
            resolve_path,
            save_draft,
            read_draft,
            delete_draft,
            open_file_dialog,
            open_folder_dialog,
            save_file_dialog,
            open_image_dialog,
            open_path,
            show_item_in_folder,
            open_external,
            minimize_window,
            maximize_window,
            close_window,
            is_maximized,
            list_history,
            read_history,
            restore_history,
            copy_image_file,
            save_image_bytes,
            search_in_project,
            export_html,
            save_blob,
            watch_directory,
            unwatch_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
