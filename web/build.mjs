// Builds the learning pages of eszett.lamplitlabs.com from the app's own data, in the app's twelve languages:
// the course by level, one page per grammar card, one per exam, one per story, the scenes, and the sitemap.
// English lives at the root (/grammar/kein-nicht), the other languages under their code (/fr/grammar/kein-nicht),
// every page naming all twelve as hreflang alternates. Plain HTML, no framework; the output is committed so
// Vercel needs no build step. Run after the data or the strings change:
//
//   node web/build.mjs
//
// Content comes from src/data (cards, scenes, path, stories, the exam notes of the grounding pack) and its
// translations from src/data/i18n/<lang>.json, the same overlays the app shows; the page strings and the
// translated exam sheets are web/i18n/strings.<lang>.json and web/i18n/exams.<lang>.json (English is the
// source; a missing language falls back to English). Hand-written pages (index, privacy, terms, imprint,
// delete-account, support) are left alone; everything this script writes starts with a "generated" comment.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = dirname(fileURLToPath(import.meta.url));
const root = join(web, '..');
const SITE = 'https://eszett.lamplitlabs.com';
const PLAY = 'https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett';
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const data = (f) => readJson(join(root, 'src/data', f));
const maybe = (p) => (existsSync(p) ? readJson(p) : null);

const LANGS = ['en', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'uk', 'tr', 'ar', 'zh'];
const NAMES = { en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', pl: 'Polski', ru: 'Русский', uk: 'Українська', tr: 'Türkçe', ar: 'العربية', zh: '中文' };
const LOCALE = { en: 'en_GB', de: 'de_DE', fr: 'fr_FR', es: 'es_ES', it: 'it_IT', pt: 'pt_BR', pl: 'pl_PL', ru: 'ru_RU', uk: 'uk_UA', tr: 'tr_TR', ar: 'ar_AR', zh: 'zh_CN' };
const RTL = new Set(['ar']);

const grammar = Object.values(data('grammar.json'));
const units = Object.values(data('path.json'));
const scenes = Object.values(data('scenes.json'));
const stories = Object.values(data('stories.json'));
const overlays = Object.fromEntries(LANGS.filter((l) => l !== 'en' && l !== 'de').map((l) => [l, data(`i18n/${l}.json`)]));
const catalogs = Object.fromEntries(LANGS.map((l) => [l, readJson(join(root, 'src/i18n/locales', `${l}.json`))]));
const strings = Object.fromEntries(LANGS.map((l) => [l, maybe(join(web, 'i18n', `strings.${l}.json`))]));
const examSheets = Object.fromEntries(LANGS.map((l) => [l, maybe(join(web, 'i18n', `exams.${l}.json`))]));
if (!strings.en || !examSheets.en) throw new Error('web/i18n/strings.en.json and exams.en.json are the sources and must exist');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVEL_EXAMS = { A1: [], A2: ['goethe-a2', 'dtz', 'osd'], B1: ['goethe-b1', 'telc-b1', 'dtz', 'osd'], B2: ['goethe-b2', 'telc-b2', 'osd'], C1: ['goethe-c1', 'telc-c1-hochschule', 'testdaf', 'dsh', 'osd'], C2: ['goethe-c2', 'osd'] };
// exam names are proper names and stay; level and provider key are the same in every language
const EXAM = {
  'goethe-a2': { name: 'Goethe-Zertifikat A2', level: 'A2', provider: 'goethe' },
  'goethe-b1': { name: 'Goethe-Zertifikat B1', level: 'B1', provider: 'goethe-b1' },
  'telc-b1': { name: 'telc Deutsch B1 (Zertifikat Deutsch)', level: 'B1', provider: 'telc' },
  dtz: { name: 'Deutsch-Test für Zuwanderer (DTZ)', level: 'A2-B1', provider: 'dtz' },
  'goethe-b2': { name: 'Goethe-Zertifikat B2', level: 'B2', provider: 'goethe' },
  'telc-b2': { name: 'telc Deutsch B2', level: 'B2', provider: 'telc' },
  'goethe-c1': { name: 'Goethe-Zertifikat C1', level: 'C1', provider: 'goethe' },
  'telc-c1-hochschule': { name: 'telc Deutsch C1 Hochschule', level: 'C1', provider: 'telc' },
  testdaf: { name: 'TestDaF', level: 'B2-C1', provider: 'testdaf' },
  dsh: { name: 'DSH - Deutsche Sprachprüfung für den Hochschulzugang', level: 'B2-C2', provider: 'dsh' },
  'goethe-c2': { name: 'Goethe-Zertifikat C2: Großes Deutsches Sprachdiplom', level: 'C2', provider: 'goethe' },
  osd: { name: 'ÖSD - Österreichisches Sprachdiplom Deutsch', level: 'A1-C2', provider: 'osd' },
};
const EXAM_ORDER = Object.keys(EXAM);

/* ---------- text helpers ---------- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n = 155) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const at = cut.lastIndexOf(' ');
  return `${cut.slice(0, at > 80 ? at : cut.length)}…`;
};
const firstSentence = (s) => {
  const m = String(s).match(/^.*?[.!?。](?=\s|$)/);
  return m ? m[0] : s;
};
const cap = (s) => String(s).replace(/^./, (ch) => ch.toUpperCase());
const fill = (template, vars = {}) => String(template).replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
/** `[label](key)` in a string becomes a link to `links[key]`; the rest is escaped. */
const linkify = (text, links = {}) =>
  esc(text).replace(/\[([^\]]+)\]\(([a-zA-Z]+)\)/g, (m, label, key) => (links[key] ? `<a href="${links[key]}">${label}</a>` : label));

/** A string in `lang`, falling back to English. Plain text: escape when putting it into HTML. */
const t = (lang, key, vars) => {
  const raw = strings[lang]?.[key] ?? strings.en[key];
  if (raw === undefined) throw new Error(`missing string ${key}`);
  return fill(raw, vars);
};
/** The same, already escaped and with [label](key) links resolved. */
const th = (lang, key, vars, links) => linkify(t(lang, key, vars), links);

/* ---------- content in the learner's language (mirrors src/i18n/content.ts) ---------- */

const card = (c, lang) => {
  if (lang === 'en') return { title: c.title_en, rule: c.rule_en, examples: c.examples, pitfalls: c.pitfalls.map((p) => ({ wrong: p.wrong, right: p.right, why: p.why_en })) };
  if (lang === 'de') return { title: c.title_de, rule: c.rule_de, examples: c.examples.map(([de]) => [de, null]), pitfalls: c.pitfalls.map((p) => ({ wrong: p.wrong, right: p.right, why: p.why_de })) };
  const o = overlays[lang].grammar?.[c.key] ?? {};
  return {
    title: o.title ?? c.title_en,
    rule: o.rule ?? c.rule_en,
    examples: c.examples.map(([de, en], i) => [de, o.examples?.[i] ?? en]),
    pitfalls: c.pitfalls.map((p, i) => ({ wrong: p.wrong, right: p.right, why: o.pitfalls?.[i] ?? p.why_en })),
  };
};
const scene = (s, lang) => {
  if (lang === 'en') return { situation: s.situation_en, role: s.role_en, learner: s.learner_en, gloss: s.opening_gloss };
  if (lang === 'de') return { situation: s.situation_de, role: s.role_de, learner: s.learner_de, gloss: null };
  const o = overlays[lang].scenes?.[s.key] ?? {};
  return { situation: o.situation ?? s.situation_en, role: o.role ?? s.role_en, learner: o.learner ?? s.learner_en, gloss: o.opening ?? s.opening_gloss };
};
const unit = (u, lang) => {
  if (lang === 'en') return { title: u.title_en, goal: u.goal_en, text: (s) => s.question_en ?? s.situation_en };
  if (lang === 'de') return { title: u.title_de, goal: u.goal_de, text: (s) => s.question_de ?? s.situation_de };
  const o = overlays[lang].path?.[u.key] ?? {};
  return { title: o.title ?? u.title_en, goal: o.goal ?? u.goal_en, text: (s) => o.steps?.[u.steps.indexOf(s)] ?? s.question_en ?? s.situation_en };
};
// word-list topics are English identifiers; the UI catalogs say them in every language (topics.* keys)
const topicKey = Object.fromEntries(Object.entries(catalogs.en).filter(([k]) => k.startsWith('topics.')).map(([k, v]) => [v, k]));
const topic = (name, lang) => (topicKey[name] ? catalogs[lang][topicKey[name]] ?? catalogs.en[topicKey[name]] : name);
const levelName = (l, lang) => t(lang, `level.${l}.name`);

/* ---------- page shell ---------- */

const pre = (lang) => (lang === 'en' ? '' : `/${lang}`);
const href = (lang, path) => `${pre(lang)}${path}`;
const url = (lang, path) => `${SITE}${href(lang, path)}`;
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const ORG = { '@type': 'Organization', name: 'Lamplit Labs', url: 'https://www.lamplitlabs.com/', logo: `${SITE}/assets/icon.png`, email: 'hello@lamplitlabs.com' };
const breadcrumbs = (lang, items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [['Eszett', '/'], ...items].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: i === 0 ? `${SITE}/` : url(lang, path) })),
});
const article = (lang, { title, description, path, section, keywords, about, inLanguage = lang }) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: title,
  description,
  url: url(lang, path),
  inLanguage,
  articleSection: section,
  keywords,
  about,
  isPartOf: { '@type': 'WebSite', name: 'Eszett', url: `${SITE}/` },
  publisher: ORG,
  isAccessibleForFree: true,
});

const NAV = [['/learn', 'nav.course'], ['/grammar', 'nav.grammar'], ['/exams', 'nav.exams'], ['/stories', 'nav.stories'], ['/scenes', 'nav.scenes']];

function page(lang, { path, title, description, body, crumbs = [], ld = [], contentLang }) {
  const here = url(lang, path);
  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${url(l, path)}">`).join('\n  ');
  const scripts = [breadcrumbs(lang, crumbs), ...ld].map(jsonLd).join('\n  ');
  const trail = `<nav class="crumbs" aria-label="Breadcrumb"><a href="${lang === 'en' ? '/' : href(lang, '/learn')}">Eszett</a>${crumbs.map(([n, p], i) => (i === crumbs.length - 1 ? ` › <span>${esc(n)}</span>` : ` › <a href="${href(lang, p)}">${esc(n)}</a>`)).join('')}</nav>`;
  const langs = `<nav class="langs" aria-label="${esc(t(lang, 'nav.language'))}">${LANGS.map((l) => (l === lang ? `<span aria-current="true" lang="${l}">${NAMES[l]}</span>` : `<a href="${href(l, path)}" hreflang="${l}" lang="${l}">${NAMES[l]}</a>`)).join('')}</nav>`;
  return `<!doctype html>
<!-- generated by web/build.mjs from src/data and web/i18n - do not edit; change the data or the strings and run it again -->
<html lang="${lang}"${RTL.has(lang) ? ' dir="rtl"' : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} | Eszett</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${here}">
  ${alternates}
  <link rel="alternate" hreflang="x-default" href="${url('en', path)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Eszett">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${here}">
  <meta property="og:image" content="${SITE}/assets/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${LOCALE[lang]}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SITE}/assets/og.png">
  <meta name="theme-color" content="#2442C6">
  <link rel="icon" href="/assets/favicon.png">
  <link rel="apple-touch-icon" href="/assets/icon.png">
  <link rel="stylesheet" href="/styles.css">
  ${scripts}
</head>
<body>
  <header class="wrap top">
    <a class="brand" href="${lang === 'en' ? '/' : href(lang, '/learn')}"><img src="/assets/mark.svg" alt="" width="40" height="40">Eszett</a>
    <nav class="links" aria-label="Learn">${NAV.map(([p, k]) => `<a href="${href(lang, p)}"${path === p || path.startsWith(`${p}/`) ? ' aria-current="page"' : ''}>${esc(t(lang, k))}</a>`).join('')}</nav>
  </header>
  <main class="wrap narrow legal learn"${contentLang ? ` data-content-lang="${contentLang}"` : ''}>
    ${trail}
    ${langs}
    ${body}
    <aside class="cta">
      <img src="/assets/mark.svg" alt="" width="56" height="56">
      <div>
        <strong>${esc(t(lang, 'cta.title'))}</strong>
        <p class="soft small">${esc(t(lang, 'cta.text'))}</p>
        <a class="btn" href="${PLAY}">${esc(t(lang, 'cta.button'))}</a>
      </div>
    </aside>
  </main>
  <footer><div class="wrap row"><div>© 2026 Eszett · ${esc(t(lang, 'footer.project'))} <a href="https://www.lamplitlabs.com/" rel="noopener">Lamplit Labs</a> · <a href="mailto:hello@lamplitlabs.com">hello@lamplitlabs.com</a></div><nav aria-label="Legal"><a href="/privacy">${esc(t(lang, 'footer.privacy'))}</a><a href="/terms">${esc(t(lang, 'footer.terms'))}</a><a href="/imprint">${esc(t(lang, 'footer.imprint'))}</a><a href="/delete-account">${esc(t(lang, 'footer.delete'))}</a><a href="/support">${esc(t(lang, 'footer.support'))}</a></nav></div></footer>
</body>
</html>
`;
}

const written = [];
function write(lang, path, html) {
  const rel = `${pre(lang)}${path}`;
  const file = join(web, rel.endsWith('/') ? `${rel}index.html` : `${rel}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  written.push(rel.endsWith('/') ? rel.slice(0, -1) : rel);
}

/* ---------- grammar ---------- */

const weeksOfCard = (key) => units.filter((u) => u.steps.some((s) => s.card === key || (Array.isArray(s.cards) && s.cards.includes(key))));
const cardLink = (c, lang) => {
  const k = card(c, lang);
  return `<a href="${href(lang, `/grammar/${c.key}`)}">${esc(k.title)}</a>${lang === 'de' ? '' : ` <span class="de soft" lang="de">${esc(c.title_de)}</span>`}`;
};

function buildGrammar(lang) {
  for (const c of grammar) {
    const k = card(c, lang);
    const path = `/grammar/${c.key}`;
    const title = t(lang, 'grammar.pageTitle', { title: k.title, level: c.level });
    const description = clip(lang === 'de' ? `${k.title}. ${firstSentence(k.rule)}` : t(lang, 'grammar.description', { title: k.title, de: c.title_de, sentence: firstSentence(k.rule) }));
    const weeks = weeksOfCard(c.key);
    const body = `
    <p class="eyebrow">${esc(t(lang, 'grammar.eyebrow', { level: c.level }))}</p>
    <h1>${esc(k.title)}</h1>
    ${lang === 'de' ? '' : `<p class="de subtitle" lang="de">${esc(c.title_de)}</p>`}
    ${c.items?.length ? `<p class="tags">${c.items.map((w) => `<span class="pill" lang="de">${esc(w)}</span>`).join('')}</p>` : ''}
    <h2>${esc(t(lang, 'grammar.rule'))}</h2>
    <p>${esc(k.rule)}</p>
    <h2>${esc(t(lang, 'grammar.examples'))}</h2>
    <dl class="examples">
      ${k.examples.map(([de, gloss]) => `<div><dt lang="de">${esc(de)}</dt>${gloss ? `<dd>${esc(gloss)}</dd>` : ''}</div>`).join('\n      ')}
    </dl>
    ${k.pitfalls.length ? `<h2>${esc(t(lang, 'grammar.watchOut'))}</h2>
    <ul class="pitfalls">
      ${k.pitfalls.map((p) => `<li><span class="wrong" lang="de">${esc(p.wrong)}</span> <span class="arrow">→</span> <span class="right" lang="de">${esc(p.right)}</span><br><span class="soft small">${esc(p.why)}</span></li>`).join('\n      ')}
    </ul>` : ''}
    ${lang === 'de' ? '' : `<h2>${esc(t(lang, 'grammar.inGerman'))}</h2>
    <p lang="de" class="de">${esc(c.rule_de)}</p>`}
    ${weeks.length ? `<h2>${esc(t(lang, 'grammar.whereInCourse'))}</h2>
    <ul>${weeks.map((u) => `<li><a href="${href(lang, `/learn/${u.level.toLowerCase()}`)}#${u.key}">${esc(unit(u, lang).title)}</a> <span class="soft">(${u.level})</span></li>`).join('')}</ul>` : ''}
    <p class="soft small">${th(lang, 'grammar.more', { level: c.level }, { allAtLevel: `${href(lang, '/grammar')}#${c.level.toLowerCase()}`, course: href(lang, `/learn/${c.level.toLowerCase()}`) })}</p>`;
    write(lang, path, page(lang, {
      path,
      title,
      description,
      crumbs: [[t(lang, 'nav.grammar'), '/grammar'], [k.title, path]],
      ld: [article(lang, { title: k.title, description, path, section: 'German grammar', keywords: ['German grammar', c.level, c.title_en, c.title_de, ...(c.items || [])].join(', '), about: { '@type': 'Thing', name: 'German grammar' } })],
      body,
    }));
  }
  const path = '/grammar';
  write(lang, `${path}/`, page(lang, {
    path,
    title: t(lang, 'grammar.indexTitle', { n: grammar.length }),
    description: clip(t(lang, 'grammar.indexDescription')),
    crumbs: [[t(lang, 'nav.grammar'), path]],
    body: `
    <p class="eyebrow">${esc(t(lang, 'grammar.indexEyebrow'))}</p>
    <h1>${esc(t(lang, 'grammar.indexH1'))}</h1>
    <p class="lead soft">${esc(t(lang, 'grammar.indexLead', { n: grammar.length }))}</p>
    ${LEVELS.map((l) => `
    <h2 id="${l.toLowerCase()}">${l} <span class="soft">· ${esc(levelName(l, lang))}</span></h2>
    <ul class="cards">${grammar.filter((c) => c.level === l).map((c) => `<li>${cardLink(c, lang)}</li>`).join('')}</ul>`).join('')}`,
  }));
}

/* ---------- exams ---------- */

const bulletHtml = (text) => {
  const m = text.match(/^([^:]{2,60}):\s(.*)$/s);
  return m && !/\d/.test(m[1].slice(-3)) ? `<strong>${esc(m[1])}:</strong> ${esc(m[2])}` : esc(text);
};
const list = (items) => `<ul class="facts">${items.map((i) => `<li>${bulletHtml(i)}</li>`).join('\n      ')}</ul>`;
const sheet = (lang) => examSheets[lang] ?? examSheets.en;
const sheetIsEnglish = (lang) => lang !== 'en' && !examSheets[lang];

function buildExams(lang) {
  const sh = sheet(lang);
  for (const key of EXAM_ORDER) {
    const e = EXAM[key];
    const { heading, items } = sh[key];
    const path = `/exams/${key}`;
    const title = t(lang, 'exams.pageTitle', { name: e.name });
    const description = clip(t(lang, 'exams.description', { name: e.name, level: e.level, first: items[0] }));
    const body = `
    <p class="eyebrow">${esc(t(lang, 'exams.eyebrow', { level: e.level }))}</p>
    <h1>${esc(e.name)}</h1>
    <p class="lead soft">${esc(heading)}. ${esc(t(lang, 'exams.runBy', { provider: t(lang, `exam.provider.${e.provider}`), purpose: t(lang, `exam.${key}.purpose`) }))}</p>
    ${sheetIsEnglish(lang) ? `<p class="note">${esc(t(lang, 'exams.inEnglish'))}</p>` : ''}
    <h2>${esc(t(lang, 'exams.detail'))}</h2>
    <div${sheetIsEnglish(lang) ? ' lang="en"' : ''}>${list(items)}</div>
    <p class="soft small">${esc(t(lang, 'exams.note'))} ${th(lang, 'exams.others', {}, { exams: href(lang, '/exams') })}</p>`;
    write(lang, path, page(lang, {
      path,
      title,
      description,
      crumbs: [[t(lang, 'nav.exams'), '/exams'], [e.name, path]],
      ld: [article(lang, { title: e.name, description, path, section: 'German exams', keywords: ['German exam', e.name, e.level].join(', '), about: { '@type': 'Thing', name: e.name }, inLanguage: sheetIsEnglish(lang) ? 'en' : lang })],
      body,
    }));
  }
  const path = '/exams';
  write(lang, `${path}/`, page(lang, {
    path,
    title: t(lang, 'exams.indexTitle'),
    description: clip(t(lang, 'exams.indexDescription')),
    crumbs: [[t(lang, 'nav.exams'), path]],
    body: `
    <p class="eyebrow">${esc(t(lang, 'exams.indexEyebrow'))}</p>
    <h1>${esc(t(lang, 'exams.indexH1'))}</h1>
    <p class="lead soft">${esc(t(lang, 'exams.indexLead'))}</p>
    <table class="exams">
      <thead><tr><th>${esc(t(lang, 'exams.colExam'))}</th><th>${esc(t(lang, 'exams.colLevel'))}</th><th>${esc(t(lang, 'exams.colProvider'))}</th><th>${esc(t(lang, 'exams.colFor'))}</th></tr></thead>
      <tbody>${EXAM_ORDER.map((k) => `<tr><td><a href="${href(lang, `/exams/${k}`)}">${esc(EXAM[k].name)}</a></td><td>${EXAM[k].level}</td><td>${esc(t(lang, `exam.provider.${EXAM[k].provider}`))}</td><td>${esc(cap(t(lang, `exam.${k}.purpose`)))}</td></tr>`).join('\n      ')}</tbody>
    </table>
    ${sheetIsEnglish(lang) ? `<p class="note">${esc(t(lang, 'exams.inEnglish'))}</p>` : ''}
    <div${sheetIsEnglish(lang) ? ' lang="en"' : ''}>
    <h2>${esc(sh.compare.heading)}</h2>
    ${list(sh.compare.items)}
    <h2>${esc(t(lang, 'exams.levelsHeading'))}</h2>
    ${list(sh.general.items)}
    <h2>${esc(sh.strategy.heading)}</h2>
    ${list(sh.strategy.items)}
    </div>
    <p class="soft small">${esc(t(lang, 'exams.inApp'))}</p>`,
  }));
}

/* ---------- stories ---------- */

const para = (text) => text.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p lang="de">${esc(p)}</p>`).join('\n      ');

function buildStories(lang) {
  for (const s of stories) {
    const path = `/stories/${s.id}`;
    const vars = { title: s.title, author: s.author, year: s.year, words: s.words, level: s.level, edition: s.edition };
    const description = clip(t(lang, 'stories.description', vars));
    const body = `
    <p class="eyebrow">${esc(t(lang, 'stories.eyebrow', { level: s.level }))}</p>
    <h1 lang="de">${esc(s.title)}</h1>
    <p class="subtitle soft">${esc(t(lang, 'stories.meta', vars))}${s.parts.length > 1 ? ` · ${esc(t(lang, 'stories.parts', { n: s.parts.length }))}` : ''}</p>
    <p class="soft">${esc(t(lang, 'stories.intro', vars))}</p>
    ${s.parts.some((p) => p.questions?.length) ? `<input type="checkbox" id="show-answers" class="visually-hidden"><label for="show-answers" class="btn secondary toggle">${esc(t(lang, 'stories.showAnswers'))}</label>` : ''}
    ${s.parts.map((p, i) => `
    <section class="story" id="part-${i + 1}">
      ${s.parts.length > 1 ? `<h2>${esc(t(lang, 'stories.part', { n: i + 1 }))}</h2>` : `<h2 class="visually-hidden">${esc(t(lang, 'stories.text'))}</h2>`}
      ${para(p.text)}
      ${p.gloss?.length ? `<h3>${esc(t(lang, 'stories.glossary'))}</h3>
      <dl class="gloss" lang="de">${p.gloss.map((g) => `<div><dt>${esc(g.word)}</dt><dd>${esc(g.meaning)}</dd></div>`).join('')}</dl>` : ''}
      ${p.questions?.length ? `<h3>${esc(t(lang, 'stories.questions'))}</h3>
      <ol class="questions" lang="de">${p.questions.map((q) => `<li>${esc(q.question)}<ul>${q.options.map((o, j) => `<li${j === q.answer ? ' class="answer"' : ''}>${esc(o)}</li>`).join('')}</ul></li>`).join('')}</ol>
      <p class="soft small">${esc(t(lang, 'stories.answersNote'))}</p>` : ''}
    </section>`).join('')}
    <p class="soft small">${th(lang, 'stories.source', { edition: s.edition }, { source: s.source, stories: href(lang, '/stories') })}</p>`;
    write(lang, path, page(lang, {
      path,
      title: t(lang, 'stories.pageTitle', vars),
      description,
      contentLang: 'de',
      crumbs: [[t(lang, 'nav.stories'), '/stories'], [s.title, path]],
      ld: [{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: s.title,
        author: { '@type': 'Person', name: s.author },
        datePublished: String(s.year),
        inLanguage: 'de',
        wordCount: s.words,
        educationalLevel: s.level,
        license: 'https://creativecommons.org/publicdomain/mark/1.0/',
        isBasedOn: s.source,
        url: url(lang, path),
        publisher: ORG,
        isAccessibleForFree: true,
      }],
      body,
    }));
  }
  const path = '/stories';
  write(lang, `${path}/`, page(lang, {
    path,
    title: t(lang, 'stories.indexTitle'),
    description: clip(t(lang, 'stories.indexDescription')),
    crumbs: [[t(lang, 'nav.stories'), path]],
    body: `
    <p class="eyebrow">${esc(t(lang, 'stories.indexEyebrow'))}</p>
    <h1>${esc(t(lang, 'stories.indexH1'))}</h1>
    <p class="lead soft">${esc(t(lang, 'stories.indexLead'))}</p>
    ${LEVELS.filter((l) => stories.some((s) => s.level === l)).map((l) => `
    <h2 id="${l.toLowerCase()}">${l} <span class="soft">· ${esc(levelName(l, lang))}</span></h2>
    <ul class="cards">${stories.filter((s) => s.level === l).map((s) => `<li><a href="${href(lang, `/stories/${s.id}`)}" lang="de">${esc(s.title)}</a> <span class="soft">${esc(s.author)}, ${s.year} · ${esc(t(lang, 'common.words', { n: s.words }))}</span></li>`).join('')}</ul>`).join('')}
    <p class="soft small">${esc(t(lang, 'stories.inApp'))}</p>`,
  }));
}

/* ---------- scenes ---------- */

function buildScenes(lang) {
  const path = '/scenes';
  write(lang, path, page(lang, {
    path,
    title: t(lang, 'scenes.pageTitle', { n: scenes.length }),
    description: clip(t(lang, 'scenes.description')),
    crumbs: [[t(lang, 'nav.scenes'), path]],
    body: `
    <p class="eyebrow">${esc(t(lang, 'scenes.eyebrow'))}</p>
    <h1>${esc(t(lang, 'scenes.h1', { n: scenes.length }))}</h1>
    <p class="lead soft">${esc(t(lang, 'scenes.lead'))}</p>
    ${LEVELS.map((l) => {
      const at = scenes.filter((s) => s.level === l);
      if (!at.length) return '';
      return `
    <h2 id="${l.toLowerCase()}">${l} <span class="soft">· ${esc(levelName(l, lang))}</span></h2>
    <ul class="scenes">${at.map((s) => {
      const k = scene(s, lang);
      return `
      <li id="${s.key}">
        <strong>${esc(cap(k.situation))}</strong>${lang === 'de' ? '' : ` <span class="de soft" lang="de">${esc(s.situation_de)}</span>`}
        <div class="small soft">${esc(t(lang, 'scenes.youAre', { learner: k.learner, role: k.role }))}${lang === 'de' ? '' : ` <span lang="de">(${esc(s.learner_de)} · ${esc(s.role_de)})</span>`} · ${esc(s.place)} · <span lang="de">${esc(s.register)}</span></div>
        <div class="opening"><span lang="de">„${esc(s.opening)}“</span>${k.gloss ? ` <span class="soft small">${esc(k.gloss)}</span>` : ''}</div>
      </li>`;
    }).join('')}
    </ul>`;
    }).join('')}`,
  }));
}

/* ---------- the course ---------- */

const byKey = (arr) => Object.fromEntries(arr.map((x) => [x.key, x]));
const cards = byKey(grammar);
const sceneByKey = byKey(scenes);

function stepSummary(u, lang) {
  const loc = unit(u, lang);
  const g = u.steps.filter((s) => s.kind === 'grammar').map((s) => cards[s.card]).filter(Boolean);
  const topics = [...new Set(u.steps.filter((s) => s.kind === 'words' || s.kind === 'read').map((s) => topic(s.topic, lang)))];
  const sc = u.steps.filter((s) => s.kind === 'scene').map((s) => sceneByKey[s.scene]).filter(Boolean);
  const own = u.steps.filter((s) => s.kind === 'ownScene');
  const asks = u.steps.filter((s) => s.kind === 'ask');
  const drills = u.steps.filter((s) => s.kind === 'drill').map((s) => t(lang, `drills.${s.category}`));
  return `
      ${g.length ? `<div><span class="k">${esc(t(lang, 'learn.steps.grammar'))}</span> ${g.map((c) => `<a href="${href(lang, `/grammar/${c.key}`)}">${esc(card(c, lang).title)}</a>`).join(' · ')}</div>` : ''}
      ${topics.length ? `<div><span class="k">${esc(t(lang, 'learn.steps.words'))}</span> ${esc(topics.join(', '))}</div>` : ''}
      ${drills.length ? `<div><span class="k">${esc(t(lang, 'learn.steps.drills'))}</span> ${esc(drills.join(', '))}</div>` : ''}
      ${sc.length || own.length ? `<div><span class="k">${esc(t(lang, 'learn.steps.speaking'))}</span> ${[...sc.map((s) => `<a href="${href(lang, '/scenes')}#${s.key}">${esc(scene(s, lang).situation)}</a>`), ...own.map((s) => esc(loc.text(s)))].join(' · ')}</div>` : ''}
      ${asks.length ? `<div><span class="k">${esc(t(lang, 'learn.steps.ask'))}</span><ul class="asks">${asks.map((a) => `<li>${esc(loc.text(a))}${lang === 'de' ? '' : ` <span class="de soft" lang="de">${esc(a.question_de)}</span>`}</li>`).join('')}</ul></div>` : ''}`;
}

const hours = (lang, l) => t(lang, `level.${l}.hours`).replace(/\s*\([^)]*\)\s*$/, '');

function buildCourse(lang) {
  for (const l of LEVELS) {
    const path = `/learn/${l.toLowerCase()}`;
    const name = levelName(l, lang);
    const weeks = units.filter((u) => u.level === l);
    const g = grammar.filter((c) => c.level === l);
    const sc = scenes.filter((s) => s.level === l);
    const st = stories.filter((s) => s.level === l);
    const description = clip(t(lang, 'learn.description', { level: l, name, n: weeks.length }));
    const examsNote = strings[lang]?.[`level.${l}.examsNote`] ?? strings.en[`level.${l}.examsNote`];
    const body = `
    <p class="eyebrow">${esc(t(lang, 'learn.eyebrow', { level: l }))}</p>
    <h1>${esc(t(lang, 'learn.h1', { level: l, name }))}</h1>
    <p class="lead soft">${esc(t(lang, `level.${l}.can`))}</p>
    <p><strong>${esc(t(lang, 'learn.howLong'))}</strong> ${esc(t(lang, `level.${l}.hours`))}. ${esc(t(lang, 'learn.weeksAtLevel', { n: weeks.length }))}</p>
    <h2>${esc(t(lang, 'learn.weeks', { n: weeks.length }))}</h2>
    <ol class="weeks">${weeks.map((u, i) => {
      const loc = unit(u, lang);
      return `
      <li id="${u.key}">
        <h3>${esc(t(lang, 'learn.week', { n: i + 1, title: loc.title }))}${lang === 'de' ? '' : ` <span class="de soft" lang="de">${esc(u.title_de)}</span>`}</h3>
        <p>${esc(loc.goal)}</p>
        <div class="steps">${stepSummary(u, lang)}</div>
      </li>`;
    }).join('')}
    </ol>
    <h2>${esc(t(lang, 'learn.grammarAt', { level: l }))}</h2>
    <ul class="cards">${g.map((c) => `<li>${cardLink(c, lang)}</li>`).join('')}</ul>
    ${sc.length ? `<h2>${esc(t(lang, 'learn.scenesAt', { level: l }))}</h2>
    <ul class="cards">${sc.map((s) => `<li><a href="${href(lang, '/scenes')}#${s.key}">${esc(cap(scene(s, lang).situation))}</a>${lang === 'de' ? '' : ` <span class="de soft" lang="de">${esc(s.situation_de)}</span>`}</li>`).join('')}</ul>` : ''}
    ${st.length ? `<h2>${esc(t(lang, 'learn.readingAt', { level: l }))}</h2>
    <ul class="cards">${st.map((s) => `<li><a href="${href(lang, `/stories/${s.id}`)}" lang="de">${esc(s.title)}</a> <span class="soft">${esc(s.author)}, ${esc(t(lang, 'common.words', { n: s.words }))}</span></li>`).join('')}</ul>` : ''}
    <h2>${esc(t(lang, 'learn.examsAt', { level: l }))}</h2>
    ${LEVEL_EXAMS[l].length ? `<ul class="cards">${LEVEL_EXAMS[l].map((k) => `<li><a href="${href(lang, `/exams/${k}`)}">${esc(EXAM[k].name)}</a> <span class="soft">${esc(t(lang, `exam.${k}.purpose`))}</span></li>`).join('')}</ul>` : ''}
    ${examsNote ? `<p>${esc(examsNote)}</p>` : ''}
    <p class="soft small">${LEVELS.filter((x) => x !== l).map((x) => `<a href="${href(lang, `/learn/${x.toLowerCase()}`)}">${x}</a>`).join(' · ')} · <a href="${href(lang, '/learn')}">${esc(t(lang, 'learn.whole'))}</a></p>`;
    write(lang, path, page(lang, {
      path,
      title: t(lang, 'learn.pageTitle', { level: l, name }),
      description,
      crumbs: [[t(lang, 'nav.course'), '/learn'], [t(lang, 'common.germanAt', { level: l }), path]],
      ld: [{
        '@context': 'https://schema.org',
        '@type': 'Course',
        name: `${t(lang, 'common.germanAt', { level: l })} - ${name}`,
        description,
        url: url(lang, path),
        provider: ORG,
        educationalLevel: l,
        inLanguage: lang,
        teaches: `German language, CEFR ${l}`,
        hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: `PT${weeks.length * 7}H` },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', category: 'Free trial week, then a one-time purchase' },
      }],
      body,
    }));
  }
  const path = '/learn';
  write(lang, `${path}/`, page(lang, {
    path,
    title: t(lang, 'learn.indexTitle'),
    description: clip(t(lang, 'learn.indexDescription', { n: units.length })),
    crumbs: [[t(lang, 'nav.course'), path]],
    body: `
    <p class="eyebrow">${esc(t(lang, 'learn.indexEyebrow'))}</p>
    <h1>${esc(t(lang, 'learn.indexH1'))}</h1>
    <p class="lead soft">${esc(t(lang, 'learn.indexLead', { n: units.length }))}</p>
    <div class="levels">${LEVELS.map((l) => {
      const n = { weeks: units.filter((u) => u.level === l).length, rules: grammar.filter((c) => c.level === l).length, scenes: scenes.filter((s) => s.level === l).length, stories: stories.filter((s) => s.level === l).length };
      return `
      <a class="level" href="${href(lang, `/learn/${l.toLowerCase()}`)}">
        <span class="badge">${l}</span>
        <strong>${esc(levelName(l, lang))}</strong>
        <span class="soft small">${esc(t(lang, 'learn.levelCard', n))}${n.stories ? esc(t(lang, 'learn.levelCardStories', n)) : ''}</span>
        <span class="small">${esc(firstSentence(t(lang, `level.${l}.can`)))}</span>
      </a>`;
    }).join('')}
    </div>
    <h2>${esc(t(lang, 'learn.levelsMeanHeading'))}</h2>
    <p>${esc(t(lang, 'learn.levelsMean', { a2: hours(lang, 'A2'), b1: hours(lang, 'B1'), b2: hours(lang, 'B2'), c1: hours(lang, 'C1') }))}</p>
    <h2>${esc(t(lang, 'learn.howWeekHeading'))}</h2>
    <ol>${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<li>${th(lang, `learn.howWeek.${i}`, { n: grammar.length }, { grammar: href(lang, '/grammar'), scenes: href(lang, '/scenes') })}</li>`).join('')}</ol>
    <h2>${esc(t(lang, 'learn.examsAlongHeading'))}</h2>
    <p>${th(lang, 'learn.examsAlong', {}, { exams: href(lang, '/exams') })}</p>`,
  }));
}

/* ---------- build ---------- */

for (const lang of LANGS) {
  buildGrammar(lang);
  buildExams(lang);
  buildStories(lang);
  buildScenes(lang);
  buildCourse(lang);
}

const STATIC = ['/', '/privacy', '/terms', '/imprint', '/delete-account', '/support'];
writeFileSync(join(web, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...STATIC, ...written].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`);

const missing = LANGS.filter((l) => !strings[l]);
const englishSheets = LANGS.filter((l) => !examSheets[l]);
console.log(`${written.length} pages in ${LANGS.length} languages, sitemap with ${STATIC.length + written.length} URLs`);
if (missing.length) console.log(`strings missing (English used): ${missing.join(' ')}`);
if (englishSheets.length > 1) console.log(`exam sheets missing (English used): ${englishSheets.filter((l) => l !== 'en').join(' ')}`);
