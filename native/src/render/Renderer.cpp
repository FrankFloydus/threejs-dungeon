#include "render/Renderer.h"

#include <array>
#include <cstring>
#include <cstdio>
#include <fstream>
#include <vector>

#include <SDL3/SDL.h>
#include <SDL3_image/SDL_image.h>
#include <bgfx/platform.h>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <Windows.h>
#endif

namespace dungeon::render {
namespace {

constexpr bgfx::ViewId kShadowViewBase = 0;
constexpr bgfx::ViewId kSceneView = 10;
constexpr bgfx::ViewId kImguiView = 250;

struct ImGuiBgfxVertex {
  float x;
  float y;
  float u;
  float v;
  std::uint32_t abgr;
};

std::vector<std::uint8_t> readBinary(const std::filesystem::path& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return {};
  file.seekg(0, std::ios::end);
  const std::streamsize size = file.tellg();
  file.seekg(0, std::ios::beg);
  std::vector<std::uint8_t> bytes(static_cast<std::size_t>(size));
  file.read(reinterpret_cast<char*>(bytes.data()), size);
  return bytes;
}

void destroyHandle(bgfx::VertexBufferHandle& handle) {
  if (bgfx::isValid(handle)) bgfx::destroy(handle);
  handle = BGFX_INVALID_HANDLE;
}

void destroyHandle(bgfx::IndexBufferHandle& handle) {
  if (bgfx::isValid(handle)) bgfx::destroy(handle);
  handle = BGFX_INVALID_HANDLE;
}

void destroyHandle(bgfx::TextureHandle& handle) {
  if (bgfx::isValid(handle)) bgfx::destroy(handle);
  handle = BGFX_INVALID_HANDLE;
}

void destroyHandle(bgfx::FrameBufferHandle& handle) {
  if (bgfx::isValid(handle)) bgfx::destroy(handle);
  handle = BGFX_INVALID_HANDLE;
}

void destroyHandle(bgfx::UniformHandle& handle) {
  if (bgfx::isValid(handle)) bgfx::destroy(handle);
  handle = BGFX_INVALID_HANDLE;
}

void destroyHandle(bgfx::ProgramHandle& handle) {
  if (bgfx::isValid(handle)) bgfx::destroy(handle);
  handle = BGFX_INVALID_HANDLE;
}

void* nativeWindowHandle(SDL_Window* window) {
#if defined(_WIN32)
  SDL_PropertiesID props = SDL_GetWindowProperties(window);
  return SDL_GetPointerProperty(props, SDL_PROP_WINDOW_WIN32_HWND_POINTER, nullptr);
#else
  (void)window;
  return nullptr;
#endif
}

} // namespace

Renderer::~Renderer() {
  shutdown();
}

bool Renderer::initialize(SDL_Window* window, int width, int height, std::filesystem::path shaderDirectory) {
  if (initialized_) return true;
  shaderDirectory_ = std::move(shaderDirectory);
  backbufferWidth_ = std::max(1, width);
  backbufferHeight_ = std::max(1, height);

  bgfx::PlatformData platformData {};
  platformData.nwh = nativeWindowHandle(window);
  if (!platformData.nwh) {
    std::fprintf(stderr, "BGFX platform init failed: SDL did not provide a native window handle.\n");
    return false;
  }

  bgfx::Init init {};
  init.type = bgfx::RendererType::Vulkan;
  init.platformData = platformData;
  init.resolution.width = static_cast<std::uint32_t>(backbufferWidth_);
  init.resolution.height = static_cast<std::uint32_t>(backbufferHeight_);
  init.resolution.reset = BGFX_RESET_VSYNC;
  if (!bgfx::init(init)) {
    std::fprintf(stderr, "BGFX init failed for RendererType::Vulkan.\n");
    return false;
  }

  stats_.usingVulkan = bgfx::getRendererType() == bgfx::RendererType::Vulkan;

  caveLayout_
    .begin()
    .add(bgfx::Attrib::Position, 3, bgfx::AttribType::Float)
    .add(bgfx::Attrib::Normal, 3, bgfx::AttribType::Float)
    .add(bgfx::Attrib::TexCoord0, 2, bgfx::AttribType::Float)
    .add(bgfx::Attrib::Color0, 4, bgfx::AttribType::Uint8, true)
    .end();

  imguiLayout_
    .begin()
    .add(bgfx::Attrib::Position, 2, bgfx::AttribType::Float)
    .add(bgfx::Attrib::TexCoord0, 2, bgfx::AttribType::Float)
    .add(bgfx::Attrib::Color0, 4, bgfx::AttribType::Uint8, true)
    .end();

  textureUniform_ = bgfx::createUniform("s_tex", bgfx::UniformType::Sampler);
  lightPosRadiusUniform_ = bgfx::createUniform("u_lightPosRadius", bgfx::UniformType::Vec4);
  lightColorUniform_ = bgfx::createUniform("u_lightColor", bgfx::UniformType::Vec4);
  shadowParamsUniform_ = bgfx::createUniform("u_shadowParams", bgfx::UniformType::Vec4);
  imguiTextureUniform_ = bgfx::createUniform("s_tex", bgfx::UniformType::Sampler);

  if (!loadPrograms()) {
    std::fprintf(stderr, "BGFX shader program loading failed from directory: %s\n", shaderDirectory_.string().c_str());
    return false;
  }
  createFallbackTexture();
  initializeImGuiResources();

  initialized_ = true;
  return true;
}

void Renderer::shutdown() {
  if (!initialized_) return;
  destroyImGuiResources();
  destroyHandle(viewportFramebuffer_);
  destroyHandle(viewportColor_);
  destroyHandle(viewportDepth_);
  for (auto& face : shadowFaces_) destroyHandle(face);
  destroyHandle(shadowCube_);
  destroyHandle(blockTexture_);
  destroyHandle(fallbackTexture_);
  destroyHandle(caveVbo_);
  destroyHandle(caveIbo_);
  destroyPrograms();
  destroyHandle(textureUniform_);
  destroyHandle(lightPosRadiusUniform_);
  destroyHandle(lightColorUniform_);
  destroyHandle(shadowParamsUniform_);
  destroyHandle(imguiTextureUniform_);
  bgfx::shutdown();
  initialized_ = false;
}

void Renderer::resize(int width, int height) {
  backbufferWidth_ = std::max(1, width);
  backbufferHeight_ = std::max(1, height);
  bgfx::reset(static_cast<std::uint32_t>(backbufferWidth_), static_cast<std::uint32_t>(backbufferHeight_), BGFX_RESET_VSYNC);
}

bool Renderer::loadPrograms() {
  voxelProgram_ = loadProgram("vs_voxel", "fs_voxel");
  imguiProgram_ = loadProgram("vs_imgui", "fs_imgui");
  shadowProgram_ = loadProgram("vs_shadow", "fs_shadow");
  return bgfx::isValid(voxelProgram_.handle) && bgfx::isValid(imguiProgram_.handle) && bgfx::isValid(shadowProgram_.handle);
}

Renderer::Program Renderer::loadProgram(const char* vertexName, const char* fragmentName) {
  bgfx::ShaderHandle vs = loadShader(vertexName);
  bgfx::ShaderHandle fs = loadShader(fragmentName);
  if (!bgfx::isValid(vs) || !bgfx::isValid(fs)) {
    if (bgfx::isValid(vs)) bgfx::destroy(vs);
    if (bgfx::isValid(fs)) bgfx::destroy(fs);
    return {};
  }
  return {bgfx::createProgram(vs, fs, true)};
}

bgfx::ShaderHandle Renderer::loadShader(const char* name) {
  const auto path = shaderDirectory_ / (std::string(name) + ".bin");
  std::vector<std::uint8_t> bytes = readBinary(path);
  if (bytes.empty()) {
    std::fprintf(stderr, "Missing or empty shader binary: %s\n", path.string().c_str());
    return BGFX_INVALID_HANDLE;
  }
  return bgfx::createShader(bgfx::copy(bytes.data(), static_cast<std::uint32_t>(bytes.size())));
}

void Renderer::destroyPrograms() {
  destroyHandle(voxelProgram_.handle);
  destroyHandle(imguiProgram_.handle);
  destroyHandle(shadowProgram_.handle);
}

bool Renderer::uploadCaveMesh(const cave::CpuMesh& mesh) {
  destroyHandle(caveVbo_);
  destroyHandle(caveIbo_);
  caveIndexCount_ = 0;
  caveVertexCount_ = 0;
  if (mesh.vertices.empty() || mesh.indices.empty()) return false;

  caveVbo_ = bgfx::createVertexBuffer(
    bgfx::copy(mesh.vertices.data(), static_cast<std::uint32_t>(mesh.vertices.size() * sizeof(cave::CaveVertex))),
    caveLayout_
  );
  caveIbo_ = bgfx::createIndexBuffer(
    bgfx::copy(mesh.indices.data(), static_cast<std::uint32_t>(mesh.indices.size() * sizeof(std::uint32_t))),
    BGFX_BUFFER_INDEX32
  );
  caveIndexCount_ = static_cast<std::uint32_t>(mesh.indices.size());
  caveVertexCount_ = static_cast<std::uint32_t>(mesh.vertices.size());
  return bgfx::isValid(caveVbo_) && bgfx::isValid(caveIbo_);
}

bool Renderer::loadBlockTexture(const TextureSettings& settings, std::string& error) {
  error.clear();
  SDL_Surface* loaded = IMG_Load(settings.path.string().c_str());
  if (!loaded) {
    error = SDL_GetError();
    return false;
  }
  SDL_Surface* rgba = SDL_ConvertSurface(loaded, SDL_PIXELFORMAT_RGBA32);
  SDL_DestroySurface(loaded);
  if (!rgba) {
    error = SDL_GetError();
    return false;
  }

  destroyHandle(blockTexture_);
  const std::uint64_t samplerFlags = settings.pixelated
    ? BGFX_SAMPLER_MIN_POINT | BGFX_SAMPLER_MAG_POINT | BGFX_SAMPLER_MIP_POINT
    : 0;
  blockTexture_ = bgfx::createTexture2D(
    static_cast<std::uint16_t>(rgba->w),
    static_cast<std::uint16_t>(rgba->h),
    false,
    1,
    bgfx::TextureFormat::RGBA8,
    samplerFlags,
    bgfx::copy(rgba->pixels, static_cast<std::uint32_t>(rgba->h * rgba->pitch))
  );
  SDL_DestroySurface(rgba);
  useBlockTexture_ = bgfx::isValid(blockTexture_);
  return useBlockTexture_;
}

void Renderer::clearBlockTexture() {
  destroyHandle(blockTexture_);
  useBlockTexture_ = false;
}

void Renderer::createFallbackTexture() {
  std::array<std::uint32_t, 16> pixels {};
  for (int y = 0; y < 4; ++y) {
    for (int x = 0; x < 4; ++x) {
      pixels[static_cast<std::size_t>(y * 4 + x)] = ((x + y) & 1) ? 0xff5d5749u : 0xff958d72u;
    }
  }
  fallbackTexture_ = bgfx::createTexture2D(4, 4, false, 1, bgfx::TextureFormat::RGBA8,
    BGFX_SAMPLER_MIN_POINT | BGFX_SAMPLER_MAG_POINT | BGFX_SAMPLER_MIP_POINT,
    bgfx::copy(pixels.data(), static_cast<std::uint32_t>(pixels.size() * sizeof(std::uint32_t))));
}

void Renderer::beginFrame(int width, int height) {
  stats_.drawCalls = 0;
  stats_.triangles = 0;
  stats_.vertices = caveVertexCount_;
  if (width != backbufferWidth_ || height != backbufferHeight_) resize(width, height);
  bgfx::touch(kImguiView);
}

void Renderer::ensureViewportTarget(glm::uvec2 size) {
  size.x = std::max(1u, size.x);
  size.y = std::max(1u, size.y);
  if (viewportSize_ == size && bgfx::isValid(viewportFramebuffer_)) return;

  destroyHandle(viewportFramebuffer_);
  destroyHandle(viewportColor_);
  destroyHandle(viewportDepth_);

  viewportColor_ = bgfx::createTexture2D(static_cast<std::uint16_t>(size.x), static_cast<std::uint16_t>(size.y),
    false, 1, bgfx::TextureFormat::BGRA8, BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP);
  viewportDepth_ = bgfx::createTexture2D(static_cast<std::uint16_t>(size.x), static_cast<std::uint16_t>(size.y),
    false, 1, bgfx::TextureFormat::D24S8, BGFX_TEXTURE_RT);
  const bgfx::TextureHandle attachments[] = {viewportColor_, viewportDepth_};
  viewportFramebuffer_ = bgfx::createFrameBuffer(2, attachments, false);
  viewportSize_ = size;
}

void Renderer::ensureShadowTargets(const LightSettings& light) {
  if (!light.shadows || light.shadowSize <= 0) return;
  if (shadowSize_ == light.shadowSize && bgfx::isValid(shadowCube_)) return;
  for (auto& face : shadowFaces_) destroyHandle(face);
  destroyHandle(shadowCube_);
  shadowSize_ = light.shadowSize;
  shadowCube_ = bgfx::createTextureCube(static_cast<std::uint16_t>(shadowSize_), false, 1,
    bgfx::TextureFormat::R16F, BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP | BGFX_SAMPLER_W_CLAMP);
  for (std::uint16_t face = 0; face < 6; ++face) {
    bgfx::Attachment attachment {};
    attachment.init(shadowCube_, bgfx::Access::Write, 0, face, 1);
    shadowFaces_[face] = bgfx::createFrameBuffer(1, &attachment, false);
  }
}

ImTextureID Renderer::renderViewport(const Camera& camera, const LightSettings& light, glm::uvec2 size) {
  ensureViewportTarget(size);
  ensureShadowTargets(light);

  bgfx::setViewName(kSceneView, "Cave Preview");
  bgfx::setViewFrameBuffer(kSceneView, viewportFramebuffer_);
  bgfx::setViewRect(kSceneView, 0, 0, static_cast<std::uint16_t>(viewportSize_.x), static_cast<std::uint16_t>(viewportSize_.y));
  bgfx::setViewClear(kSceneView, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 0x101114ff, 1.0f, 0);

  const float aspect = static_cast<float>(viewportSize_.x) / static_cast<float>(std::max(1u, viewportSize_.y));
  const glm::mat4 view = glm::lookAt(camera.position, camera.target, glm::vec3(0.0f, 1.0f, 0.0f));
  const glm::mat4 proj = glm::perspective(camera.fovYRadians, aspect, camera.nearPlane, camera.farPlane);
  bgfx::setViewTransform(kSceneView, glm::value_ptr(view), glm::value_ptr(proj));
  bgfx::touch(kSceneView);

  if (bgfx::isValid(caveVbo_) && bgfx::isValid(caveIbo_) && bgfx::isValid(voxelProgram_.handle)) {
    const glm::mat4 model(1.0f);
    bgfx::setTransform(glm::value_ptr(model));
    bgfx::setVertexBuffer(0, caveVbo_);
    bgfx::setIndexBuffer(caveIbo_);
    const float lightPosRadius[] = {light.position.x, light.position.y, light.position.z, light.radius};
    const float lightColor[] = {light.color.r, light.color.g, light.color.b, 1.0f};
    const float shadowParams[] = {light.shadows ? 1.0f : 0.0f, light.shadowDistance, static_cast<float>(light.shadowSize), 0.0f};
    bgfx::setUniform(lightPosRadiusUniform_, lightPosRadius);
    bgfx::setUniform(lightColorUniform_, lightColor);
    bgfx::setUniform(shadowParamsUniform_, shadowParams);
    bgfx::setTexture(0, textureUniform_, useBlockTexture_ ? blockTexture_ : fallbackTexture_);
    std::uint64_t state = BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A | BGFX_STATE_WRITE_Z | BGFX_STATE_DEPTH_TEST_LESS | BGFX_STATE_MSAA;
    if (light.culling) state |= BGFX_STATE_CULL_CW;
    bgfx::setState(state);
    bgfx::submit(kSceneView, voxelProgram_.handle);
    ++stats_.drawCalls;
    stats_.triangles += caveIndexCount_ / 3;
  }

  return static_cast<ImTextureID>(viewportColor_.idx);
}

void Renderer::initializeImGuiResources() {
  ImGuiIO& io = ImGui::GetIO();
  unsigned char* pixels = nullptr;
  int width = 0;
  int height = 0;
  io.Fonts->GetTexDataAsRGBA32(&pixels, &width, &height);
  imguiFontTexture_ = bgfx::createTexture2D(static_cast<std::uint16_t>(width), static_cast<std::uint16_t>(height),
    false, 1, bgfx::TextureFormat::RGBA8, 0,
    bgfx::copy(pixels, static_cast<std::uint32_t>(width * height * 4)));
  io.Fonts->SetTexID(static_cast<ImTextureID>(imguiFontTexture_.idx));
}

void Renderer::destroyImGuiResources() {
  if (ImGui::GetCurrentContext()) {
    ImGui::GetIO().Fonts->SetTexID(0);
  }
  destroyHandle(imguiFontTexture_);
}

void Renderer::renderImGui(ImDrawData* drawData) {
  if (!drawData || drawData->TotalVtxCount == 0 || !bgfx::isValid(imguiProgram_.handle)) return;

  const int fbWidth = static_cast<int>(drawData->DisplaySize.x * drawData->FramebufferScale.x);
  const int fbHeight = static_cast<int>(drawData->DisplaySize.y * drawData->FramebufferScale.y);
  if (fbWidth <= 0 || fbHeight <= 0) return;

  bgfx::setViewName(kImguiView, "Dear ImGui");
  bgfx::setViewMode(kImguiView, bgfx::ViewMode::Sequential);
  bgfx::setViewRect(kImguiView, 0, 0, static_cast<std::uint16_t>(fbWidth), static_cast<std::uint16_t>(fbHeight));
  const glm::mat4 ortho = glm::ortho(
    drawData->DisplayPos.x,
    drawData->DisplayPos.x + drawData->DisplaySize.x,
    drawData->DisplayPos.y + drawData->DisplaySize.y,
    drawData->DisplayPos.y,
    -1.0f,
    1.0f
  );
  const glm::mat4 view(1.0f);
  bgfx::setViewTransform(kImguiView, glm::value_ptr(view), glm::value_ptr(ortho));

  const ImVec2 clipOffset = drawData->DisplayPos;
  const ImVec2 clipScale = drawData->FramebufferScale;

  for (int listIndex = 0; listIndex < drawData->CmdListsCount; ++listIndex) {
    const ImDrawList* cmdList = drawData->CmdLists[listIndex];
    bgfx::TransientVertexBuffer tvb;
    bgfx::TransientIndexBuffer tib;
    const std::uint32_t vertexCount = static_cast<std::uint32_t>(cmdList->VtxBuffer.Size);
    const std::uint32_t indexCount = static_cast<std::uint32_t>(cmdList->IdxBuffer.Size);
    const bool index32 = sizeof(ImDrawIdx) == 4;
    if (bgfx::getAvailTransientVertexBuffer(vertexCount, imguiLayout_) < vertexCount ||
        bgfx::getAvailTransientIndexBuffer(indexCount, index32) < indexCount) {
      return;
    }
    bgfx::allocTransientVertexBuffer(&tvb, vertexCount, imguiLayout_);
    bgfx::allocTransientIndexBuffer(&tib, indexCount, index32);

    auto* vertices = reinterpret_cast<ImGuiBgfxVertex*>(tvb.data);
    for (int i = 0; i < cmdList->VtxBuffer.Size; ++i) {
      const ImDrawVert& src = cmdList->VtxBuffer[i];
      vertices[i] = {src.pos.x, src.pos.y, src.uv.x, src.uv.y, src.col};
    }
    std::memcpy(tib.data, cmdList->IdxBuffer.Data, static_cast<std::size_t>(indexCount) * sizeof(ImDrawIdx));

    for (const ImDrawCmd& cmd : cmdList->CmdBuffer) {
      if (cmd.UserCallback) {
        cmd.UserCallback(cmdList, &cmd);
        continue;
      }

      const ImVec4 clipRect {
        (cmd.ClipRect.x - clipOffset.x) * clipScale.x,
        (cmd.ClipRect.y - clipOffset.y) * clipScale.y,
        (cmd.ClipRect.z - clipOffset.x) * clipScale.x,
        (cmd.ClipRect.w - clipOffset.y) * clipScale.y
      };
      if (clipRect.x >= fbWidth || clipRect.y >= fbHeight || clipRect.z < 0.0f || clipRect.w < 0.0f) {
        continue;
      }

      const std::uint16_t texIdx = static_cast<std::uint16_t>(cmd.GetTexID());
      bgfx::TextureHandle texture {texIdx};
      bgfx::setScissor(
        static_cast<std::uint16_t>(std::max(0.0f, clipRect.x)),
        static_cast<std::uint16_t>(std::max(0.0f, clipRect.y)),
        static_cast<std::uint16_t>(std::min(static_cast<float>(fbWidth), clipRect.z) - std::max(0.0f, clipRect.x)),
        static_cast<std::uint16_t>(std::min(static_cast<float>(fbHeight), clipRect.w) - std::max(0.0f, clipRect.y))
      );
      bgfx::setTexture(0, imguiTextureUniform_, texture);
      bgfx::setVertexBuffer(0, &tvb, cmd.VtxOffset, vertexCount);
      bgfx::setIndexBuffer(&tib, cmd.IdxOffset, cmd.ElemCount);
      bgfx::setState(BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A | BGFX_STATE_MSAA |
        BGFX_STATE_BLEND_FUNC(BGFX_STATE_BLEND_SRC_ALPHA, BGFX_STATE_BLEND_INV_SRC_ALPHA));
      bgfx::submit(kImguiView, imguiProgram_.handle);
      ++stats_.drawCalls;
    }
  }
}

void Renderer::endFrame() {
  bgfx::frame();
}

} // namespace dungeon::render
