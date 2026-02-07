# Example Deployment Repos

These are minimal repos you can use during development instead of creating throwaway test projects.

## Included examples

- `node-npm-static`: Node static build using `npm ci` + `npm run build`
- `node-pnpm-static`: Node static build using `pnpm install --frozen-lockfile`
- `node-bun-static`: Node static build using `bun install --frozen-lockfile`
- `node-yarn-static`: Node static build using `yarn install --frozen-lockfile`
- `python-mkdocs-pip`: Python static site using `requirements.txt` + `mkdocs.yml`
- `python-pdploy-pip`: Python static site using `pyproject.toml` `[tool.pdploy]`

## Using these with pdploy

1. Copy one example into its own GitHub repository.
2. Push to GitHub.
3. Create a pdploy project using that repo URL and branch.

The current build worker only supports GitHub URLs, so the repo must be hosted there for end-to-end tests.
