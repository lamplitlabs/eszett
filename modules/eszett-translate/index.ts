// The app's bridge to Google ML Kit's on-device translation (android/ and ios/ hold the native halves; the
// phone-side logic that uses it lives in src/mt). On a platform without the module (web, a build without
// it) `translator` is null and the app shows its English.

import { requireOptionalNativeModule } from 'expo';

export interface NativeTranslator {
  /** Language codes whose packs are on the phone (English is built in and never listed). */
  downloadedModels(): Promise<string[]>;
  /** Downloads the pack for a language (with English); resolves once it is on the phone. */
  downloadModel(lang: string, allowCellular: boolean): Promise<void>;
  deleteModel(lang: string): Promise<void>;
  /** Translates one string; rejects (rather than downloading) when the pack is missing. */
  translate(text: string, from: string, to: string): Promise<string>;
}

export const translator: NativeTranslator | null = requireOptionalNativeModule<NativeTranslator>('EszettTranslate');
