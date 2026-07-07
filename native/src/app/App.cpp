#include "app/App.h"

#include <algorithm>
#include <cstdio>

#include <SDL3_image/SDL_image.h>
#include <imgui_impl_sdl3.h>
#include <glm/gtc/constants.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <imgui.h>

namespace dungeon::app {
namespace {

float percentToSlider(float value) {
  return std::clamp(value * 100.0f, 0.0f, 100.0f);
}

float sliderToPercent(float value) {
  return std::clamp(value / 100.0f, 0.0f, 1.0f);
}

bool percentSlider(const char* label, float& value, float minValue = 0.0f, float maxValue = 100.0f) {
  float percent = percentToSlider(value);
  if (ImGui::SliderFloat(label, &percent, minValue, maxValue, "%.0f%%")) {
    value = sliderToPercent(percent);
    return true;
  }
  return false;
}

void tooltip(const char* text) {
  if (ImGui::IsItemHovered(ImGuiHoveredFlags_DelayNormal)) {
    ImGui::SetTooltip("%s", text);
  }
}

glm::vec3 forwardFromAngles(float yaw, float pitch) {
  const float cp = std::cos(pitch);
  return glm::normalize(glm::vec3(std::sin(yaw) * cp, std::sin(pitch), std::cos(yaw) * cp));
}

} // namespace

App::~App() {
  shutdown();
}

int App::run() {
  if (!initialize()) return 1;
  requestGenerate();
  while (running_) {
    pollEvents();
    frame();
  }
  shutdown();
  return 0;
}

bool App::initialize() {
  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS)) {
    status_ = SDL_GetError();
    std::fprintf(stderr, "SDL_Init failed: %s\n", status_.c_str());
    return false;
  }

  window_ = SDL_CreateWindow("Dungeon Tunnels Native", 1600, 1000,
    SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_VULKAN);
  if (!window_) {
    status_ = SDL_GetError();
    std::fprintf(stderr, "SDL_CreateWindow failed: %s\n", status_.c_str());
    return false;
  }

  int width = 1600;
  int height = 1000;
  SDL_GetWindowSizeInPixels(window_, &width, &height);

  IMGUI_CHECKVERSION();
  ImGui::CreateContext();
  ImGuiIO& io = ImGui::GetIO();
  io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;
  ImGui::StyleColorsDark();
  ImGui_ImplSDL3_InitForOther(window_);

  if (!renderer_.initialize(window_, width, height, "shaders")) {
    status_ = "Failed to initialize BGFX Vulkan renderer or shader binaries.";
    std::fprintf(stderr, "%s\n", status_.c_str());
    return false;
  }

  std::snprintf(texturePath_.data(), texturePath_.size(), "%s", "");
  lastFrameTime_ = std::chrono::steady_clock::now();
  return true;
}

void App::shutdown() {
  if (generationInFlight_ && generationFuture_.valid()) {
    generationFuture_.wait();
  }
  renderer_.shutdown();
  if (ImGui::GetCurrentContext()) {
    ImGui_ImplSDL3_Shutdown();
    ImGui::DestroyContext();
  }
  if (window_) {
    SDL_DestroyWindow(window_);
    window_ = nullptr;
  }
  SDL_Quit();
}

void App::pollEvents() {
  SDL_Event event;
  while (SDL_PollEvent(&event)) {
    ImGui_ImplSDL3_ProcessEvent(&event);
    switch (event.type) {
      case SDL_EVENT_QUIT:
        running_ = false;
        break;
      case SDL_EVENT_WINDOW_CLOSE_REQUESTED:
        if (event.window.windowID == SDL_GetWindowID(window_)) running_ = false;
        break;
      case SDL_EVENT_DROP_FILE:
        if (event.drop.data) {
          loadTextureFromPath(event.drop.data);
          SDL_free(const_cast<char*>(event.drop.data));
        }
        break;
      default:
        break;
    }
  }
}

void App::frame() {
  const auto now = std::chrono::steady_clock::now();
  const float dt = std::chrono::duration<float>(now - lastFrameTime_).count();
  lastFrameTime_ = now;

  updateGenerationJob();
  if (playMode_) updatePlay(dt);
  else updatePreviewCamera();

  int width = 1;
  int height = 1;
  SDL_GetWindowSizeInPixels(window_, &width, &height);
  renderer_.beginFrame(width, height);

  ImGui_ImplSDL3_NewFrame();
  ImGui::NewFrame();
  drawDockspace();
  drawViewportPanel();
  drawSettingsPanel();
  drawStatsPanel();

  ImGui::Render();
  renderer_.renderImGui(ImGui::GetDrawData());
  renderer_.endFrame();
}

void App::drawDockspace() {
  ImGuiWindowFlags flags = ImGuiWindowFlags_MenuBar | ImGuiWindowFlags_NoDocking;
  const ImGuiViewport* viewport = ImGui::GetMainViewport();
  ImGui::SetNextWindowPos(viewport->WorkPos);
  ImGui::SetNextWindowSize(viewport->WorkSize);
  ImGui::SetNextWindowViewport(viewport->ID);
  flags |= ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoResize |
    ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoBringToFrontOnFocus | ImGuiWindowFlags_NoNavFocus;
  ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 0.0f);
  ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);
  ImGui::Begin("DockSpace", nullptr, flags);
  ImGui::PopStyleVar(2);
  ImGuiID dockspaceId = ImGui::GetID("DungeonNativeDockspace");
  ImGui::DockSpace(dockspaceId, ImVec2(0.0f, 0.0f), ImGuiDockNodeFlags_PassthruCentralNode);
  if (ImGui::BeginMenuBar()) {
    if (ImGui::BeginMenu("File")) {
      if (ImGui::MenuItem("Exit")) running_ = false;
      ImGui::EndMenu();
    }
    ImGui::EndMenuBar();
  }
  ImGui::End();
}

void App::drawViewportPanel() {
  ImGui::Begin("Viewport");
  ImVec2 available = ImGui::GetContentRegionAvail();
  available.x = std::max(1.0f, available.x);
  available.y = std::max(1.0f, available.y);
  viewportSize_ = {static_cast<unsigned int>(available.x), static_cast<unsigned int>(available.y)};

  ImTextureID texture = renderer_.renderViewport(activeCamera_, lightSettings_, viewportSize_);
  ImGui::Image(texture, available, ImVec2(0, 1), ImVec2(1, 0));
  viewportHovered_ = ImGui::IsItemHovered();
  handleViewportInput(viewportHovered_);

  ImGui::SetCursorPos(ImVec2(12.0f, 32.0f));
  ImGui::BeginChild("ViewportOverlay", ImVec2(360, 72), ImGuiChildFlags_Borders);
  ImGui::TextUnformatted(playMode_ ? "Play Mode" : "Preview");
  ImGui::TextWrapped("%s", status_.c_str());
  ImGui::EndChild();
  ImGui::End();
}

void App::drawSettingsPanel() {
  ImGui::Begin("Cave Settings");
  bool changed = false;
  int level = static_cast<int>(settings_.levelSize);
  const char* levels[] = {"Small", "Medium", "Large"};
  if (ImGui::Combo("Level size", &level, levels, 3)) {
    settings_.levelSize = static_cast<cave::LevelSize>(level);
    changed = true;
  }
  tooltip("Preset scale for the generated cave graph and branch count.");
  int seed = static_cast<int>(settings_.seed);
  if (ImGui::InputInt("Seed", &seed)) {
    settings_.seed = static_cast<std::uint32_t>(std::max(1, seed));
    changed = true;
  }
  tooltip("Integer seed used by the deterministic cave generator.");
  ImGui::SameLine();
  if (ImGui::Button("Random")) {
    settings_.seed = static_cast<std::uint32_t>(SDL_GetTicks() ^ 0x9e3779b9u);
    changed = true;
  }
  tooltip("Pick a new integer seed.");
  changed |= ImGui::SliderFloat("Voxel size", &settings_.voxelSize, 0.25f, 2.0f, "%.2f");
  tooltip("World units per voxel. Smaller values add detail and cost more CPU/GPU memory.");
  changed |= ImGui::SliderFloat("Height", &settings_.height, 3.0f, 32.0f, "%.1f");
  tooltip("Vertical generation volume for tunnels, chambers, and ceilings.");
  changed |= ImGui::SliderInt("Main path", &settings_.mainPathLength, 8, 120);
  tooltip("Length of the primary 3D random-walk cave spine.");
  changed |= ImGui::SliderInt("Branch count", &settings_.branchCount, 0, 40);
  tooltip("How many side paths are spawned from the main cave spine.");
  changed |= ImGui::SliderInt("Branch depth", &settings_.branchDepth, 1, 30);
  tooltip("Maximum side-branch length before termination.");
  changed |= percentSlider("Dead-end", settings_.deadEndChance);
  tooltip("Probability that branches stop instead of continuing.");
  changed |= percentSlider("Loops", settings_.loopChance, 0.0f, 80.0f);
  tooltip("Chance to connect nearby graph nodes into loops.");
  changed |= percentSlider("Chambers", settings_.chamberChance);
  tooltip("Chance that endpoints and junctions expand into chambers.");
  changed |= ImGui::SliderFloat("Chamber size", &settings_.chamberSize, 2.0f, 16.0f, "%.1f");
  tooltip("Average chamber radius before organic noise distortion.");

  ImGui::SeparatorText("Organic Shape");
  changed |= percentSlider("Erosion", settings_.erosion);
  tooltip("Expands carved air and makes the cave less tight.");
  changed |= percentSlider("Floor width", settings_.floorWidth, 10.0f, 90.0f);
  tooltip("Preserves a flatter walkable band through tunnels and chambers.");
  changed |= percentSlider("Side roughness", settings_.sideRoughness);
  tooltip("Adds noisy variation to the side walls.");
  changed |= percentSlider("Ceiling variation", settings_.ceilingVariation);
  tooltip("Adds breakup and height variation near upper cave surfaces.");
  changed |= percentSlider("Asymmetry", settings_.asymmetry);
  tooltip("Warps the cave field so left/right and up/down profiles differ.");
  changed |= percentSlider("Wall bulge", settings_.wallBulge);
  tooltip("Inflates tunnels and chambers beyond the graph radius.");
  changed |= percentSlider("Pocket strength", settings_.pocketStrength);
  tooltip("Cuts smaller 3D pockets into walls and ceilings.");
  changed |= ImGui::SliderFloat("Noise scale", &settings_.noiseScale, 0.15f, 8.0f, "%.2f");
  tooltip("Scale of the domain-warp and surface noise.");
  changed |= ImGui::SliderInt("Smoothing", &settings_.smoothingPasses, 0, 4);
  tooltip("Reserved for smoothing passes in the generated field.");
  changed |= ImGui::SliderInt("Floor clearance", &settings_.floorClearanceVoxels, 1, 8);
  tooltip("Minimum voxel rows kept open over floor support cells.");

  ImGui::SeparatorText("Texture");
  ImGui::InputText("Path", texturePath_.data(), texturePath_.size());
  if (ImGui::Button("Load texture")) loadTextureFromPath(texturePath_.data());
  tooltip("Load a PNG, JPG, or WebP block texture from disk.");
  ImGui::SameLine();
  if (ImGui::Button("Clear")) {
    renderer_.clearBlockTexture();
    textureSettings_ = {};
  }
  tooltip("Return to the built-in vertex-color/checker preview material.");
  if (!textureError_.empty()) ImGui::TextColored(ImVec4(1.0f, 0.35f, 0.35f, 1.0f), "%s", textureError_.c_str());
  bool pixelated = textureSettings_.pixelated;
  if (ImGui::Checkbox("Pixelated", &pixelated)) {
    textureSettings_.pixelated = pixelated;
    if (!textureSettings_.path.empty()) loadTextureFromPath(textureSettings_.path.string().c_str());
  }
  tooltip("Use nearest-neighbor filtering for Minecraft-style block textures.");
  changed |= ImGui::SliderFloat("UV X", &settings_.uvScaleX, 0.1f, 16.0f, "%.2f");
  tooltip("Horizontal texture projection scale.");
  changed |= ImGui::SliderFloat("UV Y", &settings_.uvScaleY, 0.1f, 16.0f, "%.2f");
  tooltip("Vertical texture projection scale.");
  changed |= ImGui::SliderInt("UV rotation", &settings_.uvRotationDegrees, 0, 270);
  tooltip("Rotate generated face UVs.");

  ImGui::SeparatorText("Lighting");
  ImGui::Checkbox("Point shadows", &lightSettings_.shadows);
  tooltip("Allocate shadow targets for the player/preview point light.");
  ImGui::Checkbox("Back-face culling", &lightSettings_.culling);
  tooltip("Cull inward-facing cave faces. Leave off when inspecting the cave from inside.");
  ImGui::SliderInt("Shadow size", &lightSettings_.shadowSize, 512, 2048);
  tooltip("Shadow map resolution.");
  ImGui::SliderFloat("Shadow distance", &lightSettings_.shadowDistance, 12.0f, 96.0f, "%.1f");
  tooltip("Maximum point-light shadow distance.");
  ImGui::SliderFloat("Light radius", &lightSettings_.radius, 8.0f, 96.0f, "%.1f");
  tooltip("Point light attenuation radius.");

  ImGui::SeparatorText("Actions");
  if (ImGui::Button(generationInFlight_ ? "Generating..." : "Generate")) requestGenerate();
  ImGui::SameLine();
  if (ImGui::Button(playMode_ ? "Exit Play Mode" : "Play Mode")) {
    playMode_ = !playMode_;
    if (playMode_) {
      playerPosition_ = cave_.spawnPosition;
      playerYaw_ = previewYaw_;
      playerPitch_ = 0.0f;
    }
  }
  if (changed) {
    generationQueued_ = true;
  }
  ImGui::End();
}

void App::drawStatsPanel() {
  ImGui::Begin("Stats");
  ImGui::Text("Renderer: %s", renderer_.stats().usingVulkan ? "BGFX Vulkan" : "BGFX fallback");
  ImGui::Text("Status: %s", status_.c_str());
  if (hasCave_) {
    const cave::CaveStats& s = cave_.stats;
    ImGui::Text("Seed: %u", cave_.settings.seed);
    ImGui::Text("Graph: %d nodes, %d edges", s.graphNodes, s.graphEdges);
    ImGui::Text("Branches: %d  Dead ends: %d  Loops: %d  Chambers: %d", s.branches, s.deadEnds, s.loops, s.chambers);
    ImGui::Text("Chunks: %d  Air voxels: %llu", s.activeChunks, static_cast<unsigned long long>(s.airVoxels));
    ImGui::Text("Faces: %u  Vertices: %zu  Indices: %zu", s.facesAfterOptimize, cave_.mesh.vertices.size(), cave_.mesh.indices.size());
    ImGui::Text("Mesh memory: %.2f MB", static_cast<double>(s.meshBytes) / (1024.0 * 1024.0));
    ImGui::Text("Generation: %.2f ms  Mesh: %.2f ms  Optimize: %.2f ms", s.generationMs, s.meshingMs, s.optimizeMs);
    if (!cave_.warning.empty()) ImGui::TextColored(ImVec4(1.0f, 0.75f, 0.25f, 1.0f), "%s", cave_.warning.c_str());
  }
  const render::RendererStats rs = renderer_.stats();
  ImGui::Text("Draw calls: %u  Triangles: %u", rs.drawCalls, rs.triangles);
  ImGui::End();
}

void App::requestGenerate() {
  if (generationInFlight_) {
    generationQueued_ = true;
    return;
  }
  cave::CaveSettings settings = settings_;
  generationInFlight_ = true;
  generationQueued_ = false;
  status_ = "Generating cave...";
  generationFuture_ = std::async(std::launch::async, [settings]() {
    cave::CaveGenerator generator;
    return generator.generate(settings);
  });
}

void App::updateGenerationJob() {
  if (!generationInFlight_ || !generationFuture_.valid()) return;
  if (generationFuture_.wait_for(std::chrono::milliseconds(0)) != std::future_status::ready) return;
  applyGeneratedCave(generationFuture_.get());
  generationInFlight_ = false;
  if (generationQueued_) requestGenerate();
}

void App::applyGeneratedCave(cave::CaveBuildResult cave) {
  cave_ = std::move(cave);
  hasCave_ = true;
  renderer_.uploadCaveMesh(cave_.mesh);
  previewTarget_ = cave_.spawnPosition;
  previewTarget_.y = 2.0f;
  std::array<char, 256> buffer {};
  std::snprintf(buffer.data(), buffer.size(), "%d chunks, %llu air voxels, %u faces, seed %u",
    cave_.stats.activeChunks,
    static_cast<unsigned long long>(cave_.stats.airVoxels),
    cave_.stats.facesAfterOptimize,
    cave_.settings.seed);
  status_ = buffer.data();
}

void App::updatePreviewCamera() {
  previewPitch_ = std::clamp(previewPitch_, -1.25f, 1.25f);
  previewDistance_ = std::clamp(previewDistance_, 2.0f, 260.0f);
  const float cp = std::cos(previewPitch_);
  const glm::vec3 offset {
    std::sin(previewYaw_) * cp * previewDistance_,
    std::sin(previewPitch_) * previewDistance_,
    std::cos(previewYaw_) * cp * previewDistance_
  };
  activeCamera_.target = previewTarget_;
  activeCamera_.position = previewTarget_ + offset;
  lightSettings_.position = activeCamera_.position;
}

void App::updatePlay(float dt) {
  ImGuiIO& io = ImGui::GetIO();
  if (viewportHovered_ && ImGui::IsMouseDown(ImGuiMouseButton_Right)) {
    playerYaw_ -= io.MouseDelta.x * 0.0032f;
    playerPitch_ = std::clamp(playerPitch_ - io.MouseDelta.y * 0.0024f, -1.2f, 1.2f);
  }
  glm::vec3 forward = forwardFromAngles(playerYaw_, 0.0f);
  glm::vec3 right = glm::normalize(glm::cross(forward, glm::vec3(0.0f, 1.0f, 0.0f)));
  glm::vec3 move(0.0f);
  if (ImGui::IsKeyDown(ImGuiKey_W)) move += forward;
  if (ImGui::IsKeyDown(ImGuiKey_S)) move -= forward;
  if (ImGui::IsKeyDown(ImGuiKey_D)) move += right;
  if (ImGui::IsKeyDown(ImGuiKey_A)) move -= right;
  if (glm::dot(move, move) > 0.0001f) {
    move = glm::normalize(move) * playerSpeed_ * dt;
    glm::vec3 next = playerPosition_ + move;
    next.y = std::max(settings_.voxelSize * 1.5f, next.y);
    if (!hasCave_ || generator_.hasHeadroom(cave_, next, 1.8f)) playerPosition_ = next;
  }
  activeCamera_.position = playerPosition_ + glm::vec3(0.0f, 1.55f, 0.0f);
  activeCamera_.target = activeCamera_.position + forwardFromAngles(playerYaw_, playerPitch_);
  lightSettings_.position = activeCamera_.position;
}

void App::handleViewportInput(bool hovered) {
  if (!hovered || playMode_) return;
  ImGuiIO& io = ImGui::GetIO();
  if (io.MouseWheel != 0.0f) {
    previewDistance_ *= std::pow(0.88f, io.MouseWheel);
  }
  if (ImGui::IsMouseDown(ImGuiMouseButton_Middle)) {
    if (io.KeyShift) {
      const glm::vec3 viewDir = glm::normalize(activeCamera_.target - activeCamera_.position);
      const glm::vec3 right = glm::normalize(glm::cross(viewDir, glm::vec3(0.0f, 1.0f, 0.0f)));
      const glm::vec3 up = glm::normalize(glm::cross(right, viewDir));
      previewTarget_ -= right * io.MouseDelta.x * 0.025f * previewDistance_;
      previewTarget_ += up * io.MouseDelta.y * 0.025f * previewDistance_;
    } else {
      previewYaw_ -= io.MouseDelta.x * 0.006f;
      previewPitch_ += io.MouseDelta.y * 0.006f;
    }
  }
}

void App::loadTextureFromPath(const char* path) {
  if (!path || !path[0]) return;
  textureSettings_.path = path;
  textureSettings_.enabled = true;
  std::snprintf(texturePath_.data(), texturePath_.size(), "%s", path);
  if (renderer_.loadBlockTexture(textureSettings_, textureError_)) {
    textureError_.clear();
  }
}

} // namespace dungeon::app
