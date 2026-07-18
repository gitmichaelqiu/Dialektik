import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../models/app_snapshot.dart';
import 'engine_bridge.dart';

/// Production [EngineBridge] that delegates to the bundled JS engine
/// running inside a [HeadlessInAppWebView].
///
/// Uses a headless WKWebView (no platform view in the widget tree) to avoid
/// iOS Hybrid Composition rendering conflicts that cause white screens.
///
/// Architecture:
///   Flutter dispatch(action) → evaluateJavascript → JS engine
///   JS engine state change → polling getLatestSnapshot() → Dart stream
class JsEngineBridge implements EngineBridge {
  JsEngineBridge() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initWebView();
    });
  }

  final _controller = StreamController<AppSnapshot>.broadcast();
  HeadlessInAppWebView? _headless;
  InAppWebViewController? _webView;
  bool _ready = false;
  bool _initializing = false;
  final _pendingActions = <String>[];
  Timer? _pollTimer;
  String? _lastSnapshotJson;

  @override
  Stream<AppSnapshot> get snapshots => _controller.stream;

  @override
  Future<void> dispatch(JsonMap action) async {
    final json = jsonEncode({'type': action['type'], 'payload': action['payload'] ?? {}});
    if (_ready && _webView != null) {
      await _webView!.evaluateJavascript(
        source: 'window.dialektikEngine && window.dialektikEngine.dispatch(${jsonEncode(json)});',
      );
      await _pullSnapshot();
    } else {
      _pendingActions.add(json);
    }
  }

  /// Calls getLatestSnapshot() on the engine and pushes the result into the stream.
  Future<void> _pullSnapshot() async {
    if (!_ready || _webView == null) return;
    try {
      final result = await _webView!.evaluateJavascript(
        source: 'window.dialektikEngine && window.dialektikEngine.getLatestSnapshot()',
      );
      if (result is String && result.isNotEmpty) {
        _pushSnapshot(result);
      }
    } catch (_) {}
  }

  void _pushSnapshot(String json) {
    if (json == _lastSnapshotJson) return;
    _lastSnapshotJson = json;
    try {
      final map = (jsonDecode(json) as Map).cast<String, Object?>();
      final snapshot = AppSnapshot.fromJson(map);
      if (!_controller.isClosed) {
        _controller.add(snapshot);
      }
    } catch (e) {
      debugPrint('[JsEngineBridge] push error: $e');
    }
  }

  void _onReady() {
    _ready = true;
    for (final pending in _pendingActions) {
      _webView?.evaluateJavascript(
        source: 'window.dialektikEngine && window.dialektikEngine.dispatch(${jsonEncode(pending)});',
      );
    }
    _pendingActions.clear();
    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 500), (_) async {
      if (!_ready || _webView == null) return;
      try {
        final result = await _webView!.evaluateJavascript(
          source: 'window.dialektikEngine && window.dialektikEngine.getLatestSnapshot()',
        );
        if (result is String && result.isNotEmpty) {
          _pushSnapshot(result);
        }
      } catch (_) {}
    });
  }

  void _onMessage(String json) {
    _pushSnapshot(json);
  }

  void dispose() {
    _pollTimer?.cancel();
    _controller.close();
    _headless?.dispose();
  }

  /// No platform view needed — the engine runs headlessly.
  @override
  Widget? buildWebView() => null;

  /// Boots the headless WKWebView and injects the JS engine.
  Future<void> _initWebView() async {
    if (_initializing || _ready) return;
    _initializing = true;

    _headless = HeadlessInAppWebView(
      initialSize: const Size(1, 1),
      initialData: InAppWebViewInitialData(
        data: _engineHtml,
        mimeType: 'text/html',
        baseUrl: WebUri('https://localhost'),
      ),
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        allowFileAccessFromFileURLs: true,
        allowUniversalAccessFromFileURLs: true,
        mediaPlaybackRequiresUserGesture: false,
      ),
      onWebViewCreated: (controller) {
        _webView = controller;
        controller.addJavaScriptHandler(
          handlerName: 'FlutterChannel',
          callback: (args) {
            final msg = args.isNotEmpty ? args[0].toString() : '';
            _onMessage(msg);
            return null;
          },
        );
      },
      onLoadStop: (controller, _) async {
        try {
          final js = await rootBundle.loadString('assets/engine.js');
          await controller.evaluateJavascript(source: '''
            window.FlutterChannel = {
              postMessage: function(msg) {
                window.flutter_inappwebview.callHandler("FlutterChannel", msg);
              }
            };
          ''');
          await controller.evaluateJavascript(source: js);
          await Future.delayed(const Duration(milliseconds: 500));
          _onReady();
        } catch (e) {
          _initializing = false;
          debugPrint('[JsEngineBridge] engine load error: $e');
        }
      },
      onReceivedError: (_, request, error) {
        debugPrint(
          '[JsEngineBridge] WebView load error (${error.type}) at '
          '${request.url}: ${error.description}',
        );
      },
      onReceivedHttpError: (_, request, response) {
        debugPrint(
          '[JsEngineBridge] WebView HTTP error (${response.statusCode}) at '
          '${request.url}: ${response.reasonPhrase}',
        );
      },
      onConsoleMessage: (_, msg) {
        debugPrint('[engine console] ${msg.messageLevel}: ${msg.message}');
      },
    );

    try {
      await _headless!.run();
    } catch (e) {
      _initializing = false;
      debugPrint('[JsEngineBridge] headless WebView init error: $e');
    }
  }
}

/// Minimal HTML page loaded by the headless WebView before engine.js is injected.
const _engineHtml = '''<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;background:transparent;"></body>
</html>''';
