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
  },
});
