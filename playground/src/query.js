import { NanopubClient } from '@nanopub/nanopub-js';
import { NS, QP } from '../../js/na-core.js';

const client = new NanopubClient();

const STANCES = ['supports', 'disputes', 'extends', 'agreesWith', 'qualifies',
  'critiques', 'corrects', 'discusses'].map(p => NS.cito + p);

// Latest valid, non-retracted nanopubs with a schema:Statement node.
// TODO: publish as a query template and render with <nanopub-list>.
const recentQuery = limit => QP + `
PREFIX npa: <http://purl.org/nanopub/admin/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?np ?node ?question ?text ?date ?creator ?name ?inReplyTo ?stance ?target WHERE {
  { SELECT DISTINCT ?np ?a ?date WHERE {
      GRAPH npa:graph {
        ?np npa:hasValidSignatureForPublicKeyHash ?pkh ; dct:created ?date ; np:hasAssertion ?a .
        FILTER NOT EXISTS { ?x npx:invalidates ?np ; npa:hasValidSignatureForPublicKeyHash ?pkh . }
      }
      GRAPH ?a { ?s a schema:Statement ; rdf:value ?t . }
    } ORDER BY DESC(?date) LIMIT ${limit} }
  GRAPH ?a {
    ?node rdf:value ?text .
    OPTIONAL { ?node a schema:Question . BIND(true AS ?question) }
    OPTIONAL { ?node as:inReplyTo ?inReplyTo }
    OPTIONAL { ?node ?stance ?target . FILTER(?stance IN (${STANCES.map(s => `<${s}>`).join(', ')})) }
  }
  OPTIONAL { ?np np:hasPublicationInfo ?pi .
    GRAPH ?pi { ?np dct:creator ?creator . OPTIONAL { ?creator foaf:name ?name } } }
}`;

export async function recentContributions(limit = 20) {
  const rows = await client.querySparql(recentQuery(limit));
  const byNode = new Map();
  for (const r of rows) {
    const c = byNode.get(r.node) ?? byNode.set(r.node, {
      uri: r.np, node: r.node, text: r.text, question: !!r.question,
      created: r.date, creator: r.creator, evidence: [], source: 'network',
    }).get(r.node);
    c.inReplyTo ??= r.inReplyTo;
    c.creatorName ??= r.name;
    if (r.stance && !c.stance) { c.stance = r.stance.slice(NS.cito.length); c.target = r.target; }
  }
  const names = new Map([...byNode.values()].filter(c => c.creatorName).map(c => [c.creator, c.creatorName]));
  for (const c of byNode.values()) c.creatorName ??= names.get(c.creator);
  return [...byNode.values()].sort((a, b) => b.created.localeCompare(a.created));
}
