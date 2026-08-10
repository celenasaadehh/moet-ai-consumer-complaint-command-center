import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Eye,
  Filter,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { api } from "./api.js";
import "./styles.css";

const provinces = [
  "Beirut",
  "Mount Lebanon",
  "North Lebanon",
  "Bekaa",
  "South Lebanon",
];

const complaintTypes = [
  { label: "Food Safety", value: "food_safety" },
  { label: "Hygiene", value: "hygiene" },
  { label: "Price Fraud", value: "price_fraud" },
  { label: "Licensing", value: "licensing" },
  { label: "Service Quality", value: "service_quality" },
];

const employees = [
  { username: "admin", password: "admin123", name: "Admin" },
  { username: "karl", password: "1234", name: "Karl" },
  { username: "inspector", password: "inspect123", name: "Inspector" },
];

const inspectors = [
  "Maya Haddad",
  "Karim Mansour",
  "Nour Khoury",
  "Ali Farhat",
  "Sara Aoun",
];

const statusSteps = [
  "received",
  "assigned",
  "sent_to_inspector",
  "inspection_started",
  "resolved",
];

const statusLabels = {
  received: "Received",
  assigned: "Assigned inspector",
  sent_to_inspector: "Sent to inspector",
  inspection_started: "Inspection started",
  resolved: "Resolved",
};

const categoryLabels = {
  food_safety: "Food safety",
  hygiene: "Hygiene",
  price_fraud: "Price fraud",
  licensing: "Licensing",
  service_quality: "Service quality",
};

const priorityRank = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const mapPoints = {
  Beirut: { x: 31, y: 43 },
  "Mount Lebanon": { x: 41, y: 45 },
  "North Lebanon": { x: 47, y: 18 },
  Bekaa: { x: 65, y: 38 },
  "South Lebanon": { x: 34, y: 76 },
};

function normalizeStatus(status) {
  if (!status) return "received";
  if (status === "New") return "received";
  if (status === "not_assigned") return "received";
  if (status === "under_review") return "inspection_started";
  return status;
}

function normalizeProvince(value) {
  if (!value) return "Beirut";
  const clean = String(value).trim();

  if (clean === "North") return "North Lebanon";
  if (clean === "South") return "South Lebanon";
  if (clean === "Nabatieh") return "South Lebanon";
  if (clean === "Nabatiyeh") return "South Lebanon";
  if (clean === "Beqaa") return "Bekaa";

  return clean;
}

function normalizePriority(value, score) {
  if (value) {
    const upper = String(value).toUpperCase();
    if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(upper)) return upper;
  }

  const n = Number(score || 0);

  if (n >= 90) return "CRITICAL";
  if (n >= 70) return "HIGH";
  if (n >= 40) return "MEDIUM";
  return "LOW";
}

function isToday(dateValue) {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function hasPriorityMismatch(complaint) {
  const citizen = String(
    complaint.originalPriority || complaint.priority || ""
  ).toUpperCase();

  const ai = normalizePriority(
    complaint.priorityCategory,
    complaint.priorityScore || complaint.triageScore
  );

  if (!citizen || !["LOW", "MEDIUM", "HIGH"].includes(citizen)) return false;

  return citizen !== ai && !(citizen === "HIGH" && ai === "CRITICAL");
}

function App() {
  const [portal, setPortal] = useState("");

  if (!portal) return <PortalChoice onChoose={setPortal} />;

  if (portal === "customer") {
    return <CustomerPortal onBack={() => setPortal("")} />;
  }

  return <EmployeeGate onBack={() => setPortal("")} />;
}

function PortalChoice({ onChoose }) {
  return (
    <main className="portal-screen">
      <section className="portal-card">
        <div className="logo">MOET</div>
        <h1>Digital Command Center</h1>
        <p>Choose how you want to enter the system.</p>

        <div className="portal-options">
          <button className="portal-option" onClick={() => onChoose("customer")}>
            <Send size={30} />
            <strong>Customer Portal</strong>
            <span>Submit a consumer complaint</span>
          </button>

          <button className="portal-option" onClick={() => onChoose("employee")}>
            <LayoutDashboard size={30} />
            <strong>Employee Portal</strong>
            <span>Open supervisor dashboard</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function CustomerPortal({ onBack }) {
  const [establishments, setEstablishments] = useState([]);
  const [form, setForm] = useState({
    email: "",
    telephone: "",
    purchaseDate: "",
    province: "Beirut",
    purchasePlace: "",
    subject: "food_safety",
    message: "",
    citizenPriority: "Medium",
  });

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function loadEstablishments() {
    try {
      const data = await api.listEstablishments();
      setEstablishments(data);

      const first = data.find((e) => normalizeProvince(e.province) === "Beirut");

      if (first) {
        setForm((prev) => ({
          ...prev,
          purchasePlace: first.name,
        }));
      }
    } catch (err) {
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    loadEstablishments();
  }, []);

  const filteredEstablishments = useMemo(() => {
    return establishments.filter(
      (e) => normalizeProvince(e.province) === form.province
    );
  }, [establishments, form.province]);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeProvince(value) {
    const firstInProvince = establishments.find(
      (e) => normalizeProvince(e.province) === value
    );

    setForm((prev) => ({
      ...prev,
      province: value,
      purchasePlace: firstInProvince ? firstInProvince.name : "",
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setSuccess("");
    setError("");

    try {
      await api.createComplaint(form);

      setSuccess("Complaint submitted successfully. The ministry team will review it.");

      const firstBeirut =
        establishments.find((e) => normalizeProvince(e.province) === "Beirut")
          ?.name || "";

      setForm({
        email: "",
        telephone: "",
        purchaseDate: "",
        province: "Beirut",
        purchasePlace: firstBeirut,
        subject: "food_safety",
        message: "",
        citizenPriority: "Medium",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="customer-page">
      <header className="simple-header">
        <div className="brand-row">
          <div className="logo small">MOET</div>
          <div>
            <strong>Customer Portal</strong>
            <span>Submit a consumer complaint</span>
          </div>
        </div>

        <button onClick={onBack}>Back</button>
      </header>

      <section className="customer-layout">
        <div className="customer-info-card">
          <p className="eyebrow">Complaint intake</p>
          <h1>Submit your complaint</h1>
          <p>
            Fill the complaint form. The ML triage engine will classify it and
            send the result to the employee dashboard.
          </p>
        </div>

        <div className="card">
          <h2>Complaint details</h2>

          {loadError && <div className="error-box">{loadError}</div>}

          <form onSubmit={submit} className="form">
            <label>
              Email *
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="citizen@email.com"
                required
              />
            </label>
            <label>
              Name *
              <input
                required
              />
            </label>

            <label>
              Telephone *
              <input
                value={form.telephone}
                onChange={(e) => update("telephone", e.target.value)}
                placeholder="+961 3 123456"
                required
              />
            </label>

            <label>
              Purchase date
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => update("purchaseDate", e.target.value)}
              />
            </label>

            <label>
              Province
              <select
                value={form.province}
                onChange={(e) => changeProvince(e.target.value)}
              >
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Establishment name
              <select
                value={form.purchasePlace}
                onChange={(e) => update("purchasePlace", e.target.value)}
                required
              >
                <option value="">Select establishment</option>
                {filteredEstablishments.map((est) => (
                  <option key={est.id} value={est.name}>
                    {est.name}
                  </option>
                ))}
              </select>
            </label>


            <label>
              Message *
              <textarea
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
                placeholder="Describe what happened..."
                required
              />
            </label>

            <label>
              Citizen priority
              <select
                value={form.citizenPriority}
                onChange={(e) => update("citizenPriority", e.target.value)}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>

            <button className="primary" disabled={loading}>
              {loading ? "Submitting..." : "Submit complaint"}
            </button>
          </form>

          {success && <div className="success-box">{success}</div>}
          {error && <div className="error-box">{error}</div>}
        </div>
      </section>
    </main>
  );
}

function EmployeeGate({ onBack }) {
  const savedEmployee = JSON.parse(localStorage.getItem("employeeUser") || "null");

  const [employee, setEmployee] = useState(savedEmployee);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  function login(e) {
    e.preventDefault();
    setLoginError("");

    const found = employees.find(
      (emp) =>
        emp.username.toLowerCase() === username.trim().toLowerCase() &&
        emp.password === password
    );

    if (!found) {
      setLoginError("Wrong username or password.");
      return;
    }

    localStorage.setItem("employeeUser", JSON.stringify(found));
    setEmployee(found);
  }

  function logout() {
    localStorage.removeItem("employeeUser");
    setEmployee(null);
    setUsername("");
    setPassword("");
  }

  if (!employee) {
    return (
      <main className="portal-screen">
        <section className="portal-card">
          <div className="logo">MOET</div>
          <h1>Employee Login</h1>
          <p>Enter your username and password to open the supervisor dashboard.</p>

          <form onSubmit={login} className="login-form">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />

            <button className="primary">
              <UserRound size={18} />
              Login
            </button>

            <button type="button" onClick={onBack}>
              Back
            </button>
          </form>

          {loginError && <div className="error-box">{loginError}</div>}

          <div className="demo-login-box">
            <strong>Demo logins</strong>
            <span>admin / admin123</span>
            <span>karl / 1234</span>
            <span>inspector / inspect123</span>
          </div>
        </section>
      </main>
    );
  }

  return <EmployeeDashboard employeeName={employee.name} logout={logout} />;
}

function EmployeeDashboard({ employeeName, logout }) {
  const [page, setPage] = useState("dashboard");
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadComplaints() {
    setLoading(true);
    setError("");

    try {
      const data = await api.listComplaints();

      const clean = data.map((c) => ({
        ...c,
        province: normalizeProvince(c.province),
        status: normalizeStatus(c.status),
        priorityCategory: normalizePriority(
          c.priorityCategory,
          c.priorityScore || c.triageScore
        ),
      }));

      clean.sort((a, b) => {
        return (
          priorityRank[b.priorityCategory] - priorityRank[a.priorityCategory] ||
          Number(b.priorityScore || b.triageScore || 0) -
            Number(a.priorityScore || a.triageScore || 0)
        );
      });

      setComplaints(clean);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComplaints();
  }, []);

  async function updateComplaint(id, payload) {
    const updated = await api.updateComplaint(id, {
      ...payload,
      assignedBy: employeeName,
    });

    const cleanUpdated = {
      ...updated,
      province: normalizeProvince(updated.province),
      status: normalizeStatus(updated.status),
      priorityCategory: normalizePriority(
        updated.priorityCategory,
        updated.priorityScore || updated.triageScore
      ),
    };

    setComplaints((prev) =>
      prev.map((c) => (c.id === id ? cleanUpdated : c))
    );

    setSelectedComplaint((prev) =>
      prev && prev.id === id ? cleanUpdated : prev
    );
  }

  const todayComplaints = useMemo(() => {
    return complaints.filter((c) => isToday(c.createdAt));
  }, [complaints]);

  const stats = useMemo(() => {
    return {
      totalToday: todayComplaints.length,
      totalAll: complaints.length,
      waiting: todayComplaints.filter((c) => !c.assignedTo).length,
      critical: todayComplaints.filter((c) => c.priorityCategory === "CRITICAL")
        .length,
      high: todayComplaints.filter((c) => c.priorityCategory === "HIGH").length,
      mismatch: todayComplaints.filter(hasPriorityMismatch).length,
      resolved: todayComplaints.filter((c) => c.status === "resolved").length,
    };
  }, [todayComplaints, complaints]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo small">MOET</div>
          <div>
            <strong>Command Center</strong>
            <span>Supervisor dashboard</span>
          </div>
        </div>

        <SideButton
          active={page === "dashboard"}
          icon={<LayoutDashboard size={18} />}
          label="Dashboard"
          onClick={() => setPage("dashboard")}
        />

        <SideButton
          active={page === "complaints"}
          icon={<ClipboardList size={18} />}
          label="Complaints"
          onClick={() => setPage("complaints")}
        />

        <SideButton
          active={page === "status"}
          icon={<ListChecks size={18} />}
          label="Status"
          onClick={() => setPage("status")}
        />

        <SideButton
          active={page === "map"}
          icon={<MapPin size={18} />}
          label="Heat map"
          onClick={() => setPage("map")}
        />

        <SideButton
          active={page === "charts"}
          icon={<BarChart3 size={18} />}
          label="Charts"
          onClick={() => setPage("charts")}
        />

        <div className="sidebar-user">
          <span>Employee</span>
          <strong>{employeeName}</strong>
          <button onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="content">
        <header className="top-header">
          <div>
            <p className="eyebrow">Employee portal</p>
            <h1>Good morning, {employeeName}</h1>
            <p>
              ML triage handles category and priority.
            </p>
          </div>

          <button onClick={loadComplaints}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="error-box">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <section className="card">Loading dashboard...</section>
        ) : (
          <>
            {page === "dashboard" && (
              <>
                <MorningSummary
                  employeeName={employeeName}
                  stats={stats}
                  complaints={todayComplaints}
                />

                <Stats stats={stats} />

                <section className="grid-two">
                  <HeatMap complaints={todayComplaints} compact />
                  <Charts complaints={todayComplaints} compact />
                </section>

                <ComplaintQueue
                  title="Today’s priority queue"
                  complaints={todayComplaints}
                  onUpdate={updateComplaint}
                  onOpen={setSelectedComplaint}
                  limit={5}
                  showFilters={false}
                />
              </>
            )}

            {page === "complaints" && (
              <ComplaintQueue
                title="All triaged complaints"
                complaints={complaints}
                onUpdate={updateComplaint}
                onOpen={setSelectedComplaint}
                showFilters
              />
            )}

            {page === "status" && (
              <StatusBoard
                complaints={complaints}
                onUpdate={updateComplaint}
                onOpen={setSelectedComplaint}
              />
            )}

            {page === "map" && <HeatMap complaints={todayComplaints} />}

            {page === "charts" && <Charts complaints={todayComplaints} />}
          </>
        )}
      </main>

      {selectedComplaint && (
        <ComplaintModal
          complaint={selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
          onUpdate={updateComplaint}
        />
      )}
    </div>
  );
}

function SideButton({ active, icon, label, onClick }) {
  return (
    <button className={active ? "side-button active" : "side-button"} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function MorningSummary({ employeeName, stats, complaints }) {
  const latest = complaints[0];

  return (
    <section className="morning-card">
      <div>
        <p className="eyebrow">Daily summary</p>
        <h2>Good morning, {employeeName}. Here is what we have for today.</h2>

        <p>
          Today we received <b>{stats.totalToday}</b> complaints.{" "}
          <b>{stats.critical}</b> are critical, <b>{stats.high}</b> are high priority,{" "}
          <b>{stats.waiting}</b> are waiting for assignment, and{" "}
          <b>{stats.resolved}</b> are resolved.
        </p>

        {stats.mismatch > 0 && (
          <p className="warning-line">
            ⚠ {stats.mismatch} priority mismatch detected between citizen priority
            and ML priority.
          </p>
        )}

        {latest && (
          <p>
            Latest update: <b>{latest.purchasePlace}</b> in{" "}
            <b>{latest.province}</b> was triaged as{" "}
            <b>{latest.priorityCategory}</b>.
          </p>
        )}
      </div>

      <div className="summary-number">
        <span>{new Date().toLocaleDateString()}</span>
        <strong>{stats.totalToday}</strong>
        <small>Today’s complaints</small>
      </div>
    </section>
  );
}

function Stats({ stats }) {
  return (
    <section className="stats-grid">
      <Stat title="Today" value={stats.totalToday} />
      <Stat title="Critical" value={stats.critical} danger />
      <Stat title="High" value={stats.high} danger />
      <Stat title="Waiting" value={stats.waiting} />
      <Stat title="Mismatch" value={stats.mismatch} warning />
      <Stat title="Resolved" value={stats.resolved} success />
    </section>
  );
}

function Stat({ title, value, danger, warning, success }) {
  return (
    <div
      className={`stat ${danger ? "danger" : ""} ${warning ? "warning-stat" : ""} ${
        success ? "success-stat" : ""
      }`}
    >
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBoard({ complaints, onUpdate, onOpen }) {
  const groups = statusSteps.map((status) => ({
    status,
    label: statusLabels[status],
    complaints: complaints.filter((c) => normalizeStatus(c.status) === status),
  }));

  return (
    <section className="status-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">Complaint status</p>
          <h2>Status board</h2>
        </div>
      </div>

      <div className="status-columns">
        {groups.map((group) => (
          <div className="status-column" key={group.status}>
            <div className="status-column-head">
              <strong>{group.label}</strong>
              <span>{group.complaints.length}</span>
            </div>

            <div className="status-column-list">
              {group.complaints.length === 0 && (
                <p className="empty small-empty">No complaints</p>
              )}

              {group.complaints.map((complaint) => (
                <div className="mini-status-card" key={complaint.id}>
                  <strong>{complaint.purchasePlace}</strong>
                  <span>
                    {complaint.province} • {complaint.priorityCategory}
                  </span>

                  <button onClick={() => onOpen(complaint)}>Open</button>

                  <select
                    value={normalizeStatus(complaint.status)}
                    onChange={(e) =>
                      onUpdate(complaint.id, { status: e.target.value })
                    }
                  >
                    {statusSteps.map((step) => (
                      <option key={step} value={step}>
                        {statusLabels[step]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComplaintQueue({
  title,
  complaints,
  onUpdate,
  onOpen,
  limit,
  showFilters = true,
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = complaints
    .filter((c) => {
      if (!showFilters) return true;
      const text = `${c.subject} ${c.purchasePlace} ${c.message} ${c.email}`.toLowerCase();
      return text.includes(search.toLowerCase());
    })
    .filter((c) => priorityFilter === "all" || c.priorityCategory === priorityFilter)
    .filter((c) => provinceFilter === "all" || c.province === provinceFilter)
    .filter((c) => categoryFilter === "all" || c.category === categoryFilter || c.subject === categoryFilter)
    .filter((c) => zoneFilter === "all" || c.establishmentZone === zoneFilter)
    .slice(0, limit || complaints.length);

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>{title}</h2>
        </div>

        <span className="pill">
          <Filter size={14} />
          {filtered.length} shown
        </span>
      </div>

      {showFilters && (
        <div className="filters">
          <div className="search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search establishment, message, email..."
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
          >
            
            <option value="all">All provinces</option>
            {provinces.map((province) => (
              <option key={province}>{province}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            <option value="food_safety">Food Safety</option>
            <option value="hygiene">Hygiene</option>
            <option value="price_fraud">Price Fraud</option>
            <option value="licensing">Licensing</option>
            <option value="service_quality">Service Quality</option>
          </select>

          {/* <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
          >
            <option value="all">All establishment zones</option>
            <option value="RED">RED</option>
            <option value="YELLOW">YELLOW</option>
            <option value="GREEN">GREEN</option>
          </select> */}
        </div>
      )}

      <div className="queue">
        {filtered.length === 0 && <p className="empty">No complaints found.</p>}

        {filtered.map((complaint) => (
          <ComplaintCard
            key={complaint.id}
            complaint={complaint}
            onUpdate={onUpdate}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function ComplaintCard({ complaint, onUpdate, onOpen }) {
  const [inspector, setInspector] = useState(complaint.assignedTo || "");
  const [saving, setSaving] = useState(false);

  async function assignInspector() {
    if (!inspector) return;

    setSaving(true);
    try {
      await onUpdate(complaint.id, {
        assignedTo: inspector,
        status: "assigned",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status) {
    setSaving(true);
    try {
      await onUpdate(complaint.id, { status });
    } finally {
      setSaving(false);
    }
  }

  const priority = normalizePriority(
    complaint.priorityCategory,
    complaint.priorityScore || complaint.triageScore
  );

  const mismatch = hasPriorityMismatch(complaint);

  return (
    <article className="complaint-card compact-card">
      <div className="complaint-top">
        <div>
          <strong>{categoryLabels[complaint.subject] || complaint.subject}</strong>
          <p>
            {complaint.purchasePlace} • {complaint.province}
          </p>
        </div>

        <div className="badge-stack">
          <span className={`priority-badge ${priority.toLowerCase()}`}>
            {priority}
          </span>

          {complaint.establishmentZone && (
            <span className={`zone-badge ${complaint.establishmentZone.toLowerCase()}`}>
              {complaint.establishmentZone}
            </span>
          )}
        </div>
      </div>

      <p className="complaint-preview">{complaint.message}</p>

      {mismatch && (
        <div className="mini-warning">
          Priority mismatch: citizen {complaint.originalPriority}, ML {priority}
        </div>
      )}

      <ProgressBar status={complaint.status} />

      <div className="action-row">
        <button onClick={() => onOpen(complaint)}>
          <Eye size={16} />
          Open
        </button>


        <select
          value={inspector}
          onChange={(e) => setInspector(e.target.value)}
        >
          <option value="">Choose inspector</option>
          {inspectors.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>

        <button disabled={!inspector || saving} onClick={assignInspector}>
          Assign
        </button>

        <select
          value={normalizeStatus(complaint.status)}
          onChange={(e) => updateStatus(e.target.value)}
        >
          {statusSteps.map((step) => (
            <option key={step} value={step}>
              {statusLabels[step]}
            </option>
          ))}
        </select>

        <button disabled={!complaint.assignedTo && !inspector}>
          <MessageCircle size={16} />
          Message inspector
        </button>
      </div>
    </article>
  );
}

function ComplaintModal({ complaint, onClose, onUpdate }) {
  const [inspector, setInspector] = useState(complaint.assignedTo || "");
  const [citizenMessage, setCitizenMessage] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const status = normalizeStatus(complaint.status);
  const priority = normalizePriority(
    complaint.priorityCategory,
    complaint.priorityScore || complaint.triageScore
  );

  async function save(payload) {
    setSaving(true);

    try {
      await onUpdate(complaint.id, payload);
    } finally {
      setSaving(false);
    }
  }

  async function assignInspector() {
    if (!inspector) return;

    await save({
      assignedTo: inspector,
      status: "assigned",
    });
  }

  async function nextStep() {
    const index = statusSteps.indexOf(status);
    const next = statusSteps[Math.min(index + 1, statusSteps.length - 1)];

    await save({
      status: next,
    });
  }

  async function generateCitizenMessage() {
    setMessageLoading(true);
    setCitizenMessage("");

    try {
      const data = await api.generateCitizenMessage(complaint.id);
      setCitizenMessage(data.message);
    } catch (err) {
      setCitizenMessage(err.message);
    } finally {
      setMessageLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="complaint-modal">
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="modal-header">
          <div>
            <p className="eyebrow">Complaint detail</p>
            <h2>{complaint.purchasePlace}</h2>
            <p>
              {complaint.province} • {categoryLabels[complaint.subject] || complaint.subject}
            </p>
          </div>

          <div className="badge-stack">
            <span className={`priority-badge ${priority.toLowerCase()}`}>
              {priority}
            </span>

            {complaint.establishmentZone && (
              <span className={`zone-badge ${complaint.establishmentZone.toLowerCase()}`}>
                {complaint.establishmentZone}
              </span>
            )}
          </div>
        </div>

        <div className="modal-grid">
          <div className="detail-box">
            <h3>Citizen complaint</h3>
            <p>{complaint.message}</p>
          </div>



          <div className="detail-box">
            <h3>ML triage reasoning</h3>
            <p>{complaint.reasoning || "No reasoning available."}</p>
          </div>

          <div className="detail-box">
            <h3>Recommended Action</h3>
            <p>
              {complaint.recommendedAction ||
                complaint.recommended_action ||
                "No recommendation available."}
            </p>
          </div>


        </div>

        {hasPriorityMismatch(complaint) && (
          <div className="mismatch-box">
            ⚠ Priority mismatch: citizen selected <b>{complaint.originalPriority}</b>,
            but ML triaged it as <b>{priority}</b>.
          </div>
        )}

        <ProgressBar status={status} />

        <div className="meta-row">
          <span>
            Score:
            <b> {complaint.priorityScore}/100</b>
          </span>

          <span>
            Status:
            <b> {statusLabels[status]}</b>
          </span>

          <span>
            Violations:
            <b> {complaint.violations}</b>
          </span>

          <span>
            Open Complaints:
            <b> {complaint.openComplaints}</b>
          </span>
        </div>  

        <div className="modal-actions">

          <select
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
          >
            <option value="">Choose inspector</option>
            {inspectors.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>

          <button disabled={!inspector || saving} onClick={assignInspector}>
            Assign inspector
          </button>

          <button disabled={saving} onClick={nextStep}>
            Next step
          </button>

          <button disabled={!complaint.assignedTo && !inspector}>
            <MessageCircle size={16} />
            Message inspector
          </button>
        </div>

        {priority === "LOW" && (
          <div className="citizen-message-box">
            <button onClick={generateCitizenMessage} disabled={messageLoading}>
              {messageLoading ? "Generating..." : "Generate citizen message"}
            </button>

            {citizenMessage && (
              <textarea
                value={citizenMessage}
                onChange={(e) => setCitizenMessage(e.target.value)}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressBar({ status }) {
  const index = statusSteps.indexOf(normalizeStatus(status));

  return (
    <div className="progress">
      {statusSteps.map((step, stepIndex) => {
        const done = stepIndex <= index;

        return (
          <div key={step} className={done ? "progress-step done" : "progress-step"}>
            <span>{done ? <CheckCircle2 size={15} /> : stepIndex + 1}</span>
            <small>{statusLabels[step]}</small>
          </div>
        );
      })}
    </div>
  );
}

function HeatMap({ complaints, compact = false }) {
  const provinceStats = provinces.map((province) => {
    const list = complaints.filter((c) => normalizeProvince(c.province) === province);

    let highestPriority = "NONE";

    for (const complaint of list) {
      const priority = normalizePriority(
        complaint.priorityCategory,
        complaint.priorityScore || complaint.triageScore
      );

      if (
        highestPriority === "NONE" ||
        priorityRank[priority] > priorityRank[highestPriority]
      ) {
        highestPriority = priority;
      }
    }

    let heat = "empty";
    let label = "No complaints";

    if (highestPriority === "LOW") {
      heat = "calm";
      label = "Low activity";
    }

    if (highestPriority === "MEDIUM") {
      heat = "mild";
      label = "Medium activity";
    }

    if (highestPriority === "HIGH") {
      heat = "warm";
      label = "High activity";
    }

    if (highestPriority === "CRITICAL") {
      heat = "hot";
      label = "Critical activity";
    }

    return {
      province,
      count: list.length,
      highestPriority,
      heat,
      label,
      point: mapPoints[province],
    };
  });

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Today’s heat map</p>
          <h2>Lebanon complaint activity</h2>
        </div>
        <MapPin />
      </div>

      <div className={compact ? "map-layout compact" : "map-layout"}>
        <div className="map-card">
          <img src="/lebanon-map.png" alt="Lebanon map" />

          {provinceStats.map((item) => (
            <div
              key={item.province}
              className={`map-dot ${item.heat}`}
              style={{
                left: `${item.point.x}%`,
                top: `${item.point.y}%`,
              }}
              title={`${item.province}: ${item.label}`}
            >
              {item.count}
            </div>
          ))}
        </div>

        <div className="zone-list">
          {provinceStats.map((item) => (
            <div className={`zone-row ${item.heat}`} key={item.province}>
              <strong>{item.province}</strong>
              <span>{item.count} complaints</span>
              <b>{item.label}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Charts({ complaints, compact = false }) {
  const priorityData = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((priority) => ({
    label: priority,
    count: complaints.filter((c) => c.priorityCategory === priority).length,
  }));

  const provinceData = provinces.map((province) => ({
    label: province,
    count: complaints.filter((c) => normalizeProvince(c.province) === province).length,
  }));

  const categoryData = complaintTypes.map((type) => ({
    label: type.label,
    count: complaints.filter((c) => c.category === type.value).length,
  }));

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Today’s live charts</p>
          <h2>Updated from submitted complaints</h2>
        </div>
        <BarChart3 />
      </div>

      <div className={compact ? "charts compact" : "charts"}>
        <ChartBlock title="ML priority" data={priorityData} />
        <ChartBlock title="Province" data={provinceData} />
        <ChartBlock title="Category" data={categoryData} />
      </div>
    </section>
  );
}

function ChartBlock({ title, data }) {
  const max = Math.max(1, ...data.map((item) => item.count));

  return (
    <div className="chart-block">
      <h3>{title}</h3>

      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${(item.count / max) * 100}%`,
              }}
            />
          </div>
          <b>{item.count}</b>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);