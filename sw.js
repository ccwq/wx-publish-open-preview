/* Service worker for 公众号主题总览（GitHub Pages 子路径安全）。
 *
 * 缓存策略（明确约定）：
 * - 所有 HTML 文档（导航请求 + SPA 对主题页的 fetch）：network-first。
 *   在线时永远回源，主题页/总览页不会陈旧；仅离线时回退到缓存副本。
 * - 静态资源（icons、manifest、404 兜底）：cache-first，通过 CACHE 版本号
 *   失效；发布新图标时需递增版本号。
 * - 离线导航（含未知深层路径，即 404.html 的向上爬取场景）最终回退到
 *   缓存的总览根页 './'。
 * - 跨域请求一律不拦截。
 */
const CACHE = 'wxpwa-v2';
const SHELL = [
  './',
  './index.html',
  './404.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const THEME_PAGES = [
  'archive-green.html', 'bigwhite.html', 'blackhead-editorial.html',
  'blue.html', 'codex-notebook.html', 'color-material-editorial.html',
  'crayon-editorial.html', 'darkgreen-monitor.html', 'deepblue-editorial.html',
  'editorial-system.html', 'graphite-minimal.html', 'graph-paper-manual.html',
  'green.html', 'handline-editorial.html', 'hardblue-manual.html',
  'main-editorial.html', 'moyu-green.html', 'moyu-ticket.html',
  'olive-journal.html', 'paper-editorial.html', 'pixelstack-editorial.html',
  'redswiss-editorial.html', 'red-white.html', 'sage-swiss.html',
  'scrapbook-notebook.html', 'white-purple-workbench.html',
  'wood-editorial.html', 'zen-whitespace.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    /* 主题页逐个预缓存：单个失败不阻塞安装 */
    await Promise.allSettled(THEME_PAGES.map((p) => cache.add(p)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('wxpwa-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* HTML 判定：导航请求、.html 路径（SPA 的 fetch() 不带 accept: text/html，
     不能只看 accept 头）、目录路径 */
  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/')
    || accept.includes('text/html');

  if (isHTML) {
    /* network-first：在线绝不返回缓存文档。
       用 cache:'no-cache' 覆盖请求原有 cache 模式（SPA 的 force-cache、
       浏览器启发式缓存），确保每次都向服务器校验，杜绝陈旧 HTML。 */
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(req, { cache: 'no-cache' }));
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
        return hit || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  /* cache-first：静态资源 */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return Response.error();
    }
  })());
});
