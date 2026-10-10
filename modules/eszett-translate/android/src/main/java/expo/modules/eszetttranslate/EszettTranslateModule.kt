package expo.modules.eszetttranslate

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google ML Kit's on-device translation, as the app uses it: language packs are downloaded and deleted
 * explicitly (one at a time, about 30 MB), and translators are kept open between calls, since opening one
 * loads its model. Nothing the learner writes leaves the phone.
 */
class EszettTranslateModule : Module() {
  private val translators = HashMap<String, Translator>()
  private val manager get() = RemoteModelManager.getInstance()

  private fun code(tag: String): String =
    TranslateLanguage.fromLanguageTag(tag) ?: throw CodedException("ERR_MT_LANGUAGE", "No translation model for '$tag'", null)

  private fun model(tag: String) = TranslateRemoteModel.Builder(code(tag)).build()

  @Synchronized
  private fun translator(from: String, to: String): Translator {
    val key = "$from>$to"
    translators[key]?.let { return it }
    // a loaded translator holds 30-150 MB; the app needs one direction at a time, two at most
    if (translators.size >= 2) closeAll()
    val options = TranslatorOptions.Builder().setSourceLanguage(code(from)).setTargetLanguage(code(to)).build()
    return Translation.getClient(options).also { translators[key] = it }
  }

  @Synchronized
  private fun closeAll() {
    translators.values.forEach { it.close() }
    translators.clear()
  }

  override fun definition() = ModuleDefinition {
    Name("EszettTranslate")

    /** Language codes whose packs are on the phone (English is built in and never listed). */
    AsyncFunction("downloadedModels") { promise: Promise ->
      manager.getDownloadedModels(TranslateRemoteModel::class.java)
        .addOnSuccessListener { models -> promise.resolve(models.map { it.language }) }
        .addOnFailureListener { e -> promise.reject("ERR_MT", e.message, e) }
    }

    /** Downloads the pack for a language (with English); resolves once it is on the phone. */
    AsyncFunction("downloadModel") { tag: String, allowCellular: Boolean, promise: Promise ->
      val conditions = DownloadConditions.Builder().apply { if (!allowCellular) requireWifi() }.build()
      manager.download(model(tag), conditions)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject("ERR_MT_DOWNLOAD", e.message, e) }
    }

    AsyncFunction("deleteModel") { tag: String, promise: Promise ->
      closeAll()
      manager.deleteDownloadedModel(model(tag))
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject("ERR_MT_DELETE", e.message, e) }
    }

    /** Translates one string; fails (rather than downloading) when the pack is missing. */
    AsyncFunction("translate") { text: String, from: String, to: String, promise: Promise ->
      translator(from, to).translate(text)
        .addOnSuccessListener { result -> promise.resolve(result) }
        .addOnFailureListener { e -> promise.reject("ERR_MT_TRANSLATE", e.message, e) }
    }

    OnDestroy { closeAll() }
  }
}
