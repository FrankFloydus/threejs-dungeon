cmake_minimum_required(VERSION 3.27)

project(DungeonTunnelsNative VERSION 0.1.0 LANGUAGES CXX)

if(NOT CMAKE_CONFIGURATION_TYPES AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(SDL3 CONFIG REQUIRED)
find_package(SDL3_image CONFIG REQUIRED)
find_package(imgui CONFIG REQUIRED)
find_package(bgfx CONFIG REQUIRED)
find_package(glm CONFIG REQUIRED)
find_package(meshoptimizer CONFIG REQUIRED)

set(NATIVE_SRC
  src/main.cpp
  src/app/App.cpp
  src/cave/CaveGenerator.cpp
  src/render/Renderer.cpp
)

add_executable(dungeon_native ${NATIVE_SRC})

target_include_directories(dungeon_native PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
  ${CMAKE_CURRENT_BINARY_DIR}/generated
)

target_link_libraries(dungeon_native PRIVATE
  SDL3::SDL3
  SDL3_image::SDL3_image
  imgui::imgui
  bgfx::bgfx
  bgfx::bx
  bgfx::bimg
  bgfx::bimg_decode
  glm::glm
  meshoptimizer::meshoptimizer
)

target_compile_definitions(dungeon_native PRIVATE
  NOMINMAX
  SDL_MAIN_HANDLED
)

if(MSVC)
  target_compile_options(dungeon_native PRIVATE /W4 /permissive- /EHsc /Zc:__cplusplus /Zc:preprocessor)
else()
  target_compile_options(dungeon_native PRIVATE -Wall -Wextra -Wpedantic)
endif()

set(SHADER_OUT_DIR ${CMAKE_CURRENT_BINARY_DIR}/generated/shaders)
file(MAKE_DIRECTORY ${SHADER_OUT_DIR})

find_program(BGFX_SHADERC shaderc
  PATHS
    ${VCPKG_INSTALLED_DIR}/${VCPKG_TARGET_TRIPLET}/tools/bgfx
    ${VCPKG_INSTALLED_DIR}/${VCPKG_TARGET_TRIPLET}/tools
  NO_DEFAULT_PATH
)
find_program(BGFX_SHADERC shaderc)

if(BGFX_SHADERC)
  set(SHADER_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/shaders)

  function(compile_bgfx_shader NAME TYPE PROFILE)
    set(INPUT ${CMAKE_CURRENT_SOURCE_DIR}/shaders/${NAME}.sc)
    set(OUTPUT ${SHADER_OUT_DIR}/${NAME}.bin)
    add_custom_command(
      OUTPUT ${OUTPUT}
      COMMAND ${BGFX_SHADERC}
        --platform windows
        --type ${TYPE}
        --profile ${PROFILE}
        --varyingdef ${CMAKE_CURRENT_SOURCE_DIR}/shaders/varying.def.sc
        -i ${SHADER_INCLUDE_DIR}
        -i ${VCPKG_INSTALLED_DIR}/${VCPKG_TARGET_TRIPLET}/include/bgfx
        -f ${INPUT}
        -o ${OUTPUT}
      DEPENDS ${INPUT} ${CMAKE_CURRENT_SOURCE_DIR}/shaders/varying.def.sc
      VERBATIM
    )
    set_property(GLOBAL APPEND PROPERTY DUNGEON_SHADER_OUTPUTS ${OUTPUT})
  endfunction()

  compile_bgfx_shader(vs_voxel vertex spirv16-13)
  compile_bgfx_shader(fs_voxel fragment spirv16-13)
  compile_bgfx_shader(vs_imgui vertex spirv16-13)
  compile_bgfx_shader(fs_imgui fragment spirv16-13)
  compile_bgfx_shader(vs_shadow vertex spirv16-13)
  compile_bgfx_shader(fs_shadow fragment spirv16-13)

  get_property(DUNGEON_SHADER_OUTPUTS GLOBAL PROPERTY DUNGEON_SHADER_OUTPUTS)
  add_custom_target(dungeon_native_shaders DEPENDS ${DUNGEON_SHADER_OUTPUTS})
  add_dependencies(dungeon_native dungeon_native_shaders)
else()
  message(WARNING "bgfx shaderc was not found. Configure with vcpkg bgfx[tools] to build shader binaries.")
endif()

add_custom_command(TARGET dungeon_native POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${SHADER_OUT_DIR}
    $<TARGET_FILE_DIR:dungeon_native>/shaders
)

if(WIN32)
  add_custom_command(TARGET dungeon_native POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      $<TARGET_RUNTIME_DLLS:dungeon_native>
      $<TARGET_FILE_DIR:dungeon_native>
    COMMAND_EXPAND_LISTS
  )
endif()
