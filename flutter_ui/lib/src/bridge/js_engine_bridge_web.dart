// ignore_for_file: avoid_web_libraries_in_flutter

import 'dart:async';
import 'dart:convert';
// ignore: deprecated_member_use
import 'dart:js_util' as js_util;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../models/app_snapshot.dart';
import 'engine_bridge.dart';

/// Production [EngineBridge] for Flutter web that loads the bundled JS engine
/// directly in the browser's global JavaScript context via JS interop,
/// bypassing the need for an InAppWebView (which doesn't work on web).
///
/// Architecture:
///   Flutter dispatch(action) → window.dialektikEngine.dispatch() → JS engine
///   JS engine state change → window.FlutterChannel.postMessage → Dart stream
class JsEngineBridge implements EngineBridge {
  JsEngineBridge() {
    _init();
  }

  final _controller = StreamController<AppSnapshot>.broadcast();
  bool _ready = false;
  final _pendingActions = <String>[];
  bool _initStarted = false;

  @override
  Stream<AppSnapshot> get snapshots => _controller.stream;

  @override
  Future<void> dispatch(JsonMap action) async {
    final json = jsonEncode(action);
    if (_ready) {
      _callDispatch(json);
      await _pullSnapshot();
    } else {
      _pendingActions.add(json);
    }
  }

  @override
  Widget? buildWebView() => null;

  void _callDispatch(String jsonStr) {
    final engine = js_util.getProperty(js_util.globalThis, 'dialektikEngine');
    if (engine != null) {
      js_util.callMethod(engine, 'dispatch', [jsonStr]);
    }
  }

  Future<void> _pullSnapshot() async {
    if (!_ready) return;
    try {
      final engine = js_util.getProperty(js_util.globalThis, 'dialektikEngine');
      if (engine == null) return;
      final result = await js_util.promiseToFuture(
        js_util.callMethod(engine, 'getSnapshot', []),
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
      // ignore parse errors
    }
  }

  void _onMessage(String json) {
    _pushSnapshot(json);
  }

  void _onReady() {
    _ready = true;
    for (final pending in _pendingActions) {
      _callDispatch(pending);
    }
    _pendingActions.clear();
  }

  Future<void> _init() async {
    if (_initStarted) return;
    _initStarted = true;

    try {
      // Set up FlutterChannel.postMessage as a global JS function
      // that the engine calls to push snapshots back to Dart.
      final channel = js_util.newObject();
      js_util.setProperty(
        channel,
        'postMessage',
        js_util.allowInterop((String? msg) {
          if (msg != null && msg.isNotEmpty) {
            _onMessage(msg);
          }
        }),
      );
      js_util.setProperty(js_util.globalThis, 'FlutterChannel', channel);

      // Load engine.js from assets and evaluate it in the global scope.
      final engineJs = await rootBundle.loadString('assets/engine.js');
      js_util.callMethod(js_util.globalThis, 'eval', [engineJs]);

      // Give the engine a tick to bootstrap (loadConfig, DB init, etc.)
      await Future.delayed(const Duration(milliseconds: 800));

      _onReady();
    } catch (e) {
      // If engine loading fails, the app will just show the initial state
    }
  }

  void dispose() {
    _controller.close();
    _ready = false;
  }
}
