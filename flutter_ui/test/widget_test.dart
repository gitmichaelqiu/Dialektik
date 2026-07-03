import 'package:flutter_test/flutter_test.dart';

import 'package:dialektik_flutter_ui/dialektik_flutter_ui.dart';
import 'package:dialektik_flutter_ui/main.dart';

void main() {
  testWidgets('renders Dialektik Flutter shell', (tester) async {
    await tester.pumpWidget(DialektikFlutterApp(bridge: PreviewEngineBridge()));
    await tester.pump();

    expect(find.text('Documents'), findsWidgets);
    expect(find.text('Affirmative Case'), findsOneWidget);
  });
}
