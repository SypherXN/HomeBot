import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MerchantSuggestInput from "./MerchantSuggestInput";

function Harness({ suggestions = ["The Coffee Shop", "Costco", "Coffee Shop"] }: { suggestions?: string[] }) {
  const [value, setValue] = useState("");
  return <MerchantSuggestInput value={value} onChange={setValue} suggestions={suggestions} />;
}

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

it("opens from the first letter and fills the saved merchant with the keyboard", () => {
  render(<Harness />);
  const input = screen.getByRole("combobox", { name: "Merchant" });
  fireEvent.change(input, { target: { value: "c" } });
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Costco", "Coffee Shop", "The Coffee Shop"]);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Coffee Shop" }).id);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue("Coffee Shop");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("accepts mouse selection and still allows a new free-text merchant", () => {
  render(<Harness suggestions={["H-E-B"]} />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "heb" } });
  fireEvent.click(screen.getByRole("option", { name: "H-E-B" }));
  expect(input).toHaveValue("H-E-B");
  fireEvent.change(input, { target: { value: "New merchant" } });
  expect(input).toHaveValue("New merchant");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("shows asynchronously loaded history and keeps selection valid when the list shrinks", () => {
  const { rerender } = render(<Harness suggestions={[]} />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "c" } });
  rerender(<Harness suggestions={["Costco", "Coffee Shop"]} />);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  rerender(<Harness suggestions={["Costco"]} />);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue("Costco");
});
