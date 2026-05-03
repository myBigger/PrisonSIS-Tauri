/** Tauri 2 默认没有 window.__TAURI__，用 internals 判断 */
export function isTauriRuntime(): boolean {
    if (typeof window === 'undefined') return false
    return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
  }