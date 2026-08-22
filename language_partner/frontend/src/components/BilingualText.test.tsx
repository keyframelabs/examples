import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { BilingualText } from "@/components/BilingualText";

const segments = [
  { spanish: "Buenos días", english: "Good morning" },
  { spanish: "señora", english: "ma'am" }
];

it("highlights spoken Spanish and shows English only when enabled", () => {
  const selection = vi.fn();
  const props = {
    highlightedCharacters: 3,
    onSelectionChange: selection,
    ownerId: "message-1",
    segments,
    selection: null,
    showEnglish: false
  };
  const view = render(<BilingualText {...props} />);
  expect(view.container.querySelector("mark")?.textContent).toBe("Buenos");
  expect(view.queryByText("Good morning")).toBeNull();
  view.rerender(<BilingualText {...props} showEnglish />);
  expect(view.getByText("Good morning")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: /^Spanish: Buenos días/ }));
  expect(selection).toHaveBeenCalledWith({ ownerId: "message-1", index: 0 });
});

it("shows partial guided-script progress in blue and completed text in green", () => {
  const view = render(
    <BilingualText
      highlightedCharacters={6}
      karaokeVariant="guided-script"
      onSelectionChange={vi.fn()}
      ownerId="guided-coach"
      segments={[{ spanish: "Buenos días", english: "Good morning" }]}
      selection={null}
      showEnglish={false}
    />
  );

  expect(view.container.querySelector(".text-blue-600")?.textContent).toBe("Buenos");
  view.rerender(
    <BilingualText
      highlightedCharacters={10}
      karaokeComplete
      karaokeVariant="guided-script"
      onSelectionChange={vi.fn()}
      ownerId="guided-coach"
      segments={[{ spanish: "Buenos días", english: "Good morning" }]}
      selection={null}
      showEnglish={false}
    />
  );
  expect(view.container.querySelector(".text-green-700")?.textContent).toBe("Buenos días");
  expect(view.container.querySelector(".text-blue-600")).toBeNull();
});
