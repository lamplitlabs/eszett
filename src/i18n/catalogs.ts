// One catalog per language the app knows. An empty catalog means "not translated yet": English is shown.
import type { AppLang } from './languages';

import ar from './locales/ar.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import zh from './locales/zh.json';

type Entry = string | { [category: string]: string };

export const CATALOGS: Record<AppLang, Record<string, Entry>> = { en, de, fr, es, it, pt, pl, ru, uk, tr, ar, zh } as Record<AppLang, Record<string, Entry>>;
