import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import SharePersonSelect from "./SharePersonSelect";

const roster: DiscordGuildRosterState = {
  loading: false,
  error: null,
  data: {
    available: true,
    reason: null,
    guildId: "g",
    members: [{ userId: "1", username: "sypher", displayName: "Matt" }],
  },
};

function SelectHarness({
  onChange,
}: {
  onChange: (userId: string, label: string) => void;
}) {
  const [label, setLabel] = useState("");
  return (
    <SharePersonSelect
      roster={roster}
      guests={[]}
      label={label}
      onChange={(userId, next) => {
        setLabel(next);
        onChange(userId, next);
      }}
    />
  );
}

describe("SharePersonSelect", () => {
  afterEach(() => cleanup());

  it("accepts a typed name that is not in the household", () => {
    const onChange = vi.fn();
    render(<SelectHarness onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Jordan" } });
    expect(onChange).toHaveBeenLastCalledWith("", "Jordan");
    expect(screen.getByRole("option", { name: /jordan/i })).toBeInTheDocument();
    expect(screen.getByText("Not in household")).toBeInTheDocument();
  });

  it("binds a household member when their name is chosen", () => {
    const onChange = vi.fn();
    render(<SelectHarness onChange={onChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /sypher/i }));
    expect(onChange).toHaveBeenLastCalledWith("1", "sypher");
  });
});
