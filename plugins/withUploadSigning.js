// Expo config plugin: signs release builds with the Play upload key when the build has it, and lets CI count the
// version code. android/ is generated (git-ignored), so this is where the Gradle changes live; `expo prebuild`
// applies them to android/app/build.gradle (store/README.md, "The bundle and its signature").
//
// ESZETT_UPLOAD_STORE_FILE, ESZETT_UPLOAD_STORE_PASSWORD, ESZETT_UPLOAD_KEY_ALIAS, ESZETT_UPLOAD_KEY_PASSWORD as
// Gradle properties (~/.gradle/gradle.properties) or environment variables: with them the release build type uses
// the upload key, without them the debug key as before (the phone on the desk). ESZETT_VERSION_CODE overrides
// app.json's android.versionCode so every CI build counts up.
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// eszett: upload signing (plugins/withUploadSigning.js)';

/** Applies the change to the contents of android/app/build.gradle; idempotent. */
function applyToBuildGradle(contents, versionCode) {
  if (contents.includes(MARKER)) return contents;
  const signing = /signingConfigs \{\n(\s+)debug \{\n([\s\S]*?)\n\1\}\n\s*\}/;
  const match = contents.match(signing);
  if (!match) throw new Error('withUploadSigning: signingConfigs { debug { … } } not found in android/app/build.gradle');
  const indent = match[1];
  const upload = `${indent}if (eszettUploadStoreFile) {
${indent}  upload {
${indent}    storeFile file(eszettUploadStoreFile)
${indent}    storePassword eszettUploadProp('ESZETT_UPLOAD_STORE_PASSWORD')
${indent}    keyAlias eszettUploadProp('ESZETT_UPLOAD_KEY_ALIAS') ?: 'eszett-upload'
${indent}    keyPassword eszettUploadProp('ESZETT_UPLOAD_KEY_PASSWORD') ?: eszettUploadProp('ESZETT_UPLOAD_STORE_PASSWORD')
${indent}  }
${indent}}`;
  let out = contents.replace(signing, (block) => `${MARKER}
${indent.slice(0, -4)}def eszettUploadProp = { String name -> findProperty(name) ?: System.getenv(name) }
${indent.slice(0, -4)}def eszettUploadStoreFile = eszettUploadProp('ESZETT_UPLOAD_STORE_FILE')
${indent.slice(0, -4)}${block.replace(/\n(\s*)\}\s*$/, `\n${upload}\n$1}`)}`);
  // the release build type: the upload key when the build has it, else the debug key
  // the template writes `signingConfig signingConfigs.debug`; older generated projects `signingConfig = …`
  const release = /(release \{[\s\S]*?)signingConfig\s*=?\s*signingConfigs\.debug/;
  if (!release.test(out)) throw new Error('withUploadSigning: release { signingConfig signingConfigs.debug } not found');
  out = out.replace(release, '$1signingConfig eszettUploadStoreFile ? signingConfigs.upload : signingConfigs.debug');
  // the version code: ESZETT_VERSION_CODE, else app.json's
  const code = /versionCode (\d+)\n/;
  if (!code.test(out)) throw new Error('withUploadSigning: versionCode not found');
  out = out.replace(code, (line, current) => `versionCode Integer.parseInt((findProperty('ESZETT_VERSION_CODE') ?: System.getenv('ESZETT_VERSION_CODE') ?: '${versionCode ?? current}').toString())\n`);
  return out;
}

const withUploadSigning = (config) =>
  withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applyToBuildGradle(mod.modResults.contents, config.android?.versionCode);
    return mod;
  });

module.exports = withUploadSigning;
module.exports.applyToBuildGradle = applyToBuildGradle;
