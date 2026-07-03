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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
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
  });

  final List<Widget> children;
  final String? cacheKey;

  @override
  State<ResponsivePane> createState() => _ResponsivePaneState();
}

class _ResponsivePaneState extends State<ResponsivePane> {
  static final Map<String, List<double>> _fractionsCache = {};
  static final File _cacheFile = File('${Directory.systemTemp.path}/dialektik_layout_cache.json');
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
            _fractionsCache[key] = value.map((e) => (e as num).toDouble()).toList();
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

  @override
  void initState() {
    super.initState();
    _loadCache();
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
        final widths =
            _fractions.map((fraction) => fraction * availableWidth).toList();

        return Padding(
          padding: const EdgeInsets.all(outerPadding),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < count; i++) ...[
                SizedBox(width: widths[i], child: widget.children[i]),
                if (i != count - 1)
                  _PaneDivider(
                    width: dividerWidth,
                    onDrag: (delta) => _resize(
                      index: i,
                      delta: delta,
                      availableWidth: availableWidth,
                      minWidth: minWidth,
                    ),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _ensureFractions(int count) {
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

  void _resize({
    required int index,
    required double delta,
    required double availableWidth,
    required double minWidth,
  }) {
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
