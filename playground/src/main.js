import * as na from '../../js/na-core.js';
import { REGISTRY, artifactCode, registryUrl, publish, fetchContribution } from './publish.js';
import { recentContributions } from './query.js';

const AUTHOR = 'https://orcid.org/0000-0000-0000-0000';
const SAVED = 'nanoarguments-playground:posts';
const STANCE_LABELS = { agreesWith: 'agrees with', corrects: 'corrects', critiques: 'critiques',
  discusses: 'discusses', disputes: 'disputes', extends: 'extends', qualifies: 'qualifies',
  supports: 'supports' };
const ACTIONS = [
  { label: 'Reply', stance: '', placeholder: '' },
  { label: 'Approve', stance: 'agreesWith', placeholder: 'Strong point or a convincing argument.' },
  { label: 'Disapprove', stance: 'disputes', placeholder: 'Weak point, an error, or inaccurate.' },
  { label: 'Support', stance: 'supports', placeholder: 'Evidence or an argument that backs it up.' },
  { label: 'Qualify', stance: 'qualifies', placeholder: 'A condition, limit, or exception.' },
];

const $ = id => document.getElementById(id);
const compose = $('compose');
const fields = compose.elements;

const posts = new Map();
let replyTo = null;

// Throwaway key per tab, only for the test registry.
const signer = makeSigner();
const shapes = fetch(new URL('../../shapes/conformance.shacl.ttl', import.meta.url)).then(r => r.text());

$('registry').href = REGISTRY;
$('author').textContent = AUTHOR.replace('https://orcid.org/', '');

compose.addEventListener('submit', onPublish);
$('cancel-reply').addEventListener('click', () => setReplyTo(null));
$('refresh').addEventListener('click', loadNetwork);
$('timeline').addEventListener('click', e => {
  const button = e.target.closest('[data-action]');
  if (button) setReplyTo(button.closest('[data-node]').dataset.node, ACTIONS[button.dataset.action]);
});

loadNetwork();
restoreOwn();

async function makeSigner() {
  const { privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
  return { privateKey: btoa(String.fromCharCode(...der)), orcid: AUTHOR, name: 'Test User' };
}

async function onPublish(e) {
  e.preventDefault();
  const text = fields.statement.value.trim();
  if (!text) return say('Write a statement first.', 'error');
  const stance = (replyTo && fields.stance.value) || undefined;

  const quads = na.assemble(na.contribution({
    text, stance, stanceTarget: replyTo, inReplyTo: replyTo,
    evidence: fields.evidence.value.trim() || [],
  }), {
    attributedTo: AUTHOR,
    nanopubType: stance || na.NS.schema + 'Statement',
    introduces: 'statement',
    template: na.TEMPLATES.DISCOURSE,
  });

  $('publish').disabled = true;
  try {
    say('Checking against the conformance shapes…');
    const { conforms, messages } = await na.validate(quads, await shapes);
    if (!conforms) throw new Error(`Does not conform: ${messages.join('; ')}`);
    say('Signing and publishing to the test registry…');
    const uri = await publish(await na.toTrig(quads), await signer);
    say('Reading it back from the test registry…');
    const c = await fetchContribution(uri);
    posts.set(c.node, c);
    saveOwn();
    render();
    compose.reset();
    setReplyTo(null);
    say(`Published ${artifactCode(uri)}`, 'ok');
  } catch (err) {
    say(err.message, 'error');
  } finally {
    $('publish').disabled = false;
  }
}

async function loadNetwork() {
  $('feed-status').textContent = 'Loading recent statements from the nanopub network…';
  try {
    for (const c of await recentContributions()) posts.set(c.node, c);
    $('feed-status').textContent = '';
  } catch (err) {
    $('feed-status').textContent = `Could not query the nanopub network: ${err.message}`;
  }
  render();
}

async function restoreOwn() {
  let uris = [];
  try { uris = JSON.parse(localStorage.getItem(SAVED)) || []; } catch {}
  const results = await Promise.allSettled(uris.map(fetchContribution));
  for (const r of results) if (r.status === 'fulfilled') posts.set(r.value.node, r.value);
  render();
}

function saveOwn() {
  const own = [...posts.values()].filter(c => c.source === 'test').map(c => c.uri);
  try { localStorage.setItem(SAVED, JSON.stringify(own)); } catch {}
}

function setReplyTo(node, action = ACTIONS[0]) {
  replyTo = node;
  $('reply-banner').hidden = $('cancel-reply').hidden = !node;
  $('publish').textContent = node ? 'Publish reply' : 'Publish';
  fields.statement.placeholder = (node && action.placeholder) || '';
  if (!node) return;
  $('reply-quote').textContent = snippet(posts.get(node)?.text ?? node);
  fields.stance.value = action.stance && na.NS.cito + action.stance;
  fields.statement.focus();
}

function say(message, kind = 'progress') {
  $('status').textContent = message;
  $('status').dataset.kind = kind;
}

function render() {
  const all = [...posts.values()].sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));
  $('timeline').replaceChildren(...all.map(post));
}

function post(c) {
  const parent = posts.get(c.target ?? c.inReplyTo);
  const link = c.source === 'test' ? registryUrl(c.uri) : c.uri;
  return h('li', {},
    h('article', { className: 'post', dataset: { uri: c.uri, node: c.node, source: c.source, stance: c.stance ?? '' },
        attrs: { about: c.node, typeof: c.question ? 'schema:Question' : 'schema:Statement' } },
      h('p', { className: 'meta' },
        c.source === 'test'
          ? h('span', { className: 'you' }, 'you · test registry')
          : c.creator
            ? h('a', { href: c.creator, target: '_blank', rel: 'noopener', className: 'author' },
              c.creatorName ?? c.creator.replace(/^https?:\/\/(orcid\.org\/)?/, ''))
            : h('span', {}, 'unknown author'),
        h('a', { href: link, target: '_blank', rel: 'noopener' }, artifactCode(c.uri).slice(0, 10) + '…'),
        c.created && h('time', { dateTime: c.created }, new Date(c.created).toLocaleString()),
        c.question && h('span', {}, 'question')),
      (c.inReplyTo || c.stance) && h('p', { className: 'context' },
        c.stance
          ? h('span', { className: 'stance', title: na.NS.cito + c.stance,
              attrs: { rel: `cito:${c.stance}`, resource: c.target } }, STANCE_LABELS[c.stance] ?? c.stance)
          : 'reply',
        ' → ',
        h(parent ? 'q' : 'span', { attrs: c.inReplyTo ? { rel: 'as:inReplyTo', resource: c.inReplyTo } : {} },
          parent ? snippet(parent.text) : c.target ?? c.inReplyTo)),
      h('p', { className: 'text', attrs: { property: 'rdf:value' } }, c.text),
      c.evidence.length > 0 && h('p', { className: 'evidence' }, 'Evidence ',
        ...c.evidence.map(e => h('a', { href: e, target: '_blank', attrs: { rel: 'cito:citesAsEvidence noopener' } }, e))),
      h('div', { className: 'actions' },
        ...ACTIONS.map((a, i) => h('button', { type: 'button', dataset: { action: i } }, a.label)),
        c.trig && h('details', {}, h('summary', {}, 'TriG'), h('pre', {}, c.trig)))));
}

const snippet = t => t.length > 90 ? t.slice(0, 90) + '…' : t;

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  const { dataset, attrs = {}, ...rest } = props;
  Object.assign(el, rest);
  Object.assign(el.dataset, dataset);
  for (const [name, value] of Object.entries(attrs)) if (value) el.setAttribute(name, value);
  el.append(...kids.filter(k => k !== false && k != null && k !== ''));
  return el;
}
