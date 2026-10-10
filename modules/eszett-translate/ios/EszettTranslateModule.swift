import ExpoModulesCore
import MLKitCommon
import MLKitTranslate

/// Google ML Kit's on-device translation, as the app uses it: language packs are downloaded and deleted
/// explicitly (one at a time, about 30 MB), and translators are kept alive between calls, since creating one
/// loads its model. Nothing the learner writes leaves the phone. Mirrors the Android module.
public class EszettTranslateModule: Module {
  private var translators: [String: Translator] = [:]

  private func code(_ tag: String) throws -> TranslateLanguage {
    let lang = TranslateLanguage(rawValue: tag)
    guard TranslateLanguage.allLanguages().contains(lang) else {
      throw Exception(name: "ERR_MT_LANGUAGE", description: "No translation model for '\(tag)'")
    }
    return lang
  }

  private func translator(_ from: String, _ to: String) throws -> Translator {
    let key = "\(from)>\(to)"
    if let t = translators[key] { return t }
    // a loaded translator holds 30-150 MB; the app needs one direction at a time, two at most
    if translators.count >= 2 { translators.removeAll() }
    let t = Translator.translator(options: TranslatorOptions(sourceLanguage: try code(from), targetLanguage: try code(to)))
    translators[key] = t
    return t
  }

  public func definition() -> ModuleDefinition {
    Name("EszettTranslate")

    // Language codes whose packs are on the phone (English is built in and never listed).
    AsyncFunction("downloadedModels") { (promise: Promise) in
      promise.resolve(ModelManager.modelManager().downloadedTranslateModels.map { $0.language.rawValue })
    }

    // Downloads the pack for a language (with English); resolves once it is on the phone.
    AsyncFunction("downloadModel") { (tag: String, allowCellular: Bool, promise: Promise) in
      do {
        let conditions = ModelDownloadConditions(allowsCellularAccess: allowCellular, allowsBackgroundDownloading: true)
        let t = Translator.translator(options: TranslatorOptions(sourceLanguage: .english, targetLanguage: try self.code(tag)))
        // the translator must outlive the download, so the closure keeps it
        t.downloadModelIfNeeded(with: conditions) { [t] error in
          _ = t
          if let error = error { promise.reject("ERR_MT_DOWNLOAD", error.localizedDescription) } else { promise.resolve(nil) }
        }
      } catch {
        promise.reject("ERR_MT_LANGUAGE", error.localizedDescription)
      }
    }

    AsyncFunction("deleteModel") { (tag: String, promise: Promise) in
      do {
        self.translators.removeAll()
        let model = TranslateRemoteModel.translateRemoteModel(language: try self.code(tag))
        ModelManager.modelManager().deleteDownloadedModel(model) { error in
          if let error = error { promise.reject("ERR_MT_DELETE", error.localizedDescription) } else { promise.resolve(nil) }
        }
      } catch {
        promise.reject("ERR_MT_LANGUAGE", error.localizedDescription)
      }
    }

    // Translates one string; fails (rather than downloading) when the pack is missing.
    AsyncFunction("translate") { (text: String, from: String, to: String, promise: Promise) in
      do {
        try self.translator(from, to).translate(text) { result, error in
          if let result = result, error == nil { promise.resolve(result) } else { promise.reject("ERR_MT_TRANSLATE", error?.localizedDescription ?? "translation failed") }
        }
      } catch {
        promise.reject("ERR_MT_LANGUAGE", error.localizedDescription)
      }
    }

    OnDestroy {
      self.translators.removeAll()
    }
  }
}
