import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'dialektik_flutter_ui.dart';
import 'src/bridge/js_engine_bridge_io.dart'
    if (dart.library.html) 'src/bridge/js_engine_bridge_web.dart';
import 'src/services/auto_update_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(DialektikFlutterApp(bridge: JsEngineBridge()));
  // Do not block the first Flutter frame on optional desktop-only updater
  // setup. This is especially important on iOS, where the updater is a no-op
  // and the app should render immediately.
  unawaited(AutoUpdateService.initialize());
}

class PreviewEngineBridge implements EngineBridge {
  PreviewEngineBridge({
    Map<String, Object?>? initialState,
    SharedPreferences? prefs,
  })  : _prefs = prefs,
        _state = ValueNotifier<AppSnapshot>(
          AppSnapshot.fromJson(initialState ?? _initialPreviewState),
        ) {
    _rawState.addAll(initialState ?? _initialPreviewState);
    _lastTick = DateTime.now();
    _periodicTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      _tickTimers();
    });
    _controller = StreamController<AppSnapshot>.broadcast(
      onListen: () {
        _controller.add(_state.value);
        _state.addListener(_emit);
      },
      onCancel: () {
        _state.removeListener(_emit);
        _periodicTimer?.cancel();
        _reloadTimer?.cancel();
      },
    );

    // Cross-tab real-time sync reloader loop
    _reloadTimer = Timer.periodic(const Duration(seconds: 1), (_) async {
      final p = _prefs;
      if (p == null) return;
      try {
        await p.reload();
        final savedStateStr = p.getString('dialektik_preview_state');
        if (savedStateStr == null) return;
        final Map<String, Object?> newState =
            (jsonDecode(savedStateStr) as Map).cast<String, Object?>();
        bool changed = false;

        for (final key in const ['session', 'documents', 'cards', 'history']) {
          final newVal = newState[key];
          final currentVal = _rawState[key];
          if (jsonEncode(newVal) != jsonEncode(currentVal)) {
            if (key == 'session' && newVal is Map && currentVal is Map) {
              final mergedSession = Map<String, Object?>.from(newVal);
              mergedSession['isHost'] = currentVal['isHost'];

              // If we are waiting for host approval, check if the host has approved us
              final currentStatus = currentVal['status'];
              if (currentStatus == 'pending_approval') {
                final settings = _rawState['settings'] as Map?;
                final cleanUserName =
                    (settings?['userName'] as String? ?? 'Debater').trim();
                final approvedList = _list(newVal['debaters']);
                final isApproved =
                    approvedList.any((d) => d['name'] == cleanUserName);
                if (isApproved) {
                  mergedSession['status'] = 'lobby';
                }
              }
              _rawState['session'] = mergedSession;
            } else {
              _rawState[key] = newVal;
            }
            changed = true;
          }
        }

        if (changed) {
          _state.value = AppSnapshot.fromJson(_rawState);
        }
      } catch (_) {}
    });
  }

  final SharedPreferences? _prefs;
  static Timer? _syncTimer;
  Timer? _periodicTimer;
  Timer? _reloadTimer;
  final ValueNotifier<AppSnapshot> _state;
  late final StreamController<AppSnapshot> _controller;
  late DateTime _lastTick;

  @override
  Stream<AppSnapshot> get snapshots => _controller.stream;

  @override
  Widget? buildWebView() => null;

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

    if (type == 'document.spliceContent') {
      final id = payload['id'];
      final index = payload['index'];
      final deleteCount = payload['deleteCount'];
      final insertText = payload['insertText'];
      if (id is! String ||
          index is! num ||
          deleteCount is! num ||
          insertText is! String) {
        return;
      }
      final docs = _documentsJson.map((doc) {
        if (doc['id'] != id) return doc;
        return {
          ...doc,
          'content': _applyTextSplice(
            doc['content'] as String? ?? '',
            index.toInt(),
            deleteCount.toInt(),
            insertText,
          ),
          'lastModified': DateTime.now().millisecondsSinceEpoch,
        };
      }).toList();
      _patch({'documents': docs});
      return;
    }

    if (type == 'document.create') {
      final requestedName = payload['name'];
      final folder = payload['folder'];
      final mode = payload['mode'];
      final settings =
          (_rawState['settings'] as Map?)?.cast<String, Object?>() ?? {};
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
          'ownerId': settings['userId'] as String? ?? 'preview-user',
          'ownerName': settings['userName'] as String? ?? '',
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
            'folder':
                payload['folder'] is String ? payload['folder'] : 'private',
          },
        ],
      });
      return;
    }

    if (type == 'card.update') {
      final id = payload['id'];
      if (id is! String) return;
      final cards = _cardsJson.map((card) {
        if (card['id'] != id) return card;
        return {
          ...card,
          if (payload['title'] is String) 'title': payload['title'],
          if (payload['text'] is String) 'text': payload['text'],
          if (payload['sourceUrl'] is String) 'sourceUrl': payload['sourceUrl'],
          if (payload['folder'] is String) 'folder': payload['folder'],
        };
      }).toList();
      _patch({'cards': cards});
      return;
    }

    if (type == 'card.move') {
      final id = payload['id'];
      final folder = payload['folder'];
      if (id is! String || folder is! String) return;
      if (!const {'private', 'team', 'public'}.contains(folder)) return;
      final cards = _cardsJson.map((card) {
        if (card['id'] != id) return card;
        return {...card, 'folder': folder};
      }).toList();
      _patch({'cards': cards});
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
      final settings = _rawState['settings'] as Map?;
      final userName = (settings?['userName'] as String? ?? 'Host').trim();
      final hostName = userName.isNotEmpty ? userName : 'Host';
      final randomCode = _generateRoomCode();
      final participate = payload['participate'] != false;
      _patch({
        'activePage': 'inround',
        'session': {
          'roomCode': randomCode,
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
          'debaters': participate
              ? [
                  {
                    'id': 'debater-local',
                    'name': hostName,
                    'status': 'approved',
                    'team': 'affirmative',
                    'position': 1,
                  }
                ]
              : <Map<String, Object?>>[],
          'customTimers': <Map<String, Object?>>[],
          'speakerNotes': <String, Object?>{},
          'pendingRequests': <Map<String, Object?>>[],
          'isHost': true,
        },
      });

      _startSyncSimulation();
      return;
    }

    if (type == 'session.join') {
      final code =
          (payload['roomCode'] as String? ?? 'ROOM').trim().toUpperCase();
      final settings = _rawState['settings'] as Map?;
      final userName = (settings?['userName'] as String? ?? 'Debater').trim();
      final cleanUserName = userName.isNotEmpty ? userName : 'Debater';

      final currentSession = _rawState['session'] as Map?;
      if (currentSession != null && currentSession['roomCode'] == code) {
        final reqs = _list(currentSession['pendingRequests']);
        final alreadyRequested = reqs.any((r) => r['name'] == cleanUserName);

        if (!alreadyRequested) {
          final updatedSession = Map<String, Object?>.from(currentSession);
          final clientId = 'debater-${DateTime.now().microsecondsSinceEpoch}';
          updatedSession['pendingRequests'] = [
            ...reqs,
            {
              'id': clientId,
              'name': cleanUserName,
            }
          ];
          _rawState['session'] = updatedSession;
          _patch({
            'activePage': 'inround',
            'session': updatedSession,
          });
        } else {
          _patch({'activePage': 'inround'});
        }
      } else {
        _patch({
          'activePage': 'inround',
          'session': {
            'roomCode': code,
            'matchName': 'Practice Round',
            'groupName': 'Joined Group',
            'status': 'pending_approval',
            'handout': {'title': '', 'problem': '', 'details': ''},
            'speechRemainingMs': 240000,
            'speechRunning': false,
            'prepRemainingMs': 180000,
            'prepRunning': false,
            'debaters': [
              {
                'id': 'debater-host',
                'name': 'Host User',
                'status': 'approved',
                'team': 'affirmative',
                'position': 1,
              },
            ],
            'customTimers': <Map<String, Object?>>[],
            'speakerNotes': <String, Object?>{},
            'pendingRequests': [
              {
                'id': 'debater-local',
                'name': cleanUserName,
              }
            ],
            'isHost': false,
          }
        });
      }

      _startSyncSimulation();
      return;
    }

    if (type == 'session.exit') {
      _syncTimer?.cancel();
      _patch({'session': null});
      return;
    }

    if (type == 'session.approveJoin') {
      final id = payload['id'] as String?;
      if (id == null) return;
      final session = _sessionJson;
      final reqs = _list(session['pendingRequests']);
      Map<String, Object?>? req;
      for (final r in reqs) {
        if (r['id'] == id) {
          req = r;
          break;
        }
      }
      if (req == null) return;

      final debaters = _list(session['debaters']);
      final nextDebaters = [
        ...debaters,
        {
          'id': req['id'],
          'name': req['name'],
          'status': 'approved',
          'team': 'negative',
          'position': 1,
        }
      ];

      _patchSession({
        'pendingRequests': reqs.where((r) => r['id'] != id).toList(),
        'debaters': nextDebaters,
      });
      return;
    }

    if (type == 'session.rejectJoin') {
      final id = payload['id'] as String?;
      if (id == null) return;
      final session = _sessionJson;
      final reqs = _list(session['pendingRequests']);
      _patchSession({
        'pendingRequests': reqs.where((r) => r['id'] != id).toList(),
      });
      return;
    }

    if (type == 'session.startDebate') {
      _patchSession({'status': 'active'});
      return;
    }

    if (type == 'session.updateHandout') {
      if (!((_sessionJson['isHost'] as bool?) ?? false)) return;
      _patchSession({
        'handout': {
          'title': payload['title'] ?? '',
          'problem': payload['problem'] ?? '',
          'details': payload['details'] ?? '',
        }
      });
      return;
    }

    if (type == 'session.spliceHandout') {
      if (!((_sessionJson['isHost'] as bool?) ?? false)) return;
      final field = payload['field'];
      final index = payload['index'];
      final deleteCount = payload['deleteCount'];
      final insertText = payload['insertText'];
      if (field is! String ||
          index is! num ||
          deleteCount is! num ||
          insertText is! String) {
        return;
      }
      if (!const {'title', 'problem', 'details'}.contains(field)) return;
      final session = _sessionJson;
      final handout = (session['handout'] as Map?)?.cast<String, Object?>() ??
          const <String, Object?>{};
      _patchSession({
        'handout': {
          ...handout,
          field: _applyTextSplice(
            handout[field] as String? ?? '',
            index.toInt(),
            deleteCount.toInt(),
            insertText,
          ),
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
      final winner = payload['winner'] as String? ?? 'affirmative';
      final mySide = 'affirmative';
      final isWin = winner == mySide;

      final session = _sessionJson;
      final debaters = _list(session['debaters']);
      final flows = <Map<String, Object?>>[];
      final notes =
          (session['speakerNotes'] as Map?)?.cast<String, Object?>() ??
              const {};

      for (final debater in debaters) {
        final id = debater['id'] as String? ?? '';
        final name = debater['name'] as String? ?? 'Debater';
        flows.add({
          'speechId': name,
          'notes': notes[id] as String? ?? '',
        });
      }

      final newRecord = {
        'id': 'history-${DateTime.now().microsecondsSinceEpoch}',
        'matchName': session['matchName'] ?? 'Practice Round',
        'opponentName': session['groupName'] ?? 'Dialektik Team',
        'sides': mySide,
        'winLoss': isWin ? 'win' : 'loss',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'flows': flows,
      };

      _patch({
        'session': null,
        'activePage': 'history',
        'history': [..._historyJson, newRecord],
      });
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
      final newUserName = payload['userName'] as String? ??
          current['userName'] as String? ??
          '';
      _patch({
        'settings': {
          ...current,
          'userName': newUserName,
          'aiEndpoint': payload['aiEndpoint'] ?? current['aiEndpoint'],
          'aiModel': payload['aiModel'] ?? current['aiModel'],
          'manualDocumentSync': payload['manualDocumentSync'] ??
              current['manualDocumentSync'] ??
              false,
          'hasAiKey': payload['aiApiKey'] is String &&
                  (payload['aiApiKey']! as String).isNotEmpty ||
              current['hasAiKey'] == true,
        }
      });

      if (_rawState['session'] != null) {
        final session = _sessionJson;
        final debaters = _list(session['debaters']).map((d) {
          if (d['id'] == 'debater-local') {
            return {
              ...d,
              'name': newUserName.trim().isNotEmpty
                  ? newUserName.trim()
                  : 'Debater',
            };
          }
          return d;
        }).toList();
        _patchSession({'debaters': debaters});
      }
      return;
    }

    if (type == 'workspace.reset') {
      final preserveSettings = payload['preserveSettings'] == true;
      final preservedSettings = preserveSettings
          ? Map<String, Object?>.from(_rawState['settings']! as Map)
          : null;
      _syncTimer?.cancel();
      final currentPage = _rawState['activePage'];
      _rawState
        ..clear()
        ..addAll(_initialPreviewState);
      if (currentPage != null) {
        _rawState['activePage'] = currentPage;
      }
      if (preservedSettings != null) {
        _rawState['settings'] = preservedSettings;
      }
      _state.value = AppSnapshot.fromJson(_rawState);
      return;
    }
  }

  void _startSyncSimulation() {
    _syncTimer?.cancel();
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

  final Map<String, Object?> _rawState = {};

  String _generateRoomCode() {
    final random = Random();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return String.fromCharCodes(Iterable.generate(
        4, (_) => chars.codeUnitAt(random.nextInt(chars.length))));
  }

  void _patch(Map<String, Object?> patch) {
    _rawState.addAll(patch);
    _state.value = AppSnapshot.fromJson(_rawState);
    _saveToPrefs();
  }

  void _saveToPrefs() {
    final prefs = _prefs;
    if (prefs == null) return;
    try {
      prefs.setString('dialektik_preview_state', jsonEncode(_rawState));
    } catch (_) {}
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

String _applyTextSplice(
  String text,
  int index,
  int deleteCount,
  String insertText,
) {
  final start = index.clamp(0, text.length);
  final end = (start + deleteCount).clamp(start, text.length);
  return text.replaceRange(start, end, insertText);
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

final Map<String, Object?> _initialPreviewState = {
  'activePage': 'inround',
  'documents': <Map<String, Object?>>[],
  'cards': <Map<String, Object?>>[],
  'history': <Map<String, Object?>>[],
  'session': null,
  'ai': <String, Object?>{
    'activeChatId': 'chat-1',
    'loading': false,
    'chats': <Map<String, Object?>>[
      {
        'id': 'chat-1',
        'title': 'New Chat',
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
    'userId': 'preview-user',
    'userName': '',
    'aiEndpoint': '',
    'aiModel': '',
    'hasAiKey': false,
    'manualDocumentSync': false,
  },
};
