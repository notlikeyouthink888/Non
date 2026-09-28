/**
 * Your World على الحاسبة — غلاف Electron حول نفس التطبيق.
 *
 * الملفات تُقدَّم عبر بروتوكول خاصّ ثابت `yourworld://app/` بدل `file://`،
 * لسببين: أوّلهما أنّ أصل الصفحة يبقى ثابتًا فلا تضيع بياناتك (IndexedDB
 * و localStorage مربوطان بالأصل)، وثانيهما أنّ عوامل الخيط والوحدات
 * الديناميكية (عارض PDF مثلًا) لا تعمل من `file://`.
 *
 * وملفات جهازك (الأغاني والصور) تُبثّ عبر `yourworld://file/<المسار>` مع دعم
 * طلبات النطاق (Range) حتى يعمل التقديم والتأخير في المشغّل دون تحميل
 * الأغنية كاملة في الذاكرة.
 */

const { app, BrowserWindow, Menu, dialog, shell, protocol, ipcMain, nativeTheme } = require('electron');
const { createReadStream, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { Readable } = require('node:stream');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_HOST = 'app';
const FILE_HOST = 'file';
const SCHEME = 'yourworld';

/** جذر ملفات الواجهة المبنية (dist). */
const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist');

/* ─────────────────── إعدادات محفوظة ─────────────────── */

const prefsFile = () => path.join(app.getPath('userData'), 'desktop.json');

function readPrefs() {
  try { return JSON.parse(readFileSync(prefsFile(), 'utf8')); } catch { return {}; }
}

function writePrefs(next) {
  try {
    mkdirSync(path.dirname(prefsFile()), { recursive: true });
    writeFileSync(prefsFile(), JSON.stringify(next, null, 2));
  } catch (err) { console.warn('[prefs]', err.message); }
}

/* ─────────────────── أنواع الملفات ─────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pfb': 'application/octet-stream',
  '.bcmap': 'application/octet-stream',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.wma': 'audio/x-ms-wma',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.oga', '.wav', '.flac', '.wma']);

const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

/* ─────────────────── تقديم الملفات ─────────────────── */

/** يحوّل تيّار Node إلى جسم استجابة ويب. */
const toWeb = (stream) => Readable.toWeb(stream);

/**
 * استجابة ملف من القرص مع دعم Range — بدونه لا يعمل التنقّل داخل الأغنية.
 */
function fileResponse(filePath, rangeHeader) {
  let stat;
  try { stat = statSync(filePath); } catch { return new Response('not found', { status: 404 }); }
  if (!stat.isFile()) return new Response('not a file', { status: 404 });

  const type = mimeOf(filePath);
  const common = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };

  const m = rangeHeader && /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (m) {
    const size = stat.size;
    let start = m[1] ? Number(m[1]) : 0;
    let end = m[2] ? Number(m[2]) : size - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
    if (start > end) {
      return new Response(null, { status: 416, headers: { ...common, 'Content-Range': `bytes */${size}` } });
    }
    return new Response(toWeb(createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        ...common,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
    });
  }

  return new Response(toWeb(createReadStream(filePath)), {
    status: 200,
    headers: { ...common, 'Content-Length': String(stat.size) },
  });
}

/** ملف من حزمة الواجهة، مع منع الخروج خارج جذرها. */
function webResponse(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  const full = path.join(webRoot, path.normalize(rel));
  if (!full.startsWith(webRoot)) return new Response('forbidden', { status: 403 });
  try {
    if (statSync(full).isDirectory()) return webResponse(path.join(rel, 'index.html'));
  } catch {
    return new Response('not found', { status: 404 });
  }
  return fileResponse(full, null);
}

/* ─────────────────── مسح مجلّد الأغاني ─────────────────── */

/** يمشي في المجلّد وما تحته ويجمع ملفات الصوت (بحدّ للعمق تفاديًا للدوران). */
function walkAudio(root, depth = 0, out = []) {
  if (depth > 8 || out.length > 20000) return out;
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walkAudio(full, depth + 1, out);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

const fileUrl = (p) => `${SCHEME}://${FILE_HOST}/${encodeURIComponent(p)}`;

/** يبني قائمة الأغاني بالشكل الذي تتوقّعه الواجهة. */
function scanFolder(folder) {
  if (!folder) return { folder: null, tracks: [] };
  const files = walkAudio(folder);
  const tracks = files.map((full) => {
    let size = 0;
    let addedAt = Date.now();
    try {
      const st = statSync(full);
      size = st.size;
      addedAt = st.mtimeMs;
    } catch { /* نتجاهل ملفًا تعذّرت قراءته */ }

    const base = path.basename(full, path.extname(full));
    const parent = path.basename(path.dirname(full));
    // «فنان - عنوان» نمط شائع في أسماء الملفات
    const dash = base.split(' - ');
    const hasArtist = dash.length > 1 && dash[0].trim().length > 1;

    return {
      id: `d-${Buffer.from(full).toString('base64url')}`,
      title: (hasArtist ? dash.slice(1).join(' - ') : base).trim(),
      artist: hasArtist ? dash[0].trim() : 'غير معروف',
      album: parent || 'الحاسبة',
      durationMs: 0,             // تُقرأ في الواجهة عند التشغيل
      uri: fileUrl(full),
      artUri: null,
      size,
      path: full,
      addedAt,
    };
  });
  return { folder, tracks };
}

/* ─────────────────── النافذة ─────────────────── */

let win = null;

function createWindow() {
  const prefs = readPrefs();
  const b = prefs.bounds || {};

  win = new BrowserWindow({
    width: b.width || 1120,
    height: b.height || 820,
    x: b.x,
    y: b.y,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0b0e14',
    title: 'Your World',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`${SCHEME}://${APP_HOST}/index.html`);

  const remember = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    writePrefs({ ...readPrefs(), bounds: win.getNormalBounds() });
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; });

  // أي رابط خارجي يُفتح بالمتصفّح لا داخل التطبيق
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://${APP_HOST}`)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Your World',
      submenu: [
        { label: 'إعادة تحميل', accelerator: 'CmdOrCtrl+R', click: () => win?.reload() },
        { label: 'ملء الشاشة', accelerator: 'F11', click: () => win?.setFullScreen(!win.isFullScreen()) },
        { type: 'separator' },
        { label: 'تكبير', role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
        { label: 'تصغير', role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { label: 'الحجم الأصلي', role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { type: 'separator' },
        { label: 'أدوات المطوّر', accelerator: 'CmdOrCtrl+Shift+I', click: () => win?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'إغلاق', role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'تحرير',
      submenu: [
        { label: 'تراجع', role: 'undo' },
        { label: 'إعادة', role: 'redo' },
        { type: 'separator' },
        { label: 'قصّ', role: 'cut' },
        { label: 'نسخ', role: 'copy' },
        { label: 'لصق', role: 'paste' },
        { label: 'تحديد الكل', role: 'selectAll' },
      ],
    },
  ]));
}

/* ─────────────────── الإقلاع ─────────────────── */

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    bypassCSP: false,
  },
}]);

// نسخة واحدة فقط — فتح ثانية يوقظ النافذة الموجودة
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';

    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url);
      if (url.hostname === FILE_HOST) {
        const target = decodeURIComponent(url.pathname.replace(/^\//, ''));
        return fileResponse(target, request.headers.get('Range'));
      }
      return webResponse(url.pathname);
    });

    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/* ─────────────────── ما تناديه الواجهة عبر preload ─────────────────── */

const handlers = {
  /** يفتح منتقي مجلّد ثم يمسحه ويتذكّره. */
  async musicPickFolder() {
    const r = await dialog.showOpenDialog(win, {
      title: 'اختر مجلّد الأغاني',
      properties: ['openDirectory'],
      buttonLabel: 'اختر',
    });
    if (r.canceled || !r.filePaths[0]) return { folder: null, tracks: [] };
    const out = scanFolder(r.filePaths[0]);
    writePrefs({ ...readPrefs(), musicFolder: out.folder });
    return out;
  },

  /** يمسح المجلّد المحفوظ من جديد. */
  async musicScan() {
    return scanFolder(readPrefs().musicFolder || null);
  },

  musicFolder() {
    return readPrefs().musicFolder || null;
  },

  /** يحفظ نصًّا بمربّع حوار النظام ويعيد المسار. */
  async saveText({ name, text }) {
    const r = await dialog.showSaveDialog(win, {
      title: 'احفظ النسخة الاحتياطية',
      defaultPath: path.join(app.getPath('downloads'), name || 'your-world-backup.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { saved: false };
    writeFileSync(r.filePath, text, 'utf8');
    return { saved: true, path: r.filePath };
  },

  /** يفتح ملفًا نصّيًا ويعيد محتواه. */
  async openText() {
    const r = await dialog.showOpenDialog(win, {
      title: 'اختر ملف النسخة',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { text: null };
    return { text: readFileSync(r.filePaths[0], 'utf8'), name: path.basename(r.filePaths[0]) };
  },

  /** يبحث عن نسخ Your World في مجلّدات التنزيل والمستندات. */
  async findBackups() {
    const dirs = [app.getPath('downloads'), app.getPath('documents'), app.getPath('desktop')]
      .filter(Boolean);
    const out = [];
    for (const dir of dirs) {
      let entries = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (!e.isFile() || !e.name.includes('your-world') || !e.name.endsWith('.json')) continue;
        const full = path.join(dir, e.name);
        try {
          const st = statSync(full);
          out.push({ name: e.name, uri: full, size: st.size, modified: st.mtimeMs, where: path.basename(dir) });
        } catch { /* تجاهل */ }
      }
    }
    return { files: out.sort((a, b) => b.modified - a.modified) };
  },

  readText({ uri }) {
    return { text: readFileSync(uri, 'utf8') };
  },

  /** يفتح ملفًا بتطبيق النظام (لغير PDF). */
  async openExternalFile({ name, mime, data }) {
    const dir = path.join(app.getPath('temp'), 'YourWorld');
    mkdirSync(dir, { recursive: true });
    const safe = String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
    const out = path.join(dir, safe);
    writeFileSync(out, Buffer.from(data, 'base64'));
    await shell.openPath(out);
    return { opened: true };
  },

  platform: () => process.platform,
  version: () => app.getVersion(),
  pathToFileURL: (p) => pathToFileURL(p).href,
};

// قناة واحدة مسمّاة: الواجهة لا تصل إلى Node إلا عبر هذه الدوال بالاسم
ipcMain.handle('yw', async (_e, name, arg) => {
  const fn = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : null;
  if (typeof fn !== 'function') throw new Error(`مجهول: ${name}`);
  return fn(arg);
});
