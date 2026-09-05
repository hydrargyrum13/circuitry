const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'grid_native_circuit_simulator.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
function circuit(){
  // Named pin nets isolate the electrical model from canvas placement.
  const c={parts:[],wires:[],simTime:0,voltageByNode:new Map(),voltageMax:1};
  vm.createContext(c);
  vm.runInContext(`function nodeKey(x,y){return x+','+y}
    function nodeXY(k){const [x,y]=k.split(',').map(Number);return{x,y}}
    function terminals(p){return Object.entries(p.pins).map(([name,x])=>({name,x,y:0}))}
    `+script.slice(script.indexOf('class DSU'),script.indexOf('function line(')),c);
  c.add=(type,pins,props={})=>{const p={type,pins,capV:0,...props};c.parts.push(p);return p};
  c.add('GND',{g:0});
  return c;
}
function near(actual,expected,tolerance=1e-6){assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`)}
function inverter(type,beta=100){
  const c=circuit();
  c.add('V',{a:1,b:0},{value:5});
  const input=c.add('V',{a:2,b:0},{value:0});
  c.add('R',{a:2,b:3},{value:10000});
  c.add('R',{a:4,b:type==='NPN'?1:0},{value:1000});
  const q=c.add(type,{b:3,c:4,e:type==='NPN'?0:1},{beta});
  return {c,input,q};
}
for(const type of ['NPN','PNP']){
  test(type+' NOT gate switches low/high repeatedly and obeys KCL',()=>{
    const {c,input,q}=inverter(type);
    for(const v of [0,5,0,5,0]){
      input.value=v;c.simulate(.001);
      const out=q.terminalV.c;
      if(v===0)assert.ok(out>4.7,`${type}: input ${v}, output ${out}`);
      else assert.ok(out<.3,`${type}: input ${v}, output ${out}`);
      const {b,c:vc,e}=q.terminalV;
      near(q.termI.b,(v-b)/10000,1e-8);
      near(q.termI.c,((type==='NPN'?5:0)-vc)/1000,1e-8);
      near(q.termI.b+q.termI.c+q.termI.e,0,1e-12);
      for(const val of [b,vc,e])assert.ok(Number.isFinite(val));
    }
  });
  test(type+' forward active current gain follows beta',()=>{
    for(const beta of [10,100,250]){
      const c=circuit(),s=type==='NPN'?1:-1;
      c.add('V',{a:1,b:0},{value:s*.6});
      c.add('V',{a:2,b:0},{value:s*5});
      const q=c.add(type,{b:1,c:2,e:0},{beta});c.simulate(.001);
      near(q.termI.c/q.termI.b,beta,1e-3);
      near(q.termI.c,s*1e-14*Math.expm1(.6/.02585),1e-10);
    }
  });
}
test('resistor divider and source polarity',()=>{
  const c=circuit();c.add('V',{a:1,b:0},{value:5});
  const r=c.add('R',{a:1,b:2},{value:1000});c.add('R',{a:2,b:0},{value:1000});
  c.simulate(.001);near(r.terminalV.b,2.5);near(r.i,.0025);
});
test('diode conducts forward and blocks reverse',()=>{
  for(const v of [5,-5]){
    const c=circuit();c.add('V',{a:1,b:0},{value:v});c.add('R',{a:1,b:2},{value:1000});
    const d=c.add('D',{a:2,k:0},{value:.7});c.simulate(.001);
    near(d.i,v>0?4.3/1001:0,1e-8);
  }
});
test('RC charge follows backward Euler time constant',()=>{
  const c=circuit();c.add('V',{a:1,b:0},{value:5});c.add('R',{a:1,b:2},{value:1000});
  const cap=c.add('C',{a:2,b:0},{value:1,unit:'µF'});
  for(let n=1;n<=5;n++){c.simulate(.001);near(cap.capV,5*(1-Math.pow(.5,n)));}
});
test('closed switch and chained wires carry load current; open switch blocks',()=>{
  const c=circuit();c.add('V',{a:1,b:0},{value:5});
  const sw=c.add('SW',{a:2,b:3},{closed:true});c.add('R',{a:4,b:0},{value:1000});
  c.wires.push({a:'1,0',b:'5,0'},{a:'5,0',b:'2,0'},{a:'3,0',b:'4,0'});
  c.simulate(.001);near(sw.i,.005);for(const w of c.wires)near(w.approxI,.005);
  sw.closed=false;c.simulate(.001);near(sw.i,0);for(const w of c.wires)near(w.approxI,0);
});
test('NOT gate works with actual canvas terminals and all transistor rotations',()=>{
  for(const type of ['NPN','PNP'])for(let rot=0;rot<4;rot++){
    const c=circuit();c.parts.length=0;c.GRID=40;
    vm.runInContext(script.slice(script.indexOf('function terminals(p)'),script.indexOf('function getPart(')),c);
    const add=(type,x,y,props={})=>c.add(type,{}, {x,y,rot:0,...props});
    const supply=add('V',0,0,{value:5}),input=add('V',0,240,{value:0});
    const rb=add('R',320,240,{value:10000}),rc=add('R',320,0,{value:1000});
    const q=add(type,640,160,{rot,beta:100}),ground=add('GND',0,400);
    const key=(p,name)=>{const t=c.terminals(p).find(t=>t.name===name);return c.nodeKey(t.x,t.y)};
    const join=(...pins)=>{for(let i=1;i<pins.length;i++)c.wires.push({a:key(...pins[0]),b:key(...pins[i])})};
    if(type==='NPN')join([supply,'a'],[rc,'a']);
    join([supply,'b'],[input,'b'],[ground,'g'],...(type==='NPN'?[[q,'e']]:[[rc,'a']]));
    if(type==='PNP')join([supply,'a'],[q,'e']);
    join([input,'a'],[rb,'a']);join([rb,'b'],[q,'b']);join([rc,'b'],[q,'c']);
    for(const v of [0,5]){input.value=v;c.simulate(.001);assert.ok(v===0?q.terminalV.c>4.7:q.terminalV.c<.3,`${type} rotation ${rot}, input ${v}: ${q.terminalV.c}`)}
  }
});
test('source long plate is on its positive a terminal side',()=>{
  const segments=[];
  const ctx=new Proxy({measureText:()=>({width:20})},{get:(obj,k)=>obj[k]??(()=>{})});
  const c={ctx,isSelected:()=>false,selected:null,hovered:null,PART_SCALE:40/24,lineColor:'',terminals:()=>[{name:'a'},{name:'b'}],componentGradient:()=>'',terminalVoltage:()=>0,voltageColor:()=>'',dot:()=>{},line:(...coords)=>segments.push(coords)};
  vm.createContext(c);vm.runInContext(script.slice(script.indexOf('function drawPart(p)'),script.indexOf('function drawElectronFlowSegment')),c);
  c.drawPart({type:'V',x:0,y:0,rot:0,value:5});
  const plates=segments.filter(([x1,y1,x2,y2])=>x1===x2&&y1!==y2);
  assert.ok(Math.abs(plates[0][3]-plates[0][1])>Math.abs(plates[1][3]-plates[1][1]));
});
