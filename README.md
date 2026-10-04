# Tortas · Hechas a Mano — Estadísticas y DevTools

Página de observabilidad y estadísticas para devs del sistema de pedidos de
**Tortas · Hechas a Mano**. Todo se calcula en vivo desde el mismo Store que la
tienda y el panel: si entra un pedido en otra pestaña, las gráficas se mueven.

**Demo en vivo:** https://shusukegxe.github.io/tortas-devtools/

Las tres aplicaciones del sistema (repos separados, mismo Store compartido vía
`localStorage` + `BroadcastChannel` en `shusukegxe.github.io`):

| Página | Repo | Qué hace |
|---|---|---|
| Hacer pedido | [pedidos-express](https://github.com/shusukegxe/pedidos-express) | Catálogo con fotos, carrito, checkout y WhatsApp. |
| Panel del negocio | [tortas-manager](https://github.com/shusukegxe/tortas-manager) | KPIs, gestión de pedidos, disponibilidad, clientes y actividad. |
| **Estadísticas y DevTools** (esta) | [tortas-devtools](https://github.com/shusukegxe/tortas-devtools) | Ventas, ingresos por día, arquitectura en vivo, registro de la API. |

## Qué muestra

- **Ventas por producto**: unidades vendidas e ingresos pagados por torta, con barras.
- **Pedidos por estado**: dona (CSS `conic-gradient`) con la distribución
  Recibido / En preparación / En camino / Entregado / Cancelado.
- **Ingresos por día**: últimos 7 días, solo pedidos pagados.
- **Latencias**: p50 y p95 de las peticiones simuladas.
- **Arquitectura en vivo**: contadores de eventos por módulo (pedidos, inventario,
  clientes, pagos, notificaciones) con pulso al recibir tráfico.
- **Registro de peticiones**: cada llamada con método, ruta, origen, código HTTP
  (200/402/409) y latencia; filtros Todos / HTTP / Eventos.
- **Estado crudo**: JSON de la "base de datos" copiable, y reinicio de la demo
  (afecta a las tres páginas).

## Técnica

SPA sin framework: `core.js` (Store: datos + API simulada + bus) + `app.js`
(estadísticas + vistas de observabilidad) + `style.css`. Gráficas en CSS puro
(barras y dona), cero dependencias.

Test funcional: `npm i jsdom && node test/smoke.cjs`.
