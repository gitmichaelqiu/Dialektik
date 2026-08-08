# Changelog

## v1.0.3

### Fixed

- Kept Google Docs sign-in and embedded-editor failures inside Dialektik until the user explicitly selects **Open in browser**

### Changed

- Removed redundant Documents workspace helper copy

## v1.0.2

### Added

- First-class native Google Docs WebView with shared cookies, progress, reload, and recoverable error states
- Task-focused initial pane proportions with persistent resizing and collapsible utility panels
- Desktop pane-proportion regression coverage

### Changed

- Made the document, chat, handout, and history-detail canvases dominant on desktop
- Reduced desktop panel gutters and replaced equal-width defaults with purpose-specific layouts
- Centered Settings in a readable 960px column instead of stretching forms across the window

## v1.0.1

### Added

- Navigable Markdown heading outline for long offline case files
- One-click evidence-card drafts from selected document text
- Direct Evidence Library access from the Google Docs workspace
- Formatted evidence-card previews with bold and highlight guidance

### Changed

- Refocused the offline editor around a collapsible file list and full-width editor
- Moved evidence tools into an on-demand drawer instead of a permanent third pane
- Clarified evidence fields as card title, citation/source, and evidence text
- Tightened round setup and first-run profile layouts across desktop and mobile

### Fixed

- Preserved card authorship in the preview engine so owners retain edit controls
- Removed duplicate TURN configuration notices from round setup

## v1.0.0

### Added

- Google Docs-first workspace with safe external sign-in, native embedding, and an offline Markdown fallback
- Explicit local AI context for linked Google Docs, with citation guardrails
- Official guided round templates for Public Forum, Lincoln-Douglas, Policy, Congress, and World Schools
- Event speech timelines, phase-aware timers, speaker cues, and optional auto-advance
- Round-specific document selection that carries into the live handout and AI Coach
- Compact live-round HUD with persistent room status, 48sp timer, and speech strip
- Cross-platform full-workspace backup and restore with conflict handling and integrity warnings
- Dynamic build version display in Settings

### Changed

- Reworked the visual system around white, near-black, and restrained green accents
- Modernized Flutter web JavaScript interop and restored clean production web builds
- Required a resolution before starting a hosted debate
- Reset imported sharing scopes to private and excluded credentials from backups

### Fixed

- Connected the previously inactive reset-all-timers control
- Removed hard-coded application version text
- Cleared all Flutter analyzer issues

## v0.1.0

### Added

- P2P debate sessions with room code system, host migration, and join request workflow
- Real-time collaborative document editing via Yjs CRDT sync
- Markdown document editor with read mode and citation support
- Evidence card management with team-based sharing and folder organization
- Speaker and prep timers with custom timer support
- Speaker notes system for flow note-taking
- Handout drafting with live sync during lobby
- Debater management with team assignment and position setting
- AI coaching assistant with OpenAI-compatible API integration
- Round history tracking with win/loss records
- Settings for user profile, AI endpoint, and API key
- System dark mode detection and responsive cross-platform UI (mobile and desktop)
- Local-first architecture with IndexedDB persistence and bridge between Flutter and JavaScript engine
