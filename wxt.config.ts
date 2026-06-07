import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'b-note',
    description: '一键总结B站视频，生成带时间戳的笔记',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'b-note',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
