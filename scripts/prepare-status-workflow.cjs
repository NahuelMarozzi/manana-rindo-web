// Usage: node scripts/prepare-status-workflow.cjs STATUS_EXPORT MP_WEBHOOK_EXPORT OUTPUT
// Local files only. Credential references stay in the private workflow export.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function prepare(status, paymentWorkflow) {
  const workflow = structuredClone(status);
  const node = name => {
    const value = workflow.nodes.find(n => n.name === name);
    if (!value) throw new Error('Missing status node: ' + name);
    return value;
  };
  const webhook = node('WEBHOOK - Estado Orden V7');
  if (webhook.parameters.path !== 'manana-rindo-estado-orden-v7') throw Error('Unexpected webhook path');
  const paymentTemplate = paymentWorkflow.nodes.find(n => n.name === 'MERCADO PAGO - Consultar Pago PROD');
  if (paymentTemplate?.type !== 'n8n-nodes-base.httpRequest'
    || !paymentTemplate.credentials?.httpHeaderAuth) throw Error('Missing Mercado Pago credential reference');
  const code = fs.readFileSync(path.join(__dirname, '../integrations/n8n/status-measurement.cjs'), 'utf8');
  const embedded = 'const measurement = (() => { const module = {exports:{}};\n' + code + '\nreturn module.exports; })();\n';
  const loadRows = "const order = $('DB - Estado Orden V7').first().json || {};\n"
    + "const pack = $('DB - Estado Pack V7').first().json || {};\n"
    + "const requestedOrderId = $('VALIDATE - Order ID V7').first().json.order_id;\n";
  const prepareName = 'PREPARE - Verificar Pago V7';
  const ifName = 'IF - Verificar Pago V7';
  const httpName = 'MERCADO PAGO - Verificar Medicion V7';
  if (workflow.nodes.some(n => [prepareName, ifName, httpName].includes(n.name))) throw Error('Workflow already patched');
  workflow.nodes.push({ name: prepareName, id: randomUUID(), type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [920, 0], parameters: { jsCode: embedded + loadRows
      + 'return [{json:{verify_payment:measurement.shouldVerifyPayment(order,pack,requestedOrderId)}}];' } });
  workflow.nodes.push({ name: ifName, id: randomUUID(), type: 'n8n-nodes-base.if', typeVersion: 2.3,
    position: [1140, 0], parameters: {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [{ id: randomUUID(), leftValue: '={{ $json.verify_payment }}', rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
    } });
  workflow.nodes.push({ name: httpName, id: randomUUID(), type: paymentTemplate.type,
    typeVersion: paymentTemplate.typeVersion, position: [1360, -120],
    credentials: structuredClone(paymentTemplate.credentials),
    onError: 'continueRegularOutput', alwaysOutputData: true, retryOnFail: false,
    parameters: { method: 'GET',
      url: "={{ 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(String($('DB - Estado Pack V7').first().json.mp_payment_id)) }}",
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      options: { timeout: 5000, redirect: { redirect: { followRedirects: false } },
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
    } });
  node('BUILD - Estado V7').parameters.jsCode = embedded + loadRows
    + "let paymentResponse;\ntry { paymentResponse = $('" + httpName + "').first().json; } catch {}\n"
    + 'return [{json:measurement.buildStatusResponse({requestedOrderId,order,pack,paymentResponse})}];';
  node('BUILD - Estado V7').position = [1580, 0];
  node('RESPOND - Estado V7').position = [1800, 0];
  // A missing order must still reach BUILD and return not_found.
  node('DB - Estado Pack V7').parameters.filters.conditions[0].keyValue
    = "={{ $('DB - Estado Orden V7').first().json.order_id || '__invalid__' }}";
  const edge = name => ({ node: name, type: 'main', index: 0 });
  workflow.connections['DB - Estado Pack V7'] = { main: [[edge(prepareName)]] };
  workflow.connections[prepareName] = { main: [[edge(ifName)]] };
  workflow.connections[ifName] = { main: [[edge(httpName)], [edge('BUILD - Estado V7')]] };
  workflow.connections[httpName] = { main: [[edge('BUILD - Estado V7')]] };
  // Import as an unpublished draft; replace the existing workflow rather than
  // activating a second workflow with the same production webhook path.
  workflow.active = false;
  workflow.pinData = {};
  delete workflow.versionId;
  delete workflow.activeVersionId;
  return workflow;
}

if (require.main === module) {
  const [statusPath, paymentPath, outputPath] = process.argv.slice(2);
  if (!statusPath || !paymentPath || !outputPath) throw Error('Provide status export, payment export and output path');
  const output = prepare(JSON.parse(fs.readFileSync(statusPath)), JSON.parse(fs.readFileSync(paymentPath)));
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log('Prepared workflow with ' + output.nodes.length + ' nodes; not published.');
}
module.exports = { prepare };
