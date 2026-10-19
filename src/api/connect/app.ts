import { buildRequest } from '../rpc';
import { BaseConnect, type ConnectResult } from './base';
import { KEY_COOKIE, KEY_BASE_URL } from '../../constants';

export class AppConnect extends BaseConnect {
  async connect(token: string): Promise<ConnectResult> {
    uni.removeStorageSync(KEY_COOKIE);
    return new Promise((resolve) => {
      uni.request({
        // App 端：完整地址直连（不走 proxy）
        url: `${uni.getStorageSync(KEY_BASE_URL)}/?token=${encodeURIComponent(token)}`,
        method: 'GET',
        success(result) {
          // App 端：手动读 Set-Cookie 并保存（H5 由浏览器自动存）
          const header = result.header as Record<string, string>;
          const setCookie = header['Set-Cookie'] || header['set-cookie'];
          if (setCookie) {
            uni.setStorageSync(KEY_COOKIE, String(setCookie).split(';')[0]);
            resolve({ ok: true, message: '连接成功' });
          } else {
            resolve({ ok: false, message: '未拿到 cookie，token 可能无效' });
          }
        },
        fail(e) {
          resolve({ ok: false, message: e.errMsg });
        },
      });
    });
  }

  async send(method: string, request: object): Promise<any> {
    const cookie = uni.getStorageSync(KEY_COOKIE) || '';
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) header.Cookie = cookie; // App 端：手动带 cookie

    const res = await uni.request({
      url: `${uni.getStorageSync(KEY_BASE_URL)}/api/${method}`,
      method: 'POST',
      header,
      data: buildRequest(method, request),
    });
    return res.data;
  }

  setUrl(url: string): void {
    uni.setStorageSync(KEY_BASE_URL, url);
  }
}
