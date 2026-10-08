// Reads and writes go to the test registry only.

import { Nanopub, TEST_NANOPUB_REGISTRY_URL } from '@nanopub/nanopub-js';
import { Parser } from 'n3';
import { NS } from '../../js/na-core.js';

export const REGISTRY = TEST_NANOPUB_REGISTRY_URL;

const STANCES = ['supports', 'disputes', 'extends', 'agreesWith', 'qualifies',
  'critiques', 'corrects', 'discusses'].map(p => NS.cito + p);

export function artifactCode(uri) {
  const code = String(uri).match(/RA[A-Za-z0-9_-]{43}/)?.[0];
  if (!code) throw new Error(`Not a nanopub URI: ${uri}`);
  return code;
}

// w3id URIs resolve on the main network.
export const registryUrl = uri => REGISTRY + artifactCode(uri);

// The key check queries the main network, so it is off.
export async function publish(trig, signer) {
  const np = Nanopub.fromRdf(trig, 'trig', signer);
  await np.sign({ keyCheck: 'off' });
  const { uri } = await np.publish(REGISTRY, { keyCheck: 'off' });
  return uri;
}

// TODO: render with <nanopub-item> once it keeps every value of a predicate.
export async function fetchContribution(uri) {
  const res = await fetch(registryUrl(uri), { headers: { Accept: 'application/trig' } });
  if (!res.ok) throw new Error(`Test registry returned ${res.status} for ${artifactCode(uri)}`);
  const trig = await res.text();
  const quads = new Parser({ format: 'application/trig' }).parse(trig);
  const one = (s, p) => quads.find(q => (!s || q.subject.value === s) && q.predicate.value === p);

  const np = one(null, NS.np + 'hasAssertion')?.subject.value;
  const node = one(np, NS.npx + 'introduces')?.object.value ?? one(null, NS.rdf + 'value')?.subject.value;
  const stanceQuad = quads.find(q => q.subject.value === node && STANCES.includes(q.predicate.value));
  return {
    uri: np,
    node,
    question: quads.some(q => q.subject.value === node && q.object.value === NS.schema + 'Question'),
    text: one(node, NS.rdf + 'value')?.object.value ?? '',
    stance: stanceQuad?.predicate.value.slice(NS.cito.length),
    target: stanceQuad?.object.value,
    inReplyTo: one(node, NS.as + 'inReplyTo')?.object.value,
    evidence: quads.filter(q => q.subject.value === node && q.predicate.value === NS.cito + 'citesAsEvidence')
      .map(q => q.object.value),
    creator: one(np, NS.dct + 'creator')?.object.value,
    created: one(np, NS.dct + 'created')?.object.value,
    trig,
    source: 'test',
  };
}
