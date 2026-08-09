import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_cef/webview_cef.dart' as cef;

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../services/google_doc_link.dart';
import '../widgets/adaptive_scaffold.dart';
import 'documents_screen.dart';

Uri _googleSignInUri(Uri? continueUri) {
  return Uri.https('accounts.google.com', '/ServiceLogin', {
    'service': 'wise',
    'continue':
        (continueUri ?? Uri.parse('https://docs.google.com/')).toString(),
  });
}

class GoogleDocsScreen extends StatefulWidget {
  const GoogleDocsScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<GoogleDocsScreen> createState() => _GoogleDocsScreenState();
}

class _GoogleDocsScreenState extends State<GoogleDocsScreen> {
  static String? _cachedSelectedId;

  String? _selectedId = _cachedSelectedId;
  bool _showOfflineWorkspace = false;

  List<DebateDocument> get _googleDocs =>
      widget.snapshot.documents.where((doc) => doc.isGoogleDoc).toList();

  DebateDocument? get _selectedDoc {
    if (_googleDocs.isEmpty) return null;
    return _googleDocs.firstWhere(
      (doc) => doc.id == _selectedId,
      orElse: () => _googleDocs.first,
    );
  }

  @override
  void didUpdateWidget(covariant GoogleDocsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldIds = oldWidget.snapshot.documents.map((doc) => doc.id).toSet();
    for (final doc in _googleDocs.reversed) {
      if (!oldIds.contains(doc.id)) {
        _selectedId = doc.id;
        _cachedSelectedId = doc.id;
        break;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showOfflineWorkspace) {
      return Column(
        children: [
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Back to Google Docs',
                      onPressed: () => setState(() {
                        _showOfflineWorkspace = false;
                      }),
                      icon: const Icon(Icons.arrow_back),
                    ),
                    const SizedBox(width: 4),
                    const Expanded(
                      child: Text(
                        'Offline workspace',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: DocumentsScreen(
              key: const ValueKey('offline-editor'),
              bridge: widget.bridge,
              snapshot: widget.snapshot,
            ),
          ),
        ],
      );
    }

    final compact = MediaQuery.sizeOf(context).width < 760;
    final selected = _selectedDoc;
    final showLibrary = !compact || _selectedId == null || selected == null;

    if (compact && !showLibrary) {
      return _DocumentWorkspace(
        key: ValueKey(selected.id),
        document: selected,
        bridge: widget.bridge,
        onBack: () => setState(() => _selectedId = null),
        onRemove: () => _removeDocument(selected),
      );
    }

    final library = _GoogleDocsLibrary(
      documents: _googleDocs,
      localDocumentCount:
          widget.snapshot.documents.where((doc) => !doc.isGoogleDoc).length,
      selectedId: selected?.id,
      onSelect: (doc) => setState(() {
        _selectedId = doc.id;
        _cachedSelectedId = doc.id;
      }),
      onAdd: () => _showLinkDialog(),
      onCreate: _createGoogleDoc,
      onRename: _renameDocument,
      onEditLink: (doc) => _showLinkDialog(existing: doc),
      onCopyLink: _copyDocumentLink,
      onRemove: _removeDocument,
      onOpenOffline: () => setState(() {
        _showOfflineWorkspace = true;
      }),
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: library,
      );
    }

    return ResponsivePane(
      cacheKey: 'google_docs_desktop_v2',
      mainPaneIndex: 1,
      collapsiblePaneIndices: const {0},
      initialFractions: const [0.23, 0.77],
      children: [
        FocusTraversalGroup(child: library),
        FocusTraversalGroup(
          child: selected == null
              ? const _WelcomePanel()
              : _DocumentWorkspace(
                  key: ValueKey(selected.id),
                  document: selected,
                  bridge: widget.bridge,
                  onRemove: () => _removeDocument(selected),
                ),
        ),
      ],
    );
  }

  Future<void> _showLinkDialog({DebateDocument? existing}) async {
    final result = await showDialog<_LinkedDocumentDraft>(
      context: context,
      builder: (context) => _LinkGoogleDocDialog(existing: existing),
    );
    if (result == null) return;
    widget.bridge.dispatch(action(
      existing == null ? 'document.linkGoogle' : 'document.updateGoogle',
      {
        'id': existing?.id,
        'name': result.name,
        'url': result.url,
        'aiContext': result.aiContext,
      },
    ));
  }

  Future<void> _createGoogleDoc() async {
    await _openExternal(Uri.parse('https://docs.new'));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Expanded(
              child: Text('Created it? Link the document when it is ready.'),
            ),
            TextButton(
              onPressed: () =>
                  ScaffoldMessenger.of(context).hideCurrentSnackBar(),
              child: const Text('Cancel'),
            ),
          ],
        ),
        action: SnackBarAction(label: 'Link', onPressed: _showLinkDialog),
      ),
    );
  }

  Future<void> _copyDocumentLink(DebateDocument document) async {
    await Clipboard.setData(ClipboardData(text: document.externalUrl));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Google Docs link copied.')),
    );
  }

  Future<void> _renameDocument(DebateDocument document) async {
    final controller = TextEditingController(text: document.title);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rename linked document'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Display name'),
          onSubmitted: (value) => Navigator.pop(context, value.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Rename'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty || name == document.title) return;
    widget.bridge.dispatch(action('document.rename', {
      'id': document.id,
      'name': name,
    }));
  }

  Future<void> _removeDocument(DebateDocument document) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Remove linked document?'),
            content: Text(
              'This removes “${document.title}” and its saved AI context from '
              'Dialektik. The Google document will not be deleted.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Remove link'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;
    widget.bridge.dispatch(action('document.delete', {'id': document.id}));
    setState(() => _selectedId = null);
  }

  Future<void> _openExternal(Uri uri) async {
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open Google Docs.')),
      );
    }
  }
}

class _GoogleDocsLibrary extends StatelessWidget {
  const _GoogleDocsLibrary({
    required this.documents,
    required this.localDocumentCount,
    required this.selectedId,
    required this.onSelect,
    required this.onAdd,
    required this.onCreate,
    required this.onRename,
    required this.onEditLink,
    required this.onCopyLink,
    required this.onRemove,
    required this.onOpenOffline,
  });

  final List<DebateDocument> documents;
  final int localDocumentCount;
  final String? selectedId;
  final ValueChanged<DebateDocument> onSelect;
  final VoidCallback onAdd;
  final VoidCallback onCreate;
  final ValueChanged<DebateDocument> onRename;
  final ValueChanged<DebateDocument> onEditLink;
  final ValueChanged<DebateDocument> onCopyLink;
  final ValueChanged<DebateDocument> onRemove;
  final VoidCallback onOpenOffline;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionHeader(title: 'Google Docs'),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add_link),
              label: const Text('Link Google Doc'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onCreate,
              icon: const Icon(Icons.note_add_outlined),
              label: const Text('Create in Google Docs'),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: documents.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(12),
                        child: Text(
                          'No Google Docs linked yet.\n\nLink a case, block file, '
                          'or shared round document to begin.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: documents.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 4),
                      itemBuilder: (context, index) {
                        final doc = documents[index];
                        return ListTile(
                          selected: doc.id == selectedId,
                          selectedTileColor: Theme.of(context)
                              .colorScheme
                              .primaryContainer
                              .withAlpha(110),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          leading: const Icon(Icons.description_outlined),
                          title: Text(
                            doc.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(doc.content.trim().isEmpty
                              ? 'AI context not added'
                              : 'AI context ready'),
                          trailing: PopupMenuButton<_DocumentAction>(
                            tooltip: 'Document actions',
                            onSelected: (action) {
                              switch (action) {
                                case _DocumentAction.rename:
                                  onRename(doc);
                                case _DocumentAction.editLink:
                                  onEditLink(doc);
                                case _DocumentAction.copyLink:
                                  onCopyLink(doc);
                                case _DocumentAction.remove:
                                  onRemove(doc);
                              }
                            },
                            itemBuilder: (context) => const [
                              PopupMenuItem(
                                value: _DocumentAction.rename,
                                child: Text('Rename'),
                              ),
                              PopupMenuItem(
                                value: _DocumentAction.editLink,
                                child: Text('Edit link'),
                              ),
                              PopupMenuItem(
                                value: _DocumentAction.copyLink,
                                child: Text('Copy link'),
                              ),
                              PopupMenuItem(
                                value: _DocumentAction.remove,
                                child: Text('Remove'),
                              ),
                            ],
                          ),
                          onTap: () => onSelect(doc),
                        );
                      },
                    ),
            ),
            const Divider(),
            TextButton.icon(
              onPressed: onOpenOffline,
              icon: const Icon(Icons.offline_bolt_outlined),
              label: Text(localDocumentCount == 0
                  ? 'Offline workspace'
                  : 'Offline workspace ($localDocumentCount)'),
            ),
          ],
        ),
      ),
    );
  }
}

enum _DocumentAction { rename, editLink, copyLink, remove }

class _WelcomePanel extends StatelessWidget {
  const _WelcomePanel();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: const Padding(
            padding: EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.description_outlined, size: 48),
                SizedBox(height: 16),
                Text(
                  'Link your debate workspace',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: 10),
                Text(
                  'Dialektik stores the document link and any context you '
                  'choose to share with AI Coach.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DocumentWorkspace extends StatefulWidget {
  const _DocumentWorkspace({
    super.key,
    required this.document,
    required this.bridge,
    required this.onRemove,
    this.onBack,
  });

  final DebateDocument document;
  final EngineBridge bridge;
  final VoidCallback onRemove;
  final VoidCallback? onBack;

  @override
  State<_DocumentWorkspace> createState() => _DocumentWorkspaceState();
}

class _DocumentWorkspaceState extends State<_DocumentWorkspace> {
  late final TextEditingController _contextController;
  InAppWebViewController? _webViewController;
  cef.WebViewController? _cefController;
  bool _showContext = false;
  double _loadProgress = 0;
  String? _loadError;

  bool get _supportsEmbed =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.macOS ||
          defaultTargetPlatform == TargetPlatform.windows ||
          defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  bool get _usesNativeMacEditor =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.macOS;

  @override
  void initState() {
    super.initState();
    _contextController = TextEditingController(text: widget.document.content);
  }

  @override
  void dispose() {
    _contextController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(widget.document.externalUrl);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
            child: Row(
              children: [
                if (widget.onBack != null)
                  IconButton(
                    onPressed: widget.onBack,
                    icon: const Icon(Icons.arrow_back),
                  ),
                const SizedBox(width: 4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.document.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'AI context',
                  onPressed: () => setState(() => _showContext = !_showContext),
                  icon: Icon(_showContext
                      ? Icons.auto_awesome
                      : Icons.auto_awesome_outlined),
                ),
                if (_supportsEmbed && !_showContext)
                  IconButton(
                    tooltip: 'Reload embedded editor',
                    onPressed: _usesNativeMacEditor
                        ? () => _cefController?.reload()
                        : _webViewController == null
                            ? null
                            : () => _webViewController!.reload(),
                    icon: const Icon(Icons.refresh),
                  ),
                IconButton(
                  tooltip: 'Open in browser',
                  onPressed: uri == null ? null : () => _openExternal(uri),
                  icon: const Icon(Icons.open_in_new),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          if (_showContext)
            _AiContextEditor(
              controller: _contextController,
              onSave: _saveContext,
            )
          else
            Expanded(
              child: _usesNativeMacEditor && uri != null
                  ? _CefGoogleDocsView(
                      uri: uri,
                      onController: (controller) {
                        _cefController = controller;
                      },
                    )
                  : _supportsEmbed && uri != null
                      ? Stack(
                          children: [
                            InAppWebView(
                              key: ValueKey(uri.toString()),
                              initialUrlRequest:
                                  URLRequest(url: WebUri.uri(uri)),
                              gestureRecognizers: {
                                Factory<EagerGestureRecognizer>(
                                  () => EagerGestureRecognizer(),
                                ),
                              },
                              initialSettings: InAppWebViewSettings(
                                javaScriptEnabled: true,
                                domStorageEnabled: true,
                                cacheEnabled: true,
                                sharedCookiesEnabled: true,
                                thirdPartyCookiesEnabled: true,
                                supportZoom: true,
                                allowsBackForwardNavigationGestures: true,
                              ),
                              onWebViewCreated: (controller) {
                                _webViewController = controller;
                              },
                              onLoadStart: (controller, url) {
                                if (!mounted) return;
                                setState(() {
                                  _loadError = null;
                                  _loadProgress = 0;
                                });
                              },
                              onLoadStop: (controller, url) {
                                if (!mounted) return;
                                setState(() => _loadProgress = 1);
                              },
                              onProgressChanged: (controller, progress) {
                                if (!mounted) return;
                                setState(() => _loadProgress = progress / 100);
                              },
                              onReceivedError: (controller, request, error) {
                                if (!mounted ||
                                    request.isForMainFrame != true) {
                                  return;
                                }
                                // WebKit reports code 102 while replacing a frame
                                // during a redirect. Google Docs uses redirects for
                                // authentication and document routing; it is not a
                                // terminal load failure.
                                if (error.description.contains('code=102') ||
                                    error.description
                                        .contains('Frame load interrupted')) {
                                  return;
                                }
                                setState(() => _loadError = error.description);
                              },
                            ),
                            if (_loadProgress < 1)
                              Align(
                                alignment: Alignment.topCenter,
                                child: LinearProgressIndicator(
                                  value:
                                      _loadProgress == 0 ? null : _loadProgress,
                                  minHeight: 2,
                                ),
                              ),
                            if (_loadError != null)
                              _EmbeddedEditorError(
                                message: _loadError!,
                                onRetry: () {
                                  setState(() => _loadError = null);
                                  _webViewController?.reload();
                                },
                                onOpenExternal: () => _openExternal(uri),
                              ),
                          ],
                        )
                      : _ExternalEditorFallback(onOpen: () {
                          if (uri != null) _openExternal(uri);
                        }),
            ),
        ],
      ),
    );
  }

  void _saveContext() {
    widget.bridge.dispatch(action('document.updateContent', {
      'id': widget.document.id,
      'content': _contextController.text.trim(),
    }));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('AI context saved locally.')),
    );
  }

  Future<void> _openExternal(Uri uri) async {
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open Google Docs.')),
      );
    }
  }
}

class _CefGoogleDocsView extends StatefulWidget {
  const _CefGoogleDocsView({required this.uri, required this.onController});

  final Uri uri;
  final ValueChanged<cef.WebViewController> onController;

  @override
  State<_CefGoogleDocsView> createState() => _CefGoogleDocsViewState();
}

class _CefGoogleDocsViewState extends State<_CefGoogleDocsView> {
  static Future<void>? _managerInitialization;
  late final cef.WebViewController _controller;
  String? _error;
  bool _retriedConnectionError = false;

  @override
  void initState() {
    super.initState();
    _controller = cef.WebviewManager().createWebView(
      loading: const Center(child: CircularProgressIndicator()),
      injectUserScripts: cef.InjectUserScripts(),
    );
    _controller.setWebviewListener(
      cef.WebviewEventsListener(
        onLoadStart: (_, __) {
          if (mounted) setState(() => _error = null);
        },
        onLoadEnd: (_, __) {
          _inspectLoadedPage();
        },
      ),
    );
    widget.onController(_controller);
    _initialize();
  }

  @override
  void didUpdateWidget(covariant _CefGoogleDocsView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uri != widget.uri) {
      _retriedConnectionError = false;
      _controller.loadUrl(_googleSignInUri(widget.uri).toString());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _initialize() async {
    try {
      _retriedConnectionError = false;
      _managerInitialization ??= cef.WebviewManager().initialize(
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 '
            'Safari/537.36 Dialektik/0.3.0',
      );
      await _managerInitialization;
      // Start through Google's first-party sign-in route. A private document
      // can otherwise return a Chromium network error before the embedded
      // session has a chance to authenticate; Google redirects back to the
      // document automatically when the session is already signed in.
      await _controller.initialize(_googleSignInUri(widget.uri).toString());
      if (mounted) setState(() => _error = null);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _inspectLoadedPage() async {
    try {
      await _controller.ready;
      final body = await _controller.evaluateJavascript(
        'document.body ? document.body.innerText : ""',
      );
      final text = body?.toString() ?? '';
      final isConnectionError = text.contains('ERR_CONNECTION_CLOSED') ||
          text.contains('Failed to load URL');
      if (!isConnectionError) {
        if (mounted) setState(() => _error = null);
        return;
      }

      if (!_retriedConnectionError) {
        _retriedConnectionError = true;
        await Future<void>.delayed(const Duration(milliseconds: 700));
        if (!_controller.value || !mounted) return;
        await _controller.loadUrl(_googleSignInUri(widget.uri).toString());
        return;
      }

      if (mounted) {
        setState(() {
          _error = 'Google could not connect inside the embedded editor. '
              'Try again or open the document in your browser.';
        });
      }
    } catch (_) {
      // A page can finish while the CEF texture is being disposed. The
      // listener is best-effort and must not take down the Flutter app.
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: _controller,
      builder: (context, ready, _) {
        if (_error != null) {
          return _EmbeddedEditorError(
            message: _error!,
            onRetry: _initialize,
            onOpenExternal: () => launchUrl(
              widget.uri,
              mode: LaunchMode.externalApplication,
            ),
          );
        }
        return ready ? _controller.webviewWidget : _controller.loadingWidget;
      },
    );
  }
}

class _EmbeddedEditorError extends StatelessWidget {
  const _EmbeddedEditorError({
    required this.message,
    required this.onRetry,
    required this.onOpenExternal,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onOpenExternal;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, size: 40),
                const SizedBox(height: 12),
                Text(
                  'The embedded editor could not load',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    FilledButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
                    ),
                    OutlinedButton.icon(
                      onPressed: onOpenExternal,
                      icon: const Icon(Icons.open_in_new),
                      label: const Text('Open in browser'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AiContextEditor extends StatelessWidget {
  const _AiContextEditor({required this.controller, required this.onSave});

  final TextEditingController controller;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'AI context',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            const Text(
              'Paste the case, blocks, or notes AI Coach should use. Dialektik '
              'cannot read the Google Doc automatically and sends only this '
              'saved text when you cite the document.',
            ),
            const SizedBox(height: 16),
            Expanded(
              child: TextField(
                controller: controller,
                expands: true,
                minLines: null,
                maxLines: null,
                textAlignVertical: TextAlignVertical.top,
                decoration: const InputDecoration(
                  hintText: 'Paste relevant document text here…',
                ),
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: onSave,
                icon: const Icon(Icons.save_outlined),
                label: const Text('Save AI context'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExternalEditorFallback extends StatelessWidget {
  const _ExternalEditorFallback({required this.onOpen});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.open_in_browser, size: 48),
              const SizedBox(height: 16),
              Text(
                'Continue in Google Docs',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                'Open this document when you are ready. Google Docs manages '
                'sign-in, access, and sharing in your browser.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: onOpen,
                icon: const Icon(Icons.open_in_new),
                label: const Text('Open Google Docs'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LinkedDocumentDraft {
  const _LinkedDocumentDraft({
    required this.name,
    required this.url,
    required this.aiContext,
  });

  final String name;
  final String url;
  final String aiContext;
}

class _LinkGoogleDocDialog extends StatefulWidget {
  const _LinkGoogleDocDialog({this.existing});

  final DebateDocument? existing;

  @override
  State<_LinkGoogleDocDialog> createState() => _LinkGoogleDocDialogState();
}

class _LinkGoogleDocDialogState extends State<_LinkGoogleDocDialog> {
  final _nameController = TextEditingController();
  final _urlController = TextEditingController();
  final _contextController = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing != null) {
      _nameController.text = existing.title;
      _urlController.text = existing.externalUrl;
      _contextController.text = existing.content;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _urlController.dispose();
    _contextController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? 'Link Google Doc' : 'Edit link'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Dialektik stores this link locally.',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _nameController,
                autofocus: true,
                decoration: const InputDecoration(labelText: 'Display name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _urlController,
                keyboardType: TextInputType.url,
                autocorrect: false,
                decoration: InputDecoration(
                  labelText: 'Google Docs link',
                  errorText: _error,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _contextController,
                minLines: 3,
                maxLines: 7,
                decoration: const InputDecoration(
                  labelText: 'AI context (optional)',
                  hintText: 'Paste the text AI Coach may use…',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(
            widget.existing == null ? 'Link document' : 'Save changes',
          ),
        ),
      ],
    );
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Add a display name.');
      return;
    }
    try {
      final link = GoogleDocLink.parse(_urlController.text);
      Navigator.pop(
        context,
        _LinkedDocumentDraft(
          name: name,
          url: link.editUrl.toString(),
          aiContext: _contextController.text.trim(),
        ),
      );
    } on FormatException catch (error) {
      setState(() => _error = error.message.toString());
    }
  }
}
