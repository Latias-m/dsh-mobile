// src/api/storage.ts
// 跨端持久化存储
// H5   → localStorage
// App  → Android SharedPreferences / iOS NSUserDefaults
// 应用退出、手机重启都不丢，只有卸载/清数据才会没

import { KEY_COOKIE, KEY_BASE_URL, KEY_TOKEN, DEFAULT_BASE_URL } from '../constants'

export { DEFAULT_BASE_URL }

// ---------- cookie（App 端鉴权凭证，H5 端由浏览器自动管，不需要存）----------

export function saveCookie(cookie: string) {
  uni.setStorageSync(KEY_COOKIE, cookie)
}

export function loadCookie(): string {
  return uni.getStorageSync(KEY_COOKIE) || ''
}

// ---------- DSH 服务器地址 ----------

export function saveBaseUrl(url: string) {
  uni.setStorageSync(KEY_BASE_URL, url)
}

export function loadBaseUrl(): string {
  return uni.getStorageSync(KEY_BASE_URL) || DEFAULT_BASE_URL
}

// ---------- token（仅用于预填输入框；token 是一次性的，会失效）----------

export function saveToken(token: string) {
  uni.setStorageSync(KEY_TOKEN, token)
}

export function loadToken(): string {
  return uni.getStorageSync(KEY_TOKEN) || ''
}

// ---------- 清空登录态 ----------

export function clearAuth() {
  uni.removeStorageSync(KEY_COOKIE)
  uni.removeStorageSync(KEY_TOKEN)
}
