// The content overlays (src/data/i18n/<lang>.json), one per language other than English. German needs none:
// the cards and scenes ship with German fields.
import type { ContentOverlay } from './content';
import type { AppLang } from './languages';

import ar from '../data/i18n/ar.json';
import es from '../data/i18n/es.json';
import fr from '../data/i18n/fr.json';
import it from '../data/i18n/it.json';
import pl from '../data/i18n/pl.json';
import pt from '../data/i18n/pt.json';
import ru from '../data/i18n/ru.json';
import tr from '../data/i18n/tr.json';
import uk from '../data/i18n/uk.json';
import zh from '../data/i18n/zh.json';

export const OVERLAYS: Partial<Record<AppLang, ContentOverlay>> = { fr, es, it, pt, pl, ru, uk, tr, ar, zh } as Partial<Record<AppLang, ContentOverlay>>;
