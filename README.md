# Dialektik

A local-first, serverless portal for National Speech and Debate Association (NSDA) clubs, functioning as a hybrid Tauri Desktop App and a Progressive Web App (PWA).

Licensed under [MIT License](LICENSE).

---

## Prerequisites

Before setting up the project, ensure you have the following installed on your system:
- **Node.js** (v18 or higher recommended)
- **Rust & Cargo** (Required for Tauri desktop builds)

---

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run in Development Mode**
   - **Web App (Vite)**:
     ```bash
     npm run dev
     ```
   - **Desktop App (Tauri)**:
     ```bash
     npm run tauri dev
     ```

3. **Run Unit Tests**
   ```bash
   npm test
   ```

---

## Production Build

- **Compile Web client**:
  ```bash
  npm run build
  ```
  The production web build (including PWA service worker and manifest) will be outputted to the `dist/` directory.

- **Compile Desktop binaries**:
  ```bash
  npm run tauri build
  ```
  This will bundle the native binaries (e.g. `.app`, `.dmg` on macOS, `.msi`, `.exe` on Windows) inside `src-tauri/target/release/bundle/`.

---

## 👥 Local Multi-Peer Testing (Single Machine)

Since Dialektik is local-first and relies on WebCrypto/IndexedDB, running two tabs in the same browser sharing the same origin (`http://localhost:1420`) will point to the **same database**. To test a Host and Client relationship concurrently on one machine, you must isolate their storage:

### Option A: Tauri App + Browser (Recommended)
1. Launch the Tauri desktop app (Host):
   ```bash
   npm run tauri dev
   ```
2. Open a standard web browser (Client) at `http://localhost:1420`.
   - *Since Tauri uses the native OS application storage directory and Chrome/Safari use the browser sandbox, they will have completely separate IndexedDB instances.*

### Option B: Cross-Browser Isolation
- Open one instance in **Google Chrome** (Host) and another instance in **Safari or Firefox** (Client).

### Option C: Private / Incognito Mode
- Open a standard window in your browser (Host) and an **Incognito / Private Window** (Client).

