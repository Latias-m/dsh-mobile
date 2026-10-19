// src/api/rpc.ts
// Typert RPC 信封构建 —— 拼出 DSH 要的请求格式

import { HttpMethodList } from '../constants'

/** RPC 请求信封结构 */
// rpc.ts
export interface RpcRequest<T = Record<string, unknown>> {
  type: 'client-request'
  rpcId: string
  method: string
  payload: { args: Record<string, T> }
}

let seq = 0

/** 生成自增的 rpcId（用于匹配请求和响应） */
function nextRpcId(): string {
    seq += 1
    return String(seq)
}

/**
 * 构建一个 Typert RPC 请求信封
 * @param method 例如 'session/list'
 * @param request   参数，例如 {  }
 */
export function buildRequest<T extends object>(
  method: string,
  request: T,
): RpcRequest<T> {
  const isList = method === HttpMethodList.list


  const args: any = isList
    ? { _request: request }
    : { request: request }

  return {
    type: 'client-request',
    rpcId: nextRpcId(),
    method,
    payload: { args },
  }
}
