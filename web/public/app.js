const $ = id => document.getElementById(id);
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'], ORDEN = [1,2,3,4,5,6,0];
let datos = null, autenticado = false, ocupado = false, filtro = -1, editId = null, editBase = null, generacion = 0;
$('dias').innerHTML = ORDEN.map(d => `<label class="day"><input type="checkbox" data-dia="${d}" aria-label="${DIAS[d]}"><span>${DIAS[d]}</span></label>`).join('');
$('filtros').innerHTML = [-1,...ORDEN].map(d => `<button data-filtro="${d}" aria-pressed="${d===-1}">${d===-1?'Todos':DIAS[d]}</button>`).join('');
function mostrarLogin() { generacion++; autenticado=false; datos=null; $('app').hidden=true; $('login').hidden=false; $('conexion').hidden=true; $('editor').close(); }
async function pedir(url, body) {
 const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),10000);
 try {
  const r=await fetch('/api'+url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'X-Timbre-Request':'1'},body:body===undefined?undefined:new URLSearchParams(body),cache:'no-store',signal:ctrl.signal});
  if(r.status===401){mostrarLogin();throw new Error(url==='/login'?'Usuario o contraseña incorrectos.':'Inicia sesión para continuar.');}
  if(!r.ok)throw new Error(await r.text());
  return await r.json();
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('No se pudo conectar. Vuelve a intentar.');throw e;}finally{clearTimeout(timer);}
}
function element(tag, className, text) { const e=document.createElement(tag);e.className=className;if(text!==undefined)e.textContent=text;return e; }
function renderLista() {
 const all=datos?.alarmas||[], list=all.filter(a=>filtro<0||(a.dias&(1<<filtro))).sort((a,b)=>a.hora.localeCompare(b.hora));
 $('contador').textContent=`${all.length} de 32 horarios · ${all.filter(a=>a.activa).length} activos`;
 $('lista').replaceChildren();
 for(const a of list){
  const row=element('article','alarm'+(a.activa?'':' off'));
  const time=element('div','clock-time',a.hora), content=element('div','alarm-content');
  const name=element('button','alarm-name',a.nombre);name.dataset.edit=a.id;name.setAttribute('aria-label',`Editar ${a.nombre}, ${a.hora}`);name.disabled=ocupado;
  content.append(name,element('p','alarm-meta',`${a.duracion} segundos · ${a.activa?'Activado':'Desactivado'}`));
  const week=element('div','week');for(const d of ORDEN)week.append(element('span',a.dias&(1<<d)?'selected':'',DIAS[d]));content.append(week);
  const actions=element('div','row-actions'), label=element('label','switch'), toggle=document.createElement('input');
  toggle.type='checkbox';toggle.checked=a.activa;toggle.dataset.toggle=a.id;toggle.disabled=ocupado;toggle.setAttribute('aria-label',`Activar ${a.nombre}`);
  label.append(toggle,element('span','track'));const remove=element('button','remove','Eliminar');remove.dataset.remove=a.id;remove.disabled=ocupado;remove.setAttribute('aria-label',`Eliminar ${a.nombre}`);actions.append(label,remove);
  row.append(time,content,actions);$('lista').append(row);
 }
 $('vacio').hidden=!!list.length;$('vacioTitulo').textContent=all.length?'Sin timbres para este día':'Tu jornada empieza aquí';
 $('vacioTexto').textContent=all.length?'Agrega un horario o selecciona otro día de la semana.':'Agrega los timbres de entrada, recreo y salida.';
 document.querySelectorAll('[data-filtro]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.filtro)===filtro)));
}
function pintar(d) {
 datos=d;autenticado=true;$('login').hidden=true;$('app').hidden=false;$('conexion').hidden=true;
 $('estado').textContent=!d.online?'Timbre sin conexión':d.encendido?`Sonando · ${d.restante} s restantes`:'Timbre conectado';
 $('punto').classList.toggle('on',d.online);$('actualizacion').hidden=!d.requiereActualizacion;
 $('nube').textContent=d.requiereActualizacion?'Actualiza la placa para sincronizar los horarios escolares.':!d.online?'Los cambios quedan pendientes hasta que se conecte la placa.':d.pendiente?'Horarios guardados. Esperando confirmación de la placa…':d.ordenPendiente?'Orden enviada. Esperando confirmación…':'Todos los horarios están sincronizados.';
 $('reloj').textContent='Reloj de la placa · '+d.hora;
 $('manualInfo').textContent=`Prueba de ${d.duracion} segundos con apagado automático.`;
 const active=d.alarmas.filter(a=>a.activa);
 $('totalActivos').textContent=active.length;
 $('resumenHorarios').textContent=`${d.alarmas.length} de 32 horarios configurados`;
 $('punto').classList.toggle('ringing',d.online&&d.encendido);
 if(!active.length){$('proxima').textContent='Sin timbres activos';$('fecha').textContent='Agrega un horario o activa uno de la lista.';}
 else if(!d.online||d.pendiente||d.requiereActualizacion||!d.proxima){$('proxima').textContent=`${active.length} ${active.length===1?'horario activo':'horarios activos'}`;$('fecha').textContent='La próxima ejecución se confirma al sincronizar la placa.';}
 else {
  const minutes=Math.max(1,Math.ceil((d.proxima-d.ahora)/60)),hours=Math.floor(minutes/60),rest=minutes%60;
  $('proxima').textContent='Dentro de '+(hours?`${hours} h `:'')+(rest?`${rest} min`:'');
  const next=new Date(d.proxima*1000), hm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(next);
  const day=new Date(next.getTime()-5*3600000).getUTCDay(), bell=active.find(a=>a.hora===hm&&(a.dias&(1<<day)));
  $('fecha').textContent=(bell?bell.nombre+' · ':'')+new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(next);
 }
 renderLista();controles();
}
function controles(){['nuevo','nuevoVacio','guardar','salir','cancelar','cerrarEditor'].forEach(id=>$(id).disabled=ocupado);$('nuevo').disabled=ocupado||(datos?.alarmas.length>=32);$('nuevoVacio').disabled=$('nuevo').disabled;['probar','detener'].forEach(id=>$(id).disabled=ocupado||!datos?.online);document.querySelectorAll('[data-edit],[data-toggle],[data-remove]').forEach(e=>e.disabled=ocupado);}
async function consultar(){const g=generacion;if(!ocupado&&(autenticado||$('login').hidden))try{const d=await pedir('/estado');if(g===generacion&&!ocupado)pintar(d);}catch(e){if(autenticado){$('mensaje').textContent=e.message;$('estado').textContent='Sin conexión con el servidor';$('punto').classList.remove('on','ringing');if(datos)datos.online=false;controles();}else if($('login').hidden)$('conexion').textContent=e.message;}setTimeout(consultar,10000);}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('entrar').disabled=true;$('loginError').textContent='';try{await pedir('/login',{usuario:$('usuario').value,clave:$('clave').value});$('clave').value='';generacion++;pintar(await pedir('/estado'));}catch(e){$('loginError').textContent=e.message;}finally{$('entrar').disabled=false;}};
$('salir').onclick=async()=>{ocupado=true;generacion++;controles();try{await pedir('/logout',{});mostrarLogin();}catch(e){$('mensaje').textContent=e.message;}finally{ocupado=false;controles();}};
function seleccionarDias(mask){document.querySelectorAll('[data-dia]').forEach(c=>c.checked=!!(mask&(1<<c.dataset.dia)));}
function editar(id=null){if(!datos||ocupado)return;editBase=structuredClone(datos);editId=id;const a=datos.alarmas.find(a=>a.id===id)||{nombre:'',hora:'07:30',duracion:5,dias:filtro<0?62:1<<filtro,activa:true};$('tituloEditor').textContent=id?'Editar timbre':'Nuevo timbre';$('nombre').value=a.nombre;[$('horas').value,$('minutos').value]=a.hora.split(':');$('duracion').value=a.duracion;$('activo').checked=a.activa;seleccionarDias(a.dias);$('editorError').textContent='';$('editor').showModal();}
$('nuevo').onclick=()=>editar();$('nuevoVacio').onclick=()=>editar();
$('cancelar').onclick=$('cerrarEditor').onclick=()=>{if(!ocupado)$('editor').close();};$('editor').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>seleccionarDias(Number(b.dataset.preset)));
$('filtros').onclick=e=>{const b=e.target.closest('[data-filtro]');if(b){filtro=Number(b.dataset.filtro);renderLista();}};
async function guardarLista(list,base){ocupado=true;generacion++;controles();try{pintar(await pedir('/programar',{alarmas:JSON.stringify(list),revision:base.revision||'-'}));$('mensaje').textContent='Horarios guardados. Esperando sincronización con la placa.';}finally{ocupado=false;controles();}}
$('alarmForm').onsubmit=async e=>{
 e.preventDefault();const h=$('horas').value.trim(),m=$('minutos').value.trim();
 if(!/^\d{1,2}$/.test(h)||!/^\d{1,2}$/.test(m)||Number(h)>23||Number(m)>59){$('editorError').textContent='Escribe una hora de 00 a 23 y minutos de 00 a 59.';return;}
 let dias=0;document.querySelectorAll('[data-dia]').forEach(c=>{if(c.checked)dias|=1<<c.dataset.dia;});
 const a={id:editId||Array.from(crypto.getRandomValues(new Uint8Array(4)),b=>b.toString(16).padStart(2,'0')).join(''),nombre:$('nombre').value.trim(),hora:h.padStart(2,'0')+':'+m.padStart(2,'0'),dias,duracion:Number($('duracion').value),activa:$('activo').checked};
 if(a.activa&&!dias){$('editorError').textContent='Selecciona al menos un día.';return;}
 const list=editId?editBase.alarmas.map(x=>x.id===editId?a:x):[...editBase.alarmas,a];
 try{await guardarLista(list,editBase);$('editor').close();}catch(e){$('editorError').textContent=e.message;}
};
$('lista').onclick=async e=>{const edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');if(edit)editar(edit.dataset.edit);if(remove&&!ocupado){const a=datos.alarmas.find(a=>a.id===remove.dataset.remove);if(!confirm(`¿Eliminar el timbre «${a.nombre}» de las ${a.hora}?`))return;try{await guardarLista(datos.alarmas.filter(x=>x.id!==a.id),datos);}catch(e){$('mensaje').textContent=e.message;renderLista();}}};
$('lista').onchange=async e=>{if(!e.target.dataset.toggle||ocupado)return;const id=e.target.dataset.toggle,checked=e.target.checked;try{await guardarLista(datos.alarmas.map(a=>a.id===id?{...a,activa:checked}:a),datos);}catch(e){$('mensaje').textContent=e.message;renderLista();}};
async function manual(url){ocupado=true;generacion++;controles();try{pintar(await pedir(url,{}));$('mensaje').textContent=url==='/encender'?'Prueba solicitada. Esperando a la placa…':'Apagado solicitado. Esperando a la placa…';}catch(e){$('mensaje').textContent=e.message;}finally{ocupado=false;controles();}}
$('probar').onclick=()=>manual('/encender');$('detener').onclick=()=>manual('/apagar');consultar();
