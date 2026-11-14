import React from 'react';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const INICIALES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function AlarmList({ alarmas, ocupado, onEdit, onToggle }) {
  return alarmas.map(alarma => (
    <article key={alarma.id} className={`alarm${alarma.activa ? '' : ' off'}`}>
      <button className="clock-time" data-edit={alarma.id}
        aria-label={`Editar ${alarma.nombre}, ${alarma.hora}`}
        disabled={ocupado} onClick={() => onEdit(alarma.id)}>
        <span className="time-digits">{alarma.hora}</span>
        <span className="alarm-caption">
          {alarma.nombre} · {alarma.duracion} s{alarma.activa ? '' : ' · Desactivado'}
        </span>
      </button>
      <div className="alarm-content">
        <div className="week">
          {DIAS.map((dia, index) => (
            <span key={dia} className={alarma.dias & (1 << index) ? 'selected' : ''}
              aria-label={`${dia}: ${alarma.dias & (1 << index) ? 'activo' : 'inactivo'}`}>
              {INICIALES[index]}
            </span>
          ))}
        </div>
      </div>
      <div className="row-actions">
        <label className="switch">
          <input type="checkbox" checked={alarma.activa} data-toggle={alarma.id}
            disabled={ocupado} aria-label={`Activar ${alarma.nombre}`}
            onChange={event => onToggle(alarma.id, event.target.checked)} />
          <span className="track" />
        </label>
      </div>
    </article>
  ));
}
