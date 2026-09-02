const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {buildStatusResponse,shouldVerifyPayment}=require('../integrations/n8n/status-measurement.cjs');
const {prepare}=require('../scripts/prepare-status-workflow.cjs');

function fixture(){
  return {requestedOrderId:'synthetic-order',
    order:{order_id:'synthetic-order',mp_mode:'production',amount_ars:'1234.56',analysis_json:'{"tipo_pack":"completo"}',checkout_url:'https://example.test/checkout'},
    pack:{order_id:'synthetic-order',pack_id:'synthetic-pack',access_token:'synthetic-token',pack_json:'{}',mp_payment_id:'123456'},
    paymentResponse:{statusCode:200,body:{id:123456,status:'approved',live_mode:true,external_reference:'synthetic-order',transaction_amount:1234.56,currency_id:'ARS',payer:{email:'synthetic@example.test'}}}};
}

test('only matched production payment produces purchase with actual amount and no payer data',()=>{
  const f=fixture();
  const result=buildStatusResponse(f);
  assert.deepEqual(result.purchase,{schema_version:1,verified:true,transaction_id:'mr_synthetic-order',value:1234.56,currency:'ARS',
    items:[{item_id:'completo',item_name:'Pack Completo',price:1234.56,quantity:1}]});
  assert.equal(result.status,'ready');
  assert.equal(result.pack_url,'https://dailyastroinfo.app.n8n.cloud/webhook/manana-rindo-pack-web-v7?p=synthetic-pack&k=synthetic-token');
  assert.equal(JSON.stringify(result).includes('synthetic@example.test'),false);
  assert.equal(JSON.stringify(result).includes('123456'),false);
  f.pack.payment_status='approved';f.paymentResponse.body.status='pending';
  assert.equal(buildStatusResponse(f).purchase,undefined,'stored approved is not authoritative');
});

test('processing and missing orders do not request payment lookup',()=>{
  const f=fixture();f.pack={};
  assert.equal(shouldVerifyPayment(f.order,f.pack,f.requestedOrderId),false);
  assert.deepEqual(buildStatusResponse(f),{ok:true,order_id:'synthetic-order',materia:'',nivel:'',status:'processing',checkout_url:'https://example.test/checkout'});
  f.order={};assert.equal(buildStatusResponse(f).status,'not_found');
  f.order={order_id:'another-order'};assert.equal(buildStatusResponse(f).status,'not_found');
});

const invalidPayments={
  pending:f=>f.paymentResponse.body.status='pending',
  rejected:f=>f.paymentResponse.body.status='rejected',
  refunded:f=>f.paymentResponse.body.status='refunded',
  sandbox:f=>f.paymentResponse.body.live_mode=false,
  unknownMode:f=>delete f.paymentResponse.body.live_mode,
  wrongId:f=>f.paymentResponse.body.id=999999,
  wrongOrder:f=>f.paymentResponse.body.external_reference='another-order',
  currency:f=>f.paymentResponse.body.currency_id='USD',
  amount:f=>f.paymentResponse.body.transaction_amount=1234.55,
  zero:f=>f.paymentResponse.body.transaction_amount=0,
  malformedAmount:f=>f.paymentResponse.body.transaction_amount=true,
  negative:f=>f.paymentResponse.body.transaction_amount=-1,
  unrepresentableAmount:f=>f.paymentResponse.body.transaction_amount=Infinity,
  orderMode:f=>f.order.mp_mode='sandbox',
  packOrder:f=>f.pack.order_id='another-order',
  malformedId:f=>f.pack.mp_payment_id='../payments',
  missingId:f=>delete f.pack.mp_payment_id,
  invalidExpected:f=>f.order.amount_ars='',
  booleanExpected:f=>f.order.amount_ars=true,
  invalidProduct:f=>f.order.analysis_json='{"tipo_pack":"unknown"}',
  malformedProduct:f=>f.order.analysis_json='not-json',
  nullProduct:f=>f.order.analysis_json='null',
  unauthorized:f=>f.paymentResponse.statusCode=401,
  rateLimit:f=>f.paymentResponse.statusCode=429,
  timeout:f=>f.paymentResponse={error:'timeout'},
  skipped:f=>delete f.paymentResponse,
  missingBody:f=>delete f.paymentResponse.body,
};
for(const [name,change]of Object.entries(invalidPayments))test('measurement fails closed while ready pack remains accessible: '+name,()=>{
  const f=fixture();change(f);const result=buildStatusResponse(f);
  assert.equal(result.purchase,undefined);assert.equal(result.status,'ready');assert.ok(result.pack_url);
});

test('all three stored pack types and decimal strings produce correct revenue',()=>{
  for(const tipo of ['entender','practicar','completo']){
    const f=fixture();f.order.analysis_json=JSON.stringify({tipo_pack:tipo});
    f.order.amount_ars='1200.00';f.paymentResponse.body.transaction_amount='1200';
    const p=buildStatusResponse(f).purchase;assert.equal(p.value,1200);assert.equal(p.items[0].item_id,tipo);
  }
});

function originalWorkflow(){
  const names=['WEBHOOK - Estado Orden V7','VALIDATE - Order ID V7','DB - Estado Orden V7','DB - Estado Pack V7','BUILD - Estado V7','RESPOND - Estado V7'];
  return {name:'Synthetic status fixture',active:true,versionId:'old',pinData:{private:'must clear'},nodes:names.map((name,i)=>({name,id:String(i),parameters:
    i===0?{path:'manana-rindo-estado-orden-v7'}:i===3?{filters:{conditions:[{keyValue:'original'}]}}:{},position:[i*200,0]})),connections:{}};
}

test('generated graph executes both branches offline and preserves credential reference only',()=>{
  const original=originalWorkflow();const saved=structuredClone(original);
  const paymentWorkflow={nodes:[{name:'MERCADO PAGO - Consultar Pago PROD',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,credentials:{httpHeaderAuth:{id:'synthetic-credential',name:'Synthetic credential'}}}]};
  const workflow=prepare(original,paymentWorkflow);
  assert.deepEqual(original,saved,'input export remains unchanged');
  assert.equal(workflow.active,false);assert.deepEqual(workflow.pinData,{});assert.equal(workflow.versionId,undefined);
  const http=workflow.nodes.find(n=>n.name==='MERCADO PAGO - Verificar Medicion V7');
  assert.deepEqual(http.credentials,paymentWorkflow.nodes[0].credentials);
  assert.equal(http.onError,'continueRegularOutput');assert.equal(http.parameters.options.timeout,5000);
  assert.equal(http.parameters.options.response.response.fullResponse,true);
  assert.equal(http.parameters.options.response.response.neverError,true);
  const branches=workflow.connections['IF - Verificar Pago V7'].main;
  assert.equal(branches[0][0].node,http.name);assert.equal(branches[1][0].node,'BUILD - Estado V7');
  const build=workflow.nodes.find(n=>n.name==='BUILD - Estado V7').parameters.jsCode;
  const prep=workflow.nodes.find(n=>n.name==='PREPARE - Verificar Pago V7').parameters.jsCode;
  for(const mode of ['approved','processing','lookup-error']){
    const f=fixture();if(mode==='processing')f.pack={};
    if(mode==='lookup-error')f.paymentResponse={error:'timeout'};
    const rows={'DB - Estado Orden V7':f.order,'DB - Estado Pack V7':f.pack,'VALIDATE - Order ID V7':{order_id:f.requestedOrderId}};
    if(mode!=='processing')rows[http.name]=f.paymentResponse;
    const context={$:name=>({first(){if(!(name in rows))throw Error('Node not executed');return {json:rows[name]};}})};
    const prepared=vm.runInNewContext('(function(){'+prep+'})()',context)[0].json;
    assert.equal(prepared.verify_payment,mode!=='processing');
    const actual=vm.runInNewContext('(function(){'+build+'})()',context)[0].json;
    assert.deepEqual(JSON.parse(JSON.stringify(actual)),buildStatusResponse(f));
  }
});
