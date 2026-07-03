import 'dart:async';

import 'package:flutter/material.dart';

import 'dialektik_flutter_ui.dart';

void main() {
  runApp(DialektikFlutterApp(bridge: PreviewEngineBridge()));
}

class PreviewEngineBridge implements EngineBridge {
  PreviewEngineBridge()
      : _state = ValueNotifier<AppSnapshot>(
          AppSnapshot.fromJson(_initialPreviewState),
        ) {
    _controller = StreamController<AppSnapshot>.broadcast(
      onListen: () {
        _controller.add(_state.value);
        _state.addListener(_emit);
      },
      onCancel: () => _state.removeListener(_emit),
    );
  }

  final ValueNotifier<AppSnapshot> _state;
  late final StreamController<AppSnapshot> _controller;

  @override
  Stream<AppSnapshot> get snapshots => _controller.stream;

  @override
  Future<void> dispatch(JsonMap action) async {
    final type = action['type'];
    final payload =
        (action['payload'] as Map?)?.cast<String, Object?>() ?? const {};

    if (type == 'app.setActivePage') {
      _patch({'activePage': payload['page']});
      return;
    }

    if (type == 'document.updateContent') {
      final id = payload['id'];
      final content = payload['content'];
      if (id is! String || content is! String) return;
      final docs = _documentsJson.map((doc) {
        if (doc['id'] == id) {
          return {
            ...doc,
            'content': content,
            'lastModified': DateTime.now().millisecondsSinceEpoch,
          };
        }
        return doc;
      }).toList();
      _patch({'documents': docs});
      return;
    }

    if (type == 'document.create') {
      final requestedName = payload['name'];
      final folder = payload['folder'];
      final mode = payload['mode'];
      final name = requestedName is String && requestedName.trim().isNotEmpty
          ? requestedName.trim()
          : 'Untitled.md';
      final nextName =
          _availableDocumentName(name.endsWith('.md') ? name : '$name.md');
      final docs = [
        ..._documentsJson,
        {
          'id': 'doc-${DateTime.now().microsecondsSinceEpoch}',
          'name': nextName,
          'content': '',
          'partnerAccess': folder is String ? folder : 'private',
          'encryptedHash': mode is String ? mode : 'write',
          'lastModified': DateTime.now().millisecondsSinceEpoch,
        },
      ];
      _patch({'documents': docs});
      return;
    }

    if (type == 'document.rename') {
      final id = payload['id'];
      final name = payload['name'];
      if (id is! String || name is! String || name.trim().isEmpty) return;
      final docs = _documentsJson.map((doc) {
        if (doc['id'] == id) {
          final nextName = _availableDocumentName(
            name.endsWith('.md') ? name : '$name.md',
            currentId: id,
          );
          return {...doc, 'name': nextName};
        }
        return doc;
      }).toList();
      _patch({'documents': docs});
      return;
    }

    if (type == 'document.move' || type == 'document.setMode') {
      final id = payload['id'];
      if (id is! String) return;
      final docs = _documentsJson.map((doc) {
        if (doc['id'] != id) return doc;
        return {
          ...doc,
          if (type == 'document.move') 'partnerAccess': payload['folder'],
          if (type == 'document.setMode') 'encryptedHash': payload['mode'],
          'lastModified': DateTime.now().millisecondsSinceEpoch,
        };
      }).toList();
      _patch({'documents': docs});
      return;
    }

    if (type == 'document.duplicate') {
      final id = payload['id'];
      final source = _documentsJson.where((doc) => doc['id'] == id).firstOrNull;
      if (source == null) return;
      final baseName = (source['name'] as String? ?? 'Untitled.md')
          .replaceFirst('.md', '_copy.md');
      _patch({
        'documents': [
          ..._documentsJson,
          {
            ...source,
            'id': 'doc-${DateTime.now().microsecondsSinceEpoch}',
            'name': _availableDocumentName(baseName),
            'lastModified': DateTime.now().millisecondsSinceEpoch,
          },
        ],
      });
      return;
    }

    if (type == 'document.delete') {
      final id = payload['id'];
      if (id is! String) return;
      _patch({
        'documents': _documentsJson.where((doc) => doc['id'] != id).toList(),
      });
      return;
    }

    if (type == 'card.create') {
      final title = payload['title'];
      final text = payload['text'];
      if (title is! String ||
          title.trim().isEmpty ||
          text is! String ||
          text.trim().isEmpty) {
        return;
      }
      _patch({
        'cards': [
          ..._cardsJson,
          {
            'id': 'card-${DateTime.now().microsecondsSinceEpoch}',
            'title': title.trim(),
            'sourceUrl':
                payload['sourceUrl'] is String ? payload['sourceUrl'] : '',
            'text': text.trim(),
            'docId': payload['docId'],
          },
        ],
      });
      return;
    }

    if (type == 'card.delete') {
      final id = payload['id'];
      if (id is! String) return;
      _patch({
        'cards': _cardsJson.where((card) => card['id'] != id).toList(),
      });
      return;
    }
  }

  List<Map<String, Object?>> get _documentsJson {
    return _rawState['documents']! as List<Map<String, Object?>>;
  }

  List<Map<String, Object?>> get _cardsJson {
    return _rawState['cards']! as List<Map<String, Object?>>;
  }

  String _availableDocumentName(String requestedName, {String? currentId}) {
    final existing = _documentsJson
        .where((doc) => currentId == null || doc['id'] != currentId)
        .map((doc) => (doc['name'] as String? ?? '').toLowerCase())
        .toSet();
    final extension = requestedName.toLowerCase().endsWith('.md') ? '.md' : '';
    final base = extension.isEmpty
        ? requestedName
        : requestedName.substring(0, requestedName.length - 3);
    var candidate = extension.isEmpty ? '$base.md' : requestedName;
    var index = 2;
    while (existing.contains(candidate.toLowerCase())) {
      candidate = '${base}_$index.md';
      index += 1;
    }
    return candidate;
  }

  final Map<String, Object?> _rawState =
      Map<String, Object?>.from(_initialPreviewState);

  void _patch(Map<String, Object?> patch) {
    _rawState.addAll(patch);
    _state.value = AppSnapshot.fromJson(_rawState);
  }

  void _emit() {
    if (!_controller.isClosed) {
      _controller.add(_state.value);
    }
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

final Map<String, Object?> _initialPreviewState = {
  'activePage': 'documents',
  'documents': <Map<String, Object?>>[
    {
      'id': 'doc-aff-case',
      'name': 'Affirmative Case.md',
      'content':
          '# Opening Claim\n\nPublic education should prioritize civic reasoning.\n\n[[public/Impact Overview]]',
      'partnerAccess': 'private',
      'encryptedHash': 'write',
      'lastModified': 0,
    },
    {
      'id': 'doc-impact',
      'name': 'Impact Overview.md',
      'content': 'A compact overview of solvency, impact, and weighing.',
      'partnerAccess': 'public',
      'encryptedHash': 'write',
      'lastModified': 0,
    },
  ],
  'cards': <Map<String, Object?>>[
    {
      'id': 'card-demo',
      'title': 'Civic learning evidence',
      'text':
          'Students perform better when debate work is tied to civic reasoning and source evaluation.',
      'sourceUrl': '',
      'docId': 'doc-aff-case',
    },
  ],
  'session': <String, Object?>{
    'roomCode': 'DEMO',
    'matchName': 'Practice Round',
    'groupName': 'Dialektik Preview',
    'status': 'lobby',
    'speechRemainingMs': 240000,
    'prepRemainingMs': 180000,
    'debaters': <Map<String, Object?>>[
      {
        'id': 'debater-1',
        'name': 'Alex',
        'status': 'approved',
        'team': 'affirmative',
        'position': 1,
      },
    ],
    'customTimers': <Map<String, Object?>>[
      {
        'id': 'timer-cross-ex',
        'name': 'Cross-ex',
        'remainingMs': 180000,
        'running': false,
      },
    ],
  },
  'ai': <String, Object?>{
    'activeChatId': 'chat-1',
    'loading': false,
    'chats': <Map<String, Object?>>[
      {
        'id': 'chat-1',
        'title': 'Round prep',
        'messages': <Map<String, Object?>>[
          {
            'role': 'assistant',
            'text': 'I can help prepare blocks, summaries, and weighing.',
          },
        ],
      },
    ],
  },
  'settings': <String, Object?>{
    'userName': 'Preview User',
    'aiModel': 'gpt-4o',
  },
};
