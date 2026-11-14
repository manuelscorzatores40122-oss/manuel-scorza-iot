import React, { useEffect, useState } from 'react';
import { dayTimeline } from './dayTimeline.js';

export function DayTimeline({ alarmas = [], serverTime, pending = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const start = performance.now();
    const base = Number.isFinite(serverTime) ? serverTime * 1000 : Date.now();
    const tick = () => setNow(base + performance.now() - start);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [serverTime]);
  const day = dayTimeline(alarmas, now);
  // Margen para que la marca actual no quede recortada en los extremos.
  const x = position => `${2 + position * .96}%`;
  return <section className="day-timeline" aria-labelledby="dayTimelineTitle">
    <div className="timeline-heading">
      <h2 id="dayTimelineTitle">Línea del día</h2>
      <time aria-label={`Hora de Perú: ${day.clock}`}>{day.clock}</time>
    </div>
    <svg className="timeline-chart" width="100%" height="76" role="img"
      aria-label={`Jornada de hoy. ${day.alarmas.length} timbres activos. Hora de Perú: ${day.clock}. ${day.outside}`}>
      <line className="timeline-track" x1="2%" x2="98%" y1="26" y2="26" />
      <line className="timeline-progress" x1="2%" x2={x(day.position)} y1="26" y2="26" />
      {day.alarmas.map(a => <circle key={a.id} className={`timeline-bell${a.passed ? ' passed' : ''}`}
        cx={x(a.position)} cy="26" r="4"><title>{a.hora} · {a.nombre}</title></circle>)}
      <line className="timeline-now" x1={x(day.position)} x2={x(day.position)} y1="12" y2="41" />
      {day.ticks.map((tick, index) => <text key={tick.label} x={x(tick.position)} y="65"
        textAnchor={index === 0 ? 'start' : index === day.ticks.length - 1 ? 'end' : 'middle'}>{tick.label}</text>)}
    </svg>
    <p className="timeline-caption">Hora de Perú · {day.alarmas.length ? `${day.alarmas.length} timbres programados para hoy` : 'Sin timbres programados para hoy'}{day.outside ? ` · ${day.outside}` : ''}{pending ? ' · Pendientes de confirmación de la placa' : ''}</p>
  </section>;
}
