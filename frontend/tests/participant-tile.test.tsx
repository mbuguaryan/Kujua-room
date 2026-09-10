import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParticipantTile } from "@/components/kujua-room/ParticipantTile";
describe("ParticipantTile", () => {
  it("renders malicious display names literally", () => {
    const name = '<img src=x onerror="alert(1)">';
    const { container, getByText } = render(
      <ParticipantTile
        participant={{
          id: "one",
          name,
          role: "audience",
          muted: true,
          handRaised: false,
          speaking: false,
        }}
      />,
    );
    expect(getByText(name)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
  it("keeps duplicate names as separate UUID tiles", () => {
    const { getAllByText } = render(
      <>
        <ParticipantTile
          participant={{
            id: "one",
            name: "John",
            role: "audience",
            muted: true,
            handRaised: false,
            speaking: false,
          }}
        />
        <ParticipantTile
          participant={{
            id: "two",
            name: "John",
            role: "speaker",
            muted: false,
            handRaised: false,
            speaking: false,
          }}
        />
      </>,
    );
    expect(getAllByText("John")).toHaveLength(2);
  });
});
