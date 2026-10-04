import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSubmitLock } from "./useSubmitLock";

function Probe({ task }: { task: () => Promise<void> }) {
  const save = useSubmitLock();
  return (
    <button type="button" onClick={() => void save.run(task)}>
      {save.busy ? "busy" : "go"}
    </button>
  );
}

describe("useSubmitLock", () => {
  it("ignores a second click until the first save finishes", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(
      <Probe
        task={async () => {
          calls += 1;
          await gate;
        }}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(calls).toBe(1);

    await act(async () => {
      release();
      await gate;
    });

    fireEvent.click(screen.getByRole("button"));
    expect(calls).toBe(2);
  });

  it("reuses a key for the same payload and changes it after a successful save", () => {
    function KeyProbe() {
      const save = useSubmitLock();
      const [text, setText] = useState("");
      return (
        <button
          type="button"
          onClick={() => {
            const same = save.key({ amount: "1" });
            const again = save.key({ amount: "1" });
            const edited = save.key({ amount: "2" });
            save.rotate();
            const next = save.key({ amount: "2" });
            setText(`${same === again},${same !== edited},${edited !== next}`);
          }}
        >
          {text || "keys"}
        </button>
      );
    }

    render(<KeyProbe />);
    fireEvent.click(screen.getByRole("button", { name: "keys" }));
    expect(screen.getByRole("button", { name: "true,true,true" })).toBeInTheDocument();
  });
});
