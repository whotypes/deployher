export type LogLevel = "quiet" | "normal" | "verbose";

export interface CliContext {
  repoRoot: string;
  infraDir: string;
  composeFile: string;
  garageEnvFile: string;
  backendEnvFile: string;
  bunImage: string;
  garageBucketName: string;
  garageKeyName: string;
  noColor: boolean;
  yes: boolean;
  ci: boolean;
  logLevel: LogLevel;
}

export const EXIT_OK = 0;
export const EXIT_USER_ERROR = 1;
export const EXIT_MISCONFIG = 2;
