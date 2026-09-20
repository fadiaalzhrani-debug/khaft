import Foundation
import Capacitor
import PassKit

/// شاشة Apple Pay الأصلية لتطبيق خافت.
/// requestPayment يعرض الشاشة ويرجّع توكن الدفع لطبقة الويب، والخصم الفعلي يتم في الخادم (ميسر).
/// بعد رد الخادم تنادي طبقة الويب completePayment لتقفل الشاشة بعلامة النجاح أو الفشل.
@objc(KhafetApplePayPlugin)
public class KhafetApplePayPlugin: CAPPlugin, CAPBridgedPlugin, PKPaymentAuthorizationControllerDelegate {
    public let identifier = "KhafetApplePayPlugin"
    public let jsName = "KhafetApplePay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canMakePayments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPayment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completePayment", returnType: CAPPluginReturnPromise)
    ]

    private let networks: [PKPaymentNetwork] = [.mada, .visa, .masterCard]
    private var pendingCall: CAPPluginCall?
    private var authCompletion: ((PKPaymentAuthorizationResult) -> Void)?
    private var sheet: PKPaymentAuthorizationController?
    private var timeoutWork: DispatchWorkItem?

    @objc func canMakePayments(_ call: CAPPluginCall) {
        call.resolve([
            "available": PKPaymentAuthorizationController.canMakePayments(),
            "hasCards": PKPaymentAuthorizationController.canMakePayments(usingNetworks: networks)
        ])
    }

    @objc func requestPayment(_ call: CAPPluginCall) {
        guard let merchantId = call.getString("merchantId"), !merchantId.isEmpty,
              let amountText = call.getString("amount") else {
            call.reject("missing merchantId or amount", "BAD_INPUT")
            return
        }
        let amount = NSDecimalNumber(string: amountText)
        if amount == NSDecimalNumber.notANumber || amount.doubleValue <= 0 {
            call.reject("bad amount", "BAD_INPUT")
            return
        }
        let label = call.getString("label") ?? "Khafet"

        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantId
        request.countryCode = "SA"
        request.currencyCode = "SAR"
        request.supportedNetworks = networks
        request.merchantCapabilities = [.capability3DS]
        request.paymentSummaryItems = [PKPaymentSummaryItem(label: label, amount: amount)]

        DispatchQueue.main.async {
            if self.pendingCall != nil || self.authCompletion != nil {
                call.reject("another payment is in progress", "BUSY")
                return
            }
            let controller = PKPaymentAuthorizationController(paymentRequest: request)
            controller.delegate = self
            self.sheet = controller
            self.pendingCall = call
            controller.present { presented in
                if !presented {
                    DispatchQueue.main.async {
                        self.pendingCall?.reject("could not present Apple Pay", "UNAVAILABLE")
                        self.pendingCall = nil
                        self.sheet = nil
                    }
                }
            }
        }
    }

    @objc func completePayment(_ call: CAPPluginCall) {
        let success = call.getBool("success") ?? false
        DispatchQueue.main.async {
            self.finish(success: success)
            call.resolve()
        }
    }

    private func finish(success: Bool) {
        timeoutWork?.cancel()
        timeoutWork = nil
        if let done = authCompletion {
            authCompletion = nil
            done(PKPaymentAuthorizationResult(status: success ? .success : .failure, errors: nil))
        }
    }

    public func paymentAuthorizationController(_ controller: PKPaymentAuthorizationController,
                                               didAuthorizePayment payment: PKPayment,
                                               handler completion: @escaping (PKPaymentAuthorizationResult) -> Void) {
        let token = String(data: payment.token.paymentData, encoding: .utf8) ?? ""
        DispatchQueue.main.async {
            if token.isEmpty {
                completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
                return
            }
            self.authCompletion = completion
            // أبل تقفل الشاشة لو تأخر الرد، فنرد بالفشل بعد 25 ثانية إذا الخادم ما جاوب
            let work = DispatchWorkItem { [weak self] in self?.finish(success: false) }
            self.timeoutWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: work)
            self.pendingCall?.resolve([
                "token": token,
                "network": payment.token.paymentMethod.network?.rawValue ?? ""
            ])
            self.pendingCall = nil
        }
    }

    public func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
        controller.dismiss {
            DispatchQueue.main.async {
                // قفل الشاشة بدون تفويض = العميل ألغى
                if let call = self.pendingCall {
                    call.reject("cancelled", "CANCELLED")
                    self.pendingCall = nil
                }
                self.sheet = nil
            }
        }
    }
}
