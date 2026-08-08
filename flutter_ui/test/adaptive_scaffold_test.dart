import 'package:dialektik_flutter_ui/src/widgets/adaptive_scaffold.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('desktop panes honor task-focused initial proportions',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;

    const sidebarKey = Key('sidebar');
    const canvasKey = Key('canvas');
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ResponsivePane(
            mainPaneIndex: 1,
            collapsiblePaneIndices: {0},
            initialFractions: [0.24, 0.76],
            children: [
              ColoredBox(key: sidebarKey, color: Colors.black),
              ColoredBox(key: canvasKey, color: Colors.white),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final sidebarWidth = tester.getSize(find.byKey(sidebarKey)).width;
    final canvasWidth = tester.getSize(find.byKey(canvasKey)).width;
    expect(canvasWidth, greaterThan(sidebarWidth * 2.5));
    expect(tester.takeException(), isNull);
  });
}
