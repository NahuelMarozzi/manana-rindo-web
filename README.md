# Mañana Rindo

Sitio estático de producción conectado a los flujos actuales de n8n y Mercado Pago.

## Recorrido

1. La persona sube hasta 30 fotos.
2. El navegador optimiza y envía las imágenes en lotes.
3. n8n analiza el material gratuitamente.
4. La persona confirma materia, nivel, tiempo y fecha.
5. Elige un Pack y continúa a Mercado Pago.
6. `pago.html` espera la generación y abre `pack.html` cuando está listo.

Las páginas `privacidad.html` y `terminos.html` forman parte del consentimiento previo al checkout.

## Verificación local

```sh
node --check app.js
node --test tests/*.test.cjs
```

No se necesitan cambios en n8n para esta versión.
