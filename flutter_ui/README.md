# Dialektik Flutter compatibility UI

This package contains the stable v0.3.0 Flutter widget layer. The next-major `v1.0.0` branch uses the React + Carbon frontend in `frontend/` inside a Tauri shell. Keep this package working until the mobile migration is complete.

The JavaScript engine remains responsible for network state, WebRTC, persistence, Yjs, timers, and AI calls. Flutter consumes immutable JSON snapshots through a `Stream<AppSnapshot>` or `ValueListenable<AppSnapshot>` and sends JSON actions back through `EngineBridge.dispatch`.

## Integration Contract

Flutter expects snapshots shaped like:

```json
{
  "activePage": "documents",
  "documents": [],
  "cards": [],
  "session": null,
  "settings": {},
  "ai": {}
}
```

Flutter sends actions shaped like:

```json
{
  "type": "document.updateContent",
  "payload": {
    "id": "doc-id",
    "content": "markdown"
  }
}
```

The engine bridge can be implemented with platform channels, an embedded WebView JavaScript bridge, or any other host-specific transport. The widgets do not depend on a specific transport.
