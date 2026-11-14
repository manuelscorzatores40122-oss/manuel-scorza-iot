const limaClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const minutesOf = hora => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
export function dayTimeline(alarmas, timestamp) {
  const date = new Date(timestamp);
  const clock = limaClock.format(date);
  // Perú usa UTC−5 durante todo el año; el día debe calcularse también en Perú.
  const day = new Date(timestamp - 5 * 3600000).getUTCDay();
  const today = alarmas.filter(a => a.activa && (a.dias & (1 << day)))
    .map(a => ({ ...a, minutes: minutesOf(a.hora) })).sort((a, b) => a.minutes - b.minutes);
  const start = Math.min(7 * 60, ...today.map(a => Math.floor(a.minutes / 60) * 60));
  const end = Math.max(18 * 60, ...today.map(a => Math.min(1440, Math.ceil((a.minutes + 1) / 60) * 60)));
  const minutes = minutesOf(clock) + Number(clock.slice(6, 8)) / 60;
  const position = value => Math.max(0, Math.min(100, (value - start) / (end - start) * 100));
  const ticks = [];
  for (let minute = start; minute < end; minute += 180) ticks.push(minute);
  if (end - ticks.at(-1) < 60) ticks.pop();
  ticks.push(end);
  return {
    clock, day, position: position(minutes),
    outside: minutes < start ? 'Antes del inicio de la jornada' : minutes > end ? 'Después del cierre de la jornada' : '',
    ticks: ticks.map(minute => ({ position: position(minute), label: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` })),
    alarmas: today.map(a => ({ ...a, position: position(a.minutes), passed: a.minutes <= minutes }))
  };
}
