import Cocoa
import FlutterMacOS
import UserNotifications
import WebKit

@main
class AppDelegate: FlutterAppDelegate, UNUserNotificationCenterDelegate {
  private var embeddedEditorChannel: FlutterMethodChannel?
  private var embeddedEditorWebView: WKWebView?

  override func applicationDidFinishLaunching(_ notification: Notification) {
    UNUserNotificationCenter.current().delegate = self
    super.applicationDidFinishLaunching(notification)
  }

  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }

  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    return true
  }

  /// Registers before Flutter can build the Documents page. The native view is
  /// deliberately mounted above Flutter's view hierarchy because macOS
  /// AppKit platform views do not forward pointer focus reliably.
  func installEmbeddedEditorChannel(with flutterViewController: FlutterViewController) {
    guard embeddedEditorChannel == nil else { return }
    let channel = FlutterMethodChannel(
      name: "dialektik/embedded_google_docs",
      binaryMessenger: flutterViewController.engine.binaryMessenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(FlutterError(code: "unavailable", message: "Native editor is unavailable.", details: nil))
        return
      }
      switch call.method {
      case "show":
        guard self.showEmbeddedEditor(with: call.arguments as? [String: Any]) else {
          result(FlutterError(code: "invalid_frame", message: "The embedded editor frame is invalid.", details: call.arguments))
          return
        }
        result(nil)
      case "hide":
        self.hideEmbeddedEditor()
        result(nil)
      case "reload":
        self.embeddedEditorWebView?.reload()
        result(nil)
      case "load":
        guard self.loadEmbeddedEditor(urlString: (call.arguments as? [String: Any])?["url"] as? String) else {
          result(FlutterError(code: "invalid_url", message: "The embedded editor URL is invalid.", details: call.arguments))
          return
        }
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    embeddedEditorChannel = channel
  }

  private func showEmbeddedEditor(with arguments: [String: Any]?) -> Bool {
    guard let arguments,
          let urlString = arguments["url"] as? String,
          let url = URL(string: urlString),
          let frame = contentFrame(from: arguments),
          let contentView = NSApp.mainWindow?.contentView else {
      return false
    }

    let webView = embeddedEditorWebView ?? makeEmbeddedEditor()
    embeddedEditorWebView = webView
    if webView.superview !== contentView {
      webView.removeFromSuperview()
      contentView.addSubview(webView, positioned: .above, relativeTo: nil)
    }
    webView.frame = frame
    webView.isHidden = false
    webView.alphaValue = 1
    webView.layer?.zPosition = 1000
    if webView.url?.absoluteString != url.absoluteString {
      webView.load(URLRequest(url: url))
    }
    return true
  }

  private func hideEmbeddedEditor() {
    embeddedEditorWebView?.isHidden = true
  }

  private func makeEmbeddedEditor() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.autoresizingMask = []
    webView.wantsLayer = true
    webView.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
    return webView
  }

  private func loadEmbeddedEditor(urlString: String?) -> Bool {
    guard let urlString, let url = URL(string: urlString), let webView = embeddedEditorWebView else {
      return false
    }
    webView.load(URLRequest(url: url))
    return true
  }

  private func contentFrame(from arguments: [String: Any]) -> NSRect? {
    guard let x = number(arguments["x"]),
          let y = number(arguments["y"]),
          let width = number(arguments["width"]),
          let height = number(arguments["height"]),
          width > 0, height > 0,
          let contentView = NSApp.mainWindow?.contentView else {
      return nil
    }
    return NSRect(
      x: x,
      y: contentView.bounds.height - y - height,
      width: width,
      height: height
    )
  }

  private func number(_ value: Any?) -> CGFloat? {
    if let number = value as? NSNumber { return CGFloat(number.doubleValue) }
    if let value = value as? Double { return CGFloat(value) }
    return nil
  }
}

extension AppDelegate: WKNavigationDelegate {
  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    NSLog("Dialektik embedded editor: loading %@", webView.url?.absoluteString ?? "(redirect)")
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    NSLog("Dialektik embedded editor: loaded %@", webView.url?.absoluteString ?? "(unknown)")
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    NSLog("Dialektik embedded editor: provisional load failed: %@", error.localizedDescription)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    NSLog("Dialektik embedded editor: load failed: %@", error.localizedDescription)
  }
}
