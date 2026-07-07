#pragma once

#include <array>
#include <chrono>
#include <future>
#include <string>

#include <SDL3/SDL.h>

#include "cave/CaveGenerator.h"
#include "render/Renderer.h"

namespace dungeon::app {

class App {
public:
  App() = default;
  ~App();

  App(const App&) = delete;
  App& operator=(const App&) = delete;

  int run();

private:
  bool initialize();
  void shutdown();
  void pollEvents();
  void frame();
  void drawDockspace();
  void drawViewportPanel();
  void drawSettingsPanel();
  void drawStatsPanel();
  void updateGenerationJob();
  void requestGenerate();
  void applyGeneratedCave(cave::CaveBuildResult cave);
  void updatePreviewCamera();
  void updatePlay(float dt);
  void handleViewportInput(bool hovered);
  void loadTextureFromPath(const char* path);

  SDL_Window* window_ = nullptr;
  render::Renderer renderer_;
  cave::CaveGenerator generator_;
  cave::CaveSettings settings_ {};
  cave::CaveBuildResult cave_ {};
  bool hasCave_ = false;

  std::future<cave::CaveBuildResult> generationFuture_;
  bool generationInFlight_ = false;
  bool generationQueued_ = false;

  bool running_ = true;
  bool playMode_ = false;
  bool viewportHovered_ = false;
  glm::uvec2 viewportSize_ {1, 1};
  glm::vec3 previewTarget_ {0.0f, 2.0f, 0.0f};
  float previewYaw_ = 0.8f;
  float previewPitch_ = 0.62f;
  float previewDistance_ = 60.0f;

  glm::vec3 playerPosition_ {0.0f, 1.0f, 0.0f};
  float playerYaw_ = 0.0f;
  float playerPitch_ = 0.0f;
  float playerSpeed_ = 7.0f;

  render::TextureSettings textureSettings_ {};
  render::LightSettings lightSettings_ {};
  render::Camera activeCamera_ {};

  std::array<char, 512> texturePath_ {};
  std::string textureError_;
  std::string status_ = "Ready";
  std::chrono::steady_clock::time_point lastFrameTime_ = std::chrono::steady_clock::now();
};

} // namespace dungeon::app
