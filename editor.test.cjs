const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'grid_native_circuit_simulator.html'),'utf8');
function editor(storage=new Map()){
  const handlers={},elements=new Map(),draws=[];
  const ctx=new Proxy({measureText:()=>({width:40}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??((...args)=>draws.push([k,...args]))});
  function element(id){if(!elements.has(id))elements.set(id,{id,value:'',style:{},dataset:{},children:[],classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){handlers[id+':'+name]=fn},setAttribute(){},matches(){return false},getContext:()=>ctx,clientWidth:1200,clientHeight:800,getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},replaceChildren(){this.children=[]},append(child){this.children.push(child)},showModal(){this.open=true},close(){this.open=false},focus(){},select(){}});return elements.get(id)}
  const buttons=['V','R','C','D','SW','NPN','PNP','GND'].map(type=>{const b=element(type);b.dataset.type=type;return b});
  const c={console,document:{getElementById:element,createElement:()=>element('new'+elements.size),querySelectorAll:q=>q==='.place'?buttons:[]},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},devicePixelRatio:1,performance:{now:()=>0},requestAnimationFrame(){},addEventListener:(k,f)=>handlers[k]=f};vm.createContext(c);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('})();',`globalThis.api={parts,wires,selection,chipGroups,addPart,setTool,saveChip,placeChip,selectOnly,rotateSelected,ungroupSelection,draw,simulate,terminals,nodeKey,validChip,library:()=>chipLibrary};})();`);
  vm.runInContext(script,c);
  const event=(x,y,extra={})=>({clientX:x,clientY:y,button:0,pointerId:1,target:element('cv'),preventDefault(){},...extra});
  const down=(x,y,extra)=>handlers['cv:pointerdown'](event(x,y,extra)),move=(x,y)=>handlers['cv:pointermove'](event(x,y)),up=()=>handlers['cv:pointerup']();
  const click=(x,y,extra)=>{down(x,y,extra);up()};
  const drag=(x,y,x2,y2,extra)=>{down(x,y,extra);move(x2,y2);up()};
  return {...c.api,handlers,element,storage,down,move,up,click,drag,draws,key:(key,extra={})=>handlers.keydown({key,code:key===' '?'Space':key,target:element('cv'),preventDefault(){},...extra})};
}
function pair(e){e.addPart('R',200,200);e.addPart('C',440,200);e.wires.push({id:900,a:'7,5',b:'9,5',approxI:0});e.selectOnly(null)}
test('marquee selects parts and wire; drag preserves internal and external connections',()=>{
  const e=editor();pair(e);e.wires.push({id:901,a:'1,5',b:'3,5',approxI:0});
  e.drag(100,100,550,290);assert.equal(e.selection.size,3);
  e.drag(200,200,283,241);assert.equal(JSON.stringify(e.parts.map(p=>[p.x,p.y])),JSON.stringify([[280,240],[520,240]]));
  assert.equal(e.wires[0].a,'9,6');assert.equal(e.wires[0].b,'11,6');
  assert.equal(e.wires[1].a,'1,5');assert.equal(e.wires[1].b,'5,6');e.draw();
});
test('Shift click adds/removes; Escape cancels a move',()=>{
  const e=editor();pair(e);e.click(200,200);e.click(440,200,{shiftKey:true});assert.equal(e.selection.size,2);
  e.click(440,200,{shiftKey:true});assert.equal(e.selection.size,1);
  e.down(200,200);e.move(320,280);e.key('Escape');e.up();assert.equal(e.parts[0].x,200);assert.equal(e.parts[0].y,200);
});
test('saved chip persists and places independent instances with group selection',()=>{
  const e=editor();pair(e);e.drag(100,100,550,290);
  assert.equal(e.saveChip('RC module'),true);const t=e.library()[0];assert.equal(e.validChip(t),true);assert.equal(t.parts.length,2);assert.equal(t.wires.length,1);
  e.placeChip(t,800,400);assert.equal(e.parts.length,4);assert.equal(e.chipGroups.length,2);assert.equal(new Set(e.parts.map(p=>p.id)).size,4);
  const placed=e.parts[2];e.selectOnly(null);e.click(placed.x,placed.y);assert.equal(e.selection.size,3);
  placed.value=999;assert.equal(t.parts[0].value,1000);assert.equal(e.parts[0].value,1000);
  e.ungroupSelection();assert.equal(e.chipGroups.length,1);e.selectOnly(placed);assert.equal(e.selection.size,1);
  const reloaded=editor(e.storage);assert.equal(reloaded.library().length,1);assert.equal(reloaded.library()[0].name,'RC module');
});
test('chip rotation restores layout after four turns; delete removes whole group',()=>{
  const e=editor();pair(e);e.drag(100,100,550,290);e.saveChip('Test');
  const before=JSON.stringify({p:e.parts.map(p=>[p.x,p.y,p.rot]),w:e.wires.map(w=>[w.a,w.b])});
  for(let n=0;n<4;n++)e.rotateSelected();
  assert.equal(JSON.stringify({p:e.parts.map(p=>[p.x,p.y,p.rot]),w:e.wires.map(w=>[w.a,w.b])}),before);
  e.key('Delete');assert.equal(e.parts.length,0);assert.equal(e.wires.length,0);assert.equal(e.chipGroups.length,0);assert.equal(e.library().length,1);
});
test('dialog and library controls save and place a chip via canvas',()=>{
  const e=editor();pair(e);e.drag(100,100,550,290);e.element('saveChipBtn').onclick();assert.equal(e.element('chipDialog').open,true);
  e.element('chipName').value='Reusable RC';e.element('chipForm').onsubmit({preventDefault(){}});assert.equal(e.element('chipDialog').open,false);
  e.element('chipLibrary').onchange({target:{value:'0'}});e.move(800,400);e.draw();e.click(800,400);assert.equal(e.parts.length,4);
  assert.ok(e.draws.some(d=>d[0]==='roundRect'));
});
test('malformed stored chip is ignored; Clear keeps saved library',()=>{
  const store=new Map([['circuitry.customChips.v1','[{"name":"broken"}]']]);const e=editor(store);assert.equal(e.library().length,0);
  pair(e);e.drag(100,100,550,290);e.saveChip('Keep');e.element('clearBtn').onclick();assert.equal(e.parts.length,0);assert.equal(e.selection.size,0);assert.equal(e.library().length,1);
});
test('saved NOT chip copies retain independent inputs and correct electrical behavior',()=>{
  const e=editor();
  const add=(type,x,y,props={})=>{e.addPart(type,x,y);const p=e.parts[e.parts.length-1];Object.assign(p,props);return p};
  const supply=add('V',0,0),input=add('V',0,240,{value:0});
  const rb=add('R',320,240,{value:10000}),rc=add('R',320,0),q=add('NPN',640,160),g=add('GND',0,400);
  let id=1000;const terminal=(p,name)=>{const t=e.terminals(p).find(t=>t.name===name);return e.nodeKey(t.x,t.y)};
  const join=(...pins)=>{for(let i=1;i<pins.length;i++)e.wires.push({id:id++,a:terminal(...pins[0]),b:terminal(...pins[i]),approxI:0})};
  join([supply,'a'],[rc,'a']);join([supply,'b'],[input,'b'],[g,'g'],[q,'e']);join([input,'a'],[rb,'a']);join([rb,'b'],[q,'b']);join([rc,'b'],[q,'c']);
  for(const o of [...e.parts,...e.wires])e.selection.add(o.id);
  e.saveChip('NOT');e.placeChip(e.library()[0],1600,0);
  const copiedInput=e.parts[7],copiedQ=e.parts[10];copiedInput.value=5;
  e.simulate(.001);assert.ok(q.terminalV.c>4.7);assert.ok(copiedQ.terminalV.c<.3);
  input.value=5;copiedInput.value=0;e.simulate(.001);assert.ok(q.terminalV.c<.3);assert.ok(copiedQ.terminalV.c>4.7);
});
test('new diodes default to zero drop and block reverse bias in all rotations',()=>{
  for(let rot=0;rot<4;rot++){
    const e=editor();e.addPart('GND',0,400);const ground=e.parts[0];e.addPart('V',0,0);const source=e.parts[1];e.addPart('R',320,0);const resistor=e.parts[2];e.addPart('D',640,160);const diode=e.parts[3];
    assert.equal(diode.value,0);diode.rot=rot;
    let id=1000;const pin=(p,name)=>{const t=e.terminals(p).find(t=>t.name===name);return e.nodeKey(t.x,t.y)};
    const join=(p,a,q,b)=>e.wires.push({id:id++,a:pin(p,a),b:pin(q,b),approxI:0});
    join(source,'b',ground,'g');join(source,'a',resistor,'a');join(resistor,'b',diode,'a');join(diode,'k',ground,'g');
    for(const v of [5,-5,5]){source.value=v;e.simulate(.001);if(v<0)assert.equal(diode.i,0);else assert.ok(Math.abs(diode.i-5/1001)<1e-8)}
  }
});
test('LED shortcuts, switch interaction and custom chip serialization',()=>{
  const e=editor();e.key('9');e.click(200,200);e.key('0');e.click(440,200);
  assert.equal(e.parts[0].type,'LED');assert.equal(e.parts[0].value,2);assert.equal(e.parts[1].type,'SWLED');assert.equal(e.parts[1].closed,false);
  e.handlers['stage:dblclick']({clientX:440,clientY:200});assert.equal(e.parts[1].closed,true);e.draw();
  e.selectOnly(null);e.drag(100,100,550,290);e.saveChip('Lights');assert.ok(e.validChip(e.library()[0]));e.placeChip(e.library()[0],800,400);assert.equal(e.parts[3].closed,true);
});
