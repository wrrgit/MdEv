// 弹窗数据契约（纯逻辑，与视图解耦，便于单测）。
// 与 Electron BrowserWindow HTML 弹窗的返回结构保持 1:1，字段语义见各 resolve* 函数。

/** 由 fields 生成初始值表；message 字段不参与取值，缺省 name 用 'field' */
export function createFieldValues(fields = []) {
  const values = {}
  for (const f of fields) {
    if (f.type === 'message') continue
    values[f.name || 'field'] = f.value ?? ''
  }
  return values
}

/** 统一的弹窗结果形态：取消时 value 为 null */
export function buildResult(action, values) {
  return { action, value: action === 'cancel' ? null : { ...values } }
}

/** showInputBox → string | null */
export function resolveInputBox(result) {
  if (result.action === 'cancel') return null
  const v = result.value?.v
  return v != null ? v : ''
}

/** showFormDialog → { [name]: string } | null */
export function resolveFormDialog(result) {
  return result.action === 'cancel' ? null : result.value
}

// 复刻 Electron 原实现：parseInt(...) || fallback，再钳制到 [min,max]
function clampWithFallback(raw, min, max, fallback) {
  const n = parseInt(raw, 10) || fallback
  return Math.max(min, Math.min(max, n))
}

/** showTableDialog → { rows, cols } | null（rows 1..20，cols 1..10） */
export function resolveTableDialog(result) {
  if (result.action === 'cancel') return null
  return {
    rows: clampWithFallback(result.value?.rows, 1, 20, 3),
    cols: clampWithFallback(result.value?.cols, 1, 10, 3)
  }
}

/** confirmUnsaved → 'save' | 'discard' | 'cancel' */
export function resolveConfirmUnsaved(result) {
  return result.action
}
