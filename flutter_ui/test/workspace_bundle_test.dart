import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:dialektik_flutter_ui/dialektik_flutter_ui.dart';
import 'package:dialektik_flutter_ui/main.dart';
import 'package:dialektik_flutter_ui/src/services/workspace_bundle_service.dart';

void main() {
  test('workspace bundle round-trips portable data and excludes secrets', () {
    final snapshot = AppSnapshot.fromJson(_snapshotJson());

    final encoded = WorkspaceBundleService.encode(
      snapshot,
      appVersion: '0.2.2',
    );
    final bundle = WorkspaceBundleService.decode(encoded);
    final raw = jsonDecode(encoded) as Map<String, dynamic>;
    final settings = raw['data']['settings'] as Map<String, dynamic>;

    expect(bundle.documentCount, 1);
    expect(bundle.cardCount, 1);
    expect(bundle.historyCount, 1);
    expect(bundle.warnings, isEmpty);
    expect(settings['userName'], 'Student');
    expect(settings.containsKey('aiApiKey'), isFalse);
    expect(settings.containsKey('turnCredential'), isFalse);
  });

  test('workspace bundle reports missing evidence citations', () {
    final json = _snapshotJson();
    final documents = json['documents'] as List<Map<String, Object?>>;
    documents.first['content'] = 'Extend this card [[missing-card]].';

    final bundle = WorkspaceBundleService.decode(
      WorkspaceBundleService.encode(
        AppSnapshot.fromJson(json),
        appVersion: '0.2.2',
      ),
    );

    expect(bundle.warnings, hasLength(1));
    expect(bundle.warnings.single, contains('not included'));
  });

  test('workspace bundle rejects unrelated JSON', () {
    expect(
      () => WorkspaceBundleService.decode('{"documents": []}'),
      throwsFormatException,
    );
  });

  test('preview engine restores workspace bundle data', () async {
    final source = AppSnapshot.fromJson(_snapshotJson());
    final bundle = WorkspaceBundleService.decode(
      WorkspaceBundleService.encode(source, appVersion: '0.2.2'),
    );
    final empty = _snapshotJson()
      ..['documents'] = <Map<String, Object?>>[]
      ..['cards'] = <Map<String, Object?>>[]
      ..['history'] = <Map<String, Object?>>[];
    final bridge = PreviewEngineBridge(initialState: empty);
    final restored = bridge.snapshots.firstWhere(
      (snapshot) => snapshot.documents.isNotEmpty,
    );

    await bridge.dispatch(action('workspace.import', {
      'data': bundle.data,
      'strategy': 'keepNewest',
    }));
    final snapshot = await restored;

    expect(snapshot.documents.single.title, 'Case');
    expect(snapshot.cards.single.title, 'Economic growth');
    expect(snapshot.history.single.matchName, 'Practice');
  });
}

Map<String, Object?> _snapshotJson() {
  return {
    'activePage': 'documents',
    'documents': <Map<String, Object?>>[
      {
        'id': 'doc-1',
        'name': 'Case.md',
        'content': 'Extend this card [[card-1]].',
        'sourceType': 'local',
        'partnerAccess': 'private',
        'encryptedHash': 'write',
        'lastModified': 100,
      },
    ],
    'cards': <Map<String, Object?>>[
      {
        'id': 'card-1',
        'title': 'Economic growth',
        'text': 'Evidence text',
        'sourceUrl': 'https://example.com',
        'folder': 'private',
        'author': 'Student',
      },
    ],
    'history': <Map<String, Object?>>[
      {
        'id': 'round-1',
        'matchName': 'Practice',
        'opponentName': 'Rival',
        'sides': 'affirmative',
        'winLoss': 'win',
        'timestamp': 200,
        'flows': <Map<String, Object?>>[],
      },
    ],
    'session': null,
    'ai': <String, Object?>{
      'activeChatId': null,
      'loading': false,
      'chats': <Map<String, Object?>>[],
    },
    'settings': <String, Object?>{
      'userName': 'Student',
      'aiEndpoint': 'https://api.example.com',
      'aiModel': 'model',
      'hasAiKey': true,
      'turnCredential': 'secret-turn-password',
      'manualDocumentSync': false,
      'joinRequestNotifications': true,
    },
  };
}
