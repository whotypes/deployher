import Docker from "dockerode";

const DOCKER_SOCKET_PATH =
  (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";

export const DOCKER_DEPLOYMENT_LABEL_KEY = "io.deployher.deployment";

const PREVIEW_LABEL = "io.deployher.preview=true";
export const PREVIEW_DEPLOYMENT_LABEL_KEY = "io.deployher.preview.deployment";

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

export const removePreviewContainersForDeployment = async (deploymentId: string): Promise<void> => {
  const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });
  const filters = {
    label: [
      PREVIEW_LABEL,
      `${PREVIEW_DEPLOYMENT_LABEL_KEY}=${sanitizeDockerLabelValue(deploymentId)}`
    ]
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
            console.error("Failed to remove preview container during deployment cleanup:", error);
          }
        }
      })
    );
  } catch (error) {
    console.error("Failed to list preview containers during deployment cleanup:", error);
  }
};

export const removeDockerResourcesForDeployment = async (deploymentId: string): Promise<void> => {
  await Promise.all([
    removeBuildContainersForDeployment(deploymentId),
    removePreviewContainersForDeployment(deploymentId)
  ]);
};
