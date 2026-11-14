// Una confirmación por evento; el primer estado establece la referencia.
export function activationTracker() {
  let initialized = false, lastEvent = null, ringing = false;
  return state => {
    const active = !!(state.online && state.encendido);
    const event = state.ultimaActivacion;
    const recent = event && state.ahora >= event.hora && state.ahora - event.hora <= 60;
    const notify = state.online && (event
      ? initialized && event.id !== lastEvent && recent
      : initialized && active && !ringing);
    if (event) lastEvent = event.id;
    if (state.online) ringing = active;
    initialized = true;
    return !!notify;
  };
}
