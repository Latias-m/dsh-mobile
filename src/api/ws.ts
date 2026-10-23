// src/api/ws.ts
// WebSocket 流式客户端：走 /api/remote.mux，订阅 session/follow 事件流。
//
// 协议（源码确认）：
//   - 端点：/api/remote.mux（一个物理 WebSocket 复用多条逻辑流）
//   - 客户端帧：open(streamId, endpoint, payload) / item / end / cancel
//   - 服务端帧：item(streamId, value) / end / error
//   - session/follow 的 payload = { args: { request: { address, assistantStream, ... } } }
//   - 返回帧 value：snapshot（历史快照）| event（新事件）| assistant-stream（流式）
//   - assistant-stream 帧：start / chunk（text-delta / reasoning-delta / tool-call-delta / block-* / usage / finish）/ end

import { WebSocketMethodList, KEY_BASE_URL, KEY_COOKIE } from '../constants';

/** 计算 WebSocket 端点 URL */
function wsUrl(): string {
  // #ifdef H5
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/remote.mux`;
  // #endif
  // #ifdef APP-PLUS
  const base = String(uni.getStorageSync(KEY_BASE_URL) || '');
  return base.replace(/^http/, 'ws') + '/api/remote.mux';
  // #endif
  // #ifndef H5 || APP-PLUS
  return '';
  // #endif
}

/**
 * 订阅会话事件流（开启 assistantStream，逐段下发 assistant 输出）。
 * @param sessionId 会话 id
 * @param onFrame 收到一个 follow 帧时回调（snapshot / event / assistant-stream）
 * @param onDone 流结束（end/error/close）时回调
 * @returns 取消订阅函数
 */
export function followSession(
  sessionId: string,
  onFrame: (frame: unknown) => void,
  onDone?: () => void,
): () => void {
  const streamId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let closed = false;
  let task: UniApp.SocketTask | null = null;

  const finish = (reason?: string) => {
    if (closed) return;
    closed = true;
    console.log('[ws] finish:', reason || '');
    try {
      task?.close({});
    } catch {
      /* noop */
    }
    onDone?.();
  };

  const openStream = () => {
    task?.send({
      data: JSON.stringify({
        type: 'open',
        streamId,
        endpoint: WebSocketMethodList.follow,
        payload: {
          args: {
            request: {
              address: { kind: 'session', sessionId },
              assistantStream: true, // 开启流式：assistant-stream 帧逐段下发
            },
          },
        },
      }),
    });
  };

  const onMessage = (raw: string) => {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.streamId !== streamId) return;
    if (msg.type === 'item') {
      onFrame(msg.value);
    } else if (msg.type === 'end' || msg.type === 'error') {
      finish(`frame:${msg.type}`);
    }
  };

  // App 端：手动带 cookie（H5 走同源代理，浏览器自动带）
  let header: Record<string, string> = {};
  // #ifdef APP-PLUS
  const cookie = uni.getStorageSync(KEY_COOKIE);
  if (cookie) header = { Cookie: String(cookie) };
  // #endif

  console.log('[ws] url:', wsUrl(), '| cookie:', header.Cookie ? '有' : '无');

  task = uni.connectSocket({
    url: wsUrl(),
    header,
    complete: () => {},
  });
  task.onOpen(() => {
    console.log('[ws] onOpen');
    openStream();
  });
  task.onMessage((res) => {
    console.log('[ws] onMessage:', String(res.data).slice(0, 300));
    onMessage(String(res.data));
  });
  task.onError(() => {
    console.log('[ws] onError');
    finish('error');
  });
  task.onClose((res: any) => {
    console.log('[ws] onClose:', JSON.stringify(res));
    finish('close');
  });

  return finish;
}
