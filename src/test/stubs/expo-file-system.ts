// Vitest stub for expo-file-system. The real package pulls in expo's winter runtime (via expo-modules-core),
// which cannot load under node because it requires native modules. Tests only need the class shapes.
export class File {
  name = '';
  size = 0;
  exists = true;
  uri = '';
  write(_contents: string): void {}
}
export class Directory {
  exists = false;
  create() {}
  list() {
    return [];
  }
}
export class DownloadTask {}
export const Paths = { document: '/tmp', cache: '/tmp' };
export type DownloadPauseState = { pausedAt?: number };
