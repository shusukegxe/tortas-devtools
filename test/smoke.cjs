'use strict';
/* Smoke test funcional de estadísticas y devtools (código real sobre jsdom). */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const DIR = __dirname + '/..';
const html = fs.readFileSync(`${DIR}/index.html`, 'utf8')
  .replace('<script src="core.js"></script>', () => `<script>\n${fs.readFileSync(`${DIR}/core.js`, 'utf8')}\n</script>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${fs.readFileSync(`${DIR}/app.js`, 'utf8')}\n</script>`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK ' : ' FAIL') + ' ' + msg); if (!cond) fails++; };

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.onerror = e => { console.log('  ONERROR ' + e); fails++; };
  const d = dom.window.document;
  await sleep(300);

  // 1. render inicial
  ok(d.querySelectorAll('.kpi').length === 4, 'devtools: 4 KPIs');
  ok(d.querySelectorAll('#st-productos .hbar').length === 5, 'stats: 5 barras de ventas por producto');
  ok(!!d.querySelector('#st-estados .donut'), 'stats: dona de pedidos por estado');
  ok(d.querySelectorAll('#st-estados .legend .li').length === 2, 'stats: leyenda con 2 estados de ejemplo');
  ok(d.querySelectorAll('#st-dias .vcol').length === 7, 'stats: ingresos por día con 7 columnas');

  // 2. generar tráfico real vía el Store compartido (como lo haría la tienda)
  await dom.window.eval(`Store.placeOrder({
    name: 'Cliente Stats', phone: '555-0999', address: 'Av. Demo #1', note: '',
    deliveryDate: '', payMethod: 'efectivo', forceDecline: false,
    items: [{ pid: 'p2', name: 'Tres Leches', price: 17000, qty: 2 }],
  })`);
  await sleep(1400);
  const reqRows = d.querySelectorAll('#req-body tr').length;
  ok(reqRows >= 4, `registro: ${reqRows} filas tras un pedido (http + eventos)`);
  ok(d.getElementById('req-body').textContent.includes('POST') && d.getElementById('req-body').textContent.includes('/pedidos'), 'registro: POST /pedidos presente');
  ok(d.getElementById('arq-pedidos-c').textContent !== '0 eventos', 'arquitectura: módulo pedidos con eventos');
  ok(d.getElementById('st-productos').textContent.includes('Tres Leches') && d.getElementById('st-productos').textContent.includes('2 u'), 'stats: ventas por producto actualizadas (2 u Tres Leches)');
  ok(d.getElementById('st-estados').textContent.includes('3'), 'stats: dona actualizada (3 pedidos)');
  ok(JSON.parse(d.getElementById('state-view').textContent).orders.length === 3, 'estado: JSON con 3 pedidos');

  // 3. latencias visibles en el chip del registro
  ok(!!d.getElementById('lat-chip').textContent.trim(), 'registro: chip de latencias p50/p95 visible');

  // 4. filtro del registro
  d.querySelector('[data-act="log-filter"][data-v="http"]').click();
  await sleep(30);
  ok(!d.getElementById('req-body').textContent.includes('EVT'), 'registro: filtro HTTP oculta eventos');
  d.querySelector('[data-act="log-filter"][data-v="todos"]').click();
  await sleep(30);

  // 5. reinicio de demo con confirmación
  d.querySelector('[data-act="reset"]').click();
  await sleep(30);
  ok(d.getElementById('modal-root').textContent.includes('¿Reiniciar la demo?'), 'reset: diálogo de confirmación');
  d.querySelector('[data-act="confirm-ok"]').click();
  await sleep(300);
  const persisted = JSON.parse(dom.window.localStorage.getItem('tortas-pedidos-v1'));
  ok(persisted.orders.length === 2 && persisted.seq === 3, 'reset: datos regenerados (2 pedidos, seq=3)');
  ok(persisted.events.length === 0, 'reset: traza borrada');
  ok(d.querySelectorAll('#st-productos .hbar').length === 5, 'reset: estadísticas re-renderizadas');

  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN:', e); process.exit(1); });
