# Dev Preview Harness

Renders the widget **outside Zoho Creator** by injecting a mock
`ZOHO.CREATOR` SDK with sample data. Nothing in this folder is part of
the widget package that gets uploaded to Zoho (only `app/` is).

## Usage

```bash
python3 dev-preview/generate.py            # preview.html (has Implementation data)
python3 dev-preview/generate.py --no-impl  # preview-noimpl.html (zero Implementation contracts)

# serve the repo root, then open:
python3 -m http.server 4173 --bind 0.0.0.0
# http://localhost:4173/dev-preview/preview.html
```

Re-run `generate.py` after editing `app/index.html` (css/js are read
live from `app/`, so CSS/JS edits only need a page refresh).

`preview.html` / `preview-noimpl.html` are generated files — don't commit them.
