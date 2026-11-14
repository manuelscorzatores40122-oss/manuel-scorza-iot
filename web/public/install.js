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
  const quick = document.getElementById('installQuick');
  const directButton = document.getElementById('instalarDirecto');
  const status = document.getElementById('installStatus');
  const help = document.getElementById('installHelp');
  const helpButton = document.getElementById('installHelpButton');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)');
  let promptEvent = null;
  let installing = false;
  let requested = false;
  let installed = standalone.matches || navigator.standalone === true;
  function render() {
    button.disabled = installed || installing || requested || !promptEvent;
    quick.hidden = installed || requested || (!promptEvent && !installing);
    directButton.disabled = button.disabled;
    directButton.textContent = installing ? 'Abriendo instalación…' : 'Instalar app';
    button.textContent = installed ? 'App instalada' : installing ? 'Abriendo instalación…' : requested ? 'Instalación solicitada' : 'Instalar app';
    status.textContent = installed ? 'La app está lista. Necesitas internet para consultar y cambiar los horarios.'
      : installing ? 'Confirma la instalación en la ventana del navegador.'
      : requested ? 'Instalación solicitada. El navegador completará el proceso.'
      : promptEvent ? 'Pulsa Instalar app y acepta la confirmación. Se añadirá el icono del colegio a tu dispositivo.'
      : ios ? 'Este navegador de iPhone no permite instalar desde un botón. Consulta la compatibilidad.'
      : window.isSecureContext === false ? 'Abre la dirección segura de la aplicación (https://) para habilitar la instalación.'
      : 'El navegador aún no ha habilitado la instalación directa. El botón se activará cuando esté disponible.';
    helpButton.hidden = installed || installing || requested || !!promptEvent;
    if (installed) help.hidden = true;
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    requested = false;
    help.hidden = true;
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
    document.getElementById('installInstructions').textContent = ios
      ? 'En Safari, abre el menú Compartir y elige «Agregar a inicio». Confirma con «Agregar».'
      : 'La instalación con un botón está disponible en navegadores compatibles, como Chrome o Edge en Android. Abre la dirección segura de la app en uno de ellos. Cuando el navegador habilite la instalación, se activará «Instalar app». Si ya está instalada, ábrela desde el icono del colegio.';
    help.hidden = false;
  }
  async function install() {
    if (installed || installing || requested) return;
    if (!promptEvent) return;
    const event = promptEvent;
    promptEvent = null;
    installing = true;
    help.hidden = true;
    render();
    try {
      await event.prompt();
      const choice = await event.userChoice;
      installing = false;
      requested = choice.outcome === 'accepted';
      render();
      status.textContent = installed ? 'App instalada. Ya puedes abrirla desde su icono.' : choice.outcome === 'accepted'
        ? 'Instalación solicitada. El navegador completará el proceso.'
        : 'Instalación cancelada. Podrás reintentar cuando el navegador habilite nuevamente el botón.';
    } catch {
      installing = false;
      requested = false;
      render();
      status.textContent = 'No se pudo abrir la instalación. Recarga la página para volver a intentarlo.';
    }
  }
  helpButton.addEventListener('click', showHelp);
  button.addEventListener('click', install);
  directButton.addEventListener('click', install);
  render();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      if (!installed && !promptEvent) status.textContent = 'No se pudo preparar la aplicación. Recarga la página para reintentar.';
    });
  }
})();
