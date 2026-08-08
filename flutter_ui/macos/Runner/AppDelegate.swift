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

  /// The Flutter AppKit platform-view path does not reliably deliver focus or
  /// pointer input to WKWebView. Mount the editor as a direct window subview
  /// instead, while Flutter supplies its document-pane bounds over this channel.
  func installEmbeddedEditorChannel(with flutterViewController: FlutterViewController) {
    guard embeddedEditorChannel == nil else {
      return
    }
    let channel = FlutterMethodChannel(
      name: "dialektik/embedded_google_docs",
      binaryMessenger: flutterViewController.engine.binaryMessenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(FlutterError(code: "unavailable", message: nil, details: nil))
        return
      }
      switch call.method {
      case "show":
        self.showEmbeddedEditor(with: call.arguments as? [String: Any])
        result(nil)
      case "hide":
        self.embeddedEditorWebView?.removeFromSuperview()
        result(nil)
      case "reload":
        self.embeddedEditorWebView?.reload()
        result(nil)
      case "load":
        self.loadEmbeddedEditor(urlString: (call.arguments as? [String: Any])?["url"] as? String)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    embeddedEditorChannel = channel
  }

  private func showEmbeddedEditor(with arguments: [String: Any]?) {
    guard let arguments,
          let urlString = arguments["url"] as? String,
          let url = URL(string: urlString),
          let frame = flutterFrame(from: arguments),
          let contentView = NSApp.mainWindow?.contentView else {
      print("[Dialektik] Unable to mount embedded Google Docs WebView: \(String(describing: arguments))")
      return
    }
    let webView = embeddedEditorWebView ?? makeEmbeddedEditor()
    embeddedEditorWebView = webView
    if webView.superview == nil {
      contentView.addSubview(webView, positioned: .above, relativeTo: nil)
    }
    webView.frame = frame
    if webView.url != url {
      webView.load(URLRequest(url: url))
    }
  }

  private func makeEmbeddedEditor() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.autoresizingMask = []
    return webView
  }

  private func loadEmbeddedEditor(urlString: String?) {
    guard let urlString, let url = URL(string: urlString) else {
      return
    }
    embeddedEditorWebView?.load(URLRequest(url: url))
  }

  private func flutterFrame(from arguments: [String: Any]) -> NSRect? {
    guard let x = (arguments["x"] as? NSNumber)?.doubleValue,
          let y = (arguments["y"] as? NSNumber)?.doubleValue,
          let width = (arguments["width"] as? NSNumber)?.doubleValue,
          let height = (arguments["height"] as? NSNumber)?.doubleValue,
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
}
