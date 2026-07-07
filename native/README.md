# Dungeon Gen Native

Native C++ prototype for the procedural voxel cave tool. It is separate from the existing web prototype and ports the JS-style 3D viewport into SDL3, Dear ImGui docking, bgfx, and meshoptimizer.

## What It Builds

- SDL3 window and game loop.
- Dear ImGui docking workspace with a navigable 3D viewport, settings sidebar, and stats panel.
- BGFX renderer initialized with Vulkan and offscreen viewport rendering.
- Sparse 3D voxel cave generation from a 3D graph skeleton, not a 2D floor grid.
- Exposed-face voxel meshing with meshoptimizer vertex/index optimization.
- Texture loading for PNG, JPG, and WebP block textures.
- Preview orbit/pan/zoom and basic flat-floor Play Mode collision through the 3D voxel field.
- Idle startup: the app opens to the viewport and waits for `Generate` instead of generating immediately.

## Dependencies

The vcpkg manifest requests:

- `sdl3[vulkan]`
- `sdl3-image[png,jpeg,webp]`
- `imgui[docking-experimental,sdl3-binding]`
- `bgfx[multithreaded,tools]`
- `meshoptimizer`
- `glm`

## Configure And Build

From the repo root:

```powershell
cmake -S native -B native/build -G Ninja `
  -DCMAKE_TOOLCHAIN_FILE="C:/Users/Drako/vcpkg/scripts/buildsystems/vcpkg.cmake" `
  -DVCPKG_TARGET_TRIPLET=x64-windows

cmake --build native/build --config Release
```

Run:

```powershell
.\native\build\dungeon_native.exe
```

For a Visual Studio generator, use a separate build directory and pass `--config` when building and running.

## Controls

- Middle mouse drag: orbit the preview camera.
- Shift + middle mouse drag: pan.
- Mouse wheel: zoom.
- Right mouse drag in Play Mode: look.
- WASD in Play Mode: move through walkable cave air cells.

## Notes

The native generator is chunked and volumetric so it can scale toward smaller voxel sizes such as `0.25`. Large levels at `0.25` are still flagged experimental in v1 because generation, meshing, and upload work need profiling before raising the target confidently.

Point-light shading is active. Point-light shadows are intentionally disabled in the UI until the BGFX shadow pass is completed.
