import Cocoa
import FlutterMacOS
import UserNotifications
import WebKit

@main
class AppDelegate: FlutterAppDelegate, UNUserNotificationCenterDelegate {
  private var webViewFocusMonitor: Any?

  override func applicationDidFinishLaunching(_ notification: Notification) {
    UNUserNotificationCenter.current().delegate = self
    super.applicationDidFinishLaunching(notification)
    installWebViewFocusMonitor()
  }

  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }

  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    return true
  }

  deinit {
    if let webViewFocusMonitor {
      NSEvent.removeMonitor(webViewFocusMonitor)
    }
  }

  /// Flutter's macOS platform views do not forward a focus handoff back to a
  /// nested WKWebView after another Flutter control owns first responder.
  /// Restore it before AppKit delivers the click, so Google Docs remains
  /// interactive after the user moves between the document and the sidebar.
  private func installWebViewFocusMonitor() {
    webViewFocusMonitor = NSEvent.addLocalMonitorForEvents(
      matching: [.leftMouseDown]
    ) { [weak self] event in
      self?.focusWebView(for: event)
      return event
    }
  }

  private func focusWebView(for event: NSEvent) {
    guard let contentView = event.window?.contentView else {
      return
    }
    let point = contentView.convert(event.locationInWindow, from: nil)
    guard let webView = visibleWebView(in: contentView, at: point) else {
      return
    }
    event.window?.makeFirstResponder(webView)
  }

  private func visibleWebView(in view: NSView, at point: NSPoint) -> WKWebView? {
    for subview in view.subviews.reversed() {
      guard !subview.isHidden, subview.alphaValue > 0 else {
        continue
      }
      let pointInSubview = subview.convert(point, from: view)
      guard subview.bounds.contains(pointInSubview) else {
        continue
      }
      if let webView = subview as? WKWebView {
        return webView
      }
      if let webView = visibleWebView(in: subview, at: pointInSubview) {
        return webView
      }
    }
    return nil
  }
}
