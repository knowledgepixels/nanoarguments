// Nanoarguments conventions layer, JS twin of notebooks/na_nanopub.py.
// Builders for the model's triples plus the standard discourse queries.
// Output is the unsigned four-graph nanopub on the temp base URI; pass the
// quads or TriG to a signer (@nanopub/nanopub-js, nanopub-py/rs) unchanged.
// Temporary home; when packaged, change the import below to bare 'n3'.

import { Writer, DataFactory } from 'https://esm.sh/n3@1';
const { namedNode, literal, quad } = DataFactory;

export const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
  xsd:    'http://www.w3.org/2001/XMLSchema#',
  schema: 'https://schema.org/',
  cito:   'http://purl.org/spar/cito/',
  sio:    'http://semanticscience.org/resource/',
  oa:     'http://www.w3.org/ns/oa#',
  as:     'https://www.w3.org/ns/activitystreams#',
  prov:   'http://www.w3.org/ns/prov#',
  dct:    'http://purl.org/dc/terms/',
  np:     'http://www.nanopub.org/nschema#',
  npx:    'http://purl.org/nanopub/x/',
  nt:     'https://w3id.org/np/o/ntemplate/',
  orcid:  'https://orcid.org/',
};

// Current template versions, stamped via nt:wasCreatedFromTemplate.
// TEMPLATE_KINDS are the stable version-independent identifiers.
export const TEMPLATES = {
  DISCOURSE:  'https://w3id.org/np/RAFpID-NunXGUAZebXPfhD9efjvfpZqB5gDBrgP2Lp5N8',
  QUESTION:   'https://w3id.org/np/RAOp9i7XUKKJhT4qIvtCA6LpXj9Hq7qkhsZ1MrLP7UfHE',
  EVIDENCE:   'https://w3id.org/np/RAdGQVeqqUoTNJe52OSMhY8EX1MkFA1LI4oQh-NAgrYV8',
  ANNOTATION: 'https://w3id.org/np/RATxyPikKUvLwqijI4T_fvaHE758DsxgXhOq0m6KiLlEI',
};

export const TEMPLATE_KINDS = Object.fromEntries(
  Object.entries(TEMPLATES).map(([k, v]) => [k, v + '/templateKind']));

export const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

// Placeholder base; the signer replaces it, so sub:claim becomes <np-uri>/claim.
export const TEMP = 'http://purl.org/nanopub/temp/np';
export const THIS = namedNode(TEMP);
export const sub = s => namedNode(`${TEMP}/${s}`);

const nn = i => namedNode(i);
const A  = nn(NS.rdf + 'type');
const G  = { assertion: sub('assertion'), head: sub('Head'),
             provenance: sub('provenance'), pubinfo: sub('pubinfo') };

// Stances a question may take (model section 6; the template's dropdown).
export const QUESTION_STANCES = ['disputes', 'critiques', 'qualifies',
  'corrects', 'discusses'].map(p => NS.cito + p);

/** Assertion quads for a statement or question. opts: text (required), type,
 *  stance + stanceTarget, inReplyTo, evidence (IRI or array), node. */
export function contribution({ text, type = NS.schema + 'Statement',
    stance, stanceTarget, inReplyTo, evidence = [], node } = {}) {
  if (!text) throw new Error('contribution: text is required');
  if (type === NS.schema + 'Question' && stance && !QUESTION_STANCES.includes(stance))
    throw new Error(`contribution: a question may not take stance ${localname(stance)}`);
  const s = sub(node || (type === NS.schema + 'Question' ? 'question' : 'statement'));
  const quads = [
    quad(s, A, nn(type), G.assertion),
    quad(s, nn(NS.rdf + 'value'), literal(text), G.assertion),
  ];
  if (stance && stanceTarget) quads.push(quad(s, nn(stance), nn(stanceTarget), G.assertion));
  if (inReplyTo) quads.push(quad(s, nn(NS.as + 'inReplyTo'), nn(inReplyTo), G.assertion));
  for (const e of [].concat(evidence).filter(Boolean))
    quads.push(quad(s, nn(NS.cito + 'citesAsEvidence'), nn(e), G.assertion));
  return quads;
}

/** Contribution additionally typed as the SIO evidence class. */
export function evidenceFinding(opts = {}) {
  const node = opts.node || 'finding';
  return [
    ...contribution({ ...opts, node }),
    quad(sub(node), A, nn(NS.sio + 'SIO_001394'), G.assertion),
  ];
}

/** Wrap a statement as the body of a Web Annotation (body referenced by IRI).
 *  opts: statement, source (required), motivation, exact/prefix/suffix. */
export function annotation({ statement = 'statement', source,
    motivation = NS.oa + 'assessing', exact, prefix, suffix } = {}) {
  if (!source) throw new Error('annotation: source is required');
  const a = sub('annotation'), sr = sub('specificResource'), sel = sub('selector');
  const quads = [
    quad(a, A, nn(NS.oa + 'Annotation'), G.assertion),
    quad(a, nn(NS.oa + 'hasBody'), sub(statement), G.assertion),
    quad(a, nn(NS.oa + 'hasTarget'), sr, G.assertion),
    quad(a, nn(NS.oa + 'motivatedBy'), nn(motivation), G.assertion),
    quad(sr, A, nn(NS.oa + 'SpecificResource'), G.assertion),
    quad(sr, nn(NS.oa + 'hasSource'), nn(source), G.assertion),
  ];
  if (exact) {
    quads.push(
      quad(sr, nn(NS.oa + 'hasSelector'), sel, G.assertion),
      quad(sel, A, nn(NS.oa + 'TextQuoteSelector'), G.assertion),
      quad(sel, nn(NS.oa + 'exact'), literal(exact), G.assertion));
    if (prefix) quads.push(quad(sel, nn(NS.oa + 'prefix'), literal(prefix), G.assertion));
    if (suffix) quads.push(quad(sel, nn(NS.oa + 'suffix'), literal(suffix), G.assertion));
  }
  return quads;
}

/** Wrap assertion quads into the four-graph unsigned nanopub. opts:
 *  attributedTo (required), nanopubType, introduces, template, created,
 *  license, example (marks the nanopub npx:ExampleNanopub). */
export function assemble(assertionQuads, { attributedTo, nanopubType,
    introduces, template, created, license = LICENSE, example = false } = {}) {
  if (!attributedTo) throw new Error('assemble: attributedTo is required');
  const who = nn(attributedTo);
  const when = created || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const quads = [
    quad(THIS, A, nn(NS.np + 'Nanopublication'), G.head),
    quad(THIS, nn(NS.np + 'hasAssertion'), G.assertion, G.head),
    quad(THIS, nn(NS.np + 'hasProvenance'), G.provenance, G.head),
    quad(THIS, nn(NS.np + 'hasPublicationInfo'), G.pubinfo, G.head),
    ...assertionQuads,
    quad(G.assertion, nn(NS.prov + 'wasAttributedTo'), who, G.provenance),
    quad(THIS, nn(NS.dct + 'creator'), who, G.pubinfo),
    quad(THIS, nn(NS.dct + 'created'),
      literal(when, nn(NS.xsd + 'dateTime')), G.pubinfo),
    quad(THIS, nn(NS.dct + 'license'), nn(license), G.pubinfo),
  ];
  if (nanopubType) quads.push(quad(THIS, nn(NS.npx + 'hasNanopubType'), nn(nanopubType), G.pubinfo));
  if (introduces) quads.push(quad(THIS, nn(NS.npx + 'introduces'), sub(introduces), G.pubinfo));
  if (template) quads.push(quad(THIS, nn(NS.nt + 'wasCreatedFromTemplate'), nn(template), G.pubinfo));
  if (example) quads.push(quad(THIS, A, nn(NS.npx + 'ExampleNanopub'), G.pubinfo));
  return quads;
}

/** Web Annotation object to unsigned nanopub quads, following the annotation
 *  template. anno: { bodyValue, target: { source, selector? } | 'iri',
 *  motivation? }. opts: attributedTo (required), stance, stanceTarget,
 *  inReplyTo, created. */
export function annotationToNanopub(anno, opts = {}) {
  const target = typeof anno.target === 'string' ? { source: anno.target } : (anno.target || {});
  const statement = contribution({
    text: anno.bodyValue,
    stance: opts.stance, stanceTarget: opts.stanceTarget,
    inReplyTo: opts.inReplyTo,
  });
  const wrapper = annotation({
    source: target.source,
    motivation: anno.motivation,
    ...(target.selector || {}),
  });
  return assemble([...statement, ...wrapper], {
    attributedTo: opts.attributedTo,
    nanopubType: opts.stance || NS.schema + 'Statement',
    introduces: 'statement',
    template: TEMPLATES.ANNOTATION,
    created: opts.created,
  });
}

/** Serialize quads to TriG, ready for a signer. Returns a Promise<string>. */
export function toTrig(quads, extraPrefixes = {}) {
  const writer = new Writer({ format: 'application/trig', prefixes: {
    this: TEMP, sub: TEMP + '/', np: NS.np, npx: NS.npx, nt: NS.nt,
    prov: NS.prov, dct: NS.dct, rdf: NS.rdf, xsd: NS.xsd, schema: NS.schema,
    cito: NS.cito, sio: NS.sio, oa: NS.oa, as: NS.as, orcid: NS.orcid,
    ...extraPrefixes,
  }});
  writer.addQuads(quads);
  return new Promise((res, rej) => writer.end((e, r) => e ? rej(e) : res(r)));
}

/** Validate nanopub quads against SHACL shapes (a Turtle string, e.g. the
 *  fetched conformance shapes). Loads rdf-validate-shacl on first use.
 *  Returns { conforms, messages }. */
export async function validate(quads, shapesTtl) {
  const [{ default: SHACLValidator }, { Parser, Store }] = await Promise.all([
    import('https://esm.sh/rdf-validate-shacl@0.6'),
    import('https://esm.sh/n3@1'),
  ]);
  const shapes = new Store(new Parser().parse(shapesTtl));
  const report = await new SHACLValidator(shapes).validate(new Store(quads));
  return {
    conforms: report.conforms,
    messages: report.results.flatMap(r => r.message.map(m => m.value)),
  };
}

// Standard query patterns (section 10.1).

export const QP = Object.entries(NS)
  .map(([p, iri]) => `PREFIX ${p}: <${iri}>`).join('\n') + '\n';

const DISCOURSE_RELATIONS = ['cito:supports', 'cito:disputes', 'cito:extends',
  'cito:agreesWith', 'cito:qualifies', 'cito:critiques', 'cito:corrects',
  'cito:discusses', 'as:inReplyTo'];

/** Everything targeting uri, with its text. */
export const targetsQuery = uri => QP + `
SELECT ?contribution ?relation ?value WHERE { GRAPH ?g {
  ?contribution ?relation <${uri}> ;
                rdf:value ?value .
  FILTER(?relation IN (${DISCOURSE_RELATIONS.join(', ')}))
} } ORDER BY ?relation`;

/** Contribution counts per relation for uri. */
export const stanceCountsQuery = uri => QP + `
SELECT ?relation (COUNT(?c) AS ?n) WHERE { GRAPH ?g {
  ?c ?relation <${uri}> .
  FILTER(?relation IN (${DISCOURSE_RELATIONS.join(', ')}))
} } GROUP BY ?relation ORDER BY DESC(?n)`;

export const localname = u => String(u).split(/[#/]/).pop();
