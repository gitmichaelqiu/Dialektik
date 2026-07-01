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
