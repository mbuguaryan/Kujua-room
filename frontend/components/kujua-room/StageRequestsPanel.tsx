export type StageRequestItem = {
  id: string;
  userId: string;
  displayName: string;
  note: string | null;
  requestedAt: string;
};

export function StageRequestsPanel({
  requests,
  busyId,
  onResolve,
}: {
  requests: StageRequestItem[];
  busyId?: string;
  onResolve: (requestId: string, action: "approve" | "decline") => void;
}) {
  if (requests.length === 0) return null;

  return (
    <section className="panel-card participant-list" aria-label="Stage requests">
      <div className="panel-heading">
        <strong>Requests to speak</strong>
        <span>{requests.length}</span>
      </div>
      {requests.map((request) => (
        <div className="participant-row" key={request.id}>
          <div>
            <span>{request.displayName}</span>
            {request.note ? <small>{request.note}</small> : null}
          </div>
          <div>
            <button
              type="button"
              disabled={busyId === request.id}
              onClick={() => onResolve(request.id, "approve")}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === request.id}
              onClick={() => onResolve(request.id, "decline")}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
