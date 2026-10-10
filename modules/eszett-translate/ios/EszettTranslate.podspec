Pod::Spec.new do |s|
  s.name           = 'EszettTranslate'
  s.version        = '1.0.0'
  s.summary        = "Google ML Kit on-device translation for Eszett"
  s.description    = "Downloads, deletes and uses ML Kit translation language packs; the tutor's English is translated on the phone."
  s.author         = 'Lamplit Labs'
  s.homepage       = 'https://github.com/lamplitlabs/eszett'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # The ML Kit frameworks are fat binaries without an arm64 simulator slice: build for a device, or run the
  # simulator under Rosetta (Xcode > Product > Destination > Show Rosetta Destinations).
  s.dependency 'GoogleMLKit/Translate', '9.0.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
