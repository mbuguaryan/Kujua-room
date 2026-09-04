import type { Participant } from "@/types/room";

type ParticipantsPanelProps = {
  participants: Participant[];
  canModerate: boolean;
  busyUserId?: string;
  onMute?: (userId: string) => void | Promise<void>;
  onRevoke?: (userId: string) => void | Promise<void>;
};

export function ParticipantsPanel({
  participants,
  canModerate,
  busyUserId,
  onMute,
  onRevoke,
}: ParticipantsPanelProps) {
  return (
    <section className="panel-card participant-list">
      <div className="panel-heading">
        <strong>Participants</strong>
        <span>{participants.length}</span>
      </div>
      {participants.map((p) => {
        const speakingAccessActive =
          p.currentRole === "speaker" || p.stageStatus === "ON_STAGE";
        const microphoneControllable =
          p.role !== "audience" || p.stageStatus === "ON_STAGE";

        return (
          <div className="participant-row" key={p.id}>
            <span>{p.name}</span>
            <div>
              {p.local ? <b>You</b> : null}
              {p.role !== "audience" ? <b>{p.role}</b> : null}
              {p.stageStatus === "ON_STAGE" && p.role === "audience" ? (
                <b>Speaker</b>
              ) : null}
              {p.muted ? <b>{p.hostMuted ? "Host muted" : "Muted"}</b> : null}
              {canModerate && !p.local ? (
                <>
                  <button
                    disabled={
                      busyUserId === p.id ||
                      p.muted ||
                      !microphoneControllable
                    }
                    title={
                      microphoneControllable
                        ? "Mute participant"
                        : "Microphone is locked until speaking access is active"
                    }
                    onClick={() =>
                      void Promise.resolve(onMute?.(p.id)).catch(() => undefined)
                    }
                  >
                    Mute
                  </button>
                  {speakingAccessActive ? (
                    <button
                      disabled={busyUserId === p.id}
                      onClick={() =>
                        void Promise.resolve(onRevoke?.(p.id)).catch(
                          () => undefined,
                        )
                      }
                    >
                      Revoke speaker
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
