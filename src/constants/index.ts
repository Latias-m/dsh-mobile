// src/constants/index.ts
// 全局常量（key 文件）

// ============ 存储 key ============
export const KEY_COOKIE = 'dsh_cookie'
export const KEY_BASE_URL = 'dsh_base_url'
export const KEY_TOKEN = 'dsh_token'
export const KEY_CONNECTED = 'connected'

// ============ 默认值 ============
export const DEFAULT_BASE_URL = 'http://192.168.8.219:3080'

// ============ RPC 方法（HTTP，session 命名空间）============
export const HttpMethodList = {
  // 常用
  list: 'session/list',
  create: 'session/create',
  prompt: 'session/prompt',
  selectModel: 'session/selectModel',
  modelCatalog: 'session/modelCatalog',
  cancel: 'session/cancel',
  rename: 'session/rename',
  search: 'session/search',
  fork: 'session/fork',
  // 文件 / 路径
  attachment: 'session/attachment',
  openWorkspacePath: 'session/openWorkspacePath',
  canOpenWorkspacePath: 'session/canOpenWorkspacePath',
  workspacePathApplications: 'session/workspacePathApplications',
  // 进阶 / 内部
  page: 'session/page',
  projections: 'session/projections',
  initializeDefaultModel: 'session/initializeDefaultModel',
  updateQueue: 'session/updateQueue',
} as const

// ============ RPC 方法（WebSocket 流式）============
export const WebSocketMethodList = {
  follow: 'session/follow',
  control: 'session/control',
} as const

// ============ 派生类型 ============
export type HttpMethod = typeof HttpMethodList[keyof typeof HttpMethodList]
export type WebSocketMethod = typeof WebSocketMethodList[keyof typeof WebSocketMethodList]
