// Run with node --test tests/*.test.cjs. No real HTTP or analytics calls.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function element(){
  const classes=new Set();
  return {style:{},textContent:'',innerHTML:'',href:'',
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),
      toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
    querySelector(){return this.dot??=element();},appendChild(){}};
}
function setup(page,{storageFailure='',analyticsFailure=false,response={status:'ready',pack_url:'https://example.test/pack'},httpOk=true,session=new Map(),result='success'}={}){
  const nodes=new Map(),steps=Array.from({length:4},element),timers=[],events=[],navigations=[],requests=[];
  const storage={getItem(k){if(storageFailure==='get')throw Error('Blocked read');return session.get(k)||null;},
    setItem(k,v){if(storageFailure==='set')throw Error('Storage full');session.set(k,v);}};
  const ctx={URL,URLSearchParams,console,
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll(){return steps;},createElement:element},
    location:{search:page==='pago.html'?'?order_id=test-order&result='+result:'?p=test-pack&k=test-token',href:'https://example.test/',replace:u=>navigations.push(u)},
    navigator:{},print(){},prompt(){},requestAnimationFrame(){},
    setTimeout(fn,ms){timers.push({fn,ms});},
    gtag(...args){if(analyticsFailure)throw Error('Analytics unavailable');events.push(args);},
    async fetch(url){requests.push(url);return {ok:httpOk,json:async()=>response};}
  };
  // A throwing property getter also occurs in browsers, before getItem is called.
  for(const key of ['sessionStorage','localStorage'])Object.defineProperty(ctx,key,{get(){if(storageFailure==='access')throw Error('Storage unavailable');return storage;}});
  const context=vm.createContext(ctx);
  const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script,context);
  return {nodes,timers,events,navigations,requests,run:code=>vm.runInContext(code,context)};
}

for(const storageFailure of ['get','set','access']){
  test('payment polling and pack navigation survive storage failure: '+storageFailure,async()=>{
    const app=setup('pago.html',{storageFailure});
    assert.ok(app.timers.some(t=>t.ms===1200),'poll must start');
    await app.run('poll()');
    assert.equal(app.nodes.get('title').textContent,'¡Está listo!');
    const redirect=app.timers.find(t=>t.ms===700);assert.ok(redirect);redirect.fn();
    assert.deepEqual(app.navigations,['https://example.test/pack']);
    await app.run('poll()');
    assert.equal(app.requests.length,1,'finished page must not poll again');
    assert.equal(app.events.filter(e=>e[1]==='pack_ready').length,1);
  });
  test('pack content remains visible with storage failure: '+storageFailure,async()=>{
    const app=setup('pack.html',{storageFailure,response:{ok:true,pack:{tipo_pack:'entender',intro:'Material de prueba'}}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(app.nodes.get('pack').classList.contains('show'));
    assert.equal(app.nodes.get('intro').textContent,'Material de prueba');
    assert.match(app.nodes.get('content').innerHTML,/Entendé el tema/);
    assert.equal(app.nodes.get('error')?.classList.contains('show')||false,false);
    app.run('render({tipo_pack:"entender"})');
    assert.equal(app.events.filter(e=>e[1]==='pack_opened').length,1);
  });
}

test('analytics failure cannot prevent delivery',async()=>{
  const payment=setup('pago.html',{analyticsFailure:true});await payment.run('poll()');
  assert.ok(payment.timers.some(t=>t.ms===700));
  const pack=setup('pack.html',{analyticsFailure:true,response:{ok:true,pack:{tipo_pack:'entender'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(pack.nodes.get('pack').classList.contains('show'));
});

test('existing session markers still suppress repeated analytics',async()=>{
  const session=new Map([['mr_ga_payment_return_test-order_success','1'],['mr_ga_pack_ready_test-order','1']]);
  const app=setup('pago.html',{session});await app.run('poll()');
  assert.equal(app.events.length,0);assert.ok(app.timers.some(t=>t.ms===700));
});

test('HTTP failures and malformed status responses retry without marking delivery finished',async()=>{
  for(const options of [{httpOk:false},{response:null},{response:{status:'processing'}}]){
    const app=setup('pago.html',options);await app.run('poll()');
    assert.equal(app.run('finished'),false);
    assert.ok(app.timers.some(t=>t.ms===3500));
    assert.equal(app.events.filter(e=>e[1]==='pack_ready').length,0);
  }
});

test('pending return continues polling without emitting legacy purchase_success',async()=>{
  const app=setup('pago.html',{result:'pending'});await app.run('poll()');
  assert.equal(app.events.filter(e=>e[1]==='purchase_success').length,0);
  assert.ok(app.timers.some(t=>t.ms===700));
});

function paidResponse(){
  return {ok:true,status:'ready',order_id:'test-order',pack_url:'https://example.test/pack',
    purchase:{schema_version:1,verified:true,transaction_id:'mr_test-order',currency:'ARS',value:1234.56,
      items:[{item_id:'completo',item_name:'Pack Completo',price:1234.56,quantity:1}]}};
}

test('success URL alone and a legacy ready response cannot register a purchase',async()=>{
  const app=setup('pago.html');
  assert.equal(app.events.filter(e=>['purchase','purchase_success'].includes(e[1])).length,0);
  await app.run('poll()');
  assert.equal(app.events.filter(e=>['purchase','purchase_success'].includes(e[1])).length,0);
  assert.ok(app.timers.some(t=>t.ms===700));
});

for(const result of ['success','pending','']){
  test('verified payment registers actual value and preserves delivery: '+result,async()=>{
    const app=setup('pago.html',{response:paidResponse(),result});await app.run('poll()');
    const purchases=app.events.filter(e=>e[1]==='purchase');
    assert.equal(purchases.length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(purchases[0][2])),{
      transaction_id:'mr_test-order',currency:'ARS',value:1234.56,
      items:[{item_id:'completo',item_name:'Pack Completo',price:1234.56,quantity:1}],transport_type:'beacon'});
    assert.equal(app.events.filter(e=>e[1]==='purchase_success').length,0);
    app.timers.find(t=>t.ms===700).fn();assert.deepEqual(app.navigations,['https://example.test/pack']);
  });
}

test('purchase marker survives reloads, without suppressing delivery',async()=>{
  const session=new Map();
  const first=setup('pago.html',{response:paidResponse(),session});await first.run('poll()');
  first.run('trackVerifiedPurchase('+JSON.stringify(paidResponse())+')');
  assert.equal(first.events.filter(e=>e[1]==='purchase').length,1);
  const next=setup('pago.html',{response:paidResponse(),session});await next.run('poll()');
  assert.equal(next.events.filter(e=>e[1]==='purchase').length,0);
  assert.ok(next.timers.some(t=>t.ms===700));
});

for(const storageFailure of ['get','set','access']){
  test('verified purchase remains best effort with blocked storage: '+storageFailure,async()=>{
    const app=setup('pago.html',{response:paidResponse(),storageFailure});await app.run('poll()');
    app.run('trackVerifiedPurchase('+JSON.stringify(paidResponse())+')');
    const purchases=app.events.filter(e=>e[1]==='purchase');assert.equal(purchases.length,1);
    assert.equal(purchases[0][2].transaction_id,'mr_test-order');
    assert.ok(app.timers.some(t=>t.ms===700));
  });
}

test('unavailable analytics does not mark a purchase sent or delay delivery',async()=>{
  const session=new Map();
  const app=setup('pago.html',{response:paidResponse(),analyticsFailure:true,session});await app.run('poll()');
  assert.equal(session.has('mr_ga_purchase_v1_mr_test-order'),false);
  assert.ok(app.timers.some(t=>t.ms===700));
});

test('malformed or unrelated purchase data cannot generate revenue',async()=>{
  const mutations=[
    d=>d.ok=false, d=>d.order_id='another-order', d=>d.purchase.verified=false,
    d=>d.purchase.schema_version=2, d=>d.purchase.transaction_id='mr_another-order',
    d=>d.purchase.currency='USD', d=>d.purchase.value=0, d=>d.purchase.value=-1,
    d=>d.purchase.value='1234.56', d=>d.purchase.value=Infinity,
    d=>d.purchase.items=[], d=>d.purchase.items[0].quantity=2,
    d=>d.purchase.items[0].price=1,d=>d.purchase.items[0].item_id='unknown',
    d=>d.purchase.items[0].item_name='', d=>delete d.purchase,
  ];
  for(const mutate of mutations){
    const response=paidResponse();mutate(response);
    const app=setup('pago.html',{response});await app.run('poll()');
    assert.equal(app.events.filter(e=>e[1]==='purchase').length,0);
    assert.ok(app.timers.some(t=>t.ms===700),'measurement failure must not block delivery');
  }
});
