import { test as base, expect } from '@playwright/test';
import { Parser } from 'n3';
import { RdfaParser } from 'rdfa-streaming-parser';
import { verifySignature } from '@nanopub/nanopub-js';

export const REGISTRY = 'https://test.registry.knowledgepixels.com/np/';
const REGISTRY_HOST = new URL(REGISTRY).hostname;
const ALLOWED_HOSTS = ['localhost', 'cdn.jsdelivr.net', REGISTRY_HOST,
  'query.knowledgepixels.com', 'query.petapico.org', 'query.nanodash.net'];

export const CITO = 'http://purl.org/spar/cito/';
export const AS = 'https://www.w3.org/ns/activitystreams#';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST' };

export const test = base.extend({
  liveRegistry: [false, { option: true }],
  registry: async ({}, use) => use(new Map()),
  // Fail on hosts outside the list, or on writes outside the test registry.
  page: async ({ page, liveRegistry, registry }, use) => {
    const blocked = [];
    await page.route('**/*', route => {
      const request = route.request();
      const { hostname } = new URL(request.url());
      const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
      if (ALLOWED_HOSTS.includes(hostname) && (!write || hostname === REGISTRY_HOST)) return route.continue();
      blocked.push(`${request.method()} ${request.url()}`);
      return route.abort('blockedbyclient');
    });
    if (!liveRegistry) await page.route(`${REGISTRY}**`, route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (request.method() === 'POST') {
        const trig = request.postData();
        registry.set(code(npOf(parse(trig))), trig);
        return route.fulfill({ status: 201, headers: CORS });
      }
      const trig = registry.get(request.url().match(/RA[A-Za-z0-9_-]{43}/)?.[0]);
      return route.fulfill(trig
        ? { status: 200, headers: CORS, contentType: 'application/trig', body: trig }
        : { status: 404, headers: CORS });
    });
    await use(page);
    expect(blocked, 'requests to hosts outside the allowed list, or writes outside the test registry').toEqual([]);
  },
});

export { expect };

export const code = uri => uri.match(/RA[A-Za-z0-9_-]{43}/)[0];

const parse = trig => new Parser({ format: 'application/trig' }).parse(trig);
const npOf = quads => quads.find(q => q.predicate.value === 'http://www.nanopub.org/nschema#hasAssertion').subject.value;

async function checked(trig, uri) {
  const quads = parse(trig);
  expect(npOf(quads)).toBe(uri);
  expect(await verifySignature(trig)).toEqual({ valid: true });
  return quads;
}

export async function published(registry, uri) {
  const trig = registry.get(code(uri));
  expect(trig, `${code(uri)} was published`).toBeDefined();
  return checked(trig, uri);
}

export async function fromRegistry(request, uri) {
  const res = await request.get(REGISTRY + code(uri), { headers: { Accept: 'application/trig' } });
  expect(res.ok()).toBe(true);
  return checked(await res.text(), uri);
}

export const has = (quads, p, o) => quads.some(q => q.predicate.value === p && (o === undefined || q.object.value === o));

export async function publish(page, text, { evidence } = {}) {
  await page.getByLabel('Statement', { exact: true }).fill(text);
  if (evidence) await page.getByLabel('Evidence').fill(evidence);
  await page.getByRole('button', { name: /^Publish/ }).click();
  await expect(page.locator('#status')).toHaveText(/^Published RA/);
  const post = page.locator('article.post[data-source=test]', { hasText: text });
  await expect(post).toBeVisible();
  return { uri: await post.getAttribute('data-uri'), node: await post.getAttribute('data-node') };
}

export const unique = label => `${label} ${new Date().toISOString()} ${Math.random().toString(36).slice(2, 8)}`;

export async function rdfaOf(page) {
  const html = await page.content();
  return new Promise((resolve, reject) => {
    const quads = [];
    const parser = new RdfaParser({ baseIRI: page.url(), contentType: 'text/html' });
    parser.on('data', q => quads.push(q)).on('error', reject).on('end', () => resolve(quads));
    parser.write(html);
    parser.end();
  });
}
