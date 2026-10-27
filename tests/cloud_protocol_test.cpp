#include "../cloud_protocol.h"
#include <assert.h>
#include <fstream>
#include <sstream>
#include <string>

int main(int argc, char** argv) {
  CloudUpdate c = {};
  const char* rev = "0123456789abcdef0123456789abcdef";
  assert(parseRespuestaNube("v1 0123456789abcdef0123456789abcdef 240 1 62 10 - 0 0\n", c));
  assert(strcmp(c.revision, rev) == 0);
  assert(c.minuto == 240 && c.activa == 1 && c.dias == 62 && c.duracion == 10);
  assert(strcmp(c.comando, "-") == 0 && c.accion == 0 && c.vence == 0);
  assert(parseRespuestaNube("v1 0123456789abcdef0123456789abcdef 1439 0 0 3600 abcdef0123456789abcdef0123456789 2 1800000030\n", c));
  assert(c.accion == 2 && c.vence == 1800000030UL);
  const char* invalid[] = {
    "v1 0123456789abcdef0123456789abcdef 240 1 62 10 - 0",
    "<html>Error</html>",
    "v1 bad-id 240 1 62 10 - 0 0",
    "v1 0123456789abcdef0123456789abcdef 1440 1 62 10 - 0 0",
    "v1 0123456789abcdef0123456789abcdef 240 1 0 10 - 0 0",
    "v1 0123456789abcdef0123456789abcdef 240 1 128 10 - 0 0",
    "v1 0123456789abcdef0123456789abcdef 240 1 62 0 - 0 0",
    "v1 0123456789abcdef0123456789abcdef 240 1 62 3601 - 0 0",
    "v1 0123456789abcdef0123456789abcdef 240 1 62 10 - 3 0"
  };
  for (const char* line : invalid) assert(!parseRespuestaNube(line, c));
  SchoolUpdate school = {};
  const char* multi = "v2 0123456789abcdef0123456789abcdef 2 10 - 0 0\n00000001 450 1 62 5\n00000002 615 1 32 8\n";
  assert(parseHorarioEscolar(multi, school));
  assert(school.cantidad == 2 && school.timbres[1].duracion == 8);
  assert(debeSonar(school.timbres[0], 450, 1, 20261026));
  assert(!debeSonar(school.timbres[0], 450, 0, 20261025));
  assert(!debeSonar(school.timbres[0], 451, 1, 20261026));
  school.timbres[0].ultimoDia = 20261026;
  assert(!debeSonar(school.timbres[0], 450, 1, 20261026));
  assert(debeSonar(school.timbres[0], 450, 2, 20261027));
  assert(!parseHorarioEscolar("v2 0123456789abcdef0123456789abcdef 33 10 - 0 0", school));
  assert(!parseHorarioEscolar("v2 0123456789abcdef0123456789abcdef 1 10 - 0 0", school));
  assert(!parseHorarioEscolar("v2 0123456789abcdef0123456789abcdef 1 10 - 0 0\n00000001 1440 1 62 5", school));
  assert(!parseHorarioEscolar((std::string(multi) + "unexpected").c_str(), school));
  assert(parseHorarioEscolar("v2 0123456789abcdef0123456789abcdef 0 10 - 0 0\n", school));
  assert(school.cantidad == 0);
  // Permite comprobar tambien una respuesta producida por el servicio JS real.
  if (argc > 1) {
    std::ifstream file(argv[1]);
    assert(file.good());
    std::stringstream text;
    text << file.rdbuf();
    if (text.str().find("v2 ") == 0) {
      assert(parseHorarioEscolar(text.str().c_str(), school));
      assert(school.cantidad == 3);
      assert(school.timbres[0].minuto == 450 && school.timbres[1].minuto == 615 && school.timbres[2].minuto == 780);
    } else {
      assert(parseRespuestaNube(text.str().c_str(), c));
      assert(c.minuto == 390 && c.activa == 1 && c.dias == 62 && c.duracion == 15);
    }
  }
  puts("OK: protocolo ESP32, campos validos, limites y respuestas truncadas.");
}
