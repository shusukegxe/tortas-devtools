'use strict';
/* Tortas · Hechas a Mano — estadísticas y devtools.
   Página de observabilidad para devs: estadísticas de ventas calculadas en vivo
   desde los datos compartidos (ventas por producto, pedidos por estado, ingresos
   por día, latencias), arquitectura en vivo, registro de la API, estado crudo y
   reinicio de la demo. Los datos vienen de las páginas pedidos-express y
   tortas-manager vía el mismo Store (localStorage + BroadcastChannel). */

const app = (() => {
  const viewEl = document.getElementById('view');

  // ---------- iconos ----------
  const P = {
    terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
    receipt: '<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z"/><path d="M14 2.5v5h5"/><path d="M9 12.5h6M9 16h6"/>',
    zap: '<path d="M13 2 3 14h8l-1 8 11-13h-9l1-7Z"/>',
    bell: '<path d="M6.4 9a5.6 5.6 0 0 1 11.2 0c0 6 2.4 7.5 2.4 7.5H4S6.4 15 6.4 9"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
    refresh: '<path d="M3 12a9 9 0 1 0 2.6-6.3L3 8"/><path d="M3 3v5h5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };
  const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  document.querySelectorAll('.nav a[data-icon]').forEach(a => a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon, 17)));

  // ---------- monograma de reserva ----------
  const TILE_COLORS = [
    ['#eef2ff', '#4f46e5'], ['#ecfdf3', '#027a48'], ['#eff8ff', '#175cd3'],
    ['#fffaeb', '#b54708'], ['#f4f3ff', '#6938ef'], ['#f2f4f7', '#475467'],
  ];
  function tile(name, size, fs) {
    const letras = name.split(/\s+/).map(w => (w.match(/[a-záéíóúñü]/i) || [])[0]).filter(Boolean).map(s => s.toUpperCase());
    const ini = letras.length > 1 ? letras.slice(0, 2).join('') : name.replace(/[^a-záéíóúñü]/gi, '').slice(0, 2).toUpperCase();
    const [bg, fg] = TILE_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TILE_COLORS.length];
    return `<span class="tile" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${bg};color:${fg}">${ini}</span>`;
  }
  function pimg(p, size) {
    return `<img class="pimg" src="assets/${p.img}" alt="${Store.esc(p.name)}" loading="lazy" style="width:${size}px;height:${size}px" data-mono="${Store.esc(p.name)}" data-size="${size}">`;
  }
  document.addEventListener('error', e => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.dataset.mono) {
      const s = +t.dataset.size;
      const wrap = document.createElement('span');
      wrap.innerHTML = tile(t.dataset.mono, s, Math.round(s * .36));
      t.replaceWith(wrap.firstChild);
    }
  }, true);

  // ---------- estado ----------
  const ui = { logFilter: 'todos' };

  // ---------- helpers ----------
  function toast(msg, ic = 'bell') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon(ic, 15)}<span>${msg}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  const modalRoot = document.getElementById('modal-root');
  function openModal(html) { modalRoot.innerHTML = `<div class="modal">${html}</div>`; modalRoot.style.display = 'flex'; }
  function closeModal() { modalRoot.style.display = 'none'; modalRoot.innerHTML = ''; }
  modalRoot.addEventListener('click', e => { if (e.target === modalRoot) closeModal(); });
  let pendingConfirm = null;
  function confirmDialog({ title, body, ok, onOk }) {
    pendingConfirm = onOk;
    openModal(`
      <h3 style="margin-top:0">${title}</h3>
      <p>${body}</p>
      <div class="btn-row">
        <button class="btn" data-act="modal-close">Cancelar</button>
        <button class="btn primary" data-act="confirm-ok">${ok}</button>
      </div>`);
  }

  // ---------- vista (montaje único) ----------
  viewEl.innerHTML = `
    <div class="view-head">
      <div>
        <h1>Estadísticas y DevTools</h1>
        <div class="sub">Observabilidad del sistema: ventas calculadas en vivo desde el mismo Store que la tienda y el panel.</div>
      </div>
      <button class="btn danger" data-act="reset">${icon('refresh', 15)} Reiniciar demo</button>
    </div>
    <div class="kpis" id="dev-kpis"></div>
    <div class="stats-grid">
      <section class="card">
        <div class="card-head"><h2>Ventas por producto</h2><span class="badge b-gray">unidades · ingresos pagados</span></div>
        <div class="card-body" id="st-productos"></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Pedidos por estado</h2></div>
        <div class="card-body" id="st-estados"></div>
      </section>
    </div>
    <section class="card" style="margin-bottom:18px">
      <div class="card-head"><h2>Ingresos por día</h2><span class="badge b-gray">últimos 7 días · pagados</span></div>
      <div class="card-body" id="st-dias"></div>
    </section>
    <div class="dev-grid">
      <section class="card">
        <div class="card-head"><h2>Arquitectura en vivo</h2><span class="badge b-gray">eventos por módulo</span></div>
        <div class="card-body">
          <div class="arch">
            <div class="arch-box big" id="arq-cliente"><div class="t">Cliente</div><div class="m" id="arq-cliente-c">—</div></div>
            <div class="arrow"></div>
            <div class="arch-box big" id="arq-web"><div class="t">Web / App de pedidos</div><div class="m" id="arq-web-c">—</div></div>
            <div class="arrow"></div>
            <div class="arch-box big" id="arq-api"><div class="t">Backend · API + datos</div><div class="m" id="arq-api-c">—</div></div>
            <div class="fan" style="margin-top:14px">
              ${['pedidos', 'inventario', 'clientes', 'pagos', 'notificaciones'].map(m => `
                <div><div class="stub"></div>
                  <div class="arch-box" id="arq-${m}"><div class="t">${m[0].toUpperCase() + m.slice(1)}</div><div class="m" id="arq-${m}-c">0</div><div class="last" id="arq-${m}-l">—</div></div>
                </div>`).join('')}
            </div>
            <div class="fan-merge" style="width:100%">
              <div class="stub2"></div><div class="stub2"></div><div class="stub2"></div><div class="stub2"></div><div class="stub2"></div>
            </div>
            <div class="arrow"></div>
            <div class="arch-box big" id="arq-panel"><div class="t">Panel del negocio</div><div class="m" id="arq-panel-c">—</div></div>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head">
          <h2>Estado</h2>
          <button class="btn sm" data-act="copy-state">${icon('copy', 14)} Copiar JSON</button>
        </div>
        <div class="card-body"><pre class="dbpre" id="state-view"></pre></div>
      </section>
    </div>
    <section class="card">
      <div class="card-head">
        <h2>Registro de peticiones y eventos <span class="lat-chip" id="lat-chip" style="margin-left:8px"></span></h2>
        <div class="seg" id="log-filters"></div>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Hora</th><th>Operación</th><th>Origen</th><th>Módulo</th><th>Estado</th><th class="num" style="text-align:right">Latencia</th></tr></thead>
          <tbody id="req-body"></tbody>
        </table>
      </div>
    </section>`;

  // ---------- estadísticas ----------
  function computeStats() {
    const db = Store.db;
    const pagados = o => o.payStatus === 'aprobado' || o.payStatus === 'cobrado';

    const porProducto = db.products.map(p => {
      let unidades = 0, ingresos = 0;
      for (const o of db.orders) {
        if (o.status === 'cancelado') continue;
        for (const it of o.items) if (it.pid === p.id) { unidades += it.qty; ingresos += it.qty * it.price; }
      }
      return { ...p, unidades, ingresos };
    }).sort((a, b) => b.unidades - a.unidades);

    const porEstado = ['nuevo', 'preparando', 'enviado', 'entregado', 'cancelado']
      .map(s => ({ s, n: db.orders.filter(o => o.status === s).length }));

    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const del = db.orders.filter(o => new Date(o.createdAt).toDateString() === key);
      dias.push({
        lab: d.toLocaleDateString('es', { weekday: 'short' }),
        ingresos: del.filter(pagados).reduce((s, o) => s + o.total, 0),
        n: del.length,
      });
    }

    const latencias = db.events.filter(e => e.kind === 'http' && typeof e.ms === 'number').map(e => e.ms).sort((a, b) => a - b);
    const p50 = latencias.length ? latencias[Math.floor(latencias.length * .5)] : null;
    const p95 = latencias.length ? latencias[Math.min(latencias.length - 1, Math.floor(latencias.length * .95))] : null;

    return { porProducto, porEstado, dias, p50, p95 };
  }

  function updateStats() {
    const { porProducto, porEstado, dias, p50, p95 } = computeStats();

    const maxU = Math.max(1, ...porProducto.map(p => p.unidades));
    document.getElementById('st-productos').innerHTML = porProducto.map(p => `
      <div class="hbar">
        ${pimg(p, 26)}
        <span class="hbar-name">${Store.esc(p.name)}</span>
        <span class="hbar-track"><i style="width:${p.unidades / maxU * 100}%"></i></span>
        <span class="hbar-val">${p.unidades} u · ${Store.money(p.ingresos)}</span>
      </div>`).join('') || '<div class="empty">Sin datos</div>';

    const total = porEstado.reduce((s, e) => s + e.n, 0);
    const EST_COLOR = { nuevo: 'var(--blue)', preparando: 'var(--violet)', enviado: 'var(--amber)', entregado: 'var(--green)', cancelado: 'var(--red)' };
    let acc = 0;
    const stops = porEstado.filter(e => e.n).map(e => {
      const from = acc / total * 360; acc += e.n;
      return `${EST_COLOR[e.s]} ${from}deg ${acc / total * 360}deg`;
    }).join(', ');
    document.getElementById('st-estados').innerHTML = total ? `
      <div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(${stops})"><span class="donut-center">${total}</span></div>
        <div class="legend">
          ${porEstado.filter(e => e.n).map(e => `
            <div class="li"><span class="dot" style="background:${EST_COLOR[e.s]}"></span>${Store.STATUS_LABEL[e.s]}<span class="n">${e.n}</span></div>`).join('')}
        </div>
      </div>` : '<div class="empty">Aún no hay pedidos</div>';

    const maxD = Math.max(1, ...dias.map(d => d.ingresos));
    document.getElementById('st-dias').innerHTML = `
      <div class="vchart">
        ${dias.map(d => `
          <div class="vcol">
            <div class="vval">${d.ingresos ? Store.money(d.ingresos) : '—'}</div>
            <div class="vspace"><div class="vbar" style="height:${Math.max(2, d.ingresos / maxD * 100)}%" title="${d.n} pedidos"><i style="height:${d.ingresos ? 100 : 0}%"></i></div></div>
            <span class="vlab">${d.lab}</span>
          </div>`).join('')}
      </div>`;

    document.getElementById('lat-chip').innerHTML = p50 != null ? `p50 <b>${p50} ms</b> · p95 <b>${p95} ms</b>` : '';
  }

  // ---------- devtools ----------
  function updateDevKPIs() {
    const ev = Store.db.events;
    const http = ev.filter(e => e.kind === 'http');
    const avg = http.length ? Math.round(http.reduce((s, e) => s + (e.ms || 0), 0) / http.length) : 0;
    document.getElementById('dev-kpis').innerHTML = [
      ['receipt', 'gold', 'Peticiones HTTP', http.length],
      ['zap', 'green', 'Latencia media', avg ? avg + ' ms' : '—'],
      ['bell', 'amber', 'Eventos de negocio', ev.length - http.length],
      ['receipt', 'blue', 'Pedidos totales', Store.db.orders.length],
    ].map(([ic, cl, k, v]) => `
      <div class="kpi"><div class="ic ${cl}">${icon(ic, 17)}</div><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  }

  const ARQ_MODULES = ['pedidos', 'inventario', 'clientes', 'pagos', 'notificaciones'];
  function updateArch(pulse) {
    const ev = Store.db.events;
    const byMod = m => ev.filter(e => (e.modules || [e.module]).includes(m));
    const evOf = m => ev.filter(e => (e.modules || []).includes(m) || e.module === m || e.source === m);
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('arq-cliente-c', `${evOf('cliente').length} eventos`);
    set('arq-web-c', `${evOf('web').length} eventos`);
    set('arq-api-c', `${ev.filter(e => e.kind === 'http').length} peticiones`);
    set('arq-panel-c', `${evOf('panel').length} eventos`);
    for (const m of ARQ_MODULES) {
      const list = byMod(m);
      set(`arq-${m}-c`, `${list.length} eventos`);
      set(`arq-${m}-l`, list[0] ? (list[0].label || list[0].path || '') : '—');
    }
    if (pulse) {
      const box = document.getElementById('arq-' + (ev[0] && (ev[0].modules || [ev[0].module])[0]));
      if (box) { box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse'); setTimeout(() => box.classList.remove('pulse'), 420); }
    }
  }

  function updateRequests() {
    const ev = Store.db.events.filter(e =>
      ui.logFilter === 'todos' ? true : ui.logFilter === 'http' ? e.kind === 'http' : e.kind === 'ev');
    document.getElementById('log-filters').innerHTML = [
      ['todos', 'Todos'], ['http', 'HTTP'], ['ev', 'Eventos'],
    ].map(([v, l]) => `<button class="${ui.logFilter === v ? 'on' : ''}" data-act="log-filter" data-v="${v}">${l}</button>`).join('');
    document.getElementById('req-body').innerHTML = ev.map(e => `
      <tr>
        <td class="mono" style="color:var(--text-3)">${e.at}</td>
        <td>${e.kind === 'http'
          ? `<span class="method m-${e.method}">${e.method}</span><span class="mono">${Store.esc(e.path)}</span>${e.label ? `<div class="cell-sub">${Store.esc(e.label)}</div>` : ''}`
          : `<span class="method m-EVT">EVT</span>${Store.esc(e.label)}`}</td>
        <td><span class="badge b-gray">${e.source || 'sistema'}</span></td>
        <td>${(e.modules || [e.module]).map(m => `<span class="mod-chip">${m}</span>`).join('')}</td>
        <td>${e.kind === 'http'
          ? (e.status < 300 ? `<span class="status-ok mono">${e.status}</span>` : `<span class="status-bad mono">${e.status}</span>`)
          : '<span style="color:var(--text-3)">—</span>'}</td>
        <td class="num mono" style="color:var(--text-2)">${e.ms != null ? e.ms + ' ms' : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6"><div class="empty">Sin tráfico aún — haz algo en la tienda o el panel</div></td></tr>';
  }

  function updateState() {
    const { events, ...data } = Store.db;
    document.getElementById('state-view').textContent = JSON.stringify(data, null, 2);
  }

  function updateAll() { updateStats(); updateDevKPIs(); updateRequests(); updateState(); }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, v } = el.dataset;
    switch (act) {
      case 'log-filter': ui.logFilter = v; updateRequests(); break;
      case 'copy-state':
        navigator.clipboard.writeText(JSON.stringify(Store.db, null, 2))
          .then(() => toast('JSON copiado al portapapeles', 'check'))
          .catch(() => toast('No se pudo copiar', 'bell'));
        break;
      case 'confirm-ok': { const cb = pendingConfirm; pendingConfirm = null; closeModal(); cb && cb(); break; }
      case 'modal-close': closeModal(); break;
      case 'reset':
        confirmDialog({
          title: '¿Reiniciar la demo?',
          body: 'Se regeneran los datos de ejemplo y se borra la traza en TODAS las páginas (tienda, panel y esta).',
          ok: 'Reiniciar',
          onOk: () => Store.resetDemo(),
        });
        break;
    }
  });

  Store.subscribe(() => {
    updateAll();
    updateArch(true);
  });

  updateAll();
  updateArch();
})();
