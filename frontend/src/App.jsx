import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import PersonInput from "./components/planner/PersonInput.jsx";
import MapTilerMap from "./components/planner/MapTilerMap.jsx";
import Results from "./components/planner/Results.jsx";
import PhoneDirections from "./components/planner/PhoneDirections.jsx";
import SavedPlans from "./components/planner/SavedPlans.jsx";
import KineticIntro from "./components/planner/KineticIntro.jsx";
const freshPerson = (index) => ({
  id: crypto.randomUUID(),
  name: index ? `Friend ${index}` : "You",
  address: "",
  placeId: "",
});
const examplePeople = () =>
  ["Alex", "Sam", "Jordan"].map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    address: ["Washington, DC", "Arlington, VA", "Alexandria, VA"][i],
    placeId: `demo-origin-${i + 1}`,
    confirmed: "Example starting place",
  }));
const activities = [
  ["coffee", "Coffee"],
  ["restaurants", "Food"],
  ["parks", "Parks"],
  ["bowling", "Bowling"],
  ["cinemas", "Movies"],
  ["libraries", "Libraries"],
  ["ice cream", "Ice cream"],
];

export default function App() {
  const [people, setPeople] = useState(() => [freshPerson(0), freshPerson(1)]);
  const [mode, setMode] = useState("maptiler"),
    [activity, setActivity] = useState("coffee"),
    [radiusKm, setRadiusKm] = useState("");
  const [config, setConfig] = useState(null),
    [groups, setGroups] = useState([]),
    [meetups, setMeetups] = useState([]);
  const [result, setResult] = useState(null),
    [selectedId, setSelectedId] = useState(""),
    [routes, setRoutes] = useState([]);
  const [busy, setBusy] = useState(false),
    [routeBusy, setRouteBusy] = useState(false),
    [routeError, setRouteError] = useState("");
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [name, setName] = useState(""),
    [meetupName, setMeetupName] = useState("");
  const [comparisonBusyId, setComparisonBusyId] = useState(""),
    [comparisonError, setComparisonError] = useState(""),
    [selectionRevision, setSelectionRevision] = useState(0);
  const [errorScope, setErrorScope] = useState("search");
  const [snapshot, setSnapshot] = useState(""),
    [saving, setSaving] = useState(false);
  const searchRequest = useRef(null),
    routeRequest = useRef(null),
    comparisonRequest = useRef(null),
    plannerForm = useRef(null),
    resultHeading = useRef(null);
  const input = {
    participants: people.map(({ id, name, address, placeId }) => ({ id, name, address, placeId })),
    mode,
    activity,
    objective: "balanced",
    ...(radiusKm ? { radiusKm: Number(radiusKm) } : {}),
  };
  const signature = JSON.stringify(input),
    stale = Boolean(result && snapshot !== signature);
  const selected = result?.candidates.find((v) => v.id === selectedId);
  const browserReady = Boolean(import.meta.env.VITE_MAPTILER_KEY);
  const canSearch = people.every(
    (p) =>
      p.name.trim() &&
      p.address.trim() &&
      p.placeId,
  );

  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      try {
        const data = await api("/config", { signal: controller.signal });
        setConfig(data);
        const [g, m] = await Promise.all([
          api("/groups", { signal: controller.signal }),
          api("/meetups", { signal: controller.signal }),
        ]);
        setGroups(g.groups);
        setMeetups(m.meetups);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      }
    }
    init();
    return () => {
      controller.abort();
      searchRequest.current?.abort();
      routeRequest.current?.abort();
      comparisonRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 6000);
    return () => clearTimeout(timer);
  }, [status]);
  async function refreshLibrary() {
    const [g, m] = await Promise.all([api("/groups"), api("/meetups")]);
    setGroups(g.groups);
    setMeetups(m.meetups);
  }
  function edited() {
    searchRequest.current?.abort();
    routeRequest.current?.abort();
    setBusy(false);
    setRouteBusy(false);
    comparisonRequest.current?.abort();
    setComparisonBusyId("");
    setComparisonError("");
    setStatus("");
    setError("");
    setRouteError("");
  }
  function resetPlanner() {
    if (saving) return;
    edited();
    setPeople([freshPerson(0), freshPerson(1)]);
    setMode("maptiler");
    setActivity("coffee");
    setRadiusKm("");
    setName("");
    setMeetupName("");
    setResult(null);
    setSelectedId("");
    setRoutes([]);
    setSnapshot("");
    setSelectionRevision(0);
    setErrorScope("search");
    requestAnimationFrame(() => {
      plannerForm.current
        ?.querySelector('input[aria-label="Starting place for person 1"]')
        ?.focus({ preventScroll: true });
    });
  }
  function example() {
    edited();
    setMode("demo");
    setPeople(examplePeople());
    setResult(null);
    setRoutes([]);
    setActivity("coffee");
    setRadiusKm("");
  }
  function live() {
    edited();
    setMode("maptiler");
    setPeople([freshPerson(0), freshPerson(1)]);
    setResult(null);
    setRoutes([]);
  }
  async function compareVenue(searchId, venueId) {
    const controller = new AbortController();
    comparisonRequest.current?.abort();
    comparisonRequest.current = controller;
    setComparisonBusyId(venueId);
    setComparisonError("");
    try {
      const { venue } = await api("/venues/compare", {
        body: { searchId, venueId }, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult((current) => {
        if (current?.searchId !== searchId) return current;
        const candidates = current.candidates.map((p) => p.id === venue.id ? venue : p);
        return { ...current, candidates, diagnostics: { ...current.diagnostics,
          comparedVenues: candidates.filter((p) => p.comparisonStatus !== "pending").length,
          pendingVenues: candidates.filter((p) => p.comparisonStatus === "pending").length,
        } };
      });
    } catch (e) {
      if (!controller.signal.aborted) setComparisonError(e.message);
    } finally {
      if (!controller.signal.aborted) setComparisonBusyId("");
    }
  }
  function selectVenue(id, search = result, autoCompare = true) {
    routeRequest.current?.abort();
    comparisonRequest.current?.abort();
    setSelectionRevision((n) => n + 1);
    setSelectedId(id);
    setRoutes([]);
    setRouteError("");
    setRouteBusy(false);
    setComparisonBusyId("");
    setComparisonError("");
    const venue = search?.candidates.find((p) => p.id === id);
    if (autoCompare && (search !== result || !stale) && venue?.comparisonStatus === "pending")
      compareVenue(search.searchId, id);
  }
  async function findPlaces(event) {
    event.preventDefault();
    setErrorScope("search");
    if (!canSearch) {
      setError(
        "Give everyone a name and a confirmed starting place.",
      );
      return;
    }
    const controller = new AbortController();
    searchRequest.current?.abort();
    searchRequest.current = controller;
    comparisonRequest.current?.abort();
    setComparisonBusyId("");
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const data = await api("/optimize", {
        body: input,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult(data);
      setSnapshot(signature);
      selectVenue(data.recommendedIds?.[0] || data.candidates[0]?.id || "", data, !data.comparisonError);
      setStatus(`Found ${data.candidates.length} places to compare.`);
      requestAnimationFrame(() => {
        resultHeading.current?.focus();
        resultHeading.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        });
      });
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function showRoutes() {
    const controller = new AbortController();
    routeRequest.current?.abort();
    routeRequest.current = controller;
    setRouteBusy(true);
    setRouteError("");
    try {
      const data = await api("/routes", {
        body: { searchId: result.searchId, venueId: selectedId },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setRoutes(data.routes);
    } catch (e) {
      if (!controller.signal.aborted) setRouteError(e.message);
    } finally {
      if (!controller.signal.aborted) setRouteBusy(false);
    }
  }
  async function save(kind) {
    setErrorScope(kind);
    if (!(kind === "group" ? name : meetupName).trim()) {
      setError(`Add a name for your ${kind === "group" ? "group" : "meetup"}.`);
      document
        .getElementById(kind === "group" ? "group-name" : "meetup-name")
        ?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(kind === "group" ? "/groups" : "/meetups", {
        body:
          kind === "group"
            ? { ...input, name }
            : {
                searchId: result.searchId,
                venueId: selectedId,
                label: meetupName,
              },
      });
      await refreshLibrary();
      setStatus(kind === "group" ? "Group saved." : "Meetup saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(kind, id) {
    setErrorScope("group");
    try {
      await api(`/${kind}/${id}`, { method: "DELETE" });
      await refreshLibrary();
      setStatus("Removed from your saved library.");
    } catch (e) {
      setError(e.message);
    }
  }
  function loadGroup(group) {
    edited();
    // Provider IDs cannot be translated between services. Reconfirm old starting places.
    const legacy = !["demo", "maptiler"].includes(group.mode);
    setPeople(group.participants.map((p) => legacy ? { ...p, placeId: "", confirmed: "" } : p));
    setMode(group.mode === "demo" ? "demo" : "maptiler");
    setActivity(group.activity);
    setRadiusKm("");
    setName(group.name);
    setResult(null);
    setRoutes([]);
    setStatus("Group loaded. Find places to get fresh travel estimates.");
  }
  return (
    <>
      <a className="skip-link" href="#planner">
        Skip to planner
      </a>
      <header className="site-header">
        <a href="#top" className="brand">
          <span aria-hidden="true">↗</span>RouteMeet
        </a>
        <nav aria-label="Main navigation">
          <a href="#planner">Plan a meetup</a>
          <a href="#saved">Saved plans</a>
        </nav>
      </header>
      <main id="top">
        <KineticIntro />
        <section
          id="planner"
          className="planner-section"
          aria-label="Meetup planner"
        >
          <div className="page-intro">
            <h2>The plan.</h2>
            <div className="planner-mode">
              <div className="mode-switch" aria-label="Data source">
                <button aria-pressed={mode === "maptiler"} onClick={live}>
                  MapTiler
                </button>
                <button aria-pressed={mode === "demo"} onClick={example}>
                  Try an example
                </button>
              </div>
              {mode === "demo" ? (
                <span className="source-note">
                  Example data. Fictional places and times.
                </span>
              ) : config && (!config.maptilerConfigured || !browserReady) ? (
                <a
                  className="source-note"
                  href="/setup.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Connect MapTiler ↗
                </a>
              ) : null}
            </div>
          </div>
          <div className="planner-layout">
            <aside className="planning-panel">
              <form ref={plannerForm} onSubmit={findPlaces} noValidate>
                <div className="panel-heading">
                  <h2>Who’s coming?</h2>
                  <span>{people.length} / 8 people</span>
                </div>
                <div className="planner-entry-tools">
                  <p className="muted">Add where each person is starting.</p>
                  <button
                    type="button"
                    className="reset-entries"
                    aria-label="Reset planner entries"
                    disabled={saving}
                    onClick={resetPlanner}
                  >
                    Reset
                  </button>
                </div>
                {people.map((p, i) => (
                  <PersonInput
                    key={`${mode}-${p.id}`}
                    person={p}
                    index={i}
                    mode={mode}
                    removable={people.length > 2}
                    onRemove={() => {
                      edited();
                      setPeople(people.filter((x) => x.id !== p.id));
                    }}
                    onChange={(next) => {
                      edited();
                      setPeople(people.map((x) => (x.id === p.id ? next : x)));
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="add-person"
                  disabled={people.length === 8}
                  onClick={() => {
                    edited();
                    setPeople([...people, freshPerson(people.length)]);
                  }}
                >
                  {people.length === 8 ? "Maximum 8 people" : "+ Add a person"}
                </button>
                <fieldset className="activity-choice">
                  <legend>What would you like to do?</legend>
                  <div>
                    {activities.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={activity === value}
                        onClick={() => {
                          edited();
                          setActivity(value);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="search-area-choice">
                  Search area
                  <select value={radiusKm} onChange={(e) => { edited(); setRadiusKm(e.target.value); }}>
                    <option value="">Automatic · around the group</option>
                    <option value="5">5 km around the meeting center</option>
                    <option value="10">10 km around the meeting center</option>
                    <option value="25">25 km around the meeting center</option>
                    <option value="50">50 km around the meeting center</option>
                  </select>
                </label>
                <button
                  className="primary find-button"
                  disabled={
                    busy ||
                    !config ||
                    (mode === "maptiler" && !config.maptilerConfigured)
                  }
                >
                  {busy ? "Finding places…" : "Find places to meet"}
                </button>
                {error && errorScope === "search" && (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                )}
                {mode === "maptiler" && config && !config.maptilerConfigured && (
                  <p className="muted small">
                    MapTiler needs connecting.{" "}
                    <a href="/setup.html">Setup instructions</a>
                  </p>
                )}
                {!canSearch && (
                  <p className="muted small">
                    Search and choose a starting place for every person.
                  </p>
                )}
                {busy && (
                  <div className="loading-status" role="status">
                    <span className="loading-line" />
                    Finding places and comparing drives…
                    <button
                      type="button"
                      onClick={() => {
                        edited();
                        setStatus("Search cancelled.");
                      }}
                    >
                      Cancel search
                    </button>
                  </div>
                )}
              </form>
              <div className="save-controls">
                <label>
                  Group name
                  <input
                    id="group-name"
                    value={name}
                    maxLength={80}
                    onChange={(e) => {
                      setName(e.target.value);
                      setStatus("");
                    }}
                    placeholder="e.g. Saturday coffee"
                  />
                </label>
                <button
                  type="button"
                  disabled={!canSearch || saving || !config}
                  onClick={() => save("group")}
                >
                  {status === "Group saved." ? "Saved" : "Save group"}
                </button>
              </div>
              {error && errorScope === "group" && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <div id="saved">
                <SavedPlans
                  groups={groups}
                  meetups={meetups}
                  onLoad={loadGroup}
                  onDeleteGroup={(id) => remove("groups", id)}
                  onDeleteMeetup={(id) => remove("meetups", id)}
                />
              </div>
            </aside>
            <section
              className="explore-panel"
              aria-label="Map and meeting places"
            >
              <div className="map-panel">
                <MapTilerMap
                  result={result}
                  selectedId={selectedId}
                  onSelect={selectVenue}
                  routes={routes}
                />
              </div>
              {result && (
                <>
                  <div
                    ref={resultHeading}
                    tabIndex={-1}
                    className="selected-place-heading"
                  >
                    <span className="eyebrow">
                      {stale ? "PREVIOUS SEARCH" : "SELECTED PLACE"}
                    </span>
                    <h2>{selected?.name}</h2>
                    <p>
                      {mode === "demo"
                        ? "Example times only."
                        : "Driving estimates exclude live traffic. Actual journeys may take longer."}
                    </p>
                    <a className="browse-places-link" href="#places">Browse all {result.candidates.length} places ↓</a>
                    {selected?.comparisonStatus === "pending" && (
                      <div className="selected-comparison">
                        {comparisonBusyId === selectedId ? <p role="status">Comparing drives to this place…</p> :
                          <button type="button" disabled={stale} onClick={() => compareVenue(result.searchId, selectedId)}>Compare driving times</button>}
                        <p className="muted small">This place is included; its driving times haven’t been checked yet.</p>
                      </div>
                    )}
                    {selected?.comparisonStatus === "unreachable" && <p className="muted small">A driving route wasn’t available for everyone. You can still view or choose this place.</p>}
                    {comparisonError && <p className="field-error" role="alert">{comparisonError}</p>}
                    <label className="meetup-name">
                      Meetup name
                      <input
                        id="meetup-name"
                        value={meetupName}
                        maxLength={80}
                        onChange={(e) => {
                          setMeetupName(e.target.value);
                          setStatus("");
                        }}
                        placeholder="e.g. Saturday coffee"
                      />
                    </label>
                    <div className="selection-actions">
                      <button
                        className="primary"
                        disabled={stale || saving}
                        onClick={() => save("meetup")}
                      >
                        {status === "Meetup saved."
                          ? "Saved"
                          : "Save this meetup"}
                      </button>
                      {result.mode === "maptiler" && (
                        <button
                          disabled={stale || routeBusy}
                          onClick={showRoutes}
                        >
                          {routeBusy
                            ? "Loading routes…"
                            : "Show driving routes"}
                        </button>
                      )}
                    </div>
                    {error && errorScope === "meetup" && (
                      <p className="field-error" role="alert">
                        {error}
                      </p>
                    )}
                    {routeError && (
                      <p className="field-error" role="alert">
                        {routeError}
                      </p>
                    )}
                    {!!routes.length && (
                      <p className="muted">
                        Routes refreshed for the selected venue. Route estimates
                        may differ from the earlier comparison.
                      </p>
                    )}
                    {result.mode === "maptiler" && selected && (
                      <PhoneDirections
                        key={`${result.searchId}-${selected.id}`}
                        venue={selected}
                        origins={result.origins}
                        stale={stale}
                      />
                    )}
                  </div>
                  <Results
                    result={result}
                    selectedId={selectedId}
                    onSelect={selectVenue}
                    stale={stale}
                    selectionRevision={selectionRevision}
                  />
                </>
              )}
              <p role="status" className="sr-only">
                {status}
              </p>
            </section>
          </div>
        </section>
      </main>
      <footer>
        <a href="#top">RouteMeet</a>
        <a href="/privacy.html">Privacy Policy</a>
      </footer>
    </>
  );
}
