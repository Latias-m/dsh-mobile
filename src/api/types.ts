// src/api/types.ts
// session/list 接口返回体类型（从 DSH 源码 schema 提取）

/** session/list 返回体 */
export interface SessionListValue {
  /** 会话列表 */
  items: SessionListItem[]
}

/** 单个会话条目 */
export interface SessionListItem {
  /** 该会话的 agent 是否可用（能否继续对话） */
  agentAvailable: boolean
  /** 会话唯一标识（selectModel / prompt / page 等操作都要用它） */
  sessionId: string
  /** 最后更新时间戳（毫秒） */
  updatedAt: number
  /** 会话是否正在运行（有正在执行的 turn，如流式输出中） */
  running: boolean
  /** 是否空会话（还没发过任何消息） */
  blank: boolean
  /** 父会话 id（仅 subagent 有；主会话没有此字段） */
  parentSessionId?: string
  /** 来源标记："subagent" 表示这是子代理会话 */
  origin?: 'subagent'
  /** 会话的工作目录（agent 操作的根路径） */
  cwd?: string
  /** 会话投影（标题、agent 预设、待办等摘要状态） */
  projections?: SessionProjections
}

/** 会话投影（标题、agent 预设等摘要状态） */
export interface SessionProjections {
  /** 投影类型：cached=缓存快照 / sequenced=按事件序重建 */
  kind: 'cached' | 'sequenced'
  /** 投影对应的最新事件序号（seq） */
  asOfSeq: number
  /** 投影的具体值 */
  values: SessionProjectionValues
}

/** 投影值（只列出常用字段，其余用索引签名兜底） */
export interface SessionProjectionValues {
  /** 当前使用的 agent 预设名（如「控制」「冒险」） */
  agentPreset?: string | null
  /** 会话标题（列表页显示的名字） */
  title?: string | null
  /** 待办列表 */
  todos?: {
    /** 待办内容 */
    content: string
    /** 待办状态：completed=已完成 / pending=未开始 / in_progress=进行中 */
    status: 'completed' | 'pending' | 'in_progress'
  }[] | null
  /** 其余未列出的投影字段（inbox、modelSelection、goal 等） */
  [key: string]: unknown
}

// ============ session/page（查询会话历史记录）============

/** 会话地址：普通会话 or 子代理 */
export type SessionAddress =
  | { kind: 'session'; sessionId: string }
  | { kind: 'subagent'; parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' | 'unknown' }

/** session/page 请求体（查询会话历史） */
export interface SessionPageRequest {
  /** 目标会话地址（普通会话用 { kind: 'session', sessionId }） */
  address: SessionAddress
  /** 读到这个序号（seq）为止 */
  throughSeq: number
  /** 分页：只取这个 seq 之前的记录（翻更早的历史） */
  beforeSeq?: number
  /** 单次最多返回多少条 */
  maxMessages?: number
  /** 按轮次窗口筛选（可选） */
  turnWindow?: {
    minMessages: number
    minTurns: number
  }
}

/** session/page 返回体（会话历史记录） */
export interface SessionPageValue {
  /** 历史事件记录 */
  records: SessionPageRecord[]
  /** 是否还有更早的历史（配合 beforeSeq 往前翻页） */
  hasMore: boolean
}

/** 单条历史事件记录 */
export interface SessionPageRecord {
  type: 'event'
  event: {
    /** 事件类型（如 assistant/message、tool/call、turn/end 等） */
    type: string
    /** 事件序号（seq） */
    seq: number
    /** 事件时间戳 */
    time: number
    /** 事件内容（JSON，结构随 event.type 变化） */
    data: unknown
    /** 是否可忽略的事件 */
    ignorable?: boolean
  }
}

// ============ session/prompt（发送消息）============

/** 消息内容单元（文本 / 图片 / 文件） */
export type PromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string; name?: string }
  | { type: 'file'; receiptId: string }

/** session/prompt 请求体（发送消息） */
export interface SessionPromptRequest {
  /** 本轮请求的唯一 id（客户端生成，用于取消/重试关联） */
  requestId: string
  /** 目标会话 id */
  sessionId: string
  /** 模式：queue=普通发送（排队追加）；steer=改写已发内容 */
  mode: 'queue' | 'steer'
  /** 消息内容（文字/图片/文件） */
  content: PromptContent[]
  /** 客户端时区（可选） */
  clientTimeZone?: string
}

/** session/prompt 返回体 */
export interface SessionPromptValue {
  /** 是否已被接受并排队（真正的回复走 WebSocket 流式，不在这里返回） */
  accepted: true
}

// ============ session/create（新建会话）============

/** session/create 请求体 */
export interface SessionCreateRequest {
  /** 工作区 id（可选） */
  workspaceId?: string
  /** 工作目录（可选） */
  cwd?: string
  /** 会话 id（可选，不传则服务端自动生成） */
  sessionId?: string
  /** 人设（可选，如 standard / ptc / minimal / cordis） */
  agentPreset?: string
}

/** session/create 返回体 */
export interface SessionCreateValue {
  /** 新会话 id */
  sessionId: string
  /** 实际生效的人设（可选） */
  agentPreset?: string
}

// ============ session/follow（WebSocket 流式订阅）============

/** session/follow 请求体 */
export interface SessionFollowRequest {
  /** 目标会话地址 */
  address: SessionAddress
  /** 是否开启 assistant 流式（打字机效果）；不传 = 整段输出 */
  assistantStream?: true
  /** 快照最多返回多少条消息 */
  maxMessages?: number
  /** 按轮次窗口筛选 */
  turnWindow?: {
    minMessages: number
    minTurns: number
  }
}

// ============ session/modelCatalog（模型目录）============

/** 一个模型选择（provider + model + 可选思考强度） */
export interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 模型目录里的一组（一个 provider 下的所有模型） */
export interface ModelGroup {
  /** provider id（selectModel 的 provider 字段） */
  id: string
  /** provider 显示名 */
  name: string
  /** 该 provider 下的模型 */
  models: ModelEntry[]
}

/** 单个模型条目 */
export interface ModelEntry {
  /** model id（selectModel 的 model 字段） */
  id: string
  /** model 显示名 */
  name: string
  /** 模型描述（可选） */
  description?: string
  /** 推理能力（只有推理模型才有） */
  reasoning?: {
    efforts: { id: string; name: string; description?: string }[]
    defaultEffort?: string
  }
}

/** 拉取失败的 provider（如缺 API key） */
export interface ModelCatalogFailure {
  id: string
  name: string
  message: string
}

/** session/modelCatalog 返回体 */
export interface ModelCatalogValue {
  /** 当前全局默认模型 */
  default: ModelSelection
  /** 可路由的 provider id 列表 */
  routableProviders: string[]
  /** 可用模型分组 */
  groups: ModelGroup[]
  /** 拉取失败的 provider */
  failures: ModelCatalogFailure[]
}

// ============ session/selectModel（选择模型）============

/** session/selectModel 请求体 */
export interface SelectModelRequest {
  /** 目标会话 id */
  sessionId: string
  /** provider id（来自 modelCatalog 的 groups[].id） */
  provider: string
  /** model id（来自 modelCatalog 的 models[].id） */
  model: string
  /** 思考强度（可选，仅推理模型） */
  reasoningEffort?: string
}

/** session/selectModel 返回体 */
export interface SelectModelValue {
  /** 实际生效的模型选择 */
  selected: ModelSelection
}

// ============ agentPresets/list（人设列表）============

/** 单个人设条目 */
export interface AgentPresetRow {
  /** 人设 id（session/create 的 agentPreset 字段） */
  id: string
  /** 是否为默认人设 */
  isDefault: boolean
  /** 人设显示名（可选） */
  name?: string
  /** 人设描述（可选） */
  description?: string
  /** 加载失败原因（有值 = 该人设不可用） */
  broken?: string
}

/** agentPresets/list 返回体 */
export interface AgentPresetListValue {
  /** 可用人设列表 */
  presets: AgentPresetRow[]
}
