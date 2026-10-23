import { buildRequest } from '../rpc';
import { BaseConnect, type ConnectResult } from './base';
import { KEY_COOKIE, KEY_BASE_URL, DEFAULT_BASE_URL } from '../../constants';

/** 取当前服务地址（= 桥地址）：优先用户填的地址，其次默认局域网桥地址 */
function baseUrl(): string {
  return String(uni.getStorageSync(KEY_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// #ifdef APP-PLUS
/**
 * 把 cookie 写进系统 CookieManager。
 * 原生 WebSocket（uni-webSocket 插件）不认 connectSocket 的 header.Cookie，
 * 而是读系统 CookieManager；所以拿到 cookie 后要额外写一份进去，WebSocket 才能自动带上。
 */
function setCookieToWebview(cookie: string): void {
  try {
    const plusAndroid: any = (plus as any).android;
    const CookieManager = plusAndroid.importClass('android.webkit.CookieManager');
    const cm = CookieManager.getInstance();
    cm.setAcceptCookie(true);
    cm.setCookie(baseUrl(), cookie);
    cm.flush();
    console.log('[cookie] 已写入 CookieManager:', cookie.slice(0, 40));
    console.log('[cookie] 读回:', cm.getCookie(baseUrl()));
  } catch (e) {
    console.log('[cookie] setCookieToWebview 失败:', e);
  }
}
// #endif

export class AppConnect extends BaseConnect {
  async connect(token: string): Promise<ConnectResult> {
    uni.removeStorageSync(KEY_COOKIE);
    return new Promise((resolve) => {
      // 通过桥拿 cookie：桥用 Node http 抓 DSH 303 上的 set-cookie，返回 JSON { ok, cookie }
      console.log('[connect] 服务器地址:', baseUrl());
      uni.request({
        url: `${baseUrl()}/auth?token=${encodeURIComponent(token)}`,
        method: 'GET',
        success(result) {
          const data = result.data as any;
          if (result.statusCode === 200 && data?.ok && data.cookie) {
            const cookie = String(data.cookie);
            uni.setStorageSync(KEY_COOKIE, cookie);
            // #ifdef APP-PLUS
            setCookieToWebview(cookie);
            // #endif
            resolve({ ok: true, message: '连接成功' });
          } else if (result.statusCode === 401 || data?.status === 401) {
            resolve({ ok: false, message: 'token 无效' });
          } else {
            resolve({ ok: false, message: `连接失败（HTTP ${result.statusCode}）` });
          }
        },
        fail(e) {
          resolve({ ok: false, message: `桥连接失败：${e.errMsg}` });
        },
      });
    });
  }

  async send(method: string, request: object): Promise<any> {
    const cookie = uni.getStorageSync(KEY_COOKIE) || '';
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) header.Cookie = cookie; // App 端：手动带 cookie

    const res = await uni.request({
      url: `${baseUrl()}/api/${method}`,
      method: 'POST',
      header,
      data: buildRequest(method, request),
    });
    console.log('[send]', method, 'HTTP', res.statusCode, '| body:', JSON.stringify(res.data).slice(0, 200));
    return res.data;
  }

  setUrl(url: string): void {
    uni.setStorageSync(KEY_BASE_URL, url);
  }
}
