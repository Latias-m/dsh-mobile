// tests/rpc.test.ts
import { describe, it, expect } from 'vitest'
import { buildRequest } from '../src/api/rpc'

describe('buildRequest 信封构建', () => {
  it('session/list 用 _request 参数名', () => {
    const r = buildRequest('session/list', { })
    expect(r).toEqual({
      type: 'client-request',
      rpcId: expect.any(String),
      method: 'session/list',
      payload: { args: { _request: {} } },
    })
  })

  it('session/create 用 request 参数名', () => {
    const r = buildRequest('session/create',  { cwd: 'C:\\xxoo' })
    expect(r.payload).toEqual({ args: { request: { cwd: 'C:\\xxoo' } } })
  })

  it('session/prompt 完整报文', () => {
    const r = buildRequest('session/prompt', {
        requestId: 'r1',
        sessionId: 'abc',
        mode: 'queue',
        content: [{ type: 'text', text: '你好' }],
    })
    expect(r.payload.args.request.content).toEqual([{ type: 'text', text: '你好' }])
  })
})