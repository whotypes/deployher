# picoclaw-deployer

Small Go binary that deploys a PicoClaw container with a local persistent data directory.

It uses the official Docker images:

- `docker.io/sipeed/picoclaw:latest` for `gateway` mode
- `docker.io/sipeed/picoclaw:launcher` for `launcher` mode

## Build

```bash
cd golang/picoclaw-deployer
go build -o ../../dist/picoclaw-deployer ./cmd/picoclaw-deployer
```

## Run

Gateway mode:

```bash
./dist/picoclaw-deployer --mode gateway --gateway-port 18790
```

Launcher mode:

```bash
./dist/picoclaw-deployer --mode launcher --launcher-port 18800 --gateway-port 18790
```

## Behavior

- creates `./picoclaw-data` by default
- writes `config.json` there if one does not already exist
- mounts that directory into `/root/.picoclaw`
- exposes the PicoClaw gateway on host port `18790`
- in launcher mode, also exposes the web console on host port `18800`

The starter config contains placeholder model credentials. Edit `picoclaw-data/config.json` before first real use.
