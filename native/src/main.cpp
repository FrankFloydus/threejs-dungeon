#include "app/App.h"

#include <cstdio>

#include <SDL3/SDL_main.h>

int main(int, char**) {
  SDL_SetMainReady();
  dungeon::app::App app;
  const int code = app.run();
  if (code != 0) {
    std::fprintf(stderr, "dungeon_native exited with code %d\n", code);
  }
  return code;
}
