import Login from "./login";
import Register from "./Register";
import "./style.css";
import { io } from "socket.io-client";
import { useEffect, useState } from "react";
import StaffDashboard from "./StaffDashboard";
import { apiFetch, API_BASE } from "./api";

function App() {
  const [services, setServices] = useState([]);
  const [servicesError, setServicesError] = useState("");
  const [selectedService, setSelectedService] = useState(null);
  const [tokenNumber, setTokenNumber] = useState(null);
  const [tokenId, setTokenId] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [authView, setAuthView] = useState("login");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });

  // Fetch services
  useEffect(() => {
    apiFetch("/api/services")
      .then((data) => setServices(data))
      .catch((error) => {
        console.error("Services error:", error);
        setServicesError("Couldn't load services. Is the backend running?");
      });
  }, []);

  // Socket connection — keeps the customer's token card live-updated
  useEffect(() => {
    const socket = io(API_BASE);

    socket.on("token-called", (data) => {
      if (data.tokenId === tokenId) {
        setTrackingData((previous) => ({
          ...previous,
          token: { ...previous?.token, status: "CALLED" },
        }));
      }
    });

    socket.on("token-completed", (data) => {
      if (data.tokenId === tokenId) {
        setTrackingData((previous) => ({
          ...previous,
          token: { ...previous?.token, status: "COMPLETED" },
        }));
      }
    });

    socket.on("token-skipped", (data) => {
      if (data.tokenId === tokenId) {
        setTrackingData((previous) => ({
          ...previous,
          token: { ...previous?.token, status: "SKIPPED" },
        }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [tokenId]);

  const getToken = () => {
    if (!selectedService) return;
    setRequesting(true);

    apiFetch("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ serviceId: selectedService.id }),
    })
      .then((data) => {
        setTokenNumber(data.tokenNumber);
        setTokenId(data.tokenId);
        setTrackingData(null);
      })
      .catch((error) => console.error("Token error:", error))
      .finally(() => setRequesting(false));
  };

  const trackToken = () => {
    if (!tokenId) return;

    apiFetch(`/api/tokens/${tokenId}`)
      .then((data) => setTrackingData(data))
      .catch((error) => console.error("Tracking error:", error));
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  if (!user) {
    return authView === "register" ? (
      <Register onLogin={setUser} onSwitchToLogin={() => setAuthView("login")} />
    ) : (
      <Login onLogin={setUser} onSwitchToRegister={() => setAuthView("register")} />
    );
  }

  const status = trackingData?.token?.status || (tokenNumber !== null ? "WAITING" : null);

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="logo">
          <span className="logo-mark">SQ</span>
          SmartQueue
        </div>

        <div className="navbar-right">
          <span className="navbar-user">{user.name}</span>
          <button className="logout-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </nav>

      <main className="container">
        <div className="welcome">
          <h1>Welcome, {user.name}</h1>
          <p>Manage your queue and track your token in real time.</p>
        </div>

        {tokenNumber !== null && (
          <div className="token-card">
            <span className="token-label">Your token</span>

            <div className="token-number">#{tokenNumber}</div>

            <span className={`status-pill status-${status?.toLowerCase()}`}>
              {status}
            </span>

            <div className="token-info">
              <div>
                <span>Service</span>
                <span>{selectedService?.name || "Service"}</span>
              </div>
              <div>
                <span>People ahead</span>
                <span>{trackingData?.peopleAhead ?? "—"}</span>
              </div>
              <div>
                <span>Status</span>
                <span>{status}</span>
              </div>
            </div>

            <button className="secondary-button" onClick={trackToken} style={{ marginTop: "20px" }}>
              Refresh status
            </button>
          </div>
        )}

        <h2 className="section-title">Available services</h2>

        {servicesError && <div className="form-error">{servicesError}</div>}

        {!servicesError && services.length === 0 && (
          <p className="empty-queue">No services are set up yet.</p>
        )}

        <div className="services-grid">
          {services.map((service) => (
            <div
              className={`service-card${selectedService?.id === service.id ? " service-card-active" : ""}`}
              key={service.id}
            >
              <h3>{service.name}</h3>
              <p>Estimated duration: {service.duration} minutes</p>

              <button className="primary-button" onClick={() => setSelectedService(service)}>
                Select service
              </button>
            </div>
          ))}
        </div>

        {selectedService && (
          <div className="service-card selected-service" style={{ marginTop: "25px" }}>
            <h3>Selected service</h3>
            <p>{selectedService.name}</p>
            <p>Duration: {selectedService.duration} minutes</p>

            <button className="primary-button" onClick={getToken} disabled={requesting}>
              {requesting ? "Getting token…" : "Get token"}
            </button>
          </div>
        )}

        {user.role === "ADMIN" && <StaffDashboard services={services} />}
      </main>
    </div>
  );
}

export default App;
