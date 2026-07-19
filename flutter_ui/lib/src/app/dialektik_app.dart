import 'dart:async';

import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../screens/ai_screen.dart';
import '../screens/documents_screen.dart';
import '../screens/history_screen.dart';
import '../screens/in_round_screen.dart';
import '../screens/settings_screen.dart';
import '../services/join_request_notification_service.dart';

const Color _seedColor = Color(0xff0f766e);

final Map<Brightness, ThemeData> _themeCache = {};

ThemeData _appTheme(Brightness brightness) {
  // Cache theme data per brightness — avoids creating a new ThemeData on
  // every snapshot tick, which would rebuild the entire widget tree.
  return _themeCache.putIfAbsent(
      brightness,
      () => ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: _seedColor,
              brightness: brightness,
            ),
            cardTheme: const CardThemeData(
              clipBehavior: Clip.antiAlias,
              margin: EdgeInsets.zero,
            ),
            inputDecorationTheme: const InputDecorationTheme(
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ));
}

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
      themeMode: ThemeMode.light,
      theme: _appTheme(Brightness.light),
      darkTheme: _appTheme(Brightness.dark),
      builder: (context, child) => _KeyboardDismissRegion(child: child),
      home: _AppRoot(bridge: bridge, initialSnapshot: initialSnapshot),
    );
  }
}

class _KeyboardDismissRegion extends StatelessWidget {
  const _KeyboardDismissRegion({required this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (event) {
        final focus = FocusManager.instance.primaryFocus;
        final focusContext = focus?.context;
        if (focus == null || focusContext == null) return;

        final renderObject = focusContext.findRenderObject();
        if (renderObject is RenderBox) {
          final localPosition = renderObject.globalToLocal(event.position);
          if (renderObject.size.contains(localPosition)) return;
        }
        focus.unfocus();
      },
      child: child ?? const SizedBox.shrink(),
    );
  }
}

/// Root widget that mounts the hidden engine WebView (when using JsEngineBridge)
/// and the real app shell on top of it, while applying the correct theme
/// based on the system brightness (read from [MediaQuery] which works
/// reliably on all platforms including macOS desktop).
class _AppRoot extends StatelessWidget {
  const _AppRoot({required this.bridge, this.initialSnapshot});

  final EngineBridge bridge;
  final AppSnapshot? initialSnapshot;

  @override
  Widget build(BuildContext context) {
    final jsWebView = bridge.buildWebView();

    final shell = StreamBuilder<AppSnapshot>(
      stream: bridge.snapshots,
      // Render the Flutter shell immediately while the native WebView boots.
      // On iOS, WKWebView startup can take long enough that waiting for the
      // first IndexedDB snapshot looks like a blank launch screen.
      initialData: initialSnapshot ?? AppSnapshot.initial(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Theme(
            data: _appTheme(Brightness.light),
            child: const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            ),
          );
        }
        final snap = snapshot.data ?? AppSnapshot.initial();
        // Apply theme from the engine-detected systemBrightness. The engine
        // uses window.matchMedia which works in both browser (web) and
        // WKWebView (desktop), unlike platformDispatcher on macOS.
        final theme = _appTheme(snap.systemBrightness);
        return Theme(
          data: theme,
          child: _JoinRequestAwareShell(bridge: bridge, snapshot: snap),
        );
      },
    );

    if (jsWebView == null) return shell;

    // The engine WebView must be in the widget tree so the WKWebView process
    // stays alive (WebRTC connection), but it must never be visible.
    // Give it a real 1×1 frame placed just above the visible area so WKWebView
    // is active and fires onLoadStop, but users never see it.
    return Stack(
      children: [
        Positioned(top: -2, left: 0, width: 1, height: 1, child: jsWebView),
        Positioned.fill(child: shell),
      ],
    );
  }
}

class _JoinRequestAwareShell extends StatefulWidget {
  const _JoinRequestAwareShell({required this.bridge, required this.snapshot});

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<_JoinRequestAwareShell> createState() => _JoinRequestAwareShellState();
}

class _JoinRequestAwareShellState extends State<_JoinRequestAwareShell> {
  final Set<String> _shownRequestIds = <String>{};
  bool _rejectionShown = false;

  @override
  void didUpdateWidget(covariant _JoinRequestAwareShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    _notifyForNewRequests();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _notifyForNewRequests());
  }

  void _notifyForNewRequests() {
    final session = widget.snapshot.session;
    if (!mounted) return;
    if (session != null && !session.isHost && session.status == 'rejected') {
      if (_rejectionShown) return;
      _rejectionShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.fixed,
            backgroundColor: Theme.of(context).colorScheme.error,
            content: Row(
              children: [
                Icon(Icons.cancel, color: Theme.of(context).colorScheme.onError),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Your request was rejected by the host.',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onError,
                    ),
                  ),
                ),
              ],
            ),
            duration: const Duration(seconds: 4),
          ),
        );
        // The rejected state is only a notification carrier. Clean it up
        // immediately so the client is ready to join another room.
        widget.bridge.dispatch(action('session.exit', {}));
      });
      return;
    }
    if (session == null || session.isHost) {
      _rejectionShown = false;
    }
    if (session == null || !session.isHost) return;
    final activeRequestIds = session.pendingRequests.map((request) => request.id).toSet();
    _shownRequestIds.removeWhere((id) => !activeRequestIds.contains(id));
    for (final request in session.pendingRequests) {
      if (!_shownRequestIds.add(request.id)) continue;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.fixed,
            backgroundColor: Colors.black87,
            content: Row(
              children: [
                const Icon(Icons.person_add, color: Colors.white70, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Join request from ${request.name}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    widget.bridge.dispatch(
                        action('session.rejectJoin', {'id': request.id}));
                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                  },
                  child: const Text('Reject',
                      style: TextStyle(color: Colors.redAccent)),
                ),
                FilledButton(
                  onPressed: () {
                    widget.bridge.dispatch(
                        action('session.approveJoin', {'id': request.id}));
                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Text('Approve'),
                ),
              ],
            ),
            duration: const Duration(days: 1),
          ),
        );
      });
      if (widget.snapshot.settings.joinRequestNotifications) {
        unawaited(JoinRequestNotificationService.show(
          requestId: request.id,
          name: request.name,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AppShell(bridge: widget.bridge, snapshot: widget.snapshot);
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
