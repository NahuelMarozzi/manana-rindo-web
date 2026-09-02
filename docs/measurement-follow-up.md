# Compras verificadas: instalación y alcance

Actualizado el 2 de septiembre de 2026. La web deja de emitir `purchase_success`
por el parámetro `result=success`. El nuevo evento GA4 `purchase` requiere una
respuesta del flujo de estado que verifique el pago en Mercado Pago.

## Qué cambia

El flujo **MR - ESTADO ORDEN V7**, usado por `pago.html`, incorpora una consulta
GET a Mercado Pago cuando el pack está listo y la orden es de producción.
Reutiliza la referencia a la credencial del webhook de pagos existente.
La respuesta de la API debe tener estado HTTP 200, pago `approved`,
`live_mode=true`, ID de pago coincidente, referencia a la misma orden, moneda
ARS e importe positivo igual al guardado en la orden. El tipo de pack proviene
de `analysis_json` de esa orden. El estado almacenado `approved` por sí solo
no acredita una compra, porque el generador recibe esos campos en su entrada.

Solo si se cumplen esas condiciones, el flujo agrega `purchase` a la respuesta:

```json
{
  "schema_version": 1,
  "verified": true,
  "transaction_id": "mr_ID_DE_ORDEN",
  "value": 1234.56,
  "currency": "ARS",
  "items": [{"item_id":"completo","item_name":"Pack Completo","price":1234.56,"quantity":1}]
}
```

El importe del ejemplo es ficticio. No se envían email, teléfono, información
del comprador ni la respuesta completa de Mercado Pago al navegador o a GA4.
La web valida el contrato y envía únicamente los campos de comercio electrónico.
El evento `payment_return` continúa indicando un retorno del navegador.

La respuesta `ready` y el enlace original al pack se mantienen cuando falla la
verificación. La consulta adicional tiene timeout de 5 segundos, no reintenta
y continúa ante errores. No cambia la generación, el cobro ni el envío de email.
La web es compatible con el flujo anterior: entrega el pack, pero no registra
compras hasta que reciba la nueva respuesta verificada.

## Instalar en n8n

El JSON se prepara localmente a partir de los dos exports proporcionados:

```bash
node scripts/prepare-status-workflow.cjs \
  'MR - ESTADO ORDEN V7.json' \
  'MR PROD - MERCADO PAGO WEBHOOK.json' \
  'MR-ESTADO-ORDEN-V7-medicion.json'
```

1. Abrir el flujo existente **MR - ESTADO ORDEN V7**. Descargar una copia del
   flujo que esté publicado para poder restaurarlo.
2. En su editor, sustituir los nodos por los del archivo actualizado mediante
   **Import from File**. Debe quedar un único conjunto de nueve nodos, sin
   copias duplicadas. El export está marcado inactivo para no activar un
   segundo webhook de producción accidentalmente.
3. Comprobar que el nodo **MERCADO PAGO - Verificar Medicion V7** conserva la
   credencial de producción que usa **MERCADO PAGO - Consultar Pago PROD**.
   Si n8n pide seleccionarla, elegir esa credencial existente; no pegar tokens
   en el código ni compartirlos por chat.
4. Publicar la actualización del flujo original. Su ruta sigue siendo
   `manana-rindo-estado-orden-v7`. No activar dos flujos con esa misma ruta.

No hace falta modificar **MR - GENERAR + GUARDAR PACK V7** ni el webhook de
Mercado Pago para esta medición. La publicación de n8n requiere acceso al editor
del usuario; preparar el archivo no equivale a haberlo instalado.

## Validación y migración de Google Ads

Se ejecutaron **63 pruebas locales** con `node --test tests/*.test.cjs`.
Incluyen pagos válidos, pendientes, rechazados, sandbox, referencias/importe/
moneda incorrectos, fallos de API y almacenamiento, recargas y regresiones de
checkout y entrega. El código que se incorpora al export se ejecuta con
entradas simuladas. Esto no sustituye una ejecución real en la instancia n8n.

Después de importar, comprobar una compra autorizada y su ejecución en n8n:
`purchase` debe aparecer en la respuesta del estado y en GA4 DebugView con el
mismo importe, ARS e ID de transacción. Recargar no debe generar otro envío
desde ese navegador. No se hizo una compra ni se consultó una orden real para
esta validación local.

Después de confirmar esa medición, importar **purchase** desde GA4 a Google
Ads. Mantener `purchase_success` y las vistas de página como secundarias.
Usar solo la compra verificada como acción principal de Compra, cuando haya
sido comprobada. Revisar los objetivos aplicados a la campaña; no convertir
vistas de página en compras para eliminar un aviso.

Esta entrega no modifica Google Ads: el presupuesto acordado es **20.000 ARS
totales**, y la estrategia permanece **Maximizar clics**. Un objetivo sin
acciones principales no demuestra un fallo de instalación de la etiqueta.

## Límites conocidos

- Esta medición requiere que el comprador vuelva a `pago.html` y que el pack
  llegue a estar listo. No cubre todos los pagos del negocio ni una generación
  fallida. El cierre del navegador o un bloqueador también puede impedir GA4.
- Un timeout de Mercado Pago permite entregar el pack, pero omite esa compra
  en esa visita. No hay una cola de recuperación ni envío desde el servidor.
- `localStorage` reduce duplicados en el navegador. `transaction_id` estable
  permite a GA4 deduplicar `purchase`; el marcador no garantiza recepción ni
  unicidad global entre dispositivos. No se asume esa deduplicación para el
  antiguo evento personalizado `purchase_success`.
- La importación no corrige retroactivamente eventos provisionales ni cifras
  históricas. Los ingresos de Analytics deben contrastarse con Mercado Pago.
- El flujo de estado ya entrega el enlace del pack a quien conoce la orden.
  Este cambio conserva ese modelo de acceso; no es una auditoría integral de
  autorización de todos los endpoints de generación y entrega.

## Referencias

- [GA4: comercio electrónico](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce)
- [GA4: validar eventos de comercio electrónico](https://developers.google.com/analytics/devguides/collection/ga4/validate-ecommerce)
- [Mercado Pago: consultar un pago](https://www.mercadopago.com.co/developers/en/reference/online-payments/checkout-api-payments/get-payment/get)
- [n8n: HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest)
- [n8n: importar y exportar](https://docs.n8n.io/build/manage-workflows/export-and-import)
