import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../bridge/js_engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../screens/ai_screen.dart';
import '../screens/documents_screen.dart';
import '../screens/history_screen.dart';
import '../screens/in_round_screen.dart';
import '../screens/settings_screen.dart';

class DialektikFlutterApp extends StatelessWidget {
  const DialektikFlutterApp({
    super.key,
    required this.bridge,
    this.initialSnapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot? initialSnapshot;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff0f766e),
          brightness: Brightness.light,
        ),
        cardTheme: const CardThemeData(
          clipBehavior: Clip.antiAlias,
          margin: EdgeInsets.zero,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          isDense: true,
        ),
      ),
      home: _AppRoot(bridge: bridge, initialSnapshot: initialSnapshot),
    );
  }
}

/// Root widget that mounts the hidden engine WebView (when using JsEngineBridge)
/// and the real app shell on top of it.
class _AppRoot extends StatelessWidget {
  const _AppRoot({required this.bridge, this.initialSnapshot});

  final EngineBridge bridge;
  final AppSnapshot? initialSnapshot;

  @override
  Widget build(BuildContext context) {
    final jsWebView = bridge is JsEngineBridge
        ? (bridge as JsEngineBridge).buildWebView()
        : null;

    final shell = StreamBuilder<AppSnapshot>(
      stream: bridge.snapshots,
      initialData: initialSnapshot ?? AppSnapshot.initial(),
      builder: (context, snapshot) {
        return _AppShell(
          bridge: bridge,
          snapshot: snapshot.data ?? AppSnapshot.initial(),
        );
      },
    );

    if (jsWebView == null) return shell;

    return Stack(
      children: [
        // Hidden 1×1 engine WebView – must be in the tree to keep WebRTC alive
        Positioned(
          left: 0, top: 0,
          width: 1, height: 1,
          child: Opacity(opacity: 0, child: jsWebView),
        ),
        shell,
      ],
    );
  }
}

class _AppShell extends StatelessWidget {
  const _AppShell({
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 720;
    final body = _PageBody(bridge: bridge, snapshot: snapshot);

    if (compact) {
      return Scaffold(
        appBar: AppBar(
          title: Text(_pageTitle(snapshot.activePage)),
          centerTitle: false,
        ),
        body: SafeArea(child: body),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _indexForPage(snapshot.activePage),
          onDestinationSelected: (index) => _selectPage(_pageForIndex(index)),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.timer_outlined),
                selectedIcon: Icon(Icons.timer),
                label: 'Round'),
            NavigationDestination(
                icon: Icon(Icons.article_outlined),
                selectedIcon: Icon(Icons.article),
                label: 'Docs'),
            NavigationDestination(
                icon: Icon(Icons.auto_awesome_outlined),
                selectedIcon: Icon(Icons.auto_awesome),
                label: 'Coach'),
            NavigationDestination(
                icon: Icon(Icons.history_outlined),
                selectedIcon: Icon(Icons.history),
                label: 'History'),
            NavigationDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings),
                label: 'Settings'),
          ],
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Row(
          children: [
            NavigationRail(
              selectedIndex: _indexForPage(snapshot.activePage),
              onDestinationSelected: (index) =>
                  _selectPage(_pageForIndex(index)),
              labelType: NavigationRailLabelType.all,
              destinations: const [
                NavigationRailDestination(
                    icon: Icon(Icons.timer_outlined),
                    selectedIcon: Icon(Icons.timer),
                    label: Text('In Round')),
                NavigationRailDestination(
                    icon: Icon(Icons.article_outlined),
                    selectedIcon: Icon(Icons.article),
                    label: Text('Documents')),
                NavigationRailDestination(
                    icon: Icon(Icons.auto_awesome_outlined),
                    selectedIcon: Icon(Icons.auto_awesome),
                    label: Text('AI Coach')),
                NavigationRailDestination(
                    icon: Icon(Icons.history_outlined),
                    selectedIcon: Icon(Icons.history),
                    label: Text('History')),
                NavigationRailDestination(
                    icon: Icon(Icons.settings_outlined),
                    selectedIcon: Icon(Icons.settings),
                    label: Text('Settings')),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }

  void _selectPage(AppPage page) {
    bridge.dispatch(action('app.setActivePage', {'page': page.actionValue}));
  }
}

class _PageBody extends StatelessWidget {
  const _PageBody({
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    return switch (snapshot.activePage) {
      AppPage.documents => DocumentsScreen(bridge: bridge, snapshot: snapshot),
      AppPage.inRound => InRoundScreen(bridge: bridge, snapshot: snapshot),
      AppPage.ai => AiScreen(bridge: bridge, snapshot: snapshot),
      AppPage.history => HistoryScreen(bridge: bridge, snapshot: snapshot),
      AppPage.settings => SettingsScreen(bridge: bridge, snapshot: snapshot),
    };
  }
}

int _indexForPage(AppPage page) {
  return switch (page) {
    AppPage.inRound => 0,
    AppPage.documents => 1,
    AppPage.ai => 2,
    AppPage.history => 3,
    AppPage.settings => 4,
  };
}

AppPage _pageForIndex(int index) {
  return switch (index) {
    0 => AppPage.inRound,
    1 => AppPage.documents,
    2 => AppPage.ai,
    3 => AppPage.history,
    _ => AppPage.settings,
  };
}

String _pageTitle(AppPage page) {
  return switch (page) {
    AppPage.documents => 'Documents',
    AppPage.inRound => 'In Round',
    AppPage.ai => 'AI Coach',
    AppPage.history => 'History',
    AppPage.settings => 'Settings',
  };
}
