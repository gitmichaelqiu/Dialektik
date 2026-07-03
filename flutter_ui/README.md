# Dialektik Flutter UI

This package contains a Flutter widget layer that is intentionally separate from the existing JavaScript/Tauri implementation.

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
