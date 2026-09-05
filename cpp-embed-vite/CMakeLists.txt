cmake_minimum_required(VERSION 3.16)
project(CppEmbedVite CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# ── HTTP library (vendored single header) ────────────────────
# third_party/cpp-httplib/httplib.h — https://github.com/yhirose/cpp-httplib
# Alternative: use FetchContent instead of vendoring:
#   include(FetchContent)
#   FetchContent_Declare(cpp-httplib GIT_REPOSITORY https://github.com/yhirose/cpp-httplib GIT_TAG v0.18.0)
#   FetchContent_MakeAvailable(cpp-httplib)
#   target_link_libraries(server PRIVATE httplib::httplib)

# ── Embed the Vite dist as C arrays ──────────────────────────
set(DIST_DIR ${CMAKE_CURRENT_SOURCE_DIR}/web/dist)
set(GEN_DIR  ${CMAKE_CURRENT_BINARY_DIR}/generated)

add_custom_command(
  OUTPUT  ${GEN_DIR}/embedded_assets.cpp ${GEN_DIR}/embedded_assets.h
  COMMAND ${CMAKE_COMMAND} -E make_directory ${GEN_DIR}
  COMMAND python3 ${CMAKE_CURRENT_SOURCE_DIR}/embed/generate_assets.py
          ${DIST_DIR} ${GEN_DIR}
  DEPENDS ${DIST_DIR}/index.html
  COMMENT "Embedding Vite dist into the binary..."
)
add_custom_target(embed_assets DEPENDS ${GEN_DIR}/embedded_assets.cpp)

# ── Server ───────────────────────────────────────────────────
add_executable(server server/main.cpp ${GEN_DIR}/embedded_assets.cpp)
add_dependencies(server embed_assets)
target_include_directories(server PRIVATE ${GEN_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/third_party/cpp-httplib)
