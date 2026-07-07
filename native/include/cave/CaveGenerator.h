#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <glm/glm.hpp>

namespace dungeon::cave {

constexpr int kChunkSizeX = 32;
constexpr int kChunkSizeY = 16;
constexpr int kChunkSizeZ = 32;
constexpr int kChunkVoxelCount = kChunkSizeX * kChunkSizeY * kChunkSizeZ;
constexpr int kChunkWordCount = kChunkVoxelCount / 64;

enum class LevelSize : std::uint8_t {
  Small,
  Medium,
  Large
};

struct CaveSettings {
  LevelSize levelSize = LevelSize::Medium;
  std::uint32_t seed = 1337;
  float voxelSize = 0.25f;
  float height = 9.0f;
  int mainPathLength = 34;
  int branchCount = 9;
  int branchDepth = 8;
  float deadEndChance = 0.65f;
  float loopChance = 0.12f;
  float chamberChance = 0.26f;
  float chamberSize = 5.0f;
  float erosion = 0.35f;
  float floorWidth = 0.42f;
  float sideRoughness = 0.55f;
  float ceilingVariation = 0.45f;
  float noiseScale = 1.2f;
  int smoothingPasses = 1;
  float asymmetry = 0.25f;
  float wallBulge = 0.45f;
  float pocketStrength = 0.38f;
  int floorClearanceVoxels = 2;
  float uvScaleX = 1.0f;
  float uvScaleY = 1.0f;
  int uvRotationDegrees = 0;
};

struct CaveVertex {
  glm::vec3 position {};
  glm::vec3 normal {};
  glm::vec2 uv {};
  std::uint32_t color = 0xffffffffu;
};

struct CpuMesh {
  std::vector<CaveVertex> vertices;
  std::vector<std::uint32_t> indices;
  glm::vec3 boundsMin {0.0f};
  glm::vec3 boundsMax {0.0f};
  std::uint32_t faceCount = 0;
};

struct VoxelChunk {
  glm::ivec3 coord {0};
  std::array<std::uint64_t, kChunkWordCount> air {};
  glm::vec3 boundsMin {0.0f};
  glm::vec3 boundsMax {0.0f};
};

struct CaveStats {
  int graphNodes = 0;
  int graphEdges = 0;
  int branches = 0;
  int loops = 0;
  int chambers = 0;
  int deadEnds = 0;
  int activeChunks = 0;
  std::uint64_t airVoxels = 0;
  std::uint32_t facesBeforeOptimize = 0;
  std::uint32_t facesAfterOptimize = 0;
  double generationMs = 0.0;
  double meshingMs = 0.0;
  double optimizeMs = 0.0;
  std::size_t meshBytes = 0;
};

struct CaveBuildResult {
  CaveSettings settings {};
  std::vector<VoxelChunk> chunks;
  CpuMesh mesh;
  CaveStats stats;
  glm::vec3 spawnPosition {0.0f, 1.2f, 0.0f};
  std::string warning;
};

class CaveGenerator {
public:
  CaveBuildResult generate(const CaveSettings& settings);

  [[nodiscard]] bool isAir(const CaveBuildResult& cave, glm::vec3 worldPosition) const;
  [[nodiscard]] bool hasHeadroom(const CaveBuildResult& cave, glm::vec3 worldPosition, float height) const;
};

[[nodiscard]] const char* levelSizeName(LevelSize value);
[[nodiscard]] CaveSettings defaultCaveSettings();

} // namespace dungeon::cave
