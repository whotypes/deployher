import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  readOpenAfterCreate,
  readPreferredBranch,
  readProjectsCreateModeInitial,
  writeCreateModePref,
  writeOpenAfterCreate,
  writePreferredBranch,
  type CreateModePref
} from "@/lib/userUiPrefs";
import { useNavigate } from "@/spa/routerCompat";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { GitHubMark } from "../GitHubMark";

export const AccountAvatarPicker = ({
  image,
  name,
  email
}: {
  image: string | null;
  name: string | null;
  email: string;
}): React.ReactElement => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [preview, setPreview] = React.useState<string | null>(image);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleFile = async (file: File | null): Promise<void> => {
    if (!file) return;
    setError("");
    setPreview(URL.createObjectURL(file));
    setPending(true);
    try {
      const response = await fetchWithCsrf("/api/avatar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
      });
      const data = (await response.json().catch(() => ({}))) as { image?: string; error?: string };
      if (!response.ok || !data.image) {
        throw new Error(data.error || "Could not save profile photo.");
      }
      setPreview(data.image);
      void queryClient.invalidateQueries({ queryKey: ["workspace-shell"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile photo.");
      setPreview(image);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
        {preview ? (
          <img src={preview} alt="" width={64} height={64} className="size-full object-cover" />
        ) : (
          <Camera className="size-6 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{name ?? email}</p>
        {name ? <p className="text-sm text-muted-foreground">{email}</p> : null}
        {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? "Saving..." : "Change photo"}
          </Button>
          {preview ? (
            <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => setPreview(null)} aria-label="Clear preview">
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
};

export const ConnectGitHubButton = ({ callbackURL }: { callbackURL: string }): React.ReactElement => {
  const [pending, setPending] = React.useState(false);

  const connect = async (): Promise<void> => {
    setPending(true);
    try {
      const response = await fetch("/api/auth/link-social", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "github", callbackURL })
      });
      if (response.redirected) {
        window.location.href = response.url;
        return;
      }
      const loc = response.headers.get("Location");
      if (loc) {
        window.location.href = loc;
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => void connect()}>
      <GitHubMark className="mr-2 size-4" />
      {pending ? "Connecting..." : "Connect GitHub"}
    </Button>
  );
};

export const AccountWorkspacePreferences = ({
  hasRepoAccess
}: {
  hasRepoAccess: boolean;
}): React.ReactElement => {
  const { t } = useTranslation();
  const [openAfterCreate, setOpenAfterCreate] = React.useState(() => readOpenAfterCreate());
  const [branch, setBranch] = React.useState(() => readPreferredBranch());
  const [createMode, setCreateMode] = React.useState<CreateModePref>(() =>
    readProjectsCreateModeInitial(hasRepoAccess)
  );

  const handleOpenChange = (checked: boolean): void => {
    setOpenAfterCreate(checked);
    writeOpenAfterCreate(checked);
  };

  const handleBranchChange = (value: string): void => {
    setBranch(value);
  };

  const handleCreateModeChange = (value: string): void => {
    const next: CreateModePref = value === "manual" ? "manual" : "import";
    setCreateMode(next);
    writeCreateModePref(next);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="pref-open-after-create" className="text-sm font-normal leading-none">
          {t("account.openAfterCreate")}
        </Label>
        <Checkbox
          id="pref-open-after-create"
          checked={openAfterCreate}
          onCheckedChange={(v) => handleOpenChange(v === true)}
          aria-label={t("account.openAfterCreateAria")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pref-preferred-branch" className="text-sm font-medium leading-none">
          {t("account.preferredBranch")}
        </Label>
        <Input
          id="pref-preferred-branch"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("newProject.placeholderBranch")}
          value={branch}
          onChange={(e) => handleBranchChange(e.target.value)}
          onBlur={() => writePreferredBranch(branch)}
          aria-label={t("account.preferredBranch")}
        />
        <p className="text-xs text-muted-foreground">{t("account.preferredBranchHint")}</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("account.defaultNewProjectTab")}</legend>
        <p className="text-xs text-muted-foreground">{t("account.defaultNewProjectTabHint")}</p>
        <RadioGroup value={createMode} onValueChange={handleCreateModeChange} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="import" id="pref-create-mode-import" />
            <Label htmlFor="pref-create-mode-import" className="cursor-pointer text-sm font-normal">
              {t("account.importFromGithub")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="manual" id="pref-create-mode-manual" />
            <Label htmlFor="pref-create-mode-manual" className="cursor-pointer text-sm font-normal">
              {t("account.manualUrl")}
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
    </div>
  );
};

export const AccountDeleteSection = (): React.ReactElement => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pending, setPending] = React.useState(false);

  const handleDelete = async (): Promise<void> => {
    const confirmed = window.confirm(t("account.deleteConfirm"));
    if (!confirmed) return;
    setPending(true);
    try {
      const response = await fetchWithCsrf("/account/delete", {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error(t("account.deleteRequestFailed", { status: String(response.status) }));
      }
      navigate("/login");
    } catch (err) {
      console.error("Failed to delete account:", err);
      window.alert(t("account.deleteFailed"));
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("account.deleteIntro")}</p>
      <div className="h-px bg-border" />
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        aria-label={t("account.deleteAccountAria")}
        className={pending ? "pointer-events-none opacity-50" : undefined}
        aria-busy={pending ? true : undefined}
        onClick={() => void handleDelete()}
      >
        {t("account.deleteAccount")}
      </Button>
    </div>
  );
};
