/**
 * الجسر الوحيد بين واجهة Your World وبين نظام الحاسبة.
 * الواجهة لا تصل إلى Node ولا إلى نظام الملفات مباشرة — تنادي هذه الدوال
 * بأسمائها فقط، وكل واحدة منها مكتوبة ومحدودة في `main.js`.
 */

const { contextBridge, ipcRenderer } = require('electron');

const call = (name, arg) => ipcRenderer.invoke('yw', name, arg);

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,

  /* الأغاني */
  musicPickFolder: () => call('musicPickFolder'),
  musicScan: () => call('musicScan'),
  musicFolder: () => call('musicFolder'),

  /* النسخ الاحتياطي والملفات */
  saveText: (name, text) => call('saveText', { name, text }),
  openText: () => call('openText'),
  findBackups: () => call('findBackups'),
  readText: (uri) => call('readText', { uri }),
  openExternalFile: (name, mime, data) => call('openExternalFile', { name, mime, data }),

  /* معلومات */
  platform: () => call('platform'),
  version: () => call('version'),
});
