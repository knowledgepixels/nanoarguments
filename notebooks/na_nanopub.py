"""Helpers for the Nanoarguments notebooks: build, sign, publish, query, validate.

Introduced sub: resources become <nanopub-uri>/<name> after signing, so a node
introduced as sub:claim is np.source_uri + "/claim". The CiTO stance sits on the
content node in the assertion graph; the nanopub type goes in npx:hasNanopubType.
"""

import os
from datetime import datetime, timezone
from pathlib import Path

import yaml
from rdflib import Dataset
from nanopub import Nanopub, NanopubConf
from nanopub.definitions import DUMMY_NANOPUB_URI, DUMMY_URI
from nanopub.profile import Profile

PREFIXES = {
    "rdf":    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs":   "http://www.w3.org/2000/01/rdf-schema#",
    "xsd":    "http://www.w3.org/2001/XMLSchema#",
    "schema": "https://schema.org/",
    "cito":   "http://purl.org/spar/cito/",
    "sio":    "http://semanticscience.org/resource/",
    "oa":     "http://www.w3.org/ns/oa#",
    "as":     "https://www.w3.org/ns/activitystreams#",
    "prov":   "http://www.w3.org/ns/prov#",
    "dct":    "http://purl.org/dc/terms/",
    "np":     "http://www.nanopub.org/nschema#",
    "npx":    "http://purl.org/nanopub/x/",
    "nt":     "https://w3id.org/np/o/ntemplate/",
    "orcid":  "https://orcid.org/",
    "foaf":   "http://xmlns.com/foaf/0.1/",
}

# SPARQL prefix header for queries.
QP = "".join(f"PREFIX {p}: <{iri}>\n" for p, iri in PREFIXES.items())

LICENSE = "https://creativecommons.org/licenses/by/4.0/"
SIGNED_DIR = Path(__file__).parent / "signed"
SHAPES = Path(__file__).parent.parent / "shapes" / "conformance.shacl.ttl"


def _profile(path="~/.nanopub/profile.yml"):
    """Load the local profile, accepting both orcid_id and agent_id keys."""
    raw = yaml.safe_load(open(os.path.expanduser(path)))
    return Profile(
        name=raw["name"],
        orcid_id=raw.get("orcid_id") or raw.get("agent_id"),
        private_key=Path(os.path.expanduser(raw["private_key"])),
        public_key=Path(os.path.expanduser(raw["public_key"])),
        introduction_nanopub_uri=raw.get("introduction_nanopub_uri"),
    )


def _term(t):
    """Render an argument as a Turtle term."""
    t = t.strip()
    if t.startswith("<"):
        return t
    if ":" in t and t.split(":", 1)[0] in ({"sub", "this"} | set(PREFIXES)):
        return t
    return f"<{t}>"


# Pubinfo line marking a nanopub as an example whose content is not to be taken seriously.
EXAMPLE = "this: a npx:ExampleNanopub ."

# Affirmative stances a question must not take (model section 6; also in the shapes).
AFFIRMATIVE = {PREFIXES["cito"] + p for p in ("supports", "agreesWith", "extends", "confirms")}


def from_template(template_uri):
    """Pubinfo line recording the template this nanopub follows."""
    return f"this: nt:wasCreatedFromTemplate <{template_uri}> ."


def make(assertion, *, attributed_to, nanopub_type=None, introduces=None,
         created=None, extra_pubinfo=None, test=True, name=None):
    """Assemble and sign a nanopublication from a Turtle assertion snippet.

    assertion: Turtle for the assertion graph, using sub: for local resources.
    attributed_to: agent IRI for prov:wasAttributedTo and dct:creator.
    nanopub_type: npx:hasNanopubType value. introduces: introduced node name.
    created: xsd:dateTime, defaults to now. extra_pubinfo: extra pubinfo Turtle.
    test: publish target is the test server. name: write signed/<name>.trig.
    Returns the signed nanopub; its trusty URI is .source_uri.
    """
    who = _term(attributed_to)
    when = created or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    pubinfo = [
        f"this: dct:creator {who} ;",
        f'  dct:created "{when}"^^xsd:dateTime ;',
        f"  dct:license <{LICENSE}> .",
    ]
    if nanopub_type:
        pubinfo.append(f"this: npx:hasNanopubType {_term(nanopub_type)} .")
    if introduces:
        pubinfo.append(f"this: npx:introduces {_term(introduces)} .")
    if extra_pubinfo:
        pubinfo.append(extra_pubinfo)

    prefix_block = "\n".join(
        [f"@prefix this: <{DUMMY_NANOPUB_URI}> .", f"@prefix sub: <{DUMMY_URI}> ."]
        + [f"@prefix {p}: <{iri}> ." for p, iri in PREFIXES.items()])

    trig = f"""{prefix_block}

sub:Head {{
  this: a np:Nanopublication ;
    np:hasAssertion sub:assertion ;
    np:hasProvenance sub:provenance ;
    np:hasPublicationInfo sub:pubinfo .
}}

sub:assertion {{
{assertion}
}}

sub:provenance {{
  sub:assertion prov:wasAttributedTo {who} .
}}

sub:pubinfo {{
  {chr(10).join('  ' + line for line in pubinfo).lstrip()}
}}
"""
    ds = Dataset()
    ds.parse(data=trig, format="trig")
    _check_question_stances(ds)

    conf = NanopubConf(profile=_profile(), use_test_server=test)
    npub = Nanopub(rdf=ds, conf=conf)
    npub.sign()

    if name:
        SIGNED_DIR.mkdir(exist_ok=True)
        (SIGNED_DIR / f"{name}.trig").write_text(
            npub.rdf.serialize(format="trig"))
    return npub


def _check_question_stances(ds):
    """Reject affirmative stances on questions before signing."""
    from rdflib import RDF, URIRef
    qtype = URIRef(PREFIXES["schema"] + "Question")
    questions = {s for s, _, _, _ in ds.quads((None, RDF.type, qtype, None))}
    for q in questions:
        for _, p, _, _ in ds.quads((q, None, None, None)):
            if str(p) in AFFIRMATIVE:
                raise ValueError(
                    f"A question must not take an affirmative stance ({localname(p)}).")


def publish(npub):
    """Publish a signed nanopub and return its URI. Production publishing is permanent."""
    npub.publish()
    return npub.source_uri


def load(*npubs):
    """Merge signed nanopubs into one Dataset for cross-nanopub queries.

    Local stand-in for network retrieval: in production the same queries run
    against a nanopub query service, or over fetched nanopubs merged like this.
    """
    ds = Dataset()
    for npub in npubs:
        ds.parse(data=npub.rdf.serialize(format="trig"), format="trig")
    return ds


def targets(ds, target_uri):
    """Contributions pointing at target_uri via a discourse relation."""
    q = QP + f"""
    SELECT ?contribution ?relation ?value WHERE {{ GRAPH ?g {{
      ?contribution ?relation <{target_uri}> ;
                    rdf:value ?value .
      FILTER(?relation IN (cito:supports, cito:disputes, cito:extends,
                           cito:agreesWith, cito:qualifies, cito:critiques,
                           cito:corrects, cito:discusses, as:inReplyTo))
    }} }} ORDER BY ?relation"""
    return [{"contribution": str(r.contribution), "relation": str(r.relation),
             "value": str(r.value)} for r in ds.query(q)]


def validate(npub, shapes=SHAPES):
    """Validate against the conformance shapes. Returns (conforms, messages)."""
    import pyshacl
    union = Dataset(default_union=True)
    union.parse(data=npub.rdf.serialize(format="trig"), format="trig")
    conforms, _, text = pyshacl.validate(union, shacl_graph=str(shapes))
    messages = [line.split("Message:", 1)[1].strip()
                for line in text.splitlines() if "Message:" in line]
    return conforms, messages


def localname(uri):
    """Last path or fragment segment of an IRI."""
    u = str(uri)
    return u.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def show(npub, label=None):
    """Print label, trusty URI, and nanopub type."""
    from rdflib import URIRef
    types = ", ".join(localname(o) for o in npub.pubinfo.objects(
        None, URIRef(PREFIXES["npx"] + "hasNanopubType"))) or "-"
    print(f"{(label or '.'):14s} {npub.source_uri}   [{types}]")
