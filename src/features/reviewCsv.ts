// Sharing "My words" as a CSV file: the review screen turns the deck into CSV (formatDeckWordsCsv
// in src/features/reviewRules.ts) and this helper hands it to the OS share sheet. Writing the file
// or opening the sheet can fail (no space, the share target vanished, …). Before this ran with an
// empty catch the tap just did nothing; now the failure shows a localized alert whose retry button
// runs the same export again.

import * as FileSystem from 'expo-file-system';
import { Alert, Share } from 'react-native';

import { CSV_HEADER } from './reviewRules';

/** The strings shareWordsCsv shows; resolved in the learner's UI language by the caller. */
export interface ShareFailedStrings {
  title: string;
  message: string;
  retry: string;
  cancel: string;
}

/** Write the CSV to a cache file and share it; a failure offers the strings' retry/cancel alert. */
export async function shareWordsCsv(csv: string, strings: ShareFailedStrings): Promise<void> {
  try {
    const file = new FileSystem.File(FileSystem.Paths.cache, 'eszett-words.csv');
    file.write(csv);
    await Share.share({ message: csv, url: file.uri, title: CSV_HEADER });
  } catch {
    Alert.alert(strings.title, strings.message, [
      { text: strings.cancel, style: 'cancel' },
      { text: strings.retry, onPress: () => void shareWordsCsv(csv, strings) },
    ]);
  }
}
