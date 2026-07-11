import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final paneControl = _PaneControlScope.maybeOf(context);
    final trailingWidgets = <Widget>[
      if (trailing != null) trailing!,
      if (paneControl != null)
        IconButton(
          onPressed: paneControl.onToggle,
          icon: Icon(paneControl.collapseIcon),
          tooltip: 'Collapse panel',
          visualDensity: VisualDensity.compact,
        ),
    ];

    final titleBlock = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ],
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final actions = trailingWidgets.isEmpty
            ? null
            : Wrap(
                alignment: WrapAlignment.end,
                children: trailingWidgets,
              );
        if (actions == null) return titleBlock;

        if (constraints.maxWidth < 280) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              titleBlock,
              Align(alignment: Alignment.centerRight, child: actions),
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: titleBlock),
            actions,
          ],
        );
      },
    );
  }
}

class _PaneControlScope extends InheritedWidget {
  const _PaneControlScope({
    required this.isRightOfMain,
    required this.onToggle,
    required super.child,
  });

  final bool isRightOfMain;
  final VoidCallback onToggle;

  IconData get collapseIcon => isRightOfMain
      ? Icons.keyboard_double_arrow_right
      : Icons.keyboard_double_arrow_left;

  static _PaneControlScope? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<_PaneControlScope>();
  }

  @override
  bool updateShouldNotify(_PaneControlScope oldWidget) =>
      isRightOfMain != oldWidget.isRightOfMain ||
      onToggle != oldWidget.onToggle;
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (action != null) ...[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

class ResponsivePane extends StatefulWidget {
  const ResponsivePane({
    super.key,
    required this.children,
    this.cacheKey,
    this.mainPaneIndex = 1,
    this.collapsiblePaneIndices,
  });

  final List<Widget> children;
  final String? cacheKey;
  final int mainPaneIndex;
  final Set<int>? collapsiblePaneIndices;

  @override
  State<ResponsivePane> createState() => _ResponsivePaneState();
}

class _ResponsivePaneState extends State<ResponsivePane> {
  static final Map<String, List<double>> _fractionsCache = {};
  static final Map<String, Set<int>> _collapsedPanesCache = {};
  static final File _cacheFile =
      File('${Directory.systemTemp.path}/dialektik_layout_cache.json');
  static bool _cacheLoaded = false;

  static void _loadCache() {
    if (_cacheLoaded) return;
    _cacheLoaded = true;
    try {
      if (_cacheFile.existsSync()) {
        final content = _cacheFile.readAsStringSync();
        final json = jsonDecode(content) as Map<String, dynamic>;
        json.forEach((key, value) {
          if (value is List) {
            _fractionsCache[key] =
                value.map((e) => (e as num).toDouble()).toList();
          }
        });
      }
    } catch (_) {}
  }

  static void _saveCache() {
    try {
      final json = _fractionsCache.map((key, value) => MapEntry(key, value));
      _cacheFile.writeAsStringSync(jsonEncode(json));
    } catch (_) {}
  }

  List<double> _fractions = const [];
  Set<int> _collapsedPanes = {};
  final Set<int> _pendingExpansions = {};
  Timer? _paneAnimationTimer;
  bool _animatePaneWidths = false;

  static const _paneAnimationDuration = Duration(milliseconds: 240);

  @override
  void initState() {
    super.initState();
    _loadCache();
    final key = widget.cacheKey;
    if (key != null) {
      _collapsedPanes = {...?_collapsedPanesCache[key]};
    }
  }

  @override
  void dispose() {
    _paneAnimationTimer?.cancel();
    _finishPendingExpansions();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 840;
    if (compact) {
      final paneHeight =
          (MediaQuery.sizeOf(context).height - 176).clamp(420.0, 680.0);
      return ListView.separated(
        padding: const EdgeInsets.all(16),
        itemBuilder: (context, index) => SizedBox(
          height: paneHeight,
          child: widget.children[index],
        ),
        separatorBuilder: (context, index) => const SizedBox(height: 16),
        itemCount: widget.children.length,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final count = widget.children.length;
        if (count == 0) return const SizedBox.shrink();
        _ensureFractions(count);

        const outerPadding = 24.0;
        const dividerWidth = 16.0;
        final availableWidth = (constraints.maxWidth -
                (outerPadding * 2) -
                dividerWidth * (count - 1))
            .clamp(0.0, double.infinity)
            .toDouble();
        final minWidth = (availableWidth / count * 0.55).clamp(180.0, 280.0);
        const collapsedWidth = 48.0;
        final animatedCollapsedPanes = {..._collapsedPanes}
          ..removeAll(_pendingExpansions);
        final collapsedCount = animatedCollapsedPanes.length;
        final expandedAvailableWidth =
            (availableWidth - collapsedWidth * collapsedCount)
                .clamp(0.0, double.infinity)
                .toDouble();
        final expandedFractionTotal = _fractions
            .asMap()
            .entries
            .where((entry) => !animatedCollapsedPanes.contains(entry.key))
            .fold<double>(0, (total, entry) => total + entry.value);
        final widths = _fractions.asMap().entries.map((entry) {
          if (animatedCollapsedPanes.contains(entry.key)) {
            return collapsedWidth;
          }
          if (expandedFractionTotal == 0) {
            return expandedAvailableWidth;
          }
          return entry.value / expandedFractionTotal * expandedAvailableWidth;
        }).toList();

        return Padding(
          padding: const EdgeInsets.all(outerPadding),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < count; i++) ...[
                _buildPane(
                  index: i,
                  width: widths[i],
                  child: widget.children[i],
                ),
                if (i != count - 1)
                  _PaneDivider(
                    width: dividerWidth,
                    onDrag: (delta) {
                      if (animatedCollapsedPanes.contains(i) ||
                          animatedCollapsedPanes.contains(i + 1)) {
                        return;
                      }
                      _resize(
                        index: i,
                        delta: delta,
                        availableWidth: availableWidth,
                        minWidth: minWidth,
                      );
                    },
                  ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _ensureFractions(int count) {
    _collapsedPanes.removeWhere((index) => index >= count);
    _collapsedPanes.removeWhere((index) => !_canCollapse(index));
    final key = widget.cacheKey;
    if (key != null && _fractionsCache.containsKey(key)) {
      final cached = _fractionsCache[key]!;
      if (cached.length == count) {
        _fractions = cached;
        return;
      }
    }
    if (_fractions.length == count) return;
    _fractions = List<double>.filled(count, 1 / count);
    if (key != null) {
      _fractionsCache[key] = _fractions;
      _saveCache();
    }
  }

  Widget _buildPane({
    required int index,
    required double width,
    required Widget child,
  }) {
    final isCollapsed = _collapsedPanes.contains(index);
    final canCollapse = _canCollapse(index);

    return SizedBox(
      width: width,
      child: AnimatedContainer(
        duration: _animatePaneWidths ? _paneAnimationDuration : Duration.zero,
        curve: Curves.easeInOutCubic,
        child: _PaneFrame(
          collapsed: isCollapsed,
          canCollapse: canCollapse,
          isRightOfMain: index > widget.mainPaneIndex,
          onToggle: canCollapse ? () => _togglePane(index) : null,
          child: child,
        ),
      ),
    );
  }

  void _togglePane(int index) {
    if (_collapsedPanes.contains(index)) {
      _pendingExpansions.add(index);
    } else {
      _collapsedPanes.add(index);
      _persistCollapsedPanes();
    }
    _paneAnimationTimer?.cancel();
    setState(() => _animatePaneWidths = true);
    _paneAnimationTimer = Timer(_paneAnimationDuration, () {
      if (!mounted) return;
      setState(() {
        _finishPendingExpansions();
        _animatePaneWidths = false;
      });
      _persistCollapsedPanes();
    });
  }

  void _finishPendingExpansions() {
    _collapsedPanes.removeAll(_pendingExpansions);
    _pendingExpansions.clear();
  }

  void _persistCollapsedPanes() {
    final key = widget.cacheKey;
    if (key != null) {
      _collapsedPanesCache[key] = {..._collapsedPanes};
    }
  }

  void _stopPaneAnimationForResize() {
    if (!_animatePaneWidths && _pendingExpansions.isEmpty) return;
    _paneAnimationTimer?.cancel();
    _finishPendingExpansions();
    _animatePaneWidths = false;
    _persistCollapsedPanes();
  }

  bool _canCollapse(int index) {
    return widget.collapsiblePaneIndices?.contains(index) ??
        index != widget.mainPaneIndex;
  }

  void _resize({
    required int index,
    required double delta,
    required double availableWidth,
    required double minWidth,
  }) {
    _stopPaneAnimationForResize();
    if (availableWidth <= 0) return;
    final minFraction = minWidth / availableWidth;
    final next = [..._fractions];
    final left = next[index] + delta / availableWidth;
    final right = next[index + 1] - delta / availableWidth;
    if (left < minFraction || right < minFraction) return;
    next[index] = left;
    next[index + 1] = right;
    setState(() => _fractions = next);
    final key = widget.cacheKey;
    if (key != null) {
      _fractionsCache[key] = next;
      _saveCache();
    }
  }
}

class _PaneDivider extends StatelessWidget {
  const _PaneDivider({
    required this.width,
    required this.onDrag,
  });

  final double width;
  final ValueChanged<double> onDrag;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.resizeColumn,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onHorizontalDragUpdate: (details) => onDrag(details.delta.dx),
        child: SizedBox(
          width: width,
          child: Center(
            child: Container(
              width: 1,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(1),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PaneFrame extends StatelessWidget {
  const _PaneFrame({
    required this.child,
    required this.collapsed,
    required this.canCollapse,
    required this.isRightOfMain,
    this.onToggle,
  });

  final Widget child;
  final bool collapsed;
  final bool canCollapse;
  final bool isRightOfMain;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    if (!canCollapse) return child;

    final expandIcon = isRightOfMain
        ? Icons.keyboard_double_arrow_left
        : Icons.keyboard_double_arrow_right;

    if (collapsed) {
      return MouseRegion(
        cursor: SystemMouseCursors.click,
        child: Semantics(
          button: true,
          label: 'Expand panel',
          child: Material(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: InkWell(
              onTap: onToggle,
              child: SizedBox.expand(
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    child: Icon(
                      expandIcon,
                      key: ValueKey(expandIcon),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return _PaneControlScope(
      isRightOfMain: isRightOfMain,
      onToggle: onToggle!,
      child: child,
    );
  }
}
