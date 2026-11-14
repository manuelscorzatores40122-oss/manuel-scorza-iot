import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { DayTimeline } from './DayTimeline.jsx';
import { AlarmList } from './AlarmList.jsx';
import { leerJson } from './apiResponse.js';
const $ = id => document.getElementById(id);
const listaRoot = createRoot($('lista'));
const timelineRoot = createRoot($('dayTimeline'));
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'], ORDEN = [1,2,3,4,5,6,0];
let datos = null, autenticado = false, ocupado = false, filtro = -1, editId = null, editBase = null, generacion = 0;
let avisoGuardado = null;
$('dias').innerHTML = ORDEN.map(d => `<label class="day"><input type="checkbox" data-dia="${d}" aria-label="${DIAS[d]}" aria-describedby="editorError"><span>${['D','L','M','X','J','V','S'][d]}</span></label>`).join('');
$('filtros').innerHTML = [-1,...ORDEN].map(d => `<button data-filtro="${d}" aria-pressed="${d===-1}">${d===-1?'Todos':DIAS[d]}</button>`).join('');
function escribirAviso(id, texto, tipo = 'info') {
 const aviso = $(id);
 if (aviso.textContent !== texto) aviso.textContent = texto;
 aviso.dataset.tipo = tipo;
}
function limpiarError(formulario, aviso) {
 $(formulario).querySelectorAll('[aria-invalid]').forEach(campo => campo.removeAttribute('aria-invalid'));
 escribirAviso(aviso, '');
}
function mostrarError(error, aviso = 'alerta', campo = null) {
 if (error.sesionCerrada) return;
 if (aviso === 'alerta') { avisoGuardado = null; escribirAviso('mensaje', ''); }
 escribirAviso(aviso, error.message || error, 'error');
 if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }
}
function mostrarLogin(mensaje = '', tipo = 'info') {
 generacion++; autenticado=false; datos=null; avisoGuardado=null;
 timelineRoot.render(null);
 $('app').hidden=true; $('login').hidden=false; $('conexion').hidden=true;
 $('confirmacion').close(); $('editor').close(); $('clave').value='';
 limpiarError('loginForm', 'loginError');
 escribirAviso('loginInfo', tipo === 'info' ? mensaje : '');
 if (tipo === 'error') escribirAviso('loginError', mensaje, 'error');
 for (const id of ['mensaje','alerta','avisoConexion']) escribirAviso(id, '');
 $('usuario').focus();
}
async function pedir(url, body) {
 const g = generacion;
 const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),10000);
 try {
  const r=await fetch('/api'+url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'X-Timbre-Request':'1'},body:body===undefined?undefined:new URLSearchParams(body),cache:'no-store',signal:ctrl.signal});
  if(r.status===401){
   const error = new Error(url === '/login' ? 'Usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.' : 'Tu sesión venció. Vuelve a ingresar para continuar.');
   if (url !== '/login') { error.sesionCerrada=true; if (g === generacion) mostrarLogin(autenticado ? error.message : '', 'error'); }
   throw error;
  }
  if(!r.ok){
   const texto = r.status >= 500 ? 'El servicio no está disponible en este momento. Espera un momento y vuelve a intentar.' : r.status === 429 ? 'Demasiados intentos de ingreso. Espera 10 minutos antes de volver a intentar.' : await r.text();
   throw new Error(texto || 'No se pudo completar la acción. Vuelve a intentar.');
  }
  return await leerJson(r);
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('No se pudo conectar. Vuelve a intentar.');throw e;}finally{clearTimeout(timer);}
}
function renderLista() {
 const all=datos?.alarmas||[], list=all.filter(a=>filtro<0||(a.dias&(1<<filtro))).sort((a,b)=>a.hora.localeCompare(b.hora));
 $('contador').textContent=`${all.length} de 32 horarios · ${all.filter(a=>a.activa).length} activos`;
 listaRoot.render(createElement(AlarmList, { alarmas: list, ocupado, onEdit: editar, onToggle: alternar }));
 $('vacio').hidden=!!list.length;$('vacioTitulo').textContent=all.length?'Sin timbres para este día':'Tu jornada empieza aquí';
 $('vacioTexto').textContent=all.length?'Agrega un horario o selecciona otro día de la semana.':'Agrega los timbres de entrada, recreo y salida.';
 document.querySelectorAll('[data-filtro]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.filtro)===filtro)));
}
function pintar(d) {
 timelineRoot.render(createElement(DayTimeline, { alarmas: d.alarmas, serverTime: d.ahora, pending: d.pendiente || !d.online || d.requiereActualizacion }));
 datos=d;autenticado=true;$('estadoBreve').textContent=d.online?(d.encendido?'Sonando':'En línea'):'Sin conexión';$('estadoBreve').classList.toggle('offline',!d.online);$('login').hidden=true;$('app').hidden=false;$('conexion').hidden=true;
 $('estado').textContent=!d.online?'Timbre sin conexión':d.encendido?`Sonando · ${d.restante} s restantes`:'Timbre conectado';
 $('punto').classList.toggle('on',d.online);$('actualizacion').hidden=!d.requiereActualizacion;
 $('nube').textContent=d.requiereActualizacion?'Actualiza la placa para sincronizar los horarios escolares.':!d.online?'Los cambios quedan pendientes hasta que se conecte la placa.':d.pendiente?'Horarios guardados. Esperando confirmación de la placa…':d.ordenPendiente?'Orden enviada. Esperando confirmación…':'Todos los horarios están sincronizados.';
 $('reloj').textContent='Reloj de la placa · '+d.hora;
 $('manualInfo').textContent=`Prueba de ${d.duracion} segundos con apagado automático.`;
 const active=d.alarmas.filter(a=>a.activa);
 $('avisoEstado').hidden=d.online&&!d.pendiente&&!d.ordenPendiente&&!d.requiereActualizacion;
 $('punto').classList.toggle('ringing',d.online&&d.encendido);
 if(!active.length){$('proxima').textContent='Sin timbres activos';$('fecha').textContent='Agrega un horario o activa uno de la lista.';}
 else if(!d.online||d.pendiente||d.requiereActualizacion||!d.proxima){$('proxima').textContent=`${active.length} ${active.length===1?'horario activo':'horarios activos'}`;$('fecha').textContent='La próxima ejecución se confirma al sincronizar la placa.';}
 else {
  const minutes=Math.max(1,Math.ceil((d.proxima-d.ahora)/60)),hours=Math.floor(minutes/60),rest=minutes%60;
  $('proxima').textContent='Alarma dentro de '+(hours?`${hours} ${hours===1?'hora':'horas'} `:'')+(rest?`${rest} ${rest===1?'minuto':'minutos'}`:'');
  const next=new Date(d.proxima*1000), hm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(next);
  const day=new Date(next.getTime()-5*3600000).getUTCDay(), bell=active.find(a=>a.hora===hm&&(a.dias&(1<<day)));
  $('proxima').textContent=hm+(bell?' · '+bell.nombre:'');
  $('fecha').textContent='En '+(hours?`${hours} h `:'')+(rest?`${rest} min`:'')+' · '+new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(next);
 }
 escribirAviso('avisoConexion', d.online ? '' : 'El timbre está sin conexión. Puedes guardar horarios, pero se aplicarán cuando vuelva a conectarse.', 'warning');
 if (avisoGuardado) {
  if (avisoGuardado.revision !== d.revision) { avisoGuardado=null; escribirAviso('mensaje', 'La lista de horarios se ha actualizado.'); }
  else mostrarGuardado(d);
 }
 renderLista();controles();
}
function controles() {
 for (const id of ['nuevo','nuevoVacio','guardar','salir','cancelar','cerrarEditor','eliminarEditor','cancelarEliminar','confirmarEliminar']) $(id).disabled=ocupado;
 $('nuevo').disabled=ocupado||(datos?.alarmas.length>=32);
 $('nuevoVacio').disabled=$('nuevo').disabled;
 for (const id of ['probar','detener']) $(id).disabled=ocupado||!datos?.online;
 renderLista();
 $('alarmForm').setAttribute('aria-busy',String(ocupado));
 $('guardar').textContent=ocupado?'Guardando…':'Guardar horario';
 $('confirmarEliminar').textContent=ocupado?'Eliminando…':'Eliminar horario';
}
async function consultar() {
 const g=generacion;
 if (!ocupado&&!$('entrar').disabled&&(autenticado||$('login').hidden)) {
  try {
   const d=await pedir('/estado');
   if(g===generacion&&!ocupado)pintar(d);
  } catch(e) {
   if(g===generacion&&!ocupado) {
    if(autenticado) {
     escribirAviso('avisoConexion','No se pudo conectar con el servicio. Revisa tu conexión; volveremos a intentarlo automáticamente.','error');
     $('estado').textContent='Sin conexión con el servidor';
     $('estadoBreve').textContent='Sin conexión';
     $('estadoBreve').classList.add('offline');
     $('punto').classList.remove('on','ringing');
     $('avisoEstado').hidden=false;
     if(datos)datos.online=false;
     controles();
    } else if($('login').hidden) escribirAviso('conexion',e.message,'error');
   }
  }
 }
 setTimeout(consultar,10000);
}
for (const [formulario, aviso] of [['loginForm','loginError'],['alarmForm','editorError']]) {
 $(formulario).noValidate=true;
 $(formulario).addEventListener('input',()=>limpiarError(formulario,aviso));
}
$('loginForm').onsubmit=async e=>{
 e.preventDefault();if($('entrar').disabled)return;
 limpiarError('loginForm','loginError');escribirAviso('loginInfo','');
 const usuario=$('usuario').value.trim(),clave=$('clave').value;
 if(!usuario)return mostrarError('Escribe tu usuario.','loginError',$('usuario'));
 if(!clave.trim())return mostrarError('Escribe tu contraseña.','loginError',$('clave'));
 generacion++;$('entrar').disabled=true;$('entrar').textContent='Ingresando…';$('loginForm').setAttribute('aria-busy','true');
 try{await pedir('/login',{usuario,clave});$('clave').value='';generacion++;pintar(await pedir('/estado'));}
 catch(e){mostrarError(e,'loginError');}
 finally{$('entrar').disabled=false;$('entrar').textContent='Iniciar sesión';$('loginForm').setAttribute('aria-busy','false');}
};
$('salir').onclick=async()=>{if(ocupado)return;ocupado=true;generacion++;controles();try{await pedir('/logout',{});mostrarLogin('Cerraste sesión correctamente.');}catch(e){mostrarError(e);}finally{ocupado=false;controles();}};
function resumirDias(){
 const seleccion=ORDEN.filter(d=>document.querySelector(`[data-dia="${d}"]`).checked);
 $('resumenDias').textContent=seleccion.length===7?'Todos los días':seleccion.length?'Cada '+seleccion.map(d=>DIAS[d]).join(', '):'Selecciona los días';
}
function seleccionarDias(mask){document.querySelectorAll('[data-dia]').forEach(c=>c.checked=!!(mask&(1<<c.dataset.dia)));resumirDias();limpiarError('alarmForm','editorError');}
$('dias').addEventListener('change',resumirDias);
function editar(id=null){if(!datos||ocupado)return;editBase=structuredClone(datos);editId=id;const a=datos.alarmas.find(a=>a.id===id)||{nombre:'',hora:'07:30',duracion:5,dias:filtro<0?62:1<<filtro,activa:true};$('eliminarEditor').hidden=!id;$('tituloEditor').textContent=id?'Editar timbre':'Nuevo timbre';$('nombre').value=a.nombre;[$('horas').value,$('minutos').value]=a.hora.split(':');$('duracion').value=a.duracion;$('activo').checked=a.activa;seleccionarDias(a.dias);$('editorError').textContent='';$('editor').showModal();}
$('nuevo').onclick=()=>editar();$('nuevoVacio').onclick=()=>editar();
$('cancelar').onclick=$('cerrarEditor').onclick=()=>{if(!ocupado)$('editor').close();};$('editor').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>seleccionarDias(Number(b.dataset.preset)));
$('filtros').onclick=e=>{const b=e.target.closest('[data-filtro]');if(b){filtro=Number(b.dataset.filtro);renderLista();}};
function mostrarGuardado(d) {
 const pendiente=d.pendiente||!d.online||d.requiereActualizacion;
 const detalle=d.requiereActualizacion?'Actualiza la placa para aplicar los horarios.':!d.online?'El timbre está sin conexión; los cambios se aplicarán al reconectarse.':d.pendiente?'Esperando confirmación de la placa.':'La placa confirmó los cambios.';
 escribirAviso('mensaje', `${avisoGuardado.texto} ${detalle}`, pendiente?'warning':'success');
}
async function guardarLista(list,base,texto='Horario guardado.'){
 ocupado=true;generacion++;avisoGuardado=null;escribirAviso('alerta','');escribirAviso('mensaje','');controles();
 try{const d=await pedir('/programar',{alarmas:JSON.stringify(list),revision:base.revision||'-'});avisoGuardado={revision:d.revision,texto};pintar(d);}
 finally{ocupado=false;controles();}
}
$('alarmForm').onsubmit=async e=>{
 e.preventDefault();if(ocupado||!editBase)return;limpiarError('alarmForm','editorError');
 const nombre=$('nombre').value.trim(),h=$('horas').value.trim(),m=$('minutos').value.trim(),duracion=Number($('duracion').value);
 if(!nombre||nombre.length>40)return mostrarError('Escribe un nombre de 1 a 40 caracteres.','editorError',$('nombre'));
 if(!/^\d{1,2}$/.test(h)||Number(h)>23)return mostrarError('Escribe una hora de 00 a 23.','editorError',$('horas'));
 if(!/^\d{1,2}$/.test(m)||Number(m)>59)return mostrarError('Escribe los minutos de 00 a 59.','editorError',$('minutos'));
 if(!Number.isInteger(duracion)||duracion<1||duracion>3600)return mostrarError('Escribe una duración de 1 a 3600 segundos, sin decimales.','editorError',$('duracion'));
 let dias=0;document.querySelectorAll('[data-dia]').forEach(c=>{if(c.checked)dias|=1<<c.dataset.dia;});
 const a={id:editId||Array.from(crypto.getRandomValues(new Uint8Array(4)),b=>b.toString(16).padStart(2,'0')).join(''),nombre,hora:h.padStart(2,'0')+':'+m.padStart(2,'0'),dias,duracion,activa:$('activo').checked};
 if(a.activa&&!dias)return mostrarError('Selecciona al menos un día para activar el timbre.','editorError',document.querySelector('[data-dia]'));
 const repetido=editBase.alarmas.find(x=>x.id!==a.id&&a.activa&&x.activa&&x.hora===a.hora&&(x.dias&a.dias));
 if(repetido)return mostrarError(`El horario coincide con «${repetido.nombre}» a las ${a.hora}. Cambia la hora o los días.`,'editorError',$('horas'));
 const list=editId?editBase.alarmas.map(x=>x.id===editId?a:x):[...editBase.alarmas,a];
 try{await guardarLista(list,editBase);$('editor').close();}catch(e){mostrarError(e,'editorError');}
};
$('eliminarEditor').onclick=()=>{
 if(ocupado||!editId||!editBase)return;
 const a=editBase.alarmas.find(a=>a.id===editId);
 if(!a)return;
 $('detalleEliminar').textContent=`Vas a eliminar «${a.nombre}» de las ${a.hora}. Si lo necesitas después, tendrás que agregarlo de nuevo.`;
 escribirAviso('confirmacionError','');$('confirmacion').showModal();$('cancelarEliminar').focus();
};
$('cancelarEliminar').onclick=()=>{if(!ocupado)$('confirmacion').close();};
$('confirmacion').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});
$('confirmarEliminar').onclick=async()=>{
 if(ocupado||!editId||!editBase)return;
 escribirAviso('confirmacionError','');
 try{await guardarLista(editBase.alarmas.filter(x=>x.id!==editId),editBase,'Horario eliminado.');$('confirmacion').close();$('editor').close();}
 catch(e){mostrarError(e,'confirmacionError');}
};
async function alternar(id, checked) {
 if (ocupado) return;
 try { await guardarLista(datos.alarmas.map(a=>a.id===id?{...a,activa:checked}:a),datos,checked?'Horario activado.':'Horario desactivado.'); }
 catch(e) { mostrarError(e); renderLista(); }
}
async function manual(url){if(ocupado)return;ocupado=true;generacion++;avisoGuardado=null;escribirAviso('alerta','');escribirAviso('mensaje','');controles();try{pintar(await pedir(url,{}));escribirAviso('mensaje',url==='/encender'?'Prueba solicitada. Esperando a la placa…':'Apagado solicitado. Esperando a la placa…');}catch(e){mostrarError(e);}finally{ocupado=false;controles();}}
document.querySelectorAll('[data-panel]').forEach(button=>button.onclick=()=>{
 document.querySelector('.next').hidden=button.dataset.panel!=='panelAlarmas';
 document.querySelectorAll('[data-panel]').forEach(tab=>{const selected=tab===button;$(tab.dataset.panel).hidden=!selected;if(selected)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');});
});
$('probar').onclick=()=>manual('/encender');$('detener').onclick=()=>manual('/apagar');consultar();
