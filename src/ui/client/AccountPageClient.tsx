import * as React from "react";
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
import { fetchWithCsrf } from "./fetchWithCsrf";

export const AccountWorkspacePreferences = ({
  hasRepoAccess
}: {
  hasRepoAccess: boolean;
}): React.ReactElement => {
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
          Open project after create
        </Label>
        <Checkbox
          id="pref-open-after-create"
          checked={openAfterCreate}
          onCheckedChange={(v) => handleOpenChange(v === true)}
          aria-label="Open project after create"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pref-preferred-branch" className="text-sm font-medium leading-none">
          Preferred branch for new projects
        </Label>
        <Input
          id="pref-preferred-branch"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="main"
          value={branch}
          onChange={(e) => handleBranchChange(e.target.value)}
          onBlur={() => writePreferredBranch(branch)}
          aria-label="Preferred branch for new projects"
        />
        <p className="text-xs text-muted-foreground">
          When you import from GitHub, this branch is selected if it exists.
        </p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Default “new project” tab</legend>
        <p className="text-xs text-muted-foreground">Which tab opens first in the new project dialog.</p>
        <RadioGroup value={createMode} onValueChange={handleCreateModeChange} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="import" id="pref-create-mode-import" />
            <Label htmlFor="pref-create-mode-import" className="cursor-pointer text-sm font-normal">
              Import from GitHub
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="manual" id="pref-create-mode-manual" />
            <Label htmlFor="pref-create-mode-manual" className="cursor-pointer text-sm font-normal">
              Manual URL
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
    </div>
  );
};

export const AccountDeleteSection = (): React.ReactElement => {
  const [pending, setPending] = React.useState(false);

  const handleDelete = async (): Promise<void> => {
    const confirmed = window.confirm(
      "Delete your account and all data permanently? This cannot be undone."
    );
    if (!confirmed) return;
    setPending(true);
    try {
      const response = await fetchWithCsrf("/account/delete", {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      window.location.href = "/login";
    } catch (err) {
      console.error("Failed to delete account:", err);
      window.alert("Failed to delete account. Please try again.");
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Permanently delete your account and all associated data.
      </p>
      <div className="h-px bg-border" />
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        aria-label="Delete account permanently"
        className={pending ? "pointer-events-none opacity-50" : undefined}
        aria-busy={pending ? true : undefined}
        onClick={() => void handleDelete()}
      >
        Delete account
      </Button>
    </div>
  );
};
