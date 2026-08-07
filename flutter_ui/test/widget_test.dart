import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dialektik_flutter_ui/dialektik_flutter_ui.dart';
import 'package:dialektik_flutter_ui/main.dart';

void main() {
  testWidgets('renders Dialektik Flutter shell', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;

    await tester.pumpWidget(DialektikFlutterApp(bridge: PreviewEngineBridge()));
    await tester.pump();

    expect(find.text('Documents'), findsWidgets);
    await tester.tap(find.text('Documents').first);
    await tester.pumpAndSettle();

    expect(
        find.text(
            'No Google Docs linked yet.\n\nLink a case, block file, or shared round document to begin.'),
        findsOneWidget);
    expect(find.text('Link your debate workspace'), findsOneWidget);
    expect(find.text('Offline workspace'), findsOneWidget);
  });

  testWidgets('links a Google Doc through the workspace', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.fuchsia;
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;

    await tester.pumpWidget(DialektikFlutterApp(bridge: PreviewEngineBridge()));
    await tester.pump();
    await tester.tap(find.text('Documents').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Link Google Doc'));
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'PF blocks');
    await tester.enterText(
      fields.at(1),
      'https://docs.google.com/document/d/debate-doc/edit?usp=sharing',
    );
    await tester.enterText(fields.at(2), 'Impact defense and frontlines');
    await tester.tap(find.text('Link document'));
    await tester.pumpAndSettle();

    expect(find.text('PF blocks'), findsWidgets);
    expect(find.text('Sharing is managed in Google Docs'), findsOneWidget);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('keeps the live round HUD visible on a phone', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    await tester.pumpWidget(
      DialektikFlutterApp(
        bridge: PreviewEngineBridge(initialState: _activeRoundState()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ABCD'), findsOneWidget);
    expect(find.text('4:00'), findsOneWidget);
    expect(find.text('First Speaker — Team A'), findsWidgets);

    await tester.tap(find.text('Notes'));
    await tester.pumpAndSettle();
    expect(find.text('4:00'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Map<String, Object?> _activeRoundState() {
  return {
    'activePage': 'inround',
    'documents': <Map<String, Object?>>[],
    'cards': <Map<String, Object?>>[],
    'history': <Map<String, Object?>>[],
    'session': <String, Object?>{
      'roomCode': 'ABCD',
      'matchName': 'PF practice',
      'groupName': 'Dialektik Team',
      'status': 'active',
      'handout': {
        'title': 'Practice round',
        'problem': 'Resolved: The test suite should pass.',
        'details': '',
      },
      'debaters': <Map<String, Object?>>[
        {
          'id': 'student-1',
          'name': 'Student',
          'status': 'approved',
          'team': 'affirmative',
          'position': 1,
        },
      ],
      'currentSpeakerId': 'student-1',
      'speakerNotes': <String, Object?>{},
      'speechRemainingMs': 240000,
      'speechRunning': false,
      'prepRemainingMs': 180000,
      'prepDurationMs': 180000,
      'prepRunning': false,
      'eventFormat': 'pf',
      'eventName': 'Public Forum',
      'speechOrder': <Map<String, Object?>>[
        {
          'id': 'team-a-1',
          'label': 'First Speaker — Team A',
          'durationMs': 240000,
          'kind': 'speech',
          'team': 'affirmative',
          'position': 1,
        },
        {
          'id': 'team-b-1',
          'label': 'First Speaker — Team B',
          'durationMs': 240000,
          'kind': 'speech',
          'team': 'negative',
          'position': 1,
        },
      ],
      'currentSpeechIndex': 0,
      'autoAdvance': false,
      'customTimers': <Map<String, Object?>>[],
      'pendingRequests': <Map<String, Object?>>[],
      'isHost': true,
    },
    'ai': <String, Object?>{
      'activeChatId': null,
      'loading': false,
      'chats': <Map<String, Object?>>[],
    },
    'settings': <String, Object?>{
      'userId': 'student-1',
      'userName': 'Student',
      'aiEndpoint': '',
      'aiModel': '',
      'hasAiKey': false,
      'manualDocumentSync': false,
      'joinRequestNotifications': false,
    },
  };
}
