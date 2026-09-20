import { useEffect, useState } from "react";
import { apiFetch } from "./api";

function StaffDashboard({ services = [] }) {
  const [serviceId, setServiceId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueError, setQueueError] = useState("");
  const [currentToken, setCurrentToken] = useState(null);
  const [currentTokenId, setCurrentTokenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteMessage, setPromoteMessage] = useState("");
  const [promoteError, setPromoteError] = useState("");
  const [promoting, setPromoting] = useState(false);

  // Default to the first service once the list has loaded.
  useEffect(() => {
    if (serviceId === null && services.length > 0) {
      setServiceId(services[0].id);
    }
  }, [services, serviceId]);

  const fetchQueue = () => {
    if (!serviceId) return;

    apiFetch(`/api/queue/${serviceId}`)
      .then((data) => {
        setQueue(data.queue || []);
        setQueueError("");
      })
      .catch((error) => {
        console.error("Queue error:", error);
        setQueue([]);
        setQueueError(error.message || "Couldn't load the queue");
      });
  };

  useEffect(() => {
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const callNext = () => {
    if (!serviceId) return;
    setBusy(true);

    apiFetch(`/api/tokens/next/${serviceId}`, { method: "POST" })
      .then((data) => {
        setCurrentToken(data.tokenNumber);
        setCurrentTokenId(data.tokenId);
        fetchQueue();
      })
      .catch((error) => setQueueError(error.message || "Couldn't call the next token"))
      .finally(() => setBusy(false));
  };

  const completeToken = () => {
    if (!currentTokenId) return;
    setBusy(true);

    apiFetch(`/api/tokens/${currentTokenId}/complete`, { method: "POST" })
      .then(() => {
        setCurrentToken(null);
        setCurrentTokenId(null);
        fetchQueue();
      })
      .catch((error) => setQueueError(error.message || "Couldn't complete the token"))
      .finally(() => setBusy(false));
  };

  const skipToken = () => {
    if (!currentTokenId) return;
    setBusy(true);

    apiFetch(`/api/tokens/${currentTokenId}/skip`, { method: "POST" })
      .then(() => {
        setCurrentToken(null);
        setCurrentTokenId(null);
        fetchQueue();
      })
      .catch((error) => setQueueError(error.message || "Couldn't skip the token"))
      .finally(() => setBusy(false));
  };

  const promoteUser = (e) => {
    e.preventDefault();
    setPromoteMessage("");
    setPromoteError("");

    if (!promoteEmail) {
      setPromoteError("Enter the user's email.");
      return;
    }

    setPromoting(true);

    apiFetch("/api/users/promote", {
      method: "POST",
      body: JSON.stringify({ email: promoteEmail }),
    })
      .then((data) => {
        setPromoteMessage(`${data.user.name} (${data.user.email}) is now an ADMIN.`);
        setPromoteEmail("");
      })
      .catch((error) => setPromoteError(error.message || "Couldn't promote that user"))
      .finally(() => setPromoting(false));
  };

  return (
    <div className="staff-dashboard">
      <div className="staff-header">
        <div>
          <h2>Staff dashboard</h2>
          <p>Manage the waiting queue</p>
        </div>

        <div className="staff-controls">
          {services.length > 1 && (
            <select
              className="service-select"
              value={serviceId ?? ""}
              onChange={(e) => setServiceId(Number(e.target.value))}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          )}

          <button className="secondary-button" onClick={fetchQueue}>
            Refresh queue
          </button>
        </div>
      </div>

      {queueError && <div className="form-error">{queueError}</div>}

      {currentToken && (
        <div className="token-card">
          <span className="token-label">Current token</span>
          <div className="token-number">#{currentToken}</div>
          <span className="status-pill status-called">CALLED</span>

          <div style={{ marginTop: "25px" }}>
            <button className="primary-button" onClick={completeToken} disabled={busy} style={{ marginRight: "10px" }}>
              Complete
            </button>
            <button className="secondary-button" onClick={skipToken} disabled={busy}>
              Skip
            </button>
          </div>
        </div>
      )}

      <div className="staff-queue-card">
        <div className="staff-queue-header">
          <div>
            <h3>Waiting queue</h3>
            <p>{queue.length} token(s) waiting</p>
          </div>

          <button className="primary-button" onClick={callNext} disabled={busy || !serviceId}>
            Call next
          </button>
        </div>

        {queue.length === 0 ? (
          <p className="empty-queue">No customers are currently waiting.</p>
        ) : (
          <div className="queue-list">
            {queue.map((token) => (
              <div className="queue-item" key={token.id}>
                <div>
                  <strong>Token #{token.token_number}</strong>
                  <span className={`status-pill status-${token.status.toLowerCase()}`}>
                    {token.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="promote-card">
        <h3>Promote a user to admin</h3>
        <p>Give an existing user access to this Staff dashboard.</p>

        {promoteMessage && <div className="form-success">{promoteMessage}</div>}
        {promoteError && <div className="form-error">{promoteError}</div>}

        <form className="promote-form" onSubmit={promoteUser}>
          <input
            type="email"
            placeholder="user@example.com"
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
          />
          <button className="primary-button" type="submit" disabled={promoting}>
            {promoting ? "Promoting…" : "Make admin"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default StaffDashboard;
