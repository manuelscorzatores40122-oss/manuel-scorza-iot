# Timbre escolar ESP32 con control remoto en Vercel

Proyecto creado: **timbre-esp32**. URL de producción: https://timbre-esp32.vercel.app

Estado de la preparación: web escolar y API publicadas, Redis conectado mediante variables privadas de Production, login y token del dispositivo configurados, y `cloud_config.h` local preparado. El firmware escolar compila y las pruebas de servicio, protocolo C++ y navegador pasan. Para ejecutar varios horarios hay que cargar esta nueva versión en la placa; la web detecta y avisa si aún usa el protocolo anterior. La programación existente se conserva durante la transición.

Si se rotan las credenciales Redis, actualizar las variables privadas en Vercel y volver a desplegar desde `web/` con `vercel --prod --yes`. No guardar esas credenciales en `.env.example` ni en archivos públicos. También se admiten los nombres `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; si existen ambos pares, el par `UPSTASH_` tiene prioridad. El token del dispositivo es independiente y debe coincidir entre Vercel y `cloud_config.h`.

La web de `web/` se publica en Vercel. Sus funciones guardan la alarma, sesiones y órdenes en Upstash Redis. El ESP32 hace solicitudes HTTPS salientes cada 10 segundos; no requiere computadora encendida, IP pública ni abrir puertos del router.

La interfaz permite hasta **32 timbres semanales**. Cada horario tiene nombre (Entrada, Recreo, Salida…), hora y minutos escritos directamente en formato de 24 horas, días, duración e interruptor. Se puede filtrar por día, editar o eliminar horarios. Se rechazan dos timbres activos a la misma hora en días coincidentes. El login y el control manual se conservan. La web indica si el ESP32 está conectado y si confirmó los cambios. Las órdenes manuales vencen en 30 segundos y no se aceptan cuando la última conexión de la placa tiene más de 35 segundos. La última orden reemplaza a la anterior. La confirmación puede tardar otro ciclo de consulta.

## 1. Vercel y almacenamiento

- Importar o desplegar la carpeta **web** (no la carpeta raíz del sketch).
- Framework: **Other**. Output Directory: **public**. Sin comando de build.
- Conectar una base **Upstash Redis** persistente desde Storage / Marketplace. Revisar el plan y sus límites: una consulta cada 10 s supone unas 8640 peticiones de la placa al día, además de las consultas del navegador y las operaciones Redis. No se presupone que entre en un plan gratuito.
- Configurar estas variables de entorno en Production, y también en Preview si se quiere probar allí:

| Variable | Valor |
| --- | --- |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | `123456` (acceso solicitado; cambiar en Vercel para usar otra clave) |
| `DEVICE_TOKEN` | Token aleatorio de al menos 32 caracteres, exclusivo de esta placa |
| `UPSTASH_REDIS_REST_URL` | URL REST HTTPS de Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST de Redis |

Generar un token con `openssl rand -hex 32`. El token del dispositivo y las credenciales Redis nunca van en el JavaScript público. El servidor limita el login a 10 intentos por IP cada 10 minutos; las sesiones duran 12 horas y se invalidan al salir.

Publicar desde `web/` con `vercel --prod`. Usar la URL estable del proyecto (`https://nombre.vercel.app`), no una URL temporal de preview. La web necesita acceso público de red para que la placa llegue a `/api/sync`; la aplicación aplica su propio login y token. Si Deployment Protection bloquea producción, ajustar esa protección para este proyecto antes de conectar la placa.

## 2. Configurar la placa

Copiar `cloud_config.example.h` a `cloud_config.h` y completar:

```cpp
#define TIMBRE_CLOUD_URL "https://nombre.vercel.app"
#define TIMBRE_DEVICE_TOKEN "mismo-token-de-DEVICE_TOKEN"
```

`cloud_config.h` está ignorado por Git. Si no existe o la URL está vacía, la placa conserva el funcionamiento local original. Configurar las parejas de nombre y contraseña en `REDES_WIFI` en el sketch. Utilizar Wi-Fi 2.4 GHz.

La placa intenta las redes en el orden de la lista, empezando por `Ls`. Si no conecta en 10 segundos, pasa a la siguiente y vuelve al principio al terminar la lista. Una vez conectada, conserva esa red; si pierde la conexión, reanuda los intentos. Los reintentos no incluyen esperas que bloqueen el temporizador del timbre. El monitor serie a 115200 baudios muestra la red que intenta y la red a la que se conectó. Para aplicar cambios a la lista hay que compilar y cargar el firmware en la placa.

El proyecto compila con Arduino ESP32 **3.3.12**, placa `esp32:esp32:esp32`, sin librerías externas. La red HTTPS corre en otra tarea para que una conexión lenta no bloquee el temporizador ni el apagado. Las colas transfieren copias del estado entre las tareas; la configuración y el GPIO se modifican únicamente en el loop principal.

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path /tmp/timbre-build trabajo-timbre.ino
arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/ttyUSB0 --input-dir /tmp/timbre-build trabajo-timbre.ino
```

Ajustar el modelo y puerto a la placa real. También se puede cargar con Arduino IDE. Monitor serie: 115200 baudios.

El ESP32 necesita sincronizar la hora por NTP antes de conectarse por HTTPS. `cloud_ca.h` contiene autoridades raíz públicas para verificar el certificado (ISRG Root X1, DigiCert Global Root G2 Amazon Root CA 1 y GTS Root R1); si se usa otro dominio/certificado, actualizar las raíces según su emisor. No desactivar la verificación TLS.

### Salida para módulo de relé

El firmware controla el relé desde **GPIO 26 (D26)** (`PIN_RELE`). La configuración
actual es `RELE_ACTIVO_BAJO = true`: LOW activa y HIGH desactiva. Si el módulo
se activa con HIGH, cambiar esa constante a `false` antes de compilar.
Los horarios, el control manual y el apagado por duración usan esta polaridad.
Al iniciar el programa se configura la salida en el nivel inactivo.

El LED azul permanece encendido mientras el timbre está sonando y se apaga
al detenerlo o al cumplirse su duración, tanto en los horarios como en el
control manual. Al iniciar queda apagado. Se configura en GPIO 2
(`PIN_LED_AZUL`) y activo con HIGH (`LED_AZUL_ACTIVO_BAJO = false`);
ajustar esas constantes si el LED de la placa utiliza otro pin o polaridad.
Para aplicar este cambio hay que compilar y cargar el firmware en el ESP32.

Usar un módulo con entrada compatible con lógica de 3.3 V; no conectar una
bobina de relé directamente al GPIO. Conectar IN a GPIO 26 (D26) y alimentar el
módulo según su ficha técnica; en módulos sin aislamiento, compartir GND con
el ESP32. La alimentación VCC depende del módulo, no de la polaridad de IN.
Usar COM y NO cuando se necesite que el circuito quede abierto en reposo.

Conexión para un módulo que admita alimentación de 3.3 V y cuya corriente
pueda suministrar la salida 3V3 de la placa:

| Módulo relé | ESP32 DevKit |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| IN | GPIO 26 (D26) |

Si el módulo requiere 5 V, no alimentarlo desde 3V3: usar la alimentación
indicada por el fabricante, manteniendo la entrada IN compatible con 3.3 V.

Antes de conectar la carga, verificar activación, parada, apagado por duración
y reinicio. El firmware no controla el pin durante todo el arranque/reset:
si se necesita asegurar el reposo en ese intervalo, el circuito debe mantener
IN en su nivel inactivo mediante una resistencia o un controlador adecuado.

## 3. Funcionamiento y prueba real

1. Abrir la URL de Vercel e ingresar con `admin` / la contraseña configurada.
2. Encender el ESP32 y esperar que indique **ESP32 conectado**.
3. Guardar una alarma y esperar **Alarma sincronizada** antes de dar el cambio por aplicado.
4. Probar y detener el timbre. Las órdenes tardan aproximadamente 10 segundos más la latencia de red; Detener no es una parada instantánea. El apagado por duración sigue siendo local.
5. Desactivar el Wi-Fi del celular y repetir usando datos móviles.
6. Desconectar internet de la placa: debe indicarse sin conexión. Una nueva configuración queda pendiente; la última alarma confirmada continúa ejecutándose con el reloj de la placa.

## Actualización a horarios escolares

La web convierte la alarma anterior en «Timbre existente», sin borrar la configuración. El servidor acepta firmware antiguo (`v1`) y nuevo (`v2`). Mientras la placa use `v1`, la pantalla avisa que hay que actualizarla y la placa continúa con su programación anterior; **no ejecuta la nueva lista**. Cargar el firmware nuevo para aplicar todos los horarios. No hace falta cambiar Redis ni `cloud_config.h`.

El firmware `v2` recibe la lista completa, la valida y la guarda en una única escritura de Preferences (`escuelaV2`), junto con la revisión y las fechas de disparo. El monitor serie muestra `Horarios escolares sincronizados: N timbres`. La web confirma la sincronización en el siguiente reporte. Cambiar el nombre, los días o el orden mantiene la fecha del último disparo para ese identificador y hora. Si se cambia la hora, puede sonar otra vez ese día a la nueva hora. Cada timbre usa su propia duración; la prueba manual conserva la duración de prueba anterior.

Las ediciones usan revisiones para evitar sobrescribir cambios guardados desde otro navegador. Si aparece un conflicto, cerrar el editor y volver a cargar los horarios antes de guardar. La lista vacía desactiva toda la programación al sincronizar.

La primera conexión importa la configuración local solo si aún no se guardó ninguna en la nube. Después, Vercel es la fuente de la programación: los horarios escolares se administran desde la web remota. El panel local antiguo muestra solo la programación original y el control manual. Al reiniciar sin internet hace falta recuperar NTP para conocer la hora real; no hay reloj RTC con batería.

Las órdenes se ejecutan como máximo una vez: se registra su identificador antes de accionar el GPIO. Si hay un corte eléctrico justo entre esos pasos, la orden puede perderse; no se reejecuta automáticamente al arrancar. La pantalla confirma recepción del comando, no verifica físicamente el timbre.

## Validación

```sh
npm --prefix web test
npm --prefix web run check
node --check web/public/app.js
node web/test/protocol.test.js
```

La prueba `protocol.test.js` requiere `g++` y comprueba que el parser C++ usado por el ESP32 acepta la respuesta `v2` de varios horarios generada por el servicio JavaScript. También se prueban el protocolo anterior, días de la semana, límites y la prevención de disparos repetidos.

Las pruebas del servicio usan almacenamiento simulado y verifican autenticación, caducidad, límites de login, validación, sincronización, reintentos y vencimiento de órdenes. No sustituyen la prueba de extremo a extremo con Redis real y la placa.

Referencias: [Funciones Node de Vercel](https://vercel.com/docs/functions/runtimes/node-js), [Redis en Vercel](https://vercel.com/docs/redis), [API REST de Upstash](https://upstash.com/docs/redis/features/restapi).

## Soporte e instalación de la app

En **Dispositivo** se muestran las tarjetas de instalación y soporte. Completar
`web/public/support-config.js` con el nombre público del desarrollador y su
WhatsApp internacional (solo dígitos, incluido el código de país). El botón abre
una conversación con un mensaje sobre actualizaciones o mantenimiento; el usuario
elige si lo envía. Mientras no haya un número válido, el enlace queda deshabilitado.

El manifiesto `web/public/manifest.webmanifest` y los iconos de `public/icons/`
permiten instalar la app desde navegadores compatibles, al servirla por HTTPS
(o localhost). El botón usa la invitación de instalación cuando el navegador la
ofrece; en los demás casos muestra instrucciones, incluidas las de Safari en iOS.
La app instalada requiere internet para acceder al servicio; no almacena horarios,
sesiones ni respuestas de la API para uso sin conexión. Los horarios confirmados
siguen ejecutándose en la placa según las condiciones descritas anteriormente.

Pruebas del contacto y del flujo de instalación: `node --test web/test/install.test.js`.
