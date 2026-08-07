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
}
