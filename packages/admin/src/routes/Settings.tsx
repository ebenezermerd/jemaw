import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AppConfigDto, UpdateConfigInput } from "@jemaw/shared/types";
import { Card, PrimaryButton, CenteredMessage } from "../ui/primitives.js";

export function Settings() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<AppConfigDto[]>("/api/admin/config"),
  });

  const save = useMutation({
    mutationFn: (input: UpdateConfigInput) => api.patch("/api/admin/config", input),
    onSuccess: () => {
      setKey("");
      setValue("");
      qc.invalidateQueries({ queryKey: ["config"] });
    },
  });

  function onSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
      setParseError(null);
    } catch {
      setParseError("Value must be valid JSON (use quotes for strings).");
      return;
    }
    save.mutate({ key: key.trim(), value: parsed });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16 }}>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Set configuration</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key (e.g. feature.ai_scan)" style={inputStyle} />
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'JSON value, e.g. true or "europe-west1"'}
            rows={4}
            style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical" }}
          />
          {parseError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{parseError}</div>}
          <PrimaryButton onClick={onSave} disabled={key.trim().length === 0 || save.isPending}>
            Save setting
          </PrimaryButton>
          <div style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.5 }}>
            Settings are stored in app_config and may be read by the bot. Use feature flags
            (boolean) or tunables. The admin allowlist lives under the key <code>admins</code>.
          </div>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: "20px 20px 12px" }}>Current configuration</div>
        {isLoading && <CenteredMessage>Loading…</CenteredMessage>}
        {data?.map((c) => (
          <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent-soft)", minWidth: 140 }}>{c.key}</code>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)", flex: 1, wordBreak: "break-all" }}>
              {JSON.stringify(c.value)}
            </code>
          </div>
        ))}
        {data && data.length === 0 && <CenteredMessage>No configuration set.</CenteredMessage>}
      </Card>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--bg-panel)",
  border: "1px solid var(--hairline-2)",
  borderRadius: 10,
  padding: "11px 13px",
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
} as const;
