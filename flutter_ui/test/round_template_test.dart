import 'package:flutter_test/flutter_test.dart';

import 'package:dialektik_flutter_ui/dialektik_flutter_ui.dart';
import 'package:dialektik_flutter_ui/main.dart';

void main() {
  test('Public Forum preset configures the official timed sequence', () async {
    final bridge = PreviewEngineBridge(initialState: _previewState());
    final hosted = bridge.snapshots.firstWhere((snapshot) =>
        snapshot.session?.eventFormat == 'pf' &&
        snapshot.session!.speechOrder.isNotEmpty);

    await bridge.dispatch(action('session.host', {
      'matchName': 'PF practice',
      'eventFormat': 'pf',
      'participate': true,
    }));
    final session = (await hosted).session!;

    expect(session.eventName, 'Public Forum');
    expect(session.speechOrder, hasLength(11));
    expect(session.speechOrder.first.durationMs, 4 * 60000);
    expect(session.speechOrder[2].label, 'Crossfire');
    expect(session.speechOrder[2].durationMs, 3 * 60000);
    expect(session.speechOrder.last.label, 'Final Focus — Team B');
    expect(session.prepDurationMs, 3 * 60000);
  });

  test('Lincoln-Douglas preset and speech advance reset the timer', () async {
    final bridge = PreviewEngineBridge(initialState: _previewState());
    final hosted = bridge.snapshots.firstWhere(
      (snapshot) => snapshot.session?.eventFormat == 'ld',
    );
    await bridge.dispatch(action('session.host', {
      'matchName': 'LD practice',
      'eventFormat': 'ld',
    }));
    final session = (await hosted).session!;

    expect(
      session.speechOrder.map((slot) => slot.durationMs ~/ 60000),
      [6, 3, 7, 3, 4, 6, 3],
    );
    expect(session.prepDurationMs, 4 * 60000);

    final advanced = bridge.snapshots.firstWhere(
      (snapshot) => snapshot.session?.currentSpeechIndex == 1,
    );
    await bridge.dispatch(action('session.advanceSpeech'));
    final next = (await advanced).session!;
    expect(next.currentSpeech?.label, 'Negative Cross-Examination');
    expect(next.speechRemainingMs, 3 * 60000);
    expect(next.speechRunning, isFalse);
  });

  test('Policy and World Schools presets expose complete speech orders',
      () async {
    for (final expected in const {
      'policy': (name: 'Policy', count: 12, prepMinutes: 8),
      'worlds': (name: 'World Schools', count: 8, prepMinutes: 0),
    }.entries) {
      final bridge = PreviewEngineBridge(initialState: _previewState());
      final hosted = bridge.snapshots.firstWhere(
        (snapshot) => snapshot.session?.eventFormat == expected.key,
      );
      await bridge.dispatch(action('session.host', {
        'matchName': '${expected.value.name} practice',
        'eventFormat': expected.key,
      }));
      final session = (await hosted).session!;
      expect(session.eventName, expected.value.name);
      expect(session.speechOrder, hasLength(expected.value.count));
      expect(
        session.prepDurationMs,
        expected.value.prepMinutes * 60000,
      );
    }
  });
}

Map<String, Object?> _previewState() {
  return {
    'activePage': 'inround',
    'documents': <Map<String, Object?>>[],
    'cards': <Map<String, Object?>>[],
    'history': <Map<String, Object?>>[],
    'session': null,
    'ai': <String, Object?>{
      'activeChatId': null,
      'loading': false,
      'chats': <Map<String, Object?>>[],
    },
    'settings': <String, Object?>{
      'userId': 'preview-user',
      'userName': 'Student',
      'aiEndpoint': '',
      'aiModel': '',
      'hasAiKey': false,
      'manualDocumentSync': false,
      'joinRequestNotifications': false,
    },
  };
}
