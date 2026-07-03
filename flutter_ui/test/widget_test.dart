import 'package:flutter/material.dart';
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

    expect(find.text('No documents yet.'), findsOneWidget);
    expect(find.text('Select a document to start editing.'), findsOneWidget);
  });
}
