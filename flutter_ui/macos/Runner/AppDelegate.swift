import Cocoa
import FlutterMacOS
import UserNotifications
import WebKit

@main
class AppDelegate: FlutterAppDelegate, UNUserNotificationCenterDelegate {
  private var embeddedEditorChannel: FlutterMethodChannel?
  private var embeddedEditorPanel: NSPanel?
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
          let window = NSApp.mainWindow,
          let frame = contentFrame(from: arguments, in: window) else {
      return false
    }

    let webView = embeddedEditorWebView ?? makeEmbeddedEditor()
    embeddedEditorWebView = webView
    let panel = embeddedEditorPanel ?? makeEmbeddedEditorPanel(for: window)
    embeddedEditorPanel = panel
    if webView.superview !== panel.contentView {
      webView.removeFromSuperview()
      panel.contentView?.addSubview(webView)
    }
    // `frame` is measured in the Flutter content view's coordinate space.
    // Convert through the content view before converting to screen space;
    // passing it directly to NSWindow would omit the title-bar/content offset.
    let windowFrame = window.contentView?.convert(frame, to: nil) ?? frame
    panel.setFrame(window.convertToScreen(windowFrame), display: true)
    webView.frame = panel.contentView?.bounds ?? .zero
    webView.isHidden = false
    panel.orderFrontRegardless()
    if webView.url?.absoluteString != url.absoluteString {
      webView.load(URLRequest(url: url))
    }
    return true
  }

  private func hideEmbeddedEditor() {
    embeddedEditorPanel?.orderOut(nil)
  }

  private func makeEmbeddedEditorPanel(for window: NSWindow) -> NSPanel {
    let panel = NSPanel(
      contentRect: .zero,
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )
    panel.isOpaque = true
    panel.backgroundColor = NSColor.controlBackgroundColor
    panel.hasShadow = false
    panel.hidesOnDeactivate = false
    panel.ignoresMouseEvents = false
    panel.level = .normal
    panel.collectionBehavior = [.fullScreenAuxiliary]
    window.addChildWindow(panel, ordered: .above)
    return panel
  }

  private func makeEmbeddedEditor() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
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

  private func contentFrame(from arguments: [String: Any], in window: NSWindow?) -> NSRect? {
    guard let x = number(arguments["x"]),
          let y = number(arguments["y"]),
          let width = number(arguments["width"]),
          let height = number(arguments["height"]),
          width > 0, height > 0,
          let contentView = window?.contentView else {
      return nil
    }
    let frame = NSRect(
      x: x,
      y: contentView.bounds.height - y - height,
      width: width,
      height: height
    )
    NSLog("Dialektik embedded editor: frame=%@ content=%@", NSStringFromRect(frame), NSStringFromRect(contentView.bounds))
    return frame
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
