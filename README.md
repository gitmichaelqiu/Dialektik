# Dialektik

A local-first, serverless portal for National Speech and Debate Association (NSDA) clubs. Manages debate rounds with P2P WebRTC connections, collaborative Yjs/CRDT document editing, AI coaching, evidence cards, and round history. All data is stored locally in IndexedDB (via Dexie.js) — no backend server required.

The app uses a **Flutter UI** backed by a **JavaScript engine** that runs in a hidden WebView (native) or directly via JS interop (web). The engine handles IndexedDB persistence, WebRTC mesh networking, CRDT sync, and AI API calls. Flutter consumes immutable JSON snapshots and dispatches JSON actions.

Licensed under [MIT License](LICENSE).

---

## Prerequisites

- **Node.js** (v18 or higher)
- **Flutter SDK** (>=3.4.0, with Dart)
- **Xcode** (macOS/iOS builds)
- **CocoaPods** (iOS builds)

---

## Getting Started

```bash
# 1. Install JS dependencies
npm install

# 2. Build the JS engine bundle (required before running the app)
npm run engine:build

# 3. Run in development mode
npm run dev
```

The `engine:build` step compiles the TypeScript engine (`src/`) into `flutter_ui/assets/engine.js` using Vite's library mode. It must be run before any `flutter run` invocation.

---

## Common Commands

| Command | Description |
|---|---|
| `npm run engine:build` | Build JS engine bundle (TypeScript → IIFE) |
| `npm run dev` | Run Flutter app (auto-detects macOS/Windows/Linux) |
| `npm run flutter:web` | Run in Chrome |
| `npm run flutter:ios` | Run in iOS simulator |
| `npm run flutter:analyze` | Dart static analysis |
| `npm run build` | Production build (auto-detects platform) |
| `npm run flutter:build:web` | Build Flutter web |
| `npm run flutter:build:ios` | Build iOS app |
| `cd flutter_ui && flutter test` | Run unit tests |

**Common inner loop:**
```bash
npm run engine:build && npm run flutter:web
```

---

## Building for Production

All builds require `npm run engine:build` first. Artifacts are output to `releases/v0.1.0/`.

### macOS
```bash
# Prerequisites: Xcode
flutter build macos --release
```
Output: `build/macos/Build/Products/Release/Dialektik.app`
Package as `.dmg` with: `npx create-dmg build/macos/Build/Products/Release/Dialektik.app Dialektik_macOS_v0.1.0.dmg`

### iOS & iPadOS
```bash
# Prerequisites: Xcode, Apple Developer account (for device deployment)
flutter build ios --release
```
Output: `build/ios/iphoneos/Runner.app`
Package as `.ipa` by copying the app into a `Payload/` directory and zipping.
The same build targets both iPhone and iPad.

### Web (current cross-platform fallback)
```bash
# Prerequisites: None (builds on macOS, Windows, Linux)
cd flutter_ui && flutter build web --release
```
Output: `build/web/` — open `index.html` in a browser to launch.

The release zip (`Dialektik_web_v0.1.0.zip`) extracts to a `Dialektik/` folder. To serve it:

- **Locally:** Flutter web requires a local server (opening `index.html` directly via `file://` will show a blank page):
  ```bash
  cd Dialektik && python3 -m http.server 8080
  # Then open http://localhost:8080
  ```
- **Self-host:** Upload the `Dialektik/` folder to any static web server.
- **Cloudflare Pages / Vercel:** Point the deployment to the `Dialektik/` folder — they auto-detect the static site.

**Note:** P2P WebRTC connections on web may be limited compared to native builds (some browsers restrict WebRTC data channel reliability).

### Windows (requires a Windows machine)
```bash
# Prerequisites: Windows 10+, Visual Studio 2022 with "Desktop development with C++"
cd flutter_ui && flutter build windows --release
```
Output: `build/windows/runner/Release/Dialektik.exe` + DLL dependencies.
Set `FLUTTER_ROOT` and run `flutter config --enable-windows-desktop` before the first build.

### Android (requires Android Studio setup on any platform)
```bash
# Prerequisites: Android Studio, Android SDK, accept licenses
cd flutter_ui && flutter build apk --release    # direct install
cd flutter_ui && flutter build appbundle --release  # Play Store
```

---

## Architecture

```
Flutter UI ──EngineBridge──> Hidden WebView ──> engine.js (TypeScript/IIFE)
  (dispatch JSON actions)       or                    |
  (receive JSON snapshots)    JS interop (web)        ├─ DialektikDB (Dexie/IndexedDB)
                                                      ├─ PeerMeshManager (WebRTC/PeerJS)
                                                      ├─ PeerJSYjsProvider (CRDT sync)
                                                      └─ AIService (OpenAI-compatible API)
```

### Key patterns

- **Unidirectional data flow**: Flutter sends JSON `{type, payload}` actions via `EngineBridge.dispatch()`. The JS engine processes them, updates IndexedDB, and pushes a full `AppSnapshot` JSON blob back. Flutter rebuilds its widget tree from the snapshot stream.

- **Platform-dependent bridge**: `EngineBridge` has two implementations:
  - `JsEngineBridge` (IO/native) — uses a hidden `HeadlessInAppWebView` with the compiled `engine.js` bundle
  - `JsEngineBridge` (web) — uses `dart:js_util` to call `window.dialektikEngine` directly

- **Poll-based sync**: In addition to push messages, the bridge polls `getLatestSnapshot()` every 500ms (synchronous read of a cached `__latestSnapshot` string) to catch dropped messages.

- **Snapshot model**: Immutable `AppSnapshot` Dart classes parsed from JSON. Top-level fields: `activePage`, `documents`, `cards`, `history`, `session`, `ai`, `settings`.

---

## Source Structure

```
├── src/                              # TypeScript engine (builds to engine.js)
│   ├── engine-entry.ts               # DB init, action dispatch, snapshot push
│   └── services/
│       ├── webrtc.ts                 # PeerMeshManager — full-mesh P2P via PeerJS
│       ├── yjs-provider.ts           # PeerJSYjsProvider — CRDT sync over data channels
│       └── ai.ts                     # AIService — OpenAI-compatible API client
├── flutter_ui/                       # Flutter application
│   ├── lib/
│   │   ├── main.dart                 # App entry + PreviewEngineBridge (dev)
│   │   └── src/
│   │       ├── app/dialektik_app.dart     # Root shell, snapshot subscription, routing
│   │       ├── bridge/                   # EngineBridge abstract + implementations
│   │       ├── models/app_snapshot.dart  # All snapshot model classes
│   │       ├── screens/                  # In-round, documents, AI, history, settings
│   │       └── widgets/adaptive_scaffold.dart  # ResponsivePane, EmptyState, etc.
│   └── assets/
│       ├── engine.html               # Host page for WebView bridge
│       └── engine.js                 # Compiled IIFE bundle (gitignored)
├── scripts/
│   ├── flutter-dev.mjs               # Dev launcher (auto-detects platform)
│   └── flutter-build.mjs             # Production build launcher
└── vite.config.engine.ts             # Vite config for engine.js IIFE bundle
```

---

## Local Multi-Peer Testing (Single Machine)

Since IndexedDB is per-origin, two tabs in the same browser share the same database. To test host and client on one machine, isolate storage:

### Option A: Separate browser profiles
Run one instance in **Chrome** and another in **Firefox/Safari**, or use Chrome's profile switcher.

### Option B: Normal + Incognito
Open one regular window and one incognito/private window in the same browser.

### Option C: Preview Engine
Use the `PreviewEngineBridge` (in-memory Dart simulation of the JS engine) for basic UI testing without the hidden WebView. It includes cross-tab sync via SharedPreferences.
