#include "cave/CaveGenerator.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <unordered_map>
#include <vector>

#include <meshoptimizer.h>

namespace dungeon::cave {
namespace {

struct Rng {
  std::uint32_t state = 0x9e3779b9u;

  explicit Rng(std::uint32_t seed)
    : state(seed ? seed : 0x9e3779b9u) {}

  float next() {
    state += 0x6d2b79f5u;
    std::uint32_t value = state;
    value = (value ^ (value >> 15)) * (value | 1u);
    value ^= value + (value ^ (value >> 7)) * (value | 61u);
    return static_cast<float>((value ^ (value >> 14)) & 0x00ffffffu) / static_cast<float>(0x01000000u);
  }

  int range(int minValue, int maxValue) {
    if (maxValue <= minValue) return minValue;
    return minValue + static_cast<int>(next() * static_cast<float>(maxValue - minValue + 1));
  }
};

struct GraphNode {
  glm::ivec3 grid {0};
  glm::vec3 world {0.0f};
  bool chamber = false;
  std::vector<int> edges;
};

struct GraphEdge {
  int a = 0;
  int b = 0;
  float radius = 2.5f;
};

struct Chamber {
  glm::vec3 center {0.0f};
  glm::vec3 radius {4.0f};
};

struct Graph {
  std::vector<GraphNode> nodes;
  std::vector<GraphEdge> edges;
  std::vector<Chamber> chambers;
  int branches = 0;
  int loops = 0;
  int deadEnds = 0;
};

struct ChunkKey {
  int x = 0;
  int y = 0;
  int z = 0;

  bool operator==(const ChunkKey& other) const {
    return x == other.x && y == other.y && z == other.z;
  }
};

struct ChunkKeyHash {
  std::size_t operator()(const ChunkKey& key) const {
    const std::uint64_t x = static_cast<std::uint32_t>(key.x);
    const std::uint64_t y = static_cast<std::uint32_t>(key.y);
    const std::uint64_t z = static_cast<std::uint32_t>(key.z);
    return static_cast<std::size_t>((x * 73856093ull) ^ (y * 19349663ull) ^ (z * 83492791ull));
  }
};

using ChunkMap = std::unordered_map<ChunkKey, VoxelChunk, ChunkKeyHash>;

constexpr glm::ivec3 kHorizontalDirs[] = {
  {0, 0, -1},
  {1, 0, 0},
  {0, 0, 1},
  {-1, 0, 0}
};

constexpr glm::ivec3 kAllDirs[] = {
  {0, 0, -1},
  {1, 0, 0},
  {0, 0, 1},
  {-1, 0, 0},
  {0, 1, 0},
  {0, -1, 0}
};

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

float smoothstep(float edge0, float edge1, float value) {
  const float t = clamp01((value - edge0) / std::max(0.0001f, edge1 - edge0));
  return t * t * (3.0f - 2.0f * t);
}

std::uint32_t hash3(std::uint32_t seed, int x, int y, int z) {
  std::uint32_t h = seed;
  h ^= static_cast<std::uint32_t>(x) * 374761393u;
  h ^= static_cast<std::uint32_t>(y) * 668265263u;
  h ^= static_cast<std::uint32_t>(z) * 2246822519u;
  h = (h ^ (h >> 15)) * 2246822507u;
  h = (h ^ (h >> 13)) * 3266489909u;
  return h ^ (h >> 16);
}

float hashFloat(std::uint32_t seed, int x, int y, int z) {
  return static_cast<float>(hash3(seed, x, y, z) & 0x00ffffffu) / static_cast<float>(0x01000000u);
}

float valueNoise3(std::uint32_t seed, glm::vec3 p) {
  const glm::ivec3 i = glm::floor(p);
  const glm::vec3 f = p - glm::vec3(i);
  const glm::vec3 s {
    smoothstep(0.0f, 1.0f, f.x),
    smoothstep(0.0f, 1.0f, f.y),
    smoothstep(0.0f, 1.0f, f.z)
  };

  auto sample = [&](int dx, int dy, int dz) {
    return hashFloat(seed, i.x + dx, i.y + dy, i.z + dz);
  };

  const float x00 = std::lerp(sample(0, 0, 0), sample(1, 0, 0), s.x);
  const float x10 = std::lerp(sample(0, 1, 0), sample(1, 1, 0), s.x);
  const float x01 = std::lerp(sample(0, 0, 1), sample(1, 0, 1), s.x);
  const float x11 = std::lerp(sample(0, 1, 1), sample(1, 1, 1), s.x);
  return std::lerp(std::lerp(x00, x10, s.y), std::lerp(x01, x11, s.y), s.z);
}

float fbm3(std::uint32_t seed, glm::vec3 p) {
  float value = 0.0f;
  float amplitude = 0.55f;
  float total = 0.0f;
  for (int octave = 0; octave < 5; ++octave) {
    value += (valueNoise3(seed + static_cast<std::uint32_t>(octave * 101), p) * 2.0f - 1.0f) * amplitude;
    total += amplitude;
    p *= 2.03f;
    amplitude *= 0.52f;
  }
  return value / std::max(0.0001f, total);
}

int floorDiv(int value, int divisor) {
  int q = value / divisor;
  const int r = value % divisor;
  if (r != 0 && ((r < 0) != (divisor < 0))) --q;
  return q;
}

int floorToVoxel(float value, float voxelSize) {
  return static_cast<int>(std::floor(value / voxelSize));
}

int bitIndex(int x, int y, int z) {
  return (z * kChunkSizeY + y) * kChunkSizeX + x;
}

bool getBit(const VoxelChunk& chunk, int x, int y, int z) {
  const int bit = bitIndex(x, y, z);
  return (chunk.air[bit / 64] & (1ull << (bit % 64))) != 0;
}

void setBit(VoxelChunk& chunk, int x, int y, int z) {
  const int bit = bitIndex(x, y, z);
  chunk.air[bit / 64] |= 1ull << (bit % 64);
}

bool hasAnyAir(const VoxelChunk& chunk) {
  return std::any_of(chunk.air.begin(), chunk.air.end(), [](std::uint64_t word) { return word != 0; });
}

float sizeScale(LevelSize levelSize) {
  switch (levelSize) {
    case LevelSize::Small: return 0.68f;
    case LevelSize::Large: return 1.38f;
    case LevelSize::Medium:
    default: return 1.0f;
  }
}

std::uint64_t nodeKey(glm::ivec3 p) {
  const std::uint64_t x = static_cast<std::uint32_t>(p.x + 32768) & 0xffffu;
  const std::uint64_t y = static_cast<std::uint32_t>(p.y + 32768) & 0xffffu;
  const std::uint64_t z = static_cast<std::uint32_t>(p.z + 32768) & 0xffffu;
  return (x << 32) | (y << 16) | z;
}

glm::vec3 gridToWorld(glm::ivec3 grid, float graphStep, float centerY, float yStep) {
  return {
    static_cast<float>(grid.x) * graphStep,
    centerY + static_cast<float>(grid.y) * yStep,
    static_cast<float>(grid.z) * graphStep
  };
}

int addNode(Graph& graph, std::unordered_map<std::uint64_t, int>& lookup, glm::ivec3 grid, float graphStep, float centerY, float yStep) {
  const auto key = nodeKey(grid);
  if (auto it = lookup.find(key); it != lookup.end()) return it->second;
  const int id = static_cast<int>(graph.nodes.size());
  GraphNode node;
  node.grid = grid;
  node.world = gridToWorld(grid, graphStep, centerY, yStep);
  graph.nodes.push_back(node);
  lookup.emplace(key, id);
  return id;
}

void connect(Graph& graph, int a, int b, float radius) {
  if (a == b) return;
  auto exists = [&](const std::vector<int>& edges, int value) {
    return std::find(edges.begin(), edges.end(), value) != edges.end();
  };
  if (!exists(graph.nodes[a].edges, b)) graph.nodes[a].edges.push_back(b);
  if (!exists(graph.nodes[b].edges, a)) graph.nodes[b].edges.push_back(a);
  const bool edgeExists = std::any_of(graph.edges.begin(), graph.edges.end(), [&](const GraphEdge& edge) {
    return (edge.a == a && edge.b == b) || (edge.a == b && edge.b == a);
  });
  if (!edgeExists) graph.edges.push_back({a, b, radius});
}

int chooseDirection(Rng& rng, int previous, float turnChance, float verticalChance) {
  if (previous >= 0 && rng.next() > turnChance) return previous;
  if (rng.next() < verticalChance) return rng.next() > 0.5f ? 4 : 5;
  if (previous < 0 || previous >= 4) return rng.range(0, 3);
  const int options[] = {previous, (previous + 1) % 4, (previous + 3) % 4};
  return options[rng.range(0, 2)];
}

bool directionAllowed(glm::ivec3 grid, int direction, int minGridY, int maxGridY) {
  const glm::ivec3 next = grid + kAllDirs[direction];
  return next.y >= minGridY && next.y <= maxGridY;
}

int chooseAllowedDirection(Rng& rng, glm::ivec3 grid, int previous, float turnChance, float verticalChance, int minGridY, int maxGridY) {
  for (int tries = 0; tries < 8; ++tries) {
    const int direction = chooseDirection(rng, previous, turnChance, verticalChance);
    if (directionAllowed(grid, direction, minGridY, maxGridY)) return direction;
  }
  return rng.range(0, 3);
}

Graph buildGraph(const CaveSettings& settings) {
  Graph graph;
  Rng rng(settings.seed);
  std::unordered_map<std::uint64_t, int> lookup;

  const float scale = sizeScale(settings.levelSize);
  const float graphStep = 5.0f;
  const float centerY = std::max(2.0f, settings.height * 0.42f);
  const float yStep = std::max(1.0f, settings.height * 0.16f);
  const int minGridY = static_cast<int>(std::floor((1.2f - centerY) / yStep));
  const int maxGridY = static_cast<int>(std::ceil((settings.height - 1.2f - centerY) / yStep));
  const int mainPath = std::max(4, static_cast<int>(std::round(settings.mainPathLength * scale)));
  const int branchCount = std::max(0, static_cast<int>(std::round(settings.branchCount * scale)));
  const int branchDepth = std::max(1, static_cast<int>(std::round(settings.branchDepth * (0.82f + scale * 0.18f))));
  const float baseRadius = std::max(1.1f, 1.55f + settings.floorWidth * 2.0f + settings.erosion * 0.65f);

  int current = addNode(graph, lookup, {0, 0, 0}, graphStep, centerY, yStep);
  std::vector<int> mainNodes {current};
  int direction = rng.range(0, 3);
  for (int i = 0; i < mainPath; ++i) {
    direction = chooseAllowedDirection(rng, graph.nodes[current].grid, direction, 0.34f, 0.10f, minGridY, maxGridY);
    const glm::ivec3 nextGrid = graph.nodes[current].grid + kAllDirs[direction];
    const int next = addNode(graph, lookup, nextGrid, graphStep, centerY, yStep);
    connect(graph, current, next, baseRadius * (0.9f + rng.next() * 0.28f));
    current = next;
    mainNodes.push_back(current);
  }

  for (int branch = 0; branch < branchCount; ++branch) {
    if (mainNodes.size() < 5) break;
    int branchNode = mainNodes[static_cast<std::size_t>(rng.range(2, static_cast<int>(mainNodes.size()) - 3))];
    int branchDirection = chooseAllowedDirection(rng, graph.nodes[branchNode].grid, -1, 1.0f, 0.18f, minGridY, maxGridY);
    ++graph.branches;

    const int depth = std::max(1, branchDepth + static_cast<int>((rng.next() - 0.5f) * branchDepth * 0.75f));
    for (int step = 0; step < depth; ++step) {
      branchDirection = chooseAllowedDirection(rng, graph.nodes[branchNode].grid, branchDirection, 0.48f, 0.16f, minGridY, maxGridY);
      const glm::ivec3 nextGrid = graph.nodes[branchNode].grid + kAllDirs[branchDirection];
      const int next = addNode(graph, lookup, nextGrid, graphStep, centerY, yStep);
      connect(graph, branchNode, next, baseRadius * (0.74f + rng.next() * 0.32f));
      branchNode = next;
      if (step > 2 && rng.next() < settings.deadEndChance) break;
    }
    if (graph.nodes[branchNode].edges.size() == 1) ++graph.deadEnds;
  }

  for (int a = 0; a < static_cast<int>(graph.nodes.size()); ++a) {
    if (rng.next() > settings.loopChance) continue;
    int best = -1;
    int bestDistance = 4;
    for (int b = a + 1; b < static_cast<int>(graph.nodes.size()); ++b) {
      const glm::ivec3 delta = graph.nodes[a].grid - graph.nodes[b].grid;
      const int distance = std::abs(delta.x) + std::abs(delta.y) + std::abs(delta.z);
      if (distance > 1 && distance <= bestDistance) {
        const bool already = std::find(graph.nodes[a].edges.begin(), graph.nodes[a].edges.end(), b) != graph.nodes[a].edges.end();
        if (!already) {
          best = b;
          bestDistance = distance;
        }
      }
    }
    if (best >= 0) {
      connect(graph, a, best, baseRadius * 0.8f);
      ++graph.loops;
    }
  }

  for (GraphNode& node : graph.nodes) {
    const bool endpoint = node.edges.size() == 1;
    const bool junction = node.edges.size() >= 3;
    if ((endpoint || junction || rng.next() > 0.76f) && rng.next() < settings.chamberChance) {
      node.chamber = true;
    }
  }
  if (!graph.nodes.empty()) graph.nodes.front().chamber = true;

  for (const GraphNode& node : graph.nodes) {
    if (!node.chamber) continue;
    const float rx = settings.chamberSize * (0.92f + rng.next() * 0.5f);
    const float rz = settings.chamberSize * (0.92f + rng.next() * 0.5f);
    const float ry = std::min(settings.height * 0.42f, settings.chamberSize * (0.58f + rng.next() * 0.45f));
    graph.chambers.push_back({node.world, {rx, std::max(1.25f, ry), rz}});
  }

  return graph;
}

float distanceToSegment(glm::vec3 p, glm::vec3 a, glm::vec3 b) {
  const glm::vec3 ab = b - a;
  const float denom = std::max(0.0001f, glm::dot(ab, ab));
  const float t = clamp01(glm::dot(p - a, ab) / denom);
  return glm::length(p - (a + ab * t));
}

float distanceToSegmentXZ(glm::vec3 p, glm::vec3 a, glm::vec3 b) {
  const glm::vec2 pp {p.x, p.z};
  const glm::vec2 aa {a.x, a.z};
  const glm::vec2 bb {b.x, b.z};
  const glm::vec2 ab = bb - aa;
  const float denom = std::max(0.0001f, glm::dot(ab, ab));
  const float t = clamp01(glm::dot(pp - aa, ab) / denom);
  return glm::length(pp - (aa + ab * t));
}

float caveSdf(glm::vec3 p, const Graph& graph) {
  float best = std::numeric_limits<float>::max();
  for (const GraphEdge& edge : graph.edges) {
    const glm::vec3 a = graph.nodes[edge.a].world;
    const glm::vec3 b = graph.nodes[edge.b].world;
    best = std::min(best, distanceToSegment(p, a, b) - edge.radius);
  }
  for (const Chamber& chamber : graph.chambers) {
    const glm::vec3 q = (p - chamber.center) / chamber.radius;
    const float sdf = (glm::length(q) - 1.0f) * std::min({chamber.radius.x, chamber.radius.y, chamber.radius.z});
    best = std::min(best, sdf);
  }
  return best;
}

float floorSupportSdf(glm::vec3 p, const Graph& graph) {
  float best = std::numeric_limits<float>::max();
  for (const GraphEdge& edge : graph.edges) {
    const glm::vec3 a = graph.nodes[edge.a].world;
    const glm::vec3 b = graph.nodes[edge.b].world;
    best = std::min(best, distanceToSegmentXZ(p, a, b) - edge.radius * 0.62f);
  }
  for (const Chamber& chamber : graph.chambers) {
    const glm::vec2 q = (glm::vec2(p.x, p.z) - glm::vec2(chamber.center.x, chamber.center.z)) / glm::vec2(chamber.radius.x, chamber.radius.z);
    const float sdf = (glm::length(q) - 1.0f) * std::min(chamber.radius.x, chamber.radius.z);
    best = std::min(best, sdf);
  }
  return best;
}

bool evaluateAir(glm::vec3 p, const Graph& graph, const CaveSettings& settings) {
  if (p.y < 0.0f || p.y > settings.height) return false;

  const float scale = std::max(0.15f, settings.noiseScale);
  const glm::vec3 domainWarp {
    fbm3(settings.seed + 101u, p / (8.0f * scale)),
    fbm3(settings.seed + 131u, p / (7.0f * scale)),
    fbm3(settings.seed + 151u, p / (8.5f * scale))
  };
  const glm::vec3 warped = p + domainWarp * (0.35f + settings.asymmetry * 2.4f);
  const float sdf = caveSdf(warped, graph);
  const float wallNoise = fbm3(settings.seed + 191u, warped / (3.8f * scale)) * (0.45f + settings.sideRoughness * 1.35f);
  const float pocketNoise = std::max(0.0f, fbm3(settings.seed + 257u, p / (2.2f * scale)) - 0.18f) * settings.pocketStrength * 1.8f;
  const float vertical = p.y / std::max(0.001f, settings.height);
  const float ceilingBreakup = smoothstep(0.38f, 1.0f, vertical) * settings.ceilingVariation *
    fbm3(settings.seed + 313u, p / (2.8f * scale)) * 1.5f;
  const float density = sdf - wallNoise - pocketNoise - ceilingBreakup - settings.wallBulge * 0.75f - settings.erosion * 0.55f;

  if (density <= 0.0f) return true;

  const float floorHeight = static_cast<float>(std::max(1, settings.floorClearanceVoxels)) * settings.voxelSize;
  if (p.y <= floorHeight && floorSupportSdf(p, graph) < 0.0f) return true;
  return false;
}

ChunkKey toChunkKey(int vx, int vy, int vz) {
  return {floorDiv(vx, kChunkSizeX), floorDiv(vy, kChunkSizeY), floorDiv(vz, kChunkSizeZ)};
}

VoxelChunk& ensureChunk(ChunkMap& chunks, ChunkKey key, float voxelSize) {
  auto [it, inserted] = chunks.try_emplace(key);
  VoxelChunk& chunk = it->second;
  if (inserted) {
    chunk.coord = {key.x, key.y, key.z};
    chunk.boundsMin = glm::vec3(key.x * kChunkSizeX, key.y * kChunkSizeY, key.z * kChunkSizeZ) * voxelSize;
    chunk.boundsMax = chunk.boundsMin + glm::vec3(kChunkSizeX, kChunkSizeY, kChunkSizeZ) * voxelSize;
  }
  return chunk;
}

void markChunkRange(ChunkMap& chunks, glm::vec3 minWorld, glm::vec3 maxWorld, float voxelSize) {
  const int minX = floorToVoxel(minWorld.x, voxelSize);
  const int minY = std::max(0, floorToVoxel(minWorld.y, voxelSize));
  const int minZ = floorToVoxel(minWorld.z, voxelSize);
  const int maxX = floorToVoxel(maxWorld.x, voxelSize);
  const int maxY = std::max(0, floorToVoxel(maxWorld.y, voxelSize));
  const int maxZ = floorToVoxel(maxWorld.z, voxelSize);
  const ChunkKey cmin = toChunkKey(minX, minY, minZ);
  const ChunkKey cmax = toChunkKey(maxX, maxY, maxZ);
  for (int z = cmin.z; z <= cmax.z; ++z) {
    for (int y = cmin.y; y <= cmax.y; ++y) {
      for (int x = cmin.x; x <= cmax.x; ++x) {
        ensureChunk(chunks, {x, y, z}, voxelSize);
      }
    }
  }
}

ChunkMap collectCandidateChunks(const Graph& graph, const CaveSettings& settings) {
  ChunkMap chunks;
  for (const GraphEdge& edge : graph.edges) {
    const glm::vec3 a = graph.nodes[edge.a].world;
    const glm::vec3 b = graph.nodes[edge.b].world;
    const float pad = edge.radius + settings.sideRoughness * 2.2f + settings.pocketStrength * 1.6f + 2.0f;
    markChunkRange(chunks, glm::min(a, b) - glm::vec3(pad), glm::max(a, b) + glm::vec3(pad), settings.voxelSize);
  }
  for (const Chamber& chamber : graph.chambers) {
    const glm::vec3 pad = chamber.radius + glm::vec3(2.5f + settings.pocketStrength * 1.4f);
    markChunkRange(chunks, chamber.center - pad, chamber.center + pad, settings.voxelSize);
  }
  return chunks;
}

void fillChunks(ChunkMap& chunks, const Graph& graph, const CaveSettings& settings, CaveStats& stats) {
  for (auto& [key, chunk] : chunks) {
    (void)key;
    for (int z = 0; z < kChunkSizeZ; ++z) {
      const int absZ = chunk.coord.z * kChunkSizeZ + z;
      for (int y = 0; y < kChunkSizeY; ++y) {
        const int absY = chunk.coord.y * kChunkSizeY + y;
        for (int x = 0; x < kChunkSizeX; ++x) {
          const int absX = chunk.coord.x * kChunkSizeX + x;
          const glm::vec3 p = (glm::vec3(absX, absY, absZ) + glm::vec3(0.5f)) * settings.voxelSize;
          if (evaluateAir(p, graph, settings)) {
            setBit(chunk, x, y, z);
            ++stats.airVoxels;
          }
        }
      }
    }
  }
}

const VoxelChunk* findChunk(const ChunkMap& chunks, ChunkKey key) {
  auto it = chunks.find(key);
  return it == chunks.end() ? nullptr : &it->second;
}

bool isAirVoxel(const ChunkMap& chunks, int vx, int vy, int vz) {
  if (vy < 0) return false;
  const ChunkKey key = toChunkKey(vx, vy, vz);
  const VoxelChunk* chunk = findChunk(chunks, key);
  if (!chunk) return false;
  const int lx = vx - key.x * kChunkSizeX;
  const int ly = vy - key.y * kChunkSizeY;
  const int lz = vz - key.z * kChunkSizeZ;
  return lx >= 0 && ly >= 0 && lz >= 0 && lx < kChunkSizeX && ly < kChunkSizeY && lz < kChunkSizeZ && getBit(*chunk, lx, ly, lz);
}

std::uint32_t packColor(float r, float g, float b, float a = 1.0f) {
  auto toByte = [](float value) {
    return static_cast<std::uint32_t>(std::clamp(value, 0.0f, 1.0f) * 255.0f + 0.5f);
  };
  return toByte(r) | (toByte(g) << 8) | (toByte(b) << 16) | (toByte(a) << 24);
}

glm::vec2 rotateUv(glm::vec2 uv, int degrees) {
  switch (((degrees % 360) + 360) % 360) {
    case 90: return {uv.y, 1.0f - uv.x};
    case 180: return {1.0f - uv.x, 1.0f - uv.y};
    case 270: return {1.0f - uv.y, uv.x};
    default: return uv;
  }
}

glm::vec2 projectedUv(glm::vec3 p, glm::vec3 normal, const CaveSettings& settings) {
  glm::vec2 uv;
  if (std::abs(normal.y) > 0.5f) uv = {p.x, p.z};
  else if (std::abs(normal.z) > 0.5f) uv = {p.x, p.y};
  else uv = {p.z, p.y};
  uv.x /= std::max(0.1f, settings.uvScaleX);
  uv.y /= std::max(0.1f, settings.uvScaleY);
  return rotateUv(glm::fract(uv), settings.uvRotationDegrees);
}

void addQuad(CpuMesh& mesh, const std::array<glm::vec3, 4>& corners, glm::vec3 normal, const CaveSettings& settings) {
  const std::uint32_t base = static_cast<std::uint32_t>(mesh.vertices.size());
  const float shade = normal.y > 0.5f ? 0.88f : (normal.y < -0.5f ? 0.52f : 0.68f);
  const std::uint32_t color = packColor(0.58f * shade, 0.55f * shade, 0.48f * shade);
  for (const glm::vec3& corner : corners) {
    mesh.vertices.push_back({corner, normal, projectedUv(corner, normal, settings), color});
    mesh.boundsMin = glm::min(mesh.boundsMin, corner);
    mesh.boundsMax = glm::max(mesh.boundsMax, corner);
  }
  mesh.indices.insert(mesh.indices.end(), {base, base + 1, base + 2, base, base + 2, base + 3});
  ++mesh.faceCount;
}

void addVoxelFace(CpuMesh& mesh, int vx, int vy, int vz, int dir, float s, const CaveSettings& settings) {
  const float x = static_cast<float>(vx) * s;
  const float y = static_cast<float>(vy) * s;
  const float z = static_cast<float>(vz) * s;
  const float x1 = x + s;
  const float y1 = y + s;
  const float z1 = z + s;

  switch (dir) {
    case 0:
      addQuad(mesh, {{{x1, y, z}, {x1, y1, z}, {x, y1, z}, {x, y, z}}}, {0, 0, 1}, settings);
      break;
    case 1:
      addQuad(mesh, {{{x1, y, z1}, {x1, y1, z1}, {x1, y1, z}, {x1, y, z}}}, {-1, 0, 0}, settings);
      break;
    case 2:
      addQuad(mesh, {{{x, y, z1}, {x, y1, z1}, {x1, y1, z1}, {x1, y, z1}}}, {0, 0, -1}, settings);
      break;
    case 3:
      addQuad(mesh, {{{x, y, z}, {x, y1, z}, {x, y1, z1}, {x, y, z1}}}, {1, 0, 0}, settings);
      break;
    case 4:
      addQuad(mesh, {{{x, y1, z}, {x1, y1, z}, {x1, y1, z1}, {x, y1, z1}}}, {0, -1, 0}, settings);
      break;
    case 5:
      addQuad(mesh, {{{x, y, z1}, {x1, y, z1}, {x1, y, z}, {x, y, z}}}, {0, 1, 0}, settings);
      break;
    default:
      break;
  }
}

CpuMesh buildMesh(const ChunkMap& chunks, const CaveSettings& settings) {
  CpuMesh mesh;
  mesh.boundsMin = glm::vec3(std::numeric_limits<float>::max());
  mesh.boundsMax = glm::vec3(std::numeric_limits<float>::lowest());
  const glm::ivec3 dirs[] = {
    {0, 0, -1},
    {1, 0, 0},
    {0, 0, 1},
    {-1, 0, 0},
    {0, 1, 0},
    {0, -1, 0}
  };
  for (const auto& [key, chunk] : chunks) {
    (void)key;
    for (int z = 0; z < kChunkSizeZ; ++z) {
      const int absZ = chunk.coord.z * kChunkSizeZ + z;
      for (int y = 0; y < kChunkSizeY; ++y) {
        const int absY = chunk.coord.y * kChunkSizeY + y;
        for (int x = 0; x < kChunkSizeX; ++x) {
          if (!getBit(chunk, x, y, z)) continue;
          const int absX = chunk.coord.x * kChunkSizeX + x;
          for (int dir = 0; dir < 6; ++dir) {
            const glm::ivec3 n = glm::ivec3(absX, absY, absZ) + dirs[dir];
            if (!isAirVoxel(chunks, n.x, n.y, n.z)) {
              addVoxelFace(mesh, absX, absY, absZ, dir, settings.voxelSize, settings);
            }
          }
        }
      }
    }
  }
  if (mesh.vertices.empty()) {
    mesh.boundsMin = glm::vec3(0.0f);
    mesh.boundsMax = glm::vec3(0.0f);
  }
  return mesh;
}

void optimizeMesh(CpuMesh& mesh) {
  if (mesh.vertices.empty() || mesh.indices.empty()) return;

  std::vector<unsigned int> remap(mesh.vertices.size());
  const std::size_t vertexCount = meshopt_generateVertexRemap(
    remap.data(),
    mesh.indices.data(),
    mesh.indices.size(),
    mesh.vertices.data(),
    mesh.vertices.size(),
    sizeof(CaveVertex)
  );

  std::vector<CaveVertex> remappedVertices(vertexCount);
  std::vector<std::uint32_t> remappedIndices(mesh.indices.size());
  meshopt_remapVertexBuffer(remappedVertices.data(), mesh.vertices.data(), mesh.vertices.size(), sizeof(CaveVertex), remap.data());
  meshopt_remapIndexBuffer(remappedIndices.data(), mesh.indices.data(), mesh.indices.size(), remap.data());

  meshopt_optimizeVertexCache(remappedIndices.data(), remappedIndices.data(), remappedIndices.size(), vertexCount);
  meshopt_optimizeOverdraw(remappedIndices.data(), remappedIndices.data(), remappedIndices.size(),
    &remappedVertices[0].position.x, vertexCount, sizeof(CaveVertex), 1.05f);
  std::vector<CaveVertex> fetchedVertices(vertexCount);
  meshopt_optimizeVertexFetch(fetchedVertices.data(), remappedIndices.data(), remappedIndices.size(),
    remappedVertices.data(), vertexCount, sizeof(CaveVertex));

  mesh.vertices = std::move(fetchedVertices);
  mesh.indices = std::move(remappedIndices);
}

template <typename Clock = std::chrono::steady_clock>
double elapsedMs(typename Clock::time_point start, typename Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

} // namespace

const char* levelSizeName(LevelSize value) {
  switch (value) {
    case LevelSize::Small: return "Small";
    case LevelSize::Large: return "Large";
    case LevelSize::Medium:
    default: return "Medium";
  }
}

CaveSettings defaultCaveSettings() {
  return {};
}

CaveBuildResult CaveGenerator::generate(const CaveSettings& settings) {
  const auto totalStart = std::chrono::steady_clock::now();
  CaveBuildResult result;
  result.settings = settings;

  Graph graph = buildGraph(settings);
  result.stats.graphNodes = static_cast<int>(graph.nodes.size());
  result.stats.graphEdges = static_cast<int>(graph.edges.size());
  result.stats.branches = graph.branches;
  result.stats.loops = graph.loops;
  result.stats.deadEnds = graph.deadEnds;
  result.stats.chambers = static_cast<int>(graph.chambers.size());

  ChunkMap chunks = collectCandidateChunks(graph, settings);

  const auto fillStart = std::chrono::steady_clock::now();
  fillChunks(chunks, graph, settings, result.stats);
  for (auto it = chunks.begin(); it != chunks.end();) {
    if (!hasAnyAir(it->second)) it = chunks.erase(it);
    else ++it;
  }
  result.stats.activeChunks = static_cast<int>(chunks.size());
  const auto fillEnd = std::chrono::steady_clock::now();

  const auto meshStart = std::chrono::steady_clock::now();
  result.mesh = buildMesh(chunks, settings);
  result.stats.facesBeforeOptimize = result.mesh.faceCount;
  const auto meshEnd = std::chrono::steady_clock::now();

  const auto optimizeStart = std::chrono::steady_clock::now();
  optimizeMesh(result.mesh);
  const auto optimizeEnd = std::chrono::steady_clock::now();
  result.stats.facesAfterOptimize = result.mesh.faceCount;
  result.stats.meshBytes = result.mesh.vertices.size() * sizeof(CaveVertex) + result.mesh.indices.size() * sizeof(std::uint32_t);

  result.chunks.reserve(chunks.size());
  for (auto& [key, chunk] : chunks) {
    (void)key;
    result.chunks.push_back(std::move(chunk));
  }

  if (!graph.nodes.empty()) {
    result.spawnPosition = graph.nodes.front().world;
    result.spawnPosition.y = std::max(settings.voxelSize * 2.0f, result.spawnPosition.y);
  }
  if (settings.voxelSize <= 0.25f && settings.levelSize == LevelSize::Large) {
    result.warning = "Large 0.25 voxel caves are experimental; use medium for the v1 performance target.";
  }

  result.stats.generationMs = elapsedMs(totalStart, fillEnd);
  result.stats.meshingMs = elapsedMs(meshStart, meshEnd);
  result.stats.optimizeMs = elapsedMs(optimizeStart, optimizeEnd);
  return result;
}

bool CaveGenerator::isAir(const CaveBuildResult& cave, glm::vec3 worldPosition) const {
  const int vx = floorToVoxel(worldPosition.x, cave.settings.voxelSize);
  const int vy = floorToVoxel(worldPosition.y, cave.settings.voxelSize);
  const int vz = floorToVoxel(worldPosition.z, cave.settings.voxelSize);
  const ChunkKey key = toChunkKey(vx, vy, vz);
  const auto it = std::find_if(cave.chunks.begin(), cave.chunks.end(), [&](const VoxelChunk& chunk) {
    return chunk.coord.x == key.x && chunk.coord.y == key.y && chunk.coord.z == key.z;
  });
  if (it == cave.chunks.end()) return false;
  const int lx = vx - key.x * kChunkSizeX;
  const int ly = vy - key.y * kChunkSizeY;
  const int lz = vz - key.z * kChunkSizeZ;
  return lx >= 0 && ly >= 0 && lz >= 0 && lx < kChunkSizeX && ly < kChunkSizeY && lz < kChunkSizeZ && getBit(*it, lx, ly, lz);
}

bool CaveGenerator::hasHeadroom(const CaveBuildResult& cave, glm::vec3 worldPosition, float height) const {
  if (!isAir(cave, worldPosition)) return false;
  const int steps = std::max(1, static_cast<int>(std::ceil(height / cave.settings.voxelSize)));
  for (int i = 1; i <= steps; ++i) {
    glm::vec3 sample = worldPosition;
    sample.y += static_cast<float>(i) * cave.settings.voxelSize;
    if (!isAir(cave, sample)) return false;
  }
  return true;
}

} // namespace dungeon::cave
