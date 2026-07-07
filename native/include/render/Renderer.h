#pragma once

#include <cstdint>
#include <filesystem>
#include <string>

#include <bgfx/bgfx.h>
#include <glm/glm.hpp>
#include <imgui.h>

#include "cave/CaveGenerator.h"

struct SDL_Window;

namespace dungeon::render {

struct Camera {
  glm::vec3 position {18.0f, 14.0f, 18.0f};
  glm::vec3 target {0.0f, 2.0f, 0.0f};
  float fovYRadians = 1.04719755f;
  float nearPlane = 0.05f;
  float farPlane = 900.0f;
};

struct TextureSettings {
  bool enabled = false;
  bool pixelated = true;
  float uvScaleX = 1.0f;
  float uvScaleY = 1.0f;
  int uvRotationDegrees = 0;
  std::filesystem::path path;
};

struct LightSettings {
  glm::vec3 position {0.0f, 2.2f, 0.0f};
  glm::vec3 color {1.0f, 0.82f, 0.58f};
  float radius = 32.0f;
  bool shadows = true;
  bool culling = false;
  int shadowSize = 1024;
  float shadowDistance = 42.0f;
};

struct RendererStats {
  std::uint32_t drawCalls = 0;
  std::uint32_t triangles = 0;
  std::uint32_t vertices = 0;
  bool usingVulkan = false;
};

class Renderer {
public:
  Renderer() = default;
  ~Renderer();

  Renderer(const Renderer&) = delete;
  Renderer& operator=(const Renderer&) = delete;

  bool initialize(SDL_Window* window, int width, int height, std::filesystem::path shaderDirectory);
  void shutdown();
  void resize(int width, int height);

  bool uploadCaveMesh(const cave::CpuMesh& mesh);
  bool loadBlockTexture(const TextureSettings& settings, std::string& error);
  void clearBlockTexture();

  void beginFrame(int width, int height);
  ImTextureID renderViewport(const Camera& camera, const LightSettings& light, glm::uvec2 size);
  void renderImGui(ImDrawData* drawData);
  void endFrame();

  [[nodiscard]] RendererStats stats() const { return stats_; }
  [[nodiscard]] bool isInitialized() const { return initialized_; }

private:
  struct Program {
    bgfx::ProgramHandle handle = BGFX_INVALID_HANDLE;
  };

  bool loadPrograms();
  Program loadProgram(const char* vertexName, const char* fragmentName);
  bgfx::ShaderHandle loadShader(const char* name);
  void destroyPrograms();
  void ensureViewportTarget(glm::uvec2 size);
  void ensureShadowTargets(const LightSettings& light);
  void initializeImGuiResources();
  void destroyImGuiResources();
  void createFallbackTexture();

  std::filesystem::path shaderDirectory_;
  bool initialized_ = false;
  int backbufferWidth_ = 1;
  int backbufferHeight_ = 1;

  bgfx::VertexLayout caveLayout_ {};
  bgfx::VertexLayout imguiLayout_ {};

  Program voxelProgram_ {};
  Program imguiProgram_ {};
  Program shadowProgram_ {};

  bgfx::UniformHandle textureUniform_ = BGFX_INVALID_HANDLE;
  bgfx::UniformHandle shadowTextureUniform_ = BGFX_INVALID_HANDLE;
  bgfx::UniformHandle lightPosRadiusUniform_ = BGFX_INVALID_HANDLE;
  bgfx::UniformHandle lightColorUniform_ = BGFX_INVALID_HANDLE;
  bgfx::UniformHandle shadowParamsUniform_ = BGFX_INVALID_HANDLE;

  bgfx::VertexBufferHandle caveVbo_ = BGFX_INVALID_HANDLE;
  bgfx::IndexBufferHandle caveIbo_ = BGFX_INVALID_HANDLE;
  std::uint32_t caveIndexCount_ = 0;
  std::uint32_t caveVertexCount_ = 0;

  bgfx::TextureHandle blockTexture_ = BGFX_INVALID_HANDLE;
  bgfx::TextureHandle fallbackTexture_ = BGFX_INVALID_HANDLE;
  bool useBlockTexture_ = false;

  bgfx::TextureHandle viewportColor_ = BGFX_INVALID_HANDLE;
  bgfx::TextureHandle viewportDepth_ = BGFX_INVALID_HANDLE;
  bgfx::FrameBufferHandle viewportFramebuffer_ = BGFX_INVALID_HANDLE;
  glm::uvec2 viewportSize_ {0, 0};

  bgfx::TextureHandle shadowCube_ = BGFX_INVALID_HANDLE;
  bgfx::TextureHandle shadowDepthFaces_[6] {
    BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE,
    BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE
  };
  bgfx::FrameBufferHandle shadowFaces_[6] {
    BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE,
    BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE, BGFX_INVALID_HANDLE
  };
  int shadowSize_ = 0;

  bgfx::TextureHandle imguiFontTexture_ = BGFX_INVALID_HANDLE;
  bgfx::UniformHandle imguiTextureUniform_ = BGFX_INVALID_HANDLE;

  RendererStats stats_ {};
};

} // namespace dungeon::render
