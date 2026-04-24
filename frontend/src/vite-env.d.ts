/// <reference types="vite/client" />

// Tauri 全局 API 类型声明
interface Window {
  __TAURI__: typeof import('@tauri-apps/api')
}
