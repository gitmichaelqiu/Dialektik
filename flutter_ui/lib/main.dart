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
    _lastTick = DateTime.now();
    Timer.periodic(const Duration(milliseconds: 250), (_) {
      _tickTimers();
    });
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
  late DateTime _lastTick;

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

    if (type == 'session.host') {
      _patch({
        'activePage': 'inround',
        'session': {
          'roomCode': 'DEMO',
          'matchName': payload['matchName'] is String &&
                  (payload['matchName']! as String).trim().isNotEmpty
              ? (payload['matchName']! as String).trim()
              : 'Practice Round',
          'groupName': payload['groupName'] is String &&
                  (payload['groupName']! as String).trim().isNotEmpty
              ? (payload['groupName']! as String).trim()
              : 'Dialektik Team',
          'status': 'lobby',
          'handout': {'title': '', 'problem': '', 'details': ''},
          'speechRemainingMs': 240000,
          'speechRunning': false,
          'prepRemainingMs': 180000,
          'prepRunning': false,
          'debaters': [
            {
              'id': 'debater-preview',
              'name': 'Preview User',
              'status': 'approved',
              'team': 'affirmative',
              'position': 1,
            }
          ],
          'customTimers': <Map<String, Object?>>[],
          'speakerNotes': <String, Object?>{},
        },
      });
      return;
    }

    if (type == 'session.join') {
      _patch({'activePage': 'inround'});
      return;
    }

    if (type == 'session.exit') {
      _patch({'session': null});
      return;
    }

    if (type == 'session.startDebate') {
      _patchSession({'status': 'active'});
      return;
    }

    if (type == 'session.updateHandout') {
      _patchSession({
        'handout': {
          'title': payload['title'] ?? '',
          'problem': payload['problem'] ?? '',
          'details': payload['details'] ?? '',
        }
      });
      return;
    }

    if (type == 'session.assignDebater') {
      final id = payload['id'];
      if (id is! String) return;
      final session = _sessionJson;
      final debaters = _list(session['debaters']).map((debater) {
        if (debater['id'] != id) return debater;
        return {
          ...debater,
          'team': payload['team'],
          'position': payload['position'],
        };
      }).toList();
      _patchSession({'debaters': debaters});
      return;
    }

    if (type == 'session.selectSpeaker') {
      _patchSession({'currentSpeakerId': payload['id']});
      return;
    }

    if (type == 'session.updateNotes') {
      final speakerId = payload['speakerId'];
      final text = payload['text'];
      if (speakerId is! String || text is! String) return;
      final notes = Map<String, Object?>.from(
          (_sessionJson['speakerNotes'] as Map?) ?? const {});
      notes[speakerId] = text;
      _patchSession({'speakerNotes': notes});
      return;
    }

    if (type == 'session.aiOutline') {
      final speakerId =
          _sessionJson['currentSpeakerId'] as String? ?? 'debater-preview';
      final notes = Map<String, Object?>.from(
          (_sessionJson['speakerNotes'] as Map?) ?? const {});
      notes[speakerId] =
          '${notes[speakerId] ?? ''}\n\nAI outline:\n- Claim\n- Warrant\n- Impact';
      _patchSession({'speakerNotes': notes});
      return;
    }

    if (type == 'session.saveRound') {
      _patch({'session': null, 'activePage': 'history'});
      return;
    }

    if (type == 'timer.action') {
      final timerType = payload['timerType'];
      final actionName = payload['action'];
      if (timerType == 'speech') {
        _patchSession({
          if (actionName == 'start') 'speechRunning': true,
          if (actionName == 'pause') 'speechRunning': false,
          if (actionName == 'reset') ...{
            'speechRemainingMs': 240000,
            'speechRunning': false,
          },
        });
        return;
      }
      if (timerType == 'prep') {
        _patchSession({
          if (actionName == 'start') 'prepRunning': true,
          if (actionName == 'pause') 'prepRunning': false,
          if (actionName == 'reset') ...{
            'prepRemainingMs': 180000,
            'prepRunning': false,
          },
        });
        return;
      }
      if (timerType == 'speech' && actionName == 'reset') {
        _patchSession({'speechRemainingMs': 240000});
      }
      if (timerType == 'prep' && actionName == 'reset') {
        _patchSession({'prepRemainingMs': 180000});
      }
      return;
    }

    if (type == 'customTimer.create') {
      final name = payload['name'];
      if (name is! String || name.trim().isEmpty) return;
      final durationMs = _parseDuration(payload['duration']);
      _patchSession({
        'customTimers': [
          ..._customTimersJson,
          {
            'id': 'timer-${DateTime.now().microsecondsSinceEpoch}',
            'name': name.trim(),
            'durationMs': durationMs,
            'remainingMs': durationMs,
            'running': false,
          },
        ],
      });
      return;
    }

    if (type == 'customTimer.delete') {
      final id = payload['id'];
      _patchSession({
        'customTimers':
            _customTimersJson.where((timer) => timer['id'] != id).toList(),
      });
      return;
    }

    if (type == 'customTimer.action') {
      final id = payload['id'];
      final actionName = payload['action'];
      _patchSession({
        'customTimers': _customTimersJson.map((timer) {
          if (timer['id'] != id) return timer;
          final durationMs = timer['durationMs'] is num
              ? (timer['durationMs']! as num).toInt()
              : 60000;
          return {
            ...timer,
            if (actionName == 'reset') 'remainingMs': durationMs,
            if (actionName == 'start') 'running': true,
            if (actionName == 'pause' || actionName == 'reset')
              'running': false,
          };
        }).toList(),
      });
      return;
    }

    if (type == 'ai.newChat') {
      final chat = {
        'id': 'chat-${DateTime.now().microsecondsSinceEpoch}',
        'title': 'New chat',
        'messages': <Map<String, Object?>>[],
      };
      _patch({
        'ai': {
          ..._aiJson,
          'activeChatId': chat['id'],
          'chats': [..._chatsJson, chat],
        }
      });
      return;
    }

    if (type == 'ai.selectChat') {
      _patch({
        'ai': {..._aiJson, 'activeChatId': payload['id']}
      });
      return;
    }

    if (type == 'ai.renameChat') {
      final id = payload['id'];
      final title = payload['title'];
      if (id is! String || title is! String || title.trim().isEmpty) return;
      _patch({
        'ai': {
          ..._aiJson,
          'chats': _chatsJson.map((chat) {
            if (chat['id'] != id) return chat;
            return {...chat, 'title': title.trim()};
          }).toList(),
        }
      });
      return;
    }

    if (type == 'ai.deleteChat') {
      final id = payload['id'];
      final chats = _chatsJson.where((chat) => chat['id'] != id).toList();
      _patch({
        'ai': {
          ..._aiJson,
          'activeChatId': chats.isEmpty ? null : chats.first['id'],
          'chats': chats,
        }
      });
      return;
    }

    if (type == 'ai.sendMessage') {
      final text = payload['text'];
      if (text is! String || text.trim().isEmpty) return;
      final activeId = _aiJson['activeChatId'] as String? ??
          (_chatsJson.isEmpty ? null : _chatsJson.first['id'] as String?);
      if (activeId == null) return;
      _patch({
        'ai': {
          ..._aiJson,
          'chats': _chatsJson.map((chat) {
            if (chat['id'] != activeId) return chat;
            final messages = _list(chat['messages']);
            return {
              ...chat,
              'title': chat['title'] == 'New chat'
                  ? text.trim().split(' ').take(4).join(' ')
                  : chat['title'],
              'messages': [
                ...messages,
                {'role': 'user', 'text': text.trim()},
                {
                  'role': 'assistant',
                  'text':
                      'Preview response: I would use your cited files to build a tighter debate answer.'
                },
              ],
            };
          }).toList(),
        }
      });
      return;
    }

    if (type == 'history.delete') {
      final id = payload['id'];
      _patch({
        'history': _historyJson.where((record) => record['id'] != id).toList()
      });
      return;
    }

    if (type == 'settings.save') {
      final current =
          (_rawState['settings'] as Map?)?.cast<String, Object?>() ?? {};
      _patch({
        'settings': {
          ...current,
          'userName': payload['userName'] ?? current['userName'],
          'aiEndpoint': payload['aiEndpoint'] ?? current['aiEndpoint'],
          'aiModel': payload['aiModel'] ?? current['aiModel'],
          'hasAiKey': payload['aiApiKey'] is String &&
                  (payload['aiApiKey']! as String).isNotEmpty ||
              current['hasAiKey'] == true,
          'githubOwner': payload['githubOwner'] ?? current['githubOwner'],
          'githubRepo': payload['githubRepo'] ?? current['githubRepo'],
          'hasGithubToken': payload['githubToken'] is String &&
                  (payload['githubToken']! as String).isNotEmpty ||
              current['hasGithubToken'] == true,
        }
      });
      return;
    }

    if (type == 'workspace.reset') {
      _rawState
        ..clear()
        ..addAll(_initialPreviewState);
      _state.value = AppSnapshot.fromJson(_rawState);
      return;
    }
  }

  List<Map<String, Object?>> get _documentsJson {
    return _rawState['documents']! as List<Map<String, Object?>>;
  }

  List<Map<String, Object?>> get _cardsJson {
    return _rawState['cards']! as List<Map<String, Object?>>;
  }

  Map<String, Object?> get _sessionJson {
    return (_rawState['session'] as Map?)?.cast<String, Object?>() ??
        <String, Object?>{};
  }

  List<Map<String, Object?>> get _customTimersJson {
    return _list(_sessionJson['customTimers']);
  }

  Map<String, Object?> get _aiJson {
    return (_rawState['ai'] as Map?)?.cast<String, Object?>() ??
        <String, Object?>{};
  }

  List<Map<String, Object?>> get _chatsJson {
    return _list(_aiJson['chats']);
  }

  List<Map<String, Object?>> get _historyJson {
    return _list(_rawState['history']);
  }

  void _patchSession(Map<String, Object?> patch) {
    _patch({
      'session': {
        ..._sessionJson,
        ...patch,
      }
    });
  }

  void _tickTimers() {
    final now = DateTime.now();
    final elapsedMs = now.difference(_lastTick).inMilliseconds;
    _lastTick = now;
    if (elapsedMs <= 0 || _rawState['session'] == null) return;

    final session = _sessionJson;
    final patch = <String, Object?>{};

    if (session['speechRunning'] == true) {
      final next = _decrement(session['speechRemainingMs'], elapsedMs);
      patch['speechRemainingMs'] = next;
      if (next == 0) patch['speechRunning'] = false;
    }

    if (session['prepRunning'] == true) {
      final next = _decrement(session['prepRemainingMs'], elapsedMs);
      patch['prepRemainingMs'] = next;
      if (next == 0) patch['prepRunning'] = false;
    }

    final timers = _customTimersJson;
    var changedCustomTimers = false;
    final nextTimers = timers.map((timer) {
      if (timer['running'] != true) return timer;
      final next = _decrement(timer['remainingMs'], elapsedMs);
      changedCustomTimers = true;
      return {
        ...timer,
        'remainingMs': next,
        if (next == 0) 'running': false,
      };
    }).toList();

    if (changedCustomTimers) patch['customTimers'] = nextTimers;
    if (patch.isNotEmpty) _patchSession(patch);
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

int _decrement(Object? value, int elapsedMs) {
  final current = value is num ? value.toInt() : 0;
  final next = current - elapsedMs;
  return next <= 0 ? 0 : next;
}

List<Map<String, Object?>> _list(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => item.cast<String, Object?>())
      .toList();
}

int _parseDuration(Object? value) {
  if (value is! String) return 60000;
  final parts = value.split(':');
  if (parts.length != 2) return 60000;
  final minutes = int.tryParse(parts[0]) ?? 1;
  final seconds = int.tryParse(parts[1]) ?? 0;
  return ((minutes * 60) + seconds) * 1000;
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
  'history': <Map<String, Object?>>[
    {
      'id': 'history-demo',
      'matchName': 'Practice Round',
      'opponentName': 'Dialektik Preview',
      'sides': 'affirmative',
      'winLoss': 'pending',
      'timestamp': 1793648700000,
    }
  ],
  'session': <String, Object?>{
    'roomCode': 'DEMO',
    'matchName': 'Practice Round',
    'groupName': 'Dialektik Preview',
    'status': 'lobby',
    'handout': <String, Object?>{
      'title': 'Civic reasoning resolution',
      'problem':
          'Resolved: Public education should prioritize civic reasoning.',
      'details':
          'Prepare solvency, impact, and weighing for a practice debate.',
    },
    'currentSpeakerId': 'debater-1',
    'speakerNotes': <String, Object?>{
      'debater-1': 'Opening roadmap and first contention.',
    },
    'speechRemainingMs': 240000,
    'speechRunning': false,
    'prepRemainingMs': 180000,
    'prepRunning': false,
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
        'durationMs': 180000,
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
    'aiEndpoint': 'https://api.openai.com/v1',
    'aiModel': 'gpt-4o',
    'hasAiKey': false,
    'githubOwner': '',
    'githubRepo': '',
    'hasGithubToken': false,
  },
};
