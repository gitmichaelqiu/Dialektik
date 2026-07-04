import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../models/app_snapshot.dart';
import 'engine_bridge.dart';

/// Production [EngineBridge] that delegates to the bundled JS engine
/// running inside a hidden [InAppWebView].
///
/// Architecture:
///   Flutter dispatch(action) → evaluateJavascript → JS engine
///   JS engine state change → window.FlutterChannel.postMessage → Dart stream
class JsEngineBridge implements EngineBridge {
  JsEngineBridge();

  final _controller = StreamController<AppSnapshot>.broadcast();
  InAppWebViewController? _webView;
  bool _ready = false;
  final _pendingActions = <String>[];

  @override
  Stream<AppSnapshot> get snapshots => _controller.stream;

  @override
  Future<void> dispatch(JsonMap action) async {
    final json = jsonEncode({'type': action['type'], 'payload': action['payload'] ?? {}});
    if (_ready && _webView != null) {
      await _webView!.evaluateJavascript(
        source: 'window.dialektikEngine && window.dialektikEngine.dispatch(${jsonEncode(json)});',
      );
      // After dispatch, explicitly pull the snapshot so Flutter always gets
      // the latest state — the push path (FlutterChannel.postMessage) can be
      // lossy, especially for event-driven updates like onPeerConnecting.
      await _pullSnapshot();
    } else {
      _pendingActions.add(json);
    }
  }

  /// Calls getSnapshot() on the engine and pushes the result into the stream.
  Future<void> _pullSnapshot() async {
    if (!_ready || _webView == null) return;
    try {
      final result = await _webView!.evaluateJavascript(
        source: 'window.dialektikEngine && await window.dialektikEngine.getSnapshot()',
      );
      if (result is String && result.isNotEmpty) {
        _pushSnapshot(result);
      }
    } catch (_) {}
  }

  void _pushSnapshot(String json) {
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

  /// Called by [JsEngineWebView] when the WebView controller is ready.
  void _attach(InAppWebViewController controller) {
    _webView = controller;
  }

  /// Called by [JsEngineWebView] when the engine has bootstrapped.
  void _onReady() {
    _ready = true;
    for (final pending in _pendingActions) {
      _webView?.evaluateJavascript(
        source: 'window.dialektikEngine && window.dialektikEngine.dispatch(${jsonEncode(pending)});',
      );
    }
    _pendingActions.clear();
  }

  /// Called by [JsEngineWebView] when the FlutterChannel receives a message.
  void _onMessage(String json) {
    _pushSnapshot(json);
  }

  void dispose() {
    _controller.close();
  }

  /// Returns a zero-size widget that mounts the hidden WebView in the tree.
  @override
  Widget buildWebView() => _JsEngineWebView(bridge: this);
}

/// Zero-size hidden WebView widget that hosts the JS engine.
class _JsEngineWebView extends StatefulWidget {
  const _JsEngineWebView({required this.bridge});

  final JsEngineBridge bridge;

  @override
  State<_JsEngineWebView> createState() => _JsEngineWebViewState();
}

class _JsEngineWebViewState extends State<_JsEngineWebView> {
  @override
  Widget build(BuildContext context) {
    return InAppWebView(
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
        transparentBackground: true,
        disableVerticalScroll: true,
        disableHorizontalScroll: true,
      ),
      onWebViewCreated: (controller) {
        widget.bridge._attach(controller);
        controller.addJavaScriptHandler(
          handlerName: 'FlutterChannel',
          callback: (args) {
            final msg = args.isNotEmpty ? args[0].toString() : '';
            widget.bridge._onMessage(msg);
            return null;
          },
        );
      },
      onLoadStop: (controller, _) async {
        try {
          final js = await DefaultAssetBundle.of(context).loadString('assets/engine.js');
          await controller.evaluateJavascript(source: '''
            window.FlutterChannel = {
              postMessage: function(msg) {
                window.flutter_inappwebview.callHandler("FlutterChannel", msg);
              }
            };
          ''');
          await controller.evaluateJavascript(source: js);
          await Future.delayed(const Duration(milliseconds: 500));
          widget.bridge._onReady();
        } catch (e) {
          debugPrint('[JsEngineWebView] engine load error: $e');
        }
      },
      onConsoleMessage: (_, msg) {
        debugPrint('[engine console] ${msg.messageLevel}: ${msg.message}');
      },
    );
  }
}

/// Minimal HTML page loaded by the WebView before the engine.js is injected.
const _engineHtml = '''<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;background:transparent;"></body>
</html>''';
