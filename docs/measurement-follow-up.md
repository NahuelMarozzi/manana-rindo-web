# Medición de pagos: estado y siguiente cambio

Revisión del 2 de septiembre de 2026. Este documento describe un pendiente;
no declara implementada la confirmación de pagos en Analytics.

## Evidencia del código

- `pago.html` emite `purchase_success` cuando la URL trae `result=success`.
  No consulta el estado del pago antes de emitirlo. Solo envía `order_id`.
- La deduplicación actual usa `sessionStorage`: una nueva sesión puede emitir
  otra vez. Un cliente que paga pero no vuelve al sitio puede no emitir nada.
- El cliente consulta el estado de la orden y usa `status=ready` y `pack_url`
  para abrir el material. No se ha verificado el contrato completo del servidor.
  `ready` por sí solo no se debe reinterpretar como pago aprobado.
- La acción importada desde GA4 para `purchase_success` quedó secundaria en
  Google Ads. Su nombre no convierte el evento en prueba contable de una venta.

## Cambio aplicado y límites

Las excepciones de almacenamiento y de analítica ya no deben bloquear la
inicialización, las consultas de estado o la visualización del pack. Si el
almacenamiento está bloqueado, se conserva una deduplicación en memoria durante
esa carga de página. No garantiza deduplicación entre pestañas o dispositivos.
Las respuestas HTTP fallidas del estado se reintentan.

No se cambian precios, webhooks, cuenta de pago, presupuesto de anuncios ni la
semántica del evento existente en este arreglo. No se hicieron compras de prueba.

## Dependencia pendiente: n8n

Se necesita una exportación actual del flujo de estado de orden y del flujo que
verifica pagos de Mercado Pago (sin credenciales ni datos personales). No hubo
acceso directo a n8n disponible. Una consulta con un identificador de pedido fue
bloqueada por revisión automática y no se reintentó. No hay verificación de
esquema ni de estado real del pago a partir de esa consulta.

Antes de programar la medición definitiva:

1. Identificar dónde se consulta el pago en Mercado Pago y dónde se persisten
   estado aprobado, vínculo con la orden, ID del pago, importe y moneda.
2. Revisar autenticación y controles de acceso del endpoint de estado. No
   ampliar la exposición de detalles del pago sin revisar ese contrato.
3. Elegir la fuente de eventos: backend con datos de atribución permitidos,
   o frontend después de una respuesta verificada. El backend permite cubrir
   pagos sin retorno al navegador; el frontend no garantiza esa cobertura.
4. Emitir el evento recomendado GA4 `purchase` con `transaction_id` estable,
   `currency`, `value` e `items` a partir de datos del pago y de la orden.
   No inferir el importe desde la URL ni desde precios estáticos de la web.
5. Deduplicar por transacción. GA4 documenta la deduplicación de `purchase`
   por `transaction_id`; no asumir que se aplica igual al evento personalizado
   `purchase_success`. Un marcador local no es una garantía global.
6. Migrar la acción de Ads al evento verificado y retirar la acción provisional
   de compras. No importar dos eventos principales para la misma compra.

## Criterios de aceptación

- Una URL manipulada con `result=success` no genera una compra verificada.
- Un pago pendiente, rechazado o una consulta fallida no genera una compra.
- Un pago aprobado para otra orden no genera una compra de la orden abierta.
- Una orden aprobada con importe y moneda válidos produce una transacción.
- Recargar, abrir otra pestaña y repetir notificaciones no duplica ingresos.
- Analytics bloqueado o almacenamiento no disponible no impide entregar el pack.
- Comparar un pago aprobado con Mercado Pago y GA4 DebugView antes de habilitar
  la acción para pujas por conversiones. No activar pujas de compras solo para
  quitar el aviso de objetivos sin acciones principales.

## Validación del arreglo de entrega

`node --test tests/*.test.cjs`: 22 pruebas locales, con HTTP y Analytics simulados.
Incluye las regresiones del `order_id` del checkout y fallos de lectura, escritura
y acceso al almacenamiento. No reemplaza una prueba end-to-end contra n8n.

Referencias:
- https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
- https://developers.google.com/analytics/devguides/collection/ga4/validate-ecommerce
