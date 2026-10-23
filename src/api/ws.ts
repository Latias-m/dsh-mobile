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

/** ws 物理连接状态 */
export type WsConnStatus = 'connected' | 'disconnected';

/** follow 句柄：支持手动重连与取消 */
export interface FollowHandle {
  /** 停止订阅并关闭连接（离开页面时调用） */
  cancel: () => void;
  /** 手动重连（断开后重新建立连接并重新 open 流） */
  reconnect: () => void;
}

/**
 * 订阅会话事件流（开启 assistantStream，逐段下发 assistant 输出）。
 * 断线后不自动 finish，而是标记 disconnected 并交给上层 timer 驱动重连；
 * 只有显式 cancel 才会真正结束并触发 onDone。
 * @param sessionId 会话 id
 * @param onFrame 收到一个 follow 帧时回调（snapshot / event / assistant-stream）
 * @param onDone 显式取消时回调（不再用于断线提示）
 * @param onStatus 物理连接状态变化回调（connected / disconnected）
 * @returns 句柄（cancel / reconnect）
 */
export function followSession(
  sessionId: string,
  onFrame: (frame: unknown) => void,
  onDone?: () => void,
  onStatus?: (status: WsConnStatus) => void,
): FollowHandle {
  let closed = false;
  let task: UniApp.SocketTask | null = null;
  let streamId = '';

  const cleanupSocket = () => {
    try {
      task?.close({});
    } catch {
      /* noop */
    }
    task = null;
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
      // 逻辑流结束：标记断开，交给上层 timer 重连
      cleanupSocket();
      onStatus?.('disconnected');
    }
  };

  const connect = () => {
    if (closed) return;
    streamId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // App 端：手动带 cookie（H5 走同源代理，浏览器自动带）
    let header: Record<string, string> = {};
    // #ifdef APP-PLUS
    const cookie = uni.getStorageSync(KEY_COOKIE);
    if (cookie) header = { Cookie: String(cookie) };
    // #endif

    console.log('[ws] connect url:', wsUrl(), '| cookie:', header.Cookie ? '有' : '无');

    task = uni.connectSocket({
      url: wsUrl(),
      header,
      complete: () => {},
    });
    task.onOpen(() => {
      if (closed) return;
      console.log('[ws] onOpen');
      onStatus?.('connected');
      openStream();
    });
    task.onMessage((res) => {
      if (closed) return;
      onMessage(String(res.data));
    });
    task.onError(() => {
      if (closed) return;
      console.log('[ws] onError');
      cleanupSocket();
      onStatus?.('disconnected');
    });
    task.onClose(() => {
      if (closed) return;
      console.log('[ws] onClose');
      cleanupSocket();
      onStatus?.('disconnected');
    });
  };

  const cancel = () => {
    if (closed) return;
    closed = true;
    cleanupSocket();
    console.log('[ws] cancel');
    onDone?.();
  };

  const reconnect = () => {
    if (closed) return;
    cleanupSocket();
    connect();
  };

  connect();

  return { cancel, reconnect };
}
