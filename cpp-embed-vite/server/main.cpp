#include "httplib.h"

#include "embedded_assets.h"

#include <iostream>
#include <string>

// Map a file extension to a Content-Type.
static const char* mime_of(const std::string& path) {
    size_t dot = path.find_last_of('.');
    std::string ext = dot == std::string::npos ? "" : path.substr(dot);
    if (ext == ".html") return "text/html; charset=utf-8";
    if (ext == ".js") return "text/javascript; charset=utf-8";
    if (ext == ".mjs") return "text/javascript; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".json") return "application/json";
    if (ext == ".svg") return "image/svg+xml";
    if (ext == ".png") return "image/png";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".gif") return "image/gif";
    if (ext == ".webp") return "image/webp";
    if (ext == ".ico") return "image/x-icon";
    if (ext == ".woff") return "font/woff";
    if (ext == ".woff2") return "font/woff2";
    if (ext == ".wasm") return "application/wasm";
    return "application/octet-stream";
}

int main() {
    httplib::Server svr;
    const auto& assets = embedded::assets();

    // ── Backend API ─────────────────────────────────────────
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(R"({"ok":true,"server":"cpp-httplib","embedded":true})",
                        "application/json");
    });

    // ── Embedded static assets ──────────────────────────────
    svr.Get(R"(/assets/(.*))", [&](const httplib::Request& req, httplib::Response& res) {
        std::string key = "assets/" + req.matches[1].str();
        auto it = assets.find(key);
        if (it == assets.end()) {
            res.status = 404;
            res.set_content("asset not found: " + key, "text/plain");
            return;
        }
        const auto& a = it->second;
        res.set_content(reinterpret_cast<const char*>(a.data), a.size, mime_of(key));
        // Hashed Vite assets are immutable — long cache.
        res.set_header("Cache-Control", "public, max-age=31536000, immutable");
    });

    // ── SPA fallback: every other path serves index.html ────
    // so client-side routes (/about, /contact, ...) work on refresh/deep-link.
    svr.Get(".*", [&](const httplib::Request&, httplib::Response& res) {
        res.set_content(embedded::indexHtml(), "text/html; charset=utf-8");
    });

    std::cout << "listening on http://localhost:8099" << std::endl;
    svr.listen("0.0.0.0", 8099);
    return 0;
}
