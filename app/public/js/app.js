const $=s=>document.querySelector(s);
const ST={
  operando:{rot:'Operando',curto:'Operando'},
  aguardando:{rot:'Aguardando manutenção',curto:'Aguardando'},
  em_manutencao:{rot:'Em manutenção',curto:'Em manutenção'},
  aguardando_peca:{rot:'Peças solicitadas',curto:'Peças solic.'},
  aguardando_entrega:{rot:'Aguardando peças',curto:'Aguard. peças'},
  pecas_recebidas:{rot:'Peças recebidas · aguardando mecânico',curto:'Peças receb.'},
  liberado:{rot:'Liberado · aguardando operação',curto:'Liberado'}
};
const COR={operando:'s-ok-ico',aguardando:'s-wait',em_manutencao:'s-maint',aguardando_peca:'s-peca',aguardando_entrega:'s-entrega',pecas_recebidas:'s-receb',liberado:'s-lib'};
const ORDEM_FILA={aguardando:0,pecas_recebidas:1,em_manutencao:2,aguardando_peca:3,aguardando_entrega:4,liberado:5};
const TIPO={};TIPOS.forEach(t=>TIPO[t.id]=t);

let feedDb=null,mode='local',db=null,papel='operacao',aberto=null,ultimoT=0,primeiroFeed=true,recebeuEq=false,gravando=false;
let frotas=frotasPadrao();
let equip={},eventos=[];
let vista='painel',estruturaSig='';
papel=null;

function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function dur(ms){
  const s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),ss=s%60;
  if(d) return d+'d '+pad2(h)+'h'+pad2(m);
  return h+':'+pad2(m)+':'+pad2(ss);
}
function hhmm(t){const d=new Date(t);return pad2(d.getHours())+':'+pad2(d.getMinutes())}
function icone(tipo){return `<svg viewBox="0 0 120 70" aria-hidden="true"><use href="#i-${esc(tipo)}"/></svg>`}
function cmpTag(a,b){return a.localeCompare(b,'pt',{numeric:true})}
function frotaDe(id){return frotas.find(f=>f.id===id)}
function ativos(){return Object.values(equip).filter(e=>e.ativo!==false&&daTela(e))}
function colsDe(n){return n<=5?n:Math.min(5,Math.ceil(n/2))}
function fmtH(n){return (n||n===0)&&n!==''?Number(n).toLocaleString('pt-BR')+' h':'—'}

function estrutura(){
  const out=[],usados=new Set(),at=ativos();
  for(const f of frotas){usados.add(f.id);const tags=at.filter(e=>e.grupo===f.id).map(e=>e.tag).sort(cmpTag);if(tags.length)out.push({f,tags});}
  const orf=at.filter(e=>!usados.has(e.grupo)).map(e=>e.tag).sort(cmpTag);
  if(orf.length)out.push({f:{id:'_sem',nome:'Sem frota'},tags:orf});
  return out;
}

function montarFrota(est){
  const box=$('#frota');box.innerHTML='';
  for(const {f,tags} of est){
    const sec=document.createElement('section');sec.className='grupo';sec.style.setProperty('--cols',colsDe(tags.length));
    sec.innerHTML=`<header class="g-h"><h2>${esc(f.nome)}</h2><span class="g-n" data-gn="${esc(f.id)}"></span></header><div class="g-grid"></div>`;
    const grid=sec.querySelector('.g-grid');
    for(const tag of tags){
      const e=equip[tag];
      const b=document.createElement('button');b.type='button';b.className='eq';b.id='eq-'+tag;b.dataset.st='operando';
      b.innerHTML=`<span class="eq-top"><span class="eq-tag">${esc(tag)}</span>${e.porte?`<span class="eq-porte">${esc(e.porte)}</span>`:''}</span><svg class="eq-ico" viewBox="0 0 120 70" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><use href="#i-${esc(e.tipo)}"/></svg><span class="eq-st"><span class="eq-rot"></span><span class="eq-tm"></span></span>`;
      b.addEventListener('click',()=>abrir(tag));
      grid.appendChild(b);
    }
    box.appendChild(sec);
  }
  if(!est.length)box.innerHTML='<p class="vazio">Nenhum equipamento ativo. Cadastre a frota na aba Cadastro.</p>';
  const all=est.flatMap(x=>x.tags);
  $('#fita').style.gridTemplateColumns=`repeat(${Math.max(all.length,1)},1fr)`;
  $('#fita').innerHTML=all.map(t=>`<span id="ft-${esc(t)}" title="${esc(t)}"></span>`).join('');
}

/* ---------- Painel encaixado na tela ----------
   Em TVs e monitores deitados, o tamanho dos cartões é ajustado para toda a frota caber
   na tela sem rolar: aumenta quando há espaço sobrando e diminui quando falta. */
// Telas deitadas (TVs, monitores): todas as páginas usam a mesma escala, como numa TV Full HD
// (1920 de largura) ampliada ou reduzida para a tela real. Assim o topo e os textos ficam iguais
// ao trocar de página. No painel, além disso, tudo se encaixa na altura da tela sem rolar.
function modoEscala(){return innerWidth>=900&&innerWidth>=innerHeight*1.15;}
function modoAjuste(){return vista==='painel'&&modoEscala();}
function ajustarPainel(){
  const b=document.body,fr=$('#frota');
  if(!fr)return;
  if(modoEscala()){b.classList.add('escala');b.style.setProperty('--z',Math.max(.5,Math.min(3,innerWidth/1920)).toFixed(4));}
  else{b.classList.remove('escala');b.style.removeProperty('--z');}
  const antes=b.classList.contains('ajuste');
  if(!modoAjuste()){b.classList.remove('ajuste');['--s','--sh'].forEach(k=>b.style.removeProperty(k));if(antes)render();return;}
  b.classList.add('ajuste');
  if(!antes)render(); // quantidade de eventos listados muda com o modo
  const ok=()=>fr.scrollHeight<=fr.clientHeight+1&&fr.scrollWidth<=fr.clientWidth+1;
  const busca=(nome,lo,hi)=>{
    const cabe=v=>{b.style.setProperty(nome,v.toFixed(3));return ok();};
    if(cabe(hi))return;
    if(!cabe(lo))return;
    for(let i=0;i<10;i++){const m=(lo+hi)/2;if(cabe(m))lo=m;else hi=m;}
    cabe(lo);
  };
  b.style.setProperty('--sh','1');
  busca('--s',.3,2.4);   // tamanho geral dos cartões (largura, altura e letras)
  busca('--sh',1,1.8);   // depois estica só a altura para ocupar a sobra da tela
  requestAnimationFrame(marcarMais);
}
let ajusteT=null;
// Depois que a tela termina de desenhar (números, fila, fontes), recalcula o encaixe.
function agendarAjuste(ms){clearTimeout(ajusteT);ajusteT=setTimeout(ajustarPainel,ms==null?60:ms);}
addEventListener('resize',()=>agendarAjuste(150));
// Garantia: se algo mudar a altura do topo (ex.: texto que quebra linha), reencaixa.
setInterval(()=>{const fr=$('#frota');if(document.body.classList.contains('ajuste')&&fr&&(fr.scrollHeight>fr.clientHeight+1||fr.scrollWidth>fr.clientWidth+1))ajustarPainel();},5000);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>ajustarPainel());

function render(){
  const est=estrutura();
  const sig=JSON.stringify(est.map(x=>[x.f.id,x.f.nome,x.tags.map(t=>t+'|'+(equip[t].porte||'')+'|'+equip[t].tipo)]));
  if(sig!==estruturaSig){estruturaSig=sig;montarFrota(est);agendarAjuste();}
  const tags=est.flatMap(x=>x.tags);
  const cont={operando:0,aguardando:0,em_manutencao:0,aguardando_peca:0,aguardando_entrega:0,pecas_recebidas:0,liberado:0};
  for(const {f,tags:tg} of est){
    let ok=0;
    for(const tag of tg){
      const e=equip[tag],b=document.getElementById('eq-'+tag);if(!b)continue;
      cont[e.status]=(cont[e.status]||0)+1;if(e.status==='operando')ok++;
      b.dataset.st=e.status;
      b.querySelector('.eq-rot').textContent=ST[e.status].curto;
      const tm=b.querySelector('.eq-tm');
      if(e.status==='operando'){tm.removeAttribute('data-desde');tm.textContent='';}else{tm.dataset.desde=e.desde;}
      b.title=e.status==='operando'?tag+' · Operando':`${tag} · ${ST[e.status].rot} · ${e.motivo}${e.obs?' — '+e.obs:''}`;
      b.setAttribute('aria-label',b.title);
      const ft=document.getElementById('ft-'+tag);if(ft){ft.dataset.st=e.status;ft.style.background=`var(--${COR[e.status]})`;}
    }
    const gn=document.querySelector(`[data-gn="${CSS.escape(f.id)}"]`);if(gn)gn.innerHTML=`<b>${ok}</b>/${tg.length} operando`;
  }
  const tot=tags.length;
  $('#k-disp').innerHTML=`${cont.operando}<small>/${tot}</small>`;
  $('#k-pct').textContent=tot?Math.round(cont.operando/tot*100)+'%':'';
  for(const s of ['aguardando','em_manutencao','liberado']){const el=$('#k-'+s);el.textContent=cont[s];el.classList.toggle('zero',!cont[s]);}
  {const tp=cont.aguardando_peca+cont.aguardando_entrega+cont.pecas_recebidas,el=$('#k-pecas');el.textContent=tp;el.classList.toggle('zero',!tp);
   $('#k-pecas-sub').innerHTML=tp?[['aguardando_peca','solic.'],['aguardando_entrega','aguard.'],['pecas_recebidas','receb.']].filter(([s])=>cont[s]).map(([s,l])=>`<span data-c="${s}"><b>${cont[s]}</b> ${l}</span>`).join(''):'';}
  const at=ativos();
  const esp=at.filter(e=>e.status==='aguardando').sort((a,b)=>a.desde-b.desde)[0];
  $('#k-espera').innerHTML=esp?`${esc(esp.tag)}<em data-desde="${esp.desde}"></em>`:'<span style="color:var(--faint)">Nenhuma</span>';
  const fila=at.filter(e=>e.status!=='operando').sort((a,b)=>(ORDEM_FILA[a.status]-ORDEM_FILA[b.status])||(a.desde-b.desde));
  $('#fila-n').textContent=fila.length?fila.length+' parados':'';
  $('#fila').innerHTML=fila.length?fila.map(e=>`<button type="button" class="fr" data-c="${e.status}" data-tag="${esc(e.tag)}"><i></i><span style="min-width:0"><span><b>${esc(e.tag)}</b><span class="fr-s">${ST[e.status].curto}</span></span><p>${esc(e.motivo)}${['aguardando_peca','aguardando_entrega','pecas_recebidas'].includes(e.status)&&resumoPecas(e.paradaId).total?' · '+esc(textoResumoPecas(e.paradaId)):(e.obs?' · '+esc(e.obs):'')}${e.tecnico&&e.status!=='aguardando'?' · '+esc(e.tecnico):''}</p></span><span class="tm" data-desde="${e.desde}"></span></button>`).join(''):'<p class="vazio">Toda a frota está operando.</p>';
  const evsTela=eventos.filter(v=>!filtroAtivo()||(equip[v.tag]&&daTela(equip[v.tag])));
  $('#evs').innerHTML=evsTela.length?evsTela.slice(0,document.body.classList.contains('ajuste')?40:(qrFixo?5:9)).map(v=>`<div class="ev" data-c="${esc(v.status)}"><time>${hhmm(v.t)}</time><span><b>${esc(v.tag)}</b><span class="a">${esc(v.acao)}</span><small>${esc(v.por)}${v.detalhe?' · '+esc(v.detalhe):''}</small></span></div>`).join(''):'<p class="vazio">Sem eventos ainda.</p>';
  requestAnimationFrame(marcarMais);
  if(aberto){if(!equip[aberto.tag])fechar();else if(equip[aberto.tag].status!==aberto.st)renderModal();}
  if(vista==='cadastro')renderCad();
  if(vista==='config')renderCfg();
  renderQRFixo();
  tick();
}

function tick(){
  const now=Date.now();
  document.querySelectorAll('[data-desde]').forEach(el=>{el.textContent=dur(now-Number(el.dataset.desde));});
  const d=new Date(now);
  $('#hora').textContent=pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  const dia=d.getHours()>=7&&d.getHours()<19,en=typeof LANG!=='undefined'&&LANG==='en';
  const turno=en?(dia?'Shift A · 7am–7pm':'Shift B · 7pm–7am'):(dia?'Turno A · 07–19h':'Turno B · 19–07h');
  $('#data').textContent=d.toLocaleDateString(en?'en-US':'pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace(/\./g,'')+' · '+turno;
}

function flash(tag){const b=document.getElementById('eq-'+tag);if(!b)return;b.classList.remove('mudou');void b.offsetWidth;b.classList.add('mudou');setTimeout(()=>b.classList.remove('mudou'),3400);}

const filaToast=[];let toastOn=false;
function toast(v){filaToast.push(v);if(!toastOn)proxToast();}
function proxToast(){
  const v=filaToast.shift();const el=$('#toast');
  if(!v){el.hidden=true;toastOn=false;return;}
  toastOn=true;el.dataset.c=v.status;
  el.innerHTML=`<i></i><div><b>${esc(v.tag)}</b><span><strong>${esc(v.acao)}</strong><small>${esc(v.por)}${v.detalhe?' · '+esc(v.detalhe):''} · ${hhmm(v.t)}</small></span></div>`;
  el.hidden=false;el.style.animation='none';void el.offsetWidth;el.style.animation='';
  setTimeout(proxToast,filaToast.length?2600:5200);
}
function toastErro(msg){toast({tag:'!',status:'aguardando',acao:msg,por:'Tente de novo',t:Date.now()});}

let paradas={};
const JANELA_DESFAZER=10*60000;
const NOME_ACAO={abrir:'Abertura da parada',assumir:'Início do atendimento',pecas:'Solicitação de peças',pecas_ok:'Chegada das peças',retomar:'Retomada do atendimento',liberar:'Liberação',receber:'Recebimento pela operação'};
const PAPEL_NOME={operacao:'Operação',manutencao:'Manutenção',planejador:'Planejamento',admin:'Administrador'};
function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
function semAnterior(e){const c={...e};delete c.anterior;delete c.ultAcao;return c;}
function toLocal(ms){const d=new Date(ms);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'T'+pad2(d.getHours())+':'+pad2(d.getMinutes());}
function fromLocal(s){const t=new Date(s).getTime();return isFinite(t)?t:NaN;}
function dataHora(ms){return new Date(ms).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+hhmm(ms);}
function paradaAtual(e){return e.paradaId&&paradas[e.paradaId]?clone(paradas[e.paradaId]):null;}
function paradaNova(e){const ini=e.inicioParada||e.desde||Date.now();return {id:e.tag+'_'+ini,tag:e.tag,inicio:ini,fim:null,motivo:e.motivo||'',obs:e.obs||'',tecnico:e.tecnico||'',horIni:null,horFim:null,cancelada:false,etapas:[{status:e.status,t:e.desde||ini,por:''}],correcoes:[]};}
function ultimaFechada(tag){return Object.values(paradas).filter(p=>p.tag===tag&&p.fim&&!p.cancelada&&Date.now()-p.fim<30*86400000).sort((a,b)=>b.fim-a.fim)[0]||null;}

async function gravar(tag,novoEq,parada,evento){
  if(mode==='db'&&db){
    if(gravando)return false;gravando=true;
    try{
      if(novoEq)await db.doc('equipamentos/'+tag).set(novoEq);
      if(parada)await db.doc('paradas/'+parada.id).set(parada);
      await db.doc('log/feed').set({eventos:[evento,...eventos].slice(0,40)});
    }catch(e){toastErro(e&&e.status===401?'Entre com seu usuário de novo':e&&e.code==='invalid_argument'?'Seu acesso não permite alterar o quadro':'Não foi possível salvar a mudança');return false;}
    finally{gravando=false;}
    if(parada)paradas[parada.id]=parada;
    return true;
  }
  if(novoEq){equip[tag]=novoEq;flash(tag);}
  if(parada)paradas[parada.id]=parada;
  eventos=[evento,...eventos].slice(0,40);
  toast(evento);render();return true;
}

async function aplicar(a,tag,patch,ev){
  const now=Date.now(),atual=equip[tag],antes=semAnterior(atual);
  const novo={...antes,...patch,desde:now,anterior:antes,ultAcao:{a,t:now,papel,uid:sessaoId||'',nome:(usuarioAtual()||{}).curto||''}};
  let par;
  if(a==='abrir'){
    par={id:tag+'_'+now,tag,oficina:atual.oficina||'',inicio:now,fim:null,motivo:patch.motivo,obs:patch.obs||'',tecnico:'',horIni:ev.hor??null,horFim:null,cancelada:false,etapas:[{status:'aguardando',t:now,por:ev.por}],correcoes:[]};
    novo.paradaId=par.id;
  }else{
    par=paradaAtual(atual)||paradaNova(atual);novo.paradaId=par.id;
    par.etapas.push({status:novo.status,t:now,por:ev.por});
    if(patch.tecnico){
      const ant=par.tecnico||'';
      if(ant&&ant!==patch.tecnico){
        const ini=(par.etapas||[]).find(x=>x.status==='em_manutencao');
        const hist=par.responsaveis&&par.responsaveis.length?par.responsaveis:[{tecnico:ant,t:ini?ini.t:par.inicio,por:''}];
        par.responsaveis=[...hist,{tecnico:patch.tecnico,de:ant,t:now,por:ev.por,nota:'Assumiu após a chegada das peças'}];
      }
      par.tecnico=patch.tecnico;
    }
    if(patch.obs!==undefined&&novo.status!=='operando')par.obs=patch.obs;
    if(a==='liberar'&&ev.hor!=null)par.horFim=ev.hor;
    if(a==='receber'){par.fim=now;novo.paradaId='';}
  }
  const evento={t:now,tag,status:novo.status,acao:ev.acao||ACAO[novo.status],por:ev.por,detalhe:ev.detalhe||''};
  if(ev.hor!=null)evento.hor=ev.hor;
  return gravar(tag,novo,par,evento);
}

function quemManut(e){const u=usuarioAtual();return u&&u.perfil==='manutencao'?u.curto:(e.tecnico||(u?u.curto:''));}
const ACOES={
  abrir:(e,d)=>aplicar('abrir',e.tag,{status:'aguardando',motivo:d.motivo,obs:d.obs||'',tecnico:'',inicioParada:Date.now(),...horPatch(d)},{por:'Operação'+nomeSessao(),detalhe:d.motivo+(d.obs?' · '+d.obs:'')+horTxt(d),hor:d.hor??null}),
  assumir:(e,d)=>aplicar('assumir',e.tag,{status:'em_manutencao',tecnico:d.tecnico},{por:'Manutenção · '+d.tecnico,detalhe:e.motivo}),
  retomar:(e)=>aplicar('retomar',e.tag,{status:'em_manutencao'},{acao:'Atendimento retomado',por:'Manutenção · '+quemManut(e),detalhe:e.motivo}),
  liberar:(e,d)=>aplicar('liberar',e.tag,{status:'liberado',obs:d.obs||e.obs,...horPatch(d)},{por:'Manutenção · '+quemManut(e),detalhe:(d.obs||e.motivo)+horTxt(d),hor:d.hor??null}),
  receber:(e)=>aplicar('receber',e.tag,{status:'operando',motivo:'',obs:'',tecnico:'',inicioParada:0},{por:'Operação'+nomeSessao(),detalhe:'Parado por '+dur(Date.now()-(e.inicioParada||e.desde))})
};

function podeDesfazer(e){
  if(!papel||!e.ultAcao||!e.anterior)return false;
  const mesmo=e.ultAcao.uid?e.ultAcao.uid===sessaoId:e.ultAcao.papel===papel;
  return mesmo&&Date.now()-e.ultAcao.t<JANELA_DESFAZER;
}
async function desfazer(e){
  const now=Date.now(),ua=e.ultAcao;
  const volta={...clone(e.anterior),anterior:null,ultAcao:null};
  for(const k of ['grupo','tipo','porte','modelo','area','ano','serie','ativo'])if(e[k]!==undefined)volta[k]=e[k];
  const pid=ua.a==='receber'?e.anterior.paradaId:e.paradaId;
  let par=pid&&paradas[pid]?clone(paradas[pid]):null;
  if(par){
    par.correcoes=par.correcoes||[];
    if(ua.a==='abrir'){par.cancelada=true;par.fim=now;}
    else{par.etapas.pop();if(ua.a==='receber')par.fim=null;if(ua.a==='liberar')par.horFim=null;}
    par.correcoes.push({t:now,por:PAPEL_NOME[papel]+nomeSessao(),just:'Lançamento desfeito',campo:ua.a==='abrir'?'Parada':'Etapa',de:NOME_ACAO[ua.a],para:'desfeito'});
  }
  const evento={t:now,tag:e.tag,status:'correcao',acao:'Lançamento desfeito',por:PAPEL_NOME[papel]+nomeSessao(),detalhe:NOME_ACAO[ua.a]+' de '+hhmm(ua.t)+' · volta para '+ST[volta.status].curto};
  return gravar(e.tag,volta,par,evento);
}

const MSG_OK={abrir:'Parada aberta. A manutenção já vê este equipamento na fila.',assumir:'Atendimento assumido. Quando terminar o serviço, libere por aqui.',pecas:'Peças solicitadas. O planejamento já recebeu a lista e vai informar a ordem de compra.',retomar:'Atendimento retomado.',liberar:'Equipamento liberado. Falta a operação confirmar o recebimento.',receber:'Recebimento confirmado. Equipamento de volta à operação.',desfazer:'Lançamento desfeito. O equipamento voltou para a etapa anterior.',corrigir:'Correção salva e registrada no histórico.',cancelar:'Parada cancelada e registrada no histórico.'};
function abrir(tag){aberto={tag,st:null,msg:null,modo:null,confDesf:false,err:''};$('#modal').hidden=false;renderModal();}
function fechar(){aberto=null;$('#modal').hidden=true;}

function renderModal(){
  const e=equip[aberto.tag];if(!e)return fechar();
  aberto.st=e.status;
  const f=frotaDe(e.grupo)||{nome:'Sem frota'};
  const dlg=$('#dlg');dlg.dataset.c=e.status;
  const hist=eventos.filter(v=>v.tag===e.tag).slice(0,6);
  const par=e.status!=='operando'?paradaAtual(e):null;
  const nCorr=par&&par.correcoes?par.correcoes.length:0;
  let st;
  if(e.status==='operando'){
    st=`<div class="st-box"><span class="r">Operando</span><span class="t" data-desde="${e.desde}"></span><p><span>Desde ${hhmm(e.desde)}${e.area?' · '+esc(e.area):''}</span></p></div>`;
  }else{
    st=`<div class="st-box"><span class="r">${ST[e.status].rot}${nCorr?`<span class="tagcorr">${nCorr} ${nCorr>1?'correções':'correção'}</span>`:''}</span><span class="t"><small>Nesta etapa</small><span data-desde="${e.desde}"></span></span><p>${esc(e.motivo)}${e.obs?' · '+esc(e.obs):''}</p><p><span>Parado há </span><span data-desde="${e.inicioParada||e.desde}"></span>${e.tecnico&&e.status!=='aguardando'?'<span> · Técnico: </span>'+esc(e.tecnico):''}</p></div>`;
  }
  let desf='';
  if(!aberto.modo&&podeDesfazer(e)){
    const ua=e.ultAcao;
    desf=`<div class="desf"><span>Último lançamento: <b>${esc(NOME_ACAO[ua.a]||ua.a)}</b> · ${esc(ua.nome||PAPEL_NOME[ua.papel]||'')} às ${hhmm(ua.t)} · dá para desfazer até ${hhmm(ua.t+JANELA_DESFAZER)}</span><button type="button" class="${aberto.confDesf?'conf':''}" data-acao="desfazer">${aberto.confDesf?'Confirmar desfazer':'Desfazer'}</button></div>`;
  }
  dlg.innerHTML=`<div class="d-h">${icone(e.tipo)}<div><h2 id="dlg-t">${esc(e.tag)}</h2><p>${esc(f.nome)} · ${esc(e.modelo||'')}${e.horimetro?' · '+fmtH(e.horimetro):''}</p></div><button type="button" class="x" data-fechar aria-label="Fechar">×</button></div>${aberto.msg?`<p class="okmsg" tabindex="-1" role="status" data-c="${esc(aberto.msg.c)}"><i aria-hidden="true">✓</i>${esc(aberto.msg.txt)}</p>`:''}${st}${desf}${acoesHtml(e)}${hist.length&&!aberto.modo?`<div class="fs"><span class="lb">Histórico recente</span><div class="hist">${hist.map(v=>`<div class="ev" data-c="${esc(v.status)}"><time>${dataHora(v.t)}</time><span><span class="a">${esc(v.acao)}</span><small>${esc(v.por)}${v.detalhe?' · '+esc(v.detalhe):''}</small></span></div>`).join('')}</div></div>`:''}`;
  tick();
}

function chipsMotivo(sel){return `<div class="chips m" id="motivos">${MOTIVOS.map(m=>`<button type="button" aria-pressed="${m===sel}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>`;}

function supervisorHtml(e){
  const m=aberto.modo,err=aberto.err?`<p class="erro">${esc(aberto.err)}</p>`:'';
  const just=`<div class="fs"><label for="c-just">Justificativa (fica registrada)</label><input type="text" id="c-just" maxlength="100" placeholder="Operador lançou no equipamento errado"></div>`;
  if(m==='corrigir'){
    return `<div class="corr"><h4>Corrigir parada em andamento</h4>
      <div class="fs"><span class="lb">Motivo</span>${chipsMotivo(e.motivo)}</div>
      <div class="fs"><label for="c-obs">Observação</label><input type="text" id="c-obs" maxlength="80" value="${esc(e.obs)}"></div>
      <div class="g2">
        <div class="cp"><label for="c-ini">Início da parada</label><input type="datetime-local" id="c-ini" step="60" value="${toLocal(e.inicioParada||e.desde)}"></div>
        <div class="cp"><label for="c-etapa">Início da etapa atual</label><input type="datetime-local" id="c-etapa" step="60" value="${toLocal(e.desde)}"><span class="dica">${esc(ST[e.status].rot)}</span></div>
        ${e.status!=='aguardando'?`<div class="cp"><label for="c-tec">Técnico</label><select id="c-tec">${[...new Set([e.tecnico,...tecnicos(e)].filter(Boolean))].map(t=>`<option${t===e.tecnico?' selected':''}>${esc(t)}</option>`).join('')}</select></div>`:''}
        <div class="cp"><label for="c-hor">Horímetro (h)</label><input type="number" id="c-hor" min="0" step="1" value="${e.horimetro===''||e.horimetro==null?'':esc(e.horimetro)}"></div>
      </div>${just}${err}
      <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--glass)" data-acao="salvarCorr">Salvar correção</button></div></div>`;
  }
  if(m==='corrigirF'){
    const p=ultimaFechada(e.tag);if(!p)return '<p class="nota">Nenhuma parada recente encontrada.</p>';
    return `<div class="corr"><h4>Corrigir última parada</h4>
      <div class="fs"><span class="lb">Motivo</span>${chipsMotivo(p.motivo)}</div>
      <div class="fs"><label for="c-obs">Observação</label><input type="text" id="c-obs" maxlength="80" value="${esc(p.obs)}"></div>
      <div class="g2">
        <div class="cp"><label for="c-ini">Início da parada</label><input type="datetime-local" id="c-ini" step="60" value="${toLocal(p.inicio)}"></div>
        <div class="cp"><label for="c-fim">Fim (recebido pela operação)</label><input type="datetime-local" id="c-fim" step="60" value="${toLocal(p.fim)}"></div>
      </div>${just}${err}
      <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--glass)" data-acao="salvarCorrF">Salvar correção</button></div></div>`;
  }
  if(m==='cancelar'||m==='cancelarF'){
    const txt=m==='cancelar'?'O equipamento volta para Operando e esta parada sai dos indicadores. O registro continua no histórico, marcado como cancelado.':'A última parada sai dos indicadores de disponibilidade e tempo de reparo. O registro continua no histórico, marcado como cancelado.';
    return `<div class="corr"><h4>${m==='cancelar'?'Cancelar parada em andamento':'Cancelar última parada'}</h4><p class="nota" style="border-style:solid">${txt}</p>${just}${err}
      <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--s-wait)" data-acao="${m==='cancelar'?'confCancel':'confCancelF'}">Cancelar parada</button></div></div>`;
  }
  const cab='<div class="corr-ent"><span class="lb">Correções</span>';
  if(e.status!=='operando')return cab+`<div class="mini"><button type="button" data-acao="modoCorr">Corrigir dados da parada</button><button type="button" class="rmx" data-acao="modoCancel">Cancelar parada</button></div></div>`;
  const p=ultimaFechada(e.tag);
  if(!p)return '';
  return cab+`<div class="ultpar"><span class="lb">Última parada</span><p><b>${dataHora(p.inicio)} → ${dataHora(p.fim)}</b> · ${esc(dur(p.fim-p.inicio))}</p><p>${esc(p.motivo)}${p.obs?' · '+esc(p.obs):''}${p.correcoes&&p.correcoes.length?` · <span class="tagcorr">${p.correcoes.length} ${p.correcoes.length>1?'correções':'correção'}</span>`:''}</p></div><div class="mini"><button type="button" data-acao="modoCorrF">Corrigir última parada</button><button type="button" class="rmx" data-acao="modoCancelF">Cancelar última parada</button></div></div>`;
}

function acoesHtml(e){
  if(!papel)return `<p class="nota">Entre com seu usuário para registrar ações neste equipamento.</p><div class="acoes"><button type="button" class="go" style="--k:var(--glass)" data-acao="login">Entrar</button></div>`;
  if(aberto.modo==='pecas')return formPecasHtml(e);
  if(aberto.modo==='transf')return formTransfHtml(e);
  if(aberto.modo)return supervisorHtml(e);
  if(papel==='admin')return respHtml(e)+listaPecasModal(e)+'<p class="nota">Como administrador, você corrige lançamentos. Abrir, atender e liberar ficam com a operação e a manutenção.</p>'+supervisorHtml(e);
  if(papel==='planejador')return acoesPlanejamento(e);
  return acoesPapel(e)+supervisorHtml(e);
}
function acoesPapel(e){
  const nota=t=>`<p class="nota">${t}</p>`;
  if(papel==='operacao'){
    if(e.status==='operando')return `<div class="fs"><span class="lb">Motivo da parada</span><div class="chips" id="motivos">${MOTIVOS.map(m=>`<button type="button" aria-pressed="false" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div><p class="erro" id="err" hidden>Escolha um motivo antes de abrir a parada.</p></div><div class="fs"><label for="obs">Observação</label><input type="text" id="obs" maxlength="80" placeholder="Pneu dianteiro direito cortado"></div>${horCampo(e)}<div class="acoes"><button type="button" class="go" style="--k:var(--s-wait)" data-acao="abrir">Colocar em manutenção</button></div>`;
    if(e.status==='liberado')return `<div class="acoes"><button type="button" class="go" style="--k:var(--s-ok)" data-acao="receber">Confirmar recebimento</button></div>`;
    return listaPecasModal(e)+nota('Este equipamento está com a manutenção. Só a manutenção pode liberá-lo.');
  }
  if(e.status==='operando')return nota('Paradas são abertas pela operação.');
  if(e.status==='liberado')return nota('Liberado. Aguardando a operação confirmar o recebimento.');
  if(e.status==='pecas_recebidas')return listaPecasModal(e)+`<p class="nota">Todas as peças chegaram. Escolha quem assume o atendimento agora.</p><div class="fs"><label for="tec">Técnico responsável</label><select id="tec">${tecnicos(e).map(t=>`<option${(usuarioAtual()||{}).curto===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="acoes"><button type="button" class="go" style="--k:var(--s-maint)" data-acao="assumir">Assumir atendimento</button></div>`;
  if(e.status==='aguardando')return `<div class="fs"><label for="tec">Técnico responsável</label><select id="tec">${tecnicos(e).map(t=>`<option${(usuarioAtual()||{}).curto===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="acoes"><button type="button" class="go" style="--k:var(--s-maint)" data-acao="assumir">Assumir atendimento</button></div>`;
  const resp=respHtml(e);
  const obs=resp+`<div class="fs"><label for="obs">${e.status==='em_manutencao'?'Nota (nº do pedido ou serviço feito)':'Nota da liberação'}</label><input type="text" id="obs" maxlength="80" placeholder="${e.status==='em_manutencao'?'Pedido 4502 · filtro hidráulico':'Serviço concluído, testado em campo'}"></div>`;
  if(e.status==='em_manutencao')return listaPecasModal(e)+obs+horCampo(e)+`<div class="acoes"><button type="button" class="go sec" style="--k:var(--s-peca)" data-acao="modoPecas">Solicitar peças</button><button type="button" class="go" style="--k:var(--s-lib)" data-acao="liberar">Liberar equipamento</button></div>`;
  // Peças solicitadas: o status volta sozinho para "em manutenção" quando todas as peças chegam.
  const semPendencia=!resumoPecas(e.paradaId).pendentes;
  return listaPecasModal(e)+obs+horCampo(e)+`<div class="acoes"><button type="button" class="go sec" style="--k:var(--s-peca)" data-acao="modoPecas">Adicionar peças</button>${semPendencia?`<button type="button" class="go sec" style="--k:var(--s-maint)" data-acao="retomar">Retomar atendimento</button>`:''}<button type="button" class="go" style="--k:var(--s-lib)" data-acao="liberar">Liberar equipamento</button></div>`;
}

/* ---------- Transferência do atendimento ----------
   A manutenção pode passar o equipamento para outro técnico (troca de equipe ou de turno).
   Não muda a etapa nem o tempo; fica registrado na parada (responsaveis) e no histórico de eventos. */
function respHtml(e){
  if(!['em_manutencao','aguardando_peca','aguardando_entrega'].includes(e.status)||!(papel==='manutencao'||papel==='admin'))return '';
  const par=paradaAtual(e),r=par&&par.responsaveis&&par.responsaveis.length>1?par.responsaveis[par.responsaveis.length-1]:null;
  return `<div class="desf resp"><span>Responsável: <b>${esc(e.tecnico||'—')}</b>${r?` · recebeu de ${esc(r.de||'—')} às ${hhmm(r.t)}`:''}</span><button type="button" data-acao="modoTransf">Transferir atendimento</button></div>`;
}
function formTransfHtml(e){
  const lista=tecnicos(e).filter(t=>t!==e.tecnico);
  const err=aberto.err?`<p class="erro">${esc(aberto.err)}</p>`:'';
  if(!lista.length)return `<div class="corr"><h4>Transferir atendimento</h4><p class="nota">Não há outro técnico de manutenção ativo para receber o atendimento. Cadastre na aba Usuários.</p><div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button></div></div>`;
  return `<div class="corr"><h4>Transferir atendimento</h4>
    <p class="nota" style="border-style:solid">Hoje com <b>${esc(e.tecnico||'—')}</b>. A etapa e o tempo de parada continuam os mesmos; a troca fica registrada no histórico.</p>
    <div class="fs"><label for="t-tec">Passar para</label><select id="t-tec">${lista.map(t=>`<option${(usuarioAtual()||{}).curto===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="fs"><label for="t-nota">Observação (opcional)</label><input type="text" id="t-nota" maxlength="80" placeholder="Troca de turno · falta testar a bomba"></div>${err}
    <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--s-maint)" data-acao="confTransf">Transferir</button></div></div>`;
}
async function transferir(e,novoTec,nota){
  const now=Date.now(),de=e.tecnico||'',quem=PAPEL_NOME[papel]+nomeSessao();
  const par=paradaAtual(e)||paradaNova(e);
  const ini=(par.etapas||[]).find(x=>x.status==='em_manutencao');
  const hist=par.responsaveis&&par.responsaveis.length?par.responsaveis:(de?[{tecnico:de,t:ini?ini.t:e.desde,por:''}]:[]);
  par.responsaveis=[...hist,{tecnico:novoTec,de,t:now,por:quem,nota:nota||''}];
  par.tecnico=novoTec;
  const novo={...e,tecnico:novoTec,paradaId:par.id};
  const evento={t:now,tag:e.tag,status:e.status,acao:'Atendimento transferido',por:quem,detalhe:`${de||'—'} → ${novoTec}${nota?' · '+nota:''}`};
  return gravar(e.tag,novo,par,evento);
}

function erroCorr(msg){aberto.err=msg;const keep=lerCorr();renderModal();restaurarCorr(keep);}
function lerCorr(){const o={};document.querySelectorAll('#dlg .corr input,#dlg .corr select').forEach(el=>o[el.id]=el.value);const s=document.querySelector('#motivos button[aria-pressed="true"]');o._m=s?s.dataset.m:'';return o;}
function restaurarCorr(o){for(const k in o){if(k==='_m')continue;const el=document.getElementById(k);if(el)el.value=o[k];}if(o._m)document.querySelectorAll('#motivos button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.m===o._m)));}

async function salvarCorrecao(e,fechada){
  const now=Date.now(),v=lerCorr(),just=(v['c-just']||'').trim();
  if(!v._m)return erroCorr('Escolha o motivo.');
  if(!just)return erroCorr('Escreva uma justificativa curta para a correção.');
  const mud=[],reg=(campo,de,para,deT,paraT)=>{if(String(de??'')!==String(para??''))mud.push({campo,de:deT??de,para:paraT??para});};
  const ini=fromLocal(v['c-ini']);
  if(fechada){
    const p=clone(ultimaFechada(e.tag));if(!p)return erroCorr('Parada não encontrada.');
    const fim=fromLocal(v['c-fim']);
    if(!isFinite(ini)||!isFinite(fim))return erroCorr('Preencha início e fim.');
    if(ini>=fim)return erroCorr('O início precisa ser antes do fim.');
    if(fim>now)return erroCorr('O fim não pode estar no futuro.');
    const iniM=Math.floor(p.inicio/60000)*60000,fimM=Math.floor(p.fim/60000)*60000;
    reg('Motivo',p.motivo,v._m);reg('Observação',p.obs,(v['c-obs']||'').trim());
    if(ini!==iniM)reg('Início',iniM,ini,dataHora(p.inicio),dataHora(ini));
    if(fim!==fimM)reg('Fim',fimM,fim,dataHora(p.fim),dataHora(fim));
    if(!mud.length)return erroCorr('Nenhum campo foi alterado.');
    p.motivo=v._m;p.obs=(v['c-obs']||'').trim();if(ini!==iniM)p.inicio=ini;if(fim!==fimM)p.fim=fim;
    p.correcoes=[...(p.correcoes||[]),...mud.map(c=>({t:now,por:PAPEL_NOME[papel]+nomeSessao(),just,...c}))];
    const ev={t:now,tag:e.tag,status:'correcao',acao:'Parada corrigida',por:PAPEL_NOME[papel]+nomeSessao(),detalhe:mud.map(c=>`${c.campo}: ${c.de||'—'} → ${c.para||'—'}`).join('; ')+' · '+just};
    return gravar(e.tag,null,p,ev);
  }
  const et=fromLocal(v['c-etapa']);
  if(!isFinite(ini)||!isFinite(et))return erroCorr('Preencha os horários.');
  if(ini>et)return erroCorr('O início da parada precisa ser antes do início da etapa atual.');
  if(et>now)return erroCorr('Horário no futuro. Confira a data.');
  const hor=v['c-hor']===''||v['c-hor']==null?'':Math.round(Number(v['c-hor']));
  if(hor!==''&&(!isFinite(hor)||hor<0))return erroCorr('Horímetro inválido.');
  const iniA=Math.floor((e.inicioParada||e.desde)/60000)*60000,etA=Math.floor(e.desde/60000)*60000;
  reg('Motivo',e.motivo,v._m);reg('Observação',e.obs,(v['c-obs']||'').trim());
  if(v['c-tec']!==undefined)reg('Técnico',e.tecnico,v['c-tec']);
  if(ini!==iniA)reg('Início da parada',iniA,ini,dataHora(iniA),dataHora(ini));
  if(et!==etA)reg('Início da etapa',etA,et,dataHora(etA),dataHora(et));
  reg('Horímetro',e.horimetro,hor,fmtH(e.horimetro),fmtH(hor));
  if(!mud.length)return erroCorr('Nenhum campo foi alterado.');
  const novo={...semAnterior(e),motivo:v._m,obs:(v['c-obs']||'').trim(),anterior:null,ultAcao:null};
  if(v['c-tec']!==undefined)novo.tecnico=v['c-tec'];
  if(ini!==iniA)novo.inicioParada=ini;if(et!==etA)novo.desde=et;if(String(hor)!==String(e.horimetro??''))novo.horimetro=hor;
  const p=paradaAtual(e)||paradaNova(e);novo.paradaId=p.id;
  p.motivo=novo.motivo;p.obs=novo.obs;p.tecnico=novo.tecnico||'';p.inicio=novo.inicioParada||p.inicio;
  if(et!==etA&&p.etapas.length)p.etapas[p.etapas.length-1].t=et;
  if(ini!==iniA&&p.etapas.length)p.etapas[0].t=ini;
  p.correcoes=[...(p.correcoes||[]),...mud.map(c=>({t:now,por:PAPEL_NOME[papel]+nomeSessao(),just,...c}))];
  const ev={t:now,tag:e.tag,status:'correcao',acao:'Lançamento corrigido',por:PAPEL_NOME[papel]+nomeSessao(),detalhe:mud.map(c=>`${c.campo}: ${c.de||'—'} → ${c.para||'—'}`).join('; ')+' · '+just};
  return gravar(e.tag,novo,p,ev);
}

async function cancelarParada(e,fechada){
  const now=Date.now(),just=($('#c-just')||{}).value?.trim();
  if(!just)return erroCorr('Escreva o motivo do cancelamento.');
  if(fechada){
    const p=clone(ultimaFechada(e.tag));if(!p)return erroCorr('Parada não encontrada.');
    p.cancelada=true;p.correcoes=[...(p.correcoes||[]),{t:now,por:PAPEL_NOME[papel]+nomeSessao(),just,campo:'Parada',de:'válida',para:'cancelada'}];
    return gravar(e.tag,null,p,{t:now,tag:e.tag,status:'correcao',acao:'Parada cancelada',por:PAPEL_NOME[papel]+nomeSessao(),detalhe:`${dataHora(p.inicio)} · ${p.motivo} · ${just}`});
  }
  const p=paradaAtual(e)||paradaNova(e);
  p.cancelada=true;p.fim=now;p.correcoes=[...(p.correcoes||[]),{t:now,por:PAPEL_NOME[papel]+nomeSessao(),just,campo:'Parada',de:'aberta',para:'cancelada'}];
  const novo={...semAnterior(e),status:'operando',motivo:'',obs:'',tecnico:'',inicioParada:0,desde:now,paradaId:'',anterior:null,ultAcao:null};
  return gravar(e.tag,novo,p,{t:now,tag:e.tag,status:'correcao',acao:'Parada cancelada',por:PAPEL_NOME[papel]+nomeSessao(),detalhe:`${e.motivo} · ${just}`});
}

$('#dlg').addEventListener('click',async ev=>{
  const t=ev.target.closest('button');if(!t)return;
  if(t.hasAttribute('data-fechar'))return fechar();
  if(t.dataset.m!==undefined){document.querySelectorAll('#motivos button').forEach(b=>b.setAttribute('aria-pressed',String(b===t)));const er=$('#err');if(er)er.hidden=true;return;}
  const a=t.dataset.acao;if(!a||!aberto)return;
  const e=equip[aberto.tag];
  const modos={modoCorr:'corrigir',modoCorrF:'corrigirF',modoCancel:'cancelar',modoCancelF:'cancelarF'};
  if(modos[a]){aberto.modo=modos[a];aberto.err='';aberto.msg=null;renderModal();const f=$('#dlg .corr input');if(f)f.focus();return;}
  if(a==='voltar'){aberto.modo=null;aberto.err='';renderModal();return;}
  if(await cliquePecasModal(a,t,e))return;
  if(a==='modoTransf'){aberto.modo='transf';aberto.err='';aberto.msg=null;renderModal();const s=$('#t-tec');if(s)s.focus();return;}
  if(a==='confTransf'){
    const novoTec=$('#t-tec').value,nota=$('#t-nota').value.trim();
    if(!novoTec||novoTec===e.tecnico){aberto.err='Escolha outro técnico.';renderModal();return;}
    t.disabled=true;const ok=await transferir(e,novoTec,nota);
    if(ok===false){t.disabled=false;return;}
    aberto.modo=null;aberto.err='';aberto.msg={txt:`Atendimento transferido para ${novoTec}.`,c:e.status};renderModal();const m=$('#dlg .okmsg');if(m)m.focus();return;
  }
  if(a==='login'){const tg=aberto.tag;fechar();abrirLogin(tg);return;}
  let ok,msgKey=a;
  if(a==='desfazer'){
    if(!aberto.confDesf){aberto.confDesf=true;renderModal();return;}
    aberto.confDesf=false;t.disabled=true;ok=await desfazer(e);
  }else if(a==='salvarCorr'||a==='salvarCorrF'){
    t.disabled=true;ok=await salvarCorrecao(e,a==='salvarCorrF');msgKey='corrigir';
    if(ok===undefined){return;}
  }else if(a==='confCancel'||a==='confCancelF'){
    t.disabled=true;ok=await cancelarParada(e,a==='confCancelF');msgKey='cancelar';
    if(ok===undefined){return;}
  }else if(ACOES[a]){
    const d={};
    const obs=$('#obs');if(obs)d.obs=obs.value.trim();
    if(a==='abrir'){const sel=document.querySelector('#motivos button[aria-pressed="true"]');if(!sel){$('#err').hidden=false;return;}d.motivo=sel.dataset.m;}
    if(a==='assumir')d.tecnico=$('#tec').value;
    if(a==='abrir'||a==='liberar'){const h=lerHor(e,t);if(!h.ok)return;if(h.val!=null)d.hor=h.val;}
    t.disabled=true;ok=await ACOES[a](e,d);
  }else return;
  if(ok!==false&&aberto){aberto.msg={txt:MSG_OK[msgKey],c:msgKey==='corrigir'||msgKey==='cancelar'||msgKey==='desfazer'?'correcao':(equip[aberto.tag]||{}).status};aberto.modo=null;aberto.err='';aberto.st=null;renderModal();const m=$('#dlg .okmsg');if(m)m.focus();}
  else if(ok===false&&t.isConnected)t.disabled=false;
});
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')fechar();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&aberto)fechar();});
// Indica (esmaecido embaixo) quando a fila ou os eventos têm mais itens para rolar.
function marcarMais(){for(const el of [$('#fila'),$('#evs')])if(el)el.dataset.mais=el.scrollTop+el.clientHeight<el.scrollHeight-2?'1':'0';}
['#fila','#evs'].forEach(s=>$(s).addEventListener('scroll',marcarMais,{passive:true}));
$('#fila').addEventListener('click',e=>{const b=e.target.closest('[data-tag]');if(b)abrir(b.dataset.tag);});

/* ---------- Usuários e sessão ---------- */
const PERFIS={
  operacao:{nome:'Operação',desc:'Abre paradas e confirma o recebimento. Também corrige lançamentos, cadastra equipamentos e usuários.'},
  manutencao:{nome:'Manutenção',desc:'Assume atendimentos, solicita peças e libera. Também corrige lançamentos, cadastra equipamentos e usuários.'},
  planejador:{nome:'Planejamento',desc:'Recebe as solicitações de peças da manutenção, informa a ordem de compra e marca a chegada das peças.'},
  admin:{nome:'Administrador',desc:'Corrige lançamentos, cadastra equipamentos e usuários, e acessa os dados para exportar ao Excel e gerar relatórios.'}
};
const ORDEM_PERFIL=['operacao','manutencao','planejador','admin'];
const TURNOS={A:'Turno A',B:'Turno B',ADM:'Administrativo'};
let usuarios={};
let sessaoId=null,ultimaAtividade=Date.now(),loginSel=null,pinDig='',pinErros=0,pinBloqueio=0,pinVerificando=false,loginBusca='',loginDepois=null;
try{sessaoId=localStorage.getItem('qp-user')||null}catch(e){}
// Confere com o servidor se a sessão deste aparelho continua valendo (ela não expira sozinha).
async function verificarSessao(){
  let u;
  try{u=await window.dt.sessao();}catch(e){return;}
  if(u){
    if(!usuarios[u.id])usuarios[u.id]=u;
    if(sessaoId!==u.id){sessaoId=u.id;try{localStorage.setItem('qp-user',u.id)}catch(e){}}
  }else if(sessaoId){sessaoId=null;try{localStorage.removeItem('qp-user')}catch(e){}}
  aplicarSessao();
}
window.addEventListener('dt-sessao-perdida',()=>{if(sessaoId)sair('Sessão encerrada',true);});
function usuarioAtual(){const u=sessaoId&&usuarios[sessaoId];return u&&u.ativo!==false&&PERFIS[u.perfil]?u:null;}
function perfilAtual(){const u=usuarioAtual();return u?u.perfil:null;}
function papelDe(p){return PERFIS[p]?p:null;}
function nomeSessao(){const u=usuarioAtual();return u?' · '+u.curto:'';}
function temUsuarios(){return Object.values(usuarios).some(u=>PERFIS[u.perfil]&&u.ativo!==false);}
function podeGerir(){const p=papelDe(perfilAtual());return !!p&&p!=='planejador';}
function podeUsuarios(){return podeGerir()||!temUsuarios();}
// Mecânicos ativos; com o equipamento informado, só os da oficina dele (mecânico sem oficina aparece em todas).
function tecnicos(e){
  let us=Object.values(usuarios).filter(u=>u.perfil==='manutencao'&&u.ativo!==false);
  if(e&&e.oficina&&oficinaPorId(e.oficina)){const d=us.filter(u=>!u.oficina||u.oficina===e.oficina);if(d.length)us=d;}
  const l=us.map(u=>u.curto).sort((a,b)=>a.localeCompare(b));
  return l.length?l:[(usuarioAtual()||{}).curto].filter(Boolean);
}
function iniciais(n){const p=String(n||'?').trim().split(/\s+/);return ((p[0]||'?')[0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();}
function curtoDe(n){const p=String(n||'').trim().split(/\s+/).filter(Boolean);if(!p.length)return '';if(p.length===1)return p[0];return p[0][0].toUpperCase()+'. '+p[p.length-1];}

let usuariosProntos=false;
function aplicarSessao(){
  if(sessaoId&&usuariosProntos&&!usuarioAtual()){sessaoId=null;try{localStorage.removeItem('qp-user')}catch(e){}window.dt.sair();}
  papel=papelDe(perfilAtual());
  renderSessao();
  $('#nav-dados').hidden=!ehAdmin();
  $('#nav-pecas').hidden=!usuarioAtual();
  if(vista==='cadastro'&&fd&&$('#f-area')){lerForm();renderForm();}
  if(aberto){aberto.modo=null;aberto.err='';aberto.confDesf=false;renderModal();}
  if(vista)setVista(vista);
}
function renderSessao(){
  const u=usuarioAtual();
  $('#sessao').innerHTML=u
    ?`<span class="quem" data-p="${u.perfil}" title="${esc(u.nome)} · ${esc(PERFIS[u.perfil].nome)}"><i>${esc(iniciais(u.nome))}</i><span><b>${esc(u.curto)}</b><small>${esc(PERFIS[u.perfil].nome)}</small></span></span><button type="button" class="bt" data-s="sair">Sair</button>`
    :`<button type="button" class="bt entrar" data-s="entrar"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="5.5" r="3"/><path d="M2.5 14c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/></svg><span>Entrar</span></button>`;
}
$('#sessao').addEventListener('click',ev=>{const b=ev.target.closest('[data-s]');if(!b)return;if(b.dataset.s==='entrar')abrirLogin();else sair();});
function sair(motivo,local){
  const u=usuarioAtual();sessaoId=null;try{localStorage.removeItem('qp-user')}catch(e){}
  if(!local)window.dt.sair();
  aplicarSessao();
  if(u)toast({tag:u.curto,status:'correcao',acao:motivo||'Sessão encerrada',por:PERFIS[u.perfil].nome,t:Date.now()});
}
['pointerdown','keydown'].forEach(t=>document.addEventListener(t,()=>{ultimaAtividade=Date.now();},{passive:true}));

function abrirLogin(depois){loginDepois=depois||null;loginSel=null;pinDig='';loginBusca='';$('#login').hidden=false;renderLogin();const s=$('#l-busca');if(s)s.focus();}
function fecharLogin(){$('#login').hidden=true;loginSel=null;pinDig='';}
function renderLogin(){
  const d=$('#login-dlg');
  if(!loginSel){
    const q=loginBusca.trim().toLowerCase();
    const lista=Object.values(usuarios).filter(u=>u.ativo!==false&&(!q||[u.nome,u.curto,u.matricula].join(' ').toLowerCase().includes(q)));
    let h='';
    for(const p of ORDEM_PERFIL){
      const it=lista.filter(u=>u.perfil===p).sort((a,b)=>a.nome.localeCompare(b.nome));if(!it.length)continue;
      h+=`<div class="ugrp">${esc(PERFIS[p].nome)}</div>`+it.map(u=>`<button type="button" class="ubtn" data-u="${esc(u.id)}" data-p="${u.perfil}"><span class="av">${esc(iniciais(u.nome))}</span><span><b>${esc(u.curto)}</b><small>${esc(u.nome)}</small></span><span class="mt">${esc(u.matricula)}</span></button>`).join('');
    }
    const vazio=!Object.values(usuarios).some(u=>u.ativo!==false);
    d.innerHTML=`<div class="d-h lh"><div><h2 id="login-t">Quem está entrando?</h2><p>Escolha seu nome e digite o PIN de 4 dígitos.</p></div><button type="button" class="x" data-l="fechar" aria-label="Fechar">×</button></div>
      <input type="search" id="l-busca" class="lbusca" placeholder="Buscar nome ou matrícula" aria-label="Buscar nome ou matrícula" value="${esc(loginBusca)}">
      <div class="ulist">${h||`<p class="vazio">${vazio?'Nenhum usuário cadastrado. Abra a aba Usuários para criar o primeiro.':'Ninguém encontrado com essa busca.'}</p>`}</div>`;
    return;
  }
  const u=usuarios[loginSel];
  const bloq=pinBloqueio>Date.now();
  d.innerHTML=`<div class="d-h lh"><div><h2 id="login-t">Digite seu PIN</h2><p>Acesso como ${esc(PERFIS[u.perfil].nome)}</p></div><button type="button" class="x" data-l="fechar" aria-label="Fechar">×</button></div>
    <div class="pinbox">
      <div class="ubtn sel" data-p="${u.perfil}"><span class="av">${esc(iniciais(u.nome))}</span><span><b>${esc(u.curto)}</b><small>${esc(u.nome)}</small></span><button type="button" class="troca" data-l="voltar">Trocar</button></div>
      <div class="dots" id="dots" aria-label="PIN">${[0,1,2,3].map(i=>`<i class="${i<pinDig.length?'on':''}"></i>`).join('')}</div>
      <p class="erro" id="pin-err" role="alert"${bloq?'':' hidden'}>${bloq?'Muitas tentativas. Aguarde 30 segundos.':''}</p>
      <div class="pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="del" aria-label="Apagar">⌫</button><button type="button" data-k="0">0</button><button type="button" data-k="ok" class="ok" aria-label="Entrar">OK</button></div>
    </div>`;
}
async function tentarPin(){
  const u=usuarios[loginSel];if(!u||pinDig.length!==4||pinVerificando)return;
  pinVerificando=true;
  const r=await window.dt.login(u.id,pinDig);
  pinVerificando=false;
  if(r.ok){
    sessaoId=u.id;ultimaAtividade=Date.now();try{localStorage.setItem('qp-user',u.id)}catch(e){}
    const depois=loginDepois;fecharLogin();aplicarSessao();
    if(depois)abrir(depois);
    return;
  }
  pinDig='';
  renderLogin();
  const er=$('#pin-err'),dots=$('#dots');
  if(er){er.hidden=false;er.textContent=r.erro==='rede'?'Sem conexão com o servidor. Tente de novo.':'PIN incorreto. Tente de novo.';}
  if(dots&&r.erro!=='rede'){dots.classList.add('erro','shake');}
}
function teclaPin(k){
  if(pinBloqueio>Date.now())return;
  if(k==='del')pinDig=pinDig.slice(0,-1);
  else if(k==='ok'){tentarPin();return;}
  else if(pinDig.length<4)pinDig+=k;
  const dots=$('#dots');if(dots){dots.className='dots';dots.querySelectorAll('i').forEach((el,i)=>el.classList.toggle('on',i<pinDig.length));}
  const er=$('#pin-err');if(er&&!(pinBloqueio>Date.now()))er.hidden=true;
  if(pinDig.length===4)tentarPin();
}
$('#login-dlg').addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.l==='fechar')return fecharLogin();
  if(b.dataset.l==='voltar'){loginSel=null;pinDig='';renderLogin();return;}
  if(b.dataset.u){loginSel=b.dataset.u;pinDig='';renderLogin();return;}
  if(b.dataset.k)teclaPin(b.dataset.k);
});
$('#login-dlg').addEventListener('input',ev=>{if(ev.target.id==='l-busca'){loginBusca=ev.target.value;const pos=ev.target.selectionStart;renderLogin();const s=$('#l-busca');s.focus();try{s.setSelectionRange(pos,pos)}catch(e){}}});
$('#login').addEventListener('click',e=>{if(e.target.id==='login')fecharLogin();});
document.addEventListener('keydown',e=>{
  if($('#login').hidden)return;
  if(e.key==='Escape'){fecharLogin();return;}
  if(!loginSel)return;
  if(/^\d$/.test(e.key))teclaPin(e.key);else if(e.key==='Backspace')teclaPin('del');else if(e.key==='Enter')teclaPin('ok');
});

/* ---------- Cadastro de usuários ---------- */
let uFiltro='',uBusca='',uEdit=null,ufd=null,uErrs={},uConfRm=false,uSalvando=false;
function novoUsuario(){uEdit=null;uErrs={};uConfRm=false;ufd={nome:'',curto:'',curtoManual:false,matricula:'',perfil:temUsuarios()?(uFiltro||'operacao'):'admin',especialidade:'',turno:'A',oficina:filtroAtivo()?oficinaTela:'',pin:'',pin2:'',ativo:true};renderUForm();}
function editarUsuario(id){const u=usuarios[id];if(!u)return;uEdit=id;uErrs={};uConfRm=false;ufd={nome:u.nome,curto:u.curto,curtoManual:true,matricula:u.matricula,perfil:PERFIS[u.perfil]?u.perfil:'operacao',especialidade:u.especialidade||'',turno:u.turno||'A',oficina:u.oficina||'',pin:'',pin2:'',ativo:u.ativo!==false};renderUForm();renderUList();}
function renderUsr(){renderUResumo();renderUList();if(!ufd)novoUsuario();}
function renderUResumo(){
  const c={};Object.values(usuarios).filter(u=>u.ativo!==false).forEach(u=>c[u.perfil]=(c[u.perfil]||0)+1);
  $('#u-resumo').innerHTML=ORDEM_PERFIL.map(p=>`<button type="button" class="bib pcard" data-pf="${p}" data-p="${p}" aria-pressed="${uFiltro===p}"><span class="n">${c[p]||0}</span><b>${esc(PERFIS[p].nome)}</b><span>${esc(PERFIS[p].desc)}</span></button>`).join('');
}
function renderUList(){
  const q=uBusca.trim().toLowerCase(),eu=sessaoId;
  const l=Object.values(usuarios).filter(u=>(!uFiltro||u.perfil===uFiltro)&&(!q||[u.nome,u.curto,u.matricula].join(' ').toLowerCase().includes(q)));
  $('#u-n').textContent=`${l.length} de ${Object.keys(usuarios).length} usuários`;
  let h='';
  for(const p of ORDEM_PERFIL){
    const it=l.filter(u=>u.perfil===p).sort((a,b)=>a.nome.localeCompare(b.nome));if(!it.length)continue;
    h+=`<div class="fh">${esc(PERFIS[p].nome)}<span>${it.length}</span></div>`+it.map(u=>`<button type="button" class="urow${u.ativo===false?' off':''}" data-uid="${esc(u.id)}" data-p="${u.perfil}" aria-current="${uEdit===u.id}"><span class="av">${esc(iniciais(u.nome))}</span><span style="min-width:0"><b>${esc(u.nome)}</b>${u.id===eu?'<span class="voce">Você</span>':''}<small>${esc(u.curto)}</small></span><span class="mt">${esc(u.matricula)}</span><span class="pf opc">${esc(PERFIS[u.perfil].nome)}</span><span class="sx">${u.ativo===false?'Inativo':'Ativo'}</span></button>`).join('');
  }
  $('#u-tab').innerHTML=h?`<div class="ucab"><span></span><span>Nome</span><span>Matrícula</span><span class="opc">Perfil</span><span style="text-align:right">Situação</span></div>${h}`:'<p class="vazio">Nenhum usuário encontrado.</p>';
}
function renderUForm(){
  const u=uEdit?usuarios[uEdit]:null,er=k=>uErrs[k]?`<span class="erro">${esc(uErrs[k])}</span>`:'';
  $('#u-form').innerHTML=`
  <h3>${u?'Editar '+esc(u.curto):'Novo usuário'}</h3>
  <p class="sub">${u?`Matrícula ${esc(u.matricula)}${u.id===sessaoId?' · este é o seu usuário':''}`:'Cada pessoa entra com a matrícula e um PIN de 4 dígitos. O nome curto aparece nos eventos da TV.'}</p>
  <div class="g2">
    <div class="cp"><label for="uf-nome">Nome completo</label><input type="text" id="uf-nome" maxlength="60" value="${esc(ufd.nome)}" placeholder="Maria Aparecida Santos" autocomplete="off">${er('nome')}</div>
    <div class="cp"><label for="uf-curto">Nome curto</label><input type="text" id="uf-curto" maxlength="20" value="${esc(ufd.curto)}" placeholder="M. Santos" autocomplete="off">${er('curto')}</div>
    <div class="cp"><label for="uf-mat">Matrícula</label><input type="text" id="uf-mat" maxlength="12" value="${esc(ufd.matricula)}" placeholder="20215" autocomplete="off" ${u?'readonly':''}>${u?'<span class="dica">A matrícula fica fixa depois do cadastro.</span>':''}${er('matricula')}</div>
  </div>
  <div class="cp"><span class="lb">Perfil de acesso</span><div class="perfis-op">${ORDEM_PERFIL.map(p=>`<button type="button" data-pf="${p}" data-p="${p}" aria-pressed="${ufd.perfil===p}"${p==='admin'&&!podeCriarAdmin()?' disabled title="Só um administrador pode criar administradores"':''}><b>${esc(PERFIS[p].nome)}</b><span>${esc(PERFIS[p].desc)}</span></button>`).join('')}</div>${er('perfil')}</div>
  ${ufd.perfil==='manutencao'?`<div class="cp"><label for="uf-ofi">Oficina</label><select id="uf-ofi"><option value="">${oficinas.length?'Escolha a oficina':'Nenhuma oficina cadastrada'}</option>${oficinas.map(o=>`<option value="${esc(o.id)}"${o.id===ufd.oficina?' selected':''}>${esc(o.nome)}</option>`).join('')}</select>${uErrs.oficina?`<p class="erro">${esc(uErrs.oficina)}</p>`:'<span class="dica">O mecânico aparece só nos equipamentos desta oficina.</span>'}</div>`:''}
  ${false?`<div class="cp"><label for="uf-esp">Especialidade</label><select id="uf-esp"><option value="">Não informada</option>${ESPECIALIDADES.map(s=>`<option${ufd.especialidade===s?' selected':''}>${esc(s)}</option>`).join('')}</select><span class="dica">Técnicos de manutenção aparecem na lista de quem assume o atendimento.</span></div>`:''}
  <div class="g2">
    <div class="cp"><label for="uf-pin">${u?'Novo PIN (em branco mantém o atual)':'PIN (4 dígitos)'}</label><input type="password" id="uf-pin" maxlength="4" inputmode="numeric" autocomplete="new-password" value="${esc(ufd.pin)}" placeholder="••••">${er('pin')}</div>
    <div class="cp"><label for="uf-pin2">Confirmar PIN</label><input type="password" id="uf-pin2" maxlength="4" inputmode="numeric" autocomplete="new-password" value="${esc(ufd.pin2)}" placeholder="••••">${er('pin2')}</div>
  </div>
  <div class="cp"><span class="lb">Acesso</span><label class="sw" for="uf-ativo"><input type="checkbox" id="uf-ativo"${ufd.ativo?' checked':''}><span id="uf-ativo-t">${ufd.ativo?'Pode entrar no sistema':'Bloqueado (não aparece na tela de entrada)'}</span></label>${er('ativo')}</div>
  <div class="fbar">
    <button type="button" class="salvar" id="uf-salvar">${u?'Salvar alterações':'Cadastrar usuário'}</button>
    <button type="button" class="ghost" id="uf-cancel">${u?'Fechar':'Limpar'}</button>
    <span class="sp"></span>
    ${u?`<button type="button" class="rm${uConfRm?' conf':''}" id="uf-rm">${uConfRm?'Confirmar remoção de '+esc(u.curto):'Remover'}</button>`:''}
  </div>
  ${uErrs.geral?`<p class="erro">${esc(uErrs.geral)}</p>`:''}`;
}
function lerUForm(){
  const v=id=>{const el=document.getElementById(id);return el?el.value:undefined};
  ufd.nome=v('uf-nome')??ufd.nome;ufd.curto=v('uf-curto')??ufd.curto;if(!uEdit)ufd.matricula=(v('uf-mat')??ufd.matricula).trim();
  ufd.pin=v('uf-pin')??'';ufd.pin2=v('uf-pin2')??'';const es=v('uf-esp');if(es!==undefined)ufd.especialidade=es;const of=v('uf-ofi');if(of!==undefined)ufd.oficina=of;
  const a=document.getElementById('uf-ativo');if(a)ufd.ativo=a.checked;
}
$('#u-form').addEventListener('input',ev=>{
  const id=ev.target.id;
  if(id==='uf-nome'&&!ufd.curtoManual){ufd.nome=ev.target.value;ufd.curto=curtoDe(ufd.nome);const c=$('#uf-curto');if(c)c.value=ufd.curto;}
  if(id==='uf-curto')ufd.curtoManual=true;
  if(id==='uf-pin'||id==='uf-pin2')ev.target.value=ev.target.value.replace(/\D/g,'').slice(0,4);
  if(id==='uf-ativo'){ufd.ativo=ev.target.checked;$('#uf-ativo-t').textContent=ufd.ativo?'Pode entrar no sistema':'Bloqueado (não aparece na tela de entrada)';}
});
$('#u-form').addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.pf){lerUForm();ufd.perfil=b.dataset.pf;if(ufd.perfil!=='manutencao')ufd.especialidade='';renderUForm();return;}
  if(b.dataset.t){lerUForm();ufd.turno=b.dataset.t;renderUForm();return;}
  if(b.id==='uf-cancel'){novoUsuario();renderUList();return;}
  if(b.id==='uf-salvar'){salvarUsuario();return;}
  if(b.id==='uf-rm'){removerUsuario();return;}
});
function adminsAtivos(excluir){return Object.values(usuarios).filter(u=>u.perfil==='admin'&&u.ativo!==false&&u.id!==excluir).length;}
function validarUsuario(){
  const e={};
  if(ufd.nome.trim().length<3)e.nome='Informe o nome completo.';
  if(!ufd.curto.trim())e.curto='Informe o nome curto.';
  if(!uEdit){
    if(!/^[A-Za-z0-9-]{2,12}$/.test(ufd.matricula))e.matricula='Use de 2 a 12 letras ou números.';
    else if(usuarios['u'+ufd.matricula])e.matricula='Essa matrícula já está cadastrada.';
  }
  if(!uEdit||ufd.pin||ufd.pin2){
    if(!/^\d{4}$/.test(ufd.pin))e.pin='O PIN precisa ter 4 números.';
    else if(ufd.pin!==ufd.pin2)e.pin2='Os PINs não conferem.';
  }
  if(uEdit){
    const u=usuarios[uEdit];
    if(u.id===sessaoId&&!ufd.ativo)e.ativo='Você não pode bloquear o seu próprio acesso.';
    if(u.perfil==='admin'&&(ufd.perfil!=='admin'||!ufd.ativo)&&adminsAtivos(u.id)===0)e.perfil='Este é o único administrador ativo. Cadastre outro antes de mudar.';
  }
  if(!temUsuarios()&&ufd.perfil!=='admin')e.perfil='O primeiro usuário precisa ser administrador.';
  if(!podeCriarAdmin()&&(ufd.perfil==='admin'||(uEdit&&usuarios[uEdit].perfil==='admin')))e.perfil='Só um administrador pode criar ou alterar administradores.';
  if(ufd.perfil==='manutencao'&&oficinas.length&&!oficinaPorId(ufd.oficina))e.oficina='Escolha a oficina do mecânico.';
  return e;
}
async function salvarUsuario(){
  if(uSalvando)return;
  lerUForm();uErrs=validarUsuario();
  if(Object.keys(uErrs).length){renderUForm();return;}
  const id=uEdit||'u'+ufd.matricula,ant=uEdit?usuarios[uEdit]:null;
  const doc={id,nome:ufd.nome.trim(),curto:ufd.curto.trim(),matricula:ant?ant.matricula:ufd.matricula,perfil:ufd.perfil,especialidade:'',oficina:ufd.perfil==='manutencao'?(ufd.oficina||''):'',ativo:ufd.ativo,atualizadoEm:Date.now()};
  if(ufd.pin)doc.pin=ufd.pin;
  uSalvando=true;
  try{if(mode==='db'&&db)await db.doc('usuarios/'+id).set(doc);delete doc.pin;usuarios[id]=doc;}
  catch(err){uSalvando=false;uErrs={geral:err&&err.status&&err.status<500?err.message:err&&err.rede?'Sem conexão com o servidor. Tente de novo.':'Não foi possível salvar. Tente de novo.'};renderUForm();return;}
  uSalvando=false;
  toast({tag:doc.curto,status:'correcao',acao:ant?'Usuário atualizado':'Usuário cadastrado',por:PERFIS[doc.perfil].nome,t:Date.now()});
  uEdit=id;editarUsuario(id);renderUResumo();
  if(id===sessaoId)aplicarSessao();
}
async function removerUsuario(){
  const u=usuarios[uEdit];if(!u)return;
  if(u.id===sessaoId){uErrs={geral:'Você não pode remover o seu próprio usuário.'};renderUForm();return;}
  if(u.perfil==='admin'&&!ehAdmin()){uErrs={geral:'Só um administrador pode criar ou alterar administradores.'};renderUForm();return;}
  if(u.perfil==='admin'&&adminsAtivos(u.id)===0){uErrs={geral:'Este é o único administrador ativo.'};renderUForm();return;}
  if(!uConfRm){uConfRm=true;renderUForm();return;}
  try{if(mode==='db'&&db)await db.doc('usuarios/'+u.id).delete();delete usuarios[u.id];}
  catch(err){uErrs={geral:err&&err.status&&err.status<500?err.message:'Não foi possível remover. Tente de novo.'};renderUForm();return;}
  toast({tag:u.curto,status:'aguardando',acao:'Usuário removido',por:PERFIS[u.perfil].nome,t:Date.now()});
  novoUsuario();renderUsr();
}
$('#u-resumo').addEventListener('click',ev=>{const b=ev.target.closest('[data-pf]');if(!b)return;uFiltro=uFiltro===b.dataset.pf?'':b.dataset.pf;renderUResumo();renderUList();if(!uEdit)novoUsuario();});
$('#u-busca').addEventListener('input',ev=>{uBusca=ev.target.value;renderUList();});
$('#u-tab').addEventListener('click',ev=>{const b=ev.target.closest('[data-uid]');if(b)editarUsuario(b.dataset.uid);});
$('#u-novo').addEventListener('click',()=>{novoUsuario();renderUList();});
$('#lock-entrar').addEventListener('click',()=>abrirLogin());


$('#tela').onclick=()=>{
  try{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>{});}catch(e){}
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{});}catch(e){}
};

function setSync(s){const el=$('#sync');el.dataset.s=s;
  el.querySelector('span').textContent={local:'Modo local',conectando:'Conectando…',ok:'Sincronizado',cache:'Reconectando…',erro:'Sem sincronização',vazio:'Base vazia · exemplo local'}[s]||s;}

/* ---------- Cadastro ---------- */
/* ---------- Horímetro e configurações ---------- */
let opcoes={horimetroParadas:false,horObrig:true,horSalto:500};
function horPatch(d){return d.hor!=null?{horimetro:d.hor,horimetroEm:Date.now()}:{}}
function horTxt(d){return d.hor!=null?' · Horímetro '+Number(d.hor).toLocaleString('pt-BR')+' h':''}
function horCampo(e){
  if(!opcoes.horimetroParadas)return '';
  const ult=Number(e.horimetro)||0;
  return `<div class="fs horbox"><label for="hor" style="grid-column:1/-1">Horímetro atual${opcoes.horObrig?'':' (opcional)'}</label><input type="number" id="hor" min="0" step="1" inputmode="numeric" placeholder="${ult?ult+Math.round(opcoes.horSalto/20):'8450'}"><span class="ult">${ult?'Última leitura: '+fmtH(ult)+(e.horimetroEm?' · '+new Date(e.horimetroEm).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):''):'Sem leitura anterior'}</span><p class="erro" id="hor-err" hidden></p></div>`;
}
function lerHor(e,btn){
  if(!opcoes.horimetroParadas)return {ok:true,val:null};
  const el=$('#hor'),er=$('#hor-err');if(!el)return {ok:true,val:null};
  const msg=(t,aviso)=>{er.textContent=t;er.hidden=false;er.classList.toggle('aviso',!!aviso);el.focus();};
  const v=el.value.trim();
  if(v===''){if(opcoes.horObrig){msg('Informe o horímetro atual.');return {ok:false};}return {ok:true,val:null};}
  const n=Math.round(Number(v));
  if(!isFinite(n)||n<0){msg('Valor inválido.');return {ok:false};}
  const ult=Number(e.horimetro)||0;
  if(ult&&n<ult){msg(`Menor que a última leitura (${fmtH(ult)}). Confira o painel da máquina.`);return {ok:false};}
  if(ult&&n-ult>opcoes.horSalto&&btn.dataset.conf!=='1'){btn.dataset.conf='1';msg(`Salto de ${(n-ult).toLocaleString('pt-BR')} h desde a última leitura. Confira e toque de novo para confirmar.`,true);return {ok:false};}
  return {ok:true,val:n};
}
$('#dlg').addEventListener('input',ev=>{if(ev.target.id==='hor'){const er=$('#hor-err');if(er)er.hidden=true;document.querySelectorAll('#dlg [data-conf]').forEach(b=>delete b.dataset.conf);}});

function renderCfg(){
  if(typeof renderOficinaCfg==='function')renderOficinaCfg();
  $('#c-qrfixo').checked=qrFixo;$('#c-qrfixo-t').textContent=qrFixo?'Ligado':'Desligado';
  if(document.activeElement!==$('#c-link'))$('#c-link').value=opcoes.link||'';
  const pode=ehAdmin();['c-hor','c-obr','c-salto','c-link'].forEach(i=>{const el=document.getElementById(i);if(el)el.disabled=!pode;});$('#c-perm').hidden=pode;
  $('#c-hor').checked=!!opcoes.horimetroParadas;
  $('#c-hor-t').textContent=opcoes.horimetroParadas?'Ligado':'Desligado';
  $('#c-obr').checked=!!opcoes.horObrig;
  if(document.activeElement!==$('#c-salto'))$('#c-salto').value=opcoes.horSalto;
  $('#c-sub1').classList.toggle('off',!opcoes.horimetroParadas);$('#c-sub2').classList.toggle('off',!opcoes.horimetroParadas);
  const l=eventos.filter(v=>v.hor!=null).slice(0,8);
  $('#c-leit').innerHTML=l.length?l.map(v=>`<div class="ev" data-c="${esc(v.status)}"><time>${new Date(v.t).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} ${hhmm(v.t)}</time><span><b>${esc(v.tag)}</b><span class="a">${esc(v.acao)}</span><small>${esc(v.por)}</small></span><span class="h">${fmtH(v.hor)}</span></div>`).join(''):'<p class="vazio">Nenhuma leitura registrada ainda. Ligue a opção e abra ou libere uma parada.</p>';
}
let cfgTimer=null;
async function salvarOpcoes(patch){
  if(!ehAdmin()){renderCfg();return;}
  const ant={...opcoes};opcoes={...opcoes,...patch};renderCfg();if(aberto)renderModal();
  const st=$('#c-st');st.className='cfg-st';st.textContent='Salvando…';
  try{
    if(mode==='db'&&db)await db.doc('config/opcoes').set({...opcoes});
    st.className='cfg-st ok';st.textContent=mode==='db'?'Salvo · vale para todas as telas':'Salvo neste navegador (modo local)';
  }catch(err){opcoes=ant;renderCfg();st.className='cfg-st';st.style.color='var(--s-wait)';st.textContent=err&&err.code==='invalid_argument'?'Seu acesso não permite mudar as configurações.':'Não foi possível salvar. Tente de novo.';}
  clearTimeout(cfgTimer);cfgTimer=setTimeout(()=>{st.textContent='';st.style.color='';},4000);
}
$('#c-hor').addEventListener('change',e=>salvarOpcoes({horimetroParadas:e.target.checked}));
$('#c-obr').addEventListener('change',e=>salvarOpcoes({horObrig:e.target.checked}));
$('#c-salto').addEventListener('change',e=>{let n=Math.round(Number(e.target.value));if(!isFinite(n)||n<10)n=10;if(n>5000)n=5000;e.target.value=n;if(n!==opcoes.horSalto)salvarOpcoes({horSalto:n});});

let filtroTipo='',busca='',editando=null,fd=null,errs={},confRm=false,salvando=false;

function numDaTag(tag,prefixo){const m=tag.match(new RegExp('^'+prefixo.replace(/[^A-Z0-9]/g,'')+'-(\\d+)$'));return m?Number(m[1]):0;}
function sugerirTag(){
  const pre=fd.grupo==='__nova'?(fd.nfPrefixo||TIPO[fd.tipo].sigla):(frotaDe(fd.grupo)||{}).prefixo||TIPO[fd.tipo].sigla;
  let n=0;for(const t of Object.keys(equip))n=Math.max(n,numDaTag(t,pre));
  return pre+'-'+pad2(n+1);
}
function frotasDoTipo(tipo){return frotas.filter(f=>f.tipo===tipo)}
function novoFd(tipo){
  const t=tipo||filtroTipo||'adt';const fs=frotasDoTipo(t);
  fd={tipo:t,grupo:fs[0]?fs[0].id:'__nova',nfNome:'',nfPrefixo:'',tag:'',tagManual:false,porte:fs[0]?fs[0].porte||'':'',modelo:'',ano:'',serie:'',horimetro:'',area:'',oficina:filtroAtivo()?oficinaTela:'',ativo:true};
  fd.tag=sugerirTag();
}
function fdDe(e){return {tipo:e.tipo,grupo:frotaDe(e.grupo)?e.grupo:(frotasDoTipo(e.tipo)[0]||{id:'__nova'}).id,nfNome:'',nfPrefixo:'',tag:e.tag,tagManual:true,porte:e.porte||'',modelo:e.modelo||'',ano:e.ano||'',serie:e.serie||'',horimetro:e.horimetro??'',area:e.area||'',oficina:e.oficina||'',ativo:e.ativo!==false};}

function novo(){editando=null;errs={};confRm=false;novoFd();renderForm();}
function editar(tag){if(!equip[tag])return;editando=tag;errs={};confRm=false;fd=fdDe(equip[tag]);renderForm();renderLista();}

function renderCad(){$('#bt-areas').hidden=!ehAdmin();$('#bt-oficinas').hidden=!ehAdmin();renderBiblio();renderLista();}
function renderBiblio(){
  const cont={};Object.values(equip).forEach(e=>cont[e.tipo]=(cont[e.tipo]||0)+1);
  $('#biblio').innerHTML=TIPOS.map(t=>`<button type="button" class="bib" data-tipo="${t.id}" aria-pressed="${filtroTipo===t.id}">${icone(t.id)}<b>${esc(t.plural)}</b><span>${cont[t.id]||0} cadastrad${(cont[t.id]||0)===1?'o':'os'}</span></button>`).join('');
}
function renderLista(){
  const q=busca.trim().toLowerCase();
  const lista=Object.values(equip).filter(e=>(!filtroTipo||e.tipo===filtroTipo)&&(!q||[e.tag,e.modelo,e.area,nomeOficina(e.oficina)||''].join(' ').toLowerCase().includes(q)));
  $('#cad-n').textContent=`${lista.length} de ${Object.keys(equip).length} equipamentos`;
  const grupos=[...frotas,{id:'_sem',nome:'Sem frota'}];
  let html='';
  for(const f of grupos){
    const itens=lista.filter(e=>f.id==='_sem'?!frotaDe(e.grupo):e.grupo===f.id).sort((a,b)=>cmpTag(a.tag,b.tag));
    if(!itens.length)continue;
    html+=`<div class="fh">${esc(f.nome)}<span>${f.prefixo?esc(f.prefixo)+'-xx · ':''}${itens.length}</span></div>`;
    html+=itens.map(e=>`<button type="button" class="linha${e.ativo===false?' off':''}" data-c="${e.status}" data-tag="${esc(e.tag)}" aria-current="${editando===e.tag}">${icone(e.tipo)}<span class="tg">${esc(e.tag)}${e.porte?`<small>${esc(e.porte)}</small>`:''}</span><span class="md">${esc(e.modelo||'—')}<small>${e.ano?'Ano '+esc(e.ano):''}</small></span><span class="ar">${esc(e.area||'—')}</span><span class="of">${esc((e.oficina&&nomeOficina(e.oficina))||'—')}</span><span class="hr">${fmtH(e.horimetro)}</span><span class="sx">${e.ativo===false?'Fora do painel':ST[e.status].curto}</span></button>`).join('');
  }
  $('#cad-tab').innerHTML=html?`<div class="cab"><span></span><span>TAG</span><span>Modelo</span><span>Área</span><span>Oficina</span><span class="hr">Horímetro</span><span style="text-align:right">Situação</span></div>${html}`:'<p class="vazio">Nenhum equipamento encontrado.</p>';
}

function renderForm(){
  const e=editando?equip[editando]:null;
  const fs=frotasDoTipo(fd.tipo);
  const er=k=>errs[k]?`<span class="erro">${esc(errs[k])}</span>`:'';
  const areas=[...new Set(Object.values(equip).map(x=>x.area).filter(Boolean))].sort();
  const fr=fd.grupo==='__nova'?null:frotaDe(fd.grupo);
  $('#cad-form').innerHTML=`
  <h3>${e?'Editar '+esc(e.tag):'Novo equipamento'}</h3>
  <p class="sub">${e?`${esc(ST[e.status].rot)} · cadastrado na frota ${esc((frotaDe(e.grupo)||{nome:'—'}).nome)}`:'Escolha o tipo, a frota e confirme a TAG. O ícone vem da biblioteca.'}</p>
  <div class="cp"><span class="lb">Tipo de equipamento</span><div class="tipos" id="f-tipos">${TIPOS.map(t=>`<button type="button" data-tp="${t.id}" aria-pressed="${fd.tipo===t.id}"${e?' disabled':''}>${icone(t.id)}${esc(t.nome)}</button>`).join('')}</div>${e?'<span class="dica">O tipo e a TAG ficam fixos depois do cadastro.</span>':''}</div>
  <div class="g2">
    <div class="cp"><label for="f-grupo">Frota</label><select id="f-grupo">${fs.map(f=>`<option value="${esc(f.id)}"${fd.grupo===f.id?' selected':''}>${esc(f.nome)} (${esc(f.prefixo)})</option>`).join('')}<option value="__nova"${fd.grupo==='__nova'?' selected':''}>+ Nova frota…</option></select></div>
    <div class="cp"><label for="f-tag">TAG</label><div class="tagrow"><input type="text" id="f-tag" value="${esc(fd.tag)}" maxlength="10" autocomplete="off" ${e?'readonly':''}>${e?'':'<button type="button" id="f-sug" title="Usar o próximo número livre da frota">Sugerir</button>'}</div>${er('tag')}</div>
  </div>
  ${fd.grupo==='__nova'?`<div class="nova g2"><div class="cp"><label for="f-nfn">Nome da nova frota</label><input type="text" id="f-nfn" value="${esc(fd.nfNome)}" maxlength="40" placeholder="Caminhões pipa">${er('nfNome')}</div><div class="cp"><label for="f-nfp">Prefixo da TAG</label><input type="text" id="f-nfp" value="${esc(fd.nfPrefixo)}" maxlength="4" placeholder="${esc(TIPO[fd.tipo].sigla)}" style="text-transform:uppercase">${er('nfPrefixo')}</div></div>`:''}
  ${fd.tipo==='escavadeira'?`<div class="cp"><span class="lb">Porte</span><div class="seg porte" id="f-porte"><button type="button" data-pt="G" aria-pressed="${fd.porte==='G'}">Grande</button><button type="button" data-pt="P" aria-pressed="${fd.porte==='P'}">Pequena</button></div><span class="dica">Aparece como selo G ou P no card da TV.</span></div>`:''}
  <div class="g2">
    <div class="cp"><label for="f-modelo">Fabricante e modelo</label><input type="text" id="f-modelo" value="${esc(fd.modelo)}" maxlength="40" placeholder="${esc(fr?((Object.values(equip).find(x=>x.grupo===fr.id)||{}).modelo||'CAT 745'):'CAT 745')}">${er('modelo')}</div>
    <div class="cp"><label for="f-area">Área</label><select id="f-area"><option value="">Sem área</option>${[...new Set([...listaAreas(),fd.area].filter(Boolean))].map(a=>`<option${a===fd.area?' selected':''}>${esc(a)}</option>`).join('')}</select>${ehAdmin()?'<button type="button" class="lnk" id="f-areas-ger">Gerenciar áreas</button>':'<span class="dica">As áreas são cadastradas pelo administrador.</span>'}</div>
    <div class="cp"><label for="f-ofi">Oficina responsável</label><select id="f-ofi"><option value="">${oficinas.length?'Escolha a oficina':'Nenhuma oficina cadastrada'}</option>${oficinas.map(o=>`<option value="${esc(o.id)}"${o.id===fd.oficina?' selected':''}>${esc(o.nome)}</option>`).join('')}</select>${er('oficina')}${ehAdmin()?'<button type="button" class="lnk" id="f-ofi-ger">Gerenciar oficinas</button>':'<span class="dica">As oficinas são cadastradas pelo administrador.</span>'}</div>
    <div class="cp"><label for="f-hor">Horímetro atual (h)</label><input type="number" id="f-hor" value="${esc(fd.horimetro)}" min="0" step="1" inputmode="numeric" placeholder="8450">${er('horimetro')}</div>
    <div class="cp"><label for="f-ano">Ano de fabricação</label><input type="number" id="f-ano" value="${esc(fd.ano)}" min="1980" max="2030" step="1" inputmode="numeric" placeholder="2021">${er('ano')}</div>
    <div class="cp"><span class="lb">Painel da TV</span><label class="sw" for="f-ativo"><input type="checkbox" id="f-ativo"${fd.ativo?' checked':''}><span id="f-ativo-t">${fd.ativo?'Aparece no painel':'Fora do painel (vendido, parado longo prazo)'}</span></label></div>
  </div>
  <div class="prev"><button type="button" class="eq" data-st="operando" tabindex="-1" aria-hidden="true"><span class="eq-top"><span class="eq-tag" id="pv-tag">${esc(fd.tag||'—')}</span>${fd.tipo==='escavadeira'&&fd.porte?`<span class="eq-porte">${esc(fd.porte)}</span>`:''}</span><svg class="eq-ico" viewBox="0 0 120 70" aria-hidden="true"><use href="#i-${fd.tipo}"/></svg><span class="eq-st"><span class="eq-rot">Operando</span></span></button><p>Assim o equipamento aparece na TV, dentro do grupo <b style="color:var(--text)">${esc(fd.grupo==='__nova'?(fd.nfNome||'nova frota'):(fr||{}).nome||'')}</b>. Quando a operação abrir uma parada, o ícone muda de cor.</p></div>
  <div class="fbar">
    <button type="button" class="salvar" id="f-salvar">${e?'Salvar alterações':'Cadastrar equipamento'}</button>
    <button type="button" class="ghost" id="f-cancel">${e?'Fechar':'Limpar'}</button>
    <span class="sp"></span>
    ${e?`<button type="button" class="rm${confRm?' conf':''}" id="f-rm">${confRm?'Confirmar remoção de '+esc(e.tag):'Remover'}</button>`:''}
  </div>
  ${errs.geral?`<p class="erro">${esc(errs.geral)}</p>`:''}`;
}

function lerForm(){
  const v=id=>{const el=document.getElementById(id);return el?el.value:undefined};
  if(v('f-tag')!==undefined&&!editando){const t=v('f-tag').toUpperCase().trim();if(t!==fd.tag){fd.tag=t;}}
  if(v('f-nfn')!==undefined)fd.nfNome=v('f-nfn');
  if(v('f-nfp')!==undefined)fd.nfPrefixo=v('f-nfp').toUpperCase().replace(/[^A-Z]/g,'');
  fd.modelo=v('f-modelo')??fd.modelo;fd.area=v('f-area')??fd.area;fd.oficina=v('f-ofi')??fd.oficina;fd.horimetro=v('f-hor')??fd.horimetro;fd.ano=v('f-ano')??fd.ano;fd.serie=v('f-serie')??fd.serie;
  const at=document.getElementById('f-ativo');if(at)fd.ativo=at.checked;
}

$('#cad-form').addEventListener('input',ev=>{
  const id=ev.target.id;
  if(id==='f-tag'){fd.tagManual=true;ev.target.value=ev.target.value.toUpperCase();fd.tag=ev.target.value.trim();const p=$('#pv-tag');if(p)p.textContent=fd.tag||'—';return;}
  if(id==='f-nfp'){lerForm();if(!fd.tagManual){fd.tag=sugerirTag();$('#f-tag').value=fd.tag;$('#pv-tag').textContent=fd.tag;}return;}
  if(id==='f-ativo'){fd.ativo=ev.target.checked;$('#f-ativo-t').textContent=fd.ativo?'Aparece no painel':'Fora do painel (vendido, parado longo prazo)';return;}
});
$('#cad-form').addEventListener('change',ev=>{
  if(ev.target.id==='f-grupo'){lerForm();fd.grupo=ev.target.value;const f=frotaDe(fd.grupo);if(f&&fd.tipo==='escavadeira')fd.porte=f.porte||fd.porte;if(!fd.tagManual||!editando){if(!editando){fd.tagManual=false;fd.tag=sugerirTag();}}renderForm();}
});
$('#cad-form').addEventListener('click',async ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.tp&&!editando){lerForm();const fs=frotasDoTipo(b.dataset.tp);fd.tipo=b.dataset.tp;fd.grupo=fs[0]?fs[0].id:'__nova';fd.porte=fs[0]?fs[0].porte||'':'';fd.tagManual=false;fd.tag=sugerirTag();errs={};renderForm();return;}
  if(b.dataset.pt){lerForm();fd.porte=b.dataset.pt;const alvo=frotasDoTipo('escavadeira').find(f=>f.porte===fd.porte);if(alvo&&!editando){fd.grupo=alvo.id;fd.tagManual=false;fd.tag=sugerirTag();}renderForm();return;}
  if(b.id==='f-sug'){lerForm();fd.tagManual=false;fd.tag=sugerirTag();renderForm();return;}
  if(b.id==='f-cancel'){novo();renderLista();return;}
  if(b.id==='f-salvar'){salvar();return;}
  if(b.id==='f-rm'){remover();return;}
});

function validar(){
  const e={};
  if(!editando){
    if(!fd.tag)e.tag='Informe a TAG.';
    else if(!/^[A-Z0-9]{1,5}-[0-9]{1,4}$/.test(fd.tag))e.tag='Use o formato PREFIXO-NÚMERO, como ADT-11.';
    else if(equip[fd.tag])e.tag=`${fd.tag} já está cadastrado.`;
  }
  if(fd.grupo==='__nova'){
    if(!fd.nfNome.trim())e.nfNome='Dê um nome para a frota.';
    else if(frotas.some(f=>f.nome.toLowerCase()===fd.nfNome.trim().toLowerCase()))e.nfNome='Já existe uma frota com esse nome.';
    if(!/^[A-Z]{1,4}$/.test(fd.nfPrefixo))e.nfPrefixo='Use de 1 a 4 letras.';
  }
  if(!fd.modelo.trim())e.modelo='Informe fabricante e modelo.';
  if(oficinas.length&&!oficinaPorId(fd.oficina))e.oficina='Escolha a oficina responsável.';
  if(fd.horimetro!==''&&(isNaN(Number(fd.horimetro))||Number(fd.horimetro)<0))e.horimetro='Horímetro inválido.';
  if(fd.ano!==''&&(Number(fd.ano)<1980||Number(fd.ano)>2030))e.ano='Ano fora do intervalo.';
  return e;
}

async function salvar(){
  if(salvando)return;
  lerForm();errs=validar();
  if(Object.keys(errs).length){renderForm();return;}
  let grupo=fd.grupo,novasFrotas=null;
  if(grupo==='__nova'){
    const id=fd.nfNome.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24)+'-'+Date.now().toString(36).slice(-4);
    novasFrotas=[...frotas,{id,nome:fd.nfNome.trim(),prefixo:fd.nfPrefixo,tipo:fd.tipo,porte:fd.tipo==='escavadeira'?fd.porte:''}];
    grupo=id;
  }
  const tag=editando||fd.tag;
  const base=editando?equip[editando]:{status:'operando',motivo:'',obs:'',tecnico:'',desde:Date.now(),inicioParada:0};
  const doc={...base,tag,grupo,tipo:fd.tipo,porte:fd.tipo==='escavadeira'?fd.porte:'',modelo:fd.modelo.trim(),area:fd.area.trim(),oficina:fd.oficina||'',horimetro:fd.horimetro===''?'':Number(fd.horimetro),ano:fd.ano===''?'':Number(fd.ano),serie:fd.serie.trim(),ativo:fd.ativo};
  const eraNovo=!editando;
  salvando=true;
  try{
    if(mode==='db'&&db){
      if(novasFrotas)await db.doc('config/frotas').set({lista:novasFrotas});
      await db.doc('equipamentos/'+tag).set(doc);
      if(novasFrotas)frotas=novasFrotas;
      equip[tag]=doc;
    }else{
      if(novasFrotas)frotas=novasFrotas;
      equip[tag]=doc;
    }
  }catch(err){errs={geral:err&&err.code==='invalid_argument'?'Seu acesso não permite alterar o cadastro.':'Não foi possível salvar. Tente de novo.'};salvando=false;renderForm();return;}
  salvando=false;
  toast({tag,status:'operando',acao:eraNovo?'Equipamento cadastrado':'Cadastro atualizado',por:'Cadastro',detalhe:doc.modelo+(doc.ativo?'':' · fora do painel'),t:Date.now()});
  editando=tag;errs={};confRm=false;fd=fdDe(doc);
  render();renderForm();
}

async function remover(){
  const e=equip[editando];if(!e)return;
  if(e.status!=='operando'){errs={geral:'Este equipamento está parado. Feche a parada antes de remover, ou desligue "Painel da TV".'};renderForm();return;}
  if(!confRm){confRm=true;renderForm();return;}
  const tag=editando;
  try{
    if(mode==='db'&&db)await db.doc('equipamentos/'+tag).delete();
    delete equip[tag];
  }catch(err){errs={geral:'Não foi possível remover. Tente de novo.'};renderForm();return;}
  toast({tag,status:'aguardando',acao:'Equipamento removido',por:'Cadastro',t:Date.now()});
  novo();render();
}

$('#biblio').addEventListener('click',ev=>{const b=ev.target.closest('[data-tipo]');if(!b)return;filtroTipo=filtroTipo===b.dataset.tipo?'':b.dataset.tipo;renderCad();if(!editando){novoFd(filtroTipo||fd.tipo);renderForm();}});
$('#busca').addEventListener('input',ev=>{busca=ev.target.value;renderLista();});
$('#cad-tab').addEventListener('click',ev=>{const b=ev.target.closest('[data-tag]');if(b)editar(b.dataset.tag);});
$('#novo').addEventListener('click',()=>{novo();renderLista();$('#cad-form').scrollIntoView({behavior:'smooth',block:'start'});});

/* ---------- QR code de acesso ---------- */
const LINK_PADRAO=location.origin+'/';
let qrFixo=false;try{qrFixo=localStorage.getItem('qp-qrfixo')==='1'}catch(e){}
function linkAtual(){return (opcoes.link||'').trim()||LINK_PADRAO;}
function matrizQR(txt){
  if(typeof qrcode!=='function')return null;
  try{const q=qrcode(0,'M');q.addData(txt,'Byte');q.make();const n=q.getModuleCount(),m=[];for(let r=0;r<n;r++){const row=[];for(let c=0;c<n;c++)row.push(q.isDark(r,c));m.push(row);}return m;}
  catch(e){return null;}
}
function desenharQR(canvas,txt,px){
  const m=matrizQR(txt),ctx=canvas.getContext('2d');
  canvas.width=px;canvas.height=px;ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,px,px);
  if(!m)return false;
  const n=m.length,q=4,cel=px/(n+q*2);ctx.fillStyle='#0B0F12';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(m[r][c])ctx.fillRect(Math.floor((c+q)*cel),Math.floor((r+q)*cel),Math.ceil(cel),Math.ceil(cel));
  return true;
}
function qrBlob(px){return new Promise(res=>{const c=document.createElement('canvas');desenharQR(c,linkAtual(),px||1024);c.toBlob(b=>res(b),'image/png');});}

const HN=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function pdfTxt(s){let o='';for(const ch of s){let c=ch.charCodeAt(0);if(ch==='•')c=149;else if(ch==='—')c=151;else if(ch==='–')c=150;else if(c>255)c=63;const x=String.fromCharCode(c);o+=(x==='('||x===')'||x==='\\')?'\\'+x:x;}return o;}
function largura(s,bold,size){let w=0;const t=bold?HB:HN;for(const ch of s){const b=ch.normalize('NFD')[0].charCodeAt(0);w+=b>=32&&b<=126?t[b-32]:(ch==='•'?350:ch==='·'?278:ch==='×'?584:556);}return w*size/1000;}
function gerarPDF(url){
  const en=LANG==='en',W=595.28,H=841.89,ops=[];let annot=null;
  const txt=(s,size,bold,y,cor)=>{const x=(W-largura(s,bold,size))/2;ops.push(`${cor||'0.043 0.059 0.071'} rg BT /${bold?'F2':'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfTxt(s)}) Tj ET`);return x;};
  ops.push('0.043 0.059 0.071 rg 0 '+(H-14)+' '+W+' 14 re f');
  const bx=W/2-27;[[0.322,0.722,0.525,14],[0.949,0.608,0.141,24],[0.949,0.286,0.243,34]].forEach(([r,g,b,h],i)=>ops.push(`${r} ${g} ${b} rg ${(bx+i*20).toFixed(2)} ${(H-110).toFixed(2)} 14 ${h} re f`));
  txt(en?'Downtime Board':'Quadro de Paradas',32,true,H-160);
  txt(en?'Operations × Maintenance':'Operação × Manutenção',14,false,H-184,'0.36 0.40 0.44');
  txt(en?'Access from your phone':'Acesse pelo celular',20,true,H-236);
  const m=matrizQR(url),lado=330,x0=(W-lado)/2,y0=H-600;
  ops.push(`0.85 0.87 0.89 rg ${(x0-12).toFixed(2)} ${(y0-12).toFixed(2)} ${lado+24} ${lado+24} re f 1 1 1 rg ${(x0-10).toFixed(2)} ${(y0-10).toFixed(2)} ${lado+20} ${lado+20} re f`);
  if(m){const n=m.length,cel=lado/n;ops.push('0.043 0.059 0.071 rg');
    for(let r=0;r<n;r++){let c=0;while(c<n){if(!m[r][c]){c++;continue;}let e=c;while(e<n&&m[r][e])e++;ops.push(`${(x0+c*cel).toFixed(3)} ${(y0+lado-(r+1)*cel).toFixed(3)} ${((e-c)*cel).toFixed(3)} ${cel.toFixed(3)} re`);c=e;}}
    ops.push('f');}
  txt(en?'Point your phone camera at the code':'Aponte a câmera do celular para o código',15,true,y0-52);
  const passos=en?['1  Open the camera','2  Point it at the code','3  Sign in with your name and PIN']:['1  Abra a câmera','2  Aponte para o código','3  Entre com seu nome e PIN'];
  txt(passos.join('     '),12,false,y0-78,'0.30 0.34 0.38');
  txt(en?'Or type the address:':'Ou digite o endereço:',11,false,y0-126,'0.36 0.40 0.44');
  let us=url;while(largura(us,false,11)>W-80&&us.length>10)us=us.slice(0,-1);if(us!==url)us=us.slice(0,-1)+'…';
  const ux=txt(us,11,false,y0-146,'0.10 0.36 0.66');annot=[ux,y0-150,W-ux,y0-134];
  ops.push(`0.85 0.87 0.89 rg 60 60 ${W-120} 0.8 re f`);
  txt(en?'Print and post it next to the TVs and in the maintenance shop.':'Imprima e fixe perto das TVs e na oficina.',10,false,42,'0.45 0.49 0.53');
  const stream=ops.join('\n');
  const objs=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R /Annots [7 0 R] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Annot /Subtype /Link /Rect [${annot.map(v=>v.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${pdfTxt(url)}) >> >>`
  ];
  let out='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const off=[];
  objs.forEach((o,i)=>{off.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=out.length;
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  out+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes=new Uint8Array(out.length);for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;
  return bytes;
}

function abrirQR(){$('#qr').hidden=false;renderQR();}
function fecharQR(){$('#qr').hidden=true;}
function qrStatus(msg,ok){const el=$('#qr-st');if(!el)return;el.textContent=msg;el.className='qr-st'+(ok?' ok':' er');clearTimeout(qrStatus.t);qrStatus.t=setTimeout(()=>{el.textContent='';},5000);}
function msgCompartilhar(){return (LANG==='en'?'Access the Downtime Board: ':'Acesse o Quadro de Paradas: ')+linkAtual();}
function renderQR(){
  const url=linkAtual();
  $('#qr-dlg').innerHTML=`<div class="d-h lh"><div><h2 id="qr-t">Acesso pelo celular</h2><p>Aponte a câmera do celular para o código.</p></div><button type="button" class="x" data-q="fechar" aria-label="Fechar">×</button></div>
    <div class="qr-corpo">
      <div class="qr-img"><canvas id="qr-cv" width="280" height="280" role="img" aria-label="QR code do link de acesso"></canvas></div>
      <div class="qr-info">
        <span class="lb">Link de acesso</span>
        <div class="qr-link"><code id="qr-url">${esc(url)}</code></div>
        <div class="qr-bts">
          <button type="button" data-q="link"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg><span>Copiar link</span></button>
          <button type="button" data-q="img"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><path d="M9 9h2v2M13 9v5M9 13h2"/></svg><span>Copiar QR code</span></button>
          <button type="button" data-q="pdf" class="pri"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"/></svg><span>Baixar PDF</span></button>
          <button type="button" data-q="png"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"/></svg><span>Baixar imagem</span></button>
          <a class="wa" href="https://wa.me/?text=${encodeURIComponent(msgCompartilhar())}" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 13.5l.8-2.6A5.7 5.7 0 1 1 5.4 13z"/><path d="M6 6c.3 1.6 1.4 2.8 3 3.2l.9-.8 1.3.6"/></svg><span>Enviar no WhatsApp</span></a>
          <button type="button" data-q="msg"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 3.5h12v8H6l-3 2.5v-2.5H2z"/></svg><span>Copiar mensagem</span></button>
        </div>
        <p class="qr-st" id="qr-st" role="status"></p>
        <p class="dica">O PDF sai pronto para imprimir e fixar perto das TVs e na oficina. Para deixar o código sempre visível no painel, ligue "QR code fixo no painel" em Configurações.</p>
      </div>
    </div>`;
  if(!desenharQR($('#qr-cv'),url,560))qrStatus('Não foi possível gerar o QR code. Verifique a conexão e recarregue a página.');
}
async function copiarTexto(t,okMsg){
  try{await navigator.clipboard.writeText(t);qrStatus(okMsg,true);}
  catch(e){const el=$('#qr-url');const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);qrStatus('Selecionei o link. Use Ctrl+C para copiar.');}
}
async function salvarArquivo(nome,data){
  let dl=null;dl=window.dt.downloads;
  if(!dl){qrStatus('Download indisponível nesta tela.');return;}
  try{await dl.save({filename:nome,data});qrStatus('Arquivo pronto.',true);}
  catch(e){if(e&&e.code==='declined')return;qrStatus(e&&e.code==='rate_limited'?'Já existe um download aguardando confirmação.':'Não foi possível baixar o arquivo.');}
}
$('#qr-dlg').addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-q]');if(!b)return;
  const q=b.dataset.q;
  if(q==='fechar')return fecharQR();
  if(q==='link')return copiarTexto(linkAtual(),'Link copiado.');
  if(q==='msg')return copiarTexto(msgCompartilhar(),'Mensagem copiada. Cole no WhatsApp, Teams ou e-mail.');
  if(q==='img'){
    try{if(!window.ClipboardItem)throw 0;await navigator.clipboard.write([new ClipboardItem({'image/png':qrBlob(1024)})]);qrStatus('QR code copiado como imagem.',true);}
    catch(e){qrStatus('Este navegador não deixou copiar a imagem. Use Baixar imagem.');}
    return;
  }
  if(q==='png'){const bl=await qrBlob(1024);return salvarArquivo(LANG==='en'?'downtime-board-qr.png':'quadro-de-paradas-qr.png',bl);}
  if(q==='pdf'){if(!matrizQR(linkAtual())){qrStatus('Não foi possível gerar o QR code.');return;}return salvarArquivo(LANG==='en'?'downtime-board-qr.pdf':'quadro-de-paradas-qr.pdf',gerarPDF(linkAtual()));}
});
$('#qr').addEventListener('click',e=>{if(e.target.id==='qr')fecharQR();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#qr').hidden)fecharQR();});
$('#bt-qr').addEventListener('click',abrirQR);
$('#qrfix').addEventListener('click',abrirQR);
function renderQRFixo(){
  const el=$('#qrfix');if(el.hidden===qrFixo)agendarAjuste();el.hidden=!qrFixo;
  if(qrFixo){const url=linkAtual();if(el.dataset.url!==url){desenharQR($('#qrfix-cv'),url,360);el.dataset.url=url;}}
}
$('#c-qrfixo').addEventListener('change',e=>{qrFixo=e.target.checked;try{localStorage.setItem('qp-qrfixo',qrFixo?'1':'0')}catch(err){}renderQRFixo();render();renderCfg();const st=$('#c-lang-st');if(st){st.textContent='Salvo neste aparelho';st.className='cfg-st ok';setTimeout(()=>{st.textContent='';},3000);}});
$('#c-link').addEventListener('change',e=>{
  const v=e.target.value.trim();
  if(v&&!/^https?:\/\/\S+$/i.test(v)){const st=$('#c-st');st.className='cfg-st';st.style.color='var(--s-wait)';st.textContent='Use um endereço completo, começando com http:// ou https://';return;}
  salvarOpcoes({link:v});
});

/* ---------- Dados e exportação (administrador) ---------- */
const TABELAS=['Paradas','Etapas','Correcoes','Pecas','Equipamentos','Usuarios'];
const NOME_TAB={Paradas:'Paradas',Etapas:'Etapas',Correcoes:'Correções',Pecas:'Peças',Equipamentos:'Equipamentos',Usuarios:'Usuários'};
let dDe='',dAte='',dTab='Paradas',dCache=null,dCarregando=false,pqInfo=null,pqTab='paradas',pqConfChave=false;
function ehAdmin(){return perfilAtual()==='admin';}
function podeCriarAdmin(){return ehAdmin()||!temUsuarios();}
function isoDia(ms){const d=new Date(ms);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function horas(ms){return Math.round(ms/36000)/100;}
async function carregarParadas(){
  const de=dDe?new Date(dDe+'T00:00').getTime():null,ate=dAte?new Date(dAte+'T23:59:59').getTime():null;
  let lista;
  try{lista=await window.dt.paradasPeriodo(de,ate);}catch(e){lista=Object.values(paradas).map(clone);}
  const ids=new Set(lista.map(p=>p.id));
  for(const e of Object.values(equip)){if(e.status!=='operando'){const p=e.paradaId&&paradas[e.paradaId]?paradas[e.paradaId]:paradaNova(e);if(!ids.has(p.id)){lista.push(clone(p));ids.add(p.id);}}}
  return lista;
}
function montarTabelas(lista){
  const now=Date.now(),de=dDe?new Date(dDe+'T00:00').getTime():-Infinity,ate=dAte?new Date(dAte+'T23:59:59').getTime():Infinity;
  const ps=lista.filter(p=>p.inicio>=de&&p.inicio<=ate).sort((a,b)=>b.inicio-a.inicio);
  const eqInfo=tag=>{const e=equip[tag]||{};return {frota:(frotaDe(e.grupo)||{}).nome||'',tipo:(TIPO[e.tipo]||{}).nome||''};};
  const T={};
  T.Paradas={cols:['ID','Nº','TAG','Oficina','Frota','Tipo','Motivo','Observação','Início','Fim','Duração (h)','Situação','Técnico','Horímetro início','Horímetro fim','Correções','Responsáveis'],tipos:['s','n','s','s','s','s','s','s','d','d','n','s','s','n','n','n','s'],
    rows:ps.map(p=>{const i=eqInfo(p.tag);return [p.id,p.numero??null,p.tag,nomeOficina(p.oficina||(equip[p.tag]||{}).oficina),i.frota,i.tipo,p.motivo||'',p.obs||'',p.inicio,p.fim||null,horas((p.cancelada?(p.fim||now):(p.fim||now))-p.inicio),p.cancelada?'Cancelada':(p.fim?'Encerrada':'Em andamento'),p.tecnico||'',p.horIni??null,p.horFim??null,(p.correcoes||[]).length,(p.responsaveis||[]).map(r=>r.tecnico).join(' → ')||p.tecnico||''];})};
  const et=[];
  for(const p of ps){const es=(p.etapas||[]).slice().sort((a,b)=>a.t-b.t);es.forEach((s,k)=>{if(s.status==='operando')return;const fim=k+1<es.length?es[k+1].t:(p.fim||null);et.push([p.id,p.tag,(ST[s.status]||{rot:s.status}).rot,s.t,fim,horas((fim||now)-s.t),s.por||'',p.cancelada?'Sim':'Não']);});}
  T.Etapas={cols:['Parada','TAG','Etapa','Início','Fim','Duração (h)','Registrado por','Parada cancelada'],tipos:['s','s','s','d','d','n','s','s'],rows:et};
  const co=[];for(const p of ps)for(const c of p.correcoes||[])co.push([p.id,p.tag,c.t,c.por||'',c.campo||'',String(c.de??''),String(c.para??''),c.just||'']);
  T.Correcoes={cols:['Parada','TAG','Data','Por','Campo','De','Para','Justificativa'],tipos:['s','s','d','s','s','s','s','s'],rows:co.sort((a,b)=>b[2]-a[2])};
  const pk=(typeof pecas==='object'?Object.values(pecas):[]).filter(i=>(i.criadoEm||0)>=de&&(i.criadoEm||0)<=ate).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  T.Pecas={cols:['Parada nº','TAG','Peça','Código','Quantidade','Solicitada em','Solicitada por','Ordem de compra','Chegou em','Recebida por','Situação'],tipos:['n','s','s','s','n','d','s','s','d','s','s'],
    rows:pk.map(i=>[i.numero??null,i.tag||'',i.descricao||'',i.codigo||'',i.qtd??null,i.criadoEm||null,i.criadoPor||'',i.oc||'',i.chegou?i.chegouEm||null:null,i.chegouPor||'',i.cancelada?'Cancelada':i.chegou?'Chegou':i.oc?'Com ordem de compra':'Aguardando ordem de compra'])};
  T.Equipamentos={cols:['TAG','Oficina','Frota','Tipo','Porte','Modelo','Área','Ano','Horímetro','Situação atual','No painel'],tipos:['s','s','s','s','s','s','s','n','n','s','s'],
    rows:Object.values(equip).sort((a,b)=>cmpTag(a.tag,b.tag)).map(e=>{const i=eqInfo(e.tag);return [e.tag,nomeOficina(e.oficina),i.frota,i.tipo,e.porte||'',e.modelo||'',e.area||'',e.ano===''?null:e.ano??null,e.horimetro===''?null:e.horimetro??null,(ST[e.status]||{rot:e.status}).rot,e.ativo===false?'Não':'Sim'];})};
  T.Usuarios={cols:['Matrícula','Nome','Nome curto','Perfil','Oficina','Ativo'],tipos:['s','s','s','s','s','s'],
    rows:Object.values(usuarios).sort((a,b)=>a.nome.localeCompare(b.nome)).map(u=>[u.matricula,u.nome,u.curto,(PERFIS[u.perfil]||{nome:u.perfil}).nome,nomeOficina(u.oficina),u.ativo===false?'Não':'Sim'])};
  return T;
}

/* planilha .xlsx mínima (zip sem compressão) */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipStore(files){
  const enc=new TextEncoder(),partes=[],central=[];let off=0;
  const d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  for(const f of files){
    const nome=enc.encode(f.nome),dados=typeof f.dados==='string'?enc.encode(f.dados):f.dados,crc=crc32(dados);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);
    h.setUint32(14,crc,true);h.setUint32(18,dados.length,true);h.setUint32(22,dados.length,true);h.setUint16(26,nome.length,true);h.setUint16(28,0,true);
    partes.push(new Uint8Array(h.buffer),nome,dados);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dt,true);c.setUint16(14,dd,true);
    c.setUint32(16,crc,true);c.setUint32(20,dados.length,true);c.setUint32(24,dados.length,true);c.setUint16(28,nome.length,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),nome);
    off+=30+nome.length+dados.length;
  }
  const tamC=central.reduce((s,x)=>s+x.length,0),fim=new DataView(new ArrayBuffer(22));
  fim.setUint32(0,0x06054b50,true);fim.setUint16(8,files.length,true);fim.setUint16(10,files.length,true);fim.setUint32(12,tamC,true);fim.setUint32(16,off,true);
  const todos=[...partes,...central,new Uint8Array(fim.buffer)],tot=todos.reduce((s,x)=>s+x.length,0),out=new Uint8Array(tot);let p=0;for(const x of todos){out.set(x,p);p+=x.length;}
  return out;
}
function xmlEsc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');}
function colL(i){let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
function serialExcel(ms){return (ms-new Date(ms).getTimezoneOffset()*60000)/86400000+25569;}
function planilhaXml(t){
  const larg=t.cols.map((c,i)=>Math.min(48,Math.max(c.length+2,...t.rows.slice(0,200).map(r=>t.tipos[i]==='d'?17:String(r[i]??'').length+2))));
  let x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+larg.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols><sheetData>';
  x+='<row r="1">'+t.cols.map((c,i)=>`<c r="${colL(i)}1" t="inlineStr" s="1"><is><t>${xmlEsc(c)}</t></is></c>`).join('')+'</row>';
  t.rows.forEach((r,k)=>{const n=k+2;x+=`<row r="${n}">`;r.forEach((v,i)=>{if(v==null||v==='')return;const ref=colL(i)+n,tp=t.tipos[i];
    if(tp==='d')x+=`<c r="${ref}" s="2"><v>${serialExcel(v)}</v></c>`;else if(tp==='n'&&isFinite(Number(v)))x+=`<c r="${ref}"><v>${Number(v)}</v></c>`;else x+=`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;});x+='</row>';});
  return x+'</sheetData></worksheet>';
}
function gerarXlsx(T){
  const nomes=TABELAS;
  const files=[
    {nome:'[Content_Types].xml',dados:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+nomes.map((n,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>'},
    {nome:'_rels/.rels',dados:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {nome:'xl/workbook.xml',dados:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+nomes.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>'},
    {nome:'xl/_rels/workbook.xml.rels',dados:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+nomes.map((n,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${nomes.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {nome:'xl/styles.xml',dados:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
    ...nomes.map((n,i)=>({nome:`xl/worksheets/sheet${i+1}.xml`,dados:planilhaXml(T[n])}))
  ];
  return zipStore(files);
}
function gerarCsv(t){
  const dec=LANG==='en'?'.':',',sep=LANG==='en'?',':';';
  const cel=(v,tp)=>{if(v==null||v==='')return '';if(tp==='d'){const d=new Date(v);return isoDia(v)+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());}if(tp==='n')return String(v).replace('.',dec);const s=String(v);return /[";,\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return '\uFEFF'+[t.cols.map(c=>cel(c,'s')).join(sep),...t.rows.map(r=>r.map((v,i)=>cel(v,t.tipos[i])).join(sep))].join('\r\n');
}
async function renderPQ(recarregar){
  if(recarregar||!pqInfo){try{pqInfo=await window.dt.relatorios();}catch(e){pqInfo=null;}}
  const t=pqInfo&&pqInfo.tabelas.find(x=>x.nome===pqTab);
  $('#d-pq-tab').value=pqTab;
  $('#d-m-tab').textContent=$('#d-pq-tab').selectedOptions[0].textContent;
  $('#d-m').textContent=t?t.m:'Não foi possível carregar. Verifique a conexão e clique em Atualizar.';
  $('#d-link').value=t?t.url:'';
  const bc=$('#d-chave');bc.hidden=!pqInfo||pqInfo.fixa;
  bc.textContent=pqConfChave?'Confirmar: gerar nova chave (as consultas atuais param de funcionar)':'Gerar nova chave';
}

async function renderDados(recarregar){
  if(!ehAdmin())return;
  if(!dDe){dDe=isoDia(Date.now()-30*86400000);dAte=isoDia(Date.now());}
  $('#d-de').value=dDe;$('#d-ate').value=dAte;
  if(recarregar||!dCache){dCarregando=true;$('#d-resumo').innerHTML='<p class="vazio">Carregando dados…</p>';dCache=await carregarParadas();dCarregando=false;}
  const T=montarTabelas(dCache);
  const ab=T.Paradas.rows.filter(r=>r[11]==='Em andamento').length,enc=T.Paradas.rows.filter(r=>r[11]==='Encerrada'),mttr=enc.length?(enc.reduce((s,r)=>s+r[10],0)/enc.length):null;
  $('#d-resumo').innerHTML=[['Paradas no período',T.Paradas.rows.length],['Em andamento',ab],['Tempo médio de parada',mttr==null?'—':String(Math.round(mttr*10)/10).replace('.',LANG==='en'?'.':',')+' h'],['Etapas',T.Etapas.rows.length],['Correções',T.Correcoes.rows.length],['Equipamentos',T.Equipamentos.rows.length]]
    .map(([l,v])=>`<div class="k"><div class="k-l">${esc(l)}</div><div class="k-v">${esc(v)}</div></div>`).join('');
  $('#d-tabs').innerHTML=TABELAS.map(n=>`<button type="button" data-dt="${n}" aria-pressed="${dTab===n}">${esc(NOME_TAB[n])} <span>${T[n].rows.length}</span></button>`).join('');
  const t=T[dTab],fmt=(v,tp)=>v==null||v===''?'<span class="nulo">—</span>':tp==='d'?esc(dataHora(v)):tp==='n'?esc(String(v).replace('.',LANG==='en'?'.':',')):esc(v);
  $('#d-prev').innerHTML=`<table><thead><tr>${t.cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0,12).map(r=>`<tr>${r.map((v,i)=>`<td class="${t.tipos[i]}">${fmt(v,t.tipos[i])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${t.cols.length}" class="vazio">Nenhum registro no período.</td></tr>`}</tbody></table>`;
  $('#d-prev-n').textContent=t.rows.length>12?`Mostrando 12 de ${t.rows.length} linhas`:`${t.rows.length} linhas`;
  if(recarregar||!pqInfo)renderPQ(recarregar);
  if(recarregar)atualizarPreviaRetrato();
}
function dStatus(msg,ok){const el=$('#d-st');el.textContent=msg;el.className='qr-st'+(ok?' ok':' er');clearTimeout(dStatus.t);dStatus.t=setTimeout(()=>{el.textContent='';},6000);}
async function dSalvar(nome,data){
  let dl=null;dl=window.dt.downloads;
  if(!dl){dStatus('Download indisponível nesta tela.');return;}
  try{await dl.save({filename:nome,data});dStatus('Arquivo pronto.',true);}
  catch(e){if(e&&e.code==='declined')return;dStatus(e&&e.code==='rate_limited'?'Já existe um download aguardando confirmação.':'Não foi possível baixar o arquivo.');}
}
$('#v-dados').addEventListener('click',async ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.dt){dTab=b.dataset.dt;renderDados();return;}
  if(b.id==='d-xlsx'){if(!dCache)await renderDados(true);return dSalvar('quadro-de-paradas-dados.xlsx',gerarXlsx(montarTabelas(dCache)));}
  if(b.id==='d-csv'){if(!dCache)await renderDados(true);return dSalvar('quadro-de-paradas-'+dTab.toLowerCase()+'.csv',gerarCsv(montarTabelas(dCache)[dTab]));}
  if(b.id==='d-atual'){await renderDados(true);dStatus('Dados atualizados.',true);return;}
  if(b.id==='d-chave'){
    if(!pqConfChave){pqConfChave=true;renderPQ();return;}
    pqConfChave=false;
    try{await window.dt.novaChaveRelatorios();await renderPQ(true);dStatus('Nova chave gerada. Atualize o código das consultas no Excel.',true);}
    catch(e){renderPQ();dStatus('Não foi possível gerar a nova chave.');}
    return;
  }
  if(b.id==='d-copiar'){const t=$('#d-m').textContent;try{await navigator.clipboard.writeText(t);dStatus('Código copiado. Cole no Editor Avançado do Power Query.',true);}catch(e){const r=document.createRange();r.selectNodeContents($('#d-m'));const s=getSelection();s.removeAllRanges();s.addRange(r);dStatus('Código selecionado. Use Ctrl+C para copiar.');}}
});
$('#v-dados').addEventListener('change',ev=>{
  if(ev.target.id==='d-de'){dDe=ev.target.value;renderDados(true);}
  if(ev.target.id==='d-ate'){dAte=ev.target.value;renderDados(true);}
  if(ev.target.id==='d-pq-tab'){pqTab=ev.target.value;pqConfChave=false;renderPQ();}
});

/* ---------- Retrato do painel em JPEG 16:9 ---------- */
function tt(s){return LANG==='en'&&typeof tr==='function'?tr(s):s;}
function coresTema(){const cs=getComputedStyle(document.documentElement),g=n=>cs.getPropertyValue(n).trim();
  return {bg:g('--bg'),panel:g('--panel'),panel2:g('--panel-2'),line:g('--line'),line2:g('--line-2'),text:g('--text'),muted:g('--muted'),faint:g('--faint'),tire:g('--tire'),hub:g('--hub'),glass:g('--glass'),ok:g('--s-ok'),okIco:g('--s-ok-ico'),wait:g('--s-wait'),maint:g('--s-maint'),peca:g('--s-peca'),entrega:g('--s-entrega'),receb:g('--s-receb'),lib:g('--s-lib')};}
function corSt(C,st){return {operando:C.ok,aguardando:C.wait,em_manutencao:C.maint,aguardando_peca:C.peca,aguardando_entrega:C.entrega,pecas_recebidas:C.receb,liberado:C.lib}[st]||C.muted;}
function hexRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return [n>>16&255,n>>8&255,n&255];}
function misturar(a,b,t){const A=hexRgb(a),B=hexRgb(b);return 'rgb('+A.map((v,i)=>Math.round(v*t+B[i]*(1-t))).join(',')+')';}
const icoCache={};
function icoImg(tipo,cor,C){
  const k=tipo+'|'+cor;if(icoCache[k])return icoCache[k];
  const sym=document.getElementById('i-'+tipo);
  const inner=(sym?sym.innerHTML:'').replace(/var\(--tire\)/g,C.tire).replace(/var\(--hub\)/g,C.hub).replace(/var\(--glass\)/g,C.glass);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70" width="480" height="280" style="color:${cor}">${inner}</svg>`;
  return icoCache[k]=new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
}
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function corta(ctx,s,w){s=String(s??'');if(ctx.measureText(s).width<=w)return s;while(s.length>1&&ctx.measureText(s+'…').width>w)s=s.slice(0,-1);return s+'…';}
function layoutFrota(est,W,H){
  for(let tw=176;tw>=70;tw-=2){
    const th=Math.round(tw*0.8),gap=8,pad=12,hh=36,gg=12,rows=[];let x=0,y=0,rowH=0,atual=[],ok=true;
    for(const g of est){const n=g.tags.length,cols=colsDe(n),lin=Math.ceil(n/cols),gw=pad*2+cols*tw+(cols-1)*gap,gh=hh+pad+lin*th+(lin-1)*gap;
      if(gw>W){ok=false;break;}
      if(x>0&&x+gw>W){rows.push({itens:atual,y,h:rowH});x=0;y+=rowH+gg;rowH=0;atual=[];}
      atual.push({g,gw,gh,cols,lin});x+=gw+gg;rowH=Math.max(rowH,gh);}
    if(!ok)continue;
    if(atual.length)rows.push({itens:atual,y,h:rowH});
    if(y+rowH>H)continue;
    const pos=[];
    for(const r of rows){const soma=r.itens.reduce((s,i)=>s+i.gw,0),livre=W-(r.itens.length-1)*gg,f=livre/soma;let cx=0;
      for(const i of r.itens){const w=i.gw*f,tw2=(w-pad*2-(i.cols-1)*gap)/i.cols;pos.push({...i,x:cx,y:r.y,w,h:r.h,tw:tw2});cx+=w+gg;}}
    return {th,gap,pad,hh,pos};
  }
  return null;
}
async function desenharRetrato(escala){
  const C=coresTema(),W=1920,H=1080,cv=document.createElement('canvas');cv.width=W*escala;cv.height=H*escala;
  const ctx=cv.getContext('2d');ctx.scale(escala,escala);
  const FD='"Barlow Condensed","Arial Narrow",Arial,sans-serif',FB='Barlow,Arial,sans-serif',FM='"JetBrains Mono",Consolas,monospace';
  try{await Promise.all(['700 30px "Barlow Condensed"','600 30px "Barlow Condensed"','500 16px Barlow','600 16px "JetBrains Mono"'].map(f=>document.fonts.load(f)));}catch(e){}
  const now=Date.now(),est=estrutura(),tags=est.flatMap(x=>x.tags);
  const esp=(o)=>{if('letterSpacing' in ctx)ctx.letterSpacing=o||'0px';};
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  /* cabeçalho */
  [[C.ok,14],[C.maint,22],[C.wait,30]].forEach(([c,h],i)=>{ctx.fillStyle=c;rr(ctx,26+i*11,54-h,7,h,1.5);ctx.fill();});
  ctx.fillStyle=C.text;ctx.font=`700 36px ${FD}`;esp('2px');ctx.fillText(tt('Quadro de Paradas').toUpperCase(),72,52);esp();
  ctx.fillStyle=C.muted;ctx.font=`500 15px ${FB}`;ctx.fillText(tt('Operação × Manutenção · frota de mina'),72,74);
  const d=new Date(now),dia=d.getHours()>=7&&d.getHours()<19;
  ctx.textAlign='right';ctx.fillStyle=C.text;ctx.font=`600 34px ${FM}`;ctx.fillText(pad2(d.getHours())+':'+pad2(d.getMinutes()),W-26,50);
  ctx.fillStyle=C.muted;ctx.font=`500 14px ${FB}`;
  ctx.fillText((LANG==='en'?'Snapshot ':'Retrato de ')+d.toLocaleDateString(LANG==='en'?'en-US':'pt-BR')+' · '+(LANG==='en'?(dia?'Shift A':'Shift B'):(dia?'Turno A':'Turno B')),W-26,74);ctx.textAlign='left';
  /* indicadores */
  const cont={operando:0,aguardando:0,em_manutencao:0,aguardando_peca:0,aguardando_entrega:0,pecas_recebidas:0,liberado:0};tags.forEach(t=>cont[equip[t].status]++);
  const at=ativos(),maior=at.filter(e=>e.status==='aguardando').sort((a,b)=>a.desde-b.desde)[0];
  const ks=[{l:'Disponíveis agora',w:2.1},{l:'Aguardando atendimento',c:C.wait,v:cont.aguardando},{l:'Em manutenção',c:C.maint,v:cont.em_manutencao},{l:'Peças',c:C.peca,v:cont.aguardando_peca+cont.aguardando_entrega+cont.pecas_recebidas},{l:'Liberados p/ operação',c:C.lib,v:cont.liberado},{l:'Maior espera sem atendimento',w:1.6}];
  const tw=ks.reduce((s,k)=>s+(k.w||1),0),kW=W-52-10*(ks.length-1);let kx=26;
  ks.forEach((k,i)=>{const w=kW*(k.w||1)/tw,y=96,h=94;ctx.fillStyle=C.panel;rr(ctx,kx,y,w,h,10);ctx.fill();ctx.strokeStyle=C.line;ctx.lineWidth=1;ctx.stroke();
    ctx.font=`600 11px ${FB}`;esp('.6px');let lx=kx+14;if(k.c){ctx.fillStyle=k.c;rr(ctx,lx,y+15,9,9,2);ctx.fill();lx+=16;}ctx.fillStyle=C.muted;ctx.fillText(corta(ctx,tt(k.l).toUpperCase(),w-40),lx,y+24);esp();
    if(i===0){ctx.fillStyle=C.text;ctx.font=`600 46px ${FD}`;const v=String(cont.operando);ctx.fillText(v,kx+14,y+72);let vx=kx+14+ctx.measureText(v).width;ctx.fillStyle=C.muted;ctx.font=`500 26px ${FD}`;ctx.fillText('/'+tags.length,vx+2,y+72);vx+=ctx.measureText('/'+tags.length).width+14;ctx.fillStyle=C.ok;ctx.font=`600 20px ${FM}`;ctx.fillText(tags.length?Math.round(cont.operando/tags.length*100)+'%':'',vx,y+70);
      const fw=w-28,n=Math.max(tags.length,1),cw=fw/n;tags.forEach((t,j)=>{ctx.fillStyle=corSt(C,equip[t].status)===C.ok?C.okIco:corSt(C,equip[t].status);ctx.globalAlpha=equip[t].status==='operando'?.55:1;ctx.fillRect(kx+14+j*cw,y+80,Math.max(cw-2,1),8);});ctx.globalAlpha=1;}
    else if(i===ks.length-1){if(maior){ctx.fillStyle=C.text;ctx.font=`600 40px ${FD}`;ctx.fillText(maior.tag,kx+14,y+72);const mw=ctx.measureText(maior.tag).width;ctx.fillStyle=C.wait;ctx.font=`600 22px ${FM}`;ctx.fillText(dur(now-maior.desde),kx+26+mw,y+71);}else{ctx.fillStyle=C.faint;ctx.font=`600 34px ${FD}`;ctx.fillText(tt('Nenhuma'),kx+14,y+72);}}
    else{ctx.fillStyle=k.v?C.text:C.faint;ctx.font=`600 46px ${FD}`;ctx.fillText(String(k.v),kx+14,y+74);}
    kx+=w+10;});
  /* frota */
  const FX=26,FY=204,FW=1440,FH=H-FY-34,L=layoutFrota(est,FW,FH);
  const imgs={};await Promise.all(tags.map(async t=>{const e=equip[t],c=e.status==='operando'?C.okIco:corSt(C,e.status);imgs[t]=await icoImg(e.tipo,c,C);}));
  if(L)for(const p of L.pos){
    const gx=FX+p.x,gy=FY+p.y;ctx.fillStyle=C.panel;rr(ctx,gx,gy,p.w,p.gh,10);ctx.fill();ctx.strokeStyle=C.line;ctx.stroke();
    ctx.fillStyle=C.text;ctx.font=`600 17px ${FD}`;esp('1.2px');ctx.fillText(corta(ctx,tt(p.g.f.nome).toUpperCase(),p.w-(p.w>300?130:60)),gx+L.pad,gy+24);esp();
    const ok=p.g.tags.filter(t=>equip[t].status==='operando').length;ctx.textAlign='right';ctx.font=`500 12px ${FM}`;ctx.fillStyle=C.muted;ctx.fillText(ok+'/'+p.g.tags.length+(p.w>300?(LANG==='en'?' operating':' operando'):''),gx+p.w-L.pad,gy+24);ctx.textAlign='left';
    p.g.tags.forEach((t,j)=>{const e=equip[t],c=j%p.cols,r=Math.floor(j/p.cols),x=gx+L.pad+c*(p.tw+L.gap),y=gy+L.hh+r*(L.th+L.gap),w=p.tw,h=L.th,cor=corSt(C,e.status),parado=e.status!=='operando';
      ctx.fillStyle=parado?misturar(cor,C.panel2,.16):C.panel2;rr(ctx,x,y,w,h,7);ctx.fill();ctx.strokeStyle=parado?cor:C.line;ctx.lineWidth=parado?1.5:1;ctx.stroke();ctx.lineWidth=1;
      const ts=Math.max(14,Math.min(30,h*0.2));ctx.fillStyle=C.text;ctx.font=`700 ${ts}px ${FD}`;ctx.fillText(t,x+8,y+6+ts*0.9);
      if(e.porte){const pt=LANG==='en'?(e.porte==='G'?'L':'S'):e.porte;ctx.font=`600 11px ${FD}`;const bw=ctx.measureText(pt).width+8;ctx.strokeStyle=C.line2;rr(ctx,x+w-bw-7,y+8,bw,15,3);ctx.stroke();ctx.fillStyle=C.muted;ctx.fillText(pt,x+w-bw-3,y+19.5);}
      const im=imgs[t],ih=h*(parado?0.36:0.44),iw=Math.min(w-16,ih*120/70),ih2=iw*70/120;if(im)ctx.drawImage(im,x+(w-iw)/2,y+ts+10+(parado?0:2),iw,ih2);
      const ls=Math.max(9,Math.min(12,h*0.085));ctx.font=`600 ${ls}px ${FB}`;esp('.8px');ctx.fillStyle=parado?cor:C.ok;
      if(parado){ctx.fillText(corta(ctx,tt(ST[e.status].curto).toUpperCase(),w-16),x+8,y+h-ls*1.9-6);esp();const ms=Math.max(12,Math.min(20,h*0.14));ctx.fillStyle=C.text;ctx.font=`600 ${ms}px ${FM}`;ctx.fillText(dur(now-e.desde),x+8,y+h-8);}
      else{ctx.fillText(tt('Operando').toUpperCase(),x+8,y+h-9);esp();}
    });
  }
  /* fila */
  const QX=FX+FW+14,QW=W-QX-26,QY=FY,QH=FH;ctx.fillStyle=C.panel;rr(ctx,QX,QY,QW,QH,10);ctx.fill();ctx.strokeStyle=C.line;ctx.stroke();
  const fila=at.filter(e=>e.status!=='operando').sort((a,b)=>(ORDEM_FILA[a.status]-ORDEM_FILA[b.status])||(a.desde-b.desde));
  ctx.fillStyle=C.text;ctx.font=`600 18px ${FD}`;esp('1.2px');ctx.fillText(tt('Fila de atendimento').toUpperCase(),QX+14,QY+28);esp();
  ctx.textAlign='right';ctx.fillStyle=C.muted;ctx.font=`500 12px ${FM}`;ctx.fillText(fila.length?fila.length+(LANG==='en'?' down':' parados'):'',QX+QW-14,QY+28);ctx.textAlign='left';
  const rh=62,maxL=Math.floor((QH-80)/(rh+6));
  if(!fila.length){ctx.fillStyle=C.faint;ctx.font=`500 15px ${FB}`;ctx.fillText(tt('Toda a frota está operando.'),QX+14,QY+62);}
  fila.slice(0,maxL).forEach((e,i)=>{const y=QY+44+i*(rh+6),cor=corSt(C,e.status);ctx.fillStyle=C.panel2;rr(ctx,QX+12,y,QW-24,rh,7);ctx.fill();ctx.fillStyle=cor;rr(ctx,QX+12,y,5,rh,2);ctx.fill();
    ctx.fillStyle=C.text;ctx.font=`700 22px ${FD}`;ctx.fillText(e.tag,QX+26,y+26);const tw2=ctx.measureText(e.tag).width;ctx.fillStyle=cor;ctx.font=`600 11px ${FB}`;esp('.8px');ctx.fillText(tt(ST[e.status].curto).toUpperCase(),QX+34+tw2,y+25);esp();
    ctx.textAlign='right';ctx.fillStyle=C.text;ctx.font=`600 17px ${FM}`;ctx.fillText(dur(now-e.desde),QX+QW-24,y+26);ctx.textAlign='left';
    ctx.fillStyle=C.muted;ctx.font=`500 14px ${FB}`;ctx.fillText(corta(ctx,tt(e.motivo)+(e.obs?' · '+e.obs:'')+(e.tecnico&&e.status!=='aguardando'?' · '+e.tecnico:''),QW-50),QX+26,y+49);});
  if(fila.length>maxL){ctx.fillStyle=C.muted;ctx.font=`500 13px ${FB}`;ctx.fillText('+'+(fila.length-maxL)+(LANG==='en'?' more':' outros'),QX+14,QY+QH-40);}
  let lx=QX+14,ly=QY+QH-44;ctx.font=`500 12px ${FB}`;[['operando','Operando'],['aguardando','Aguardando'],['em_manutencao','Em manutenção'],['aguardando_peca','Peças solic.'],['aguardando_entrega','Aguard. peças'],['pecas_recebidas','Peças receb.'],['liberado','Liberado']].forEach(([s,l])=>{const tx=tt(l),lw=ctx.measureText(tx).width+30;if(lx+lw>QX+QW-10){lx=QX+14;ly+=20;}ctx.fillStyle=corSt(C,s);rr(ctx,lx,ly,10,10,2);ctx.fill();ctx.fillStyle=C.muted;ctx.fillText(tx,lx+15,ly+9);lx+=lw;});
  /* rodapé */
  const u=usuarioAtual();ctx.fillStyle=C.faint;ctx.font=`500 12px ${FB}`;ctx.fillText((LANG==='en'?'Downtime Board · generated by ':'Quadro de Paradas · gerado por ')+(u?u.curto:'—')+' · '+d.toLocaleString(LANG==='en'?'en-US':'pt-BR'),26,H-12);
  return cv;
}
async function atualizarPreviaRetrato(){
  const im=$('#r-prev');if(!im)return;
  try{const cv=await desenharRetrato(1);im.src=cv.toDataURL('image/jpeg',0.85);}catch(e){}
}
async function baixarRetrato(escala){
  const cv=await desenharRetrato(escala);
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));
  const d=new Date(),nome=(LANG==='en'?'downtime-board-':'quadro-de-paradas-')+isoDia(d.getTime())+'-'+pad2(d.getHours())+pad2(d.getMinutes())+(escala>1?'-4k':'')+'.jpg';
  return dSalvarR(nome,blob);
}
async function dSalvarR(nome,data){
  let dl=null;dl=window.dt.downloads;
  const st=$('#r-st'),msg=(t,ok)=>{st.textContent=t;st.className='qr-st'+(ok?' ok':' er');};
  if(!dl){msg('Download indisponível nesta tela.');return;}
  try{await dl.save({filename:nome,data});msg('Imagem pronta.',true);}
  catch(e){if(e&&e.code==='declined')return;msg(e&&e.code==='rate_limited'?'Já existe um download aguardando confirmação.':'Não foi possível baixar o arquivo.');}
}
$('#v-dados').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;if(b.id==='r-hd')baixarRetrato(1);if(b.id==='r-4k')baixarRetrato(2);if(b.id==='r-atual')atualizarPreviaRetrato();});

/* ---------- Áreas (administrador) ---------- */
let areasCfg=null,areasMsg='';
function listaAreas(){
  if(Array.isArray(areasCfg))return areasCfg.slice();
  return [...new Set(Object.values(equip).map(e=>e.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
function contaArea(n){return Object.values(equip).filter(e=>e.area===n).length;}
function abrirAreas(){if(!ehAdmin())return;areasMsg='';$('#areas').hidden=false;renderAreas();}
function fecharAreas(){$('#areas').hidden=true;if(vista==='cadastro'&&fd){lerForm();renderForm();}}
function renderAreas(){
  const l=listaAreas();
  $('#areas-dlg').innerHTML=`<div class="d-h lh"><div><h2 id="areas-t">Áreas</h2><p>Locais onde os equipamentos trabalham. Renomear uma área atualiza todos os equipamentos dela.</p></div><button type="button" class="x" data-a="fechar" aria-label="Fechar">×</button></div>
    <div class="ar-lista">${l.length?l.map((n,i)=>{const c=contaArea(n);return `<div class="ar-row" data-i="${i}"><input type="text" id="ar-${i}" value="${esc(n)}" maxlength="40" aria-label="Nome da área"><span class="ar-n">${c} ${c===1?'equipamento':'equipamentos'}</span><button type="button" data-a="salvar" data-i="${i}">Salvar</button><button type="button" class="rmx" data-a="remover" data-i="${i}"${c?' disabled title="Mova os equipamentos para outra área antes de remover"':''}>Remover</button></div>`;}).join(''):'<p class="vazio">Nenhuma área cadastrada.</p>'}</div>
    <div class="ar-nova"><input type="text" id="ar-novo" maxlength="40" placeholder="Nome da nova área" aria-label="Nova área"><button type="button" class="salvar" data-a="add">Adicionar área</button></div>
    <p class="qr-st${areasMsg.startsWith('!')?' er':' ok'}" id="ar-st" role="status">${esc(areasMsg.replace(/^!/,''))}</p>`;
}
function areaInvalida(n,ignorar){
  if(!n)return 'Informe o nome da área.';
  if(listaAreas().some(a=>a.toLowerCase()===n.toLowerCase()&&a!==ignorar))return 'Já existe uma área com esse nome.';
  return '';
}
async function gravarAreas(lista){
  lista=[...new Set(lista)].sort((a,b)=>a.localeCompare(b));
  if(mode==='db'&&db)await db.doc('config/areas').set({lista});
  areasCfg=lista;
}
async function acaoArea(a,i){
  if(!ehAdmin())return;
  const l=listaAreas();
  try{
    if(a==='add'){
      const n=($('#ar-novo').value||'').trim(),er=areaInvalida(n);
      if(er){areasMsg='!'+er;renderAreas();return;}
      await gravarAreas([...l,n]);areasMsg='Área adicionada.';
    }else if(a==='salvar'){
      const velho=l[i],novo=($('#ar-'+i).value||'').trim();
      if(novo===velho){areasMsg='';renderAreas();return;}
      const er=areaInvalida(novo,velho);if(er){areasMsg='!'+er;renderAreas();return;}
      const afetados=Object.values(equip).filter(e=>e.area===velho);
      if(fd&&fd.area===velho)fd.area=novo;
      for(const e of afetados){const doc={...e,area:novo};if(mode==='db'&&db)await db.doc('equipamentos/'+e.tag).set(doc);equip[e.tag]=doc;}
      await gravarAreas(l.map(x=>x===velho?novo:x));
      areasMsg=afetados.length?`Área renomeada. ${afetados.length} ${afetados.length===1?'equipamento atualizado':'equipamentos atualizados'}.`:'Área renomeada.';
    }else if(a==='remover'){
      if(contaArea(l[i])){areasMsg='!Mova os equipamentos para outra área antes de remover.';renderAreas();return;}
      await gravarAreas(l.filter((_,k)=>k!==i));areasMsg='Área removida.';
    }
  }catch(err){areasMsg='!'+(err&&err.code==='invalid_argument'?'Seu acesso não permite alterar as áreas.':'Não foi possível salvar. Tente de novo.');}
  renderAreas();if(vista==='cadastro')renderLista();
}
$('#areas-dlg').addEventListener('click',ev=>{const b=ev.target.closest('[data-a]');if(!b)return;if(b.dataset.a==='fechar')return fecharAreas();acaoArea(b.dataset.a,Number(b.dataset.i));});
$('#areas-dlg').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.id==='ar-novo')acaoArea('add');});
$('#areas').addEventListener('click',e=>{if(e.target.id==='areas')fecharAreas();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#areas').hidden)fecharAreas();});
$('#bt-areas').addEventListener('click',abrirAreas);
$('#bt-oficinas').addEventListener('click',abrirOficinas);
$('#cad-form').addEventListener('click',ev=>{if(ev.target.closest('#f-areas-ger')){lerForm();abrirAreas();}if(ev.target.closest('#f-ofi-ger')){lerForm();abrirOficinas();}});

function setVista(v){
  vista=v;
  const bloq=(v==='cadastro'&&!podeGerir())||(v==='usuarios'&&!podeUsuarios())||(v==='dados'&&!ehAdmin())||(v==='pecas'&&!usuarioAtual());
  $('#v-painel').hidden=v!=='painel';$('#v-cad').hidden=v!=='cadastro'||bloq;$('#v-cfg').hidden=v!=='config';$('#v-usr').hidden=v!=='usuarios'||bloq;$('#v-dados').hidden=v!=='dados'||bloq;$('#v-pecas').hidden=v!=='pecas'||bloq;$('#v-lock').hidden=!bloq;
  document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));
  {const nb=document.querySelector(`#nav [data-view="${v}"]`),nv=$('#nav');if(nb&&nv.scrollWidth>nv.clientWidth){const l=nb.offsetLeft-nv.offsetLeft;if(l<nv.scrollLeft||l+nb.offsetWidth>nv.scrollLeft+nv.clientWidth)nv.scrollLeft=l-12;}}
  try{history.replaceState(null,'','#'+v);}catch(e){}
  if(bloq){
    $('#lock-t').textContent=v==='usuarios'?'Usuários':v==='dados'?'Dados':v==='pecas'?'Peças':'Cadastro de equipamentos';
    $('#lock-p').textContent=v==='pecas'?'Entre com seu usuário para ver as solicitações de peças.':v==='usuarios'?'Entre com seu usuário para gerenciar usuários.':v==='dados'?'Só o administrador acessa os dados e as exportações.':'Entre com seu usuário para cadastrar equipamentos.';
    $('#lock-entrar span').textContent=usuarioAtual()?'Trocar de usuário':'Entrar';
    return;
  }
  if(v==='cadastro'){if(!fd)novo();renderCad();}
  if(v==='config')renderCfg();
  if(v==='pecas')renderPecas();
  if(v==='usuarios')renderUsr();
  if(v==='dados')renderDados(true);
  agendarAjuste();
}
document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>setVista(b.dataset.view)));

montarFrota(estrutura());vista=({'#cadastro':'cadastro','#config':'config','#usuarios':'usuarios','#dados':'dados','#pecas':'pecas'})[location.hash]||'painel';aplicarSessao();render();setInterval(tick,1000);

(async()=>{
  db=window.dt.db;mode='db';setSync('conectando');
  verificarSessao();
  let recebeuUsr=false;
  db.collection('usuarios').onSnapshot(snap=>{
    if(snap.empty&&snap.metadata.fromCache)return;
    if(!recebeuUsr){usuarios={};recebeuUsr=true;}
    if(!snap.metadata.fromCache)usuariosProntos=true;
    for(const c of snap.docChanges()){if(c.type==='removed')delete usuarios[c.doc.id];else usuarios[c.doc.id]={...c.doc.data()};}
    aplicarSessao();if(vista==='usuarios'&&!$('#v-usr').hidden){renderUResumo();renderUList();}
    if(!$('#login').hidden&&!loginSel)renderLogin();
  },()=>{});
  db.collection('paradas').orderBy('inicio','desc').limit(500).onSnapshot(snap=>{
    for(const c of snap.docChanges()){if(c.type==='removed')delete paradas[c.doc.id];else paradas[c.doc.id]={...c.doc.data()};}
    if(aberto&&!aberto.modo)renderModal();
  },()=>{});
  db.doc('config/areas').onSnapshot(s=>{
    const l=s.exists&&Array.isArray(s.data().lista)?s.data().lista:null;
    if(l){areasCfg=l.slice();if(!$('#areas').hidden)renderAreas();else if(vista==='cadastro'&&fd){lerForm();renderForm();}}
  },()=>{});
  db.doc('config/opcoes').onSnapshot(s=>{
    if(s.exists){const o=s.data();opcoes={...opcoes,...o};if(vista==='config')renderCfg();renderQRFixo();if(!$('#qr').hidden)renderQR();if(aberto)renderModal();}
  },()=>{});
  db.doc('config/frotas').onSnapshot(s=>{
    const l=s.exists&&Array.isArray(s.data().lista)?s.data().lista:null;
    if(l&&l.length){frotas=l.map(f=>({...f}));render();if(vista==='cadastro'&&fd&&!editando&&fd.grupo!=='__nova'&&!frotaDe(fd.grupo)){novo();}}
  },()=>{});
  db.collection('equipamentos').onSnapshot(snap=>{
    if(snap.empty&&snap.metadata.fromCache&&!recebeuEq)return;
    const first=!recebeuEq;recebeuEq=true;
    if(first){equip={};eventos=feedDb||[];}
    mode='db';
    for(const c of snap.docChanges()){
      if(c.type==='removed'){delete equip[c.doc.id];continue;}
      const prev=equip[c.doc.id];
      equip[c.doc.id]={...c.doc.data()};
      if(!first&&c.type==='modified'&&prev&&prev.status!==equip[c.doc.id].status)flash(c.doc.id);
    }
    if(first&&vista==='cadastro'&&!editando)novo();
    setSync(snap.metadata.fromCache?'cache':'ok');render();
  },()=>{setSync('erro');});
  db.doc('log/feed').onSnapshot(s=>{
    const ev=(s.exists&&Array.isArray(s.data().eventos))?s.data().eventos.slice():[];
    if(!primeiroFeed){ev.filter(x=>x.t>ultimoT&&(!filtroAtivo()||(equip[x.tag]&&daTela(equip[x.tag])))).reverse().forEach(x=>{toast(x);if(window.alarmeEvento)alarmeEvento(x);});}
    primeiroFeed=false;if(ev[0])ultimoT=Math.max(ultimoT,ev[0].t);feedDb=ev;
    eventos=ev;render();
  },()=>{});
})();
