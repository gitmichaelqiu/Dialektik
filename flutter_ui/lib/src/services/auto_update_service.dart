import 'package:auto_updater/auto_updater.dart';
import 'package:flutter/foundation.dart';

class AutoUpdateService {
  const AutoUpdateService._();

  static const feedUrl = 'https://github.com/gitmichaelqiu/Dialektik/releases';

  static bool get isSupportedDesktop =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.macOS ||
          defaultTargetPlatform == TargetPlatform.windows);

  static Future<void> initialize() async {
    if (!isSupportedDesktop) return;

    try {
      await _configure();
      await autoUpdater.checkForUpdates();
      await autoUpdater.setScheduledCheckInterval(3600);
    } catch (error, stackTrace) {
      debugPrint('Auto-updater initialization failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  static Future<void> checkForUpdates() async {
    if (!isSupportedDesktop) return;
    await _configure();
    await autoUpdater.checkForUpdates();
  }

  static Future<void> _configure() {
    return autoUpdater.setFeedURL(feedUrl);
  }
}
