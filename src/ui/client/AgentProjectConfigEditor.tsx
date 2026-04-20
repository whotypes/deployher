import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  sanitizeAgentProjectConfigComponents,
  type AgentProjectConfigComponents
} from "@/lib/agentProjectConfig";
import * as React from "react";
import { useTranslation } from "react-i18next";

type AgentConfigDraftKey =
  | "agents"
  | "model_list"
  | "gateway"
  | "channels"
  | "hooks"
  | "tools";

export type AgentProjectConfigDraftState = Record<AgentConfigDraftKey, string>;

const SECTION_KEYS: AgentConfigDraftKey[] = [
  "agents",
  "model_list",
  "gateway",
  "channels",
  "hooks",
  "tools"
];

const formatSection = (value: unknown): string => {
  if (value == null) return "";
  return `${JSON.stringify(value, null, 2)}\n`;
};

export const createAgentProjectConfigDraftState = (
  components: AgentProjectConfigComponents | null | undefined
): AgentProjectConfigDraftState => ({
  agents: formatSection(components?.agents),
  model_list: formatSection(components?.model_list),
  gateway: formatSection(components?.gateway),
  channels: formatSection(components?.channels),
  hooks: formatSection(components?.hooks),
  tools: formatSection(components?.tools)
});

export const parseAgentProjectConfigDraftState = (
  state: AgentProjectConfigDraftState,
  options: { requireModelList?: boolean } = {}
):
  | { ok: true; value: AgentProjectConfigComponents }
  | { ok: false; error: string } => {
  const combined: Record<string, unknown> = {};
  for (const key of SECTION_KEYS) {
    const raw = state[key].trim();
    if (!raw) continue;
    try {
      combined[key] = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, error: `${key} must be valid JSON` };
    }
  }
  return sanitizeAgentProjectConfigComponents(combined, options);
};

export const AgentProjectConfigEditor = ({
  draft,
  onChange,
  disabled = false
}: {
  draft: AgentProjectConfigDraftState;
  onChange: (key: AgentConfigDraftKey, value: string) => void;
  disabled?: boolean;
}): React.ReactElement => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {SECTION_KEYS.map((key) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`agent-config-${key}`}>{t(`agentConfig.sections.${key}.label`)}</Label>
          <Textarea
            id={`agent-config-${key}`}
            className="min-h-32 resize-y font-mono text-xs"
            value={draft[key]}
            disabled={disabled}
            onChange={(event) => onChange(key, event.target.value)}
            placeholder={t(`agentConfig.sections.${key}.placeholder`)}
            aria-describedby={`agent-config-${key}-help`}
          />
          <p id={`agent-config-${key}-help`} className="text-xs text-muted-foreground">
            {t(`agentConfig.sections.${key}.help`)}
          </p>
        </div>
      ))}
    </div>
  );
};
