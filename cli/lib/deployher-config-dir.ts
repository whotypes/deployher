import path from "node:path";

const fallbackConfigDir = () => path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".config");

export const getDeployherConfigDir = (): string => {
  const env = (process.env.XDG_CONFIG_HOME ?? "").trim();
  if (env) return path.join(env, "deployher");
  return path.join(fallbackConfigDir(), "deployher");
};
