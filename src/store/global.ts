// src/store/global.ts
// 全局状态：当前用于侧边栏的连接状态点
import type { SessionListItem } from '@/api/types';
import { KEY_CONNECTED } from '@/constants';
import { defineStore } from 'pinia';

export type ConnStatus = 'disconnected' | 'unknow' | 'connected';

function getStatus(s: boolean) {
  if (s === true) {
    return 'connected';
  } else if (s === false) {
    return 'disconnected';
  } else {
    return 'unknow';
  }
}

export const useGlobalStore = defineStore('global', {
  state: () => {
    return {
      status: getStatus(uni.getStorageSync(KEY_CONNECTED)),
      session: null as SessionListItem | null,
    };
  },
  actions: {
    setStatus(s: boolean) {
      this.status = getStatus(s);
    },
    setSession(session: SessionListItem) {
      this.session = session;
    },
    // 仅记录当前会话 id：新建会话直接进 chat 页时没有完整 SessionListItem，
    // 但右侧菜单切换模型只需要 sessionId。
    setSessionId(sessionId: string) {
      this.session = { sessionId } as unknown as SessionListItem;
    },
  },
});
