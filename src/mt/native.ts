// The one file that touches the native module, so the pure parts of src/mt stay importable in Node tests.
export { translator, type NativeTranslator } from '../../modules/eszett-translate';
