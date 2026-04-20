package deployer

import (
	"context"
	"io"
	"iter"
	"os"
	"path/filepath"
	"strings"
	"testing"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/api/types/jsonstream"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
)

func TestBuildDockerArgsGateway(t *testing.T) {
	t.Parallel()

	args := BuildDockerArgs(
		Options{
			Name:        "picoclaw-gateway",
			Mode:        ModeGateway,
			DataDir:     "./picoclaw-data",
			GatewayHost: "0.0.0.0",
			GatewayPort: 18790,
		},
		"/tmp/picoclaw-data",
	)

	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--name picoclaw-gateway") {
		t.Fatalf("expected container name in args: %s", joined)
	}
	if !strings.Contains(joined, "-e PICOCLAW_GATEWAY_HOST=0.0.0.0") {
		t.Fatalf("expected gateway host env in args: %s", joined)
	}
	if !strings.Contains(joined, "-p 18790:18790") {
		t.Fatalf("expected gateway port mapping in args: %s", joined)
	}
	if !strings.Contains(joined, "/tmp/picoclaw-data:/root/.picoclaw") {
		t.Fatalf("expected data volume mount in args: %s", joined)
	}
	if args[len(args)-1] != gatewayImage {
		t.Fatalf("expected default gateway image, got %q", args[len(args)-1])
	}
}

func TestBuildDockerArgsLauncher(t *testing.T) {
	t.Parallel()

	args := BuildDockerArgs(
		Options{
			Name:           "picoclaw-launcher",
			Mode:           ModeLauncher,
			DashboardToken: "fixed-token",
			GatewayPort:    28790,
			LauncherPort:   28800,
		},
		"/tmp/picoclaw-data",
	)

	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-p 28790:18790") {
		t.Fatalf("expected gateway mapping in args: %s", joined)
	}
	if !strings.Contains(joined, "-p 28800:18800") {
		t.Fatalf("expected launcher mapping in args: %s", joined)
	}
	if !strings.Contains(joined, "-e PICOCLAW_LAUNCHER_TOKEN=fixed-token") {
		t.Fatalf("expected launcher token in args: %s", joined)
	}
	if args[len(args)-1] != launcherImage {
		t.Fatalf("expected launcher image, got %q", args[len(args)-1])
	}
}

func TestEnsureDataDirCreatesStarterConfig(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "picoclaw")
	absDataDir, configPath, created, err := ensureDataDir(Options{DataDir: dataDir, GatewayHost: "0.0.0.0"})
	if err != nil {
		t.Fatalf("ensureDataDir() error = %v", err)
	}
	if !created {
		t.Fatal("expected ensureDataDir to create config.json")
	}
	if !strings.HasSuffix(configPath, "config.json") {
		t.Fatalf("expected config path to end with config.json, got %q", configPath)
	}
	if absDataDir == "" {
		t.Fatal("expected absolute data directory")
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, "\"model_list\": [") {
		t.Fatalf("expected starter config to contain model_list, got %s", text)
	}
	if !strings.Contains(text, "\"api_keys\": [") {
		t.Fatalf("expected starter config to contain api_keys, got %s", text)
	}
	if !strings.Contains(text, "\"host\": \"0.0.0.0\"") {
		t.Fatalf("expected starter config to contain gateway host, got %s", text)
	}
	if !strings.Contains(text, "\"model_name\": \"gpt-5.4\"") {
		t.Fatalf("expected starter config to contain agent default model name, got %s", text)
	}
}

func TestEnsureDataDirRewritesLegacyStarterConfig(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "picoclaw")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}
	legacyConfig := `{
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790
  },
  "providers": [
    {
      "name": "openai",
      "type": "openai",
      "model": "gpt-4.1-mini",
      "api_key": "sk-your-openai-key"
    }
  ],
  "workspace": {
    "root": "/root/.picoclaw/workspace"
  }
}
`
	if err := os.WriteFile(filepath.Join(dataDir, "config.json"), []byte(legacyConfig), 0o644); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	_, configPath, created, err := ensureDataDir(Options{DataDir: dataDir, GatewayHost: "0.0.0.0"})
	if err != nil {
		t.Fatalf("ensureDataDir() error = %v", err)
	}
	if !created {
		t.Fatal("expected ensureDataDir to rewrite legacy starter config")
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read rewritten config: %v", err)
	}
	text := string(content)
	if strings.Contains(text, "\"providers\": [") {
		t.Fatalf("expected legacy providers array to be removed, got %s", text)
	}
	if !strings.Contains(text, "\"model_list\": [") {
		t.Fatalf("expected rewritten config to contain model_list, got %s", text)
	}
}

func TestDeployWithClientGateway(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "picoclaw")
	fake := &fakeDockerClient{
		inspectErr:   cerrdefs.ErrNotFound,
		createResult: client.ContainerCreateResult{ID: "ctr-123"},
	}

	result, err := deployWithClient(context.Background(), fake, Options{
		Mode:        ModeGateway,
		DataDir:     dataDir,
		GatewayHost: "0.0.0.0",
	})
	if err != nil {
		t.Fatalf("deployWithClient() error = %v", err)
	}
	if fake.createCalls != 1 {
		t.Fatalf("expected one container create call, got %d", fake.createCalls)
	}
	if fake.startCalls != 1 {
		t.Fatalf("expected one container start call, got %d", fake.startCalls)
	}
	if fake.startID != "ctr-123" {
		t.Fatalf("expected start call for created container, got %q", fake.startID)
	}
	if fake.createOptions.Name != "picoclaw-gateway" {
		t.Fatalf("expected default container name, got %q", fake.createOptions.Name)
	}
	if fake.createOptions.Image != gatewayImage {
		t.Fatalf("expected default gateway image, got %q", fake.createOptions.Image)
	}

	absDataDir, err := filepath.Abs(dataDir)
	if err != nil {
		t.Fatalf("filepath.Abs() error = %v", err)
	}
	expectedBind := absDataDir + ":" + containerDataDir
	if got := fake.createOptions.HostConfig.Binds; len(got) != 1 || got[0] != expectedBind {
		t.Fatalf("expected bind %q, got %#v", expectedBind, got)
	}

	if env := strings.Join(fake.createOptions.Config.Env, " "); !strings.Contains(env, "PICOCLAW_GATEWAY_HOST=0.0.0.0") {
		t.Fatalf("expected gateway host env, got %q", env)
	}

	gatewayPort := network.MustParsePort(gatewayPortSpec)
	bindings := fake.createOptions.HostConfig.PortBindings[gatewayPort]
	if len(bindings) != 1 || bindings[0].HostPort != "18790" {
		t.Fatalf("expected gateway port binding, got %#v", bindings)
	}

	if !result.CreatedConfig {
		t.Fatal("expected deploy to create starter config")
	}
	if _, err := os.Stat(result.ConfigPath); err != nil {
		t.Fatalf("expected config at %q: %v", result.ConfigPath, err)
	}
}

func TestDeployWithClientPrintOnlyDoesNotMutate(t *testing.T) {
	t.Parallel()

	dataDir := filepath.Join(t.TempDir(), "picoclaw")
	fake := &fakeDockerClient{}

	result, err := deployWithClient(context.Background(), fake, Options{
		Mode:      ModeLauncher,
		DataDir:   dataDir,
		PrintOnly: true,
	})
	if err != nil {
		t.Fatalf("deployWithClient() error = %v", err)
	}
	if fake.inspectCalls != 0 || fake.removeCalls != 0 || fake.createCalls != 0 || fake.startCalls != 0 || fake.pullCalls != 0 {
		t.Fatalf("expected print-only deploy not to talk to docker, got inspect=%d remove=%d create=%d start=%d pull=%d", fake.inspectCalls, fake.removeCalls, fake.createCalls, fake.startCalls, fake.pullCalls)
	}
	if _, err := os.Stat(dataDir); !os.IsNotExist(err) {
		t.Fatalf("expected print-only deploy not to create data dir, stat err = %v", err)
	}
	if joined := strings.Join(result.DockerArgs, " "); !strings.Contains(joined, launcherImage) {
		t.Fatalf("expected launcher image in print-only args, got %s", joined)
	}
}

type fakeDockerClient struct {
	inspectErr    error
	inspectResult client.ContainerInspectResult
	removeErr     error
	createErr     error
	startErr      error
	pullErr       error
	pullWaitErr   error

	inspectCalls int
	removeCalls  int
	createCalls  int
	startCalls   int
	pullCalls    int

	createOptions client.ContainerCreateOptions
	inspectName   string
	removeName    string
	startID       string
	pulledImage   string
	createResult  client.ContainerCreateResult
}

func (f *fakeDockerClient) Close() error {
	return nil
}

func (f *fakeDockerClient) ImagePull(_ context.Context, ref string, _ client.ImagePullOptions) (client.ImagePullResponse, error) {
	f.pullCalls++
	f.pulledImage = ref
	if f.pullErr != nil {
		return nil, f.pullErr
	}
	return fakePullResponse{waitErr: f.pullWaitErr}, nil
}

func (f *fakeDockerClient) ContainerInspect(_ context.Context, name string, _ client.ContainerInspectOptions) (client.ContainerInspectResult, error) {
	f.inspectCalls++
	f.inspectName = name
	if f.inspectErr != nil {
		return client.ContainerInspectResult{}, f.inspectErr
	}
	return f.inspectResult, nil
}

func (f *fakeDockerClient) ContainerRemove(_ context.Context, name string, _ client.ContainerRemoveOptions) (client.ContainerRemoveResult, error) {
	f.removeCalls++
	f.removeName = name
	if f.removeErr != nil {
		return client.ContainerRemoveResult{}, f.removeErr
	}
	return client.ContainerRemoveResult{}, nil
}

func (f *fakeDockerClient) ContainerCreate(_ context.Context, options client.ContainerCreateOptions) (client.ContainerCreateResult, error) {
	f.createCalls++
	f.createOptions = options
	if f.createErr != nil {
		return client.ContainerCreateResult{}, f.createErr
	}
	return f.createResult, nil
}

func (f *fakeDockerClient) ContainerStart(_ context.Context, containerID string, _ client.ContainerStartOptions) (client.ContainerStartResult, error) {
	f.startCalls++
	f.startID = containerID
	if f.startErr != nil {
		return client.ContainerStartResult{}, f.startErr
	}
	return client.ContainerStartResult{}, nil
}

type fakePullResponse struct {
	waitErr error
}

func (r fakePullResponse) Read(_ []byte) (int, error) {
	return 0, io.EOF
}

func (r fakePullResponse) Close() error {
	return nil
}

func (r fakePullResponse) JSONMessages(_ context.Context) iter.Seq2[jsonstream.Message, error] {
	return func(yield func(jsonstream.Message, error) bool) {
		if r.waitErr != nil {
			yield(jsonstream.Message{}, r.waitErr)
		}
	}
}

func (r fakePullResponse) Wait(_ context.Context) error {
	return r.waitErr
}
