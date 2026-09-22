import type { Dataset, Decision, Pair, Project, ProjectField, Resolution, ResolveRequest } from "./types";

export const DEFAULT_MODEL = "typesafe/jev-1.13";
export const FIELDS: { key: ProjectField; label: string }[] = [
  ["name", "Name"], ["description", "Description"], ["address", "Address"], ["postcode", "Postcode"], ["city", "City"], ["country", "Country"], ["developer", "Developer"], ["reference", "Reference"],
].map(([key, label]) => ({ key: key as ProjectField, label }));
export const PROMPTS = [
  { id: "conservative", label: "Conservative", text: "Choose match only when selected fields strongly identify one project. Treat UK St/Street and German Str./Straße, umlauts and abbreviated Bauabschnitt as possible formatting variants. Different house numbers, phases, scopes or references mean different. Use review for missing or conflicting evidence." },
  { id: "balanced", label: "Balanced", text: "Compare selected project records as an entity-resolution task. Match paraphrased descriptions and common UK/German address abbreviations when the development, site and phase align. Different houses, Neubau versus Sanierung scope, Bauabschnitt/phase or references are different. Use review when evidence is incomplete." },
  { id: "address-first", label: "Address-first", text: "Give postcode, city and house number priority. UK addresses may shorten Street to St; German Straße may shorten to Str. and retain umlauts. Same site can still be different when phase, Bauabschnitt or scope differs. Use review if address is omitted or conflicts with the other selected fields." },
];

const UK = [{ city: "Leeds", postcode: "LS1 4DY", address: "14 Wellington Street", developer: "Northgate Developments" }, { city: "Bristol", postcode: "BS1 5UH", address: "7 Temple Quay", developer: "Harbour Build Ltd" }, { city: "Manchester", postcode: "M1 2WD", address: "88 Deansgate", developer: "Civic Works Group" }, { city: "Birmingham", postcode: "B1 1TB", address: "31 Newhall Street", developer: "Mercian Property Co" }, { city: "Newcastle", postcode: "NE1 3PA", address: "56 Quayside Road", developer: "Tyne Regeneration Ltd" }];
const DE = [{ city: "Berlin", postcode: "10115", address: "Invalidenstraße 42", developer: "Bauwerk Mitte GmbH" }, { city: "München", postcode: "80331", address: "Sonnenstraße 18", developer: "Isar Projektbau" }, { city: "Köln", postcode: "50667", address: "Rheinuferstraße 9", developer: "RheinBau GmbH" }, { city: "Hamburg", postcode: "20095", address: "Friedrichstraße 27", developer: "Hanse Projekt GmbH" }, { city: "Leipzig", postcode: "04109", address: "Grünauer Straße 61", developer: "Sachsen Baupartner" }];
const names = ["Riverside Quarter", "Station Yard", "Oakfield Homes", "Canal View Works", "Lindenhof", "Parkhaus Quartier"];
const UK_TYPES = ["Residential development of 42 homes with public realm works", "office conversion to flexible workspaces", "warehouse and logistics hub with service yard", "school extension with new classrooms", "commercial solar and façade retrofit", "mixed-use scheme with homes and ground-floor units"];
const DE_TYPES = ["Neubau mit 42 Wohnungen und Außenanlagen", "Büroumbau zu flexiblen Arbeitsflächen", "Logistikhalle mit Servicehof", "Schulerweiterung mit neuen Klassenräumen", "gewerbliche Solar- und Fassadensanierung", "gemischt genutztes Quartier mit Wohnungen und Gewerbe"];
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const project = (site: typeof UK[number], country: "UK" | "Germany", index: number): Project => {
  const german = country === "Germany";
  const phase = (index % 3) + 1; const type = (german ? DE_TYPES : UK_TYPES)[index % UK_TYPES.length];
  return { name: `${names[index % names.length]} ${german ? "Bauabschnitt" : "Phase"} ${phase}`, description: `${type}, ${german ? `Bauabschnitt ${phase}` : `phase ${phase}`}.`, address: site.address, postcode: site.postcode, city: site.city, country, developer: site.developer, reference: `${german ? "DE" : "UK"}-2026-${100 + index}` };
};
const variant = (value: Project, country: "UK" | "Germany", omitDescription: boolean): Project => ({ ...value, name: value.name.replace("Phase", "Ph.").replace("Bauabschnitt", "BA"), description: omitDescription ? "" : country === "Germany" ? value.description.replace("Neubau", "Neubauprojekt").replace("ü", "ue") : value.description.replace("development", "scheme"), address: value.address.replace("Street", "St").replace("straße", "str.").replace("Straße", "Str.") });
const changedHouse = (address: string) => address.replace(/\d+/, (number) => String(Number(number) + 2));

export function generateDataset(count: number, seed: number, country: Dataset["country"] = "Mixed"): Dataset {
  if (!Number.isInteger(count) || count < 20 || count > 500) throw new Error("Count must be 20–500");
  if (!Number.isInteger(seed)) throw new Error("Seed must be an integer");
  const random = rng(seed);
  const pairs: Pair[] = Array.from({ length: count }, (_, index) => {
    const selected = country === "Mixed" ? (Math.floor(index / 4) % 2 ? "Germany" : "UK") : country;
    const sites = selected === "Germany" ? DE : UK;
    const left = project(sites[Math.floor(random() * sites.length)], selected, index);
    const kind = index % 4;
    const duplicate = kind === 0;
    let right: Project; let scenario: string;
    if (duplicate) { right = variant(left, selected, index % 8 === 0); scenario = "synthetic duplicate: abbreviation, paraphrase or omitted field"; }
    else if (kind === 1) { right = { ...left, address: changedHouse(left.address), reference: `${left.reference}-N` }; scenario = "synthetic hard negative: neighbouring address"; }
    else if (kind === 2) { right = { ...left, name: left.name.replace(/(Phase|Bauabschnitt) \d+/, selected === "Germany" ? "Bauabschnitt 4" : "Phase 4"), description: selected === "Germany" ? "Sanierung eines anderen Bauabschnitts." : "Refurbishment for a separate phase.", reference: `${left.reference}-P` }; scenario = "synthetic hard negative: same site, different phase/scope"; }
    else { right = project(sites[(sites.indexOf(sites.find((site) => site.address === left.address)!) + 1) % sites.length], selected, index + 7); scenario = "synthetic clear negative"; }
    return { id: `pair-${Math.floor(random() * 0xffffffffff).toString(36).padStart(7, "0")}`, left, right, expected: duplicate ? "match" : "different", scenario };
  });
  for (let index = pairs.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [pairs[index], pairs[swap]] = [pairs[swap], pairs[index]]; }
  return { seed, country, pairs };
}

export function buildJevRequest(request: ResolveRequest): object {
  const state = request.pairs.map(({ id, left, right }) => ({ id, left: Object.fromEntries(request.fields.map((field) => [field, left[field]])), right: Object.fromEntries(request.fields.map((field) => [field, right[field]])) }));
  return { model: request.model || DEFAULT_MODEL, state, questions: Object.fromEntries(request.pairs.map((pair, index) => [`q${index}`, { type: "choice", instructions: `${request.prompt}\nDecide pair ID ${pair.id}.`, criteria: { match: "Same real-world project.", different: "Different projects.", review: "Insufficient or conflicting evidence." } }])) };
}

export function summarize(pairs: Pair[], results: Resolution[]) {
  const byId = new Map(pairs.map((pair) => [pair.id, pair])); const completed = results.filter((result) => byId.has(result.id));
  const matched = completed.filter((result) => result.decision === "match"); const different = completed.filter((result) => result.decision === "different"); const review = completed.filter((result) => result.decision === "review");
  const correct = completed.filter((result) => result.decision !== "review" && result.decision === byId.get(result.id)!.expected).length;
  const actualMatch = completed.filter((result) => byId.get(result.id)!.expected === "match").length;
  const truePositive = matched.filter((result) => byId.get(result.id)!.expected === "match").length;
  return { total: pairs.length, completed: completed.length, matched: matched.length, different: different.length, review: review.length, correct, accuracy: completed.length ? correct / completed.length : null, precision: matched.length ? truePositive / matched.length : null, recall: actualMatch ? truePositive / actualMatch : null, coverage: completed.length ? (matched.length + different.length) / completed.length : 0 };
}
