// Pure functions embedded into the status workflow by prepare-status-workflow.cjs.
// All payment fixtures in tests are synthetic. Never trust a browser return URL.
function cents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function shouldVerifyPayment(order = {}, pack = {}, requestedOrderId) {
  return Boolean(order.order_id && order.order_id !== '__invalid__'
    && order.order_id === requestedOrderId && pack.order_id === order.order_id
    && order.mp_mode === 'production'
    && pack.pack_id && pack.access_token && pack.pack_json
    && /^[1-9]\d*$/.test(String(pack.mp_payment_id || ''))
    && cents(order.amount_ars) !== null);
}

function buildStatusResponse({ requestedOrderId, order = {}, pack = {}, paymentResponse }) {
  if (!order.order_id || order.order_id === '__invalid__' || order.order_id !== requestedOrderId) {
    return { ok: false, status: 'not_found', error: 'Orden no encontrada.' };
  }
  const common = { ok: true, order_id: order.order_id, materia: order.materia || '', nivel: order.nivel || '' };
  if (!(pack.pack_id && pack.access_token && pack.pack_json)) {
    return { ...common, status: 'processing', checkout_url: order.checkout_url || '' };
  }
  // Preserve delivery even if the optional payment lookup times out or fails.
  const response = {
    ...common, status: 'ready',
    pack_url: 'https://dailyastroinfo.app.n8n.cloud/webhook/manana-rindo-pack-web-v7?p='
      + encodeURIComponent(pack.pack_id) + '&k=' + encodeURIComponent(pack.access_token),
  };
  if (!shouldVerifyPayment(order, pack, requestedOrderId)) return response;
  const payment = paymentResponse?.body;
  if (paymentResponse?.statusCode !== 200 || !payment || paymentResponse.error) return response;
  if (payment.status !== 'approved' || payment.live_mode !== true
    || String(payment.id) !== String(pack.mp_payment_id)
    || payment.external_reference !== order.order_id || payment.currency_id !== 'ARS'
    || cents(payment.transaction_amount) !== cents(order.amount_ars)) return response;
  // Type comes from the stored order used by the existing payment validator.
  let stored;
  try { stored = JSON.parse(order.analysis_json); } catch { return response; }
  const tipo = stored?.tipo_pack;
  const names = { entender: 'Pack Entender', practicar: 'Pack Practicar', completo: 'Pack Completo' };
  if (!Object.hasOwn(names, tipo)) return response;
  const value = cents(payment.transaction_amount) / 100;
  response.purchase = {
    schema_version: 1, verified: true,
    // One product order is counted once, including refreshes and multiple returns.
    transaction_id: 'mr_' + order.order_id,
    value, currency: 'ARS',
    items: [{ item_id: tipo, item_name: names[tipo], price: value, quantity: 1 }],
  };
  return response;
}

module.exports = { cents, shouldVerifyPayment, buildStatusResponse };
