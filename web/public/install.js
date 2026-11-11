(() => {
  const config = window.TIMBRE_SUPPORT || {};
  const contact = document.getElementById('whatsappSupport');
  if (config.developer?.trim()) document.getElementById('developerName').textContent = config.developer.trim();
  if (/^[1-9]\d{6,14}$/.test(config.whatsapp || '')) {
    contact.href = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(config.message || '')}`;
    contact.removeAttribute('aria-disabled');
    document.getElementById('supportPending').hidden = true;
  }

  const button = document.getElementById('instalarApp');
  const status = document.getElementById('installStatus');
  const help = document.getElementById('installHelp');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let promptEvent = null;
  let installed = standalone.matches || navigator.standalone === true;
  function render() {
    button.disabled = installed;
    button.textContent = installed ? 'App instalada' : promptEvent ? 'Instalar app' : 'Cómo instalar la app';
    status.textContent = installed ? 'La app está lista. Necesitas internet para consultar y cambiar los horarios.' : 'Necesitas internet para consultar y cambiar los horarios.';
    if (installed) help.hidden = true;
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    render();
  });
  standalone.addEventListener('change', event => {
    installed = event.matches || navigator.standalone === true;
    render();
  });
  function showHelp() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    document.getElementById('installInstructions').textContent = ios
      ? 'En Safari, abre el menú Compartir y elige «Agregar a inicio». Confirma con «Agregar».'
      : 'Abre el menú del navegador y busca «Instalar app» o «Agregar a la pantalla de inicio». En una computadora también puede aparecer un icono de instalación en la barra de direcciones. Si no aparece, prueba abrir esta página en Chrome o Edge. Si ya la instalaste, ábrela desde su icono.';
    help.hidden = false;
  }
  button.addEventListener('click', async () => {
    if (!promptEvent) return showHelp();
    const event = promptEvent;
    promptEvent = null;
    button.disabled = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      render();
      status.textContent = installed ? 'App instalada. Ya puedes abrirla desde su icono.' : choice.outcome === 'accepted'
        ? 'Instalación solicitada. El navegador completará el proceso.'
        : 'Instalación cancelada. Puedes intentarlo desde el menú del navegador.';
    } catch {
      render();
      status.textContent = 'No se pudo abrir la instalación. Sigue estos pasos desde el navegador.';
      showHelp();
    }
  });
  render();
})();
