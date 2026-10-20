<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
onLaunch(() => {
  console.log('App Launch');
});
onShow(() => {
  console.log('App Show');
});
onHide(() => {
  console.log('App Hide');
});
</script>
<style>
/* 让每个页面的根节点占满可视高度（H5 端 page 映射为 uni-page-body，会扣除导航栏） */
page {
  height: 100%;
}

.title {
  font-size: 36rpx;
  color: #8f8f94;
}

/* H5 端滚动条美化：细、圆角、半透明（App 端原生滚动条不受 CSS 控制） */
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
}
::-webkit-scrollbar-track {
  background: transparent;
}
/* Firefox 滚动条 */
uni-scroll-view .uni-scroll-view {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
</style>
