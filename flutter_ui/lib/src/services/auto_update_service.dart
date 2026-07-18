import 'package:auto_updater/auto_updater.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class AutoUpdateService {
  const AutoUpdateService._();

  static const feedUrl =
      'https://raw.githubusercontent.com/gitmichaelqiu/Dialektik/main/appcast.xml';
  static const currentVersion = '0.1.1';

  static bool get isSupportedDesktop =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.macOS ||
          defaultTargetPlatform == TargetPlatform.windows);

  static bool get isSupportedPlatform => !kIsWeb;

  static Future<void> initialize() async {
    if (!isSupportedDesktop) return;

    try {
      await _configure();
      await autoUpdater.checkForUpdates(inBackground: true);
      await autoUpdater.setScheduledCheckInterval(3600);
    } catch (error, stackTrace) {
      debugPrint('Auto-updater initialization failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  /// Desktop delegates to auto_updater. Mobile only performs a read-only
  /// GitHub appcast check and never attempts to download or install anything.
  /// Returns the newer release tag on mobile, or null when no update exists.
  static Future<String?> checkForUpdates() async {
    if (isSupportedDesktop) {
      await _configure();
      await autoUpdater.checkForUpdates();
      return null;
    }
    if (kIsWeb) return null;

    return _checkAppcast();
  }

  static Future<String?> _checkAppcast() async {
    final response = await http.get(Uri.parse(feedUrl));
    if (response.statusCode != 200) {
      throw Exception('GitHub release metadata returned HTTP ${response.statusCode}');
    }
    final match = RegExp(
      r'<sparkle:shortVersionString>\s*([^<]+?)\s*</sparkle:shortVersionString>',
    ).firstMatch(response.body);
    final version = match?.group(1)?.trim();
    if (version == null || !_isNewer(version, currentVersion)) return null;
    return version;
  }

  static bool _isNewer(String candidate, String current) {
    List<int> parts(String value) => value
        .replaceFirst(RegExp(r'^[vV]'), '')
        .split('.')
        .map((part) => int.tryParse(RegExp(r'^\d+').stringMatch(part) ?? '') ?? 0)
        .toList();
    final next = parts(candidate);
    final installed = parts(current);
    for (var index = 0; index < 3; index++) {
      final nextPart = index < next.length ? next[index] : 0;
      final installedPart = index < installed.length ? installed[index] : 0;
      if (nextPart != installedPart) return nextPart > installedPart;
    }
    return false;
  }

  static Future<void> _configure() {
    return autoUpdater.setFeedURL(feedUrl);
  }
}
