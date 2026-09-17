# Agent Working Conventions

## Python tooling

- If you need to work with Python (scripts, test harnesses, one-off tooling), you must set up a
  virtual environment in the `/tmp` folder for it (e.g. `/tmp/opencode-venv`) and install any
  packages there.
- Never install packages into, or otherwise modify, the user's global Python environment.
- Keep helper/test scripts outside the repo (e.g. under `/tmp`) unless the user explicitly asks
  for them to be committed.
