// src/api/history.ts
// 把 session/page 返回的原始事件流，转换成聊天界面直接可渲染的气泡列表。
//
// 分层模型（两层）：
//   气泡 Bubble —— 只有两种：用户气泡 / AI 回复气泡
//   部分 Part   —— AI 回复气泡内部的片段：文字 / 工具调用 / 工具结果 / 系统
//
// 职责边界：
//   client.ts   → getHistory() 发 HTTP、拿 SessionPageValue
//   history.ts  → toBubbles() 把事件流转成 Bubble[]（本文件）
//   chat.vue    → 渲染 Bubble[]

import type { SessionPageRecord } from './types';

/** 顶层气泡：用户气泡 或 AI 回复气泡 */
export type Bubble = UserBubble | AssistantBubble;

/** 用户气泡：一条用户输入 */
export interface UserBubble {
  role: 'user';
  /** 事件序号 */
  seq: number;
  /** 事件时间戳（毫秒） */
  time: number;
  /** 所属轮次（可选） */
  turn?: number;
  /** 用户文字 */
  text: string;
}

/** AI 回复气泡：一条 AI 回复，内部由多个 part 组成 */
export interface AssistantBubble {
  role: 'assistant';
  /** 起始事件序号（parts 里第一条的 seq） */
  seq: number;
  /** 起始事件时间戳 */
  time: number;
  /** 所属轮次（可选） */
  turn?: number;
  /** AI 回复的所有部分（文字 / 工具调用 / 工具结果 / 系统） */
  parts: AssistantPart[];
}

/** part 的公共字段 */
interface AssistantPartBase {
  /** 事件序号 */
  seq: number;
  /** 所属步骤（可选，AI 多步时） */
  step?: number;
}

/** AI 回复气泡内部的"部分"（判别联合） */
export type AssistantPart =
  | (AssistantPartBase & { kind: 'text'; text: string })
  | (AssistantPartBase & { kind: 'tool-call'; name: string; args: string })
  | (AssistantPartBase & { kind: 'tool-result'; text: string; isError?: boolean })
  | (AssistantPartBase & { kind: 'system'; text: string });

/**
 * 从 ContentBlock[] 里提取纯文本。
 * ContentBlock 可能是 text / image / tool-call，这里只取 text 块拼接。
 */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('');
}

/**
 * 把 session/page 的原始事件流转换成气泡列表。
 *
 * 分组规则：
 *   - user/message → 单独的用户气泡
 *   - assistant/message + tool/call + tool/result + system/message → 聚成「一个」AI 回复气泡的 parts
 *   - turn/start ~ turn/end → 决定一个 AI 回复气泡何时结束
 *   - 其余事件（边界/内部/未知）→ 忽略
 */
export function toBubbles(records: SessionPageRecord[]): Bubble[] {
  const bubbles: Bubble[] = [];
  let parts: AssistantPart[] = [];
  let startSeq = 0;
  let startTime = 0;
  let currentTurn: number | undefined;

  // 把攒着的 parts 落成一个 AI 回复气泡
  const flush = () => {
    if (parts.length === 0) return;
    bubbles.push({
      role: 'assistant',
      seq: startSeq,
      time: startTime,
      turn: currentTurn,
      parts,
    });
    parts = [];
  };

  for (const r of records) {
    const e = r.event;
    const d = e.data as any;
    const step = typeof d?.step === 'number' ? (d.step as number) : undefined;

    switch (e.type) {
      case 'turn/start':
        currentTurn = typeof d?.turn === 'number' ? (d.turn as number) : undefined;
        flush(); // 新的一轮开始，把上一轮的 AI 回复先落下去
        break;

      case 'turn/end':
        flush(); // 本轮结束，AI 回复到此为止
        currentTurn = undefined;
        break;

      case 'user/message':
        flush(); // 用户消息前，先把之前攒的 AI 回复发出去
        bubbles.push({
          role: 'user',
          seq: e.seq,
          time: e.time,
          turn: currentTurn,
          text: textOf(d?.content),
        });
        break;

      case 'assistant/message': {
        const text = textOf(d?.message?.content);
        if (!text) break; // 空文字（可能只是纯工具调用的消息）不产生 part
        if (parts.length === 0) {
          startSeq = e.seq;
          startTime = e.time;
        }
        parts.push({ kind: 'text', seq: e.seq, step, text });
        break;
      }

      case 'tool/call': {
        if (parts.length === 0) {
          startSeq = e.seq;
          startTime = e.time;
        }
        parts.push({ kind: 'tool-call', seq: e.seq, step, name: d?.name, args: d?.arguments });
        break;
      }

      case 'tool/result': {
        if (parts.length === 0) {
          startSeq = e.seq;
          startTime = e.time;
        }
        parts.push({
          kind: 'tool-result',
          seq: e.seq,
          step,
          text: textOf(d?.message?.content),
          isError: d?.error != null,
        });
        break;
      }

      case 'system/message': {
        const text = textOf(d?.message?.content);
        if (!text) break;
        if (parts.length === 0) {
          startSeq = e.seq;
          startTime = e.time;
        }
        parts.push({ kind: 'system', seq: e.seq, step, text });
        break;
      }

      // 其余事件（step/start、step/end、request/*、approval/*、内部事件等）→ 忽略
      default:
        break;
    }
  }

  flush(); // 收尾：把最后一个还没落的 AI 回复发出去
  return bubbles;
}
