// src/api/connect/H5.ts
import { buildRequest } from '../rpc';
import { BaseConnect, type ConnectResult } from './base';
import { KEY_BASE_URL } from '../../constants';

export class H5 extends BaseConnect {
  async connect(token: string): Promise<ConnectResult> {
    try {
      // 1. token 交换：相对路径 /auth → Vite proxy → DSH /?token=xxx
      //    浏览器自动跟随 303、自动存 cookie（同源，无需手动处理）
      const res = await fetch(`/auth?token=${encodeURIComponent(token)}`);

      // 能走到这里 = 接口通（服务器响应了）
      if (res.ok) {
        // token 有效：303 被浏览器跟随成 200
        return { ok: true, message: '连接成功' };
      }
      // 接口通，但返回错误状态（一般是 401 = token 无效）
      return { ok: false, message: `返回 ${res.status}` };
    } catch (e) {
      return { ok: false, message: `连接失败：${(e as Error).message}` };
    }
  }

  async send(method: string, request: object): Promise<any> {
    const res = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(method, request)),
    });
    return res.json();
  }

  setUrl(url: string): void {
    uni.setStorageSync(KEY_BASE_URL, url);
  }
}
