import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getPersonColor } from "../../lib/colors.js";
import { minutes } from "../../lib/format.js";
import "./category-results.css";

const PAGE_SIZE = 20;
const categoryNames = { coffee: "Coffee spots", restaurants: "Restaurants", parks: "Parks", bowling: "Bowling alleys", cinemas: "Cinemas", libraries: "Libraries", "ice cream": "Ice cream shops" };
const searchText = (text = "") => text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
const compared = (venue) => venue.comparisonStatus === "ready" || (!venue.comparisonStatus && Array.isArray(venue.perPerson));

function PlaceCard({ venue, selected, onSelect, scaleSeconds, balanced }) {
  const ready = compared(venue);
  return (
    <article className={`venue-card category-place-card ${selected ? "chosen" : ""}`}>
      <button type="button" className="venue-select" onClick={() => onSelect(venue.id)} aria-pressed={selected}>
        <span className="category-place-dot" aria-hidden="true">{selected ? "●" : "○"}</span>
        <span><strong>{venue.name}</strong><small>{venue.address || "Address not listed"}</small></span>
        <span className="category-place-select" aria-hidden="true">{selected ? "Selected" : "Select"}</span>
      </button>
      {venue.recommended && <span className="category-pick-label">{balanced ? "Balanced pick" : "Suggested compromise"}</span>}
      {ready ? <>
        <p className="category-drive-gap">{venue.spreadSeconds < 60 ? "Drives less than 1 min apart" : `Drives within ${minutes(venue.spreadSeconds)} min of each other`}</p>
        <div className="travel-bars">
          {venue.perPerson.map((person, i) => <div className="travel-row" key={person.id}>
            <span>{person.name}</span>
            <div className="travel-track" aria-hidden="true"><span style={{ width: `${Math.min(100, person.seconds / scaleSeconds * 100)}%`, background: getPersonColor(i) }} /></div>
            <strong>{minutes(person.seconds)} min</strong>
          </div>)}
        </div>
        <div className="venue-summary">
          <span>Longest drive <b>{minutes(venue.maxSeconds)} min</b></span>
          <span>Combined driving <b>{minutes(venue.totalSeconds)} min</b></span>
        </div>
      </> : <p className="category-comparison-state">{venue.comparisonStatus === "unreachable" ? "We couldn’t find a driving route here for everyone." : "Select to compare everyone’s drive."}</p>}
    </article>
  );
}

function CategoryResults({ result, selectedId, onSelect, stale, selectionRevision = 0 }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [picksOnly, setPicksOnly] = useState(false);
  const [page, setPage] = useState(0);
  const previousSelection = useRef(null);
  const listHeading = useRef(null);
  const { candidates, diagnostics } = result;
  const readyPlaces = candidates.filter(compared);
  const recommendedIds = useMemo(() => new Set(result.recommendedIds || candidates.filter((place) => place.recommended).map((place) => place.id)), [result.recommendedIds, candidates]);
  const orderedPlaces = useMemo(() => {
    const recommendationOrder = new Map([...recommendedIds].map((placeId, index) => [placeId, index]));
    const alphabetic = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    return [...candidates].sort((a, b) => {
      const aPick = recommendationOrder.get(a.id), bPick = recommendationOrder.get(b.id);
      if (aPick !== undefined || bPick !== undefined) {
        if (aPick === undefined) return 1;
        if (bPick === undefined) return -1;
        return aPick - bPick;
      }
      return alphabetic.compare(a.name, b.name) || alphabetic.compare(a.address || "", b.address || "") || alphabetic.compare(a.id, b.id);
    });
  }, [candidates, recommendedIds]);
  const needle = searchText(query.trim());
  const filtered = useMemo(() => orderedPlaces.filter((place) => (!picksOnly || recommendedIds.has(place.id)) && (!needle || searchText(`${place.name} ${place.address || ""}`).includes(needle))), [orderedPlaces, picksOnly, needle, recommendedIds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagePlaces = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const scaleSeconds = readyPlaces.reduce((largest, place) => Math.max(largest, place.maxSeconds || 0), 1);
  const category = categoryNames[result.activity] || "Places";
  const isDemo = result.mode === "demo";
  const comparedCount = diagnostics.comparedVenues ?? readyPlaces.length;

  useEffect(() => {
    const selection = `${selectedId}:${selectionRevision}`;
    if (previousSelection.current === selection) return;
    previousSelection.current = selection;
    if (!selectedId) return;
    const visibleIndex = filtered.findIndex((place) => place.id === selectedId);
    if (visibleIndex >= 0) {
      setPage(Math.floor(visibleIndex / PAGE_SIZE));
    } else {
      const allIndex = orderedPlaces.findIndex((place) => place.id === selectedId);
      if (allIndex >= 0) {
        setQuery("");
        setPicksOnly(false);
        setPage(Math.floor(allIndex / PAGE_SIZE));
      }
    }
  }, [selectedId, selectionRevision, orderedPlaces, filtered]);

  function changePage(nextPage) {
    setPage(nextPage);
    listHeading.current?.focus({ preventScroll: true });
    listHeading.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  return (
    <section id="places" className="place-results category-results" aria-label="All places in the search area">
      <div className="results-heading" ref={listHeading} tabIndex={-1}>
        <div><span className="eyebrow">{isDemo ? "EXAMPLE PLACES" : "ALL MAPPED PLACES"}</span><h2>{category}</h2></div>
        <span>{candidates.length.toLocaleString()} places in this area</span>
      </div>
      {stale && <p className="notice">Your plan changed. Find places again to update these results.</p>}
      {result.comparisonError && <p className="category-comparison-note" role="status">{result.comparisonError}</p>}
      <p className="category-coverage">{isDemo ? "Fictional places for trying the planner." : diagnostics.coverageNote || "All places returned for this category in the marked area. OpenStreetMap may miss places or have outdated details."}</p>
      <div className="category-browse-controls">
        <label htmlFor={`${id}-search`}>Find a place in these results<input id={`${id}-search`} type="search" value={query} placeholder="Name or address" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <div className="category-view-options" role="group" aria-label="Places to show">
          <button type="button" aria-pressed={!picksOnly} onClick={() => { setPicksOnly(false); setPage(0); }}>All places ({candidates.length.toLocaleString()})</button>
          <button type="button" aria-pressed={picksOnly} onClick={() => { setPicksOnly(true); setPage(0); }}>Balanced picks ({recommendedIds.size})</button>
        </div>
      </div>
      <div className="category-list-status" role="status" aria-live="polite" aria-atomic="true">
        <span>{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length.toLocaleString()} ${needle ? "matches" : "places"}` : "No matching places"}{(needle || picksOnly) && ` · ${candidates.length.toLocaleString()} total`}</span>
        <span>{comparedCount.toLocaleString()} of {candidates.length.toLocaleString()} places compared</span>
      </div>
      {picksOnly && !diagnostics.balanceAvailable && <p className="balance-note">Closely matched drives weren’t available among the places compared. These are the best compromises so far.</p>}
      {pagePlaces.length ? <div className="venue-cards">
        {pagePlaces.map((venue) => <PlaceCard key={venue.id} venue={{ ...venue, recommended: recommendedIds.has(venue.id) }} selected={venue.id === selectedId} onSelect={onSelect} scaleSeconds={scaleSeconds} balanced={diagnostics.balanceAvailable} />)}
      </div> : <div className="category-no-results"><p>{picksOnly ? "No suggested places match these filters." : "No places match that name or address."}</p><button type="button" onClick={() => { setQuery(""); setPicksOnly(false); setPage(0); }}>Show all places</button></div>}
      {pageCount > 1 && <nav className="category-pagination" aria-label="Place result pages">
        <button type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous</button>
        <label htmlFor={`${id}-page`}>Page <select id={`${id}-page`} value={currentPage} onChange={(event) => changePage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}</select> of {pageCount}</label>
        <button type="button" disabled={currentPage === pageCount - 1} onClick={() => changePage(currentPage + 1)}>Next</button>
      </nav>}
      <details className="algorithm-details">
        <summary>How suggestions are chosen</summary>
        <p>All mapped places in the search area stay in the list and on the map. Select a place to compare everyone’s drive.</p>
        <p>{diagnostics.recommendationScope || "Suggested picks come from the places included in the initial driving comparison. Comparing another place adds its times without changing those suggestions."}</p>
        <p>We favor similar driving times while avoiding a long detour just to make the times equal.</p>
        {Number.isFinite(diagnostics.bestMaxSeconds) && <p>Within that initial group, the shortest possible longest drive was {minutes(diagnostics.bestMaxSeconds)} min. We allowed up to {minutes(diagnostics.detourAllowanceSeconds)} extra min to look for a closer balance.</p>}
        <p>{diagnostics.guarantee} Driving estimates exclude live traffic. Times are rounded up.</p>
      </details>
    </section>
  );
}

export default function Results(props) {
  return <CategoryResults key={props.result.searchId} {...props} />;
}
