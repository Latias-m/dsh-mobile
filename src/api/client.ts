import type { BaseConnect, ConnectResult } from './connect/base';
import { HttpMethodList, KEY_CONNECTED } from '../constants';
// H5 端鉴权：token → cookie
// 通过 Vite proxy 走同源（/auth、/api），浏览器自动管理 cookie
let connectFunction: BaseConnect;
// #ifdef H5
// H5：走 proxy（同源），uni.request 底层是 XHR，浏览器自动存 cookie
import { H5 } from './connect/H5';
connectFunction = new H5();
// #endif
// #ifdef APP-PLUS
import { AppConnect } from './connect/app';
connectFunction = new AppConnect();
// #endif
import { useGlobalStore } from '@/store/global';
import type {
  SessionListItem,
  SessionListValue,
  SessionPageRequest,
  SessionPageValue,
} from './types';
/**
 * 用 token 连接 DSH，并验证连接是否成功
 * 1. token 交换：GET /auth?token=xxx → proxy 转发到 DSH /?token=xxx
 *    浏览器自动跟随 303、自动存 cookie（同源）
 * 2. 调 session/list 验证 cookie 是否生效
 */
export async function connect(token: string): Promise<ConnectResult> {
  try {
    const global = useGlobalStore();
    // 1. token 交换（浏览器自动存 cookie）
    const connectResult = await connectFunction.connect(token);
    if (!connectResult.ok) {
      global.setStatus(false);
      return connectResult;
    }
    // 2. 用 cookie 调 session/list 验证
    let res = await connectFunction.send(HttpMethodList.list, {});
    global.setStatus(res?.result?.ok);
    uni.setStorageSync(KEY_CONNECTED, res?.result?.ok);
    if (res?.result?.ok) {
      const items: unknown[] = res.result.value?.items ?? [];

      return {
        ok: true,
        message: `连接成功，共 ${items.length} 个会话`,
        sessionCount: items.length,
      };
    }

    return { ok: false, message: 'token 无效或鉴权失败' };
  } catch (e) {
    return { ok: false, message: `连接失败：${(e as Error).message}` };
  }
}

export async function getList(): Promise<SessionListItem[]> {
  let res = await connectFunction.send(HttpMethodList.list, {});
  if (res?.result?.ok) {
    const list: SessionListValue = res?.result?.value;
    if (list) {
      return list.items;
    }
  }
  return [];
}

export async function getHistory(
  sessionId: string,
  throughSeq: number,
  beforeSeq?: number
): Promise<SessionPageValue | null> {
  const param: SessionPageRequest = {
    address: { kind: 'session', sessionId: sessionId }, // 目标会话
    throughSeq: throughSeq, // 读到这个序号（seq）为止
    beforeSeq: beforeSeq, // 分页：只取这个 seq 之前的记录（翻更早历史）
    maxMessages: 20, // 单次最多返回多少条
  };
  let res = await connectFunction.send(HttpMethodList.page, param);
  if (res?.result?.ok) {
    return res.result.value as SessionPageValue;
  }
  return null;
}
