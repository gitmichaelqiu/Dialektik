# Changelog

## v0.1.0

### Added

- P2P debate session hosting and joining via WebRTC with full-mesh topology
- Real-time collaborative document editing with Yjs CRDT sync over PeerJS data channels
- AI coaching assistant with OpenAI-compatible API integration for sparring and feedback
- Markdown document editor with read mode, inline formatting (bold, italic, code, highlights), heading, list, blockquote, and link rendering
- Evidence card management with citation insertion into documents
- Document organization into private, team, and public folders with writable/read-only modes
- Team-based document and card visibility filtering based on session team assignment
- Shared document and card synchronization across peers in a session
- Speaker timer (speech and prep) with start, pause, reset controls
- Custom timer creation and management
- Speaker notes system for flow note-taking per debater
- Handout drafting with real-time sync during lobby phase
- Debater management with team assignment (affirmative/negative) and position setting
- Join request approval workflow with host-side approval/rejection
- Active speaker selection and notification
- Round history tracking with win/loss records and flow notes
- Room code system for session discovery
- Host migration (lexicographically smallest peer ID election on host drop)
- Version handshake preventing incompatible client connections
- System dark mode detection and theme adaptation
- Settings configuration for user name, AI endpoint, API key, and model
- Workspace reset functionality
- Preview engine for development without WebView bridge dependency
- Local-first architecture with IndexedDB persistence via Dexie.js
- Cross-platform Flutter UI with responsive layout (compact mobile and expanded desktop)
- Flutter ↔ JavaScript engine bridge with platform-specific implementations (InAppWebView for native, JS interop for web)
- Poll-based snapshot synchronization for reliable state delivery
