import 'package:package_info_plus/package_info_plus.dart';

class AppVersionInfo {
  const AppVersionInfo({required this.version, required this.buildNumber});

  final String version;
  final String buildNumber;

  String get displayVersion {
    if (buildNumber.isEmpty) return version;
    return '$version ($buildNumber)';
  }
}

class AppVersionService {
  const AppVersionService._();

  static Future<AppVersionInfo?> load() async {
    try {
      final info = await PackageInfo.fromPlatform();
      return AppVersionInfo(
        version: info.version,
        buildNumber: info.buildNumber,
      );
    } catch (_) {
      // Package metadata is unavailable in a few test/embedded environments.
      // The shipped app always gets this from the platform bundle.
      return null;
    }
  }
}
