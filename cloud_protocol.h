#pragma once
#include <stddef.h>
#include <stdio.h>
#include <string.h>

struct CloudUpdate {
  char revision[33];
  unsigned minuto, activa, dias, duracion;
  char comando[33];
  unsigned accion;
  unsigned long vence;
};

inline bool idNubeValido(const char* valor) {
  if (strlen(valor) != 32) return false;
  for (size_t i = 0; i < 32; ++i) {
    if (!((valor[i] >= '0' && valor[i] <= '9') || (valor[i] >= 'a' && valor[i] <= 'f'))) return false;
  }
  return true;
}

// v1 es literal; sscanf asigna ocho campos (no nueve).
inline bool parseRespuestaNube(const char* respuesta, CloudUpdate &cambio) {
  int campos = sscanf(respuesta, "v1 %32s %u %u %u %u %32s %u %lu",
    cambio.revision, &cambio.minuto, &cambio.activa, &cambio.dias, &cambio.duracion,
    cambio.comando, &cambio.accion, &cambio.vence);
  return (campos == 8 && idNubeValido(cambio.revision) && cambio.minuto < 1440 &&
      cambio.activa <= 1 && cambio.dias <= 127 && (!cambio.activa || cambio.dias) &&
      cambio.duracion >= 1 && cambio.duracion <= 3600 && cambio.accion <= 2 &&
      (strcmp(cambio.comando, "-") == 0 || idNubeValido(cambio.comando)));
}

#include <stdint.h>
#include <ctype.h>
static const unsigned MAX_TIMBRES = 32;
struct SchoolBell {
  uint32_t id;
  uint16_t minuto;
  uint16_t duracion;
  uint8_t activa;
  uint8_t dias;
  uint32_t ultimoDia;
};
struct SchoolUpdate {
  char revision[33];
  unsigned cantidad, duracion;
  char comando[33];
  unsigned accion;
  unsigned long vence;
  SchoolBell timbres[MAX_TIMBRES];
};
inline bool parseHorarioEscolar(const char* text, SchoolUpdate &out) {
  SchoolUpdate parsed = {};
  int used = 0;
  if (sscanf(text, "v2 %32s %u %u %32s %u %lu%n", parsed.revision, &parsed.cantidad,
      &parsed.duracion, parsed.comando, &parsed.accion, &parsed.vence, &used) != 6 || used <= 0) return false;
  if (!idNubeValido(parsed.revision) || parsed.cantidad > MAX_TIMBRES || parsed.duracion < 1 || parsed.duracion > 3600 || parsed.accion > 2 ||
      (strcmp(parsed.comando, "-") != 0 && !idNubeValido(parsed.comando)) ||
      (parsed.accion && !idNubeValido(parsed.comando))) return false;
  text += used;
  for (unsigned i = 0; i < parsed.cantidad; ++i) {
    char idText[9] = {};
    unsigned minuto, activa, dias, duracion;
    used = 0;
    if (sscanf(text, " %8s %u %u %u %u%n", idText, &minuto, &activa, &dias, &duracion, &used) != 5 || used <= 0) return false;
    if (strlen(idText) != 8) return false;
    uint32_t id = 0;
    for (unsigned k = 0; k < 8; ++k) {
      char c = idText[k];
      if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
      id = (id << 4) | (c <= '9' ? c - '0' : c - 'a' + 10);
    }
    if (!id || minuto >= 1440 || activa > 1 || dias > 127 || (activa && !dias) || duracion < 1 || duracion > 3600) return false;
    for (unsigned j = 0; j < i; ++j) if (parsed.timbres[j].id == id) return false;
    parsed.timbres[i] = { id, (uint16_t)minuto, (uint16_t)duracion, (uint8_t)activa, (uint8_t)dias, 0 };
    text += used;
  }
  while (*text && isspace((unsigned char)*text)) ++text;
  if (*text) return false;
  out = parsed;
  return true;
}
inline bool debeSonar(const SchoolBell &bell, unsigned minuto, unsigned diaSemana, uint32_t fecha) {
  return bell.activa && (bell.dias & (1U << diaSemana)) && bell.minuto == minuto && bell.ultimoDia != fecha;
}
