import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/app_snapshot.dart';

typedef JsonMap = Map<String, Object?>;

abstract class EngineBridge {
  Stream<AppSnapshot> get snapshots;

  Future<void> dispatch(JsonMap action);
}

class ValueNotifierEngineBridge implements EngineBridge {
  ValueNotifierEngineBridge({
    required ValueListenable<AppSnapshot> listenable,
    required FutureOr<void> Function(JsonMap action) onDispatch,
  })  : _listenable = listenable,
        _onDispatch = onDispatch {
    _controller = StreamController<AppSnapshot>.broadcast(
      onListen: () {
        _controller.add(_listenable.value);
        _listenable.addListener(_emit);
      },
      onCancel: () => _listenable.removeListener(_emit),
    );
  }

  final ValueListenable<AppSnapshot> _listenable;
  final FutureOr<void> Function(JsonMap action) _onDispatch;
  late final StreamController<AppSnapshot> _controller;

  @override
  Stream<AppSnapshot> get snapshots => _controller.stream;

  @override
  Future<void> dispatch(JsonMap action) async {
    await _onDispatch(action);
  }

  void dispose() {
    _listenable.removeListener(_emit);
    _controller.close();
  }

  void _emit() {
    if (!_controller.isClosed) {
      _controller.add(_listenable.value);
    }
  }
}

JsonMap action(String type, [JsonMap payload = const {}]) {
  return <String, Object?>{
    'type': type,
    'payload': payload,
  };
}
