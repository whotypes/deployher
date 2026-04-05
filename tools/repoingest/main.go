package main

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const githubTokenEnv = "PDPLOY_GITHUB_TOKEN"

var httpClient = &http.Client{Timeout: 5 * time.Minute}

type result struct {
	ExtractedRoot string `json:"extractedRoot"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}

func run() error {
	flags := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	zipURL := flags.String("zip-url", "", "zipball URL to download")
	targetDir := flags.String("target-dir", "", "directory to download and extract into")
	if err := flags.Parse(os.Args[1:]); err != nil {
		return err
	}

	if strings.TrimSpace(*zipURL) == "" {
		return errors.New("missing --zip-url")
	}
	if strings.TrimSpace(*targetDir) == "" {
		return errors.New("missing --target-dir")
	}

	resolvedTargetDir, err := filepath.Abs(*targetDir)
	if err != nil {
		return fmt.Errorf("resolve target dir: %w", err)
	}
	if err := os.MkdirAll(resolvedTargetDir, 0o755); err != nil {
		return fmt.Errorf("create target dir: %w", err)
	}

	zipPath := filepath.Join(resolvedTargetDir, "repo.zip")
	if err := downloadZip(*zipURL, zipPath); err != nil {
		return err
	}
	if err := extractZip(zipPath, resolvedTargetDir); err != nil {
		return err
	}

	extractedRoot, err := detectExtractedRoot(resolvedTargetDir)
	if err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(result{ExtractedRoot: extractedRoot})
}

func downloadZip(zipURL, zipPath string) error {
	request, err := http.NewRequest(http.MethodGet, zipURL, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	request.Header.Set("User-Agent", "vercel-clone-build")
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if token := strings.TrimSpace(os.Getenv(githubTokenEnv)); token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}

	response, err := httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("download zipball: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("github download failed with status %d", response.StatusCode)
	}

	file, err := os.Create(zipPath)
	if err != nil {
		return fmt.Errorf("create zip file: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, response.Body); err != nil {
		return fmt.Errorf("write zip file: %w", err)
	}
	return nil
}

func extractZip(zipPath, targetDir string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer reader.Close()

	for _, file := range reader.File {
		if err := extractFile(file, targetDir); err != nil {
			return err
		}
	}

	return nil
}

func extractFile(file *zip.File, targetDir string) error {
	cleanName := filepath.Clean(file.Name)
	if cleanName == "." || cleanName == string(filepath.Separator) {
		return nil
	}

	destinationPath := filepath.Join(targetDir, cleanName)
	resolvedDestination, err := filepath.Abs(destinationPath)
	if err != nil {
		return fmt.Errorf("resolve extracted path: %w", err)
	}
	if resolvedDestination != targetDir && !strings.HasPrefix(resolvedDestination, targetDir+string(filepath.Separator)) {
		return fmt.Errorf("zip entry escapes target dir: %s", file.Name)
	}

	info := file.FileInfo()
	if info.IsDir() {
		if err := os.MkdirAll(resolvedDestination, 0o755); err != nil {
			return fmt.Errorf("create dir %s: %w", resolvedDestination, err)
		}
		return nil
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("zip entry symlink is not supported: %s", file.Name)
	}

	if err := os.MkdirAll(filepath.Dir(resolvedDestination), 0o755); err != nil {
		return fmt.Errorf("create parent dir: %w", err)
	}

	source, err := file.Open()
	if err != nil {
		return fmt.Errorf("open zip entry %s: %w", file.Name, err)
	}
	defer source.Close()

	destination, err := os.OpenFile(resolvedDestination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return fmt.Errorf("create extracted file %s: %w", resolvedDestination, err)
	}
	defer destination.Close()

	if _, err := io.Copy(destination, source); err != nil {
		return fmt.Errorf("extract file %s: %w", file.Name, err)
	}

	return nil
}

func detectExtractedRoot(targetDir string) (string, error) {
	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return "", fmt.Errorf("read extracted dir: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.Name() == "repo.zip" {
			continue
		}
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	if len(names) == 0 {
		return "", errors.New("extracted archive is empty")
	}

	sort.Strings(names)
	return filepath.Join(targetDir, names[0]), nil
}
