//! MdEv Tauri spike — 阶段 P0（可行性验证，见 docs/tauri-migration-assessment.md）
//!
//! 目标：验证「Rust 文件 I/O 契约 + P1 大文件守卫语义 + asset 协议图片 + 对话框」。
//! 主题面刻意保持最小：只复刻渲染端高频契约中的文件 I/O 部分（§1.1），
//! 导出选路（§4.1）在四步验证清单第 4 步单独评估。

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

// ── 大文件读取守卫阈值：与 Electron fileHandlers.js 语义 1:1 对齐（评估文档 §4.6）──
// >20MB 标记 isLarge（渲染端打开前弹确认）；>150MB 只读前 20MB 并标记 truncated（渲染端只读）。
const LARGE_FILE_THRESHOLD: u64 = 20 * 1024 * 1024;
const FULL_READ_CAP: u64 = 150 * 1024 * 1024;
const PARTIAL_READ: u64 = 20 * 1024 * 1024;

/// 与 Electron `file:read` 返回结构同形（camelCase）：
/// `{ success, content, size, isLarge, truncated, truncatedBytes, error }`
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    success: bool,
    #[serde(default)]
    content: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    is_large: bool,
    #[serde(default)]
    truncated: bool,
    #[serde(default)]
    truncated_bytes: u64,
    #[serde(default)]
    error: String,
}

impl ReadResult {
    fn err(msg: String) -> Self {
        ReadResult {
            success: false,
            error: msg,
            ..Default::default()
        }
    }
}

/// 通用 `{ success, error }` 结果
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SimpleResult {
    success: bool,
    #[serde(default)]
    error: String,
}

/// 只读前 `max_bytes` 字节（对应 Electron `readFile(path, { start, end })` 的部分读取）
fn read_limited(path: &Path, max_bytes: u64) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    let mut buf = Vec::with_capacity(max_bytes as usize);
    f.take(max_bytes).read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

// ── commands ──

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! MdEv Tauri spike is alive.", name)
}

/// 对应 Electron `file:read`（含 P1 大文件守卫语义）
#[tauri::command]
fn read_text_file(path: String) -> ReadResult {
    let p = Path::new(&path);
    let size = match fs::metadata(p) {
        Ok(m) => m.len(),
        Err(e) => return ReadResult::err(e.to_string()),
    };
    let is_large = size > LARGE_FILE_THRESHOLD;

    if size > FULL_READ_CAP {
        match read_limited(p, PARTIAL_READ) {
            Ok(content) => ReadResult {
                success: true,
                content,
                size,
                is_large: true,
                truncated: true,
                truncated_bytes: PARTIAL_READ,
                ..Default::default()
            },
            Err(e) => ReadResult::err(e.to_string()),
        }
    } else {
        match fs::read(p) {
            Ok(bytes) => ReadResult {
                success: true,
                content: String::from_utf8_lossy(&bytes).into_owned(),
                size,
                is_large,
                truncated: false,
                truncated_bytes: size,
                ..Default::default()
            },
            Err(e) => ReadResult::err(e.to_string()),
        }
    }
}

/// 对应 Electron `file:write`。
/// TODO(spike→P1)：写后快照进本地文件历史（Electron 侧由 snapshotFile 完成）。
#[tauri::command]
fn write_text_file(path: String, contents: String) -> SimpleResult {
    match fs::write(Path::new(&path), contents.as_bytes()) {
        Ok(_) => SimpleResult {
            success: true,
            ..Default::default()
        },
        Err(e) => SimpleResult {
            success: false,
            error: e.to_string(),
        },
    }
}

/// 对应 Electron `file:readdir` 的平铺版（spike 不递归建树；树结构在 P1 阶段对齐 buildFileTree）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    let rd = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in rd {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let entry_path = entry.path().to_string_lossy().into_owned();
        out.push(DirEntry {
            name,
            path: entry_path,
            is_dir,
        });
    }
    Ok(out)
}

/// 对应 Electron `file:exists`
#[tauri::command]
fn exists(path: String) -> bool {
    Path::new(&path).exists()
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

/// 对应 Electron `file:resolvePath`
#[tauri::command]
fn resolve_path(base: String, relative: String) -> Result<String, String> {
    let rel = Path::new(&relative);
    let joined = if rel.is_absolute() {
        rel.to_path_buf()
    } else {
        Path::new(&base).join(rel)
    };
    Ok(normalize_path(&joined))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // TODO(spike→P2)：聚焦已有主窗口 + 处理文件关联参数
            // （对应 Electron requestSingleInstanceLock → app:open-file 链路）
        }))
        .invoke_handler(tauri::generate_handler![
            greet,
            read_text_file,
            write_text_file,
            list_dir,
            exists,
            resolve_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
