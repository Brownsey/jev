import type { Dataset, Pair, Project, Resolution } from "./types";

export type SourceRecord = { id: string; project: Project };
export type Collection = {
  version: 1;
  seed: number;
  country: Dataset["country"];
  records: SourceRecord[];
  truth: Record<string, string>;
};
export type Candidate = { id: string; leftId: string; rightId: string };
export type CandidatePlan = {
  candidates: Candidate[];
  eligible: number;
  allPairs: number;
};
export type EntityGroup = {
  id: string;
  recordIds: string[];
  status: "linked" | "review" | "pending" | "unlinked";
  conflicts: string[];
};

const UK_SITES = [
  ["Leeds", "LS1 4DY", "14 King Street", "Northgate Developments"],
  ["Bristol", "BS1 5UH", "7 Temple Quay", "Harbour Build Ltd"],
  ["Manchester", "M1 2WD", "88 Deansgate", "Civic Works Group"],
] as const;
const DE_SITES = [
  ["Berlin", "10115", "Invalidenstraße 42", "Bauwerk Mitte GmbH"],
  ["München", "80331", "Sonnenstraße 18", "Isar Projektbau"],
  ["Köln", "50667", "Rheinuferstraße 9", "RheinBau GmbH"],
] as const;
const NAMES = [
  "Canal Works",
  "Station Yard",
  "Riverside Quarter",
  "Lindenhof",
  "Parkhaus Quartier",
  "Hafenbogen",
];
const GROUP_SIZES = [3, 2, 1] as const;

const random = (initial: number) => {
  let state = initial >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
};

const hash = (value: string) => {
  let current = 2166136261;
  for (let index = 0; index < value.length; index++)
    current = Math.imul(current ^ value.charCodeAt(index), 16777619);
  return (current >>> 0).toString(36).padStart(7, "0");
};

const changedHouse = (address: string, amount: number) =>
  address.replace(/\d+/, (number) => String(Number(number) + amount));

const baseProject = (
  country: "UK" | "Germany",
  localeGroup: number,
): Project => {
  const sites = country === "UK" ? UK_SITES : DE_SITES;
  const family = Math.floor(localeGroup / 3);
  const member = localeGroup % 3;
  const [city, postcode, rawAddress, developer] = sites[family % sites.length];
  const cycleOffset = Math.floor(family / sites.length) * 10;
  const sharedAddress = changedHouse(rawAddress, cycleOffset);
  const address = member === 2 ? changedHouse(sharedAddress, 2) : sharedAddress;
  const phase = member + 1;
  const german = country === "Germany";
  const scope = german
    ? [
        "Neubau von Wohnungen",
        "Sanierung von Büroflächen",
        "Logistikhalle mit Servicehof",
      ][member]
    : [
        "New homes and public realm",
        "Office refurbishment",
        "Logistics hub and service yard",
      ][member];
  const reference = `${german ? "DE" : "UK"}-${postcode}-${family + 1}-${phase}`;
  return {
    name: `${NAMES[(localeGroup + (german ? 3 : 0)) % NAMES.length]} ${german ? "Bauabschnitt" : "Phase"} ${phase}`,
    description: `${scope}, ${german ? "Bauabschnitt" : "phase"} ${phase}.`,
    address,
    postcode,
    city,
    country,
    developer,
    reference,
  };
};

const projectVariant = (project: Project, member: number): Project => {
  if (member === 0) return project;
  if (member === 1)
    return {
      ...project,
      name: project.name.replace("Phase", "Ph.").replace("Bauabschnitt", "BA"),
      description: project.description
        .replace("New homes", "Residential scheme")
        .replace("Neubau", "Neubauprojekt"),
      address: project.address
        .replace("Street", "St")
        .replace("straße", "str.")
        .replace("Straße", "Str."),
    };
  return {
    ...project,
    name: project.name
      .replace("Phase", "PHASE")
      .replace("Bauabschnitt", "Bauabschn."),
    description: "",
    address: project.address
      .replace("straße", "strasse")
      .replace("Straße", "Strasse"),
    city: project.city.replace("ü", "ue").replace("ö", "oe"),
  };
};

export function generateCollection(
  count: number,
  seed: number,
  country: Dataset["country"] = "Mixed",
): Collection {
  if (!Number.isInteger(count)) throw new Error("Count must be an integer");
  if (count < 1 || count > 499) throw new Error("Count must be 1–499");
  if (!Number.isInteger(seed)) throw new Error("Seed must be an integer");
  if (!(["UK", "Germany", "Mixed"] as const).includes(country))
    throw new Error("Unsupported country");

  const records: SourceRecord[] = [];
  const truth: Record<string, string> = {};
  const localeGroups = { UK: 0, Germany: 0 };
  for (let groupIndex = 0; records.length < count; groupIndex++) {
    const selected =
      country === "Mixed"
        ? groupIndex % 2 === 0
          ? "UK"
          : "Germany"
        : country;
    const localeGroup = localeGroups[selected]++;
    const base = baseProject(selected, localeGroup);
    const groupId = `g-${hash(`${seed}:group:${groupIndex}`)}`;
    const size = Math.min(
      GROUP_SIZES[groupIndex % GROUP_SIZES.length],
      count - records.length,
    );
    for (let member = 0; member < size; member++) {
      const serial = records.length;
      const id = `r-${hash(`${seed}:row:${serial}`)}`;
      records.push({ id, project: projectVariant(base, member) });
      truth[id] = groupId;
    }
  }
  const rng = random(seed);
  for (let index = records.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    [records[index], records[swap]] = [records[swap], records[index]];
  }
  return { version: 1, seed, country, records, truth };
}

const folded = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const countryKey = (value: string) => {
  const key = folded(value).replace(/\s/g, "");
  if (["uk", "gb", "greatbritain", "unitedkingdom"].includes(key)) return "uk";
  if (["de", "deutschland", "germany"].includes(key)) return "de";
  return key;
};
const addressKey = (value: string) =>
  folded(value)
    .replace(/\b(st|street)\b/g, "street")
    .replace(/\b(str|strasse)\b/g, "strasse");
const streetKey = (value: string) =>
  addressKey(value)
    .replace(/\b\d+[a-z]?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
const nameKey = (value: string) =>
  folded(value)
    .replace(/\b(phase|ph|bauabschnitt|bauabschn|ba)\s*\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

type EvidenceFields = {
  country: string;
  reference: string;
  address: string;
  postcode: string;
  city: string;
  street: string;
  name: string;
  developer: string;
};
const evidenceFields = (project: Project): EvidenceFields => ({
  country: countryKey(project.country),
  reference: folded(project.reference),
  address: addressKey(project.address),
  postcode: folded(project.postcode),
  city: folded(project.city),
  street: streetKey(project.address),
  name: nameKey(project.name),
  developer: folded(project.developer),
});
const evidence = (left: EvidenceFields, right: EvidenceFields) => {
  if (left.country && right.country && left.country !== right.country)
    return null;
  const sameReference = !!left.reference && left.reference === right.reference;
  const sameAddress = !!left.address && left.address === right.address;
  const samePostcode = !!left.postcode && left.postcode === right.postcode;
  const sameCity = !!left.city && left.city === right.city;
  const sameStreet = !!left.street && left.street === right.street;
  const sameName = !!left.name && left.name === right.name;
  if (!(
    sameReference ||
    sameAddress ||
    (samePostcode && sameCity && (sameStreet || sameName))
  ))
    return null;
  return (
    (sameReference ? 8 : 0) +
    (sameAddress ? 6 : 0) +
    (sameName ? 4 : 0) +
    (samePostcode ? 2 : 0) +
    (sameCity ? 1 : 0) +
    (left.developer === right.developer ? 1 : 0)
  );
};

const canonicalCandidate = (first: string, second: string): Candidate => {
  const [leftId, rightId] = first < second ? [first, second] : [second, first];
  return { id: `c-${leftId}-${rightId}`, leftId, rightId };
};

export function planCandidates(
  records: SourceRecord[],
  limit: number,
): CandidatePlan {
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error("Candidate limit must be a non-negative integer");
  const indexed = records.map(({ project }) => evidenceFields(project));
  const ranked: { candidate: Candidate; score: number }[] = [];
  for (let left = 0; left < records.length; left++)
    for (let right = left + 1; right < records.length; right++) {
      const score = evidence(indexed[left], indexed[right]);
      if (score !== null)
        ranked.push({
          candidate: canonicalCandidate(records[left].id, records[right].id),
          score,
        });
    }
  ranked.sort(
    (a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id),
  );
  return {
    candidates: ranked.slice(0, limit).map(({ candidate }) => candidate),
    eligible: ranked.length,
    allPairs: (records.length * (records.length - 1)) / 2,
  };
}

export function candidatePairs(
  records: SourceRecord[],
  candidates: Candidate[],
): Pair[] {
  const byId = new Map(records.map((record) => [record.id, record.project]));
  return candidates.flatMap(({ id, leftId, rightId }) => {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    return left && right
      ? [
          {
            id,
            left,
            right,
            expected: "different" as const,
            scenario: "collection candidate",
          },
        ]
      : [];
  });
}

const linkedRoots = (
  records: SourceRecord[],
  candidates: Candidate[],
  results: Resolution[],
) => {
  const ids = new Set(records.map(({ id }) => id));
  const parent = new Map([...ids].map((id) => [id, id]));
  const find = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const join = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  };
  const byCandidate = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const outcome of results) {
    const edge = byCandidate.get(outcome.id);
    if (
      edge &&
      ids.has(edge.leftId) &&
      ids.has(edge.rightId) &&
      outcome.decision === "match"
    )
      join(edge.leftId, edge.rightId);
  }
  return { find, ids };
};

export function groupRecords(
  records: SourceRecord[],
  candidates: Candidate[],
  results: Resolution[],
): EntityGroup[] {
  const { find, ids } = linkedRoots(records, candidates, results);
  const resultById = new Map(results.map((result) => [result.id, result]));
  const members = new Map<string, string[]>();
  for (const { id } of records) {
    const root = find(id);
    members.set(root, [...(members.get(root) ?? []), id]);
  }
  const flags = new Map(
    [...members].map(([root]) => [
      root,
      { conflicts: new Set<string>(), pending: false, incident: 0 },
    ]),
  );
  for (const edge of candidates) {
    if (!ids.has(edge.leftId) || !ids.has(edge.rightId)) continue;
    const leftRoot = find(edge.leftId);
    const rightRoot = find(edge.rightId);
    const outcome = resultById.get(edge.id);
    flags.get(leftRoot)!.incident++;
    if (rightRoot !== leftRoot) flags.get(rightRoot)!.incident++;
    if (!outcome) {
      flags.get(leftRoot)!.pending = true;
      flags.get(rightRoot)!.pending = true;
    } else if (outcome.decision === "review") {
      flags.get(leftRoot)!.conflicts.add(edge.id);
      flags.get(rightRoot)!.conflicts.add(edge.id);
    } else if (outcome.decision === "different" && leftRoot === rightRoot)
      flags.get(leftRoot)!.conflicts.add(edge.id);
  }
  const order = new Map(records.map(({ id }, index) => [id, index]));
  return [...members.values()]
    .map((recordIds) => {
      recordIds.sort();
      const state = flags.get(find(recordIds[0]))!;
      const conflicts = [...state.conflicts].sort();
      const status: EntityGroup["status"] = conflicts.length
        ? "review"
        : state.pending
          ? "pending"
          : recordIds.length > 1
            ? "linked"
            : state.incident
              ? "unlinked"
              : "pending";
      return {
        id: `e-${hash(recordIds.join("\0"))}`,
        recordIds,
        status,
        conflicts,
      };
    })
    .sort(
      (a, b) =>
        Math.min(...a.recordIds.map((id) => order.get(id)!)) -
        Math.min(...b.recordIds.map((id) => order.get(id)!)),
    );
}

export function evaluateCollection(
  collection: Collection,
  candidates: Candidate[],
  results: Resolution[],
) {
  const truthGroups = new Map<string, string[]>();
  for (const { id } of collection.records) {
    const group = collection.truth[id] ?? `missing:${id}`;
    truthGroups.set(group, [...(truthGroups.get(group) ?? []), id]);
  }
  const truePairs = [...truthGroups.values()].reduce(
    (sum, ids) => sum + (ids.length * (ids.length - 1)) / 2,
    0,
  );
  const uniqueCandidates = new Map(candidates.map((item) => [item.id, item]));
  const candidateTruePairs = new Set(
    [...uniqueCandidates.values()]
      .filter(
        ({ leftId, rightId }) =>
          collection.truth[leftId] !== undefined &&
          collection.truth[leftId] === collection.truth[rightId],
      )
      .map(({ leftId, rightId }) => [leftId, rightId].sort().join("\0")),
  ).size;
  const groups = groupRecords(collection.records, candidates, results);
  let predictedPairs = 0;
  let truePositivePairs = 0;
  for (const group of groups)
    for (let left = 0; left < group.recordIds.length; left++)
      for (let right = left + 1; right < group.recordIds.length; right++) {
        predictedPairs++;
        if (
          collection.truth[group.recordIds[left]] !== undefined &&
          collection.truth[group.recordIds[left]] ===
            collection.truth[group.recordIds[right]]
        )
          truePositivePairs++;
      }
  const completed = new Set(
    results.filter(({ id }) => uniqueCandidates.has(id)).map(({ id }) => id),
  ).size;
  return {
    trueGroups: truthGroups.size,
    truePairs,
    candidateRecall: truePairs ? candidateTruePairs / truePairs : null,
    groupPrecision: predictedPairs ? truePositivePairs / predictedPairs : null,
    groupRecall: truePairs ? truePositivePairs / truePairs : null,
    completed,
  };
}
