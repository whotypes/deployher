import Docker from "dockerode";

const DOCKER_SOCKET_PATH =
  (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";

export const DOCKER_DEPLOYMENT_LABEL_KEY = "io.deployher.deployment";

export const sanitizeDockerLabelValue = (value: string): string =>
  value.replace(/[^A-Za-z0-9_.-]/g, "_");

const isBenignDockerRemoveError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /No such container/i.test(message) ||
    /removal of container .* is already in progress/i.test(message)
  );
};

export const removeBuildContainersForDeployment = async (deploymentId: string): Promise<void> => {
  const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });
  const filters = {
    label: [`${DOCKER_DEPLOYMENT_LABEL_KEY}=${sanitizeDockerLabelValue(deploymentId)}`]
  };
  try {
    const containers = await docker.listContainers({ all: true, filters });
    await Promise.all(
      containers.map(async (c) => {
        if (!c.Id) return;
        try {
          await docker.getContainer(c.Id).remove({ force: true });
        } catch (error) {
          if (!isBenignDockerRemoveError(error)) {
            console.error("Failed to remove build container during cancel cleanup:", error);
          }
        }
      })
    );
  } catch (error) {
    console.error("Failed to list build containers during cancel cleanup:", error);
  }
};
