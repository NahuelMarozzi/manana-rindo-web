// Run with: node --test tests/checkout.test.cjs
// Evaluates the actual page script; all network calls are mocked.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];

function element(){
  const classes=new Set();
  return {value:'',files:[],disabled:false,style:{},dataset:{},children:[],
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),
      toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
    appendChild(x){this.children.push(x);},addEventListener(name,fn){this['on'+name]=fn;},
    scrollIntoView(){},click(){if(!this.disabled)this.onclick?.();},
    set innerHTML(value){this.html=value;this.children=[];},get innerHTML(){return this.html||'';}
  };
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function setup({pauseCompression=false,pauseAnalysis=false,pauseCheckout=false,failUpload=false,failAnalysis=false,failCheckout=false}={}){
  const nodes=new Map(),cards=['entender','practicar','completo'].map(pack=>({...element(),dataset:{pack}}));
  const compression=deferred(),analysis=deferred(),analysisStarted=deferred(),checkout=deferred(),requests=[];
  const storage=new Map();
  const context=vm.createContext({
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},
      querySelectorAll(){return cards;},createElement:element},
    crypto:webcrypto,URLSearchParams,URL,Uint8Array,console,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{search:''},window:{location:{href:''},addEventListener(name,fn){this['on'+name]=fn;}},scrollTo(){},setTimeout(){},
    async fetch(url,options){
      const body=JSON.parse(options.body);requests.push({url,body});
      if(url.includes('subir-fotos')){
        if(failUpload){failUpload=false;throw Error('Upload interrupted');}
        return {ok:true,text:async()=>JSON.stringify({ok:true,files:body.files.map((f,i)=>({file_id:'file-'+body.batch_index+'-'+i,name:f.name}))})};
      }
      if(url.includes('analizar')){
        analysisStarted.resolve();
        if(pauseAnalysis)await analysis.promise;
        if(failAnalysis){failAnalysis=false;throw Error('Analysis interrupted');}
        return {ok:true,text:async()=>JSON.stringify({ok:true,analysis:{status:'ok',puede_generar_pack:true,temas:[]}})};
      }
      if(url.includes('crear-checkout')){
        if(pauseCheckout)await checkout.promise;
        if(failCheckout){failCheckout=false;throw Error('Checkout interrupted');}
        return {ok:true,text:async()=>JSON.stringify({ok:true,checkout_url:'https://example.test/checkout'})};
      }
      throw Error('Unexpected network request');
    }
  });
  vm.runInContext(script,context);
  context.compressForTest=async f=>{if(pauseCompression)await compression.promise;return {name:f.name,mime:f.type,data_url:'data:image/jpeg;base64,AA=='};};
  vm.runInContext('compressPhoto=compressForTest',context);
  const run=code=>vm.runInContext(code,context);
  function addPhotos(count){nodes.get('files').files=Array.from({length:count},(_,i)=>({name:'photo'+i+'.jpg',size:100,type:'image/jpeg'}));nodes.get('files').onchange();}
  nodes.get('materia').value='Historia';nodes.get('nivel').value='Secundaria';nodes.get('tiempo').value='1 hora';
  return {nodes,cards,run,requests,addPhotos,compression,analysis,analysisStarted,checkout};
}

test('removing a photo during compression cannot clear the checkout order ID',async()=>{
  const app=setup({pauseCompression:true});app.addPhotos(2);
  const pending=app.nodes.get('btn').onclick();
  app.nodes.get('fileList').children[0].onclick();
  app.compression.resolve();await pending;
  await app.nodes.get('generatePackBtn').onclick();
  const checkout=app.requests.find(r=>r.url.includes('crear-checkout'));
  assert.ok(checkout,'checkout should remain available for the unchanged photos');
  assert.ok(checkout.body.order_id,'checkout must never contain order_id: null');
  assert.equal(checkout.body.files.length,2);
  for(const request of app.requests)assert.equal(request.body.order_id,checkout.body.order_id);
});

test('analysis blocks photo changes, form re-enabling and duplicate analysis requests',async()=>{
  const app=setup({pauseAnalysis:true});app.addPhotos(5);
  const pending=app.nodes.get('btn').onclick();await app.analysisStarted.promise;
  assert.equal(app.requests.filter(r=>r.url.includes('subir-fotos')).length,2);
  app.addPhotos(1);app.nodes.get('fileList').children[0].onclick();
  app.nodes.get('materia').oninput();await app.nodes.get('btn').onclick();
  await app.nodes.get('generatePackBtn').onclick();
  assert.equal(app.run('selected.length'),5);
  for(const id of ['files','materia','nivel','tiempo','fecha','reviewPhotos','btn','generatePackBtn'])assert.equal(app.nodes.get(id).disabled,true,id);
  assert.equal(app.requests.filter(r=>r.url.includes('analizar')).length,1);
  assert.equal(app.requests.filter(r=>r.url.includes('crear-checkout')).length,0);
  app.analysis.resolve();await pending;
  assert.equal(app.nodes.get('generatePackBtn').disabled,false);
  await app.nodes.get('generatePackBtn').onclick();
  const orderId=app.requests[0].body.order_id;
  for(const request of app.requests)assert.equal(request.body.order_id,orderId);
  assert.equal(app.requests.at(-1).body.files.length,5);
});

test('editing photos after analysis invalidates checkout, even with the same photo count',async()=>{
  const app=setup();app.addPhotos(2);await app.nodes.get('btn').onclick();
  const firstOrder=app.run('orderId');
  app.nodes.get('fileList').children[0].onclick();app.addPhotos(1);
  await app.nodes.get('generatePackBtn').onclick();
  assert.equal(app.requests.filter(r=>r.url.includes('crear-checkout')).length,0);
  assert.equal(app.nodes.get('generatePackBtn').disabled,true);
  await app.nodes.get('btn').onclick();await app.nodes.get('generatePackBtn').onclick();
  assert.notEqual(app.requests.at(-1).body.order_id,firstOrder);
});

test('checkout refuses missing IDs or an analysis belonging to another order',async()=>{
  for(const invalidState of ['orderId=null','orderId="different-order"','uploadedFiles=[]']){
    const app=setup();app.addPhotos(1);await app.nodes.get('btn').onclick();
    app.run(invalidState);await app.nodes.get('generatePackBtn').onclick();
    assert.equal(app.requests.filter(r=>r.url.includes('crear-checkout')).length,0,invalidState);
    assert.match(app.nodes.get('notice').innerHTML,/volver a analizar/);
  }
});

test('checkout blocks duplicate clicks and changes while the request is pending',async()=>{
  const app=setup({pauseCheckout:true});app.addPhotos(1);await app.nodes.get('btn').onclick();
  const pending=app.nodes.get('generatePackBtn').onclick();
  await app.nodes.get('generatePackBtn').onclick();await app.nodes.get('btn').onclick();
  app.cards[0].onclick();app.addPhotos(1);app.nodes.get('fileList').children[0].onclick();
  assert.equal(app.run('selectedPackType'),'completo');assert.equal(app.run('selected.length'),1);
  assert.equal(app.requests.filter(r=>r.url.includes('crear-checkout')).length,1);
  app.checkout.resolve();await pending;
  assert.equal(app.nodes.get('generatePackBtn').disabled,true,'stay locked until navigation');
});

test('upload and analysis failures unlock controls and permit a consistent retry',async()=>{
  for(const failure of ['failUpload','failAnalysis']){
    const app=setup({[failure]:true});app.addPhotos(2);await app.nodes.get('btn').onclick();
    assert.equal(app.nodes.get('files').disabled,false);
    assert.equal(app.nodes.get('btn').disabled,false);
    assert.equal(app.nodes.get('generatePackBtn').disabled,true);
    await app.nodes.get('btn').onclick();await app.nodes.get('generatePackBtn').onclick();
    const analysis=app.requests.filter(r=>r.url.includes('analizar')).at(-1);
    assert.ok(analysis.body.order_id);assert.equal(app.requests.at(-1).body.order_id,analysis.body.order_id);
  }
});

test('a failed repeat analysis cannot reuse a previous successful result',async()=>{
  const app=setup();app.addPhotos(1);await app.nodes.get('btn').onclick();
  app.run('fetch=async()=>{throw Error("offline")}');
  await app.nodes.get('btn').onclick();await app.nodes.get('generatePackBtn').onclick();
  assert.equal(app.run('lastAnalysis'),null);
  assert.equal(app.nodes.get('generatePackBtn').disabled,true);
  assert.equal(app.requests.filter(r=>r.url.includes('crear-checkout')).length,0);
});

test('checkout failure unlocks retry and keeps the original order ID',async()=>{
  const app=setup({failCheckout:true});app.addPhotos(1);await app.nodes.get('btn').onclick();
  await app.nodes.get('generatePackBtn').onclick();assert.equal(app.nodes.get('generatePackBtn').disabled,false);
  await app.nodes.get('generatePackBtn').onclick();
  const checkouts=app.requests.filter(r=>r.url.includes('crear-checkout'));
  assert.equal(checkouts.length,2);assert.equal(checkouts[0].body.order_id,checkouts[1].body.order_id);
});

test('returning from checkout through the back/forward cache unlocks the page',async()=>{
  const app=setup();app.addPhotos(1);await app.nodes.get('btn').onclick();await app.nodes.get('generatePackBtn').onclick();
  app.run('window.onpageshow({persisted:true})');
  assert.equal(app.nodes.get('generatePackBtn').disabled,false);assert.equal(app.nodes.get('files').disabled,false);
  assert.match(app.nodes.get('generatePackBtn').textContent,/Continuar/);
});

test('cancelling the photo picker keeps the completed analysis',async()=>{
  const app=setup();app.addPhotos(1);await app.nodes.get('btn').onclick();
  const order=app.run('orderId');app.addPhotos(0);
  await app.nodes.get('generatePackBtn').onclick();assert.equal(app.requests.at(-1).body.order_id,order);
});
