import { test, expect, REGISTRY, CITO, AS, code, published, fromRegistry, has, publish, unique, rdfaOf } from './fixtures.js';

const DISCOURSE_TEMPLATE = 'https://w3id.org/np/RAFpID-NunXGUAZebXPfhD9efjvfpZqB5gDBrgP2Lp5N8';
const NPX = 'http://purl.org/nanopub/x/';
const RDF_VALUE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value';

test.beforeEach(async ({ page }) => {
  await page.goto('/playground/');
  await expect(page.locator('#registry')).toHaveAttribute('href', REGISTRY);
});

test.describe('live test registry', () => {
  test.use({ liveRegistry: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'One live run is enough');

  test('publishes a statement and a disapproval, and reads both back', async ({ page, request }) => {
    const claim = unique('Live claim');
    const root = await publish(page, claim, { evidence: 'https://doi.org/10.5281/zenodo.1' });
    await page.locator(`[data-uri="${root.uri}"]`).getByRole('button', { name: 'Disapprove' }).click();
    const reply = await publish(page, unique('Live counter-argument'));

    const rootQuads = await fromRegistry(request, root.uri);
    expect(has(rootQuads, RDF_VALUE, claim)).toBe(true);
    expect(has(rootQuads, CITO + 'citesAsEvidence', 'https://doi.org/10.5281/zenodo.1')).toBe(true);
    const replyQuads = await fromRegistry(request, reply.uri);
    expect(has(replyQuads, CITO + 'disputes', root.node)).toBe(true);
    expect(has(replyQuads, AS + 'inReplyTo', root.node)).toBe(true);
  });
});

test('publishes a signed statement and shows it as read back', async ({ page, registry }) => {
  const text = unique('Statement');
  const evidence = 'https://doi.org/10.5281/zenodo.0000000';
  const { uri, node } = await publish(page, text, { evidence });

  expect(uri).toMatch(/^https:\/\/w3id\.org\/np\/RA/);
  expect(node).toBe(`${uri}/statement`);
  const post = page.locator(`[data-uri="${uri}"]`);
  await expect(post.getByText('you · test registry')).toBeVisible();
  await expect(post.getByRole('link', { name: evidence })).toBeVisible();
  await expect(post.getByRole('link', { name: code(uri).slice(0, 10) + '…' }))
    .toHaveAttribute('href', REGISTRY + code(uri));

  const quads = await published(registry, uri);
  expect(has(quads, RDF_VALUE, text)).toBe(true);
  expect(has(quads, CITO + 'citesAsEvidence', evidence)).toBe(true);
  expect(has(quads, 'https://w3id.org/np/o/ntemplate/wasCreatedFromTemplate', DISCOURSE_TEMPLATE)).toBe(true);
});

test('disapproves of a statement with cito:disputes aimed at its content node', async ({ page, registry }) => {
  const claim = unique('Claim');
  const root = await publish(page, claim);

  await page.locator(`[data-uri="${root.uri}"]`).getByRole('button', { name: 'Disapprove' }).click();
  await expect(page.locator('#reply-quote')).toHaveText(claim);
  await expect(page.getByLabel('Stance')).toHaveValue(CITO + 'disputes');
  await expect(page.getByLabel('Statement', { exact: true }))
    .toHaveAttribute('placeholder', 'Weak point, an error, or inaccurate.');

  const counter = unique('Counter-argument');
  const reply = await publish(page, counter);

  const post = page.locator(`[data-uri="${reply.uri}"]`);
  await expect(post.locator('.stance')).toHaveText('disputes');
  await expect(post.locator('.context q')).toHaveText(claim);
  await expect(page.locator('#reply-banner')).toBeHidden();

  const quads = await published(registry, reply.uri);
  expect(has(quads, CITO + 'disputes', root.node)).toBe(true);
  expect(has(quads, AS + 'inReplyTo', root.node)).toBe(true);
  expect(has(quads, NPX + 'hasNanopubType', CITO + 'disputes')).toBe(true);
});

test('approves of a statement with cito:agreesWith', async ({ page, registry }) => {
  const root = await publish(page, unique('Claim'));

  await page.locator(`[data-uri="${root.uri}"]`).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByLabel('Stance')).toHaveValue(CITO + 'agreesWith');
  await expect(page.getByLabel('Statement', { exact: true }))
    .toHaveAttribute('placeholder', 'Strong point or a convincing argument.');
  const reply = await publish(page, unique('Approval'));

  await expect(page.locator(`[data-uri="${reply.uri}"] .stance`)).toHaveText('agrees with');
  const quads = await published(registry, reply.uri);
  expect(has(quads, CITO + 'agreesWith', root.node)).toBe(true);
});

for (const [label, stance, text] of [['Support', 'supports', 'supports'], ['Qualify', 'qualifies', 'qualifies']]) {
  test(`${label.toLowerCase()} replies with cito:${stance}`, async ({ page, registry }) => {
    const root = await publish(page, unique('Claim'));

    await page.locator(`[data-uri="${root.uri}"]`).getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByLabel('Stance')).toHaveValue(CITO + stance);
    const reply = await publish(page, unique(label));

    await expect(page.locator(`[data-uri="${reply.uri}"] .stance`)).toHaveText(text);
    const quads = await published(registry, reply.uri);
    expect(has(quads, CITO + stance, root.node)).toBe(true);
  });
}

test('shows recent statements from the nanopub network and replies to one', async ({ page, registry }) => {
  const network = page.locator('article.post[data-source=network]');
  await expect(network.first()).toBeVisible();

  const authors = network.locator('.author');
  for (const href of await authors.evaluateAll(as => as.map(a => a.href))) expect(href).toMatch(/^https:\/\/orcid\.org\//);
  expect((await authors.allTextContents()).some(t => !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(t))).toBe(true);
  const target = network.first();
  const targetUri = await target.getAttribute('data-uri');
  const targetNode = await target.getAttribute('data-node');
  const targetText = await target.locator('.text').textContent();

  await target.getByRole('button', { name: 'Reply' }).click();
  await expect(page.getByLabel('Stance')).toHaveValue('');
  const reply = await publish(page, unique('Reply to the network'));

  await expect(page.locator(`[data-uri="${reply.uri}"] .context`)).toContainText('reply');
  const quads = await published(registry, reply.uri);
  expect(has(quads, AS + 'inReplyTo', targetNode)).toBe(true);
  expect(targetNode.startsWith(targetUri)).toBe(true);
  expect(targetText.length).toBeGreaterThan(0);
});

test('marks up each post in RDFa as its statement node, matching the nanopub', async ({ page }) => {
  const claim = unique('Claim');
  const root = await publish(page, claim, { evidence: 'https://doi.org/10.5281/zenodo.1' });
  await page.locator(`[data-uri="${root.uri}"]`).getByRole('button', { name: 'Disapprove' }).click();
  const counter = unique('Counter-argument');
  const reply = await publish(page, counter);
  await expect(page.locator('article.post[data-source=network]').first()).toBeVisible();

  const quads = await rdfaOf(page);
  const about = s => quads.filter(q => q.subject.value === s).map(q => [q.predicate.value, q.object.value]);
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

  expect(about(root.node)).toEqual(expect.arrayContaining([
    [RDF + 'type', 'https://schema.org/Statement'],
    [RDF_VALUE, claim],
    [CITO + 'citesAsEvidence', 'https://doi.org/10.5281/zenodo.1'],
  ]));
  expect(about(reply.node)).toEqual(expect.arrayContaining([
    [RDF_VALUE, counter],
    [CITO + 'disputes', root.node],
    [AS + 'inReplyTo', root.node],
  ]));
  const networkNode = await page.locator('article.post[data-source=network]').first().getAttribute('data-node');
  expect(about(networkNode).some(([p]) => p === RDF_VALUE)).toBe(true);
  expect(quads.some(q => q.predicate.value.endsWith('cite-as'))).toBe(false);
});

test('restores your posts from the registry after a reload', async ({ page }) => {
  const text = unique('Persistent statement');
  const { uri } = await publish(page, text);

  const refetched = page.waitForResponse(r => r.url() === REGISTRY + code(uri) && r.ok());
  await page.reload();
  await refetched;
  await expect(page.locator(`[data-uri="${uri}"] .text`)).toHaveText(text);
});

test('refuses an empty statement without publishing', async ({ page }) => {
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.locator('#status')).toHaveText('Write a statement first.');
  expect(posts).toEqual([]);
});

test('never submits the form natively, even when the app fails to load', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  await page.goto('/playground/');
  await expect(page.locator('#status')).toHaveText(/failed to load/);

  await page.getByLabel('Statement', { exact: true }).fill('Should not be submitted');
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByLabel('Evidence').press('Enter');
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByLabel('Statement', { exact: true })).toHaveValue('Should not be submitted');
});
