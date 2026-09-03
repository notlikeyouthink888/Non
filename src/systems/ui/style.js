export const CSS = `
#hud { position:fixed; inset:0; pointer-events:none; font-family:"Segoe UI","Noto Sans Arabic",Tahoma,system-ui,sans-serif;
  direction:rtl; color:#eaf1f8; --panel:rgba(13,19,27,.82); --edge:rgba(255,255,255,.10); --accent:#57b6ff; }
#hud * { box-sizing:border-box; }
#hud .pane { pointer-events:auto; background:var(--panel); border:1px solid var(--edge); border-radius:14px;
  backdrop-filter:blur(14px) saturate(1.25); -webkit-backdrop-filter:blur(14px) saturate(1.25); box-shadow:0 10px 34px rgba(0,0,0,.45); }

/* الشريط العلوي */
#topbar { position:absolute; top:10px; right:10px; left:10px; display:flex; gap:8px; align-items:stretch; flex-wrap:wrap; }
#stats { display:flex; gap:4px; padding:7px 10px; align-items:center; flex-wrap:wrap; }
.stat { display:flex; align-items:center; gap:6px; padding:4px 9px; border-radius:9px; background:rgba(255,255,255,.045); white-space:nowrap; }
.stat b { font-weight:700; font-size:14px; letter-spacing:.2px; font-variant-numeric:tabular-nums; }
.stat span { font-size:11px; color:#9fb0c2; }
.stat i { font-style:normal; font-size:14px; opacity:.92; }
#clock { display:flex; align-items:center; gap:9px; padding:7px 12px; margin-inline-start:auto; }
#clock .t { font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; min-width:56px; text-align:center; }
#timeSlider { width:130px; accent-color:var(--accent); }
.btn { pointer-events:auto; border:1px solid var(--edge); background:rgba(255,255,255,.06); color:#eaf1f8;
  border-radius:10px; padding:7px 11px; font-size:13px; cursor:pointer; transition:.15s; user-select:none; line-height:1.1; }
.btn:hover { background:rgba(255,255,255,.13); }
.btn.on { background:linear-gradient(180deg,#2f89d8,#1f6fb5); border-color:#67b6ef; box-shadow:0 0 0 1px rgba(103,182,239,.35) inset; }
.btn.sm { padding:5px 8px; font-size:12px; }

/* شريط الأدوات السفلي */
#toolbar { position:absolute; bottom:12px; right:50%; transform:translateX(50%); display:flex; gap:6px; padding:8px; align-items:center; max-width:96vw; overflow-x:auto; }
#toolbar .group { display:flex; gap:4px; padding-inline-end:6px; border-inline-end:1px solid var(--edge); }
#toolbar .group:last-child { border:0; padding:0; }
.tool { min-width:52px; height:46px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  border-radius:10px; border:1px solid var(--edge); background:rgba(255,255,255,.05); cursor:pointer; transition:.13s; padding:0 6px; }
.tool:hover { background:rgba(255,255,255,.12); transform:translateY(-1px); }
.tool.on { background:linear-gradient(180deg,#2f89d8,#1f6fb5); border-color:#7cc3f5; }
.tool .ic { font-size:17px; line-height:1; }
.tool .lb { font-size:10px; color:#c8d6e4; }
.tool.on .lb { color:#fff; }

/* اللوحة الجانبية */
#side { position:absolute; top:64px; left:10px; display:flex; flex-direction:column; gap:6px; }
#side .btn { width:42px; height:38px; display:flex; align-items:center; justify-content:center; font-size:16px; }

/* لوحة التشخيص */
#diag { position:absolute; top:64px; right:10px; padding:10px 12px; font-size:11.5px; line-height:1.65; display:none;
  direction:ltr; text-align:left; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; min-width:220px; max-height:70vh; overflow:auto; }
#diag.show { display:block; }
#diag .k { color:#8fa5ba; }
#diag .v { color:#eaf1f8; font-weight:600; }
#diag .bad { color:#ff7a6b; }
#diag .ok { color:#6ee7a8; }

/* الإشعارات */
#toasts { position:absolute; bottom:78px; right:50%; transform:translateX(50%); display:flex; flex-direction:column; gap:6px; align-items:center; }
.toast { pointer-events:none; padding:8px 14px; border-radius:10px; background:rgba(13,19,27,.88); border:1px solid var(--edge);
  font-size:13px; animation:pop .25s ease, fade .4s ease 2.4s forwards; }
.toast.warn { border-color:#c79a3a; } .toast.err { border-color:#d9534f; }
@keyframes pop { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;} }
@keyframes fade { to { opacity:0; transform:translateY(-6px); } }

/* تلميح الأداة النشطة */
#hint { position:absolute; bottom:70px; right:50%; transform:translateX(50%); font-size:12px; color:#b9c9d8;
  background:rgba(13,19,27,.7); padding:4px 12px; border-radius:8px; display:none; }
#hint.show { display:block; }

/* شاشات صغيرة */
@media (max-width: 820px) {
  #stats { font-size:12px; padding:5px 7px; }
  .stat span { display:none; }
  #timeSlider { width:84px; }
  .tool { min-width:44px; height:42px; }
  #side { top:56px; }
}
`;
