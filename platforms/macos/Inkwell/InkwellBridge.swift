import Foundation
import WebKit

final class InkwellBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private weak var windowController: InkwellWindowController?
    private let preferencesStore = PreferencesStore()

    func attach(webView: WKWebView, windowController: InkwellWindowController) {
        self.webView = webView
        self.windowController = windowController
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let raw = message.body as? String, let data = raw.data(using: .utf8) else {
            reply(id: "", ok: false, data: [:], error: "Invalid bridge message.")
            return
        }

        do {
            let request = try JSONDecoder().decode(BridgeMessage.self, from: data)
            try handle(request)
        } catch InkwellError.cancelled {
            reply(id: decodedRequestID(from: data), ok: false, data: [:], error: "cancelled")
        } catch {
            reply(id: decodedRequestID(from: data), ok: false, data: [:], error: error.localizedDescription)
        }
    }

    private func handle(_ request: BridgeMessage) throws {
        guard let windowController else {
            throw InkwellError.nativeWindowUnavailable
        }

        switch request.action {
        case "newFile":
            reply(id: request.id, ok: true, data: windowController.newFile(), error: nil)
        case "newWindow":
            windowController.newWindow()
            reply(id: request.id, ok: true, data: [:], error: nil)
        case "openFile":
            reply(id: request.id, ok: true, data: try windowController.openFile(), error: nil)
        case "saveFile":
            reply(
                id: request.id,
                ok: true,
                data: try windowController.saveFile(payload: request.payload, forceDialog: false),
                error: nil
            )
        case "saveFileAs":
            reply(
                id: request.id,
                ok: true,
                data: try windowController.saveFile(payload: request.payload, forceDialog: true),
                error: nil
            )
        case "readPlainTextClipboard":
            reply(id: request.id, ok: true, data: windowController.readPlainTextClipboard(), error: nil)
        case "pageSetup":
            reply(id: request.id, ok: true, data: try windowController.pageSetup(payload: request.payload), error: nil)
        case "printDocument":
            try windowController.printDocument(payload: request.payload)
            reply(id: request.id, ok: true, data: [:], error: nil)
        case "exportFile":
            reply(id: request.id, ok: true, data: try windowController.exportFile(payload: request.payload), error: nil)
        case "startSpeaking":
            try windowController.startSpeaking(payload: request.payload)
            reply(id: request.id, ok: true, data: [:], error: nil)
        case "stopSpeaking":
            windowController.stopSpeaking()
            reply(id: request.id, ok: true, data: [:], error: nil)
        case "spellingSuggestions":
            reply(id: request.id, ok: true, data: try windowController.spellingSuggestions(payload: request.payload), error: nil)
        case "grammarCheck":
            reply(id: request.id, ok: true, data: try windowController.grammarCheck(payload: request.payload), error: nil)
        case "loadPreferences":
            reply(id: request.id, ok: true, data: try preferencesStore.loadPreferences(), error: nil)
        case "savePreferences":
            reply(
                id: request.id,
                ok: true,
                data: try preferencesStore.savePreferences(payload: request.payload),
                error: nil
            )
        case "closeWindow":
            reply(id: request.id, ok: true, data: [:], error: nil)
            windowController.closeFromFrontend()
        default:
            throw InkwellError.unknownBridgeAction(request.action)
        }
    }

    private func reply(id: String, ok: Bool, data: [String: JSONValue], error: String?) {
        let response = BridgeResponse(id: id, ok: ok, data: data, error: error)
        let encoder = JSONEncoder()

        guard
            let encoded = try? encoder.encode(response),
            let json = String(data: encoded, encoding: .utf8)
        else {
            return
        }

        webView?.evaluateJavaScript(
            "window.InkwellBridgeResponse && window.InkwellBridgeResponse(\(json));",
            completionHandler: nil
        )
    }

    private func decodedRequestID(from data: Data) -> String {
        (try? JSONDecoder().decode(PartialBridgeMessage.self, from: data).id) ?? ""
    }
}
private struct PartialBridgeMessage: Decodable {
    let id: String
}
