# Nanoarguments notebooks

Notebooks exercising the model with real nanopub tooling. 01-03 and validation
sign locally and publish nothing; 04 publishes (test server unless you set
`TEST = False`).

## Setup

```bash
pip install nanopub
np setup   # asks for your ORCID and name, generates signing keys
```

Run Jupyter from this directory. The first cell of each notebook installs
missing dependencies.

## Contents

| Notebook | |
| --- | --- |
| 01 | Sign a claim and a support, query the discourse edge across the files. |
| 02 | Direct triple and annotation forms, same discourse edge. |
| 03 | Full thread in publication order, aggregation query. |
| 04 | Build and publish the example set from the templates. |
| validation | Check nanopubs against the conformance shapes. |

`na_nanopub.py` has the helpers (build, sign, publish, query, validate). Signed output goes to `signed/`, git-ignored.
