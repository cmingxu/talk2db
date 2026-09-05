# Example: serve a Vite-built SPA from an embedded C++ binary

Demonstrates how a C++ (cpp-httplib) server can embed a Vite-built frontend
(`web/dist`) directly into the executable — a single self-contained binary,
no static files needed at runtime. Mirrors what Talk2DB does with Go's
`//go:embed`, but with CMake + a tiny Python generator.

## Layout

```
cpp-embed-vite/
  CMakeLists.txt            — fetches cpp-httplib, embeds web/dist, builds server
  embed/generate_assets.py  — turns web/dist files into C arrays (embedded_assets.h/.cpp)
  server/main.cpp           — httplib server: /api/* JSON + SPA fallback + /assets/* MIME
  web/                      — minimal Vite + React app (builds into web/dist)
```

## Build

```bash
# 1) Build the frontend
cd web && npm install && npm run build && cd ..

# 2) Build the C++ server (fetches cpp-httplib via FetchContent)
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build

# 3) Run — everything is inside the binary
./build/server
# → http://localhost:8099
```

## How the embedding works

1. `npm run build` produces `web/dist` (index.html + assets/*).
2. `embed/generate_assets.py` walks `web/dist` and emits
   `embedded_assets.cpp/h`: every file becomes a `const unsigned char[]`,
   registered in a `path → {data, size}` map.
3. CMake runs the generator as a custom command *before* compiling `server`,
   so the arrays are compiled into the binary.
4. `server/main.cpp`:
   - `GET /api/health` → JSON (the "backend" side)
   - `GET /assets/(.*)` → embedded asset with the right MIME type + long cache
   - everything else → `index.html` (SPA fallback so client-side routes work
     on refresh/deep-link)
